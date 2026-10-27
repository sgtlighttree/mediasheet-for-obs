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
    if (!item.enabled) continue;
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
function planActivate({ sourceName, kind, muted, monitorType, streamOnlyChosen, monitorSwitchSafe, mediaState, prerolled }) {
  if (kind !== 'video') return [];
  const reqs = [];
  // A clip MediaSheet already restarted in Preview is playing when it goes live; restarting it again would drop its frame (~2 black frames).
  const alreadyPlaying = prerolled && mediaState === 'OBS_MEDIA_STATE_PLAYING';
  if (mediaState && !alreadyPlaying) {
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
function moveBefore(order, from, to) {
  if (from === to) return order.slice();
  const next = order.filter((x) => x !== from);
  const at = next.indexOf(to);
  next.splice(at < 0 ? next.length : at, 0, from);
  return next;
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
  shouldEvaluatePileup,
  rampValue,
  fadeLevel,
  selectFadeTargets,
  transportAction,
  formatClock,
  seekTarget,
  selectRetake,
  moveBefore,
  mergeOrder,
};

if (typeof module !== 'undefined') module.exports = api;
else window.MSPlaylist = api;
})();
