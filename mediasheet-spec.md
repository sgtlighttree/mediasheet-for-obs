# MediaSheet — OBS Playout Control Surface

**Repo:** `mediasheet-for-obs`

---

## Overview

MediaSheet is a web app that provides vMix-style input switching UX on top of OBS Studio. It connects to OBS via obs-websocket 5.x and replaces OBS's scene-and-source ceremony with a drag-and-play media input workflow.

OBS handles all rendering, encoding, and streaming. MediaSheet is the control surface — it creates scenes and sources programmatically, presents them as switchable input tiles, and manages playout transport controls.

---

## Problem

OBS treats every piece of media as a source inside a scene. To play a video file to program output, you must create a scene, add a media source, configure it, route audio, manage layer ordering, and then switch to that scene. For multi-file playout during live events, this becomes unworkable.

vMix treats each file as a self-contained, switchable input. MediaSheet brings that workflow to OBS without modifying OBS's codebase.

---

## Architecture

### Components

- **Express server** — serves the web app, handles file path resolution, and optionally watches hot folders. Required from day one because browser security prevents filesystem path access on drag-and-drop.
- **Single-page web app** — connects to OBS via obs-websocket-js (client-side WebSocket on port 4455). All OBS control happens in the browser; the Express server is not in the data path.
- **OBS Studio** — the rendering/streaming engine. MediaSheet treats it as headless infrastructure.

### Access Points

| Context | URL | Notes |
|---|---|---|
| OBS browser dock | `localhost:PORT` | Primary interface, docked inside OBS window |
| Phone/tablet | `LAN_IP:PORT` | Touch-friendly layout, same app |

### Data Flow

```
[User action in MediaSheet UI]
        │
        ▼
[obs-websocket-js in browser]
        │
        ▼ WebSocket (port 4455)
        │
[OBS Studio]
        │
        ▼
[Program output / stream / recording]
```

The Express server is only involved for file operations (resolving paths, serving the app). It does not proxy or intercept WebSocket traffic.

---

## Theming

Match OBS's default Yami theme so the dock panel looks native.

### Font Stack

```css
font-family: 'Open Sans', '.AppleSystemUIFont', Helvetica, Arial, 'MS Shell Dlg', sans-serif;
```

### Colors

Extract CSS custom properties from the Yami `.obt` file on the dev machine. The Yami theme uses variables:

- `--bg_base` — main background
- `--bg_window` — panel/window background
- `--text` — primary text
- `--primary` — accent/selection color
- `--font_base` — base font size

Map these to CSS custom properties in the app's stylesheet. Claude Code should read the actual `.obt` file at build time to extract exact hex values rather than guessing.

---

## File Import Flow

### Primary: OS File Picker

1. User clicks "Add Input" button
2. Native OS file picker opens via `<input type="file" accept="video/*,audio/*,image/*">`
3. Browser reads file metadata (name, size, lastModified)
4. `POST /api/resolve` to Express with metadata
5. Server runs `mdfind -name "filename.mp4"` (macOS Spotlight) to find full path
6. If multiple matches, disambiguate by file size and modification timestamp
7. Server returns absolute path
8. App calls `CreateScene` + `CreateInput` with that path

### Secondary: Drag-and-Drop

Same flow as above — browser reads filename/size/modified from the File API drop event, sends to `/api/resolve`, server resolves via Spotlight. No file upload or copying occurs.

### Fallback

If `mdfind` returns no results (external drive not indexed, network volume, etc.), the app displays an error and prompts the user to use the file picker again or manually enter a path.

---

## Core Workflow

### Adding an Input

1. File imported via picker or drag-and-drop (see above)
2. App sends `CreateScene` with name `[MS] filename.mp4`
3. App sends `CreateInput` to add a media source to that scene:
   - Input kind: `ffmpeg_source`
   - Settings: `{ local_file: "/absolute/path/to/file.mp4", is_local_file: true, restart_on_activate: false, close_when_inactive: false }`
4. App calls `GetSourceScreenshot` to generate a thumbnail for the tile

### Switching

- **Click tile** → `SetCurrentPreviewScene` (studio mode, loads to PVW)
- **Take button** or **double-click** → `TriggerStudioModeTransition` (PVW → PGM)
- Previous media stops naturally because OBS deactivates non-program scenes

### Transport Controls

Per media input tile:

- Play: `TriggerMediaInputAction` with `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY`
- Pause: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE`
- Stop: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP`
- Restart: `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART`
- Seek: `SetMediaInputCursor` (milliseconds, has known accuracy issues)
- Status polling: `GetMediaInputStatus` returns cursor position, duration, and playback state

