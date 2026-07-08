/**
 * Three.js Lyrics Visualizer
 *
 * Renders lyrics as a small "singing stage" floating in the same 3D space as
 * the particle field: the current line, front and center, big and bright,
 * with a couple of neighboring lines above/below for context. Every line is
 * a camera-facing sprite (THREE.Sprite billboards automatically), so it's
 * always readable no matter how the user has orbited the camera — no
 * extruded 3D letters that turn into unreadable blocks from the side.
 */

import * as THREE from 'three';

export function normalizeLyricLines(lyricsArray) {
  if (!Array.isArray(lyricsArray)) return [];

  return lyricsArray
    .map((line) => {
      if (typeof line === 'string') return line.trim();
      if (line && typeof line === 'object') {
        const text = line.text ?? line.lyric ?? line.content ?? line.line ?? '';
        return typeof text === 'string' ? text.trim() : '';
      }
      return '';
    })
    .filter((line) => line.length > 0);
}

// How many lines of context to show above/below the current line.
// Total visible lines on stage = VISIBLE_RADIUS * 2 + 1.
const VISIBLE_RADIUS = 2;
const SLOT_SPACING = 15; // vertical distance between stacked lines, world units
const STAGE_ANCHOR = new THREE.Vector3(0, 0, 0);

// Camera-zoom-responsive text sizing. At REFERENCE_DISTANCE the text is
// drawn at its normal base size; the closer the camera gets, the bigger it
// grows (clamped so it can't blow up or shrink to nothing at the extremes).
const REFERENCE_DISTANCE = 600;
const MIN_ZOOM_SCALE = 0.65;
const MAX_ZOOM_SCALE = 2.0;

class LyricsVisualizer {
  // canvas: optional canvas element (only used if no external renderer is provided)
  // overlayEl: accepted for backwards compatibility, unused — the 3D stage is the display now
  // opts: { scene, camera, renderer }
  constructor(canvas, overlayEl = null, opts = {}) {
    this.canvas = canvas;
    this.overlayEl = overlayEl;
    this.scene = opts.scene || null;
    this.camera = opts.camera || null;
    this.renderer = opts.renderer || null;
    this._external = !!opts.scene || !!opts.renderer;

    this.currentLyricIndex = -1;
    this.animationFrameId = null;
    this.initialized = false;
    this.lyricsLines = [];
    this._visible = false;
    this.bassAvg = 0;

    // Load customization settings from localStorage or fallback to defaults
    this.textSettings = {
      fontFamily: "'Space Grotesk', 'Inter', sans-serif",
      glowColor: "gold",
      textSize: 1.0,
      bounceIntensity: 1.0,
      showSpotlight: true
    };
    try {
      const saved = localStorage.getItem('lyricsTextSettings');
      if (saved) {
        this.textSettings = { ...this.textSettings, ...JSON.parse(saved) };
      }
    } catch (e) {}

    // Kept as `lineMeshes` for backwards compatibility with callers that
    // iterate it directly — the values are THREE.Sprite instances now.
    this.lineMeshes = new Map();

    this.group = null;
    this.spotlight = null;
    this._resizeHandler = null;

    this.init();
  }

  init() {
    if (this.initialized) return;

    if (!this.scene) {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05050a);
    }

    if (!this.camera) {
      this.camera = new THREE.PerspectiveCamera(
        75,
        (this.canvas?.clientWidth || window.innerWidth) / (this.canvas?.clientHeight || window.innerHeight),
        0.1,
        2000
      );
      this.camera.position.z = 400;
    }

