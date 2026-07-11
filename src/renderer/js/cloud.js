// Cloud YouTube Music search and actions
import { playlist, playlists, savePlaylistsToStorage, isSameTrack, resetShuffle } from './state.js';
import { escapeHtml } from './playlists.js';

export function renderCloudResults(results, cloudResultsEl, onPlaySong) {
  cloudResultsEl.innerHTML = '';
  
  if (results && results.error) {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 16px; color: #ff3333; text-align: center; font-size: 11px;';
    li.textContent = results.error;
    cloudResultsEl.appendChild(li);
    return;
  }
  
  if (!results || !results.length) {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 16px; color: var(--text-dim); text-align: center; font-size: 11px;';
    li.textContent = 'No results found.';
    cloudResultsEl.appendChild(li);
    return;
  }

  results.forEach((song) => {
    const li = document.createElement('li');
    li.className = 'cloud-result';
    li.innerHTML = `
      <img src="${song.thumbnail || ''}" alt="" />
      <div class="cloud-result-text">
        <div class="cloud-result-title">${escapeHtml(song.title)}</div>
        <div class="cloud-result-artist">${escapeHtml(song.artist)}</div>
      </div>
    `;
    li.addEventListener('click', () => {
      const trackObj = {
        type: 'youtube',
        videoId: song.videoId,
        name: song.title,
        artist: song.artist,
        thumbnail: song.thumbnail,
      };
      
      if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
        playlists["All Tracks"].push(trackObj);
        savePlaylistsToStorage();
      }
      playlist.push(trackObj);
      resetShuffle();
      if (onPlaySong) onPlaySong(playlist.length - 1);
    });
    cloudResultsEl.appendChild(li);
  });
}
