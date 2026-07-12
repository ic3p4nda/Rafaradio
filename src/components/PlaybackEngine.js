/**
 * PlaybackEngine.js - High-Fidelity Audio Playback Core Engine
 * Intersects with native HTML5 Audio element and Web Audio API's AudioContext.
 * Sets up the AnalyserNode for spatial frequency analysis (3D stage reactive renderers),
 * and handles the queue state machine, history trails, shuffle, and repeat modes.
 */
export class PlaybackEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    
    // Audio Context Setup for 3D visualizers and filters
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;

    this.queue = [];
    this.currentIndex = -1;
    this.history = [];
    this.repeatMode = 'none'; // 'none' | 'one' | 'all'
    this.isShuffled = false;
    this.originalQueue = []; // stored for deshuffling

    this.listeners = {};
    this.initAudioListeners();
  }

  /**
   * Initializes or returns the audio context to comply with user-interaction policies
   */
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      
      // Setup Analyser Node
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512; // Precise frequency analysis bins
      
      // Connect pipeline
      this.source = this.audioCtx.createMediaElementSource(this.audio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    
    return this.audioCtx;
  }

  initAudioListeners() {
    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.trigger('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0
      });
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio node error:', e);
      this.trigger('error', e);
    });
  }

  // --- Queue State Management ---

  setQueue(tracks) {
    this.queue = [...tracks];
    this.originalQueue = [...tracks];
    this.currentIndex = 0;
    if (this.isShuffled) {
      this.shuffleQueue();
    }
    this.trigger('queuechange', this.queue);
  }

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    this.trigger('queuechange', this.queue);
  }

  async playTrack(track) {
    // Ensure Audio Context is active on user click
    this.getAudioContext();

    // Add track if not already in queue
    const existingIndex = this.queue.findIndex(t => t.videoId === track.videoId);
    if (existingIndex === -1) {
      this.queue.push(track);
      this.currentIndex = this.queue.length - 1;
    } else {
      this.currentIndex = existingIndex;
    }

    this.trigger('trackchange', track);
    await this.loadAndPlay(track);
  }

  async loadAndPlay(track) {
    try {
      this.audio.pause();
      let streamUrl = '';

      // Graceful Dual-Platform stream resolution:
      if (window.__TAURI__ && window.__TAURI__.invoke) {
        // Tauri Native stream proxy
        streamUrl = await window.__TAURI__.invoke('get_track_stream', { videoId: track.videoId });
      } else {
        // Express Backend Stream Fallback
        const response = await fetch(`/api/youtube-prepare-stream?videoId=${track.videoId}`);
        const data = await response.json();
        streamUrl = data.streamUrl.startsWith('/stream') ? `${window.location.origin}${data.streamUrl}` : data.streamUrl;
      }

      this.audio.src = streamUrl;
      await this.audio.play();
      this.trigger('playstate', true);
    } catch (err) {
      console.error('Failed to resolve stream / play:', err);
      this.trigger('error', err);
    }
  }

  play() {
    this.getAudioContext();
    this.audio.play();
    this.trigger('playstate', true);
  }

  pause() {
    this.audio.pause();
    this.trigger('playstate', false);
  }

  togglePlay() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  seek(seconds) {
    this.audio.currentTime = seconds;
  }

  setVolume(volume) {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  // --- Playback Navigation ---

  next() {
    if (this.queue.length === 0) return;

    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play();
      return;
    }

    this.currentIndex++;
    if (this.currentIndex >= this.queue.length) {
      if (this.repeatMode === 'all') {
        this.currentIndex = 0;
      } else {
        this.currentIndex = this.queue.length - 1;
        this.pause();
        return;
      }
    }

    const nextTrack = this.queue[this.currentIndex];
    this.trigger('trackchange', nextTrack);
    this.loadAndPlay(nextTrack);
  }

  prev() {
    if (this.queue.length === 0) return;

    // Restart track if past 3 seconds
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    this.currentIndex--;
    if (this.currentIndex < 0) {
      if (this.repeatMode === 'all') {
        this.currentIndex = this.queue.length - 1;
      } else {
        this.currentIndex = 0;
      }
    }

    const prevTrack = this.queue[this.currentIndex];
    this.trigger('trackchange', prevTrack);
    this.loadAndPlay(prevTrack);
  }

  handleTrackEnded() {
    this.history.push(this.queue[this.currentIndex]);
    this.next();
  }

  // --- Repeat & Shuffle Settings ---

  setRepeatMode(mode) {
    this.repeatMode = mode; // 'none' | 'one' | 'all'
    this.trigger('settingchange', { repeatMode: this.repeatMode });
  }

  setShuffle(shuffleState) {
    this.isShuffled = shuffleState;
    if (shuffleState) {
      this.shuffleQueue();
    } else {
      this.deshuffleQueue();
    }
    this.trigger('settingchange', { isShuffled: this.isShuffled });
  }

  shuffleQueue() {
    if (this.queue.length <= 1) return;
    const currentTrack = this.queue[this.currentIndex];

    // Fisher-Yates shuffle algorithm
    let arr = [...this.queue];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    // Keep current track at index 0 to avoid interruption
    if (currentTrack) {
      const newIdx = arr.findIndex(t => t.videoId === currentTrack.videoId);
      if (newIdx !== -1) {
        arr.splice(newIdx, 1);
        arr.unshift(currentTrack);
      }
    }

    this.queue = arr;
    this.currentIndex = 0;
    this.trigger('queuechange', this.queue);
  }

  deshuffleQueue() {
    const currentTrack = this.queue[this.currentIndex];
    this.queue = [...this.originalQueue];
    if (currentTrack) {
      this.currentIndex = this.queue.findIndex(t => t.videoId === currentTrack.videoId);
    }
    this.trigger('queuechange', this.queue);
  }

  // --- Pub/Sub Event Bus ---

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  trigger(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}
