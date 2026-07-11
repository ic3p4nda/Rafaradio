/**
 * Real-time Beat and BPM Detector
 * Uses Web Audio API frequency analysis to detect bass beats and compute 
 * track BPM dynamically with rolling averages and anomaly filtering.
 */
export class BpmDetector {
  constructor() {
    this.history = []; // Bass energy history
    this.historyLength = 120; // ~2 seconds at 60fps
    this.beatTimes = []; // Timestamps of detected beats
    this.maxBeatHistory = 15;
    this.lastBeatTime = 0;
    this.cooldown = 280; // Minimum time between beats in ms (~214 BPM max)
    this.bpm = 120; // Default/fallback BPM
    this.smoothBpm = 120;
    this.active = false;
  }

  /**
   * Updates the detector with the current frame's average bass energy.
   * @param {number} bassAvg Normalized average bass energy (0.0 to 1.0)
   */
  update(bassAvg) {
    const now = performance.now();

    // Push the current bass average to our rolling history
    this.history.push(bassAvg);
    if (this.history.length > this.historyLength) {
      this.history.shift();
    }

    // Compute rolling average of bass energy
    let sum = 0;
    for (let i = 0; i < this.history.length; i++) {
      sum += this.history[i];
    }
    const avg = sum / (this.history.length || 1);

    // Adaptive threshold based on the signal variance
    // We want to detect quick peaks that significantly exceed the rolling average.
    const threshold = 1.35;
    const minEnergyThreshold = 0.15; // Ignore absolute silence / noise floor

    if (bassAvg > avg * threshold && bassAvg > minEnergyThreshold && (now - this.lastBeatTime) > this.cooldown) {
      const interval = now - this.lastBeatTime;
      this.lastBeatTime = now;

      // Filter out intervals that represent noise/erroneous double beats
      if (interval < 1500 && interval > 250) { // Keep intervals between 40 BPM and 240 BPM
        this.beatTimes.push(now);
        if (this.beatTimes.length > this.maxBeatHistory) {
          this.beatTimes.shift();
        }

        this.calculateBpm();
      }
    }
  }

  /**
   * Analyzes registered beat times and calculates estimated BPM.
   */
  calculateBpm() {
    if (this.beatTimes.length < 4) return;

    // Calculate time differences between successive beats
    const intervals = [];
    for (let i = 1; i < this.beatTimes.length; i++) {
      intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
    }

    // Sort to perform median-based noise filtering (removes single anomaly spikes)
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    
    // Filter out intervals that deviate more than 25% from the median interval
    const validIntervals = intervals.filter(val => Math.abs(val - median) < median * 0.25);

    if (validIntervals.length > 0) {
      const avgInterval = validIntervals.reduce((acc, val) => acc + val, 0) / validIntervals.length;
      let calculatedBpm = 60000 / avgInterval;

      // Standardize BPM to a natural dancing/singing tempo range (65 to 175)
      // If BPM is double-time or half-time, divide/multiply to normalize it.
      while (calculatedBpm < 65) calculatedBpm *= 2;
      while (calculatedBpm > 175) calculatedBpm /= 2;

      this.bpm = calculatedBpm;
    }
  }

  /**
   * Retrieves the current smoothed BPM value.
   * Uses exponential smoothing to prevent sudden wild BPM spikes.
   * @returns {number} The current smoothed BPM
   */
  getBpm() {
    this.smoothBpm += (this.bpm - this.smoothBpm) * 0.05;
    return this.smoothBpm;
  }

  /**
   * Resets the history, typically called when switching tracks.
   */
  reset() {
    this.history = [];
    this.beatTimes = [];
    this.lastBeatTime = 0;
    this.bpm = 120;
    this.smoothBpm = 120;
  }
}

export default BpmDetector;
