(function () {
const EXT = {
  video: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpg', 'mpeg', 'ts', 'mxf', 'flv', 'wmv'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'svg'],
  audio: ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'aif', 'aiff'],
};

const MONITOR = {
  both: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
  room: 'OBS_MONITORING_TYPE_MONITOR_ONLY',
  stream: 'OBS_MONITORING_TYPE_NONE',
};
const MONITOR_NONE = MONITOR.stream;
const MONITOR_BOTH = MONITOR.both;
const STOP_ACTION = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP';
const RESTART_ACTION = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART';
const PILEUP_SETTLE_MS = 1500;

function extensionOf(file) {
  const match = /\.([^./\\]+)$/.exec(file || '');
  return match ? match[1].toLowerCase() : '';
}

function classifyItem(item) {
  if (item.inputKind === 'image_source' || item.inputKind === 'slideshow_v2' || item.inputKind === 'slideshow') {
    return 'image';
  }
  if (item.inputKind !== 'ffmpeg_source') return 'other';
  if (item.isLocalFile === false) return 'other';
  const ext = extensionOf(item.localFile);
  if (EXT.image.includes(ext)) return 'image';
  if (EXT.audio.includes(ext)) return 'audio';
  // A video marked Loop in OBS is a background, not a clip: never cued, soloed, parked or normalized
  if (item.looping === true) return 'loop';
  return 'video';
}

function detectPlaylist(items) {
  const videos = items.filter((item) => item.kind === 'video');
  if (videos.length >= 2) return { auto: true, kind: 'video', clips: videos };
  const images = items.filter((item) => item.kind === 'image');
  if (images.length >= 2) return { auto: true, kind: 'image', clips: images };
  return { auto: false, kind: null, clips: [] };
}

function routeToMonitorType(route) {
  if (!Object.prototype.hasOwnProperty.call(MONITOR, route)) {
    throw new Error(`Unknown route: ${route}`);
  }
  return MONITOR[route];
}

function monitorTypeToRoute(type) {
  if (type === MONITOR.both) return 'both';
  if (type === MONITOR.room) return 'room';
  return 'stream';
}

function sceneItemEnabled(sceneName, sceneItemId, on) {
  return { request: 'SetSceneItemEnabled', data: { sceneName, sceneItemId, sceneItemEnabled: on } };
}

function planCue({ sceneName, clip, items, active, monitorType, streamOnlyChosen }) {
  const reqs = [];
  for (const item of items) {
    if (item.sceneItemId === clip.sceneItemId) continue;
    if (!item.enabled || item.kind === 'loop') continue;
    reqs.push(sceneItemEnabled(sceneName, item.sceneItemId, false));
  }
  reqs.push(sceneItemEnabled(sceneName, clip.sceneItemId, true));
  reqs.push({
    request: 'SetSceneItemIndex',
    data: { sceneName, sceneItemId: clip.sceneItemId, sceneItemIndex: items.length - 1 },
  });
  if (clip.kind !== 'video' || active.has(clip.sourceName)) return reqs;
  reqs.push({ request: 'SetInputMute', data: { inputName: clip.sourceName, inputMuted: false } });
  if (monitorType === MONITOR_NONE && !streamOnlyChosen) {
    reqs.push({
      request: 'SetInputAudioMonitorType',
      data: { inputName: clip.sourceName, monitorType: MONITOR_BOTH },
    });
  }
  return reqs;
}

function planIdle({ sceneName, clips, active }) {
  const reqs = [];
  for (const clip of clips) {
    if (active.has(clip.sourceName)) continue;
    if (clip.enabled) reqs.push(sceneItemEnabled(sceneName, clip.sceneItemId, false));
    if (clip.kind === 'video') {
      reqs.push({ request: 'TriggerMediaInputAction', data: { inputName: clip.sourceName, mediaAction: STOP_ACTION } });
    }
  }
  return reqs;
}

function planLeave({ sourceName, kind, active }) {
  if (kind !== 'video' || active.has(sourceName)) return [];
  return [{ request: 'SetInputMute', data: { inputName: sourceName, inputMuted: true } }];
}

// restart_on_activate is off for managed clips so MediaSheet restarts the clip itself, once, when it goes live. Resuming a cued clip with PLAY held the old picture for ~1 s while the audio ran (measured), RESTART does not.
function planActivate({ sourceName, kind, muted, monitorType, streamOnlyChosen, monitorSwitchSafe, mediaState, prerolled, skipRestart }) {
  if (kind !== 'video') return [];
  const reqs = [];
  // A clip MediaSheet already restarted in Preview is playing when it goes live; restarting it again would drop its frame (~2 black frames).
  const alreadyPlaying = prerolled && mediaState === 'OBS_MEDIA_STATE_PLAYING';
  // During a stinger the incoming clip activates a second before it is visible; the stinger take restarts it itself, just before the cut point.
  if (mediaState && !alreadyPlaying && !skipRestart) {
    reqs.push({ request: 'TriggerMediaInputAction', data: { inputName: sourceName, mediaAction: RESTART_ACTION } });
  }
  if (muted) reqs.push({ request: 'SetInputMute', data: { inputName: sourceName, inputMuted: false } });
  if (monitorSwitchSafe && monitorType === MONITOR_NONE && !streamOnlyChosen) {
    reqs.push({ request: 'SetInputAudioMonitorType', data: { inputName: sourceName, monitorType: MONITOR_BOTH } });
  }
  return reqs;
}

function shouldIdleReset({ managed, isProgram, isPreview, enabledClipCount, trigger }) {
  if (!managed) return false;
  if (trigger !== 'connect' && trigger !== 'leftViews') return false;
  if (isPreview && enabledClipCount === 1) return false;
  return (!isProgram && !isPreview) || enabledClipCount > 1;
}

// The cut point of OBS's stinger transition (when the picture swaps), in ms from the start. null = the transition has no video file yet.
function stingerPointMs(settings, fps) {
  if (!settings || !settings.path) return null;
  const point = Number(settings.transition_point) || 0;
  return settings.tp_type === 1 ? Math.round((point * 1000) / (fps || 30)) : point;
}

// Delays (ms after the stinger starts): outgoing audio finishes fading as the picture swaps, the incoming clip restarts just before it, and the incoming audio comes up at it.
function planStingerTiming({ pointMs, fadeMs, restartLeadMs }) {
  return {
    outDelay: Math.max(0, pointMs - (fadeMs || 0)),
    restartDelay: Math.max(0, pointMs - restartLeadMs),
    inAt: pointMs,
  };
}

// OBS plays every enabled clip as soon as it starts. Frames rendered since launch tell how long it has been up, so a dock reload mid-show is never mistaken for a launch.
const STARTUP_WINDOW_S = 180;
function isFreshStart(renderTotalFrames, fps, windowS = STARTUP_WINDOW_S) {
  return fps > 0 && renderTotalFrames / fps < windowS;
}

// Clips to park (paused on their first frame) right after OBS launches: only video clips that are playing, and never while on air.
function selectStartupParks({ fresh, streaming, recording, clips }) {
  if (!fresh || streaming || recording) return [];
  const out = [];
  for (const c of clips) {
    if (c.kind === 'video' && c.mediaState === 'OBS_MEDIA_STATE_PLAYING' && !out.includes(c.sourceName)) out.push(c.sourceName);
  }
  return out;
}

function shouldEvaluatePileup({ transitioning, msSinceTransitionEnd, liveClips }) {
  if (transitioning) return false;
  if (liveClips < 2) return false;
  if (msSinceTransitionEnd === null) return true;
  return msSinceTransitionEnd >= PILEUP_SETTLE_MS;
}

function rampValue(from, to, t) {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return from + (to - from) * t;
}

// level = the volume a clip should have when live: what was remembered before it was parked, unless the user raised it since.
function fadeLevel(remembered, current) {
  return typeof remembered === 'number' ? Math.max(remembered, current) : current;
}

function selectFadeTargets(candidates) {
  const outgoing = [];
  const incoming = [];
  for (const c of candidates) {
    if (c.live && !c.enabledInPreview && !c.muted && c.mul > 0) {
      outgoing.push({ sourceName: c.sourceName, mul: c.mul, level: c.level });
    } else if (!c.live && c.enabledInPreview && c.level > 0) {
      incoming.push({ sourceName: c.sourceName, level: c.level });
    }
  }
  return { outgoing, incoming };
}

// PLAY on an ENDED clip freezes at frame 1 in OBS 32.2.2 (measured), so anything that is not playing or paused is restarted.
function transportAction(mediaState) {
  if (mediaState === 'OBS_MEDIA_STATE_PLAYING') return 'PAUSE';
  if (mediaState === 'OBS_MEDIA_STATE_PAUSED') return 'PLAY';
  return 'RESTART';
}

function formatClock(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function seekTarget(position, max, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const t = Math.min(1, Math.max(0, position / max));
  return Math.round(t * durationMs);
}

// A live clip that is the only thing enabled in Preview is being taken again: it restarts from the top.
function selectRetake(candidates) {
  const staying = candidates.filter((c) => c.live && c.enabledInPreview);
  const cued = candidates.some((c) => !c.live && c.enabledInPreview);
  if (cued) return [];
  return staying.map((c) => ({ sourceName: c.sourceName, mul: c.mul, level: c.level }));
}

// Display order (scenes, clips) lives in MediaSheet only: OBS has no scene reorder request and its item order is the layer order.
function moveBefore(order, from, to, after = false) {
  if (from === to) return order.slice();
  const next = order.filter((x) => x !== from);
  const at = next.indexOf(to);
  next.splice(at < 0 ? next.length : at + (after ? 1 : 0), 0, from);
  return next;
}

// Which half of a tile the pointer is over decides whether a drop lands before or after it.
function dropSide(clientX, rect) {
  return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function mergeOrder(saved, current) {
  const have = new Set(current);
  const out = [];
  for (const x of Array.isArray(saved) ? saved : []) if (have.has(x) && !out.includes(x)) out.push(x);
  for (const x of current) if (!out.includes(x)) out.push(x);
  return out;
}

const api = {
  EXT,
  classifyItem,
  detectPlaylist,
  routeToMonitorType,
  monitorTypeToRoute,
  planCue,
  planIdle,
  planLeave,
  planActivate,
  shouldIdleReset,
  isFreshStart,
  selectStartupParks,
  stingerPointMs,
  planStingerTiming,
  shouldEvaluatePileup,
  rampValue,
  fadeLevel,
  selectFadeTargets,
  transportAction,
  formatClock,
  seekTarget,
  selectRetake,
  moveBefore,
  dropSide,
  mergeOrder,
};

if (typeof module !== 'undefined') module.exports = api;
else window.MSPlaylist = api;
})();
