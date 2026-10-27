-- MediaSheet: background music that plays whatever scene is live.
-- OBS only mixes a source's audio while its scene is on Program. This script keeps one media source, "MediaSheet Music",
-- on a global output channel (the mechanism Desktop Audio uses), so it is always active and never part of a scene,
-- cut, fade or stinger. MediaSheet's music strip picks the file and drives play/pause/seek/volume over obs-websocket.
--
-- Install once: OBS > Tools > Scripts > "+" > pick this file. Takes effect immediately; OBS reloads it on every launch.
-- If MediaSheet says "Music not routed", check Tools > Scripts > Script Log for errors from this script.

obs = obslua

local NAME = "MediaSheet Music"
local CHANNEL = 10   -- OBS itself uses 0-5 (video, desktop and mic audio)
local player = nil

local function ensure_player()
  local src = obs.obs_get_source_by_name(NAME)
  if src ~= nil then return src end
  local settings = obs.obs_data_create()
  obs.obs_data_set_bool(settings, "is_local_file", true)
  obs.obs_data_set_bool(settings, "looping", false)
  obs.obs_data_set_bool(settings, "clear_on_media_end", false)
  obs.obs_data_set_bool(settings, "close_when_inactive", false)
  obs.obs_data_set_bool(settings, "restart_on_activate", false)
  src = obs.obs_source_create("ffmpeg_source", NAME, settings, nil)
  obs.obs_data_release(settings)
  if src ~= nil then
    -- First creation only: later changes (volume, monitoring) are the operator's
    obs.obs_source_set_audio_mixers(src, 63)
    obs.obs_source_set_monitoring_type(src, obs.OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT)
  end
  return src
end

function script_description()
  return "MediaSheet: keeps a background music player on an always-on output channel, so it plays whichever scene is live."
end

function script_load(settings)
  player = ensure_player()
  if player == nil then
    obs.blog(obs.LOG_WARNING, "[MediaSheet] could not create the music player source")
    return
  end
  obs.obs_set_output_source(CHANNEL, player)
  obs.blog(obs.LOG_INFO, "[MediaSheet] music player on output channel " .. CHANNEL)
end

function script_unload()
  obs.obs_set_output_source(CHANNEL, nil)
  if player ~= nil then
    obs.obs_source_release(player)
    player = nil
  end
end
