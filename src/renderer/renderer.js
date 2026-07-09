import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import LyricsVisualizer, { normalizeLyricLines } from './lyrics-visualizer.js';
import LyricsSyncController from './lyrics-sync.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// ---------- State ----------
const SVG_ICONS = {
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

// Each track: { type: 'local', path, name, artist, thumbnail } or { type: 'youtube', videoId, name, artist, thumbnail }
const playlist = []; // Active play queue
let currentIndex = -1;
let activeTrackLoadId = 0;

let isShuffle = localStorage.getItem('userShufflePreference') === 'true';
let repeatMode = localStorage.getItem('userRepeatPreference') || 'off'; // 'off', 'all', 'one'
let shuffleHistory = [];
let shuffleQueue = [];

// User playlists stored in localStorage
let playlists = {
  "All Tracks": [],
  "Favorites": []
};
let currentViewedPlaylist = null; // null means viewing the list of playlists
let trackToAddToPlaylist = null; // track currently selected for "Add to Playlist" modal

// Stream and Lyrics cache and background preloader
const preloadedStreams = new Map(); // videoId -> Promise<streamInfo>
const lyricsCache = new Map(); // trackKey -> { state: 'unloaded'|'loading'|'loaded'|'none', lines: [...] }

function loadLyricsCacheFromStorage() {
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

function saveLyricsCacheToStorage() {
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

const prefetchQueue = [];
let activePrefetches = 0;
const MAX_CONCURRENT_PREFETCHES = 2;

function getTrackKey(track) {
  if (!track) return '';
  if (track.type === 'youtube') return 'yt:' + track.videoId;
  return 'local:' + (track.path || track.name);
}

function queuePrefetch(track) {
  if (!track || track.type !== 'youtube') return;
  const videoId = track.videoId;

  if (preloadedStreams.has(videoId)) {
    return; // Already preloading or preloaded
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

function preloadLyrics(track) {
  if (!track) return Promise.resolve(null);
  const key = getTrackKey(track);
  if (lyricsCache.has(key)) {
    return lyricsCache.get(key).promise;
  }

  updateTrackLyricsBadgeInUI(track, 'loading');

  const promise = window.api.fetchLyrics(track.name, track.artist || '')
    .then(lyrics => {
      if (lyrics && lyrics.length > 0) {
        lyricsCache.set(key, { state: 'loaded', lines: lyrics, promise });
        updateTrackLyricsBadgeInUI(track, 'loaded');
        saveLyricsCacheToStorage();
        return lyrics;
      } else {
        lyricsCache.set(key, { state: 'none', lines: null, promise });
        updateTrackLyricsBadgeInUI(track, 'none');
        saveLyricsCacheToStorage();
        return null;
      }
    })
    .catch(err => {
      lyricsCache.set(key, { state: 'none', lines: null, promise });
      updateTrackLyricsBadgeInUI(track, 'none');
      saveLyricsCacheToStorage();
      return null;
    });

  lyricsCache.set(key, { state: 'loading', lines: null, promise });
  return promise;
}

function updateTrackLyricsBadgeInUI(track, state) {
  const key = getTrackKey(track);
  const elements = document.querySelectorAll(`.playlist-track-row[data-track-key="${key}"]`);
  elements.forEach(row => {
    let badge = row.querySelector('.lyrics-badge');
    if (!badge) {
      const titleContainer = row.querySelector('.playlist-track-title');
      if (titleContainer) {
        badge = document.createElement('span');
        badge.className = 'lyrics-badge';
        titleContainer.appendChild(badge);
      }
    }
    if (badge) {
      badge.className = `lyrics-badge ${state}`;
      if (state === 'loaded') {
        badge.textContent = 'Lyrics';
        badge.title = 'Lyrics available';
      } else if (state === 'loading') {
        badge.textContent = '...';
        badge.title = 'Checking lyrics...';
      } else if (state === 'none') {
        badge.textContent = 'No Lyrics';
        badge.title = 'No lyrics found';
      }
    }
  });
}

function preloadStreamsForPlaylist(tracks) {
  if (!tracks) return;
  tracks.forEach(track => {
    if (track.type === 'youtube') {
      queuePrefetch(track);
    }
    preloadLyrics(track);
  });
}

function preloadNextTracks(currIndex) {
  for (let i = 1; i <= 5; i++) {
    const nextIdx = (currIndex + i) % playlist.length;
    if (nextIdx >= 0 && nextIdx < playlist.length) {
      const track = playlist[nextIdx];
      if (track) {
        if (track.type === 'youtube') {
          queuePrefetch(track);
        }
        preloadLyrics(track);
      }
    }
  }
}

// ---------- Elements ----------
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const openBtn = document.getElementById('openBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const trackTime = document.getElementById('trackTime');
const disc = document.getElementById('disc');
const discArt = document.getElementById('discArt');
const coverBackdrop = document.getElementById('coverBackdrop');
const playlistPanel = document.getElementById('playlistPanel');
const playlistToggle = document.getElementById('playlistToggle');
const cloudPanel = document.getElementById('cloudPanel');
const cloudToggle = document.getElementById('cloudToggle');
const cloudSearchForm = document.getElementById('cloudSearchForm');
const cloudSearchInput = document.getElementById('cloudSearchInput');
const cloudResultsEl = document.getElementById('cloudResults');
const cloudStatus = document.getElementById('cloudStatus');

// Playlist UI Elements
const playlistsListHeader = document.getElementById('playlistsListHeader');
const playlistDetailHeader = document.getElementById('playlistDetailHeader');
const playlistsListView = document.getElementById('playlistsListView');
const playlistDetailView = document.getElementById('playlistDetailView');
const playlistsListEl = document.getElementById('playlistsList');
const playlistTracksListEl = document.getElementById('playlistTracksList');
const playlistBackBtn = document.getElementById('playlistBackBtn');
const playlistPlayAllBtn = document.getElementById('playlistPlayAllBtn');
const playlistDetailTitle = document.getElementById('playlistDetailTitle');
const createPlaylistBtn = document.getElementById('createPlaylistBtn');
const newPlaylistForm = document.getElementById('newPlaylistForm');
const newPlaylistInput = document.getElementById('newPlaylistInput');
const newPlaylistSave = document.getElementById('newPlaylistSave');
const newPlaylistCancel = document.getElementById('newPlaylistCancel');

// Import playlist elements
const importPlaylistBtn = document.getElementById('importPlaylistBtn');
const importPlaylistForm = document.getElementById('importPlaylistForm');
const importPlaylistInput = document.getElementById('importPlaylistInput');
const importPlaylistStatus = document.getElementById('importPlaylistStatus');
const importPlaylistSave = document.getElementById('importPlaylistSave');
const importPlaylistCancel = document.getElementById('importPlaylistCancel');

// Import Liked Songs elements
const importLikedSongsBtn = document.getElementById('importLikedSongsBtn');
const importLikedForm = document.getElementById('importLikedForm');
const importLikedAuthBtn = document.getElementById('importLikedAuthBtn');
const importLikedCancel = document.getElementById('importLikedCancel');
const importLikedStatus = document.getElementById('importLikedStatus');

const addActiveTrackBtn = document.getElementById('addActiveTrackBtn');
const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
const likeBtn = document.getElementById('likeBtn');

// Add-to-playlist Modal Elements
const addToPlaylistModal = document.getElementById('addToPlaylistModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalPlaylistsList = document.getElementById('modalPlaylistsList');

// ---------- Lyrics elements ----------
const lyricsToggle = document.getElementById('lyricsToggle');
const lyricsPanel = document.getElementById('lyricsPanel');
const lyricsCanvas = document.getElementById('lyricsCanvas');
const lyricsOverlay = document.getElementById('lyricsOverlay');
const lyricsStatus = document.getElementById('lyricsStatus');
const lyricsRefresh = document.getElementById('lyricsRefresh');
const lyricsClose = document.getElementById('lyricsClose');

// ---------- Settings elements ----------
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const fontSelect = document.getElementById('fontSelect');
const glowColorSelect = document.getElementById('glowColorSelect');
const textSizeSlider = document.getElementById('textSizeSlider');
const textSizeVal = document.getElementById('textSizeVal');
const bounceSlider = document.getElementById('bounceSlider');
const bounceVal = document.getElementById('bounceVal');
const spotlightToggleCheck = document.getElementById('spotlightToggleCheck');
const discToggleCheck = document.getElementById('discToggleCheck');
const syncColorsCheck = document.getElementById('syncColorsCheck');
const waveformColorGroup = document.getElementById('waveformColorGroup');
const waveColorSelect = document.getElementById('waveColorSelect');
const visualizerStyleSelect = document.getElementById('visualizerStyleSelect');

// Lyrics state
let lyricsVisualizer = null;
let lyricsSyncController = null;
let lyricsVisible = false;

// ---------- Titlebar window controls ----------
document.getElementById('minBtn').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('maxBtn').addEventListener('click', () => window.api.toggleFullscreenWindow());
document.getElementById('closeBtn').addEventListener('click', () => window.api.closeWindow());

function closeAllPanelsExcept(exceptPanel) {
  if (exceptPanel !== 'playlist') {
    playlistPanel.classList.remove('open');
    playlistToggle.classList.remove('active');
  }
  if (exceptPanel !== 'cloud') {
    cloudPanel.classList.remove('open');
    cloudToggle.classList.remove('active');
  }
  if (exceptPanel !== 'settings') {
    settingsPanel.classList.remove('open');
    settingsToggle.classList.remove('active');
  }
}

// ---------- Library drawer ----------
playlistToggle.addEventListener('click', () => {
  const isOpen = playlistPanel.classList.contains('open');
  closeAllPanelsExcept(isOpen ? null : 'playlist');
  playlistPanel.classList.toggle('open', !isOpen);
  playlistToggle.classList.toggle('active', !isOpen);
});

// ---------- Settings drawer ----------
settingsToggle.addEventListener('click', () => {
  const isOpen = settingsPanel.classList.contains('open');
  closeAllPanelsExcept(isOpen ? null : 'settings');
  settingsPanel.classList.toggle('open', !isOpen);
  settingsToggle.classList.toggle('active', !isOpen);
});

// Load and initialize settings values in UI
function initSettingsUI() {
  let saved = {
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    glowColor: "gold",
    textSize: 1.0,
    bounceIntensity: 1.0,
    showSpotlight: true,
    showDisc: true,
    syncColors: true,
    waveColor: 'cyan',
    visualizerStyle: 'mirrored'
  };
  try {
    const savedStr = localStorage.getItem('lyricsTextSettings');
    if (savedStr) {
      saved = { ...saved, ...JSON.parse(savedStr) };
    }
  } catch (e) {}

  fontSelect.value = saved.fontFamily;
  glowColorSelect.value = saved.glowColor;
  textSizeSlider.value = saved.textSize;
  textSizeVal.textContent = `${parseFloat(saved.textSize).toFixed(2)}x`;
  bounceSlider.value = saved.bounceIntensity;
  bounceVal.textContent = `${parseFloat(saved.bounceIntensity).toFixed(1)}x`;
  spotlightToggleCheck.checked = !!saved.showSpotlight;

  if (discToggleCheck) discToggleCheck.checked = saved.showDisc !== false;
  if (syncColorsCheck) syncColorsCheck.checked = saved.syncColors !== false;
  if (waveColorSelect) waveColorSelect.value = saved.waveColor || 'cyan';
  if (visualizerStyleSelect) visualizerStyleSelect.value = saved.visualizerStyle || 'mirrored';

  if (waveformColorGroup && syncColorsCheck) {
    waveformColorGroup.style.display = syncColorsCheck.checked ? 'none' : 'block';
  }

  const deck = document.querySelector('.deck');
  if (deck && discToggleCheck) {
    deck.classList.toggle('no-disc', !discToggleCheck.checked);
  }
}

function onSettingsChanged() {
  const settings = {
    fontFamily: fontSelect.value,
    glowColor: glowColorSelect.value,
    textSize: parseFloat(textSizeSlider.value),
    bounceIntensity: parseFloat(bounceSlider.value),
    showSpotlight: spotlightToggleCheck.checked,
    showDisc: discToggleCheck ? discToggleCheck.checked : true,
    syncColors: syncColorsCheck ? syncColorsCheck.checked : true,
    waveColor: waveColorSelect ? waveColorSelect.value : 'cyan',
    visualizerStyle: visualizerStyleSelect ? visualizerStyleSelect.value : 'mirrored'
  };
  textSizeVal.textContent = `${settings.textSize.toFixed(2)}x`;
  bounceVal.textContent = `${settings.bounceIntensity.toFixed(1)}x`;

  localStorage.setItem('lyricsTextSettings', JSON.stringify(settings));

  if (lyricsVisualizer) {
    lyricsVisualizer.updateSettings(settings);
  }

  if (waveformColorGroup) {
    waveformColorGroup.style.display = settings.syncColors ? 'none' : 'block';
  }

  const deck = document.querySelector('.deck');
  if (deck) {
    deck.classList.toggle('no-disc', !settings.showDisc);
  }
}

fontSelect.addEventListener('change', onSettingsChanged);
glowColorSelect.addEventListener('change', onSettingsChanged);
textSizeSlider.addEventListener('input', onSettingsChanged);
bounceSlider.addEventListener('input', onSettingsChanged);
spotlightToggleCheck.addEventListener('change', onSettingsChanged);

if (discToggleCheck) discToggleCheck.addEventListener('change', onSettingsChanged);
if (syncColorsCheck) syncColorsCheck.addEventListener('change', onSettingsChanged);
if (waveColorSelect) waveColorSelect.addEventListener('change', onSettingsChanged);
if (visualizerStyleSelect) visualizerStyleSelect.addEventListener('change', onSettingsChanged);

// Initialize settings right away
initSettingsUI();

// ---------- Lyrics toggle (renders into particle space) ----------
lyricsToggle.addEventListener('click', async () => {
  lyricsVisible = !lyricsVisible;
  lyricsToggle.classList.toggle('active', lyricsVisible);

  // Ensure visualizer exists and is attached to the particle scene
  if (lyricsVisible && !lyricsVisualizer) {
    initLyricsVisualizer();
  }

  // If enabling and there's a current track without lyrics loaded, fetch them
  if (lyricsVisible && playlist[currentIndex] && lyricsVisualizer && (!lyricsVisualizer.lyricsLines || !lyricsVisualizer.lyricsLines.length)) {
    const track = playlist[currentIndex];
    lyricsStatus.textContent = 'Fetching lyrics...';
    await fetchAndDisplayLyrics(track);
  }

  // Toggle visibility by fading meshes in/out
  if (lyricsVisualizer) {
    lyricsVisualizer.visible = lyricsVisible;
  }
});

// Keep refresh button as a manual fetch, but do not open a separate panel
lyricsRefresh.addEventListener('click', async () => {
  if (!playlist[currentIndex]) return;
  const track = playlist[currentIndex];
  lyricsStatus.textContent = 'Fetching lyrics...';
  await fetchAndDisplayLyrics(track);
});

function initLyricsVisualizer() {
  if (lyricsVisualizer) return true;

  try {
    // Attach lyrics visualizer to the main particle scene so text renders
    // in the same space as the particles.
    lyricsVisualizer = new LyricsVisualizer(null, lyricsOverlay, { scene: scene, camera: camera, renderer: renderer3D });
    lyricsVisualizer.visible = lyricsVisible;
    lyricsSyncController = new LyricsSyncController(audio, lyricsVisualizer);

    audio.addEventListener('play', () => {
      if (lyricsSyncController) lyricsSyncController.start();
    });

    audio.addEventListener('pause', () => {
      if (lyricsSyncController) lyricsSyncController.stop();
    });

    audio.addEventListener('seeking', () => {
      if (lyricsSyncController) lyricsSyncController.seek(audio.currentTime);
    });

    return true;
  } catch (err) {
    console.error('Failed to initialize lyrics visualizer:', err);
    lyricsVisualizer = null;
    lyricsSyncController = null;
    return false;
  }
}

async function fetchAndDisplayLyrics(track) {
  try {
    const key = getTrackKey(track);
    let cached = lyricsCache.get(key);

    // Clear current lyrics first so there is no residual display from the previous song.
    if (lyricsVisualizer) {
      await lyricsVisualizer.displayLyrics([]);
    }
    if (lyricsSyncController) {
      lyricsSyncController.setLyrics([]);
    }

    if (cached && cached.state === 'loaded') {
      const lyrics = cached.lines;
      const visualizerReady = initLyricsVisualizer();
      const displayLyrics = normalizeLyricLines(lyrics);

      console.log('Displaying stored lyrics from cache...');
      if (lyricsVisualizer) {
        try {
          await lyricsVisualizer.displayLyrics(displayLyrics);
        } catch (vizErr) {
          console.error('Visualizer error:', vizErr);
        }
      }

      if (lyricsSyncController) {
        lyricsSyncController.setLyrics(lyrics);
      }

      const statusText = `${lyrics.length} lines loaded ✓`;
      lyricsStatus.textContent = statusText;

      if (!audio.paused && lyricsSyncController) {
        lyricsSyncController.start();
      }
      return;
    } else if (cached && cached.state === 'none') {
      lyricsStatus.textContent = 'No lyrics found';
      return;
    }

    lyricsStatus.textContent = 'Fetching lyrics...';
    console.log('Starting lyrics fetch or awaiting active prefetch for:', track.name, track.artist);

    let lyricsPromise;
    if (cached && cached.promise) {
      lyricsPromise = cached.promise;
    } else {
      lyricsPromise = preloadLyrics(track);
    }

    const lyrics = await lyricsPromise;

    if (!lyrics || lyrics.length === 0) {
      lyricsStatus.textContent = 'No lyrics found';
      return;
    }

    const visualizerReady = initLyricsVisualizer();
    const displayLyrics = normalizeLyricLines(lyrics);

    console.log('Displaying lyrics in visualizer...');
    if (lyricsVisualizer) {
      try {
        await lyricsVisualizer.displayLyrics(displayLyrics);
        console.log('✓ Lyrics displayed successfully');
      } catch (vizErr) {
        console.error('Visualizer error:', vizErr);
      }
    }

    if (lyricsSyncController) {
      lyricsSyncController.setLyrics(lyrics);
    }

    const statusText = `${lyrics.length} lines loaded ✓`;
    lyricsStatus.textContent = statusText;

    if (!audio.paused && lyricsSyncController) {
      lyricsSyncController.start();
    }
  } catch (err) {
    console.error('Error fetching lyrics:', err);
    lyricsStatus.textContent = 'Error loading lyrics';
  }
}

// ---------- Cloud (YouTube Music) drawer ----------
cloudToggle.addEventListener('click', () => {
  const isOpen = cloudPanel.classList.contains('open');
  closeAllPanelsExcept(isOpen ? null : 'cloud');
  cloudPanel.classList.toggle('open', !isOpen);
  cloudToggle.classList.toggle('active', !isOpen);
  if (!isOpen) cloudSearchInput.focus();
});

cloudSearchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = cloudSearchInput.value.trim();
  if (!query) return;

  cloudStatus.textContent = 'Searching...';
  cloudResultsEl.innerHTML = '';

  const results = await window.api.youtubeSearch(query);

  if (results && results.error) {
    cloudStatus.textContent = results.error;
    return;
  }
  if (!results || !results.length) {
    cloudStatus.textContent = 'No results.';
    return;
  }

  cloudStatus.textContent = '';
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
    li.addEventListener('click', () => playYoutubeSong(song));
    cloudResultsEl.appendChild(li);
  });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function playYoutubeSong(song) {
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
  renderPlaylist();
  resetShuffle();
  loadTrack(playlist.length - 1);
}

// ---------- Local file loading ----------
openBtn.addEventListener('click', async () => {
  if (window.api && !window.api.isBrowser) {
    const filePaths = await window.api.openAudioFiles();
    if (!filePaths.length) return;

    filePaths.forEach((filePath) => {
      const name = filePath.split(/[\\/]/).pop();
      const trackObj = { type: 'local', path: filePath, name: name, artist: 'Local File' };
      if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
        playlists["All Tracks"].push(trackObj);
      }
      playlist.push(trackObj);
    });

    savePlaylistsToStorage();
    renderPlaylist();
    resetShuffle();

    // If nothing was playing yet, start with the first newly added track.
    if (currentIndex === -1) {
      loadTrack(playlist.length - filePaths.length);
    }
  } else {
    // Web Browser fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;

      const startIndex = playlist.length;
      files.forEach((file) => {
        const trackObj = {
          type: 'local',
          path: file.name,
          name: file.name,
          artist: 'Local File',
          file: file
        };
        if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
          playlists["All Tracks"].push(trackObj);
        }
        playlist.push(trackObj);
      });

      savePlaylistsToStorage();
      renderPlaylist();
      resetShuffle();

      if (currentIndex === -1) {
        loadTrack(startIndex);
      }
    };
    input.click();
  }
});

// ---------- Playlist Persistence and Engine ----------
function loadPlaylistsFromStorage() {
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

function savePlaylistsToStorage() {
  localStorage.setItem('mine_player_playlists', JSON.stringify(playlists));
}

function savePlaySession() {
  localStorage.setItem('mine_player_queue_tracks', JSON.stringify(playlist));
  localStorage.setItem('mine_player_queue_index', currentIndex);
  localStorage.setItem('mine_player_queue_shuffle_history', JSON.stringify(shuffleHistory));
  localStorage.setItem('mine_player_queue_shuffle_queue', JSON.stringify(shuffleQueue));
  localStorage.setItem('userShufflePreference', isShuffle);
  localStorage.setItem('userRepeatPreference', repeatMode);
}

function loadPlaySession() {
  const savedTracks = localStorage.getItem('mine_player_queue_tracks');
  const savedIndexStr = localStorage.getItem('mine_player_queue_index');
  const savedShuffleHistory = localStorage.getItem('mine_player_queue_shuffle_history');
  const savedShuffleQueue = localStorage.getItem('mine_player_queue_shuffle_queue');
  const savedTime = localStorage.getItem('mine_player_queue_current_time');

  let loadedTracks = [];
  if (savedTracks) {
    try {
      loadedTracks = JSON.parse(savedTracks);
    } catch (e) {
      console.warn('Failed to parse saved queue tracks:', e);
    }
  }

  // Fallback if there is no saved queue
  if (!loadedTracks || loadedTracks.length === 0) {
    if (playlists["All Tracks"].length > 0) {
      playlist.push(...playlists["All Tracks"]);
    }
    currentIndex = -1;
    renderPlaylist();
    return;
  }

  playlist.length = 0;
  playlist.push(...loadedTracks);

  let savedIndex = -1;
  if (savedIndexStr !== null) {
    savedIndex = parseInt(savedIndexStr, 10);
  }

  if (savedShuffleHistory) {
    try {
      shuffleHistory = JSON.parse(savedShuffleHistory);
    } catch (e) {}
  }
  if (savedShuffleQueue) {
    try {
      shuffleQueue = JSON.parse(savedShuffleQueue);
    } catch (e) {}
  }

  renderPlaylist();

  if (savedIndex >= 0 && savedIndex < playlist.length) {
    // Load track without autoplaying
    loadTrack(savedIndex, false).then(() => {
      if (savedTime) {
        const time = parseFloat(savedTime);
        if (!isNaN(time)) {
          const setTime = () => {
            audio.currentTime = time;
          };
          if (audio.readyState >= 1) { // HAVE_METADATA or higher
            setTime();
          } else {
            audio.addEventListener('loadedmetadata', setTime, { once: true });
          }
        }
      }
    });
  }
}

function isSameTrack(t1, t2) {
  if (!t1 || !t2) return false;
  if (t1.type === 'youtube' && t2.type === 'youtube') {
    return t1.videoId === t2.videoId;
  }
  if (t1.type === 'local' && t2.type === 'local') {
    return t1.path === t2.path;
  }
  return false;
}

function updateLikeBtn() {
  const currentTrack = playlist[currentIndex];
  if (!currentTrack) {
    likeBtn.classList.remove('liked');
    likeBtn.innerHTML = SVG_ICONS.heart;
    likeBtn.title = 'Add to Favorites';
    return;
  }
  const isFav = playlists["Favorites"].some(t => isSameTrack(t, currentTrack));
  if (isFav) {
    likeBtn.classList.add('liked');
    likeBtn.innerHTML = SVG_ICONS.heartFilled;
    likeBtn.title = 'Remove from Favorites';
  } else {
    likeBtn.classList.remove('liked');
    likeBtn.innerHTML = SVG_ICONS.heart;
    likeBtn.title = 'Add to Favorites';
  }
}

function renderPlaylistsList() {
  playlistsListEl.innerHTML = '';
  
  Object.keys(playlists).forEach(name => {
    const li = document.createElement('li');
    li.className = 'playlist-item';
    
    let icon = SVG_ICONS.folder;
    if (name === "All Tracks") icon = SVG_ICONS.music;
    if (name === "Favorites") icon = SVG_ICONS.heartFilled;
    
    const count = playlists[name].length;
    
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
      delBtn.innerHTML = SVG_ICONS.trash;
      delBtn.title = 'Delete playlist';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the playlist "${name}"?`)) {
          delete playlists[name];
          savePlaylistsToStorage();
          renderPlaylistsList();
        }
      });
      li.appendChild(delBtn);
    }
    
    li.addEventListener('click', () => {
      currentViewedPlaylist = name;
      playlistsListView.style.display = 'none';
      playlistsListHeader.style.display = 'none';
      playlistDetailView.style.display = 'block';
      playlistDetailHeader.style.display = 'flex';
      renderPlaylistDetail();
    });
    
    playlistsListEl.appendChild(li);
  });
}

function renderPlaylistDetail() {
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
      preloadLyrics(track);
    }

    li.innerHTML = `
      <div class="playlist-track-info">
        <span class="playlist-track-num">${isPlaying ? SVG_ICONS.play : i + 1}</span>
        <div class="playlist-track-details">
          <span class="playlist-track-title">${escapeHtml(track.name)} ${badgeHtml}</span>
          <span class="playlist-track-artist">${escapeHtml(track.artist || 'Unknown')}</span>
        </div>
      </div>
      <div class="playlist-track-actions">
        <button class="${favHeartClass}" title="Toggle Favorite">${isFav ? SVG_ICONS.heartFilled : SVG_ICONS.heart}</button>
        <button class="playlist-track-action-btn add" title="Add to another playlist">${SVG_ICONS.plus}</button>
        <button class="playlist-track-action-btn delete" title="Remove track">${SVG_ICONS.close}</button>
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
      
      loadTrack(i);
    });
    
    li.querySelector('.fav').addEventListener('click', (e) => {
      e.stopPropagation();
      const favIndex = playlists["Favorites"].findIndex(t => isSameTrack(t, track));
      if (favIndex !== -1) {
        playlists["Favorites"].splice(favIndex, 1);
      } else {
        playlists["Favorites"].push(track);
      }
      savePlaylistsToStorage();
      updateLikeBtn();
      renderPlaylist();
    });
    
    li.querySelector('.add').addEventListener('click', (e) => {
      e.stopPropagation();
      openAddToPlaylistModal(track);
    });
    
    li.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      tracks.splice(i, 1);
      savePlaylistsToStorage();
      
      const isQueueSame = playlist.length === tracks.length + 1 && playlist.some((t) => isSameTrack(t, track));
      if (isQueueSame) {
        const removeIdx = playlist.findIndex(t => isSameTrack(t, track));
        if (removeIdx !== -1) {
          playlist.splice(removeIdx, 1);
          resetShuffle();
          if (currentIndex === removeIdx) {
            currentIndex = -1;
            audio.pause();
          } else if (currentIndex > removeIdx) {
            currentIndex--;
          }
        }
      }
      
      renderPlaylist();
    });
    
    playlistTracksListEl.appendChild(li);
  });
}

