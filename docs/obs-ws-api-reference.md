# obs-websocket 5.x API Reference (MediaSheet subset)

Sources (all fetched 2026-09-10 from the `master` branch, per `mediasheet-spec.md`'s pinned reference — obs-websocket's protocol doc is generated straight from source comments, so `master` tracks whatever the next release ships, not necessarily 5.0.x):

- [`docs/generated/protocol.md`](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md) — top-level request/response field names, RPC version 1.
- [`src/utils/Obs_ArrayHelper.cpp`](https://github.com/obsproject/obs-websocket/blob/master/src/utils/Obs_ArrayHelper.cpp) and [`src/utils/Obs_ObjectHelper.cpp`](https://github.com/obsproject/obs-websocket/blob/master/src/utils/Obs_ObjectHelper.cpp) — exact per-item JSON serialization for every `Array<Object>` response (`scenes[]`, `inputs[]`, `sceneItems[]`, `transitions[]`), since `protocol.md`'s generated tables only say `Array<Object>` for these and don't enumerate nested fields.
- [`src/requesthandler/RequestHandler_SceneItems.cpp`](https://github.com/obsproject/obs-websocket/blob/master/src/requesthandler/RequestHandler_SceneItems.cpp) — exact `SetSceneItemTransform` field handling and validation ranges (`protocol.md` also just says `Object` for `sceneItemTransform`).
- [`src/requesthandler/RequestHandler_Sources.cpp`](https://github.com/obsproject/obs-websocket/blob/master/src/requesthandler/RequestHandler_Sources.cpp) — confirms `GetSourceScreenshot`'s `imageData` is a `data:image/<format>;base64,...` URI, not a bare base64 string.
- [`libobs/obs.h`](https://github.com/obsproject/obs-studio/blob/master/libobs/obs.h) and [`libobs/obs-defs.h`](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-defs.h) in `obsproject/obs-studio` — `OBS_BOUNDS_*` and `OBS_ALIGN_*` enum values.

Vendored client: `obs-websocket-js` 5.0.8 (`public/vendor/obs-websocket-js.min.js`). Its generated TypeScript types (`dist/base-*.d.ts`) type every `Array<Object>` field as untyped `JsonObject[]`, so they were not a usable source for nested field names — the C++ handler/serializer source above was used instead.

Only the calls, events, and objects MediaSheet uses are documented here. Field names and types below are copied verbatim from the sources above, not inferred, except where explicitly marked `inferred`.

## Conventions

- `?field` = optional request field.
- All requests/responses travel as JSON over the identified obs-websocket connection (see obs-websocket-js `call(requestType, requestData)` / `on(eventName, cb)`).

---

## Requests

### 1. GetVersion

Gets data about the current plugin and RPC version.

Request: none.

Response fields:

| Name | Type | Description |
|---|---|---|
| `obsVersion` | String | Current OBS Studio version |
| `obsWebSocketVersion` | String | Current obs-websocket version |
| `rpcVersion` | Number | Current latest obs-websocket RPC version |
| `availableRequests` | Array\<String\> | Available RPC requests for the negotiated RPC version |
| `supportedImageFormats` | Array\<String\> | Formats available to `GetSourceScreenshot` |
| `platform` | String | `windows`, `macos`, `ubuntu` (not guaranteed) |
| `platformDescription` | String | e.g. `Windows 10 (10.0)` |

### 2. SetStudioModeEnabled

Enables or disables studio mode.

Request fields:

| Name | Type | Description |
|---|---|---|
| `studioModeEnabled` | Boolean | `true` = enabled, `false` = disabled |

Response: none (ack only).

### 3. GetSceneList

Gets an array of scenes in OBS.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the scenes are in |

Response fields:

| Name | Type | Description |
|---|---|---|
| `currentProgramSceneName` | String | Current program scene name; `null` if desynced |
| `currentProgramSceneUuid` | String | Current program scene UUID |
| `currentPreviewSceneName` | String | Current preview scene name; `null` if not in studio mode |
| `currentPreviewSceneUuid` | String | Current preview scene UUID |
| `scenes` | Array\<Object\> | Array of scene objects, each with `sceneName` (String), `sceneUuid` (String), `sceneIndex` (Number — position from the back of the scene list, `0` = bottom; verified against `Obs_ArrayHelper.cpp::GetSceneList`) |

### 4. GetSceneTransitionList

Gets an array of all scene transitions in OBS.

Request: none.

Response fields:

| Name | Type | Description |
|---|---|---|
| `currentSceneTransitionName` | String | Name of the current transition; can be `null` |
| `currentSceneTransitionUuid` | String | UUID of the current transition; can be `null` |
| `currentSceneTransitionKind` | String | Kind of the current transition; can be `null` |
| `transitions` | Array\<Object\> | Array of transition objects, each with `transitionName` (String), `transitionUuid` (String), `transitionKind` (String), `transitionFixed` (Boolean, true if the transition's duration is not configurable), `transitionConfigurable` (Boolean, true if the transition supports being configured) — verified against `Obs_ArrayHelper.cpp::GetSceneTransitionList` |

### 5. GetVideoSettings

Gets the current video settings. True FPS = `fpsNumerator / fpsDenominator`.

Request: none.

Response fields:

| Name | Type | Description |
|---|---|---|
| `fpsNumerator` | Number | Numerator of the fractional FPS value |
| `fpsDenominator` | Number | Denominator of the fractional FPS value |
| `baseWidth` | Number | Width of the base (canvas) resolution in pixels |
| `baseHeight` | Number | Height of the base (canvas) resolution in pixels |
| `outputWidth` | Number | Width of the output resolution in pixels |
| `outputHeight` | Number | Height of the output resolution in pixels |

### 6. GetInputList

Gets an array of all inputs in OBS.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputKind` | String | Restrict the array to only inputs of this kind |

Response fields:

| Name | Type | Description |
|---|---|---|
| `inputs` | Array\<Object\> | Array of input objects, each with `inputName` (String), `inputUuid` (String), `inputKind` (String), `unversionedInputKind` (String, kind without the `_v2` suffix), `inputKindCaps` (Number, bitflag of `obs_source_info.output_flags`) — verified against `Obs_ArrayHelper.cpp::GetInputList` |

### 7. CreateScene

Creates a new scene in OBS.

Request fields:

| Name | Type | Description | Restrictions |
|---|---|---|---|
| `?canvasUuid` | String | UUID of the canvas to create the scene in | — |
| `sceneName` | String | Name for the new scene | — |

Response fields:

| Name | Type | Description |
|---|---|---|
| `sceneUuid` | String | UUID of the created scene |

### 8. CreateInput

Creates a new input, adding it as a scene item to the specified scene.

Request fields:

| Name | Type | Description | Restrictions | Default |
|---|---|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the scene is in | — | — |
| `?sceneName` | String | Name of the scene to add the input to | — | — |
| `?sceneUuid` | String | UUID of the scene to add the input to | — | — |
| `inputName` | String | Name of the new input | — | N/A |
| `inputKind` | String | Kind of input to create | — | N/A |
| `?inputSettings` | Object | Settings object to initialize the input with | — | Default settings used |
| `?sceneItemEnabled` | Boolean | Whether to enable the created scene item | — | `true` |

Response fields:

| Name | Type | Description |
|---|---|---|
| `inputUuid` | String | UUID of the newly created input |
| `sceneItemId` | Number | ID of the newly created scene item |

### 9. SetSceneItemTransform

Sets the transform and crop info of a scene item.

Request fields:

| Name | Type | Description | Restrictions |
|---|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the scene is in | — |
| `?sceneName` | String | Name of the scene the item is in | — |
| `?sceneUuid` | String | UUID of the scene the item is in | — |
| `sceneItemId` | Number | Numeric ID of the scene item | `>= 0` |
| `sceneItemTransform` | Object | Scene item transform object to update (partial merge — only send the fields you want to change) | — |

`sceneItemTransform` object fields — verified directly against `RequestHandler_SceneItems.cpp::SetSceneItemTransform` (request validation) and `Obs_ObjectHelper.cpp::GetSceneItemTransform` (response serialization); `protocol.md`'s generated tables only say `Object` and don't break these out:

| Field | Type | Restrictions | Notes |
|---|---|---|---|
| `positionX`, `positionY` | Number | `>= -90001, <= 90001` | Position in canvas pixels |
| `rotation` | Number | `>= -360, <= 360` | Degrees |
| `scaleX`, `scaleY` | Number | Resulting `scale * sourceWidth/Height` must stay within `(-90001, 90001)` | Scale multiplier |
| `alignment` | Number | `>= 0, <= uint32 max` | Bitmask, see `OBS_ALIGN_*` below |
| `boundsType` | String | Must be a valid `OBS_BOUNDS_*` name | One of the enum values below |
| `boundsAlignment` | Number | `>= 0, <= uint32 max` | Bitmask, same values as `alignment` |
| `boundsWidth`, `boundsHeight` | Number | `>= 1, <= 90001` | Bounding box size in pixels (used when `boundsType != OBS_BOUNDS_NONE`) |
| `cropLeft`, `cropRight`, `cropTop`, `cropBottom` | Number | `>= 0, <= 100000` | Crop in pixels |
| `cropToBounds` | Boolean | — | Whether crop is applied relative to the bounding box rather than the source |
| `sourceWidth`, `sourceHeight` | Number (response-only) | — | Width/height of the underlying source, unscaled |
| `width`, `height` | Number (response-only) | — | `scaleX/Y * sourceWidth/Height` — width/height of the source after scaling |

`SetSceneItemTransform`'s request accepts a **partial** `sceneItemTransform` object — every field above is independently optional; only the fields present are applied (confirmed by the `r.Contains(...)` per-field checks in the handler).

`boundsType` enum values (`libobs/obs.h`):

- `OBS_BOUNDS_NONE` — no bounds
- `OBS_BOUNDS_STRETCH` — stretch (ignores base scale)
- `OBS_BOUNDS_SCALE_INNER` — scales to inner rectangle
- `OBS_BOUNDS_SCALE_OUTER` — scales to outer rectangle
- `OBS_BOUNDS_SCALE_TO_WIDTH` — scales to the width
- `OBS_BOUNDS_SCALE_TO_HEIGHT` — scales to the height
- `OBS_BOUNDS_MAX_ONLY` — no scaling, maximum size only

`alignment` / `boundsAlignment` bitmask values (`libobs/obs-defs.h`):

- `OBS_ALIGN_CENTER = 0`
- `OBS_ALIGN_LEFT = 1 << 0` (1)
- `OBS_ALIGN_RIGHT = 1 << 1` (2)
- `OBS_ALIGN_TOP = 1 << 2` (4)
- `OBS_ALIGN_BOTTOM = 1 << 3` (8)

Response: none (ack only).

### 10. GetSourceScreenshot

Gets a base64-encoded screenshot of a source. `imageWidth`/`imageHeight` scale to inner (aspect ratio preserved); if omitted, the full source resolution is used. Compatible with inputs and scenes.

Request fields:

| Name | Type | Description | Restrictions | Default |
|---|---|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the source is in, if using `sourceName` | — | — |
| `?sourceName` | String | Name of the source | — | — |
| `?sourceUuid` | String | UUID of the source | — | — |
| `imageFormat` | String | Compression format; use `GetVersion.supportedImageFormats` | — | N/A |
| `?imageWidth` | Number | Width to scale to | `>= 8, <= 4096` | Source value |
| `?imageHeight` | Number | Height to scale to | `>= 8, <= 4096` | Source value |
| `?imageCompressionQuality` | Number | 0 = high compression, 100 = uncompressed, -1 = default | `>= -1, <= 100` | -1 |

Response fields:

| Name | Type | Description |
|---|---|---|
| `imageData` | String | Base64-encoded screenshot, formatted as a data URI (`data:image/<format>;base64,...`) |

### 11. SetCurrentPreviewScene

Sets the current preview scene. Only available when studio mode is enabled.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?sceneName` | String | Scene name to set as current preview scene |
| `?sceneUuid` | String | Scene UUID to set as current preview scene |

Response: none (ack only).

### 12. TriggerStudioModeTransition

Triggers the current scene transition. Same as clicking the studio mode "Transition" button.

Request: none. Response: none (ack only).

### 13. SetCurrentSceneTransition

Sets the current scene transition. Transition names are not guaranteed unique.

Request fields:

| Name | Type | Description |
|---|---|---|
| `transitionName` | String | Name of the transition to make active |

Response: none (ack only).

### 14. SetCurrentSceneTransitionDuration

Sets the duration of the current scene transition, if it is not fixed.

Request fields:

| Name | Type | Description | Restrictions |
|---|---|---|---|
| `transitionDuration` | Number | Duration in milliseconds | `>= 50, <= 20000` |

Response: none (ack only).

### 15. TriggerMediaInputAction

Triggers an action on a media input.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputName` | String | Name of the media input |
| `?inputUuid` | String | UUID of the media input |
| `mediaAction` | String | Identifier of the `ObsMediaInputAction` enum (see below) |

`ObsMediaInputAction` enum values:

- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE` — no action
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY` — play
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE` — pause
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP` — stop
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART` — restart
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT` — go to next playlist item
- `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS` — go to previous playlist item

Response: none (ack only).

### 16. GetMediaInputStatus

Gets the status of a media input.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputName` | String | Name of the media input |
| `?inputUuid` | String | UUID of the media input |

Response fields:

| Name | Type | Description |
|---|---|---|
| `mediaState` | String | One of the `OBS_MEDIA_STATE_*` values below |
| `mediaDuration` | Number | Total duration of the playing media in ms; `null` if not playing |
| `mediaCursor` | Number | Cursor position in ms; `null` if not playing |

`mediaState` values:

- `OBS_MEDIA_STATE_NONE`
- `OBS_MEDIA_STATE_PLAYING`
- `OBS_MEDIA_STATE_OPENING`
- `OBS_MEDIA_STATE_BUFFERING`
- `OBS_MEDIA_STATE_PAUSED`
- `OBS_MEDIA_STATE_STOPPED`
- `OBS_MEDIA_STATE_ENDED`
- `OBS_MEDIA_STATE_ERROR`

### 17. SetMediaInputCursor

Sets the cursor position of a media input. Does not perform bounds checking.

Request fields:

| Name | Type | Description | Restrictions |
|---|---|---|---|
| `?inputName` | String | Name of the media input | — |
| `?inputUuid` | String | UUID of the media input | — |
| `mediaCursor` | Number | New cursor position in ms | `>= 0` |

Response: none (ack only).

### 18. ToggleInputMute

Toggles the audio mute state of an input.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputName` | String | Name of the input to toggle |
| `?inputUuid` | String | UUID of the input to toggle |

Response fields:

| Name | Type | Description |
|---|---|---|
| `inputMuted` | Boolean | Whether the input has been muted or unmuted |

### 19. SetInputVolume

Sets the volume setting of an input. Specify exactly one of `inputVolumeMul` / `inputVolumeDb`.

Request fields:

| Name | Type | Description | Restrictions |
|---|---|---|---|
| `?inputName` | String | Name of the input | — |
| `?inputUuid` | String | UUID of the input | — |
| `?inputVolumeMul` | Number | Volume in mul | `>= 0, <= 20` |
| `?inputVolumeDb` | Number | Volume in dB | `>= -100, <= 26` |

Response: none (ack only).

### 20. GetInputVolume

Gets the current volume setting of an input.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputName` | String | Name of the input |
| `?inputUuid` | String | UUID of the input |

Response fields:

| Name | Type | Description |
|---|---|---|
| `inputVolumeMul` | Number | Volume setting in mul |
| `inputVolumeDb` | Number | Volume setting in dB |

### 21. GetInputMute

Gets the audio mute state of an input.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?inputName` | String | Name of the input |
| `?inputUuid` | String | UUID of the input |

Response fields:

| Name | Type | Description |
|---|---|---|
| `inputMuted` | Boolean | Whether the input is muted |

### 22. RemoveScene

Removes a scene from OBS.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the scene is in |
| `?sceneName` | String | Name of the scene to remove |
| `?sceneUuid` | String | UUID of the scene to remove |

Response: none (ack only).

### 23. GetSceneItemList

Gets a list of all scene items in a scene. Scenes only.

Request fields:

| Name | Type | Description |
|---|---|---|
| `?canvasUuid` | String | UUID of the canvas the scene is in |
| `?sceneName` | String | Name of the scene to get items of |
| `?sceneUuid` | String | UUID of the scene to get items of |

Response fields:

| Name | Type | Description |
|---|---|---|
| `sceneItems` | Array\<Object\> | Array of scene item objects — verified against `Obs_ArrayHelper.cpp::GetSceneItemList`: `sceneItemId` (Number), `sceneItemIndex` (Number), `sceneItemEnabled` (Boolean), `sceneItemLocked` (Boolean), `sceneItemTransform` (Object, see `SetSceneItemTransform` below), `sceneItemBlendMode` (String), `sourceName` (String), `sourceUuid` (String), `sourceType` (String, `OBS_SOURCE_TYPE_INPUT`/`OBS_SOURCE_TYPE_SCENE`), `inputKind` (String, `null` unless `sourceType` is `OBS_SOURCE_TYPE_INPUT`), `isGroup` (Boolean, `null` unless `sourceType` is `OBS_SOURCE_TYPE_SCENE`) |

---

## Events

### CurrentProgramSceneChanged

The current program scene has changed.

| Field | Type | Description |
|---|---|---|
| `sceneName` | String | Name of the scene switched to |
| `sceneUuid` | String | UUID of the scene switched to |

### CurrentPreviewSceneChanged

The current preview scene has changed.

| Field | Type | Description |
|---|---|---|
| `sceneName` | String | Name of the scene switched to |
| `sceneUuid` | String | UUID of the scene switched to |

### SceneCreated

A new scene has been created.

| Field | Type | Description |
|---|---|---|
| `sceneName` | String | Name of the new scene |
| `sceneUuid` | String | UUID of the new scene |
| `isGroup` | Boolean | Whether the new scene is a group |

### SceneRemoved

A scene has been removed.

| Field | Type | Description |
|---|---|---|
| `sceneName` | String | Name of the removed scene |
| `sceneUuid` | String | UUID of the removed scene |
| `isGroup` | Boolean | Whether the scene was a group |

### SceneNameChanged

The name of a scene has changed.

| Field | Type | Description |
|---|---|---|
| `sceneUuid` | String | UUID of the scene |
| `oldSceneName` | String | Old name of the scene |
| `sceneName` | String | New name of the scene |

### InputNameChanged

The name of an input has changed.

| Field | Type | Description |
|---|---|---|
| `inputUuid` | String | UUID of the input |
| `oldInputName` | String | Old name of the input |
| `inputName` | String | New name of the input |

### MediaInputPlaybackStarted

A media input has started playing.

| Field | Type | Description |
|---|---|---|
| `inputName` | String | Name of the input |
| `inputUuid` | String | UUID of the input |

### MediaInputPlaybackEnded

A media input has finished playing.

| Field | Type | Description |
|---|---|---|
| `inputName` | String | Name of the input |
| `inputUuid` | String | UUID of the input |

### MediaInputActionTriggered

An action has been performed on an input.

| Field | Type | Description |
|---|---|---|
| `inputName` | String | Name of the input |
| `inputUuid` | String | UUID of the input |
| `mediaAction` | String | Action performed; see `ObsMediaInputAction` enum |

### StudioModeStateChanged

Studio mode has been enabled or disabled.

| Field | Type | Description |
|---|---|---|
| `studioModeEnabled` | Boolean | `true` = enabled, `false` = disabled |

---

## Discrepancies vs. the design spec's assumptions

- **UUID fields are now standard.** Every scene/input/transition/source object in RPC version 1 carries both a `*Name` and a `*Uuid` field (e.g. `sceneUuid`, `inputUuid`, `transitionUuid`). The spec's call list only names the `*Name` fields; that's fine for name-based addressing (still fully supported), but new code should be aware the UUID fields exist and are the more stable identifier across renames.
- **`SceneItemTransform` fields are not enumerated in `protocol.md`'s generated tables**, for either `GetSceneItemTransform`'s response or `SetSceneItemTransform`'s request (both just say `Object`), and the vendored client's own `.d.ts` types the field as untyped `JsonObject`. The per-field breakdown in this document was pulled directly from the obs-websocket C++ source (`RequestHandler_SceneItems.cpp`, `Obs_ObjectHelper.cpp`) rather than inferred — including one field, `cropToBounds`, that the spec's call list omits entirely. Flag for review if OBS changes this struct in a future release.
- **`GetSceneList`'s `sceneIndex` matches the spec's assumption** and is now verified directly against `Obs_ArrayHelper.cpp::GetSceneList` — it counts from the back of the list (bottom of the scene stack = `0`), not from the top.
- **`GetSceneTransitionList`'s `transitions[]` items carry two more fields than the spec lists**: `transitionUuid` and `transitionConfigurable`, verified against `Obs_ArrayHelper.cpp::GetSceneTransitionList`.
- **`GetInputList`'s `inputs[]` items carry one more field than the spec lists**: `inputKindCaps` (a bitflag of `obs_source_info.output_flags`), verified against `Obs_ArrayHelper.cpp::GetInputList`.
- **`GetSceneItemList`'s `sceneItems[]` items are far richer than the spec's three-field assumption** (`sceneItemId`, `sourceName`, `inputKind`). Verified against `Obs_ArrayHelper.cpp::GetSceneItemList`, each item also carries `sceneItemIndex`, `sceneItemEnabled`, `sceneItemLocked`, `sceneItemTransform` (full transform object), `sceneItemBlendMode`, `sourceUuid`, `sourceType`, and `isGroup`.
- **`imageData` from `GetSourceScreenshot`** is confirmed by source (`RequestHandler_Sources.cpp` line ~230: `QString("data:image/%1;base64,").arg(imageFormat).append(...)`) to be a full data URI (`data:image/png;base64,...`), not a bare base64 payload — matches the spec's assumption.
- **No discrepancies found** in field names/types for `GetVersion`, `SetStudioModeEnabled`, `GetVideoSettings`, `CreateScene`, `CreateInput`, `SetCurrentPreviewScene`, `TriggerStudioModeTransition`, `SetCurrentSceneTransition`, `SetCurrentSceneTransitionDuration`, `TriggerMediaInputAction`, `GetMediaInputStatus`, `SetMediaInputCursor`, `ToggleInputMute`, `SetInputVolume`, `GetInputVolume`, `GetInputMute`, `RemoveScene`, or the ten listed events — all match the spec's assumed field names, types, and enum values exactly, confirmed against `protocol.md` and, for `GetMediaInputStatus`, against `RequestHandler_MediaInputs.cpp` directly.
