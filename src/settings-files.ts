// Filename compatibility catalog only; no application-specific schema is assumed.
export const SETTINGS_FILES = {
  "settings.json": "Repository settings",
  "app.json": "Vault editor, file, and link preferences",
  "appearance.json": "Theme, font, and appearance preferences",
  "graph.json": "Saved graph configuration",
  "hotkeys.json": "Custom command keyboard shortcuts",
  "core-plugins.json": "Core plugin configuration",
  "community-plugins.json": "Community plugin list; not plugin credentials or data",
  "daily-notes.json": "Daily note preferences",
  "templates.json": "Template preferences",
  "bookmarks.json": "Saved bookmarks",
  "workspace.json": "Desktop workspace layout and open views",
  "workspace-mobile.json": "Mobile workspace layout",
  "workspaces.json": "Saved workspace layouts",
} as const;
export type SettingsFile = keyof typeof SETTINGS_FILES;
export const SETTINGS_NAMES = Object.keys(SETTINGS_FILES) as SettingsFile[];
