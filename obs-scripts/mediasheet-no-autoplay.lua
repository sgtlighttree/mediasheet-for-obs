-- MediaSheet: stop OBS autoplaying clips at launch.
-- OBS starts every enabled media source as soon as its scene loads. The dock cannot act before it has connected,
-- so this script pauses them from inside OBS, a fraction of a second after launch.
--
-- Install once: OBS > Tools > Scripts > "+" > pick this file. OBS reloads it on every launch.
--
-- Skipped on purpose: media sources marked Loop (backgrounds should play), and anything while streaming or recording.

obs = obslua

local PASSES = 16        -- check every 500 ms for the first 8 s: sources can finish loading late
local INTERVAL_MS = 500
local passes_done = 0
local paused = {}

local function on_air()
  return obs.obs_frontend_streaming_active() or obs.obs_frontend_recording_active()
end

local function pause_playing_clips()
  if on_air() then return end
  local sources = obs.obs_enum_sources()
  if sources == nil then return end
  for _, src in ipairs(sources) do
    if obs.obs_source_get_unversioned_id(src) == "ffmpeg_source" then
      local settings = obs.obs_source_get_settings(src)
      local looping = obs.obs_data_get_bool(settings, "looping")
      obs.obs_data_release(settings)
      if not looping and obs.obs_source_media_get_state(src) == obs.OBS_MEDIA_STATE_PLAYING then
        obs.obs_source_media_play_pause(src, true)
        local name = obs.obs_source_get_name(src)
        if not paused[name] then
          paused[name] = true
          obs.blog(obs.LOG_INFO, "[MediaSheet] paused autoplaying clip: " .. name)
        end
      end
    end
  end
  obs.source_list_release(sources)
end

local function tick()
  pause_playing_clips()
  passes_done = passes_done + 1
  if passes_done >= PASSES then
    obs.remove_current_callback()
  end
end

function script_description()
  return "MediaSheet: pauses media clips that OBS autoplays at launch (Loop sources and on-air launches are left alone)."
end

function script_load(settings)
  obs.timer_add(tick, INTERVAL_MS)
end
