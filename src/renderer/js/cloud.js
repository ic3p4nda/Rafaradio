// Cloud YouTube Music search and actions
import { playlist, playlists, savePlaylistsToStorage, isSameTrack, resetShuffle, preloadedStreams, savePlaySession } from './state.js';
import { escapeHtml } from './playlists.js';

export function renderCloudResults(results, cloudResultsEl, onPlaySong) {
  cloudResultsEl.innerHTML = '';
  
  if (results && results.error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 24px; color: #ff3333; text-align: center; font-size: 13px; font-family: "Space Grotesk", sans-serif;';
    errorDiv.textContent = results.error;
    cloudResultsEl.appendChild(errorDiv);
    return;
  }
  
  if (!results || !results.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 40px; color: var(--text-dim); text-align: center; font-size: 13px; font-family: "Space Grotesk", sans-serif;';
    emptyDiv.textContent = 'No search results. Enter a song title or artist above.';
    cloudResultsEl.appendChild(emptyDiv);
    return;
  }

  // Create metrolist table
  const table = document.createElement('table');
  table.className = 'metrolist-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 60px; text-align: left; padding-left: 20px;">#</th>
        <th style="text-align: left;">Title</th>
        <th style="text-align: left;">Artist</th>
        <th style="width: 120px; text-align: center;">Status</th>
        <th style="width: 150px; text-align: right; padding-right: 20px;">Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  results.forEach((song, i) => {
    const tr = document.createElement('tr');
    tr.className = 'metrolist-row';
    const videoId = song.videoId;
    
    // Determine initial cache status
    const isCached = preloadedStreams.has(videoId);
    let currentStatus = isCached ? 'Cached ✓' : 'Cloud ☁';
    
    tr.innerHTML = `
      <td style="padding-left: 20px;">
        <div class="row-num-wrap">
          <span class="row-num-index">${i + 1}</span>
          <img class="row-thumb" src="${song.thumbnail || ''}" alt="" />
        </div>
      </td>
      <td>
        <div class="row-title">${escapeHtml(song.title)}</div>
      </td>
      <td>
        <div class="row-artist">${escapeHtml(song.artist)}</div>
      </td>
      <td class="row-status text-center" id="status-${videoId}">
        <span class="status-badge ${isCached ? 'cached' : 'cloud'}">${currentStatus}</span>
      </td>
      <td class="row-actions text-right" style="padding-right: 20px;">
        <button class="row-action-btn play-btn" title="Play Now">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="row-action-btn queue-btn" title="Add to Queue">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button class="row-action-btn cache-btn ${isCached ? 'disabled' : ''}" title="Cache Stream URL" ${isCached ? 'disabled' : ''}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </button>
      </td>
    `;

    const trackObj = {
      type: 'youtube',
      videoId: song.videoId,
      name: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
    };

    // 1. Play Now Click
    tr.querySelector('.play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      // Ensure added to "All Tracks"
      if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
        playlists["All Tracks"].push(trackObj);
        savePlaylistsToStorage();
      }
      // Add to playlist
      const index = playlist.push(trackObj) - 1;
      resetShuffle();
      if (onPlaySong) onPlaySong(index);
    });

    // 2. Add to Queue Click
    tr.querySelector('.queue-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      playlist.push(trackObj);
      savePlaySession();
      
      // Update play queue sidebar/panels if visible
      const redrawTrigger = document.getElementById('playlistTracksList');
      if (redrawTrigger && window.appModule && typeof window.appModule.renderPlaylist === 'function') {
        window.appModule.renderPlaylist();
      }
      
      if (window.showNotificationToast) {
        window.showNotificationToast(`"${song.title}" added to queue.`);
      }
    });

    // 3. Cache Stream Click
    const cacheBtn = tr.querySelector('.cache-btn');
    cacheBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (preloadedStreams.has(videoId)) return;
      
      const statusCell = tr.querySelector(`#status-${videoId}`);
      statusCell.innerHTML = `<span class="status-badge caching">Caching... ⏳</span>`;
      cacheBtn.disabled = true;
      cacheBtn.classList.add('disabled');

      try {
        const streamPromise = window.api.youtubePrepareStream(videoId);
        preloadedStreams.set(videoId, streamPromise);
        
        await streamPromise;
        statusCell.innerHTML = `<span class="status-badge cached">Cached ✓</span>`;
        statusCell.querySelector('.status-badge').className = 'status-badge cached';
        
        if (window.showNotificationToast) {
          window.showNotificationToast(`Cached "${song.title}" in background successfully.`);
        }
      } catch (err) {
        console.error('Failed to prefetch track:', err);
        statusCell.innerHTML = `<span class="status-badge cloud">Cloud ☁</span>`;
        cacheBtn.disabled = false;
        cacheBtn.classList.remove('disabled');
        
        if (window.showNotificationToast) {
          window.showNotificationToast(`Failed to cache "${song.title}".`);
        }
      }
    });

    tbody.appendChild(tr);
  });

  cloudResultsEl.appendChild(table);
}

