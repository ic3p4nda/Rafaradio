// Playlists and Library UI module
import { 
  playlists, 
  playlist, 
  currentIndex, 
  currentViewedPlaylist, 
  setCurrentViewedPlaylist,
  savePlaylistsToStorage, 
  isSameTrack, 
  getTrackKey,
  lyricsCache,
  resetShuffle
} from './state.js';
import { preloadLyrics } from './lyrics.js';

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

export function renderPlaylistsList(playlistsListEl, onOpenPlaylist, onDeletePlaylist) {
  playlistsListEl.innerHTML = '';
  
  Object.keys(playlists).forEach(name => {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    
    let icon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    if (name === "All Tracks") icon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
    if (name === "Favorites") icon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #e0453c;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    
    const count = playlists[name]?.length || 0;
    
    li.innerHTML = `
      <div class="playlist-item-meta">
        <span class="playlist-item-icon">${icon}</span>
        <div class="playlist-item-info">
          <span class="playlist-item-name">${escapeHtml(name)}</span>
          <span class="playlist-item-count">${count} ${count === 1 ? 'song' : 'songs'}</span>
        </div>
      </div>
    `;
    
    if (name !== "All Tracks" && name !== "Favorites") {
      const delBtn = document.createElement('button');
      delBtn.className = 'playlist-item-delete';
      delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      delBtn.title = 'Delete playlist';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDeletePlaylist) onDeletePlaylist(name);
      });
      li.appendChild(delBtn);
    }
    
    li.addEventListener('click', () => {
      if (onOpenPlaylist) onOpenPlaylist(name);
    });
    
    playlistsListEl.appendChild(li);
  });
}

export function renderPlaylistDetail(
  playlistTracksListEl, 
  playlistDetailTitle, 
  deletePlaylistBtn, 
  onTrackPlay, 
  onToggleFavorite, 
  onAddToAnotherPlaylist, 
  onRemoveTrack,
  onBadgeUpdate
) {
  playlistTracksListEl.innerHTML = '';
  playlistDetailTitle.textContent = currentViewedPlaylist;
  
  if (currentViewedPlaylist !== "All Tracks" && currentViewedPlaylist !== "Favorites") {
    deletePlaylistBtn.style.display = 'block';
  } else {
    deletePlaylistBtn.style.display = 'none';
  }
  
  const tracks = playlists[currentViewedPlaylist] || [];
  
  if (tracks.length === 0) {
    const li = document.createElement('li');
    li.className = 'playlist-empty-state';
    li.style.cssText = 'padding: 40px 20px; text-align: center; color: var(--text-dim); font-size: 12px;';
    li.textContent = 'This playlist has no songs yet.';
    playlistTracksListEl.appendChild(li);
    return;
  }
  
  tracks.forEach((track, i) => {
    const li = document.createElement('li');
    li.className = 'playlist-track-row';
    const key = getTrackKey(track);
    li.setAttribute('data-track-key', key);
    
    const isPlaying = currentIndex !== -1 && playlist[currentIndex] && isSameTrack(track, playlist[currentIndex]);
    if (isPlaying) {
      li.classList.add('active');
    }
    
    const isFav = playlists["Favorites"].some(t => isSameTrack(t, track));
    const favHeartClass = isFav ? 'playlist-track-action-btn fav active' : 'playlist-track-action-btn fav';
    
    let badgeHtml = '';
    const cached = lyricsCache.get(key);
    if (cached) {
      if (cached.state === 'loaded') {
        badgeHtml = `<span class="lyrics-badge loaded" title="Lyrics available">Lyrics</span>`;
      } else if (cached.state === 'loading') {
        badgeHtml = `<span class="lyrics-badge loading" title="Checking lyrics...">...</span>`;
      } else if (cached.state === 'none') {
        badgeHtml = `<span class="lyrics-badge none" title="No lyrics found">No Lyrics</span>`;
      }
    } else {
      badgeHtml = `<span class="lyrics-badge loading" title="Checking lyrics...">...</span>`;
      preloadLyrics(track, onBadgeUpdate);
    }

    const playIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const heartFilledIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #e0453c;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    const heartIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    const plusIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const closeIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    li.innerHTML = `
      <div class="playlist-track-info">
        <span class="playlist-track-num">${isPlaying ? playIcon : i + 1}</span>
        <div class="playlist-track-details">
          <span class="playlist-track-title">${escapeHtml(track.name)} ${badgeHtml}</span>
          <span class="playlist-track-artist">${escapeHtml(track.artist || 'Unknown')}</span>
        </div>
      </div>
      <div class="playlist-track-actions">
        <button class="${favHeartClass}" title="Toggle Favorite">${isFav ? heartFilledIcon : heartIcon}</button>
        <button class="playlist-track-action-btn add" title="Add to another playlist">${plusIcon}</button>
        <button class="playlist-track-action-btn delete" title="Remove track">${closeIcon}</button>
      </div>
    `;
    
    li.addEventListener('click', (e) => {
      if (e.target.closest('.playlist-track-action-btn')) return;
      
      const isQueueSame = playlist.length === tracks.length && playlist.every((t, idx) => isSameTrack(t, tracks[idx]));
      if (!isQueueSame) {
        playlist.length = 0;
        playlist.push(...tracks);
        resetShuffle();
      }
      if (onTrackPlay) onTrackPlay(i);
    });
    
    li.querySelector('.fav').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onToggleFavorite) onToggleFavorite(track);
    });
    
    li.querySelector('.add').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onAddToAnotherPlaylist) onAddToAnotherPlaylist(track);
    });
    
    li.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onRemoveTrack) onRemoveTrack(track, tracks, i);
    });
    
    playlistTracksListEl.appendChild(li);
  });
}
