-- File tree alongside an open file, like the reference setup.
-- Opening nvim on a DIRECTORY gives both neo-tree AND LazyVim's directory
-- listing buffer - two file columns. So always open neo-tree, and open nvim
-- on a file rather than a directory.
return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      window = { width = 22 },   -- narrower file tree
      filesystem = {
        follow_current_file = { enabled = true },
        hijack_netrw_behavior = "open_default",
      },
    },
  },
  {
    "LazyVim/LazyVim",
    opts = function()
      vim.api.nvim_create_autocmd("VimEnter", {
        callback = function()
          vim.schedule(function()
            pcall(vim.cmd, "Neotree show")
            pcall(vim.cmd, "wincmd p") -- keep the cursor in the file, not the tree
          end)
        end,
      })
    end,
  },
}
