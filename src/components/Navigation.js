/**
 * Navigation.js - Metrolist-inspired Glassmorphic Navigation Component
 * Handles layout routing, translucent side panel tabs, and responsive UI views.
 */
export class Navigation {
  constructor(containerId, onTabChange) {
    this.container = document.getElementById(containerId);
    this.onTabChange = onTabChange;
    this.activeTab = 'cloud'; // Cloud (Search), Lyrics, Library, Settings
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    if (!this.container) return;

    // Use RafaRadio's design variables directly for high visual cohesion
    this.container.innerHTML = `
      <div class="nav-sidebar glass-panel" style="
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px 12px;
        width: 200px;
        height: 100%;
        background: var(--panel);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-right: 1px solid var(--border);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      ">
        <div class="brand-header" style="
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 20px;
          color: #fff;
          margin-bottom: 24px;
          padding-left: 8px;
          letter-spacing: 0.5px;
          background: linear-gradient(135deg, var(--blue) 0%, #ffffff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        ">
          RafaRadio
        </div>

        <button class="nav-btn ${this.activeTab === 'cloud' ? 'active' : ''}" data-tab="cloud" style="${this.getBtnStyle(this.activeTab === 'cloud')}">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Search Cloud
        </button>

        <button class="nav-btn ${this.activeTab === 'lyrics' ? 'active' : ''}" data-tab="lyrics" style="${this.getBtnStyle(this.activeTab === 'lyrics')}">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
          Lyrics Stage
        </button>

        <button class="nav-btn ${this.activeTab === 'playlist' ? 'active' : ''}" data-tab="playlist" style="${this.getBtnStyle(this.activeTab === 'playlist')}">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          My Library
        </button>

        <div style="flex-grow: 1;"></div>

        <button class="nav-btn ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings" style="${this.getBtnStyle(this.activeTab === 'settings')}">
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Settings
        </button>
      </div>
    `;
  }

  getBtnStyle(isActive) {
    return `
      display: flex;
      align-items: center;
      width: 100%;
      padding: 10px 14px;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: ${isActive ? '#ffffff' : 'var(--text-dim)'};
      background: ${isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent'};
      border: 1px solid ${isActive ? 'var(--border)' : 'transparent'};
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;

      const tab = btn.dataset.tab;
      this.activeTab = tab;
      
      // Update styling across all elements
      const buttons = this.container.querySelectorAll('.nav-btn');
      buttons.forEach(b => {
        const isSelf = b.dataset.tab === tab;
        b.style.cssText = this.getBtnStyle(isSelf);
        if (isSelf) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      if (this.onTabChange) {
        this.onTabChange(tab);
      }
    });
  }
}
