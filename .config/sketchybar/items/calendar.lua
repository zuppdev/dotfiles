local settings = require("settings")
local colors = require("colors")

-- Padding item required because of bracket
sbar.add("item", { position = "right", width = settings.group_paddings })

local cal = sbar.add("item", {
  icon = {
    color = colors.white,
    padding_left = 8,
    font = {
      style = settings.font.style_map["Black"],
      size = 12.0,
    },
  },
  label = {
    color = colors.white,
    padding_right = 8,
    -- Upstream pins this to 49. SF Mono is monospaced, so "21:40" is always
    -- 40.18pt and the extra 9 just opened a dead gap between date and time.
    -- No width key at all means dynamic; width = 0 means literally zero and
    -- the time then draws on top of the date.
    align = "right",
    font = { family = settings.font.numbers },
  },
  position = "right",
  update_freq = 30,
  padding_left = 1,
  padding_right = 1,
  background = {
    color = colors.bg1,   -- was bg2; every other pill uses bg1
    border_color = colors.transparent,
    border_width = 0
  },
  click_script = "open -a 'Calendar'"
})

-- Double border for calendar using a single item bracket
sbar.add("bracket", { cal.name }, {
  background = {
    color = colors.transparent,
    height = 30,
    border_color = colors.transparent,
    border_width = 0,
  }
})

-- Padding item required because of bracket
sbar.add("item", { position = "right", width = settings.group_paddings })

cal:subscribe({ "forced", "routine", "system_woke" }, function(env)
  -- Upstream formats this "%a. %d %b." - the dots are literal. Dropped,
  -- and the day loses its zero pad to match the other widgets. BSD
  -- strftime has no "%-d", so the day is built separately.
  local day = tostring(tonumber(os.date("%d")))
  cal:set({
    icon = os.date("%a ") .. day .. os.date(" %b"),
    label = os.date("%H:%M"),
  })
end)
