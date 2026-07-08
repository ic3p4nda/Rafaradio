import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import LyricsVisualizer, { normalizeLyricLines } from './lyrics-visualizer.js';
import LyricsSyncController from './lyrics-sync.js';

// ---------- State ----------
// Each track: { type: 'local', path, name } or { type: 'youtube', videoId, name, artist, thumbnail }
const playlist = [];
let currentIndex = -1;
let activeTrackLoadId = 0;

// ---------- Elements ----------
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const openBtn = document.getElementById('openBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const trackTime = document.getElementById('trackTime');
const playlistEl = document.getElementById('playlist');
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

// ---------- Lyrics elements ----------
const lyricsToggle = document.getElementById('lyricsToggle');
const lyricsPanel = document.getElementById('lyricsPanel');
const lyricsCanvas = document.getElementById('lyricsCanvas');
const lyricsOverlay = document.getElementById('lyricsOverlay');
const lyricsStatus = document.getElementById('lyricsStatus');
const lyricsRefresh = document.getElementById('lyricsRefresh');
const lyricsClose = document.getElementById('lyricsClose');

// Lyrics state
let lyricsVisualizer = null;
let lyricsSyncController = null;
let lyricsVisible = false;

// ---------- Titlebar window controls ----------
document.getElementById('minBtn').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('maxBtn').addEventListener('click', () => window.api.toggleFullscreenWindow());
document.getElementById('closeBtn').addEventListener('click', () => window.api.closeWindow());

// ---------- Library drawer ----------
playlistToggle.addEventListener('click', () => {
  const isOpen = playlistPanel.classList.toggle('open');
  playlistToggle.textContent = isOpen ? 'Close' : 'Library';
});

// ---------- Lyrics toggle (renders into particle space) ----------
lyricsToggle.addEventListener('click', async () => {
  lyricsVisible = !lyricsVisible;
  lyricsToggle.textContent = lyricsVisible ? 'Hide Lyrics' : 'Lyrics';

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
  if (lyricsVisualizer && lyricsVisualizer.lineMeshes) {
    for (const m of lyricsVisualizer.lineMeshes.values()) {
      m.userData.targetOpacity = lyricsVisible ? 1 : 0;
    }
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
    lyricsStatus.textContent = 'Fetching lyrics...';
    console.log('Starting lyrics fetch for:', track.name, track.artist);

    const lyrics = await window.api.fetchLyrics(track.name, track.artist || '');
    console.log('Received lyrics:', lyrics?.length, 'lines');

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

    const isDemoLyrics = displayLyrics.some((line) =>
      line.includes('Lyrics could not be fetched') ||
      line.includes('watch the rhythm')
    );

    const statusText = isDemoLyrics
      ? `${lyrics.length} demo lines (for testing)`
      : `${lyrics.length} lines loaded ✓`;

    console.log('Status:', statusText);
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
  const isOpen = cloudPanel.classList.toggle('open');
  cloudToggle.textContent = isOpen ? 'Close' : 'Cloud';
  if (isOpen) cloudSearchInput.focus();
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
  playlist.push({
    type: 'youtube',
    videoId: song.videoId,
    name: song.title,
    artist: song.artist,
    thumbnail: song.thumbnail,
  });
  renderPlaylist();
  loadTrack(playlist.length - 1);
}

// ---------- Local file loading ----------
openBtn.addEventListener('click', async () => {
  const filePaths = await window.api.openAudioFiles();
  if (!filePaths.length) return;

  filePaths.forEach((filePath) => {
    playlist.push({ type: 'local', path: filePath, name: filePath.split(/[\\/]/).pop() });
  });

  renderPlaylist();

  // If nothing was playing yet, start with the first newly added track.
  if (currentIndex === -1) {
    loadTrack(playlist.length - filePaths.length);
  }
});

function renderPlaylist() {
  playlistEl.innerHTML = '';
  playlist.forEach((track, i) => {
    const li = document.createElement('li');
    const icon = track.type === 'youtube' ? '\u2601 ' : ''; // cloud glyph for streamed tracks
    li.textContent = icon + track.name;
    if (i === currentIndex) li.classList.add('active');
    li.addEventListener('click', () => loadTrack(i));
    playlistEl.appendChild(li);
  });
}

async function loadTrack(index) {
  if (index < 0 || index >= playlist.length) return;

  const trackLoadId = ++activeTrackLoadId;
  currentIndex = index;
  const track = playlist[currentIndex];

  trackTitle.textContent = track.name;
  trackArtist.textContent = track.artist || '';
  renderPlaylist();

  if (lyricsSyncController) {
    lyricsSyncController.stop();
  }
  lyricsStatus.textContent = 'No lyrics loaded';

  if (track.type === 'local') {
    audio.src = 'file://' + encodeURI(track.path.replace(/\\/g, '/'));

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

    if (trackLoadId !== activeTrackLoadId) return;
    await applyLocalMetadata(track);

    if (lyricsVisible) {
      fetchAndDisplayLyrics(track);
    }
  } else {
    trackTitle.textContent = `Loading — ${track.name}`;
    disc.classList.remove('spinning');
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

    const result = await window.api.youtubePrepareStream(track.videoId);

    if (trackLoadId !== activeTrackLoadId) return;

    if (result.error) {
      trackTitle.textContent = `Error — ${result.error}`;
      return;
    }

    audio.src = result.streamUrl;

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

    if (trackLoadId !== activeTrackLoadId) return;
    if (lyricsVisible) {
      fetchAndDisplayLyrics(track);
    }
  }
}

function startPlaybackUI() {
  playBtn.innerHTML = '&#9646;&#9646;';
  disc.classList.add('spinning');
}

function stopPlaybackUI() {
  playBtn.innerHTML = '&#9654;';
  disc.classList.remove('spinning');
}

async function applyLocalMetadata(track) {
  const meta = await window.api.getTrackMetadata(track.path);
  if (playlist[currentIndex] !== track) return;

  if (meta.title) track.name = meta.title;
  if (meta.artist) track.artist = meta.artist;

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

prevBtn.addEventListener('click', () => loadTrack(currentIndex - 1));
nextBtn.addEventListener('click', () => loadTrack(currentIndex + 1));

audio.addEventListener('ended', () => {
  if (currentIndex + 1 < playlist.length) loadTrack(currentIndex + 1);
  else stopPlaybackUI();
});

audio.addEventListener('error', () => {
  stopPlaybackUI();
  if (playlist[currentIndex]) {
    trackTitle.textContent = `Playback error — ${playlist[currentIndex].name}`;
  }
});

// ---------- Seek bar ----------
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  seekBar.value = (audio.currentTime / audio.duration) * 100;
  trackTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
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

animateParticles();