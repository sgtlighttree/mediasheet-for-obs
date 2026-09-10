# MediaSheet for OBS

A web-based playout control surface for OBS Studio, inspired by vMix's input-switching UX. Runs as a local web app that connects to OBS via obs-websocket 5.x.

## Prerequisites

- **OBS Studio 28+** with the obs-websocket plugin (built-in since v28)
- **Node.js 18+**
- **macOS** (file resolution uses Spotlight/`mdfind`)

## Setup

### 1. Enable obs-websocket in OBS

1. Open OBS → **Tools → obs-websocket Settings**
2. Check **Enable WebSocket server**
3. Note the port (default: `4455`)
4. Optionally set a password

### 2. Install and start MediaSheet

```bash
git clone https://github.com/sgtlighttree/mediasheet-for-obs.git
cd mediasheet-for-obs
npm install
npm start
```

The server starts on `http://localhost:3000`.

### 3. Open the control surface

**Option A — Browser:** Navigate to `http://localhost:3000`

**Option B — OBS Custom Browser Dock:**
1. In OBS: **View → Docks → Custom Browser Docks...**
2. Set the URL to `http://localhost:3000`
3. Dock it wherever you like in your OBS layout

## Usage

### Connecting to OBS

MediaSheet auto-connects to `ws://localhost:4455` on load. To change the connection:

1. Click the gear icon in the top bar
2. Enter your OBS WebSocket host, port, and password
3. Click **Connect**

The status dot in the top bar shows connection state (green = connected, red = disconnected).

### Adding media inputs

1. Click **Add Input** in the top bar
2. Select a media file from the file picker
3. MediaSheet resolves the file's full path via macOS Spotlight and creates an `[MS]`-prefixed scene + `ffmpeg_source` input in OBS
4. The tile appears in the grid with a live thumbnail

If multiple files share the same name, a disambiguation picker appears showing full paths with sizes and dates.

### Switching

- **Click** a tile to load it into Preview (green border)
- **Double-click** a tile to take it to Program (red border) using the last-selected transition type
- **CUT** button — instant cut transition
- **FADE** button — fade transition (duration adjustable in the input field)

The active transition type (CUT/FADE) is highlighted and remembered.

### Transport controls

Each media tile has transport buttons:

- **Play / Pause / Stop / Restart** — control media playback
- **Progress bar** — shows elapsed time; click to seek

### Audio controls

- **Speaker icon** — click to toggle mute (icon changes to indicate state)
- **Volume slider** — dB-linear control from -60 dB (silent) to 0 dB (full)

### Removing inputs

Right-click a tile and select **Remove** to delete the `[MS]` scene and its input from OBS.

## Architecture

```
mediasheet-for-obs/
├── server.js              Express server (serves SPA + file resolution API)
├── lib/resolve.js         macOS Spotlight file resolver (mdfind)
├── public/
│   ├── index.html         Single-page app (all HTML/CSS/JS inline)
│   └── vendor/
│       └── obs-websocket-js.min.js   Vendored obs-websocket-js client
└── test/
    └── resolve.test.js    File resolution tests (node:test)
```

- **No build step** — vanilla JS, no framework, no bundler
- **obs-websocket-js vendored** — works offline in OBS browser docks
- **OBS is the source of truth** — no local database; all state lives in OBS

## Configuration persistence

MediaSheet stores connection settings in `localStorage` with `ms_` prefix:
- `ms_connection` — host, port, password
- `ms_fade_duration` — last-used fade duration

## License

MIT
