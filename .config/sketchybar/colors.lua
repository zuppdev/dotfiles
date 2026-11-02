-- Rosé Pine. https://rosepinetheme.com
--
-- This is FelixKratz's bar config themed to match the r/unixporn rice that
-- inspired it - the OP there described their setup as "a version of
-- FelixKratz's config that i modified", with Rosé Pine and JetBrainsMono.
-- His original Sonokai palette is kept as colors.lua.felixkratz
return {
  black = 0xff191724,   -- base
  white = 0xffffffff,   -- pure white (Rosé Pine text is 0xffe0def4)
  grey  = 0xff908caa,   -- subtle (muted #6e6a86 is only 2.5:1 on bg1)

  red     = 0xffeb6f92,  -- love
  green   = 0xff9ccfd8,  -- foam. Rose Pine ships no green; foam is its success colour
  blue    = 0xff31748f,  -- pine
  yellow  = 0xfff6c177,  -- gold
  orange  = 0xffebbcba,  -- rose
  magenta = 0xffc4a7e7,  -- iris

  transparent = 0x00000000,

  bar = {
    -- FelixKratz uses alpha f0 (94% opaque) and no blur, which is barely
    -- visible. b0 = 69% opaque; paired with blur_radius in bar.lua it
    -- gives a frosted look. Set back to 0xf0191724 to match him exactly.
    bg     = 0x00000000,  -- fully transparent: only the pills draw
    border = 0xff26233a,  -- overlay
  },
  popup = {
    bg     = 0xc01f1d2e,  -- surface
    border = 0xff6e6a86,  -- muted
  },
  bg1 = 0xff26233a,   -- overlay
  bg2 = 0xff403d52,   -- highlight med

  with_alpha = function(color, alpha)
    if alpha > 1.0 or alpha < 0.0 then return color end
    return (color & 0x00ffffff) | (math.floor(alpha * 255.0) << 24)
  end,
}
