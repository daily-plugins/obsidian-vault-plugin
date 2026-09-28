import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { validateRelativePath } from "./vault.js";

export type VaultConfig = { root: string; id: string; excludedPaths: string[]; configDir?: string };

export async function loadConfig(): Promise<VaultConfig> {
  const path = (process.env.VAULT_PATH ?? process.env.OBSIDIAN_VAULT_PATH);
  if (!path || !isAbsolute(path)) {
    throw new Error("Set VAULT_PATH to an existing absolute directory path in .env.");
  }
  const configDir = process.env.VAULT_CONFIG_DIR ?? process.env.OBSIDIAN_CONFIG_DIR ?? (process.env.VAULT_PATH ? ".vault" : ".obsidian");
  if (!/^\.[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(configDir)) {
    throw new Error("VAULT_CONFIG_DIR must be one hidden folder name inside the Vault, such as .vault.");
  }
  let excludedPaths: string[];
  try {
    const parsed: unknown = JSON.parse(process.env.VAULT_EXCLUDED_PATHS ?? process.env.OBSIDIAN_EXCLUDED_PATHS ?? "[]");
    if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === "string")) throw new Error();
    excludedPaths = parsed.map(path => validateRelativePath(path));
  } catch {
    throw new Error("VAULT_EXCLUDED_PATHS must be a JSON array of visible Vault-relative paths.");
  }
  try {
    const root = await realpath(path);
    if (!(await stat(root)).isDirectory()) throw new Error("Not a directory");
    const id = (process.env.VAULT_ID ?? process.env.OBSIDIAN_VAULT_ID)?.trim() || "personal";
    return { root, id, excludedPaths, configDir };
  } catch {
    throw new Error("VAULT_PATH must be an accessible directory.");
  }
}
