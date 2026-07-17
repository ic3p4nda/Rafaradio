// Client-side application coordinator
import { 
  playlist, 
  currentIndex, 
  activeTrackLoadId, 
  playbackRetryCount, 
  isShuffle, 
  repeatMode, 
  shuffleHistory, 
  shuffleQueue, 
  playlists, 
  currentViewedPlaylist, 
  trackToAddToPlaylist, 
  preloadedStreams, 
  lyricsCache,
  incrementTrackLoadId,
  setPlaybackRetryCount,
  setCurrentIndex,
  setCurrentViewedPlaylist,
  setTrackToAddToPlaylist,
  setPlaylists,
  setIsShuffle,
  setRepeatMode,
  getTrackKey,
  isSameTrack,
  savePlaylistsToStorage,
  loadPlaylistsFromStorage,
  savePlaySession,
  loadLyricsCacheFromStorage,
  saveLyricsCacheToStorage,
  queuePrefetch,
  resetShuffle,
  generateShuffleQueue
} from './state.js';

import { 
  audio, 
  audioCtx, 
  analyser, 
  dataArray, 
  bufferLength, 
  playWithFade, 
  pauseWithFade, 
  startSleepTimer, 
  clearSleepTimer, 
  sleepTimerEndTime 
} from './audio.js';

import { 
  initParticles, 
  resizeParticles, 
  updateParticlesAnimation, 
  cameraControls,
  goldColor,
  blueColor,
  scene,
  camera,
  renderer3D,
  setParticleLayout,
  getParticleLayout
} from './particles.js';

import { 
  lyricsVisible, 
  setLyricsVisible, 
  preloadLyrics, 
  initLyricsVisualizer, 
  fetchAndDisplayLyrics, 
  lyricsVisualizer, 
  lyricsSyncController 
} from './lyrics.js';

import { 
  escapeHtml, 
  renderPlaylistsList, 
  renderPlaylistDetail 
} from './playlists.js';

import { 
  renderCloudResults 
} from './cloud.js';

import { 
  playTickSound, 
  registerKeyboardShortcuts 
} from './controls.js';

import BpmDetector from './bpm-detector.js';

// DOM elements
let playBtn, prevBtn, nextBtn, shuffleBtn, repeatBtn;
let seekBar, trackTime, volumeBar;
let trackTitle, trackArtist, disc, discArt, coverBackdrop;
let minBtn, maxBtn, closeBtn, titleMiniPlayerBtn, miniPlayerToggleBtn;
let waveToggleBtn, closeWaveformBtn, waveformPanel, waveformCanvas, waveformTitle, waveformArtist;
let cloudToggle, cloudPanel, cloudSearchForm, cloudSearchInput, cloudStatus, cloudResultsEl;
let playlistToggle, playlistPanel, playlistsListView, playlistsListHeader, playlistsListEl;
let playlistDetailView, playlistDetailHeader, playlistDetailTitle, playlistPlayAllBtn, addActiveTrackBtn, deletePlaylistBtn, playlistTracksListEl;
let addToPlaylistModal, closeModalBtn, modalPlaylistsList, newPlaylistForm, newPlaylistInput, newPlaylistSave, newPlaylistCancel;
let importPlaylistBtn, importPlaylistForm, importPlaylistInput, importPlaylistStatus, importPlaylistSave, importPlaylistCancel;
let importLikedSongsBtn, importLikedForm, importLikedAuthBtn, importLikedCancel, importLikedStatus;
let settingsToggle, settingsPanel, fontSelect, glowColorSelect, textSizeSlider, textSizeVal, bounceSlider, bounceVal;
let spotlightToggleCheck, discToggleCheck, syncColorsCheck, waveColorSelect, visualizerStyleSelect;
let particleColor1Select, particleColor2Select, driftSpeedSlider, driftSpeedVal, playbackSpeedSelect, sleepTimerSelect, sleepTimerRemaining, crossfadeToggleCheck;
let waveformColorGroup, lyricsOverlay, lyricsStatus, lyricsRefresh, lyricsToggle, beatSyncToggleCheck, particleLayoutSelect;

let isVisualizerActive = false;
let visualizerAnimationId = null;
const bpmDetector = new BpmDetector();

const colorMap = {
  gold: '#fac900',
  cyan: '#00f0ff',
  magenta: '#ff007f',
  green: '#39ff14',
  white: '#ffffff'
};

const PARTICLE_COLORS_MAP = {
  gold: '#fac900',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  green: '#39ff14',
  white: '#ffffff',
  red: '#ff3333',
  blue: '#008aff',
  purple: '#9d00ff',
  orange: '#ff6c00'
};

// Micro spectrum canvas for the MP3 Player LCD screen
let miniSpectrumCanvas = null;
let miniSpectrumCtx = null;