    if (!this.renderer && this.canvas) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
      });
      this.renderer.setSize(this.canvas.clientWidth || 640, this.canvas.clientHeight || 400);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    // Everything lives under one group anchored at the center of the
    // particle field, so it reads as a stage sitting in that space.
    this.group = new THREE.Group();
    this.group.position.copy(STAGE_ANCHOR);
    this.scene.add(this.group);

    this.spotlight = this.createGlowSprite();
    this.spotlight.scale.set(240, 240, 1);
    this.spotlight.position.set(0, 0, -25);
    this.group.add(this.spotlight);

    this._resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this._resizeHandler);

    this.animate();
    this.initialized = true;
  }

  // Soft radial gradient sprite used as a "stage light" glow behind the text.
  createGlowSprite() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    
    let col1 = 'rgba(250, 201, 0, 0.5)';
    let col2 = 'rgba(0, 138, 255, 0.16)';
    
    const color = this.textSettings?.glowColor || 'gold';
    if (color === 'cyan') {
      col1 = 'rgba(0, 240, 255, 0.5)';
      col2 = 'rgba(0, 80, 255, 0.16)';
    } else if (color === 'magenta') {
      col1 = 'rgba(255, 0, 150, 0.5)';
      col2 = 'rgba(120, 0, 255, 0.16)';
    } else if (color === 'green') {
      col1 = 'rgba(50, 255, 0, 0.5)';
      col2 = 'rgba(0, 150, 100, 0.16)';
    } else if (color === 'white') {
      col1 = 'rgba(255, 255, 255, 0.4)';
      col2 = 'rgba(100, 100, 120, 0.12)';
    }
    
    grad.addColorStop(0, col1);
    grad.addColorStop(0.5, col2);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(c);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.userData.baseScale = 240;
    return sprite;
  }

  // Wraps text into lines that each fit within maxWidth at the ctx's current font.
  wrapLines(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [text];
  }

  // Renders one lyric line to a canvas texture. Current line gets bigger,
  // brighter text with a glow; context lines are smaller and dimmer.
  // Long lines shrink and/or wrap onto extra lines rather than clipping —
  // the canvas is always sized to fit whatever ends up drawn on it.
  buildLineTexture(text, { current = false } = {}) {
    const scale = this.textSettings.textSize;
    const maxContentWidth = (current ? 1500 : 1150) * Math.max(1, scale);
    const maxLines = current ? 2 : 1;
    const minFontSize = (current ? 44 : 28) * scale;
    const paddingX = 60;
    const paddingY = 24;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');

    const fontFamily = this.textSettings.fontFamily;
    let fontSize = (current ? 92 : 56) * scale;
    let lines = [text];

    // Shrink the font until the text wraps into at most maxLines, or we
    // hit the readability floor — whichever comes first.
    while (true) {
      mctx.font = `700 ${fontSize}px ${fontFamily}`;
      lines = this.wrapLines(mctx, text, maxContentWidth);
      if (lines.length <= maxLines || fontSize <= minFontSize) break;
      fontSize -= 4 * scale;
    }

    const font = `700 ${fontSize}px ${fontFamily}`;
    mctx.font = font;
    const widest = Math.max(...lines.map((line) => mctx.measureText(line).width));
    const lineHeight = fontSize * 1.3;

    // Canvas is sized from the text we're actually about to draw, so
    // nothing can ever run past its edge and get clipped.
    const width = Math.ceil(widest + paddingX * 2);
    const height = Math.ceil(lineHeight * lines.length + paddingY * 2);

    const canvas = document.createElement('canvas');
    const dpr = 2.5; // Scale up the canvas size for high-DPI razor sharpness
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = current ? '0.5px' : '1.5px';
    }

    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      if (current) {
        // Dynamic Glowing 3D vertical gradient text based on glowColor
        let shadowColor = 'rgba(250, 180, 0, 0.9)';
        let gradStart = '#ffffff';
        let gradMid = '#fff6d8';
        let gradEnd = '#ffc000';
        
        const gColor = this.textSettings.glowColor;
        if (gColor === 'cyan') {
          shadowColor = 'rgba(0, 240, 255, 0.95)';
          gradStart = '#ffffff';
          gradMid = '#e3fdff';
          gradEnd = '#00d2ff';
        } else if (gColor === 'magenta') {
          shadowColor = 'rgba(255, 0, 150, 0.95)';
          gradStart = '#ffffff';
          gradMid = '#ffe6f5';
          gradEnd = '#ff0096';
        } else if (gColor === 'green') {
          shadowColor = 'rgba(50, 255, 0, 0.9)';
          gradStart = '#ffffff';
          gradMid = '#f0fff0';
          gradEnd = '#2bff00';
        } else if (gColor === 'white') {
          shadowColor = 'rgba(255, 255, 255, 0.6)';
          gradStart = '#ffffff';
          gradMid = '#e2e2ec';
          gradEnd = '#a0a0b0';
        }
        
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 24 * scale;
        
        const grad = ctx.createLinearGradient(0, y - fontSize * 0.6, 0, y + fontSize * 0.6);
        grad.addColorStop(0, gradStart);
        grad.addColorStop(0.35, gradMid);
        grad.addColorStop(1, gradEnd);
        ctx.fillStyle = grad;
        ctx.fillText(line, width / 2, y);

        // second pass deepens the glow without over-thickening the letters
        ctx.shadowBlur = 40 * scale;
        ctx.fillText(line, width / 2, y);
      } else {
        // Translucent soft context text with themed tint
        let shadowColor = 'rgba(0, 138, 255, 0.2)';
        let gradStart = 'rgba(255, 255, 255, 0.75)';
        let gradEnd = 'rgba(160, 195, 255, 0.45)';
        
        const gColor = this.textSettings.glowColor;
        if (gColor === 'cyan') {
          shadowColor = 'rgba(0, 200, 255, 0.25)';
          gradStart = 'rgba(255, 255, 255, 0.8)';
          gradEnd = 'rgba(160, 240, 255, 0.45)';
        } else if (gColor === 'magenta') {
          shadowColor = 'rgba(255, 0, 150, 0.25)';
          gradStart = 'rgba(255, 255, 255, 0.8)';
          gradEnd = 'rgba(255, 180, 230, 0.45)';
        } else if (gColor === 'green') {
          shadowColor = 'rgba(100, 255, 0, 0.2)';
          gradStart = 'rgba(255, 255, 255, 0.8)';
          gradEnd = 'rgba(200, 255, 180, 0.4)';
        } else if (gColor === 'white') {
          shadowColor = 'rgba(255, 255, 255, 0.15)';
          gradStart = 'rgba(255, 255, 255, 0.7)';
          gradEnd = 'rgba(200, 200, 210, 0.4)';
        }
        
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 10 * scale;
        
        const grad = ctx.createLinearGradient(0, y - fontSize * 0.5, 0, y + fontSize * 0.5);
        grad.addColorStop(0, gradStart);
        grad.addColorStop(1, gradEnd);
        ctx.fillStyle = grad;
        ctx.fillText(line, width / 2, y);
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { texture, aspect: width / height };
  }

  async displayLyrics(lyricsArray) {
    const safeLyrics = normalizeLyricLines(lyricsArray);
    this.lyricsLines = safeLyrics;
    console.log('displayLyrics() called with', this.lyricsLines.length, 'lines');

    // Clear any previously staged lines/textures.
    for (const [i, sprite] of Array.from(this.lineMeshes.entries())) {
      this.group.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this.lineMeshes.delete(i);
    }
    this.currentLyricIndex = -1;

    // Put the first line up on stage immediately so there's something to
    // see as soon as lyrics are toggled on, even before playback starts.
    if (this.lyricsLines.length > 0) {
      this.updateCurrentLyric(0);
    }
  }

  getOrCreateSprite(index) {
    if (this.lineMeshes.has(index)) return this.lineMeshes.get(index);

    const text = this.lyricsLines[index];
    if (!text) return null;

    const isCurrent = index === this.currentLyricIndex;
    const { texture, aspect } = this.buildLineTexture(text, { current: isCurrent });

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);

    const baseHeight = isCurrent ? 26 : 15.5;
    sprite.userData = {
      index,
      isCurrentTexture: isCurrent,
      aspect,
      targetOpacity: 0,
      targetHeight: baseHeight,
      targetY: 0,
    };

    // Slot relative to the current line: negative = above (earlier lines),
    // positive = below (upcoming lines).
    const slot = index - Math.max(this.currentLyricIndex, 0);
    const targetY = -slot * SLOT_SPACING;
    // Start slightly further out than the target so it visibly slides in
    // rather than popping into place.
    sprite.position.set(0, targetY + (slot >= 0 ? 6 : -6), -Math.abs(slot) * 4);
    sprite.scale.set(baseHeight * aspect, baseHeight, 1);

    this.group.add(sprite);
    this.lineMeshes.set(index, sprite);
    return sprite;
  }

  get visible() {
    return this._visible;
  }

  set visible(val) {
    this._visible = !!val;
    for (const sprite of this.lineMeshes.values()) {
      if (this._visible) {
        const isCurrent = sprite.userData.isCurrent;
        const slot = sprite.userData.index - this.currentLyricIndex;
        const distance = Math.abs(slot);
        sprite.userData.targetOpacity = isCurrent ? 1 : distance === 1 ? 0.55 : 0.22;
      } else {
        sprite.userData.targetOpacity = 0;
      }
    }
  }

  updateCurrentLyric(index) {
    if (index < 0 || index >= this.lyricsLines.length) return;

    this.currentLyricIndex = index;

    const start = Math.max(0, index - VISIBLE_RADIUS);
    const end = Math.min(this.lyricsLines.length - 1, index + VISIBLE_RADIUS);

    // Fade out and remove sprites that fell outside the visible window.
    for (const [i, sprite] of Array.from(this.lineMeshes.entries())) {
      if (i < start || i > end) {
        sprite.userData.targetOpacity = 0;
        setTimeout(() => {
          if (this.lineMeshes.has(i) && this.lineMeshes.get(i) === sprite) {
            this.group.remove(sprite);
            sprite.material.map?.dispose();
            sprite.material.dispose();
            this.lineMeshes.delete(i);
          }
        }, 450);
      }
    }

    for (let i = start; i <= end; i++) {
      const sprite = this.getOrCreateSprite(i);
      if (!sprite) continue;

      const isCurrent = i === index;
      // If a sprite was created as context text and has now become the
      // current line (or vice versa), rebuild its texture at the right
      // size/brightness for crisp readability.
      if (sprite.userData.isCurrentTexture !== isCurrent) {
        const { texture, aspect } = this.buildLineTexture(this.lyricsLines[i], { current: isCurrent });
        sprite.material.map?.dispose();
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
        sprite.userData.isCurrentTexture = isCurrent;
        sprite.userData.aspect = aspect;
      }

      const slot = i - index;
      const distance = Math.abs(slot);
      sprite.userData.targetY = -slot * SLOT_SPACING;
      
      if (this._visible) {
        sprite.userData.targetOpacity = isCurrent ? 1 : distance === 1 ? 0.55 : 0.22;
      } else {
        sprite.userData.targetOpacity = 0;
      }
      
      sprite.userData.targetHeight = isCurrent ? 26 : 15.5;
      sprite.userData.isCurrent = isCurrent;
    }
  }

  updateBass(bassAvg) {
    this.bassAvg = bassAvg;
  }

  updateSettings(newSettings) {
    this.textSettings = { ...this.textSettings, ...newSettings };
    localStorage.setItem('lyricsTextSettings', JSON.stringify(this.textSettings));

    // Recreate/update spotlight gradient
    if (this.spotlight) {
      this.group.remove(this.spotlight);
      this.spotlight.material.map?.dispose();
      this.spotlight.material.dispose();
      
      this.spotlight = this.createGlowSprite();
      this.spotlight.scale.set(240, 240, 1);
      this.spotlight.position.set(0, 0, -25);
      this.group.add(this.spotlight);
    }

    // Force reconstruct all loaded sprite textures to match the new scale, font, and glow colors
    for (const [i, sprite] of Array.from(this.lineMeshes.entries())) {
      const isCurrent = i === this.currentLyricIndex;
      const { texture, aspect } = this.buildLineTexture(this.lyricsLines[i], { current: isCurrent });
      sprite.material.map?.dispose();
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
      sprite.userData.aspect = aspect;
    }
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    const t = Date.now() * 0.001;
    const bass = this.bassAvg || 0;
    const bounceMult = this.textSettings.bounceIntensity !== undefined ? this.textSettings.bounceIntensity : 1.0;

    // Bounce the entire lyrics stage group up and down vertically with the bass beat!
    // STAGE_ANCHOR is (0, 0, 0). This models a real physics subwoofer rattle.
    const targetGroupY = STAGE_ANCHOR.y + bass * 14.0 * bounceMult;
    this.group.position.y += (targetGroupY - this.group.position.y) * 0.25;

    for (const sprite of this.lineMeshes.values()) {
      const ud = sprite.userData;

      sprite.material.opacity += (ud.targetOpacity - sprite.material.opacity) * 0.12;
      sprite.position.y += (ud.targetY - sprite.position.y) * 0.14;
      sprite.position.z += ((ud.isCurrent ? 0 : -8) - sprite.position.z) * 0.12;

      // Idle breathing cycle + direct rhythmic bass scale bump!
      // Active lines jump more aggressively, context lines swell in support.
      const breathing = ud.isCurrent ? Math.sin(t * 1.6) * 0.4 : 0;
      const bassBump = ud.isCurrent ? (bass * 8.5 * bounceMult) : (bass * 3.5 * bounceMult);

      const targetH = ud.targetHeight + breathing + bassBump;
      const currentH = sprite.scale.y;
      const nextH = currentH + (targetH - currentH) * 0.15;
      sprite.scale.set(nextH * ud.aspect, nextH, 1);
    }

    if (this.spotlight) {
      const targetSpotlightOpacity = (this._visible && this.textSettings.showSpotlight) ? 1 : 0;
      this.spotlight.material.opacity += (targetSpotlightOpacity - this.spotlight.material.opacity) * 0.12;

      // Spotlight pulses gently with time and flares dramatically on bass hits!
      const pulse = 1 + Math.sin(t * 1.2) * 0.06 + bass * 0.45;
      this.spotlight.scale.set(this.spotlight.userData.baseScale * pulse, this.spotlight.userData.baseScale * pulse, 1);
    }

    if (!this._external && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onWindowResize() {
    if (!this.camera || !this.renderer || !this.canvas) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }

    for (const [i, sprite] of Array.from(this.lineMeshes.entries())) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this.group?.remove(sprite);
      this.lineMeshes.delete(i);
    }

    if (this.spotlight) {
      this.spotlight.material.map?.dispose();
      this.spotlight.material.dispose();
    }

    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }

    if (!this._external && this.renderer) {
      this.renderer.dispose();
    }
  }
}

export default LyricsVisualizer;