function renderPlaylist() {
  if (currentViewedPlaylist) {
    renderPlaylistDetail();
  } else {
    renderPlaylistsList();
  }
}

function openAddToPlaylistModal(track) {
  trackToAddToPlaylist = track;
  modalPlaylistsList.innerHTML = '';
  
  const targetPlaylists = Object.keys(playlists).filter(name => name !== "All Tracks" && name !== "Favorites");
  
  if (targetPlaylists.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 16px; text-align: center; color: var(--text-dim); font-size: 11px;';
    li.textContent = 'No custom playlists. Create one in the Library first!';
    modalPlaylistsList.appendChild(li);
  } else {
    targetPlaylists.forEach(name => {
      const li = document.createElement('li');
      li.className = 'modal-playlist-item';
      li.textContent = name;
      li.addEventListener('click', () => {
        const list = playlists[name];
        if (!list.some(t => isSameTrack(t, trackToAddToPlaylist))) {
          list.push(trackToAddToPlaylist);
          savePlaylistsToStorage();
        }
        addToPlaylistModal.style.display = 'none';
        renderPlaylist();
      });
      modalPlaylistsList.appendChild(li);
    });
  }
  
  addToPlaylistModal.style.display = 'flex';
}

// ---------- Playlist UI Event Listeners ----------
likeBtn.addEventListener('click', () => {
  const currentTrack = playlist[currentIndex];
  if (!currentTrack) return;
  
  const favIndex = playlists["Favorites"].findIndex(t => isSameTrack(t, currentTrack));
  if (favIndex !== -1) {
    playlists["Favorites"].splice(favIndex, 1);
  } else {
    playlists["Favorites"].push(currentTrack);
  }
  
  savePlaylistsToStorage();
  updateLikeBtn();
  renderPlaylist();
});

