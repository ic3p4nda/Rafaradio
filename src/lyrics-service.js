const https = require('https');

// Store the API key (will be set from main process)
let geniusApiKey = null;

function setGeniusApiKey(apiKey) {
  geniusApiKey = apiKey;
}

/**
 * Fetch lyrics for a given song title and artist
 * Uses Genius API with authentication for best results
 */
async function fetchLyrics(title, artist) {
  try {
    if (!geniusApiKey) {
      console.warn('No Genius API key configured. Using fallback method.');
      return await fetchFromAZLyrics(title, artist);
    }
    
    let lyrics = await fetchFromGenius(title, artist);
    if (lyrics) return lyrics;
    
    lyrics = await fetchFromAZLyrics(title, artist);
    if (lyrics) return lyrics;
    
    return null;
  } catch (err) {
    console.error('Error fetching lyrics:', err);
    return null;
  }
}

/**
 * Simple fetch wrapper with timeout
 */
function fetchWithTimeout(url, options = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Fetch timeout')), timeout);
    
    https.get(url, options, (res) => {
      clearTimeout(timeoutId);
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => resolve(data));
    }).on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Fetch from Genius API with proper authentication
 */
async function fetchFromGenius(title, artist) {
  try {
    if (!geniusApiKey) return null;
    
    const query = `${title} ${artist}`;
    const encodedQuery = encodeURIComponent(query);
    
    const options = {
      headers: {
        'Authorization': `Bearer ${geniusApiKey}`,
        'User-Agent': 'Mineradio-Player',
      },
    };
    
    const url = `https://api.genius.com/search?q=${encodedQuery}`;
    const data = await fetchWithTimeout(url, options, 5000);
    const json = JSON.parse(data);
    
    if (json.response && json.response.hits && json.response.hits.length > 0) {
      const hit = json.response.hits[0];
      const lyrics = await scrapeLyricsFromUrl(hit.result.url);
      
      if (lyrics && lyrics.length > 0) {
        return lyrics;
      }
    }
    
    return null;
  } catch (err) {
    console.warn('Genius fetch failed:', err.message);
    return null;
  }
}

/**
 * Scrape lyrics from a web page
 */
async function scrapeLyricsFromUrl(url) {
  try {
    const data = await fetchWithTimeout(url, {}, 10000);
    
    // Extract lyrics from lyrics divs
    const lyricsRegex = /<div[^>]*data-lyrics-container[^>]*>([\s\S]*?)<\/div>/g;
    const matches = data.match(lyricsRegex);
    
    if (!matches || matches.length === 0) {
      return null;
    }
    
    let fullLyrics = '';
    matches.forEach((match) => {
      let text = match
        .replace(/<div[^>]*>/g, '')
        .replace(/<\/div>/g, '\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<span[^>]*>/g, '')
        .replace(/<\/span>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      
      fullLyrics += text + '\n';
    });
    
    const lines = fullLyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    
    return lines.length > 0 ? lines : null;
  } catch (err) {
    console.warn('Scraping failed:', err.message);
    return null;
  }
}

/**
 * Fetch from an alternative lyrics service (no auth needed)
 */
async function fetchFromAZLyrics(title, artist) {
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    
    const data = await fetchWithTimeout(url, {}, 5000);
    const json = JSON.parse(data);
    
    if (json.lyrics) {
      const lines = json.lyrics
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('Embed'));
      
      return lines.length > 0 ? lines : null;
    }
    
    return null;
  } catch (err) {
    console.warn('AZ Lyrics fetch failed:', err.message);
    return null;
  }
}

module.exports = {
  fetchLyrics,
  setGeniusApiKey,
  parseLRC,
};
