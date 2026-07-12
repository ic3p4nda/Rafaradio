// Particles module (Three.js field visualizer)
//
// Supports multiple "particle layouts":
//   - field      : the original ambient sphere-shell starfield
//   - albumArt   : the current track's cover art rebuilt out of particles,
//                  each one jumping toward the camera on the beat
//   - vinyl      : a spinning particle record with the cover art as the
//                  center label and glowing groove rings around it
//   - starburst  : concentric pulse rings that breathe outward on the beat
//
// All layouts share one "jump" mechanic: every particle has a base resting
// position, an outward-facing normal, and a random jump amplitude. Each
// frame we push it out along its normal by (bass energy + beat pulse), then
// spring it back — that's what makes things feel like they're bouncing to
// the music instead of just pulsing uniformly.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

let renderer3D;
let scene;
let camera;
let cameraControls;

// Two independent particle "layers":
//  - structuralField: the layout's scaffolding (starfield / grooves / rings)
//  - albumField: the image-sampled particles (only used by albumArt & vinyl)
let structuralField = null;
let structuralBase = null;
let structuralNormals = null;
let structuralJumpAmp = null;

let albumField = null;
let albumBase = null;
let albumNormals = null;
let albumJumpAmp = null;

let currentLayout = 'field';
let spinAngle = 0;
let smoothedBass = 0;
let beatPulse = 0;

export const goldColor = new THREE.Color('#fac900');
export const blueColor = new THREE.Color('#008aff');
export const mixedColor = new THREE.Color();

const FIELD_COUNT = 1600;
const AMBIENT_SHELL_COUNT = 350; // sparse background shell used behind albumArt/vinyl

let sharedSpriteTexture = null;
function getSpriteTexture() {
  if (sharedSpriteTexture) return sharedSpriteTexture;
  // Higher-res canvas + a tighter, brighter core keeps individual particles
  // crisp instead of dissolving into a soft blur once they're packed dense
  // (e.g. the vinyl label), while still tapering off softly at the edges.
  const size = 128;
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = size;
  const sctx = spriteCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, size, size);
  sharedSpriteTexture = new THREE.CanvasTexture(spriteCanvas);
  sharedSpriteTexture.anisotropy = 4;
  return sharedSpriteTexture;
}

// ---------------- Layout geometry generators ----------------
// Each generator returns { positions, normals, jumpAmp } as flat Float32Arrays
// (positions/normals are xyz-interleaved, jumpAmp is one value per particle).

function genFieldPositions(count) {
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const jumpAmp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const radius = 250 + Math.random() * 550;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;

    jumpAmp[i] = 4 + Math.random() * 16;
  }

  return { positions, normals, jumpAmp };
}

function genVinylGrooves(rings, minRadius, maxRadius) {
  const positions = [];
  const normals = [];
  const jumpAmp = [];

  for (let r = 0; r < rings; r++) {
    const radius = minRadius + (maxRadius - minRadius) * (r / Math.max(1, rings - 1));
    const circumference = 2 * Math.PI * radius;
    const count = Math.max(24, Math.floor(circumference / 6));
    const offset = (r % 2 === 0) ? 0 : Math.PI / count;

    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2 + offset;
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      jumpAmp.push(1.5 + Math.random() * 5);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    jumpAmp: new Float32Array(jumpAmp)
  };
}

function genStarburstRings(ringCount, pointsPerRing, minRadius, maxRadius) {
  const positions = [];
  const normals = [];
  const jumpAmp = [];

  for (let r = 0; r < ringCount; r++) {
    const radius = minRadius + (maxRadius - minRadius) * (r / Math.max(1, ringCount - 1));
    for (let i = 0; i < pointsPerRing; i++) {
      const theta = (i / pointsPerRing) * Math.PI * 2;
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      const z = (Math.random() - 0.5) * 24;
      positions.push(x, y, z);

      const len = Math.sqrt(x * x + y * y) || 1;
      normals.push(x / len, y / len, 0); // radial outward -> rings "breathe"
      jumpAmp.push(6 + Math.random() * 26);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    jumpAmp: new Float32Array(jumpAmp)
  };
}

// ---------------- Album art sampling ----------------

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No image URL provided'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    
    // Proxy external URLs through server.js to allow pixel reading (CORS)
    if (url.startsWith('http') && !url.includes(window.location.host)) {
      img.src = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    } else {
      img.src = url;
    }
  });
}