createPlaylistBtn.addEventListener('click', () => {
  newPlaylistForm.style.display = newPlaylistForm.style.display === 'none' ? 'block' : 'none';
  if (newPlaylistForm.style.display === 'block') {
    importPlaylistForm.style.display = 'none';
    newPlaylistInput.focus();
  }
});

newPlaylistSave.addEventListener('click', () => {
  const name = newPlaylistInput.value.trim();
  if (!name) return;
  if (playlists[name]) {
    alert('A playlist with this name already exists.');
    return;
  }
  playlists[name] = [];
  savePlaylistsToStorage();
  newPlaylistInput.value = '';
  newPlaylistForm.style.display = 'none';
  renderPlaylistsList();
});

newPlaylistCancel.addEventListener('click', () => {
  newPlaylistInput.value = '';
  newPlaylistForm.style.display = 'none';
});

// ---------- YouTube Liked Songs (OAuth) Event Listeners ----------
let firebaseAuth = null;
let googleProvider = null;

async function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;
  try {
    const res = await fetch('/api/firebase-config');
    if (!res.ok) throw new Error('Could not load Firebase configuration.');
    const firebaseConfig = await res.json();
    
    const app = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(app);
    
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/youtube.readonly');
    
    return firebaseAuth;
  } catch (err) {
    console.error('Firebase initialization failed:', err);
    throw err;
  }
}

