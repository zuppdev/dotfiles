-- LazyVim puts a clock in the statusline's last section
-- (lazyvim/plugins/ui.lua:161: `return " " .. os.date("%R")`). The system bar
-- already shows the time; this slot is more useful as the cursor position.
-- `location` ships in lualine_y next to `progress`, so it moves rather than
-- duplicates: progress stays in y, position takes the accent block in z.
return {
  "nvim-lualine/lualine.nvim",
  opts = function(_, opts)
    opts.sections = opts.sections or {}
    opts.sections.lualine_y = {
      { "progress", separator = " ", padding = { left = 1, right = 1 } },
    }
    opts.sections.lualine_z = {
      { "location", padding = { left = 1, right = 1 } },
    }
    return opts
  end,
}