// Samples an <img> down to a small grid and returns one {x,y,r,g,b} entry per
// pixel worth keeping. Center-crops to a square first so non-square art
// (e.g. wide YouTube thumbnails) doesn't look squished.
function sampleImageToPoints(img, gridSize, planeSize, { circleMask = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcSize = Math.min(srcW, srcH);
  const sx = (srcW - srcSize) / 2;
  const sy = (srcH - srcSize) / 2;
  ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, gridSize, gridSize);

  let data;
  try {
    data = ctx.getImageData(0, 0, gridSize, gridSize).data;
  } catch (err) {
    // Canvas got tainted — almost always a CORS-restricted image source.
    throw new Error('Cannot read pixels from this image (CORS restricted)');
  }

  const points = [];
  const half = gridSize / 2;
  const step = planeSize / gridSize;

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = (y * gridSize + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 40) continue;

      const brightness = (r + g + b) / 3;
      if (brightness < 6) continue; // skip near-black filler

      if (circleMask) {
        const dx = x - half;
        const dy = y - half;
        if (Math.sqrt(dx * dx + dy * dy) > half) continue;
      }

      const px = (x - half + 0.5) * step;
      const py = -(y - half + 0.5) * step; // flip Y: image space -> world space

      points.push({ x: px, y: py, r: r / 255, g: g / 255, b: b / 255 });
    }
  }

  return points;
}

// ---------------- Layer construction / teardown ----------------

function disposePoints(points) {
  if (!points) return;
  points.geometry.dispose();
  points.material.dispose();
  if (points.parent) points.parent.remove(points);
}

function rebuildStructuralLayer(layoutName) {
  disposePoints(structuralField);
  structuralField = null;

  let gen;
  switch (layoutName) {
    case 'vinyl':
      gen = genVinylGrooves(34, 44, 150);
      break;
    case 'starburst':
      gen = genStarburstRings(9, 140, 40, 210);
      break;
    case 'albumArt':
      gen = genFieldPositions(AMBIENT_SHELL_COUNT);
      break;
    case 'field':
    default:
      gen = genFieldPositions(FIELD_COUNT);
      break;
  }

  structuralBase = gen.positions;
  structuralNormals = gen.normals;
  structuralJumpAmp = gen.jumpAmp;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(structuralBase.slice(), 3));

  const material = new THREE.PointsMaterial({
    size: 4,
    map: getSpriteTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: goldColor.clone()
  });

  structuralField = new THREE.Points(geo, material);
  scene.add(structuralField);
  structuralField.rotation.set(0, 0, 0);
}

function rebuildAlbumLayer(layoutName, sampledPoints) {
  disposePoints(albumField);
  albumField = null;
  albumBase = null;
  albumNormals = null;
  albumJumpAmp = null;

  if (!sampledPoints || sampledPoints.length === 0) return;

  const count = sampledPoints.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const jumpAmp = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const p = sampledPoints[i];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = 0;

    colors[i * 3] = p.r;
    colors[i * 3 + 1] = p.g;
    colors[i * 3 + 2] = p.b;

    normals[i * 3] = 0;
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = 1;

    jumpAmp[i] = layoutName === 'vinyl' ? (1.5 + Math.random() * 7) : (5 + Math.random() * 22);
  }

  albumBase = positions;
  albumNormals = normals;
  albumJumpAmp = jumpAmp;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    // Vinyl label is now ~4x denser (72x72 vs 40x40 grid), so each point
    // needs to be smaller to actually resolve detail instead of just
    // overlapping into a blob. Album-art square stays as-is, just denser.
    size: layoutName === 'vinyl' ? 2.1 : 4.0,
    map: getSpriteTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });

  albumField = new THREE.Points(geo, material);
  scene.add(albumField);
  albumField.rotation.set(0, 0, 0);
}

/**
 * Switches the active particle layout. For 'albumArt' and 'vinyl', pass the
 * URL (or data: URI) of the current track's cover art — it gets sampled into
 * particles. Safe to call with no image (falls back gracefully, e.g. a
 * vinyl with grooves but no center label).
 */