export function initApp() {
  console.log('Initializing RafaRadio Applet...');
  
  // Setup dynamic blurred liquid blobs for the Liquid Glass Theme
  setupLiquidGlassBackground();

  // Query DOM elements
  playBtn = document.getElementById('playBtn');
  prevBtn = document.getElementById('prevBtn');
  nextBtn = document.getElementById('nextBtn');
  shuffleBtn = document.getElementById('shuffleBtn');
  repeatBtn = document.getElementById('repeatBtn');
  seekBar = document.getElementById('seekBar');
  trackTime = document.getElementById('trackTime');
  volumeBar = document.getElementById('volumeBar');
  trackTitle = document.getElementById('trackTitle');
  trackArtist = document.getElementById('trackArtist');
  disc = document.getElementById('disc');
  discArt = document.getElementById('discArt');
  coverBackdrop = document.getElementById('coverBackdrop');
  
  minBtn = document.getElementById('minBtn');
  maxBtn = document.getElementById('maxBtn');
  closeBtn = document.getElementById('closeBtn');
  titleMiniPlayerBtn = document.getElementById('titleMiniPlayerBtn');
  miniPlayerToggleBtn = document.getElementById('miniPlayerToggleBtn');
  
  waveToggleBtn = document.getElementById('waveToggleBtn');
  closeWaveformBtn = document.getElementById('closeWaveformBtn');
  waveformPanel = document.getElementById('waveformPanel');
  waveformCanvas = document.getElementById('waveformCanvas');
  waveformTitle = document.getElementById('waveformTitle');
  waveformArtist = document.getElementById('waveformArtist');
  
  cloudToggle = document.getElementById('cloudToggle');
  cloudPanel = document.getElementById('cloudPanel');
  cloudSearchForm = document.getElementById('cloudSearchForm');
  cloudSearchInput = document.getElementById('cloudSearchInput');
  cloudStatus = document.getElementById('cloudStatus');
  cloudResultsEl = document.getElementById('cloudResults');
  
  playlistToggle = document.getElementById('playlistToggle');
  playlistPanel = document.getElementById('playlistPanel');
  playlistsListView = document.getElementById('playlistsListView');
  playlistsListHeader = document.getElementById('playlistsListHeader');
  playlistsListEl = document.getElementById('playlistsList');
  
  playlistDetailView = document.getElementById('playlistDetailView');
  playlistDetailHeader = document.getElementById('playlistDetailHeader');
  playlistDetailTitle = document.getElementById('playlistDetailTitle');
  playlistPlayAllBtn = document.getElementById('playlistPlayAllBtn');
  addActiveTrackBtn = document.getElementById('addActiveTrackBtn');
  deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
  playlistTracksListEl = document.getElementById('playlistTracksList');
  
  addToPlaylistModal = document.getElementById('addToPlaylistModal');
  closeModalBtn = document.getElementById('closeModalBtn');
  modalPlaylistsList = document.getElementById('modalPlaylistsList');
  newPlaylistForm = document.getElementById('newPlaylistForm');
  newPlaylistInput = document.getElementById('newPlaylistInput');
  newPlaylistSave = document.getElementById('newPlaylistSave');
  newPlaylistCancel = document.getElementById('newPlaylistCancel');
  
  importPlaylistBtn = document.getElementById('importPlaylistBtn');
  importPlaylistForm = document.getElementById('importPlaylistForm');
  importPlaylistInput = document.getElementById('importPlaylistInput');
  importPlaylistStatus = document.getElementById('importPlaylistStatus');
  importPlaylistSave = document.getElementById('importPlaylistSave');
  importPlaylistCancel = document.getElementById('importPlaylistCancel');
  
  importLikedSongsBtn = document.getElementById('importLikedSongsBtn');
  importLikedForm = document.getElementById('importLikedForm');
  importLikedAuthBtn = document.getElementById('importLikedAuthBtn');
  importLikedCancel = document.getElementById('importLikedCancel');
  importLikedStatus = document.getElementById('importLikedStatus');
  
  settingsToggle = document.getElementById('settingsToggle');
  settingsPanel = document.getElementById('settingsPanel');
  fontSelect = document.getElementById('fontSelect');
  glowColorSelect = document.getElementById('glowColorSelect');
  textSizeSlider = document.getElementById('textSizeSlider');
  textSizeVal = document.getElementById('textSizeVal');
  bounceSlider = document.getElementById('bounceSlider');
  bounceVal = document.getElementById('bounceVal');
  spotlightToggleCheck = document.getElementById('spotlightToggleCheck');
  discToggleCheck = document.getElementById('discToggleCheck');
  syncColorsCheck = document.getElementById('syncColorsCheck');
  waveColorSelect = document.getElementById('waveColorSelect');
  visualizerStyleSelect = document.getElementById('visualizerStyleSelect');
  particleLayoutSelect = document.getElementById('particleLayoutSelect');
  
  particleColor1Select = document.getElementById('particleColor1Select');
  particleColor2Select = document.getElementById('particleColor2Select');
  driftSpeedSlider = document.getElementById('driftSpeedSlider');
  driftSpeedVal = document.getElementById('driftSpeedVal');
  playbackSpeedSelect = document.getElementById('playbackSpeedSelect');
  sleepTimerSelect = document.getElementById('sleepTimerSelect');
  sleepTimerRemaining = document.getElementById('sleepTimerRemaining');
  crossfadeToggleCheck = document.getElementById('crossfadeToggleCheck');
  waveformColorGroup = document.getElementById('waveformColorGroup');
  beatSyncToggleCheck = document.getElementById('beatSyncToggleCheck');
  
  lyricsOverlay = document.getElementById('lyricsOverlay');
  lyricsStatus = document.getElementById('lyricsStatus');
  lyricsRefresh = document.getElementById('lyricsRefresh');
  lyricsToggle = document.getElementById('lyricsToggle');
  
  // Load local state
  loadPlaylistsFromStorage();
  loadLyricsCacheFromStorage();

  // Create micro canvas inside screen-wrap for retro LCD spectrum
  setupMiniSpectrumCanvas();

  // Setup Three.js Particles scene BEFORE restoring the play session,
  // since loadPlaySession() can immediately trigger loadTrack() ->
  // updateParticlesLayoutArtwork() -> setParticleLayout(), which needs
  // the particles `scene` to already exist.
  const particleCanvas = document.getElementById('particles');
  initParticles(particleCanvas);
  window.addEventListener('resize', resizeParticles);

  // Now safe to restore/run background preload
  loadPlaySession();

  // Bind settings listeners
  initSettingsUI();
  bindSettingsUIListeners();

  // Volume restoration
  const savedVolume = localStorage.getItem('userVolumePreference');
  if (savedVolume !== null) {
    const vol = parseFloat(savedVolume);
    if (!isNaN(vol) && vol >= 0 && vol <= 1) {
      audio.volume = vol;
      volumeBar.value = vol;
    }
  }

  // Keyboard controls
  const controlInterfaces = {
    playBtn, prevBtn, nextBtn, volumeBar,
    isVisualizerActive: () => isVisualizerActive,
    toggleWaveformVisualizer,
    toggleMiniPlayer,
    cloudPanel, cloudToggle,
    playlistPanel, playlistToggle,
    newPlaylistForm, importPlaylistForm,
    settingsPanel, settingsToggle
  };
  registerKeyboardShortcuts(audio, audioCtx, controlInterfaces);

  // Audio elements synchronization
  bindAudioListeners();

  // Navigation Panel bindings
  bindPanelToggles();

  // Client library, creator forms and Youtube importer event triggers
  bindLibraryEvents();

  // Seekbar triggers
  bindSeekEvents();

  // Window titlebar IPC triggers
  bindTitlebarEvents();

  // Start anim loops
  requestAnimationFrame(animateFrame);
}

// ---------------- BACKGROUND THEME ELEMENTS ----------------
function setupLiquidGlassBackground() {
  const container = document.createElement('div');
  container.className = 'glass-theme-blobs';
  container.innerHTML = `
    <div class="glass-blob glass-blob-1"></div>
    <div class="glass-blob glass-blob-2"></div>
    <div class="glass-blob glass-blob-3"></div>
  `;
  document.body.prepend(container);
}

function setupMiniSpectrumCanvas() {
  const screenWrap = document.querySelector('.screen-wrap');
  if (!screenWrap) return;

  // Add subscreen elements
  miniSpectrumCanvas = document.createElement('canvas');
  miniSpectrumCanvas.id = 'miniSpectrum';
  miniSpectrumCanvas.className = 'mini-spectrum';
  miniSpectrumCanvas.width = 110;
  miniSpectrumCanvas.height = 36;
  screenWrap.appendChild(miniSpectrumCanvas);
  miniSpectrumCtx = miniSpectrumCanvas.getContext('2d');
}

