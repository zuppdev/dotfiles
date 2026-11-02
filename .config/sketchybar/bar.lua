local colors = require("colors")

-- Upstream values (height 40, padding 2). The two additions are NOT cosmetic:
--   topmost  -> without it the bar renders at window layer -20, behind the
--               menu bar and behind windows; only visible during transitions.
--   display  -> upstream default is the main display only, leaving the
--               external monitor blank.
sbar.bar({
  height = 40,
  color = colors.bar.bg,
  -- The DRAWN pill is inset from its item window by the item's own
  -- padding (apple.lua uses padding_left = 1). So bar padding must be one
  -- LESS than the window gap for the pill's visible left edge to line up
  -- with the window edge below it:
  --   bar padding 2 -> item window x=7 -> drawn pill x=8 == window x=8
  --   bar padding 3 -> item window x=8 -> drawn pill x=9 != window x=8
  -- Figma has them flush (pill 15.5px, window 15px at 2x).
  padding_right = 2,
  padding_left = 2,
  -- Upstream sets no blur. With the lower bar alpha this frosts the
  -- wallpaper behind the bar instead of showing it sharply.
  blur_radius = 30,
  topmost = true,
  display = "all",
})