importLikedSongsBtn.addEventListener('click', () => {
  const isFormOpen = importLikedForm.style.display === 'block';
  importLikedForm.style.display = isFormOpen ? 'none' : 'block';
  if (!isFormOpen) {
    newPlaylistForm.style.display = 'none';
    importPlaylistForm.style.display = 'none';
  }
});

importLikedCancel.addEventListener('click', () => {
  importLikedForm.style.display = 'none';
  importLikedStatus.style.display = 'none';
});

importLikedAuthBtn.addEventListener('click', async () => {
  importLikedStatus.textContent = 'Initializing connection... Please wait.';
  importLikedStatus.style.display = 'block';
  importLikedAuthBtn.disabled = true;
  importLikedCancel.disabled = true;

  try {
    let response;
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');

    if (isElectron) {
      importLikedStatus.textContent = 'Opening Google Sign-in window...';
      response = await window.api.youtubeImportLikedSongs();
    } else {
      const auth = await getFirebaseAuth();
      
      importLikedStatus.textContent = 'Opening Google Sign-in popup...';
      
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential || !credential.accessToken) {
        throw new Error('Failed to obtain Google access token.');
      }
      
      const accessToken = credential.accessToken;
      importLikedStatus.textContent = 'Importing your Liked Songs from YouTube Music...';
      
      // Call our API bridge
      response = await window.api.youtubeImportLikedSongs(accessToken);
    }
    
    importLikedAuthBtn.disabled = false;
    importLikedCancel.disabled = false;

    if (response.error) {
      importLikedStatus.textContent = `Error: ${response.error}`;
      return;
    }

    if (!response.tracks || response.tracks.length === 0) {
      importLikedStatus.textContent = 'Error: No valid songs found in your Liked Songs playlist.';
      return;
    }

    // Generate unique name
    let playlistName = response.title || 'YouTube Liked Songs';
    let counter = 1;
    while (playlists[playlistName]) {
      playlistName = `${response.title || 'YouTube Liked Songs'} (${counter})`;
      counter++;
    }

    // Create playlist and push tracks
    playlists[playlistName] = response.tracks;

    // Add all tracks to All Tracks if not present
    response.tracks.forEach(trackObj => {
      if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
        playlists["All Tracks"].push(trackObj);
      }
    });

    savePlaylistsToStorage();

    // Start background stream & lyrics preloading
    preloadStreamsForPlaylist(response.tracks);

    // Reset UI
    importLikedForm.style.display = 'none';
    importLikedStatus.style.display = 'none';

    // Navigate directly to the new playlist detail
    currentViewedPlaylist = playlistName;
    playlistsListView.style.display = 'none';
    playlistsListHeader.style.display = 'none';
    playlistDetailView.style.display = 'block';
    playlistDetailHeader.style.display = 'flex';
    
    renderPlaylist();

  } catch (err) {
    console.error('Liked songs OAuth or import error:', err);
    importLikedAuthBtn.disabled = false;
    importLikedCancel.disabled = false;
    importLikedStatus.textContent = `Authentication failed: ${err.message || err}`;
  }
});