// ---------------- AUDIO EVENT ROUTINES ----------------
function bindAudioListeners() {
  audio.addEventListener('error', async () => {
    const currentTrack = playlist[currentIndex];
    if (!currentTrack) return;

    if (currentTrack.type === 'youtube' && playbackRetryCount < 1) {
      setPlaybackRetryCount(1);
      console.warn(`Reconnecting YouTube stream for: ${currentTrack.videoId}`);
      trackTitle.textContent = 'Reconnecting...';
      preloadedStreams.delete(currentTrack.videoId);
      
      try {
        const result = await window.api.youtubePrepareStream(currentTrack.videoId, true);
        if (result && result.streamUrl) {
          audio.crossOrigin = 'anonymous';
          audio.src = result.streamUrl;
          await audio.play();
          trackTitle.textContent = currentTrack.name;
          startPlaybackUI();
          return;
        }
      } catch (err) {
        console.error('Playback retry failed:', err);
      }
    }

    stopPlaybackUI();
    setPlaybackRetryCount(0);
    if (playlist[currentIndex]) {
      trackTitle.textContent = `Playback error — ${playlist[currentIndex].name}`;
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    if (!window.isDraggingSeekBar) {
      seekBar.value = (audio.currentTime / audio.duration) * 100;
    }
    trackTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    localStorage.setItem('mine_player_queue_current_time', audio.currentTime);
  });

  audio.addEventListener('ended', () => {
    playNextTrack(true);
  });

  audio.addEventListener('canplay', () => {
    if (playbackSpeedSelect) {
      const rate = parseFloat(playbackSpeedSelect.value);
      audio.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1.0;
    }
  });
}

function formatTime(seconds) {
  if (Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------- TRANSPORT FLOW ----------------
async function loadTrack(index, autoplay = true) {
  if (index < 0 || index >= playlist.length) return;

  if (bpmDetector) {
    bpmDetector.reset();
    const bpmValEl = document.getElementById('bpmVal');
    if (bpmValEl) {
      bpmValEl.textContent = '--- BPM';
    }
  }

  setPlaybackRetryCount(0);
  const trackLoadId = incrementTrackLoadId();
  setCurrentIndex(index);
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
  if (lyricsStatus) lyricsStatus.textContent = 'No lyrics loaded';

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
        await playWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
        if (trackLoadId !== activeTrackLoadId) return;
        startPlaybackUI();
      } catch (err) {
        console.warn('Local track play failed:', err);
        if (trackLoadId !== activeTrackLoadId) return;
        stopPlaybackUI();
        trackTitle.textContent = `Playback failed — ${track.name}`;
      }
    } else {
      stopPlaybackUI();
    }

    if (trackLoadId !== activeTrackLoadId) return;
    await applyLocalMetadata(track);
    updateParticlesLayoutArtwork();

    if (lyricsVisible) {
      fetchAndDisplayLyrics(track, audio, lyricsOverlay, { scene, camera, renderer: renderer3D }, lyricsStatus, updateTrackLyricsBadgeInUI);
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
    updateParticlesLayoutArtwork();

    let streamPromise = preloadedStreams.get(track.videoId);
    if (!streamPromise) {
      streamPromise = window.api.youtubePrepareStream(track.videoId);
      preloadedStreams.set(track.videoId, streamPromise);
    }

    const result = await streamPromise;
    if (trackLoadId !== activeTrackLoadId) return;

    if (result.error) {
      preloadedStreams.delete(track.videoId);
      trackTitle.textContent = `Error — ${result.error}`;
      return;
    }

    audio.crossOrigin = 'anonymous';
    audio.src = result.streamUrl;

    if (autoplay) {
      try {
        await playWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
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
      fetchAndDisplayLyrics(track, audio, lyricsOverlay, { scene, camera, renderer: renderer3D }, lyricsStatus, updateTrackLyricsBadgeInUI);
    }
  }
}

function updateSidebarNowPlayingUI(track) {
  const sTitle = document.getElementById('sidebarTitle');
  const sArtist = document.getElementById('sidebarArtist');
  const sCover = document.getElementById('sidebarCover');
  const sPlaceholder = document.getElementById('sidebarNpPlaceholder');
  const sPlayBtn = document.getElementById('sidebarNpPlayBtn');
  
  if (sTitle) sTitle.textContent = track ? (track.name || 'Unknown Track') : 'No track loaded';
  if (sArtist) sArtist.textContent = track ? (track.artist || 'Unknown Artist') : '';
  
  if (track) {
    const thumb = track.thumbnail || null;
    if (thumb) {
      if (sCover) {
        sCover.src = thumb;
        sCover.style.display = 'block';
      }
      if (sPlaceholder) sPlaceholder.style.display = 'none';
    } else if (sCover && sCover.src && sCover.src.startsWith('data:')) {
      sCover.style.display = 'block';
      if (sPlaceholder) sPlaceholder.style.display = 'none';
    } else {
      if (sCover) sCover.style.display = 'none';
      if (sPlaceholder) sPlaceholder.style.display = 'flex';
    }
    
    if (sPlayBtn) {
      sPlayBtn.innerHTML = audio.paused ? 
        `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>` :
        `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    }
  } else {
    if (sCover) sCover.style.display = 'none';
    if (sPlaceholder) sPlaceholder.style.display = 'flex';
    if (sPlayBtn) sPlayBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  }
}

function startPlaybackUI() {
  playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  disc.classList.add('spinning');
  updateSidebarNowPlayingUI(playlist[currentIndex]);
}

function stopPlaybackUI() {
  playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  disc.classList.remove('spinning');
  updateSidebarNowPlayingUI(playlist[currentIndex]);
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

  const sCover = document.getElementById('sidebarCover');
  const sPlaceholder = document.getElementById('sidebarNpPlaceholder');

  if (meta.cover) {
    discArt.src = meta.cover;
    discArt.classList.add('visible');
    coverBackdrop.style.backgroundImage = `url("${meta.cover}")`;
    coverBackdrop.classList.add('visible');
    if (sCover) {
      sCover.src = meta.cover;
      sCover.style.display = 'block';
    }
    if (sPlaceholder) sPlaceholder.style.display = 'none';
  } else {
    discArt.classList.remove('visible');
    coverBackdrop.classList.remove('visible');
    if (sCover) sCover.style.display = 'none';
    if (sPlaceholder) sPlaceholder.style.display = 'flex';
  }
  updateSidebarNowPlayingUI(track);
}

function preloadNextTracks(currIdx) {
  const steps = [1, 2];
  steps.forEach(offset => {
    const idx = (currIdx + offset) % playlist.length;
    if (playlist[idx]) {
      queuePrefetch(playlist[idx]);
      preloadLyrics(playlist[idx], updateTrackLyricsBadgeInUI);
    }
  });
}

function updateTrackLyricsBadgeInUI(track, state) {
  const key = getTrackKey(track);
  const rows = document.querySelectorAll(`.playlist-track-row[data-track-key="${key}"]`);
  rows.forEach(row => {
    const titleEl = row.querySelector('.playlist-track-title');
    if (!titleEl) return;
    let badge = titleEl.querySelector('.lyrics-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'lyrics-badge';
      titleEl.appendChild(badge);
    }
    badge.className = `lyrics-badge ${state}`;
    if (state === 'loaded') {
      badge.textContent = 'Lyrics';
      badge.title = 'Lyrics available';
    } else if (state === 'loading') {
      badge.textContent = '...';
      badge.title = 'Loading...';
    } else {
      badge.textContent = 'No Lyrics';
      badge.title = 'No lyrics found';
    }
  });
}

// ---------------- PANEL TOGGLE AND VIEW SWITCHING ----------------
function bindPanelToggles() {
  const tabs = document.querySelectorAll('.sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      playTickSound(audioCtx);
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetTab = tab.getAttribute('data-tab');
      const panels = {
        home: document.getElementById('homePanel'),
        search: cloudPanel,
        playlist: playlistPanel,
        settings: settingsPanel
      };

      Object.entries(panels).forEach(([key, panel]) => {
        if (panel) {
          if (key === targetTab) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        }
      });

      if (targetTab === 'search') {
        if (cloudSearchInput) cloudSearchInput.focus();
      } else if (targetTab === 'playlist') {
        renderPlaylist();
      }
    });
  });

  // Sidebar Now Playing Play Button Toggle
  const sPlayBtn = document.getElementById('sidebarNpPlayBtn');
  if (sPlayBtn) {
    sPlayBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      playTickSound(audioCtx);
      if (!audio.src) return;
      try {
        if (audio.paused) {
          await playWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
          startPlaybackUI();
        } else {
          pauseWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
          stopPlaybackUI();
        }
      } catch (err) {
        console.warn('Sidebar play toggle failed:', err);
        stopPlaybackUI();
      }
    });
  }

  // Now Playing Stage Mode Toggle
  const enterStageBtn = document.getElementById('enterStageBtn');
  const exitStageBtn = document.getElementById('exitStageBtn');
  const appContainer = document.querySelector('.app');

  if (enterStageBtn) {
    enterStageBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      if (appContainer) {
        appContainer.classList.add('stage-mode-active');
        setTimeout(() => {
          resizeParticles();
          if (cameraControls) cameraControls.handleResize();
        }, 50);
      }
    });
  }

  if (exitStageBtn) {
    exitStageBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      if (appContainer) {
        appContainer.classList.remove('stage-mode-active');
        setTimeout(() => {
          resizeParticles();
          if (cameraControls) cameraControls.handleResize();
        }, 50);
      }
    });
  }

  // Lyrics Overlay Toggle and Refresh Controls
  if (lyricsToggle) {
    lyricsToggle.addEventListener('click', async () => {
      playTickSound(audioCtx);
      const nextVis = !lyricsVisible;
      setLyricsVisible(nextVis);
      lyricsToggle.classList.toggle('active', nextVis);

      if (nextVis) {
        initLyricsVisualizer(audio, lyricsOverlay, { scene, camera, renderer: renderer3D });
        if (lyricsVisualizer) {
          const savedSettings = JSON.parse(localStorage.getItem('lyricsTextSettings') || '{}');
          lyricsVisualizer.setLayoutContext(savedSettings.particleLayout || 'field');
        }
        if (playlist[currentIndex]) {
          await fetchAndDisplayLyrics(playlist[currentIndex], audio, lyricsOverlay, { scene, camera, renderer: renderer3D }, lyricsStatus, updateTrackLyricsBadgeInUI);
        }
      }
    });
  }

  if (lyricsRefresh) {
    lyricsRefresh.addEventListener('click', async () => {
      playTickSound(audioCtx);
      if (!playlist[currentIndex]) return;
      await fetchAndDisplayLyrics(playlist[currentIndex], audio, lyricsOverlay, { scene, camera, renderer: renderer3D }, lyricsStatus, updateTrackLyricsBadgeInUI);
    });
  }
}

function closeAllPanelsExcept(activePanel) {
  const tabs = document.querySelectorAll('.sidebar-tab');
  let targetTab = null;
  if (activePanel === 'cloud') targetTab = 'search';
  else if (activePanel === 'playlist') targetTab = 'playlist';
  else if (activePanel === 'settings') targetTab = 'settings';
  else if (activePanel === null) targetTab = 'home';

  tabs.forEach(tab => {
    const isTarget = tab.getAttribute('data-tab') === targetTab;
    tab.classList.toggle('active', isTarget);
  });

  const panels = {
    home: document.getElementById('homePanel'),
    search: cloudPanel,
    playlist: playlistPanel,
    settings: settingsPanel
  };

  Object.entries(panels).forEach(([key, panel]) => {
    if (panel) {
      panel.classList.toggle('active', key === targetTab);
    }
  });

  if (targetTab === 'search') {
    if (cloudSearchInput) cloudSearchInput.focus();
  } else if (targetTab === 'playlist') {
    renderPlaylist();
  }
}

// ---------------- LIBRARY ENGINE AND CREATORS ----------------
function bindLibraryEvents() {
  // Save custom lists
  createPlaylistBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    newPlaylistForm.style.display = newPlaylistForm.style.display === 'none' ? 'block' : 'none';
    if (newPlaylistForm.style.display === 'block') {
      importPlaylistForm.style.display = 'none';
      importLikedForm.style.display = 'none';
      newPlaylistInput.focus();
    }
  });

  newPlaylistSave.addEventListener('click', () => {
    playTickSound(audioCtx);
    const name = newPlaylistInput.value.trim();
    if (!name) return;
    if (playlists[name]) {
      showNotificationToast('Playlist already exists.');
      return;
    }
    playlists[name] = [];
    savePlaylistsToStorage();
    newPlaylistInput.value = '';
    newPlaylistForm.style.display = 'none';
    renderPlaylistsList(playlistsListEl, handleOpenPlaylist, handleDeletePlaylist);
  });

  newPlaylistCancel.addEventListener('click', () => {
    playTickSound(audioCtx);
    newPlaylistInput.value = '';
    newPlaylistForm.style.display = 'none';
  });

  // YouTube Playlist Importer
  importPlaylistBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    const isFormOpen = importPlaylistForm.style.display === 'block';
    importPlaylistForm.style.display = isFormOpen ? 'none' : 'block';
    if (!isFormOpen) {
      newPlaylistForm.style.display = 'none';
      importLikedForm.style.display = 'none';
      importPlaylistInput.focus();
    }
  });

  importPlaylistCancel.addEventListener('click', () => {
    playTickSound(audioCtx);
    importPlaylistInput.value = '';
    importPlaylistForm.style.display = 'none';
    importPlaylistStatus.style.display = 'none';
  });

  importPlaylistSave.addEventListener('click', async () => {
    playTickSound(audioCtx);
    const url = importPlaylistInput.value.trim();
    if (!url) return;

    importPlaylistStatus.textContent = 'Extracting playlist... Please wait.';
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
      importPlaylistStatus.textContent = 'No tracks found.';
      return;
    }

    let pName = result.title;
    let counter = 1;
    while (playlists[pName]) {
      pName = `${result.title} (${counter})`;
      counter++;
    }

    playlists[pName] = result.tracks;
    result.tracks.forEach(t => {
      if (!playlists["All Tracks"].some(x => isSameTrack(x, t))) {
        playlists["All Tracks"].push(t);
      }
    });

    savePlaylistsToStorage();
    importPlaylistInput.value = '';
    importPlaylistForm.style.display = 'none';
    importPlaylistStatus.style.display = 'none';

    handleOpenPlaylist(pName);
  });

  // Liked songs Google integration
  importLikedSongsBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    const isFormOpen = importLikedForm.style.display === 'block';
    importLikedForm.style.display = isFormOpen ? 'none' : 'block';
    if (!isFormOpen) {
      newPlaylistForm.style.display = 'none';
      importPlaylistForm.style.display = 'none';
    }
  });

  importLikedCancel.addEventListener('click', () => {
    playTickSound(audioCtx);
    importLikedForm.style.display = 'none';
    importLikedStatus.style.display = 'none';
  });

  importLikedAuthBtn.addEventListener('click', async () => {
    playTickSound(audioCtx);
    importLikedStatus.textContent = 'Initializing OAuth login...';
    importLikedStatus.style.display = 'block';
    importLikedAuthBtn.disabled = true;
    importLikedCancel.disabled = true;

    try {
      let response;
      const isElectron = navigator.userAgent.toLowerCase().includes('electron');
      if (isElectron) {
        response = await window.api.youtubeImportLikedSongs();
      } else {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
        const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
        
        const res = await fetch('/api/firebase-config');
        if (!res.ok) throw new Error('Failed to retrieve Firebase variables.');
        const config = await res.json();
        
        const app = initializeApp(config);
        const auth = getAuth(app);
        
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
        
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential || !credential.accessToken) {
          throw new Error('Could not obtain Google details.');
        }
        
        importLikedStatus.textContent = 'Retrieving liked tracks...';
        response = await window.api.youtubeImportLikedSongs(credential.accessToken);
      }

      importLikedAuthBtn.disabled = false;
      importLikedCancel.disabled = false;

      if (response.error) {
        importLikedStatus.textContent = `Error: ${response.error}`;
        return;
      }

      if (!response.tracks || response.tracks.length === 0) {
        importLikedStatus.textContent = 'Empty Liked playlist on YouTube.';
        return;
      }

      let pName = response.title || 'My YouTube Liked Songs';
      let c = 1;
      while (playlists[pName]) {
        pName = `${response.title || 'My YouTube Liked Songs'} (${c})`;
        c++;
      }

      playlists[pName] = response.tracks;
      response.tracks.forEach(t => {
        if (!playlists["All Tracks"].some(x => isSameTrack(x, t))) {
          playlists["All Tracks"].push(t);
        }
      });

      savePlaylistsToStorage();
      importLikedForm.style.display = 'none';
      importLikedStatus.style.display = 'none';
      handleOpenPlaylist(pName);

    } catch (err) {
      console.error(err);
      importLikedAuthBtn.disabled = false;
      importLikedCancel.disabled = false;
      importLikedStatus.textContent = `Failed: ${err.message || err}`;
    }
  });

  // Track buttons detail row
  playlistPlayAllBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
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
    playTickSound(audioCtx);
    if (!currentViewedPlaylist) return;
    const activeTrack = playlist[currentIndex];
    if (!activeTrack) {
      showNotificationToast('No track loaded.');
      return;
    }

    const list = playlists[currentViewedPlaylist];
    if (list.some(x => isSameTrack(x, activeTrack))) {
      showNotificationToast('Track already present in playlist.');
      return;
    }

    list.push(activeTrack);
    savePlaylistsToStorage();
    renderPlaylistDetail(
      playlistTracksListEl, playlistDetailTitle, deletePlaylistBtn,
      loadTrack, handleToggleFavorite, handleAddToAnotherPlaylist, handleRemoveTrack, updateTrackLyricsBadgeInUI
    );
    showNotificationToast(`Added "${activeTrack.name}" successfully.`);
  });

  deletePlaylistBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    if (!currentViewedPlaylist || currentViewedPlaylist === "All Tracks" || currentViewedPlaylist === "Favorites") return;
    if (confirm(`Delete the playlist "${currentViewedPlaylist}"?`)) {
      handleDeletePlaylist(currentViewedPlaylist);
    }
  });

  closeModalBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    addToPlaylistModal.style.display = 'none';
  });

  addToPlaylistModal.addEventListener('click', (e) => {
    if (e.target === addToPlaylistModal) {
      addToPlaylistModal.style.display = 'none';
    }
  });

  // Cloud YouTube Search form
  cloudSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = cloudSearchInput.value.trim();
    if (!q) return;

    cloudStatus.textContent = 'Searching...';
    cloudResultsEl.innerHTML = '';

    const results = await window.api.youtubeSearch(q);
    cloudStatus.textContent = '';
    renderCloudResults(results, cloudResultsEl, (idx) => {
      loadTrack(idx);
    });
  });

  // Left click main transport
  playBtn.addEventListener('click', async () => {
    playTickSound(audioCtx);
    if (!audio.src) return;
    try {
      if (audio.paused) {
        await playWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
        startPlaybackUI();
      } else {
        pauseWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
        stopPlaybackUI();
      }
    } catch (e) {
      console.warn('Playback toggle failed:', e);
      stopPlaybackUI();
    }
  });

  prevBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    playPrevTrack();
  });

  nextBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    playNextTrack(false);
  });

  shuffleBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    setIsShuffle(!isShuffle);
    resetShuffle();
    if (isShuffle) {
      generateShuffleQueue();
    }
    updateShuffleRepeatUI();
    savePlaySession();
  });

  repeatBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    if (repeatMode === 'off') {
      setRepeatMode('all');
    } else if (repeatMode === 'all') {
      setRepeatMode('one');
    } else {
      setRepeatMode('off');
    }
    updateShuffleRepeatUI();
    savePlaySession();
  });

  likeBtn.addEventListener('click', () => {
    playTickSound(audioCtx);
    const currentTrack = playlist[currentIndex];
    if (!currentTrack) return;
    handleToggleFavorite(currentTrack);
  });

  // Local Open Files button
  const openBtn = document.getElementById('openBtn');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      playTickSound(audioCtx);
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

        if (currentIndex === -1) {
          loadTrack(playlist.length - filePaths.length);
        }
      } else {
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
  }

  // Load session restorations
  updateShuffleRepeatUI();
}

function handleOpenPlaylist(name) {
  setCurrentViewedPlaylist(name);
  playlistsListView.style.display = 'none';
  playlistsListHeader.style.display = 'none';
  playlistDetailView.style.display = 'block';
  playlistDetailHeader.style.display = 'flex';
  renderPlaylistDetail(
    playlistTracksListEl, playlistDetailTitle, deletePlaylistBtn,
    loadTrack, handleToggleFavorite, handleAddToAnotherPlaylist, handleRemoveTrack, updateTrackLyricsBadgeInUI
  );
}

function handleDeletePlaylist(name) {
  delete playlists[name];
  savePlaylistsToStorage();
  setCurrentViewedPlaylist(null);
  playlistDetailView.style.display = 'none';
  playlistDetailHeader.style.display = 'none';
  playlistsListView.style.display = 'block';
  playlistsListHeader.style.display = 'flex';
  renderPlaylistsList(playlistsListEl, handleOpenPlaylist, handleDeletePlaylist);
}

function handleToggleFavorite(track) {
  const favIndex = playlists["Favorites"].findIndex(t => isSameTrack(t, track));
  if (favIndex !== -1) {
    playlists["Favorites"].splice(favIndex, 1);
  } else {
    playlists["Favorites"].push(track);
  }
  savePlaylistsToStorage();
  updateLikeBtn();
  renderPlaylist();
}

function handleAddToAnotherPlaylist(track) {
  setTrackToAddToPlaylist(track);
  modalPlaylistsList.innerHTML = '';
  
  const targetPlaylists = Object.keys(playlists).filter(name => name !== "All Tracks" && name !== "Favorites");
  
  if (targetPlaylists.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 16px; text-align: center; color: var(--text-dim); font-size: 11px;';
    li.textContent = 'Create a custom playlist in your Library first!';
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

function handleRemoveTrack(track, tracksList, listIndex) {
  tracksList.splice(listIndex, 1);
  savePlaylistsToStorage();
  
  const isQueueSame = playlist.length === tracksList.length + 1 && playlist.some((t) => isSameTrack(t, track));
  if (isQueueSame) {
    const removeIdx = playlist.findIndex(t => isSameTrack(t, track));
    if (removeIdx !== -1) {
      playlist.splice(removeIdx, 1);
      resetShuffle();
      if (currentIndex === removeIdx) {
        setCurrentIndex(-1);
        audio.pause();
      } else if (currentIndex > removeIdx) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  }
  renderPlaylist();
}

function renderPlaylist() {
  if (currentViewedPlaylist) {
    renderPlaylistDetail(
      playlistTracksListEl, playlistDetailTitle, deletePlaylistBtn,
      loadTrack, handleToggleFavorite, handleAddToAnotherPlaylist, handleRemoveTrack, updateTrackLyricsBadgeInUI
    );
  } else {
    renderPlaylistsList(playlistsListEl, handleOpenPlaylist, handleDeletePlaylist);
  }
  
  // Library back button
  const playlistBackBtn = document.getElementById('playlistBackBtn');
  if (playlistBackBtn) {
    playlistBackBtn.onclick = () => {
      playTickSound(audioCtx);
      setCurrentViewedPlaylist(null);
      playlistDetailView.style.display = 'none';
      playlistDetailHeader.style.display = 'none';
      playlistsListView.style.display = 'block';
      playlistsListHeader.style.display = 'flex';
      renderPlaylistsList(playlistsListEl, handleOpenPlaylist, handleDeletePlaylist);
    };
  }
}

function updateLikeBtn() {
  const currentTrack = playlist[currentIndex];
  if (!currentTrack) {
    likeBtn.classList.remove('liked');
    likeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    likeBtn.title = 'Add to Favorites';
    return;
  }
  const isFav = playlists["Favorites"].some(t => isSameTrack(t, currentTrack));
  if (isFav) {
    likeBtn.classList.add('liked');
    likeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #e0453c;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    likeBtn.title = 'Remove from Favorites';
  } else {
    likeBtn.classList.remove('liked');
    likeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    likeBtn.title = 'Add to Favorites';
  }
}

function updateShuffleRepeatUI() {
  if (isShuffle) {
    shuffleBtn.classList.add('active');
    shuffleBtn.title = 'Shuffle: On';
  } else {
    shuffleBtn.classList.remove('active');
    shuffleBtn.title = 'Shuffle: Off';
  }

  const repeatAllSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
  const repeatOneSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="11.5" y="15.5" font-size="8" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`;

  if (repeatMode === 'off') {
    repeatBtn.classList.remove('active');
    repeatBtn.innerHTML = repeatAllSvg;
    repeatBtn.title = 'Repeat: Off';
  } else if (repeatMode === 'all') {
    repeatBtn.classList.add('active');
    repeatBtn.innerHTML = repeatAllSvg;
    repeatBtn.title = 'Repeat: All';
  } else if (repeatMode === 'one') {
    repeatBtn.classList.add('active');
    repeatBtn.innerHTML = repeatOneSvg;
    repeatBtn.title = 'Repeat: One';
  }
}

function loadPlaySession() {
  const savedTracks = localStorage.getItem('mine_player_queue_tracks');
  const savedIndexStr = localStorage.getItem('mine_player_queue_index');
  const savedTime = localStorage.getItem('mine_player_queue_current_time');

  let loadedTracks = [];
  if (savedTracks) {
    try {
      loadedTracks = JSON.parse(savedTracks);
    } catch (e) {
      console.warn('Failed to parse saved session:', e);
    }
  }

  if (!loadedTracks || loadedTracks.length === 0) {
    if (playlists["All Tracks"].length > 0) {
      playlist.push(...playlists["All Tracks"]);
    }
    setCurrentIndex(-1);
    renderPlaylist();
    return;
  }

  playlist.length = 0;
  playlist.push(...loadedTracks);

  let savedIndex = -1;
  if (savedIndexStr !== null) {
    savedIndex = parseInt(savedIndexStr, 10);
  }

  renderPlaylist();

  if (savedIndex >= 0 && savedIndex < playlist.length) {
    loadTrack(savedIndex, false).then(() => {
      if (savedTime) {
        const time = parseFloat(savedTime);
        if (!isNaN(time)) {
          const setTime = () => {
            audio.currentTime = time;
          };
          if (audio.readyState >= 1) {
            setTime();
          } else {
            audio.addEventListener('loadedmetadata', setTime, { once: true });
          }
        }
      }
    });
  }
}

// ---------------- SEEK BAR INPUTS ----------------
function bindSeekEvents() {
  window.isDraggingSeekBar = false;

  seekBar.addEventListener('mousedown', () => { window.isDraggingSeekBar = true; });
  seekBar.addEventListener('touchstart', () => { window.isDraggingSeekBar = true; });
  window.addEventListener('mouseup', () => { window.isDraggingSeekBar = false; });
  window.addEventListener('touchend', () => { window.isDraggingSeekBar = false; });
  seekBar.addEventListener('change', () => { window.isDraggingSeekBar = false; });

  seekBar.addEventListener('input', () => {
    if (!audio.duration) return;
    audio.currentTime = (seekBar.value / 100) * audio.duration;
  });

  volumeBar.addEventListener('input', () => {
    audio.volume = volumeBar.value;
    localStorage.setItem('userVolumePreference', volumeBar.value);
  });
}

// ---------------- TITLEBAR LOGIC ----------------
function bindTitlebarEvents() {
  if (minBtn) {
    minBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      if (window.api && window.api.minimizeWindow) window.api.minimizeWindow();
    });
  }
  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      if (window.api && window.api.toggleFullscreenWindow) window.api.toggleFullscreenWindow();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      if (window.api && window.api.closeWindow) window.api.closeWindow();
    });
  }
  
  if (titleMiniPlayerBtn) {
    titleMiniPlayerBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      toggleMiniPlayer();
    });
  }
  if (miniPlayerToggleBtn) {
    miniPlayerToggleBtn.addEventListener('click', () => {
      playTickSound(audioCtx);
      toggleMiniPlayer();
    });
  }
}

