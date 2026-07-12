/**
 * SearchStage.js - Lightweight search stage controller
 * Integrates directly with YTMusic API (via Rust Tauri backend or fallback Web APIs)
 * to search tracks, render gorgeous item grids, and trigger playback additions.
 */
export class SearchStage {
  constructor(containerId, onPlayTrack, onAddToQueue) {
    this.container = document.getElementById(containerId);
    this.onPlayTrack = onPlayTrack;
    this.onAddToQueue = onAddToQueue;
    this.results = [];
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="search-stage-container" style="
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 24px;
        color: #fff;
        background: transparent;
        overflow-y: auto;
      ">
        <div class="search-header" style="margin-bottom: 24px;">
          <h2 style="font-family: 'Space Grotesk', sans-serif; font-size: 24px; margin-bottom: 8px;">Discover Music</h2>
          <p style="font-size: 13px; color: var(--text-dim);">Search across millions of YouTube Music tracks and visual stages</p>
        </div>

        <div class="search-bar-wrap" style="
          position: relative;
          margin-bottom: 24px;
        ">
          <input id="stageSearchInput" type="text" placeholder="Search for tracks, artists, or genres..." style="
            width: 100%;
            padding: 14px 20px 14px 50px;
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            font-size: 14px;
            color: #fff;
            outline: none;
            font-family: 'Inter', sans-serif;
            transition: all 0.3s ease;
          " />
          <svg style="
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-dim);
          " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>

        <div id="searchStatus" style="font-size: 13px; color: var(--gold); margin-bottom: 16px; display: none;">Searching...</div>

        <div id="searchResultsGrid" style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 20px;
        ">
          <!-- Populated dynamic search item cards -->
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    const searchInput = this.container.querySelector('#stageSearchInput');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      if (query.length < 2) {
        this.clearResults();
        return;
      }

      debounceTimer = setTimeout(() => this.performSearch(query), 400);
    });
  }

  async performSearch(query) {
    const statusEl = this.container.querySelector('#searchStatus');
    statusEl.style.display = 'block';
    statusEl.textContent = 'Searching...';

    try {
      // Graceful Dual-Platform integration:
      // Detect if we are running in the Tauri desktop client vs browser preview mode
      if (window.__TAURI__ && window.__TAURI__.invoke) {
        this.results = await window.__TAURI__.invoke('search_tracks', { query });
      } else {
        // Web Mode (Standard Express fallback proxy)
        const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);
        this.results = await response.json();
      }

      this.renderResults();
    } catch (err) {
      console.error('Search stage fetch failed:', err);
      statusEl.textContent = 'Failed to fetch tracks. Check network.';
    }
  }

  clearResults() {
    this.results = [];
    const grid = this.container.querySelector('#searchResultsGrid');
    if (grid) grid.innerHTML = '';
    const statusEl = this.container.querySelector('#searchStatus');
    if (statusEl) statusEl.style.display = 'none';
  }

  renderResults() {
    const grid = this.container.querySelector('#searchResultsGrid');
    const statusEl = this.container.querySelector('#searchStatus');
    if (!grid) return;

    statusEl.style.display = 'none';

    if (!this.results || this.results.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding-top: 40px; font-size: 13px;">
          No tracks found. Try another query!
        </div>
      `;
      return;
    }

    grid.innerHTML = this.results.map((track, idx) => `
      <div class="search-card glass-panel" data-idx="${idx}" style="
        position: relative;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        cursor: pointer;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease;
      " onmouseenter="this.style.transform='scale(1.03)'; this.style.borderColor='var(--blue)';" onmouseleave="this.style.transform='scale(1)'; this.style.borderColor='var(--border)';">
        <div class="thumbnail-wrap" style="
          position: relative;
          width: 100%;
          padding-top: 100%; /* square 1:1 ratio */
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 12px;
          background: #111;
        ">
          <img src="${track.thumbnail || 'https://i.ytimg.com/vi/placeholder/hqdefault.jpg'}" alt="cover" style="
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
          " />
          <div class="hover-play-overlay" style="
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.55);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
          " onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0'">
            <button class="play-direct-btn" data-action="play" style="
              width: 42px;
              height: 42px;
              border-radius: 50%;
              background: var(--blue);
              border: none;
              color: #030307;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0, 240, 255, 0.3);
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        </div>

        <div class="track-details" style="display: flex; flex-direction: column; flex-grow: 1;">
          <span class="track-title" style="
            font-family: 'Space Grotesk', sans-serif;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #fff;
            margin-bottom: 4px;
          ">${track.title}</span>
          <span class="track-artist" style="
            font-size: 11px;
            color: var(--text-dim);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 10px;
          ">${track.artist}</span>
          
          <button class="queue-btn" data-action="queue" style="
            margin-top: auto;
            width: 100%;
            padding: 6px 0;
            font-size: 11px;
            font-family: 'Space Grotesk', sans-serif;
            color: #fff;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseenter="this.style.background='var(--panel-solid)';" onmouseleave="this.style.background='rgba(255,255,255,0.05)';">
            Add to Queue
          </button>
        </div>
      </div>
    `);

    // Bind item specific actions (Play direct and Add to queue)
    const cards = grid.querySelectorAll('.search-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = parseInt(card.dataset.idx);
        const track = this.results[idx];
        const actionButton = e.target.closest('button');

        if (actionButton && actionButton.dataset.action === 'queue') {
          e.stopPropagation();
          if (this.onAddToQueue) this.onAddToQueue(track);
        } else {
          // Play track
          if (this.onPlayTrack) this.onPlayTrack(track);
        }
      });
    });
  }
}
