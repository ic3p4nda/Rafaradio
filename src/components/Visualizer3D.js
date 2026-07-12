import * as THREE from 'three';

/**
 * Visualizer3D.js - Audio-Reactive 3D Stage Visualizer
 * Powered by Three.js WebGL Renderer.
 * Connects to PlaybackEngine's AnalyserNode to feed custom audio parameters
 * into vertex matrices, camera drift systems, and 3D kinetic typography textures.
 */
export class Visualizer3D {
  constructor(canvasId, containerId, playbackEngine) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.engine = playbackEngine;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.particleCount = 800;

    // Lyric Planes for Kinetic 3D typography
    this.lyricTexture = null;
    this.lyricMaterial = null;
    this.lyricMesh = null;
    this.lyricCanvas = null;
    this.lyricCtx = null;
    this.currentLyrics = [];
    this.activeLyricIndex = -1;

    // Animation states
    this.lyricScale = 1.0;
    this.targetLyricScale = 1.0;
    this.lyricAlpha = 0.0;
    this.targetLyricAlpha = 0.0;
    
    this.animationFrameId = null;
    this.resizeObserver = null;

    this.init();
  }

  init() {
    if (!this.canvas) return;

    // 1. Initialize Scene, Camera & WebGL Renderer
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030307, 0.015);

    const width = this.container ? this.container.clientWidth : window.innerWidth;
    const height = this.container ? this.container.clientHeight : window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 45;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Build Audio-Reactive Dust Particles
    this.buildParticleField();

    // 3. Build Kinetic 3D Typography Canvas texture
    this.buildLyricPlane();

    // 4. Bind Resize Listeners safely using ResizeObserver
    if (this.container) {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', () => this.onResize());
    }

    // 5. Start Render Animation Loop
    this.animate();
  }

  buildParticleField() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount * 3; i += 3) {
      // Spread particles in a wide spatial volume
      positions[i] = (Math.random() - 0.5) * 120;
      positions[i + 1] = (Math.random() - 0.5) * 120;
      positions[i + 2] = (Math.random() - 0.5) * 120;

      // Color spectrum (blended turquoise var(--blue) & glowing gold var(--gold))
      const blend = Math.random();
      if (blend > 0.5) {
        // Gold: #fac900
        colors[i] = 250 / 255;
        colors[i + 1] = 201 / 255;
        colors[i + 2] = 0;
      } else {
        // Cyan: #00f0ff
        colors[i] = 0;
        colors[i + 1] = 240 / 255;
        colors[i + 2] = 1.0;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Standard high-fidelity radial particle texture
    const pMaterial = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, pMaterial);
    this.scene.add(this.particles);
  }

  buildLyricPlane() {
    // Generate an offscreen canvas to render text lines dynamically as a high-perf texture
    this.lyricCanvas = document.createElement('canvas');
    this.lyricCanvas.width = 1024;
    this.lyricCanvas.height = 256;
    this.lyricCtx = this.lyricCanvas.getContext('2d');

    this.lyricTexture = new THREE.CanvasTexture(this.lyricCanvas);
    this.lyricMaterial = new THREE.MeshBasicMaterial({
      map: this.lyricTexture,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(36, 9);
    this.lyricMesh = new THREE.Mesh(geometry, this.lyricMaterial);
    this.lyricMesh.position.set(0, 0, 10);
    this.scene.add(this.lyricMesh);

    this.updateLyricTexture("No lyrics loaded");
  }

  updateLyricTexture(text, isGlow = false) {
    if (!this.lyricCtx) return;

    const ctx = this.lyricCtx;
    const w = this.lyricCanvas.width;
    const h = this.lyricCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Style text using RafaRadio Space Grotesk elegant font
    ctx.font = "bold 44px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (isGlow) {
      // Dynamic neon blur drop shadows based on sound power
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 15;
    } else {
      ctx.shadowBlur = 0;
    }

    // Outer Text Fill
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, w / 2, h / 2);
    
    this.lyricTexture.needsUpdate = true;
  }

  // --- External LRC Synced parser feed ---
  setLyrics(lyricsArray) {
    this.currentLyrics = lyricsArray;
    this.activeLyricIndex = -1;
    this.updateLyricTexture("Stage synchronized");
  }

  updateLyricTimeline(currentTime) {
    if (!this.currentLyrics || this.currentLyrics.length === 0) return;

    let foundIdx = -1;
    for (let i = 0; i < this.currentLyrics.length; i++) {
      if (currentTime >= this.currentLyrics[i].time) {
        foundIdx = i;
      } else {
        break;
      }
    }

    if (foundIdx !== -1 && foundIdx !== this.activeLyricIndex) {
      this.activeLyricIndex = foundIdx;
      const lineText = this.currentLyrics[foundIdx].text;
      
      // Trigger Kinetic animation transition: pop size and fade in
      this.lyricScale = 0.7; // shrink slightly and scale up
      this.targetLyricScale = 1.0;
      this.lyricAlpha = 0.0;
      this.targetLyricAlpha = 1.0;

      this.updateLyricTexture(lineText, true);
    }
  }

  onResize() {
    if (!this.renderer || !this.camera) return;

    const width = this.container ? this.container.clientWidth : window.innerWidth;
    const height = this.container ? this.container.clientHeight : window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  // --- Core WebGL Animation Loop ---
  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    let freqPower = 0;
    let bassGlow = 0;

    // Get real-time audio bytes from Analyser Node
    if (this.engine && this.engine.analyser) {
      const dataArray = new Uint8Array(this.engine.analyser.frequencyBinCount);
      this.engine.analyser.getByteFrequencyData(dataArray);

      // Extract raw power bands (Bass and overall volume power)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      freqPower = sum / dataArray.length;

      // Extract specific low-end bass power
      let bassSum = 0;
      for (let i = 0; i < 15; i++) {
        bassSum += dataArray[i];
      }
      bassGlow = bassSum / 15;
    }

    // 1. Slow cosmic camera rotation/drift using sin waves
    const time = Date.now() * 0.0006;
    this.camera.position.x = Math.sin(time) * 4;
    this.camera.position.y = Math.cos(time * 0.7) * 4;
    this.camera.lookAt(0, 0, 0);

    // 2. Audio-Reactive dust movement
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      const powerScaler = 0.05 + (freqPower / 255) * 0.8;

      for (let i = 0; i < this.particleCount * 3; i += 3) {
        // Float particles forward on the Z axis
        positions[i + 2] += powerScaler;
        
        // Wrap particles when they float past camera
        if (positions[i + 2] > 60) {
          positions[i + 2] = -60;
          positions[i] = (Math.random() - 0.5) * 120;
          positions[i + 1] = (Math.random() - 0.5) * 120;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.rotation.y = time * 0.03;
    }

    // 3. Kinetic interpolation for lyrics (smooth easing/scaling)
    this.lyricScale += (this.targetLyricScale - this.lyricScale) * 0.12;
    this.lyricAlpha += (this.targetLyricAlpha - this.lyricAlpha) * 0.12;

    if (this.lyricMesh) {
      // Reactive micro-scaling synced directly to bass intensity
      const bassScaleFactor = 1.0 + (bassGlow / 255) * 0.15;
      this.lyricMesh.scale.set(
        this.lyricScale * bassScaleFactor,
        this.lyricScale * bassScaleFactor,
        1.0
      );
      this.lyricMaterial.opacity = this.lyricAlpha;

      // Soft vertical floating offset
      this.lyricMesh.position.y = Math.sin(time * 2.0) * 1.2;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    // Clean up textures and buffers from GPU memory
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.lyricTexture) {
      this.lyricTexture.dispose();
    }
    if (this.lyricMaterial) {
      this.lyricMaterial.dispose();
    }
  }
}
