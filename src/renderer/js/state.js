// Client-side visualizer and player state

export const SVG_ICONS = {
  music: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  heart: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  heartFilled: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #e0453c;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  folder: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
};

export const playlist = []; // Active play queue
export let currentIndex = -1;
export let activeTrackLoadId = 0;
export let playbackRetryCount = 0;

export let isShuffle = localStorage.getItem('userShufflePreference') === 'true';
export let repeatMode = localStorage.getItem('userRepeatPreference') || 'off'; // 'off', 'all', 'one'
export let shuffleHistory = [];
export let shuffleQueue = [];

export let playlists = {
  "All Tracks": [],
  "Favorites": []
};
export let currentViewedPlaylist = null;
export let trackToAddToPlaylist = null;

export const preloadedStreams = new Map();
export const lyricsCache = new Map();

export const prefetchQueue = [];
export let activePrefetches = 0;
const MAX_CONCURRENT_PREFETCHES = 2;

export function incrementTrackLoadId() {
  activeTrackLoadId++;
  return activeTrackLoadId;
}

export function setPlaybackRetryCount(val) {
  playbackRetryCount = val;
}

export function setCurrentIndex(val) {
  currentIndex = val;
}

export function setCurrentViewedPlaylist(val) {
  currentViewedPlaylist = val;
}

export function setTrackToAddToPlaylist(val) {
  trackToAddToPlaylist = val;
}

export function setPlaylists(val) {
  playlists = val;
}

export function setIsShuffle(val) {
  isShuffle = val;
}

export function setRepeatMode(val) {
  repeatMode = val;
}

export function getTrackKey(track) {
  if (!track) return '';
  if (track.type === 'youtube') return 'yt:' + track.videoId;
  return 'local:' + (track.path || track.name);
}

export function isSameTrack(t1, t2) {
  if (!t1 || !t2) return false;
  if (t1.type === 'youtube' && t2.type === 'youtube') {
    return t1.videoId === t2.videoId;
  }
  if (t1.type === 'local' && t2.type === 'local') {
    return t1.path === t2.path;
  }
  return false;
}

// Persist user custom playlists to localstorage
export function savePlaylistsToStorage() {
  localStorage.setItem('mine_player_playlists', JSON.stringify(playlists));
}

export function loadPlaylistsFromStorage() {
  const saved = localStorage.getItem('mine_player_playlists');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (!parsed["All Tracks"]) parsed["All Tracks"] = [];
        if (!parsed["Favorites"]) parsed["Favorites"] = [];
        playlists = parsed;
      }
    } catch (err) {
      console.warn('Failed to parse saved playlists:', err);
    }
  }
}

export function savePlaySession() {
  localStorage.setItem('mine_player_queue_tracks', JSON.stringify(playlist));
  localStorage.setItem('mine_player_queue_index', currentIndex);
  localStorage.setItem('mine_player_queue_shuffle_history', JSON.stringify(shuffleHistory));
  localStorage.setItem('mine_player_queue_shuffle_queue', JSON.stringify(shuffleQueue));
  localStorage.setItem('userShufflePreference', isShuffle);
  localStorage.setItem('userRepeatPreference', repeatMode);
}

export function loadLyricsCacheFromStorage() {
  const saved = localStorage.getItem('mine_player_lyrics_cache');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([key, value]) => {
          if (value && (value.state === 'loaded' || value.state === 'none')) {
            lyricsCache.set(key, {
              state: value.state,
              lines: value.lines,
              promise: Promise.resolve(value.lines)
            });
          }
        });
      }
    } catch (err) {
      console.warn('Failed to parse saved lyrics cache:', err);
    }
  }
}

export function saveLyricsCacheToStorage() {
  const obj = {};
  lyricsCache.forEach((value, key) => {
    if (value.state === 'loaded' || value.state === 'none') {
      obj[key] = {
        state: value.state,
        lines: value.lines
      };
    }
  });
  localStorage.setItem('mine_player_lyrics_cache', JSON.stringify(obj));
}

export function queuePrefetch(track) {
  if (!track || track.type !== 'youtube') return;
  const videoId = track.videoId;

  if (preloadedStreams.has(videoId)) {
    return;
  }

  prefetchQueue.push(track);
  processPrefetchQueue();
}

function processPrefetchQueue() {
  if (activePrefetches >= MAX_CONCURRENT_PREFETCHES || prefetchQueue.length === 0) {
    return;
  }

  const track = prefetchQueue.shift();
  if (!track) return;

  activePrefetches++;
  const videoId = track.videoId;

  const promise = window.api.youtubePrepareStream(videoId)
    .then(result => {
      activePrefetches--;
      processPrefetchQueue();
      return result;
    })
    .catch(err => {
      activePrefetches--;
      processPrefetchQueue();
      return { error: err.message };
    });

  preloadedStreams.set(videoId, promise);
}

export function resetShuffle() {
  shuffleHistory.length = 0;
  shuffleQueue.length = 0;
}

export function generateShuffleQueue() {
  const indices = [];
  for (let i = 0; i < playlist.length; i++) {
    indices.push(i);
  }
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  if (indices.length > 1 && indices[indices.length - 1] === currentIndex) {
    const swapIdx = Math.floor(Math.random() * (indices.length - 1));
    [indices[indices.length - 1], indices[swapIdx]] = [indices[swapIdx], indices[indices.length - 1]];
  }
  shuffleQueue.length = 0;
  shuffleQueue.push(...indices);
}