// ---------------- TOAST ----------------
export function showNotificationToast(message) {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = 'glass-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

// ---------------- SETTINGS APPLIERS ----------------
function initSettingsUI() {
  let saved = {
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    glowColor: "gold",
    textSize: 1.0,
    bounceIntensity: 1.0,
    showSpotlight: true,
    beatSync: false,
    showDisc: true,
    syncColors: true,
    waveColor: 'cyan',
    visualizerStyle: 'mirrored',
    particleLayout: 'field',
    particleColorPrimary: 'gold',
    particleColorSecondary: 'blue',
    driftSpeed: 1.0,
    playbackSpeed: 1.0,
    sleepTimer: 0,
    crossfade: true
  };
  try {
    const savedStr = localStorage.getItem('lyricsTextSettings');
    if (savedStr) saved = { ...saved, ...JSON.parse(savedStr) };
  } catch (e) {}

  fontSelect.value = saved.fontFamily;
  glowColorSelect.value = saved.glowColor;
  textSizeSlider.value = saved.textSize;
  textSizeVal.textContent = `${parseFloat(saved.textSize).toFixed(2)}x`;
  bounceSlider.value = saved.bounceIntensity;
  bounceVal.textContent = `${parseFloat(saved.bounceIntensity).toFixed(1)}x`;
  spotlightToggleCheck.checked = !!saved.showSpotlight;

  if (particleLayoutSelect) {
    particleLayoutSelect.value = saved.particleLayout || 'field';
  }

  if (beatSyncToggleCheck) {
    beatSyncToggleCheck.checked = !!saved.beatSync;
    const bpmIndicatorRow = document.getElementById('bpmIndicatorRow');
    if (bpmIndicatorRow) {
      bpmIndicatorRow.style.display = saved.beatSync ? 'flex' : 'none';
    }
  }

  if (discToggleCheck) discToggleCheck.checked = saved.showDisc !== false;
  if (syncColorsCheck) syncColorsCheck.checked = saved.syncColors !== false;
  if (waveColorSelect) waveColorSelect.value = saved.waveColor || 'cyan';
  if (visualizerStyleSelect) visualizerStyleSelect.value = saved.visualizerStyle || 'mirrored';

  if (particleColor1Select) particleColor1Select.value = saved.particleColorPrimary || 'gold';
  if (particleColor2Select) particleColor2Select.value = saved.particleColorSecondary || 'blue';
  
  if (driftSpeedSlider) {
    driftSpeedSlider.value = saved.driftSpeed !== undefined ? saved.driftSpeed : 1.0;
    driftSpeedVal.textContent = `${parseFloat(driftSpeedSlider.value).toFixed(1)}x`;
  }
  if (playbackSpeedSelect) {
    playbackSpeedSelect.value = saved.playbackSpeed !== undefined ? saved.playbackSpeed : 1.0;
    const rate = parseFloat(playbackSpeedSelect.value);
    audio.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1.0;
  }
  if (sleepTimerSelect) {
    sleepTimerSelect.value = saved.sleepTimer !== undefined ? saved.sleepTimer : 0;
    triggerSleepTimer(parseInt(sleepTimerSelect.value));
  }
  if (crossfadeToggleCheck) {
    crossfadeToggleCheck.checked = saved.crossfade !== false;
  }

  applyGlowAndColors(saved);
  updateParticlesLayoutArtwork();
}

function bindSettingsUIListeners() {
  const settingsInputs = [
    fontSelect, glowColorSelect, textSizeSlider, bounceSlider, spotlightToggleCheck,
    beatSyncToggleCheck, discToggleCheck, syncColorsCheck, waveColorSelect, visualizerStyleSelect,
    particleColor1Select, particleColor2Select, driftSpeedSlider, playbackSpeedSelect,
    crossfadeToggleCheck, particleLayoutSelect
  ];
  settingsInputs.forEach(el => {
    if (el) el.addEventListener('change', onSettingsChanged);
  });
  
  if (textSizeSlider) textSizeSlider.addEventListener('input', onSettingsChanged);
  if (bounceSlider) bounceSlider.addEventListener('input', onSettingsChanged);
  if (driftSpeedSlider) driftSpeedSlider.addEventListener('input', onSettingsChanged);

  if (sleepTimerSelect) {
    sleepTimerSelect.addEventListener('change', () => {
      onSettingsChanged();
      triggerSleepTimer(parseInt(sleepTimerSelect.value));
    });
  }

  // Settings tabs switcher
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  const tabPanels = document.querySelectorAll('.settings-tab-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabPanels.forEach(panel => {
        const panelTab = panel.getAttribute('data-tab-panel');
        panel.classList.toggle('active', panelTab === targetTab);
      });
    });
  });
}