// ---------- YouTube Playlist Importer Event Listeners ----------
importPlaylistBtn.addEventListener('click', () => {
  const isFormOpen = importPlaylistForm.style.display === 'block';
  importPlaylistForm.style.display = isFormOpen ? 'none' : 'block';
  if (!isFormOpen) {
    newPlaylistForm.style.display = 'none';
    importPlaylistInput.focus();
  }
});

importPlaylistCancel.addEventListener('click', () => {
  importPlaylistInput.value = '';
  importPlaylistForm.style.display = 'none';
  importPlaylistStatus.style.display = 'none';
});

importPlaylistSave.addEventListener('click', async () => {
  const url = importPlaylistInput.value.trim();
  if (!url) return;

  importPlaylistStatus.textContent = 'Extracting playlist songs... Please wait.';
  importPlaylistStatus.style.display = 'block';
  importPlaylistSave.disabled = true;
  importPlaylistCancel.disabled = true;
  importPlaylistInput.disabled = true;

  const result = await window.api.youtubeImportPlaylist(url);

  importPlaylistSave.disabled = false;
  importPlaylistCancel.disabled = false;
  importPlaylistInput.disabled = false;

  if (result.error) {
    importPlaylistStatus.textContent = `Error: ${result.error}`;
    return;
  }

  if (!result.tracks || result.tracks.length === 0) {
    importPlaylistStatus.textContent = 'Error: No valid tracks found in this playlist.';
    return;
  }

  // Generate unique name
  let playlistName = result.title;
  let counter = 1;
  while (playlists[playlistName]) {
    playlistName = `${result.title} (${counter})`;
    counter++;
  }

  // Create playlist and push tracks
  playlists[playlistName] = result.tracks;

  // Add all tracks to All Tracks if not present
  result.tracks.forEach(trackObj => {
    if (!playlists["All Tracks"].some(t => isSameTrack(t, trackObj))) {
      playlists["All Tracks"].push(trackObj);
    }
  });

  savePlaylistsToStorage();

  // Start background stream & lyrics preloading for all tracks in this imported playlist
  preloadStreamsForPlaylist(result.tracks);

  // Reset UI
  importPlaylistInput.value = '';
  importPlaylistForm.style.display = 'none';
  importPlaylistStatus.style.display = 'none';

  // Navigate directly to the new playlist detail
  currentViewedPlaylist = playlistName;
  playlistsListView.style.display = 'none';
  playlistsListHeader.style.display = 'none';
  playlistDetailView.style.display = 'block';
  playlistDetailHeader.style.display = 'flex';
  
  renderPlaylist();
});

playlistBackBtn.addEventListener('click', () => {
  currentViewedPlaylist = null;
  playlistDetailView.style.display = 'none';
  playlistDetailHeader.style.display = 'none';
  playlistsListView.style.display = 'block';
  playlistsListHeader.style.display = 'flex';
  renderPlaylistsList();
});

playlistPlayAllBtn.addEventListener('click', () => {
  if (!currentViewedPlaylist) return;
  const tracks = playlists[currentViewedPlaylist];
  if (!tracks || tracks.length === 0) return;
  
  playlist.length = 0;
  playlist.push(...tracks);
  resetShuffle();
  
  renderPlaylist();
  loadTrack(0);
});

addActiveTrackBtn.addEventListener('click', () => {
  if (!currentViewedPlaylist) return;
  const activeTrack = playlist[currentIndex];
  if (!activeTrack) {
    alert('No track is currently playing.');
    return;
  }
  
  const list = playlists[currentViewedPlaylist];
  if (list.some(t => isSameTrack(t, activeTrack))) {
    alert('This track is already in the playlist.');
    return;
  }
  
  list.push(activeTrack);
  savePlaylistsToStorage();
  renderPlaylistDetail();
});

deletePlaylistBtn.addEventListener('click', () => {
  if (!currentViewedPlaylist || currentViewedPlaylist === "All Tracks" || currentViewedPlaylist === "Favorites") return;
  if (confirm(`Are you sure you want to delete the playlist "${currentViewedPlaylist}"?`)) {
    delete playlists[currentViewedPlaylist];
    savePlaylistsToStorage();
    currentViewedPlaylist = null;
    playlistDetailView.style.display = 'none';
    playlistDetailHeader.style.display = 'none';
    playlistsListView.style.display = 'block';
    playlistsListHeader.style.display = 'flex';
    renderPlaylistsList();
  }
});

closeModalBtn.addEventListener('click', () => {
  addToPlaylistModal.style.display = 'none';
});

addToPlaylistModal.addEventListener('click', (e) => {
  if (e.target === addToPlaylistModal) {
    addToPlaylistModal.style.display = 'none';
  }
});

