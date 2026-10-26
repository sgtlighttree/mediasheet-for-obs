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

function planActivate({ sourceName, kind, muted, monitorType, streamOnlyChosen, monitorSwitchSafe }) {
  if (kind !== 'video') return [];
  const reqs = [];
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
};

if (typeof module !== 'undefined') module.exports = api;
else window.MSPlaylist = api;