export async function setParticleLayout(layoutName, imageUrl) {
  currentLayout = layoutName;
  rebuildStructuralLayer(layoutName);

  if (layoutName !== 'albumArt' && layoutName !== 'vinyl') {
    rebuildAlbumLayer(null, null);
    return;
  }

  if (!imageUrl) {
    rebuildAlbumLayer(layoutName, null);
    return;
  }

  try {
    const img = await loadImage(imageUrl);
    const sampled = layoutName === 'vinyl'
      // gridSize 72 (up from 40) roughly doubles linear resolution -> ~4x
      // the sample points for a much sharper label. planeSize 86 (up from
      // 76) grows the label so its radius (~43) reaches right up to where
      // the groove rings start (44), instead of floating small in the middle.
      ? sampleImageToPoints(img, 72, 86, { circleMask: true })
      : sampleImageToPoints(img, 64, 240, { circleMask: false });
    // Bail out if the user already switched layouts again while we awaited.
    if (currentLayout !== layoutName) return;
    rebuildAlbumLayer(layoutName, sampled);
  } catch (err) {
    console.warn('Particle layout: could not build album art particles —', err.message);
    if (currentLayout === layoutName) rebuildAlbumLayer(layoutName, null);
  }
}

export function getParticleLayout() {
  return currentLayout;
}

// ---------------- Public setup / render API (unchanged signatures) ----------------

export function initParticles(canvas) {
  renderer3D = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3D.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 600;

  rebuildStructuralLayer('field');

  cameraControls = new OrbitControls(camera, canvas);
  cameraControls.enableDamping = true;
  cameraControls.dampingFactor = 0.05;
  cameraControls.enablePan = false;
  cameraControls.minDistance = 150;
  cameraControls.maxDistance = 1100;
  cameraControls.autoRotate = true;
  cameraControls.autoRotateSpeed = 0.4;

  canvas.style.cursor = 'grab';
  canvas.addEventListener('mousedown', () => (canvas.style.cursor = 'grabbing'));
  window.addEventListener('mouseup', () => (canvas.style.cursor = 'grab'));

  return { scene, camera, renderer3D, cameraControls };
}

export function resizeParticles() {
  if (!renderer3D || !camera) return;
  renderer3D.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function applyJump(points, base, normals, jumpAmp, drive) {
  if (!points || !base) return;
  const attr = points.geometry.attributes.position;
  const arr = attr.array;
  for (let i = 0; i < jumpAmp.length; i++) {
    const i3 = i * 3;
    const amount = drive * jumpAmp[i];
    arr[i3] = base[i3] + normals[i3] * amount;
    arr[i3 + 1] = base[i3 + 1] + normals[i3 + 1] * amount;
    arr[i3 + 2] = base[i3 + 2] + normals[i3 + 2] * amount;
  }
  attr.needsUpdate = true;
}

export function updateParticlesAnimation(bassAvg, trebleAvg, energy, primaryHex, secondaryHex) {
  if (!cameraControls || !camera || !renderer3D || !scene) return;

  cameraControls.update();

  if (primaryHex) goldColor.set(primaryHex);
  if (secondaryHex) blueColor.set(secondaryHex);
  mixedColor.copy(goldColor).lerp(blueColor, trebleAvg);

  // Beat-pulse detector: fires a decaying "kick" whenever bass spikes well
  // above its own rolling average — this is what makes particles feel like
  // they're jumping to the beat rather than just tracking raw volume.
  smoothedBass += (bassAvg - smoothedBass) * 0.06;
  if (bassAvg > smoothedBass * 1.35 && bassAvg > 0.12) {
    beatPulse = 1.0;
  }
  beatPulse *= 0.86;

  const jumpDrive = bassAvg * 0.35 + beatPulse * 0.85;

  if (structuralField) {
    applyJump(structuralField, structuralBase, structuralNormals, structuralJumpAmp, jumpDrive);
    structuralField.material.color.copy(mixedColor);
    structuralField.material.size = (currentLayout === 'vinyl' || currentLayout === 'starburst')
      ? 3 + energy * 6
      : 3 + energy * 9;
  }

  if (albumField) {
    applyJump(albumField, albumBase, albumNormals, albumJumpAmp, jumpDrive);
  }

  // Spin layouts that should physically rotate.
  if (currentLayout === 'vinyl') {
    spinAngle += 0.008 + energy * 0.012;
    if (structuralField) structuralField.rotation.z = spinAngle;
    if (albumField) albumField.rotation.z = spinAngle;
  } else if (currentLayout === 'starburst') {
    spinAngle += 0.003 + energy * 0.004;
    if (structuralField) structuralField.rotation.z = spinAngle;
  }

  // Pulse FOV on bass, same as before.
  camera.fov = 60 + bassAvg * 8;
  camera.updateProjectionMatrix();

  renderer3D.render(scene, camera);
}

export { cameraControls, camera, scene, renderer3D };