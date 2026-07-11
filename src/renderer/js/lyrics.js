// Lyrics management module
import LyricsVisualizer, { normalizeLyricLines } from '../lyrics-visualizer.js';
import LyricsSyncController from '../lyrics-sync.js';
import { lyricsCache, getTrackKey, saveLyricsCacheToStorage } from './state.js';

export let lyricsVisualizer = null;
export let lyricsSyncController = null;
export let lyricsVisible = false;

export function setLyricsVisible(val) {
  lyricsVisible = val;
  if (lyricsVisualizer) {
    lyricsVisualizer.visible = val;
  }
}

export function preloadLyrics(track, onBadgeUpdate) {
  if (!track) return Promise.resolve(null);
  const key = getTrackKey(track);
  if (lyricsCache.has(key)) {
    return lyricsCache.get(key).promise;
  }

  if (onBadgeUpdate) onBadgeUpdate(track, 'loading');

  const promise = window.api.fetchLyrics(track.name, track.artist || '')
    .then(lyrics => {
      if (lyrics && lyrics.length > 0) {
        lyricsCache.set(key, { state: 'loaded', lines: lyrics, promise });
        if (onBadgeUpdate) onBadgeUpdate(track, 'loaded');
        saveLyricsCacheToStorage();
        return lyrics;
      } else {
        lyricsCache.set(key, { state: 'none', lines: null, promise });
        if (onBadgeUpdate) onBadgeUpdate(track, 'none');
        saveLyricsCacheToStorage();
        return null;
      }
    })
    .catch(err => {
      lyricsCache.set(key, { state: 'none', lines: null, promise });
      if (onBadgeUpdate) onBadgeUpdate(track, 'none');
      saveLyricsCacheToStorage();
      return null;
    });

  lyricsCache.set(key, { state: 'loading', lines: null, promise });
  return promise;
}

export function initLyricsVisualizer(audio, overlayElement, threeConfig) {
  if (lyricsVisualizer) return true;

  try {
    lyricsVisualizer = new LyricsVisualizer(null, overlayElement, threeConfig);
    lyricsVisualizer.visible = lyricsVisible;
    lyricsSyncController = new LyricsSyncController(audio, lyricsVisualizer);

    audio.addEventListener('play', () => {
      if (lyricsSyncController && lyricsVisible) lyricsSyncController.start();
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

export async function fetchAndDisplayLyrics(track, audio, overlayElement, threeConfig, lyricsStatusEl, onBadgeUpdate) {
  try {
    const key = getTrackKey(track);
    let cached = lyricsCache.get(key);

    // Clear current lyrics first
    if (lyricsVisualizer) {
      await lyricsVisualizer.displayLyrics([]);
    }
    if (lyricsSyncController) {
      lyricsSyncController.setLyrics([]);
    }

    if (cached && cached.state === 'loaded') {
      const lyrics = cached.lines;
      initLyricsVisualizer(audio, overlayElement, threeConfig);
      const displayLyrics = normalizeLyricLines(lyrics);

      if (lyricsVisualizer) {
        try {
          await lyricsVisualizer.displayLyrics(displayLyrics);
        } catch (vizErr) {
          console.error('Visualizer error:', vizErr);
        }
      }

      if (lyricsSyncController) {
        lyricsSyncController.setLyrics(lyrics);
      }

      lyricsStatusEl.textContent = `${lyrics.length} lines loaded ✓`;

      if (!audio.paused && lyricsSyncController && lyricsVisible) {
        lyricsSyncController.start();
      }
      return;
    } else if (cached && cached.state === 'none') {
      lyricsStatusEl.textContent = 'No lyrics found';
      return;
    }

    lyricsStatusEl.textContent = 'Fetching lyrics...';

    let lyricsPromise;
    if (cached && cached.promise) {
      lyricsPromise = cached.promise;
    } else {
      lyricsPromise = preloadLyrics(track, onBadgeUpdate);
    }

    const lyrics = await lyricsPromise;

    if (!lyrics || lyrics.length === 0) {
      lyricsStatusEl.textContent = 'No lyrics found';
      return;
    }

    initLyricsVisualizer(audio, overlayElement, threeConfig);
    const displayLyrics = normalizeLyricLines(lyrics);

    if (lyricsVisualizer) {
      try {
        await lyricsVisualizer.displayLyrics(displayLyrics);
      } catch (vizErr) {
        console.error('Visualizer error:', vizErr);
      }
    }

    if (lyricsSyncController) {
      lyricsSyncController.setLyrics(lyrics);
    }

    lyricsStatusEl.textContent = `${lyrics.length} lines loaded ✓`;

    if (!audio.paused && lyricsSyncController && lyricsVisible) {
      lyricsSyncController.start();
    }
  } catch (err) {
    console.error('Error fetching lyrics:', err);
    lyricsStatusEl.textContent = 'Error loading lyrics';
  }
}