### Audio

- Mute/unmute: `SetInputMute` / `ToggleInputMute`
- Volume: `SetInputVolume` (accepts dB or multiplier)
- Per-input audio tracks: `SetInputAudioTracks`

---

## Scene Naming Convention

All MediaSheet-created scenes are prefixed with `[MS]` (e.g., `[MS] clip.mp4`, `[MS] interview-b-roll.mov`).

On startup or reconnect, the app calls `GetSceneList` and:

- `[MS]`-prefixed scenes → rendered as media input tiles with transport controls
- All other scenes → rendered as passthrough tiles (switchable, no transport controls). These are the user's permanent scenes like cameras, overlays, graphics.

This keeps MediaSheet's playout inputs separate from the user's existing OBS scene collection. Cleanup is handled by saving/opening a different OBS scene collection file.

---

## Feature Tiers

### Tier 1 — MVP

- OS file picker import with server-side path resolution via `mdfind`
- Auto scene/source creation with `[MS]` prefix
- Input tile grid with thumbnails (`GetSourceScreenshot`)
- Click-to-preview, take-to-program (studio mode)
- Play/pause/stop/restart per input
- Mute toggle and volume slider per input
- Cut and fade transition buttons
- WebSocket authentication support (obs-websocket password)
- Auto-reconnect on WebSocket drop, rebuild state from `GetSceneList`
- OBS is the source of truth — no local state persistence needed

### Tier 2 — Usable for Live Work

