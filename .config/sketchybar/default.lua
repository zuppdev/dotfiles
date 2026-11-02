local settings = require("settings")
local colors = require("colors")

-- Equivalent to the --default domain
sbar.default({
  updates = "when_shown",
  icon = {
    font = {
      family = settings.font.text,
      style = settings.font.style_map["Bold"],
      size = 14.0
    },
    color = colors.white,
    padding_left = settings.paddings,
    padding_right = settings.paddings,
    background = { image = { corner_radius = 9.5 } },
  },
  label = {
    font = {
      family = settings.font.text,
      style = settings.font.style_map["Semibold"],
      size = 13.0
    },
    color = colors.white,
    padding_left = settings.paddings,
    padding_right = settings.paddings,
  },
  background = {
    -- Figma slice: pill top 12px, height 56px at 2x = 6pt gap, 28pt tall.
    height = 28,
    corner_radius = 9.5,
    -- Upstream draws a 2px bg2 border on every pill. That blends into his
    -- opaque dark bar but is obvious on a transparent one, so it is off here.
    -- Only the focused space keeps a border (see items/spaces.lua).
    border_width = 0,
    border_color = colors.transparent,
    image = {
      corner_radius = 9.5,
      border_color = colors.grey,
      border_width = 1
    }
  },
  popup = {
    background = {
      border_width = 2,
      corner_radius = 9.5,
      border_color = colors.popup.border,
      color = colors.popup.bg,
      shadow = { drawing = true },
    },
    blur_radius = 50,
  },
  -- Figma: 10px between pills at 2x = 5pt
  padding_left = 5,
  padding_right = 5,
  scroll_texts = true,
})
