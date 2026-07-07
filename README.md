# 🎵 RafaRadio

A beautiful, modern desktop music player built with **Electron** and **Three.js**, inspired by Mineradio. Features immersive 3D lyrics visualization, YouTube Music integration, and stunning particle effects.

## ✨ Features

- 🎨 **Beautiful UI** — Custom dark theme with glass morphism effects
- 🎵 **Local & Streaming** — Play local files and stream from YouTube Music
- 🌐 **YouTube Music Integration** — Search and play songs directly
- 📝 **3D Lyrics Stage** — Immersive lyrics visualization with Three.js
- 🎼 **Genius Integration** — Auto-fetch lyrics with proper synchronization
- ✨ **Particle Effects** — Dynamic particle field that reacts to music
- 🔊 **Web Audio API** — Bass-reactive visualizations
- 🎛️ **Custom Titlebar** — Frameless window with custom controls

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **yt-dlp** (for YouTube streaming support) — [Installation Guide](https://github.com/yt-dlp/yt-dlp)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/RafaRadio.git
   cd RafaRadio
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup Genius API (Optional but recommended):**
   - Get a free API key from [Genius API Clients](https://genius.com/api-clients)
   - Edit `src/main.js` and paste your token:
     ```javascript
     const GENIUS_API_KEY = 'YOUR_TOKEN_HERE';
     ```

4. **Install yt-dlp (for YouTube streaming):**
   - **Windows:** `pip install yt-dlp`
   - **macOS:** `brew install yt-dlp`
   - **Linux:** `pip install yt-dlp`

### Development

Run the app in development mode:

```bash
npm start
```

This will launch the Electron app with hot-reload support.

## 📖 Usage

### Adding Music

- **Local Files** — Click "+ Add Files" to browse and add MP3s, WAV, FLAC, etc.
- **YouTube Music** — Click "Cloud" button, search for songs, and play directly

### Lyrics Feature

1. Click the **"Lyrics"** button (top center)
2. The 3D lyrics stage slides up
3. Lyrics auto-fetch and sync with playback
4. Click refresh (🔄) if needed, or close (✕) to return

### Controls

- **Play/Pause** — Center play button
- **Next/Previous** — Arrow buttons
- **Seek** — Click/drag the progress bar
- **Volume** — Adjust with the volume slider
- **Fullscreen** — Click the maximize button in titlebar

## 🏗️ Project Structure

```
RafaRadio/
├── src/
│   ├── main.js                 # Main Electron process
│   ├── preload.js              # Preload script (security)
│   ├── lyrics-service.js       # Lyrics fetching & scraping
│   └── renderer/
│       ├── index.html          # Main UI
│       ├── renderer.js         # Renderer process logic
│       ├── style.css           # Styling
│       ├── lyrics-visualizer.js # Three.js lyrics viz
│       └── lyrics-sync.js      # Lyrics timing sync
├── package.json
└── README.md
```

## 🛠️ Technologies Used

- **Electron** — Desktop app framework
- **Three.js** — 3D graphics and visualizations
- **Web Audio API** — Audio analysis and visualization
- **YouTube Music API** — Song search and streaming
- **yt-dlp** — Audio extraction from YouTube
- **music-metadata** — Audio file metadata reading

## 📦 Building for Distribution

Create distributable packages:

```bash
npm run build
```

This will generate platform-specific installers in the `dist/` folder.

## 🎨 Customization

### Theme Colors

Edit the CSS variables in `src/renderer/style.css`:

```css
:root {
  --void: #05050a;        /* Main background */
  --gold: #fac900;        /* Primary accent */
  --blue: #008aff;        /* Secondary accent */
  --text: #f2f2f6;        /* Text color */
}
```

### Three.js Visualization

Tweak the particle effects and lyrics animations in:
- `src/renderer/lyrics-visualizer.js` — 3D text rendering
- `src/renderer/renderer.js` — Particle effects

## 🐛 Troubleshooting

**Lyrics not fetching?**
- Check your internet connection
- Verify the song has lyrics on Genius
- Ensure you have a Genius API key set (optional fallback works too)

**YouTube streaming not working?**
- Make sure `yt-dlp` is installed and in your PATH
- Run `yt-dlp --version` to verify
- Check firewall/proxy settings

**App crashes on startup?**
- Clear `node_modules/` and reinstall: `rm -rf node_modules && npm install`
- Check for conflicting global packages

## 📝 License

MIT License — Feel free to use this project for personal or commercial purposes.

## 🙌 Credits

- Inspired by **Mineradio**
- Built with ❤️ using Electron & Three.js
- Lyrics powered by **Genius.com**
- Music streaming via **YouTube Music**

## 💬 Support

Found a bug or have a feature request? Open an issue on GitHub!

---

**Happy listening!** 🎵✨
