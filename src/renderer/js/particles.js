// Particles module (Three.js field visualizer)
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

let renderer3D;
let scene;
let camera;
let cameraControls;
let particleGeometry;
let particleMaterial;
let particleField;

export const goldColor = new THREE.Color('#fac900');
export const blueColor = new THREE.Color('#008aff');
export const mixedColor = new THREE.Color();

const PARTICLE_COUNT = 1600;

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

export function initParticles(canvas) {
  renderer3D = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3D.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 600;

  const positions = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const radius = 250 + Math.random() * 550;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  particleMaterial = new THREE.PointsMaterial({
    size: 4,
    map: makeParticleSprite(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: goldColor.clone()
  });

  particleField = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleField);

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

export function updateParticlesAnimation(bassAvg, trebleAvg, energy, primaryHex, secondaryHex) {
  if (!cameraControls || !particleMaterial || !camera || !renderer3D || !scene) return;

  cameraControls.update();

  // Update sizes based on loudness energy
  particleMaterial.size = 3 + energy * 9;

  // Pulse FOV on bass
  camera.fov = 60 + bassAvg * 8;
  camera.updateProjectionMatrix();

  // Update colours live
  if (primaryHex) goldColor.set(primaryHex);
  if (secondaryHex) blueColor.set(secondaryHex);

  mixedColor.copy(goldColor).lerp(blueColor, trebleAvg);
  particleMaterial.color.copy(mixedColor);

  renderer3D.render(scene, camera);
}

export { cameraControls, camera, scene, renderer3D };