async function loadTrack(index, autoplay = true) {
  if (index < 0 || index >= playlist.length) return;

  const trackLoadId = ++activeTrackLoadId;
  currentIndex = index;
  savePlaySession();
  const track = playlist[currentIndex];

  trackTitle.textContent = track.name;
  trackArtist.textContent = track.artist || '';
  updateLikeBtn();
  renderPlaylist();

  if (lyricsSyncController) {
    lyricsSyncController.stop();
    lyricsSyncController.setLyrics([]);
  }
  if (lyricsVisualizer) {
    lyricsVisualizer.displayLyrics([]);
  }
  lyricsStatus.textContent = 'No lyrics loaded';

  // Trigger background preloading for the next few tracks immediately
  preloadNextTracks(currentIndex);

  if (track.type === 'local') {
    if (track.file) {
      audio.crossOrigin = 'anonymous';
      audio.src = URL.createObjectURL(track.file);
    } else {
      audio.removeAttribute('crossorigin');
      audio.src = 'file://' + encodeURI(track.path.replace(/\\/g, '/'));
    }

    if (autoplay) {
      try {
        await audio.play();
        if (trackLoadId !== activeTrackLoadId) return;
        startPlaybackUI();
      } catch (err) {
        console.warn('Local track playback failed:', err);
        if (trackLoadId !== activeTrackLoadId) return;
        stopPlaybackUI();
        trackTitle.textContent = `Playback failed — ${track.name}`;
      }
    } else {
      stopPlaybackUI();
    }

    if (trackLoadId !== activeTrackLoadId) return;
    await applyLocalMetadata(track);

    if (lyricsVisible) {
      fetchAndDisplayLyrics(track);
    }
  } else {
    trackTitle.textContent = `Loading — ${track.name}`;
    disc.classList.remove('spinning');
    audio.crossOrigin = 'anonymous';
    audio.removeAttribute('src');

    if (track.thumbnail) {
      discArt.src = track.thumbnail;
      discArt.classList.add('visible');
      coverBackdrop.style.backgroundImage = `url("${track.thumbnail}")`;
      coverBackdrop.classList.add('visible');
    } else {
      discArt.classList.remove('visible');
      coverBackdrop.classList.remove('visible');
    }

    // Retrieve from preloaded stream cache or start preloading now
    let streamPromise = preloadedStreams.get(track.videoId);
    if (!streamPromise) {
      streamPromise = window.api.youtubePrepareStream(track.videoId);
      preloadedStreams.set(track.videoId, streamPromise);
    }

    const result = await streamPromise;

    if (trackLoadId !== activeTrackLoadId) return;

    if (result.error) {
      preloadedStreams.delete(track.videoId); // Allow retry if it failed
      trackTitle.textContent = `Error — ${result.error}`;
      return;
    }

    audio.crossOrigin = 'anonymous';
    audio.src = result.streamUrl;

    if (autoplay) {
      try {
        await audio.play();
        if (trackLoadId !== activeTrackLoadId) return;
        trackTitle.textContent = track.name;
        startPlaybackUI();
      } catch (err) {
        console.warn('YouTube playback failed:', err);
        if (trackLoadId !== activeTrackLoadId) return;
        stopPlaybackUI();
        trackTitle.textContent = `Playback failed — ${track.name}`;
      }
    } else {
      trackTitle.textContent = track.name;
      stopPlaybackUI();
    }

    if (trackLoadId !== activeTrackLoadId) return;
    if (lyricsVisible) {
      fetchAndDisplayLyrics(track);
    }
  }
}

function startPlaybackUI() {
  playBtn.innerHTML = SVG_ICONS.pause;
  disc.classList.add('spinning');
}

function stopPlaybackUI() {
  playBtn.innerHTML = SVG_ICONS.play;
  disc.classList.remove('spinning');
}

async function applyLocalMetadata(track) {
  let meta;
  if (track.file) {
    const nameNoExt = track.file.name.substring(0, track.file.name.lastIndexOf('.')) || track.file.name;
    const parts = nameNoExt.split(' - ');
    let artist = '';
    let title = nameNoExt;
    if (parts.length > 1) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
    meta = { title, artist, album: '', cover: null };
  } else {
    meta = await window.api.getTrackMetadata(track.path);
  }

  if (playlist[currentIndex] !== track) return;

  if (meta.title) track.name = meta.title;
  if (meta.artist) track.artist = meta.artist;

  savePlaylistsToStorage();
  savePlaySession();

  trackTitle.textContent = meta.title || track.name;
  trackArtist.textContent = meta.artist || '';

  if (meta.cover) {
    discArt.src = meta.cover;
    discArt.classList.add('visible');
    coverBackdrop.style.backgroundImage = `url("${meta.cover}")`;
    coverBackdrop.classList.add('visible');
  } else {
    discArt.classList.remove('visible');
    coverBackdrop.classList.remove('visible');
  }
}

// ---------- Transport controls ----------
playBtn.addEventListener('click', async () => {
  if (!audio.src) return;

  try {
    if (audio.paused) {
      await audio.play();
      startPlaybackUI();
    } else {
      audio.pause();
      stopPlaybackUI();
    }
  } catch (err) {
    console.warn('Playback toggle failed:', err);
    stopPlaybackUI();
  }
});

// ---------- Shuffle & Repeat State Helpers ----------
const REPEAT_ALL_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;