- HTML5 `<video>` preview panel for cueing and scrubbing (workaround for OBS's inactive-preview limitation)
- In/out point marking with auto-cut at out point
- Remaining time / countdown display per tile
- Audio-follows-video toggle
- Audio monitoring per input (`SetInputAudioMonitorType`: off / monitor only / monitor and output)
- Transition type override per input (cut for cameras, dissolve for media, etc.)
- PPT/Keynote → PNG preprocessing with slide advance controls
- Drag-and-drop file import with `mdfind` Spotlight resolution
- Hot folder watching via `chokidar` (Node file-watcher)
- Playlist/rundown mode with auto-advance
- Loop toggle per input
- Mobile-optimized responsive layout for phone/tablet
- macOS Launch Agent (`.plist` in `~/Library/LaunchAgents/`) for auto-starting server on login

### Tier 3 — Nice to Have

- Software T-bar slider (`SetTBarPosition`, float 0.0–1.0)
- NDI source discovery and one-click add
- Tally indicators (red for PGM, green for PVW) via `CurrentProgramSceneChanged` / `CurrentPreviewSceneChanged` events
- Live audio level meters (subscribe to `InputVolumeMeters` event)
- Multiple quick-transition slots
- Internal file browser (server-side directory listing rendered in-app)
- Auto aspect ratio fit on import (`SetSceneItemTransform`)

---

## obs-websocket API Reference

Protocol spec: `github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md` (162KB, 5800 lines)

### Key Requests

| Category | Request | Purpose |
|---|---|---|
| Scenes | `CreateScene` | Create scene for new input |
| Scenes | `GetSceneList` | Rebuild tile grid on load/reconnect |
| Scenes | `SetCurrentProgramScene` | Switch to PGM |
| Scenes | `SetCurrentPreviewScene` | Load to PVW (studio mode) |
| Scenes | `RemoveScene` | Remove input |
| Inputs | `CreateInput` | Add media source to scene |
| Inputs | `SetInputSettings` | Set file path and source config |
| Inputs | `RemoveInput` | Remove source |
| Inputs | `GetInputMute` / `SetInputMute` / `ToggleInputMute` | Audio mute |
| Inputs | `GetInputVolume` / `SetInputVolume` | Volume control |
| Inputs | `SetInputAudioMonitorType` | Headphone monitoring |
| Inputs | `SetInputAudioTracks` | Audio track assignment |
| Media | `GetMediaInputStatus` | Cursor position, duration, state |
| Media | `SetMediaInputCursor` | Seek to timecode (ms) |
| Media | `OffsetMediaInputCursor` | Relative seek (no bounds check) |
| Media | `TriggerMediaInputAction` | Play/pause/stop/restart |
| Transitions | `TriggerStudioModeTransition` | PVW → PGM |
| Transitions | `SetCurrentSceneTransition` | Select transition type |
| Transitions | `SetCurrentSceneTransitionDuration` | Set transition duration |
| Transitions | `SetTBarPosition` | Manual transition (0.0–1.0) |
| Sources | `GetSourceScreenshot` | Thumbnail generation |
| Sources | `GetSourceActive` | Check if source is in PGM |
| UI | `GetStudioModeEnabled` / `SetStudioModeEnabled` | Ensure studio mode is on |

### Key Events (Subscribe)

| Event | Purpose |
|---|---|
| `MediaInputPlaybackStarted` | Update tile state |
| `MediaInputPlaybackEnded` | Auto-advance playlist, update tile |
| `MediaInputActionTriggered` | Confirm transport action |
| `CurrentProgramSceneChanged` | Tally (PGM indicator) |
| `CurrentPreviewSceneChanged` | Tally (PVW indicator) |
| `InputVolumeMeters` | Live level meters |
| `SceneCreated` / `SceneRemoved` | Keep tile grid in sync |
| `InputNameChanged` | Handle renames |

---

## Known Issues and Gotchas

### OBS Preview Does Not Render Media

Media sources in preview (studio mode) are not considered "active" by OBS's rendering pipeline. Transport controls work internally but no frames are rendered to the preview output. This is by design in OBS's core C code and cannot be fixed via WebSocket.

**Workaround (Tier 2):** The app loads the same file in an HTML5 `<video>` element for cueing and scrubbing. On take, it sends `SetMediaInputCursor` to the cued timecode, triggers play, and transitions.

Source properties that partially mitigate this:
- Uncheck "Restart playback when source becomes active"
- Uncheck "Close file when inactive"

These allow the preview to show the last rendered frame but do not enable live playback in preview.

### SetMediaInputCursor Accuracy

obs-websocket issue #1190 reports inaccurate seeking with `SetMediaInputCursor`. The HTML5 `<video>` preview workaround provides more reliable cueing, with OBS receiving the cue position only at the moment of take.

### Browser Dock Limitations

- CEF/Chromium engine — no filesystem path access on drag-and-drop (hence the Express server)
- `localStorage` is not isolated between custom docks — use unique key prefixes (e.g., `ms_` for MediaSheet)
- Hotkeys may not fire when the dock panel has focus — needs testing; may require click-out-of-dock before hotkey use

### Media Format Notes

- OBS uses FFmpeg for media decoding on macOS — most formats work
- ProRes in MOV containers may behave differently from H.264/H.265 in MP4
- Test with your actual event media before showtime

---

## Dependencies

| Package | Purpose |
|---|---|
| `obs-websocket-js` | Official JS client for obs-websocket 5.x |
| `express` | Local web server for app and file resolution API |
| `open-sans` (or Google Fonts) | Match OBS Yami theme font |

Additional for Tier 2+:

| Package | Purpose |
|---|---|
| `chokidar` | Hot folder file watching |

### OBS Requirements

- OBS Studio 28+ (obs-websocket included by default)
- WebSocket server enabled (Tools → WebSocket Server Settings)
- Studio Mode enabled

---

## Server

### Dev

```bash
cd mediasheet-for-obs
npm run dev
```

### Production

macOS Launch Agent for auto-start on login. Place a `.plist` in `~/Library/LaunchAgents/` pointing to the server entry point.

Server and OBS are independent processes:
- Server crash → restart server, app auto-reconnects to OBS
- OBS crash → restart OBS, app auto-reconnects via WebSocket reconnect logic
- Neither requires restarting the other

---

## API Endpoints (Express Server)

### `GET /`

Serves the MediaSheet web app.

### `POST /api/resolve`

Resolves a filename to an absolute filesystem path.

**Request:**
```json
{
  "name": "clip.mp4",
  "size": 48291034,
  "lastModified": 1725894400000
}
```

**Response:**
```json
{
  "path": "/Users/matt/Projects/event-2026/media/clip.mp4"
}
```

**Error (no match or ambiguous):**
```json
{
  "error": "not_found",
  "message": "Could not locate file. Use the file picker."
}
```

Implementation: runs `mdfind -name "filename"` on macOS, filters results by file size and modification timestamp.

---

## Reference Projects

These are not dependencies — they're reference implementations for obs-websocket call patterns and architecture.

- **obs-websocket protocol spec** — `github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md`
- **royshil/obs-mcp** — TypeScript MCP server for OBS, clean WebSocket call wrappers (94 stars, last updated Aug 2025)
- **xDarkzx/OBS_MCP** — 148-tool MCP server, more comprehensive, good for checking edge cases
- **obs-websocket-js** — `github.com/obs-websocket-community-projects/obs-websocket-js`