function triggerSleepTimer(minutes) {
  startSleepTimer(
    minutes,
    () => {
      pauseWithFade(volumeBar.value, crossfadeToggleCheck?.checked !== false);
      stopPlaybackUI();
      if (sleepTimerSelect) sleepTimerSelect.value = "0";
      showNotificationToast("Sleep timer complete: Paused playback.");
    },
    (endTime) => {
      if (!endTime) {
        sleepTimerRemaining.style.display = 'none';
        sleepTimerRemaining.textContent = '';
        return;
      }
      sleepTimerRemaining.style.display = 'block';
      const remainingMs = endTime - Date.now();
      if (remainingMs <= 0) {
        sleepTimerRemaining.style.display = 'none';
        return;
      }
      const totalSecs = Math.ceil(remainingMs / 1000);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      sleepTimerRemaining.textContent = `Pausing in ${m}:${s.toString().padStart(2, '0')}`;
    }
  );
}

function applyGlowAndColors(saved) {
  if (goldColor && PARTICLE_COLORS_MAP[saved.particleColorPrimary]) {
    goldColor.set(PARTICLE_COLORS_MAP[saved.particleColorPrimary]);
  }
  if (blueColor && PARTICLE_COLORS_MAP[saved.particleColorSecondary]) {
    blueColor.set(PARTICLE_COLORS_MAP[saved.particleColorSecondary]);
  }
  if (cameraControls && saved.driftSpeed !== undefined) {
    cameraControls.autoRotateSpeed = 0.4 * parseFloat(saved.driftSpeed);
  }
  if (waveformColorGroup && syncColorsCheck) {
    waveformColorGroup.style.display = syncColorsCheck.checked ? 'none' : 'block';
  }
  if (disc) {
    disc.style.display = saved.showDisc ? 'block' : 'none';
  }
}