const REPEAT_ONE_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="11.5" y="15.5" font-size="8" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`;

function resetShuffle() {
  shuffleHistory = [];
  shuffleQueue = [];
}

function generateShuffleQueue() {
  const indices = [];
  for (let i = 0; i < playlist.length; i++) {
    indices.push(i);
  }
  // Shuffle indices
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // Ensure we don't immediately repeat the current song if possible
  if (indices.length > 1 && indices[indices.length - 1] === currentIndex) {
    const swapIdx = Math.floor(Math.random() * (indices.length - 1));
    [indices[indices.length - 1], indices[swapIdx]] = [indices[swapIdx], indices[indices.length - 1]];
  }
  shuffleQueue = indices;
}

function updateShuffleRepeatUI() {
  if (isShuffle) {
    shuffleBtn.classList.add('active');
    shuffleBtn.title = 'Shuffle: On';
  } else {
    shuffleBtn.classList.remove('active');
    shuffleBtn.title = 'Shuffle: Off';
  }

  if (repeatMode === 'off') {
    repeatBtn.classList.remove('active');
    repeatBtn.innerHTML = REPEAT_ALL_SVG;
    repeatBtn.title = 'Repeat: Off';
  } else if (repeatMode === 'all') {
    repeatBtn.classList.add('active');
    repeatBtn.innerHTML = REPEAT_ALL_SVG;
    repeatBtn.title = 'Repeat: All';
  } else if (repeatMode === 'one') {
    repeatBtn.classList.add('active');
    repeatBtn.innerHTML = REPEAT_ONE_SVG;
    repeatBtn.title = 'Repeat: One';
  }
}

function playNextTrack(autoEnd = false) {
  if (playlist.length === 0) return;

  if (repeatMode === 'one' && autoEnd) {
    loadTrack(currentIndex);
    return;
  }

  if (isShuffle) {
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      shuffleHistory.push(currentIndex);
    }
    if (shuffleQueue.length === 0) {
      generateShuffleQueue();
    }
    if (shuffleQueue.length > 0) {
      const nextIdx = shuffleQueue.pop();
      loadTrack(nextIdx);
    } else {
      loadTrack(0);
    }
  } else {
    let nextIdx = currentIndex + 1;
    if (nextIdx >= playlist.length) {
      if (repeatMode === 'all') {
        loadTrack(0);
      } else {
        stopPlaybackUI();
      }
    } else {
      loadTrack(nextIdx);
    }
  }
}

function playPrevTrack() {
  if (playlist.length === 0) return;

  if (repeatMode === 'one') {
    loadTrack(currentIndex);
    return;
  }

  if (isShuffle) {
    if (shuffleHistory.length > 0) {
      const prevIdx = shuffleHistory.pop();
      if (currentIndex >= 0 && currentIndex < playlist.length) {
        shuffleQueue.push(currentIndex);
      }
      loadTrack(prevIdx);
    } else {
      const prevIdx = Math.floor(Math.random() * playlist.length);
      loadTrack(prevIdx);
    }
  } else {
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) {
      if (repeatMode === 'all') {
        loadTrack(playlist.length - 1);
      } else {
        loadTrack(0);
      }
    } else {
      loadTrack(prevIdx);
    }
  }
}

prevBtn.addEventListener('click', () => playPrevTrack());
nextBtn.addEventListener('click', () => playNextTrack(false));

shuffleBtn.addEventListener('click', () => {
  isShuffle = !isShuffle;
  localStorage.setItem('userShufflePreference', isShuffle);
  resetShuffle();
  if (isShuffle) {
    generateShuffleQueue();
  }
  updateShuffleRepeatUI();
  savePlaySession();
});

repeatBtn.addEventListener('click', () => {
  if (repeatMode === 'off') {
    repeatMode = 'all';
  } else if (repeatMode === 'all') {
    repeatMode = 'one';
  } else {
    repeatMode = 'off';
  }
  localStorage.setItem('userRepeatPreference', repeatMode);
  updateShuffleRepeatUI();
  savePlaySession();
});

// Update UI initially on load
updateShuffleRepeatUI();

audio.addEventListener('ended', () => {
  playNextTrack(true);
});

audio.addEventListener('error', () => {
  stopPlaybackUI();
  if (playlist[currentIndex]) {
    trackTitle.textContent = `Playback error — ${playlist[currentIndex].name}`;
  }
});

// ---------- Seek bar ----------
window.isDraggingSeekBar = false;

let lastSavedTime = -1;
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  // Only update seekbar position if the user isn't actively dragging it
  if (!window.isDraggingSeekBar) {
    seekBar.value = (audio.currentTime / audio.duration) * 100;
  }
  trackTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;

  const roundedTime = Math.floor(audio.currentTime);
  if (roundedTime !== lastSavedTime) {
    lastSavedTime = roundedTime;
    localStorage.setItem('mine_player_queue_current_time', audio.currentTime);
  }
});

seekBar.addEventListener('mousedown', () => {
  window.isDraggingSeekBar = true;
});
seekBar.addEventListener('touchstart', () => {
  window.isDraggingSeekBar = true;
});
window.addEventListener('mouseup', () => {
  window.isDraggingSeekBar = false;
});
window.addEventListener('touchend', () => {
  window.isDraggingSeekBar = false;
});
seekBar.addEventListener('change', () => {
  window.isDraggingSeekBar = false;
});

seekBar.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (seekBar.value / 100) * audio.duration;
});

function formatTime(seconds) {
  if (Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- Volume ----------
volumeBar.addEventListener('input', () => {
  audio.volume = volumeBar.value;
  localStorage.setItem('userVolumePreference', volumeBar.value);
});

// ---------- Web Audio API analyser ----------
// Note: createMediaElementSource can only be called ONCE per <audio> element,
// which is why this setup runs a single time at the top level, not per-track.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;

const source = audioCtx.createMediaElementSource(audio);
source.connect(analyser);
analyser.connect(audioCtx.destination);

const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

// Some browsers/OSes start AudioContext suspended until a user gesture.
document.addEventListener(
  'click',
  () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  },
  { once: true }
);

// ---------- 3D particle field (Three.js) ----------
// The ambient "space" backdrop — drifts on its own at rest, reacts to the
// same analyser data driving the disc glow.
const particleCanvas = document.getElementById('particles');
const renderer3D = new THREE.WebGLRenderer({ canvas: particleCanvas, alpha: true, antialias: true });
renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer3D.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.z = 600;

// Soft circular sprite generated on the fly — default square Points look flat/harsh.
function makeParticleSprite() {
  const size = 64;
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = size;
  const sctx = spriteCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(spriteCanvas);
}

const PARTICLE_COUNT = 1600;
const positions = new Float32Array(PARTICLE_COUNT * 3);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  // Spread through a spherical shell (not a solid ball) so depth reads clearly
  // as the camera moves — a "field of stars" rather than a dense cloud.
  const radius = 250 + Math.random() * 550;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);
  positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
  positions[i * 3 + 2] = radius * Math.cos(phi);
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const particleMaterial = new THREE.PointsMaterial({
  size: 4,
  map: makeParticleSprite(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  color: new THREE.Color('#fac900'),
});

const particleField = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particleField);

// User-driven camera control — drag to orbit, scroll to zoom, just like
// Mineradio's cinematic camera. autoRotate keeps a slow ambient drift going
// at rest; dragging temporarily overrides it, then it resumes.
const cameraControls = new OrbitControls(camera, particleCanvas);
cameraControls.enableDamping = true;
cameraControls.dampingFactor = 0.05;
cameraControls.enablePan = false; // keep the particle field centered
cameraControls.minDistance = 150;
cameraControls.maxDistance = 1100;
cameraControls.autoRotate = true;
cameraControls.autoRotateSpeed = 0.4;
particleCanvas.style.cursor = 'grab';
particleCanvas.addEventListener('mousedown', () => (particleCanvas.style.cursor = 'grabbing'));
window.addEventListener('mouseup', () => (particleCanvas.style.cursor = 'grab'));

const goldColor = new THREE.Color('#fac900');
const blueColor = new THREE.Color('#008aff');
const mixedColor = new THREE.Color();

function resizeParticles() {
  renderer3D.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeParticles);

function animateParticles() {
  requestAnimationFrame(animateParticles);

  cameraControls.update(); // handles both the idle auto-rotate and user drag/zoom input

  analyser.getByteFrequencyData(dataArray);

  let totalSum = 0;
  let bassSum = 0;
  let trebleSum = 0;
  for (let i = 0; i < bufferLength; i++) {
    totalSum += dataArray[i];
    if (i < 8) bassSum += dataArray[i];
    if (i >= bufferLength - 40) trebleSum += dataArray[i];
  }
  const energy = totalSum / bufferLength / 255; // overall loudness, 0..1
  const bassAvg = bassSum / 8 / 255;
  const trebleAvg = trebleSum / 40 / 255;

  particleMaterial.size = 3 + energy * 9;

  if (lyricsVisualizer) {
    lyricsVisualizer.updateBass(bassAvg);
  }

  // FOV pulse on bass instead of moving the camera directly — moving
  // camera.position would fight OrbitControls' own distance tracking
  // and break user-controlled zoom.
  camera.fov = 60 + bassAvg * 8;
  camera.updateProjectionMatrix();

  mixedColor.copy(goldColor).lerp(blueColor, trebleAvg);
  particleMaterial.color.copy(mixedColor);

  // Bass-reactive glow on the disc (moved here from the old bar visualizer)
  disc.style.boxShadow = `0 0 0 3px rgba(250, 201, 0, ${0.12 + bassAvg * 0.25}), 0 0 ${
    20 + bassAvg * 40
  }px rgba(0, 138, 255, ${0.15 + bassAvg * 0.35})`;

  renderer3D.render(scene, camera);
}

// ---------- Global Keyboard Shortcuts ----------
document.addEventListener('keydown', (e) => {
  // Handle Escape key to close Cloud and Library panels even if search input is focused
  if (e.key === 'Escape' || e.code === 'Escape') {
    let closedAny = false;
    if (isVisualizerActive) {
      toggleWaveformVisualizer(false);
      closedAny = true;
    }
    if (cloudPanel.classList.contains('open')) {
      cloudPanel.classList.remove('open');
      cloudToggle.classList.remove('active');
      closedAny = true;
    }
    if (playlistPanel.classList.contains('open')) {
      playlistPanel.classList.remove('open');
      playlistToggle.classList.remove('active');
      newPlaylistForm.style.display = 'none';
      importPlaylistForm.style.display = 'none';
      closedAny = true;
    }
    if (settingsPanel.classList.contains('open')) {
      settingsPanel.classList.remove('open');
      settingsToggle.classList.remove('active');
      closedAny = true;
    }
    if (closedAny) {
      e.preventDefault();
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    }
    return;
  }

  const active = document.activeElement;
  if (active && (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable ||
    active.tagName === 'SELECT'
  )) {
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      playBtn.click();
      break;

    case 'ArrowLeft':
      e.preventDefault();
      prevBtn.click();
      break;

    case 'ArrowRight':
      e.preventDefault();
      nextBtn.click();
      break;

    case 'ArrowUp':
      e.preventDefault();
      {
        let vol = parseFloat(volumeBar.value) || 0;
        vol = Math.min(1, vol + 0.05);
        volumeBar.value = vol.toFixed(2);
        audio.volume = vol;
        localStorage.setItem('userVolumePreference', volumeBar.value);
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      {
        let vol = parseFloat(volumeBar.value) || 0;
        vol = Math.max(0, vol - 0.05);
        volumeBar.value = vol.toFixed(2);
        audio.volume = vol;
        localStorage.setItem('userVolumePreference', volumeBar.value);
      }
      break;

    case 'KeyV':
      e.preventDefault();
      toggleWaveformVisualizer();
      break;

    default:
      break;
  }
});

// ---------- Waveform Visualizer State & Core Logic ----------
let isVisualizerActive = false;
let visualizerAnimationId = null;

const colorMap = {
  gold: '#fac900',
  cyan: '#00f0ff',
  magenta: '#ff007f',
  green: '#39ff14',
  white: '#ffffff'
};

function syncWaveformTrackDetails() {
  const waveTitle = document.getElementById('waveformTitle');
  const waveArtist = document.getElementById('waveformArtist');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  
  if (waveTitle && trackTitle) {
    waveTitle.textContent = trackTitle.textContent;
  }
  if (waveArtist && trackArtist) {
    waveArtist.textContent = trackArtist.textContent || 'Unknown Artist';
  }
}

// Observe track details element modifications to dynamically sync with visualizer
const trackDetailsObserver = new MutationObserver(syncWaveformTrackDetails);
const observerConfig = { childList: true, characterData: true, subtree: true };
const targetTitle = document.getElementById('trackTitle');
const targetArtist = document.getElementById('trackArtist');

if (targetTitle) trackDetailsObserver.observe(targetTitle, observerConfig);
if (targetArtist) trackDetailsObserver.observe(targetArtist, observerConfig);

function startWaveformAnimation() {
  const canvas = document.getElementById('waveformCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function draw() {
    if (!isVisualizerActive) {
      return;
    }
    
    visualizerAnimationId = requestAnimationFrame(draw);
    
    if (!analyser) return;
    
    const bufferLen = analyser.frequencyBinCount;
    const dataArrayFreq = new Uint8Array(bufferLen);
    const dataArrayTime = new Uint8Array(bufferLen);
    
    analyser.getByteFrequencyData(dataArrayFreq);
    analyser.getByteTimeDomainData(dataArrayTime);
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    if (width > 0 && height > 0) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    } else {
      // Defer drawing until the element is fully laid out with non-zero dimensions
      return;
    }
    
    ctx.clearRect(0, 0, width, height);
    
    // Grab theme color from settings (sync or separate)
    const syncColors = document.getElementById('syncColorsCheck')?.checked !== false;
    let activeGlowKey = 'gold';
    if (syncColors) {
      activeGlowKey = document.getElementById('glowColorSelect')?.value || 'gold';
    } else {
      activeGlowKey = document.getElementById('waveColorSelect')?.value || 'cyan';
    }
    const activeColor = colorMap[activeGlowKey] || '#fac900';
    
    let bassSum = 0;
    const bassBins = Math.max(1, Math.floor(bufferLen * 0.15));
    for (let i = 0; i < bassBins; i++) {
      bassSum += dataArrayFreq[i];
    }
    const bassAvg = bassSum / bassBins / 255.0;
    
    const waveTitle = document.getElementById('waveformTitle');
    if (waveTitle) {
      const scale = 1.0 + (bassAvg * 0.1);
      waveTitle.style.transform = `scale(${scale})`;
      waveTitle.style.transformOrigin = 'left center';
      waveTitle.style.display = 'inline-block';
      waveTitle.style.textShadow = `0 0 ${bassAvg * 15}px ${activeColor}`;
      waveTitle.style.transition = 'transform 0.04s ease-out, text-shadow 0.04s ease-out';
    }
    
    const barWidth = 3;
    const barGap = 3;
    const numBars = Math.floor(width / (barWidth + barGap)) - 2;
    const startX = (width - numBars * (barWidth + barGap)) / 2;
    
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = activeColor;
    
    const visualizerStyle = document.getElementById('visualizerStyleSelect')?.value || 'mirrored';
    
    for (let i = 0; i < numBars; i++) {
      let dataIdx;

      const startBin = 3; 
      const maxFftBin = Math.floor(bufferLen * 0.5);
      
      if (visualizerStyle === 'mirrored') {
        const half = numBars / 2;
        const distFromCenter = Math.abs(i - half);
        const percentOfHalf = distFromCenter / half;
        dataIdx = startBin + Math.floor(percentOfHalf * (maxFftBin - startBin));
      } else {
        dataIdx = startBin + Math.floor((i / numBars) * (maxFftBin - startBin));
      }
      
      const value = dataArrayFreq[dataIdx] || 0;
      const percent = value / 255;
      
      const barHeight = percent * (height * 0.7);
      const x = startX + i * (barWidth + barGap);
      const y = (height - barHeight) / 2;
      
      const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
      grad.addColorStop(0, activeColor);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }
    ctx.restore();
    
    // 2. Draw Floating Oscilloscope Sine Wave (Foreground layer)
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.shadowColor = activeColor;
    
    ctx.beginPath();
    const sliceWidth = width / bufferLen;
    let x = 0;
    
    for (let i = 0; i < bufferLen; i++) {
      const v = dataArrayTime[i] / 128.0;
      const y = (v * height) / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();
    ctx.restore();
  }
  
  draw();
}

const deckMain = document.querySelector('.deck-main');
const waveToggleBtn = document.getElementById('waveToggleBtn');
const closeWaveformBtn = document.getElementById('closeWaveformBtn');

function toggleWaveformVisualizer(forceState) {
  const nextActive = (typeof forceState === 'boolean') ? forceState : !isVisualizerActive;
  
  if (nextActive === isVisualizerActive) return;
  
  if (nextActive) {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    deckMain.classList.add('visualizer-active');
    if (waveToggleBtn) waveToggleBtn.classList.add('active');
    
    syncWaveformTrackDetails();
    
    isVisualizerActive = true;
    startWaveformAnimation();
  } else {
    deckMain.classList.remove('visualizer-active');
    if (waveToggleBtn) waveToggleBtn.classList.remove('active');
    
    isVisualizerActive = false;
    if (visualizerAnimationId) {
      cancelAnimationFrame(visualizerAnimationId);
      visualizerAnimationId = null;
    }
    
    const waveTitle = document.getElementById('waveformTitle');
    if (waveTitle) {
      waveTitle.style.transform = '';
      waveTitle.style.textShadow = '';
    }
  }
}

// Wire up events
if (waveToggleBtn) {
  waveToggleBtn.addEventListener('click', () => {
    toggleWaveformVisualizer();
  });
}

if (closeWaveformBtn) {
  closeWaveformBtn.addEventListener('click', () => {
    toggleWaveformVisualizer(false);
  });
}

// ---------- Initialization ----------
if (window.api) {
  document.body.classList.add('desktop-mode');
  if (window.api.onFullscreenState) {
    window.api.onFullscreenState((isFullscreen) => {
      if (isFullscreen) {
        document.body.classList.add('fullscreen');
      } else {
        document.body.classList.remove('fullscreen');
      }
    });
  }
}

loadPlaylistsFromStorage();
loadLyricsCacheFromStorage();
loadPlaySession();

// Load volume preference
const savedVolume = localStorage.getItem('userVolumePreference');
if (savedVolume !== null) {
  const vol = parseFloat(savedVolume);
  if (!isNaN(vol) && vol >= 0 && vol <= 1) {
    audio.volume = vol;
    volumeBar.value = vol;
  }
}

animateParticles();