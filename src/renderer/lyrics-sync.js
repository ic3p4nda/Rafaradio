/**
 * Lyrics Sync Controller
 * Handles synchronization between audio playback and lyrics display
 */

class LyricsSyncController {
  constructor(audioElement, visualizer) {
    this.audio = audioElement;
    this.visualizer = visualizer;
    this.lyrics = [];
    this.rawLyrics = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.syncInterval = null;
    this.syncThreshold = 0.2;
    this.lastDurationUsed = null;
    this.boundMetadataHandler = null;
    this.bindAudioEvents();
  }

  bindAudioEvents() {
    if (!this.audio || this.boundMetadataHandler) return;
    this.boundMetadataHandler = () => this.onMetadataLoaded();
    this.audio.addEventListener('loadedmetadata', this.boundMetadataHandler);
    this.audio.addEventListener('durationchange', this.boundMetadataHandler);
  }

  setLyrics(lyricsArray) {
    if (lyricsArray && lyricsArray.length > 0) {
      if (typeof lyricsArray[0] === 'object' && lyricsArray[0] !== null && 'time' in lyricsArray[0]) {
        this.rawLyrics = [];
        this.lyrics = lyricsArray.map((entry) => ({
          time: entry.time,
          text: entry.text || entry.lyric || '',
        }));
      } else {
        this.rawLyrics = lyricsArray
          .filter((entry) => typeof entry === 'string' && entry.trim())
          .map((entry) => entry.trim());
        this.lyrics = [];
        this.onMetadataLoaded();
      }
    } else {
      this.rawLyrics = [];
      this.lyrics = [];
    }

    this.currentIndex = -1;
    this.updateLyricDisplay();
  }

  onMetadataLoaded() {
    if (!this.rawLyrics.length) return;

    const duration = this.getEstimatedDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;

    if (this.lastDurationUsed && Math.abs(this.lastDurationUsed - duration) < 0.25) {
      return;
    }

    this.lyrics = this.distributeTimedLyrics(this.rawLyrics);
    this.lastDurationUsed = duration;
    this.currentIndex = -1;
    this.updateLyricDisplay();
  }

  getEstimatedDuration() {
    if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }

    if (this.audio && this.audio.readyState > 0) {
      return this.audio.duration || 180;
    }

    return 180;
  }

  distributeTimedLyrics(lyricsArray) {
    const estimatedDuration = this.getEstimatedDuration();
    const safeLyrics = lyricsArray.filter((line) => typeof line === 'string' && line.trim());
    if (!safeLyrics.length) return [];

    const durations = safeLyrics.map((line, index) => {
      const trimmed = String(line).trim();
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      const punctuationBonus = /[.!?]/.test(trimmed) ? 0.7 : 0;
      const lengthBonus = Math.min(2.4, trimmed.length / 28);
      let duration = Math.max(1.6, 0.3 * wordCount + 1.0 + punctuationBonus + lengthBonus);

      if (index === 0 || index === safeLyrics.length - 1) {
        duration = Math.max(duration, 2.0);
      }

      return duration;
    });

    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    const scale = Math.max(1.2, (estimatedDuration - safeLyrics.length * 0.2) / Math.max(totalDuration, 1));
    const adjustedDurations = durations.map((duration) => duration * scale);

    let cumulativeTime = 0;
    return adjustedDurations.map((duration, index) => {
      const startTime = cumulativeTime;
      cumulativeTime += duration;
      return {
        time: startTime,
        text: safeLyrics[index],
      };
    });
  }
  
  start() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentIndex = -1;
    this.updateLyricDisplay();

    this.syncInterval = setInterval(() => {
      this.updateLyricDisplay();
    }, 100);
  }
  
  stop() {
    this.isPlaying = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  updateLyricDisplay() {
    if (!this.audio || !this.lyrics.length) return;
    if (window.isDraggingSeekBar) return;

    const currentTime = this.audio.currentTime || 0;
    const leadTime = this.syncThreshold;
    let nextIndex = -1;

    if (this.lyrics.length === 1) {
      nextIndex = 0;
    } else {
      for (let i = 0; i < this.lyrics.length; i++) {
        if (currentTime + leadTime >= this.lyrics[i].time) {
          nextIndex = i;
        } else {
          break;
        }
      }
    }

    if (nextIndex !== this.currentIndex) {
      this.currentIndex = nextIndex;

      if (this.visualizer && nextIndex >= 0) {
        this.visualizer.updateCurrentLyric(nextIndex);
      }
    }
  }
  
  seek(time) {
    if (window.isDraggingSeekBar) return;
    // Reset when seeking to recalculate current lyric
    this.currentIndex = -1;
    this.updateLyricDisplay();
  }
  
  getLyricLines() {
    // Return just the text for displaying in the visualizer
    return this.lyrics.map((l) => l.text);
  }
  
  getCurrentLyric() {
    if (this.currentIndex >= 0 && this.currentIndex < this.lyrics.length) {
      return this.lyrics[this.currentIndex];
    }
    return null;
  }
  
  dispose() {
    this.stop();
  }
}

export default LyricsSyncController;