async function updateParticlesLayoutArtwork() {
  const currentSavedSettings = JSON.parse(localStorage.getItem('lyricsTextSettings') || '{}');
  const layout = currentSavedSettings.particleLayout || 'field';
  const track = playlist[currentIndex];
  
  let imageUrl = null;
  if (track) {
    if (track.type === 'local') {
      imageUrl = discArt.classList.contains('visible') ? discArt.src : null;
    } else {
      imageUrl = track.thumbnail || null;
    }
  }
  
  if (lyricsVisualizer) {
    lyricsVisualizer.setLayoutContext(layout);
  }

  await setParticleLayout(layout, imageUrl);
}

function onSettingsChanged() {
  const lastSettingsStr = localStorage.getItem('lyricsTextSettings');
  let oldLayout = 'field';
  if (lastSettingsStr) {
    try {
      oldLayout = JSON.parse(lastSettingsStr).particleLayout || 'field';
    } catch (e) {}
  }

  const settings = {
    fontFamily: fontSelect.value,
    glowColor: glowColorSelect.value,
    textSize: parseFloat(textSizeSlider.value),
    bounceIntensity: parseFloat(bounceSlider.value),
    showSpotlight: spotlightToggleCheck.checked,
    beatSync: beatSyncToggleCheck ? beatSyncToggleCheck.checked : false,
    showDisc: discToggleCheck ? discToggleCheck.checked : true,
    syncColors: syncColorsCheck ? syncColorsCheck.checked : true,
    waveColor: waveColorSelect ? waveColorSelect.value : 'cyan',
    visualizerStyle: visualizerStyleSelect ? visualizerStyleSelect.value : 'mirrored',
    particleLayout: particleLayoutSelect ? particleLayoutSelect.value : 'field',
    particleColorPrimary: particleColor1Select ? particleColor1Select.value : 'gold',
    particleColorSecondary: particleColor2Select ? particleColor2Select.value : 'blue',
    driftSpeed: driftSpeedSlider ? parseFloat(driftSpeedSlider.value) : 1.0,
    playbackSpeed: playbackSpeedSelect ? parseFloat(playbackSpeedSelect.value) : 1.0,
    sleepTimer: sleepTimerSelect ? parseInt(sleepTimerSelect.value) : 0,
    crossfade: crossfadeToggleCheck ? crossfadeToggleCheck.checked : true
  };
  textSizeVal.textContent = `${settings.textSize.toFixed(2)}x`;
  bounceVal.textContent = `${settings.bounceIntensity.toFixed(1)}x`;
  if (driftSpeedVal && driftSpeedSlider) {
    driftSpeedVal.textContent = `${parseFloat(driftSpeedSlider.value).toFixed(1)}x`;
  }

  if (beatSyncToggleCheck) {
    const bpmIndicatorRow = document.getElementById('bpmIndicatorRow');
    if (bpmIndicatorRow) {
      bpmIndicatorRow.style.display = settings.beatSync ? 'flex' : 'none';
    }
    if (!settings.beatSync && bpmDetector) {
      bpmDetector.reset();
      const bpmValEl = document.getElementById('bpmVal');
      if (bpmValEl) bpmValEl.textContent = '--- BPM';
    }
  }

  localStorage.setItem('lyricsTextSettings', JSON.stringify(settings));

  if (lyricsVisualizer) {
    lyricsVisualizer.updateSettings(settings);
  }

  applyGlowAndColors(settings);

  if (oldLayout !== settings.particleLayout) {
    updateParticlesLayoutArtwork();
  }

  if (audio) {
    const rate = parseFloat(settings.playbackSpeed);
    audio.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1.0;
  }
}

