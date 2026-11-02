local icons = require("icons")
local colors = require("colors")

local whitelist = { ["Spotify"] = true,
                    ["Music"] = true    };

-- macOS 15.4 closed MediaRemote's notification API to unentitled processes, so
-- sketchybar stopped emitting media_change and these items never drew. The
-- subscription below is kept for the day that is reopened; in the meantime
-- helpers/nowplaying.sh polls nowplaying-cli, which still reads the session,
-- and reports the bundle identifier rather than the display name.
local bundles = { ["com.spotify.client"] = "Spotify",
                  ["com.apple.Music"]    = "Music"    };

-- Felix's 0.85 belongs to the built-in "media.artwork" source, which sketchybar
-- normalises for him. An image loaded from a path is drawn at its own size
-- times this scale instead, so the helper resizes the 600x600 cover down to
-- ART_PX=56 and this maps it onto the 28pt background at 2x. Change one and
-- change the other.
local artwork_scale = 0.5

local media_cover = sbar.add("item", {
  position = "right",
  background = {
    image = {
      string = "media.artwork",
      scale = 0.85,
      -- default.lua rims every background image in colors.grey. Kept, but in
      -- bg1 so the cover is edged in the same colour as the widget pills
      -- rather than outlined against them.
      border_color = colors.bg1,
    },
    color = colors.transparent,
  },
  label = { drawing = false },
  icon = { drawing = false },
  drawing = false,
  updates = true,
  update_freq = 2,
  popup = {
    align = "center",
    horizontal = true,
  }
})

local media_artist = sbar.add("item", {
  position = "right",
  drawing = false,
  padding_left = 3,
  padding_right = 0,
  width = 0,
  icon = { drawing = false },
  label = {
    width = 0,
    font = { size = 9 },
    -- Upstream dims the artist with 60% white. The pair is dark purple now, so
    -- the second rank is bg2 rather than a faded bg1: alpha over the wallpaper
    -- would wash a 9pt line out instead of just softening it.
    color = colors.bg2,
    max_chars = 18,
    y_offset = 6,
  },
})

local media_title = sbar.add("item", {
  position = "right",
  drawing = false,
  padding_left = 3,
  padding_right = 0,
  icon = { drawing = false },
  label = {
    font = { size = 11 },
    width = 0,
    -- Same overlay purple as the cover's rim and the widget pills.
    color = colors.bg1,
    max_chars = 16,
    y_offset = -5,
  },
})

sbar.add("item", {
  position = "popup." .. media_cover.name,
  icon = { string = icons.media.back },
  label = { drawing = false },
  click_script = "nowplaying-cli previous",
})
sbar.add("item", {
  position = "popup." .. media_cover.name,
  icon = { string = icons.media.play_pause },
  label = { drawing = false },
  click_script = "nowplaying-cli togglePlayPause",
})
sbar.add("item", {
  position = "popup." .. media_cover.name,
  icon = { string = icons.media.forward },
  label = { drawing = false },
  click_script = "nowplaying-cli next",
})

-- Upstream collapses the text five seconds after a track starts and only
-- reopens it on hover. It stays open here, so this only runs on the way in
-- and on the way out.
local function animate_detail(detail)
  sbar.animate("tanh", 30, function()
    media_artist:set({ label = { width = detail and "dynamic" or 0 } })
    media_title:set({ label = { width = detail and "dynamic" or 0 } })
  end)
end

local current = ""

local function apply(app, state, title, artist, artwork)
  local drawing = (whitelist[app] == true) and (state == "playing")
  local key = tostring(drawing) .. "\30" .. title .. "\30" .. artist
      .. "\30" .. (artwork or "")
  if key == current then return end
  current = key

  media_artist:set({ drawing = drawing, label = artist })
  media_title:set({ drawing = drawing, label = title })

  local cover = { drawing = drawing }
  if artwork and artwork ~= "" then
    cover.background = { image = { string = artwork, scale = artwork_scale } }
  end
  media_cover:set(cover)

  if drawing then
    animate_detail(true)
  else
    media_cover:set({ popup = { drawing = false } })
  end
end

media_cover:subscribe({ "routine", "forced", "system_woke" }, function(env)
  sbar.exec("$CONFIG_DIR/helpers/nowplaying.sh", function(out)
    if type(out) ~= "string" then return end
    local app, state, title, artist, artwork =
      out:match("^([^\n]*)\n([^\n]*)\n([^\n]*)\n([^\n]*)\n([^\n]*)")
    if not app then return end
    apply(bundles[app] or app, state, title, artist, artwork)
  end)
end)

media_cover:subscribe("media_change", function(env)
  if whitelist[env.INFO.app] then
    apply(env.INFO.app, env.INFO.state, env.INFO.title, env.INFO.artist, nil)
  end
end)

media_cover:subscribe("mouse.clicked", function(env)
  media_cover:set({ popup = { drawing = "toggle" }})
end)

media_title:subscribe("mouse.exited.global", function(env)
  media_cover:set({ popup = { drawing = false }})
end)
