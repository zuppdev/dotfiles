-- Rose Pine, transparent.
--
-- Opaque, Neovim paints its own base (#191724) over the text grid only, so
-- iTerm's 10pt margin shows as a lighter frame around it and the statusline
-- reads as a bar with a gap underneath. Transparent, Neovim inherits iTerm's
-- background (#26233a - the same colour as the sketchybar pills) and the
-- margin becomes padding.
--
-- styles.transparency also flips the bundled lualine theme's section
-- backgrounds to NONE, so the statusline stops drawing as a bar.
return {
  {
    "rose-pine/neovim",
    name = "rose-pine",
    priority = 1000,
    opts = {
      variant = "main",
      styles = { transparency = true },
      highlight_groups = {
        -- transparency misses the winbar, so the navic breadcrumbs still
        -- drew as a surface-coloured strip above each window.
        WinBar = { bg = "NONE" },
        -- WinBarNC carries blend = 60, and the blend step runs on whatever
        -- bg survives the merge - blending the string "NONE" yields
        -- #0a090e. Replace the group outright instead of merging.
        WinBarNC = { fg = "muted", bg = "NONE", inherit = false },
        -- CursorLine defaults to overlay, which is now exactly the terminal
        -- background - the cursor line would be invisible. Step down instead
        -- of up, since the window is no longer painted on base.
        CursorLine = { bg = "highlight_low" },
      },
    },
  },
  { "LazyVim/LazyVim", opts = { colorscheme = "rose-pine" } },
}
