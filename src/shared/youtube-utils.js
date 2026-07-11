const https = require('https');

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.lunar.icu',
  'https://api.piped.yt',
  'https://piped-api.glg.id',
  'https://piped-api.rirsh.de',
  'https://piped-api.privacydev.net',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.ch7.io',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.colby.rat',
  'https://piped-api.swish-swish.xyz'
];

const COBALT_INSTANCES = [
  'https://api.cobalt.tools/api/json',
  'https://cobalt.as93.net/api/json'
];

// Helper to perform HTTP requests returning JSON
function requestJson(url, options = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let timer;
    try {
      const urlObj = new URL(url);
      const reqOptions = {
        method: options.method || 'GET',
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(options.headers || {})
        },
        timeout: timeoutMs
      };

      const protocolLib = urlObj.protocol === 'https:' ? https : require('http');

      const req = protocolLib.request(reqOptions, (res) => {
        clearTimeout(timer);
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Status: ${res.statusCode}`));
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();

      timer = setTimeout(() => {
        req.destroy();
        reject(new Error('Request timed out'));
      }, timeoutMs);
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchStreamFromCobalt(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const payload = {
    url: url,
    downloadMode: 'audio',
    audioFormat: 'mp3',
    audioQuality: 'best'
  };

  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`Trying Cobalt resolution on: ${instance} for videoId: ${videoId}`);
      const res = await requestJson(instance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }, 3500);

      if (res && (res.status === 'stream' || res.status === 'redirect') && res.url) {
        console.log(`Cobalt resolution succeeded via ${instance}`);
        return { streamUrl: res.url };
      }
    } catch (err) {
      console.warn(`Cobalt instance ${instance} failed:`, err.message);
    }
  }
  return null;
}

async function fetchStreamFromPiped(videoId) {
  const shuffled = [...PIPED_INSTANCES].sort(() => 0.5 - Math.random());
  const candidates = shuffled.slice(0, 4);

  const attemptInstance = async (instance) => {
    try {
      const data = await requestJson(`${instance}/streams/${videoId}`, {}, 3000);
      if (data && data.audioStreams && data.audioStreams.length > 0) {
        const streams = data.audioStreams.filter(s => s.url);
        if (streams.length > 0) {
          streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          return {
            streamUrl: streams[0].url,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnailUrl,
            instance: instance
          };
        }
      }
      throw new Error(`Instance ${instance} returned no audio streams`);
    } catch (err) {
      throw err;
    }
  };

  try {
    const result = await Promise.any(candidates.map(candidate => attemptInstance(candidate)));
    console.log(`Piped resolution succeeded via ${result.instance} for videoId: ${videoId}`);
    return result;
  } catch (err) {
    console.warn(`Piped resolution race failed for videoId: ${videoId}. Errors:`, err);
    const remaining = shuffled.slice(4);
    for (const candidate of remaining) {
      try {
        const res = await attemptInstance(candidate);
        console.log(`Piped resolution succeeded on fallback candidate ${candidate} for videoId: ${videoId}`);
        return res;
      } catch (e) {
        console.warn(`Fallback candidate ${candidate} failed:`, e.message);
      }
    }
  }
  return null;
}

async function importPlaylistFromPiped(playlistId) {
  const shuffled = [...PIPED_INSTANCES].sort(() => 0.5 - Math.random());
  const candidates = shuffled.slice(0, 3);

  const attemptInstance = async (instance) => {
    try {
      const data = await requestJson(`${instance}/playlists/${playlistId}`, {}, 4000);
      if (data && data.relatedStreams && data.relatedStreams.length > 0) {
        const title = data.name || 'Imported Playlist';
        const tracks = data.relatedStreams
          .filter(item => item && item.url)
          .map(item => {
            let videoId = '';
            try {
              if (item.url.includes('?v=')) {
                videoId = item.url.split('?v=')[1].split('&')[0];
              } else {
                videoId = item.url.replace('/watch?v=', '');
              }
            } catch (e) {}

            if (!videoId) return null;

            return {
              type: 'youtube',
              videoId: videoId,
              name: item.title || 'Untitled Song',
              artist: item.uploaderName || 'Unknown Artist',
              thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
          })
          .filter(Boolean);

        if (tracks.length > 0) {
          return {
            title: title,
            tracks: tracks,
            instance: instance
          };
        }
      }
      throw new Error(`Instance ${instance} returned no valid playlist tracks`);
    } catch (err) {
      throw err;
    }
  };

  try {
    const result = await Promise.any(candidates.map(candidate => attemptInstance(candidate)));
    console.log(`Piped playlist import succeeded via ${result.instance} for playlistId: ${playlistId}`);
    return result;
  } catch (err) {
    console.warn(`Piped playlist import race failed for playlistId: ${playlistId}. Errors:`, err);
    const remaining = shuffled.slice(3);
    for (const candidate of remaining) {
      try {
        const res = await attemptInstance(candidate);
        console.log(`Piped playlist import succeeded on fallback candidate ${candidate} for playlistId: ${playlistId}`);
        return res;
      } catch (e) {
        console.warn(`Fallback playlist candidate ${candidate} failed:`, e.message);
      }
    }
  }
  return null;
}

function getYouTubeApi(url, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

module.exports = {
  requestJson,
  fetchStreamFromCobalt,
  fetchStreamFromPiped,
  importPlaylistFromPiped,
  getYouTubeApi
};