// ---------------- MINI PLAYER CORE LOGIC ----------------
let isMiniPlayer = false;

function toggleMiniPlayer(forceState) {
  isMiniPlayer = (typeof forceState === 'boolean') ? forceState : !isMiniPlayer;
  
  if (isMiniPlayer) {
    document.body.classList.add('mini-player-active');
    if (titleMiniPlayerBtn) titleMiniPlayerBtn.classList.add('active');
    if (miniPlayerToggleBtn) miniPlayerToggleBtn.classList.add('active');
    closeAllPanelsExcept(null);
    toggleWaveformVisualizer(false);
  } else {
    document.body.classList.remove('mini-player-active');
    if (titleMiniPlayerBtn) titleMiniPlayerBtn.classList.remove('active');
    if (miniPlayerToggleBtn) miniPlayerToggleBtn.classList.remove('active');
  }

  if (window.api && window.api.toggleMiniPlayer) {
    window.api.toggleMiniPlayer(isMiniPlayer);
  }
}

// ---------------- WAVEFORM COMPONENT LOGIC ----------------
function syncWaveformTrackDetails() {
  if (waveformTitle && trackTitle) {
    waveformTitle.textContent = trackTitle.textContent;
  }
  if (waveformArtist && trackArtist) {
    waveformArtist.textContent = trackArtist.textContent || 'Unknown Artist';
  }
}

const trackDetailsObserver = new MutationObserver(syncWaveformTrackDetails);
const observerConfig = { childList: true, characterData: true, subtree: true };

