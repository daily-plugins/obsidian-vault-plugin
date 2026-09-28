// Local compatibility allowlist, not a promise of a stable Obsidian JSON schema.
export const SETTINGS_FILES = {
  "app.json": "Vault editor, file, and link preferences",
  "appearance.json": "Theme, font, and appearance preferences",
  "graph.json": "Saved Graph view filters, groups, display, and forces",
  "hotkeys.json": "Custom command keyboard shortcuts",
  "core-plugins.json": "Enabled core plugin configuration",
  "community-plugins.json": "Enabled community plugin IDs; not plugin credentials or data",
  "daily-notes.json": "Daily Notes folder, date format, and template preferences",
  "templates.json": "Templates core plugin preferences",
  "bookmarks.json": "Saved bookmarks",
  "workspace.json": "Desktop workspace layout and open views",
  "workspace-mobile.json": "Mobile workspace layout",
  "workspaces.json": "Saved workspace layouts",
} as const;
export type SettingsFile = keyof typeof SETTINGS_FILES;
export const SETTINGS_NAMES = Object.keys(SETTINGS_FILES) as SettingsFile[];
