/**
 * Lyrics Sync Controller
 * Handles synchronization between audio playback and lyrics display
 */

class LyricsSyncController {
  constructor(audioElement, visualizer) {
    this.audio = audioElement;
    this.visualizer = visualizer;
    this.lyrics = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.syncInterval = null;
    this.syncThreshold = 0.5; // seconds of tolerance for lyric sync
  }
  
  setLyrics(lyricsArray) {
    // Convert simple array to timed lyrics if needed
    if (lyricsArray && lyricsArray.length > 0) {
      if (lyricsArray[0].time !== undefined) {
        // Already has timing info (LRC format)
        this.lyrics = lyricsArray;
      } else {
        // Simple array - distribute evenly
        this.lyrics = this.distributeTimedLyrics(lyricsArray);
      }
    }
  }
  
  distributeTimedLyrics(lyricsArray) {
    // Estimate total duration based on average song length
    // If we have actual duration, use that
    const estimatedDuration = this.audio.duration || 180; // default 3 minutes
    const timePerLyric = estimatedDuration / Math.max(lyricsArray.length, 1);
    
    return lyricsArray.map((lyric, index) => ({
      time: index * timePerLyric,
      text: lyric,
    }));
  }
  
  start() {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.currentIndex = -1;
    
    // Update lyrics every 100ms to catch timing changes
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
    const currentTime = this.audio.currentTime;
    
    // Find the current lyric
    let nextIndex = -1;
    
    for (let i = 0; i < this.lyrics.length; i++) {
      if (this.lyrics[i].time <= currentTime) {
        nextIndex = i;
      } else {
        break;
      }
    }
    
    // Update display if lyric has changed
    if (nextIndex !== this.currentIndex) {
      this.currentIndex = nextIndex;
      
      if (this.visualizer && nextIndex >= 0) {
        this.visualizer.updateCurrentLyric(nextIndex);
      }
    }
  }
  
  seek(time) {
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
