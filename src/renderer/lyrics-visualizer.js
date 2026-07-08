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
    grad.addColorStop(0, 'rgba(250, 201, 0, 0.5)');
    grad.addColorStop(0.5, 'rgba(0, 138, 255, 0.16)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(c);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
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
    const maxContentWidth = current ? 1500 : 1150;
    const maxLines = current ? 2 : 1;
    const minFontSize = current ? 44 : 28;
    const paddingX = 50;
    const paddingY = 16;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');

    let fontSize = current ? 92 : 56;
    let lines = [text];

    // Shrink the font until the text wraps into at most maxLines, or we
    // hit the readability floor — whichever comes first.
    while (true) {
      mctx.font = `700 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
      lines = this.wrapLines(mctx, text, maxContentWidth);
      if (lines.length <= maxLines || fontSize <= minFontSize) break;
      fontSize -= 4;
    }

    const font = `700 ${fontSize}px 'Space Grotesk', 'Inter', sans-serif`;
    mctx.font = font;
    const widest = Math.max(...lines.map((line) => mctx.measureText(line).width));
    const lineHeight = fontSize * 1.25;

    // Canvas is sized from the text we're actually about to draw, so
    // nothing can ever run past its edge and get clipped.
    const width = Math.ceil(widest + paddingX * 2);
    const height = Math.ceil(lineHeight * lines.length + paddingY * 2);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      if (current) {
        ctx.shadowColor = 'rgba(250, 201, 0, 0.85)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#fff6d8';
        ctx.fillText(line, width / 2, y);
        // second pass deepens the glow without over-thickening the letters
        ctx.shadowBlur = 46;
        ctx.fillText(line, width / 2, y);
      } else {
        ctx.shadowColor = 'rgba(0, 138, 255, 0.3)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(226, 226, 236, 0.7)';
        ctx.fillText(line, width / 2, y);
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
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

    const baseHeight = isCurrent ? 22 : 13;
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
      sprite.userData.targetOpacity = isCurrent ? 1 : distance === 1 ? 0.55 : 0.22;
      sprite.userData.targetHeight = isCurrent ? 22 : 13;
      sprite.userData.isCurrent = isCurrent;
    }
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    const t = Date.now() * 0.001;

    // Closer camera = bigger text. Distance is measured to the stage
    // anchor, which is what OrbitControls in the host app orbits/zooms
    // around, so this tracks the user's zoom level directly.
    const distance = this.camera.position.distanceTo(this.group.position);
    const rawZoomScale = REFERENCE_DISTANCE / Math.max(distance, 1);
    const zoomScale = THREE.MathUtils.clamp(rawZoomScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

    for (const sprite of this.lineMeshes.values()) {
      const ud = sprite.userData;

      sprite.material.opacity += (ud.targetOpacity - sprite.material.opacity) * 0.12;
      sprite.position.y += (ud.targetY - sprite.position.y) * 0.14;
      sprite.position.z += ((ud.isCurrent ? 0 : -8) - sprite.position.z) * 0.12;

      const breathing = ud.isCurrent ? Math.sin(t * 1.6) * 0.4 : 0;
      const targetH = (ud.targetHeight + breathing) * zoomScale;
      const currentH = sprite.scale.y;
      const nextH = currentH + (targetH - currentH) * 0.15;
      sprite.scale.set(nextH * ud.aspect, nextH, 1);
    }

    if (this.spotlight) {
      const pulse = 1 + Math.sin(t * 1.2) * 0.06;
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