function toggleWaveformVisualizer(forceState) {
  const nextActive = (typeof forceState === 'boolean') ? forceState : !isVisualizerActive;
  if (nextActive === isVisualizerActive) return;
  
  if (nextActive) {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    document.querySelector('.deck-main').classList.add('visualizer-active');
    if (waveToggleBtn) waveToggleBtn.classList.add('active');
    
    syncWaveformTrackDetails();
    
    // Bind MutationObserver
    if (trackTitle) trackDetailsObserver.observe(trackTitle, observerConfig);
    if (trackArtist) trackDetailsObserver.observe(trackArtist, observerConfig);
    
    isVisualizerActive = true;
    startWaveformAnimation();
  } else {
    document.querySelector('.deck-main').classList.remove('visualizer-active');
    if (waveToggleBtn) waveToggleBtn.classList.remove('active');
    
    isVisualizerActive = false;
    trackDetailsObserver.disconnect();
    
    if (visualizerAnimationId) {
      cancelAnimationFrame(visualizerAnimationId);
      visualizerAnimationId = null;
    }
    if (waveformTitle) {
      waveformTitle.style.transform = '';
      waveformTitle.style.textShadow = '';
    }
  }
}

function startWaveformAnimation() {
  function draw() {
    if (!isVisualizerActive) return;
    visualizerAnimationId = requestAnimationFrame(draw);
    
    const bufferLen = analyser.frequencyBinCount;
    const dataArrayFreq = new Uint8Array(bufferLen);
    const dataArrayTime = new Uint8Array(bufferLen);
    
    analyser.getByteFrequencyData(dataArrayFreq);
    analyser.getByteTimeDomainData(dataArrayTime);
    
    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;
    
    if (width > 0 && height > 0) {
      if (waveformCanvas.width !== width || waveformCanvas.height !== height) {
        waveformCanvas.width = width;
        waveformCanvas.height = height;
      }
    } else {
      return;
    }
    
    const ctx = waveformCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    
    const syncColors = syncColorsCheck?.checked !== false;
    let activeGlowKey = 'gold';
    if (syncColors) {
      activeGlowKey = glowColorSelect?.value || 'gold';
    } else {
      activeGlowKey = waveColorSelect?.value || 'cyan';
    }
    const activeColor = colorMap[activeGlowKey] || '#fac900';
    
    let bassSum = 0;
    const bassBins = Math.max(1, Math.floor(bufferLen * 0.15));
    for (let i = 0; i < bassBins; i++) {
      bassSum += dataArrayFreq[i];
    }
    const bassAvg = bassSum / bassBins / 255.0;
    
    if (waveformTitle) {
      const scale = 1.0 + (bassAvg * 0.1);
      waveformTitle.style.transform = `scale(${scale})`;
      waveformTitle.style.transformOrigin = 'left center';
      waveformTitle.style.display = 'inline-block';
      waveformTitle.style.textShadow = `0 0 ${bassAvg * 15}px ${activeColor}`;
      waveformTitle.style.transition = 'transform 0.04s ease-out, text-shadow 0.04s ease-out';
    }
    
    const barWidth = 3;
    const barGap = 3;
    const numBars = Math.floor(width / (barWidth + barGap)) - 2;
    const startX = (width - numBars * (barWidth + barGap)) / 2;
    
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = activeColor;
    
    const visualizerStyle = visualizerStyleSelect?.value || 'mirrored';
    
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
    
    // Draw oscilloscope line overlay
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

// ---------------- ANIMATION FRAME ENGINE ----------------
function animateFrame() {
  requestAnimationFrame(animateFrame);

  analyser.getByteFrequencyData(dataArray);

  let totalSum = 0;
  let bassSum = 0;
  let trebleSum = 0;
  for (let i = 0; i < bufferLength; i++) {
    totalSum += dataArray[i];
    if (i < 8) bassSum += dataArray[i];
    if (i >= bufferLength - 40) trebleSum += dataArray[i];
  }
  const energy = totalSum / bufferLength / 255;
  const bassAvg = bassSum / 8 / 255;
  const trebleAvg = trebleSum / 40 / 255;

  const primaryGlow = particleColor1Select ? particleColor1Select.value : 'gold';
  const secondaryGlow = particleColor2Select ? particleColor2Select.value : 'blue';

  // Run Three.js Background particles
  updateParticlesAnimation(
    bassAvg, 
    trebleAvg, 
    energy, 
    PARTICLE_COLORS_MAP[primaryGlow], 
    PARTICLE_COLORS_MAP[secondaryGlow]
  );

  // Update real-time BPM detection if beat-sync is checked and audio is playing
  if (beatSyncToggleCheck && beatSyncToggleCheck.checked && !audio.paused && bpmDetector) {
    bpmDetector.update(bassAvg);
    const detectedBpm = bpmDetector.getBpm();
    
    // Update the visualizer with the new BPM so it can adjust animation speed
    if (lyricsVisualizer) {
      lyricsVisualizer.updateSettings({ detectedBpm });
    }
    
    // Update UI indicator in real-time
    const bpmValEl = document.getElementById('bpmVal');
    if (bpmValEl) {
      bpmValEl.textContent = `${Math.round(detectedBpm)} BPM`;
    }
  }

  if (lyricsVisualizer) {
    lyricsVisualizer.updateBass(bassAvg);
  }

  // Soft disc shadow pulsation on bass in normal player
  if (disc) {
    disc.style.boxShadow = `0 0 0 3px rgba(250, 201, 0, ${0.12 + bassAvg * 0.25}), 0 0 ${
      20 + bassAvg * 40
    }px rgba(0, 138, 255, ${0.15 + bassAvg * 0.35})`;
  }

  // Draw micro backlit LCD spectrum visualizer when mini-player is on
  if (isMiniPlayer && miniSpectrumCtx) {
    drawMiniSpectrum(bassAvg);
  }
}

function drawMiniSpectrum(bassAvg) {
  const w = miniSpectrumCanvas.width;
  const h = miniSpectrumCanvas.height;
  miniSpectrumCtx.clearRect(0, 0, w, h);

  const numBands = 10;
  const barGap = 2;
  const totalGaps = barGap * (numBands - 1);
  const barWidth = (w - totalGaps) / numBands;

  miniSpectrumCtx.save();
  // Cyan glowing backlit theme
  const grad = miniSpectrumCtx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
  grad.addColorStop(0.5, 'rgba(0, 240, 255, 0.8)');
  grad.addColorStop(1, 'rgba(0, 240, 255, 1)');

  miniSpectrumCtx.fillStyle = grad;
  miniSpectrumCtx.shadowColor = 'rgba(0, 240, 255, 0.8)';
  miniSpectrumCtx.shadowBlur = 4;

  const factor = audio.paused ? 0.05 : 1.0;

  for (let i = 0; i < numBands; i++) {
    // Read frequencies from analyzer
    const idx = Math.floor((i / numBands) * (bufferLength * 0.5));
    const rawVal = dataArray[idx] || 0;
    const value = (rawVal / 255.0) * factor;

    // Introduce soft random jitter to keep it natural
    const noise = (Math.random() - 0.5) * 0.05;
    const heightPercent = Math.max(0.1, Math.min(1.0, value + noise));
    const barHeight = heightPercent * h * 0.9;

    const x = i * (barWidth + barGap);
    const y = h - barHeight;

    // Draw segmented retro LCD bars
    const segments = 6;
    const segmentHeight = barHeight / segments;
    for (let s = 0; s < segments; s++) {
      const sy = h - (s + 1) * segmentHeight;
      miniSpectrumCtx.fillRect(x, sy + 0.5, barWidth, segmentHeight - 1);
    }
  }
  miniSpectrumCtx.restore();
}

// Browser startup initialization fallback
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