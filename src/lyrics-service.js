const https = require('https');

function setGeniusApiKey(apiKey) {
}

function parseTimestamp(timestamp) {
  const cleanTimestamp = String(timestamp || '').trim();
  if (!cleanTimestamp) return null;

  const parts = cleanTimestamp.split(':');
  if (parts.length < 1 || parts.length > 3) return null;

  const secondsPart = parts.pop();
  const secondsMatch = secondsPart.match(/^(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!secondsMatch) return null;

  const seconds = Number.parseInt(secondsMatch[1], 10);
  const millis = secondsMatch[2] ? Number.parseInt(secondsMatch[2].padEnd(3, '0'), 10) : 0;
  let totalSeconds = seconds + millis / 1000;

  if (parts.length > 0) {
    const minutes = Number.parseInt(parts.pop(), 10);
    totalSeconds += minutes * 60;
  }

  if (parts.length > 0) {
    const hours = Number.parseInt(parts.pop(), 10);
    totalSeconds += hours * 3600;
  }

  return Number.isFinite(totalSeconds) ? totalSeconds : null;
}

function parseSyncedLyrics(lyricsText) {
  if (typeof lyricsText !== 'string' || !lyricsText.trim()) return [];

  const entries = [];
  const lines = lyricsText.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const match = trimmed.match(/^\[(.+?)\](.*)$/);
    if (!match) return;

    const timestamp = parseTimestamp(match[1]);
    const text = match[2].replace(/\s+/g, ' ').trim();

    if (timestamp !== null && text) {
      entries.push({
        time: timestamp,
        text,
      });
    }
  });

  return entries;
}

function normalizePlainLyrics(lyricsText) {
  if (typeof lyricsText !== 'string') return [];

  return lyricsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fetchWithTimeout(url, options = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Fetch timeout')), timeout);

    const req = https.get(url, options, (res) => {
      clearTimeout(timeoutId);

      if (res.statusCode && res.statusCode >= 400) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });

    req.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

function buildLrcLibLookupUrls(title, artist) {
  const params = new URLSearchParams();
  if (title) params.set('track_name', title);
  if (artist) params.set('artist_name', artist);

  const query = params.toString();
  return [
    `https://lrclib.net/api/get${query ? `?${query}` : ''}`,
    `https://lrclib.net/api/get-cached${query ? `?${query}` : ''}`,
  ];
}

async function fetchFromLrcLib(title, artist) {
  const lookupUrls = buildLrcLibLookupUrls(title, artist);

  for (const url of lookupUrls) {
    try {
      const data = await fetch(url, {
        headers: {
          'User-Agent': 'RafaRadio (contact: brunom.tania@gmail.com)',
          'Accept': 'application/json'
        },
      });

      if (!data.ok) {
      console.log(`LRCLIB returned status ${data.status}. Skipping...`);
      return null; 
    }
    
      const json = JSON.parse(await data.text());
      const match = Array.isArray(json) ? json[0] : json;

      if (!match || typeof match !== 'object') continue;

      const lyricsPayload = match.syncedLyrics
        || match.synced_lyrics
        || match.plainLyrics
        || match.plain_lyrics
        || match.lyrics;

      if (typeof lyricsPayload === 'string' && lyricsPayload.trim()) {
        const syncedLyrics = parseSyncedLyrics(lyricsPayload);
        if (syncedLyrics.length > 0) {
          return syncedLyrics;
        }

        const lines = normalizePlainLyrics(lyricsPayload);
        return lines.length > 0 ? lines : null;
      }
    } catch (err) {
      console.warn(`LRCLIB lookup failed for ${url}:`, err.message);
    }
  }

  return null;
}

async function fetchFromTextyl(title, artist) {
  try {
    const url = `https://api.textyl.co/api/lyrics?q=${encodeURIComponent(artist + ' ' + title)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': '3DMusicVisualizerApp/1.0' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) return null;
    const json = await response.json();
    
    // Convert textyl format into something parseSyncedLyrics can digest or array map
    if (Array.isArray(json)) {
      return json.map(line => ({
        time: line.seconds,
        text: line.lyrics
      }));
    }
  } catch (err) {
    console.warn('Textyl backup fetch failed:', err.message);
  }
  return null;
}

async function fetchFromLyricsOvh(title, artist) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!response.ok) return null;

    const json = await response.json();
    if (json && typeof json.lyrics === 'string' && json.lyrics.trim()) {
      return normalizePlainLyrics(json.lyrics);
    }
  } catch (err) {
    console.warn('Lyrics.ovh fetch failed:', err.message);
  }
  return null;
}

async function fetchLyrics(title, artist) {
  try {
    const safeTitle = title || 'Unknown Title';
    const safeArtist = artist || 'Unknown Artist';
    console.log(`Fetching lyrics for: "${safeTitle}" by "${safeArtist}"`);

    // 1. Try LRCLIB
    const lrclibLyrics = await fetchFromLrcLib(safeTitle, safeArtist);
    if (lrclibLyrics) {
      const source = Array.isArray(lrclibLyrics) && lrclibLyrics.length && typeof lrclibLyrics[0] === 'object'
        ? 'LRCLIB synced lyrics'
        : 'LRCLIB plain lyrics';
      console.log(`✓ Got ${lrclibLyrics.length} lines from ${source}`);
      return lrclibLyrics;
    }

    // 2. Backup: Try Textyl for Synced Lyrics
    console.log('Trying backup Textyl API...');
    const textylLyrics = await fetchFromTextyl(safeTitle, safeArtist);
    if (textylLyrics && textylLyrics.length > 0) {
      console.log(`✓ Got ${textylLyrics.length} synced lines from Textyl API`);
      return textylLyrics;
    }

    // 3. Fallback: Try Lyrics.ovh for plain text
    const lyricsOvhLyrics = await fetchFromLyricsOvh(safeTitle, safeArtist);
    if (lyricsOvhLyrics) {
      console.log(`✓ Got ${lyricsOvhLyrics.length} lines from Lyrics.ovh`);
      return lyricsOvhLyrics;
    }

    console.warn('⚠ No lyrics returned from available free providers.');
    return generateDemoLyrics(safeTitle, safeArtist);
  } catch (err) {
    console.error('Error fetching lyrics:', err);
    return generateDemoLyrics(title || 'Unknown Title', artist || 'Unknown Artist');
  }
}

function generateDemoLyrics(title, artist) {
  return [
    `♪ ${title || 'Now Playing'} ♪`,
    `by ${artist || 'Unknown Artist'}`,
    '',
    'Lyrics could not be fetched ',
    'Enjoy the show!',
  ];
}

module.exports = {
  fetchLyrics,
  setGeniusApiKey,
  parseSyncedLyrics,
  fetchFromLrcLib,
  buildLrcLibLookupUrls,
};