import { SETTINGS_FILES, SETTINGS_NAMES, type SettingsFile } from "./settings-files.js";
import { Vault, VaultError } from "./vault.js";

const sensitiveKey = /password|secret|token|api[\s_-]?key|authorization|credential|private[\s_-]?key|access[\s_-]?key/iu;
const sensitiveValue = /\bsk-[\w-]{12,}|\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----/iu;

export function redactSettings(value: unknown) {
  let redactedValues = 0, omittedValues = 0, visited = 0;
  const redact = () => { redactedValues++; return "[REDACTED]"; };
  const walk = (input: unknown, depth: number): unknown => {
    if (++visited > 3000 || depth > 30) { omittedValues++; return "[OMITTED: size limit]"; }
    if (typeof input === "string") {
      if (sensitiveValue.test(input) || /^(?:\/|[a-z]:[\\/]|file:\/\/)/iu.test(input)) return redact();
      try {
        const url = new URL(input);
        if (url.username || url.password || [...url.searchParams.keys()].some(key => sensitiveKey.test(key))) return redact();
      } catch { /* Ordinary preference string, not a URL. */ }
      if (input.length > 2000) { omittedValues++; return input.slice(0, 2000) + "[OMITTED: long value]"; }
      return input;
    }
    if (Array.isArray(input)) {
      const items = input.slice(0, 1000).map(item => walk(item, depth + 1));
      if (input.length > 1000) { omittedValues++; items.push("[OMITTED: remaining items]"); }
      return items;
    }
    if (input && typeof input === "object") {
      const entries = Object.entries(input);
      const items = entries.slice(0, 1000).map(([key, item]) => [key, sensitiveKey.test(key) ? redact() : walk(item, depth + 1)]);
      if (entries.length > 1000) { omittedValues++; items.push(["__omitted__", "Additional keys omitted"]); }
      return Object.fromEntries(items);
    }
    return input;
  };
  const data = walk(value, 0);
  return {data, redactedValues, omittedValues};
}

export async function listObsidianSettings(vault: Vault) {
  const files = [];
  for (const file of SETTINGS_NAMES) {
    try {
      const note = await vault.readSettingsDocument(file);
      JSON.parse(note.content);
      files.push({file, purpose: SETTINGS_FILES[file], status: "available", revision: note.revision});
    } catch (error) {
      const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      files.push({file, purpose: SETTINGS_FILES[file], status: missing ? "not_found" : "unavailable", revision: null});
    }
  }
  return {files, source: "Saved Vault configuration only. Global settings, plugin data.json, and in-memory changes are not included."};
}

export async function readObsidianSettings(vault: Vault, file: SettingsFile, key?: string) {
  if (!SETTINGS_NAMES.includes(file)) throw new VaultError("Unsupported configuration file. Call list_obsidian_settings first.");
  const note = await vault.readSettingsDocument(file);
  let parsed: unknown;
  try { parsed = JSON.parse(note.content); } catch { throw new VaultError("Configuration file is not valid JSON."); }
  if (key !== undefined) {
    if (!parsed || typeof parsed !== "object" || !Object.hasOwn(parsed, key)) throw new VaultError("Requested top-level key or array index does not exist.");
    // Redact before selecting a key, so requesting apiKey cannot bypass key-based redaction.
  }
  const redacted = redactSettings(parsed);
  const data = key === undefined ? redacted.data : (redacted.data as Record<string, unknown>)[key];
  if (data === undefined) throw new VaultError("Requested key was omitted by the configuration size limit.");
  if (JSON.stringify(data).length > 65_536) throw new VaultError("Configuration response is too large. Request a top-level key or array index using key.");
  return {file, key: key ?? null, revision: note.revision, data,
    redactedValues: redacted.redactedValues, truncated: redacted.omittedValues > 0,
    notice: "Saved JSON snapshot; internal filenames and fields can vary by Obsidian version. Missing files do not imply disabled features. Sensitive-key/value redaction is best-effort, not a credential scanner."};
}
