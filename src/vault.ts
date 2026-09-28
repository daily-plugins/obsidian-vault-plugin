import { constants } from "node:fs";
import { lstat, open, opendir, realpath, link, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, relative, sep, win32, basename } from "node:path";
import type { VaultConfig } from "./config.js";
import { SETTINGS_NAMES } from "./settings-files.js";

export const LIMITS = { fileBytes: 1_048_576, pageChars: 20_000, searchFiles: 2_000, searchEntries: 10_000, searchBytes: 20_971_520 } as const;
export class VaultError extends Error {}

export function validateRelativePath(path: string, allowRoot = false): string {
  if (allowRoot && path === "") return path;
  if (!path || isAbsolute(path) || win32.isAbsolute(path) || /[\\\x00-\x1f:]/u.test(path)) {
    throw new VaultError("Use a Vault-relative path with forward slashes.");
  }
  if (path.split("/").some(part => !part || part.startsWith(".") || part === "node_modules")) {
    throw new VaultError("Hidden paths, traversal, empty path segments, and node_modules are not allowed.");
  }
  return path;
}

export class Vault {
  constructor(private readonly config: VaultConfig) {}

  validateScope(path: string): void {
    validateRelativePath(path, true);
    if (this.config.excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))) {
      throw new VaultError("This path is excluded from Vault access.");
    }
  }

  async assertDirectory(path: string): Promise<void> { await this.resolve(path, true); }

  private async resolve(path: string, directory = false, configuration = false): Promise<string> {
    if (configuration) {
      const configDir = this.config.configDir ?? ".vault";
      if (!/^\.[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(configDir) ||
          !SETTINGS_NAMES.some(name => path === `${configDir}/${name}`)) {
        throw new VaultError("Only allowlisted Vault configuration files may be read.");
      }
    } else validateRelativePath(path, directory);
    if (this.config.excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))) {
      throw new VaultError("This path is excluded from Vault access.");
    }
    const root = this.config.root;
    if ((await realpath(root)) !== root || !(await lstat(root)).isDirectory()) {
      throw new VaultError("The configured Vault root has changed. Restart the server.");
    }
    let current = root;
    for (const part of path ? path.split("/") : []) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new VaultError("Symbolic links are not allowed.");
    }
    const canonical = await realpath(current);
    const within = relative(root, canonical);
    if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      throw new VaultError("The requested path is outside the Vault.");
    }
    const info = await lstat(canonical);
    if (directory ? !info.isDirectory() : !info.isFile()) throw new VaultError("Unexpected path type.");
    if (!directory && info.nlink > 1) throw new VaultError("Hard-linked notes are not allowed.");
    return canonical;
  }

  async instructionPaths(folder: string, accepted: Set<string>): Promise<string[]> {
    const dir = await opendir(await this.resolve(folder, true));
    const paths: string[] = [];
    let scanned = 0;
    for await (const entry of dir) {
      if (++scanned > LIMITS.searchEntries) throw new VaultError("Instruction scope scan is incomplete.");
      // Include matching links/excluded files so readDocument reports an incomplete review.
      if (accepted.has(entry.name.toLowerCase())) paths.push(folder ? `${folder}/${entry.name}` : entry.name);
    }
    return paths.sort();
  }

  private validateWrite(path: string, content: string): Buffer {
    this.validateScope(path);
    if (!path.toLowerCase().endsWith(".md")) throw new VaultError("Only Markdown (.md) notes may be written.");
    const bytes = Buffer.from(content, "utf8");
    if (bytes.toString("utf8") !== content) throw new VaultError("Content contains invalid Unicode.");
    if (bytes.length > LIMITS.fileBytes) throw new VaultError("Note exceeds the 1 MiB write limit.");
    return bytes;
  }

  private async writeTarget(path: string) {
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parent = await this.resolve(folder, true);
    return { folder, parent, file: join(parent, basename(path)) };
  }

  private async writeExclusive(file: string, bytes: Buffer, mode = 0o600) {
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    try { await handle.writeFile(bytes); await handle.sync(); }
    catch (error) { await unlink(file).catch(() => {}); throw error; }
    finally { await handle.close(); }
  }

  async createNote(path: string, content: string, dryRun = true) {
    const bytes = this.validateWrite(path, content);
    const target = await this.writeTarget(path);
    try { await lstat(target.file); throw new VaultError("Note already exists; use patch_note after reading its revision."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const result = { path, applied: !dryRun, revision: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    if (dryRun) return result;
    const temp = join(target.parent, `.obsidian-vault-${randomUUID()}.tmp`);
    await this.writeExclusive(temp, bytes);
    try {
      if (await this.resolve(target.folder, true) !== target.parent) throw new VaultError("Parent folder changed. Retry.");
      // Publishing via hard link is atomic and fails if the destination already exists.
      await link(temp, target.file);
    } finally { await unlink(temp); }
    return result;
  }

  async patchNote(path: string, expectedRevision: string, oldText: string, newText: string, dryRun = true) {
    this.validateWrite(path, newText);
    if (!/^[a-f0-9]{64}$/u.test(expectedRevision)) throw new VaultError("Provide the SHA-256 revision from read_note.");
    if (!oldText) throw new VaultError("oldText must not be empty.");
    const prepare = async () => {
      const note = await this.readDocument(path);
      if (note.revision !== expectedRevision) throw new VaultError("Revision conflict. Read the note again before editing.");
      const offset = note.content.indexOf(oldText);
      if (offset < 0) throw new VaultError("oldText was not found. Use exact text, including line endings.");
      if (note.content.indexOf(oldText, offset + 1) >= 0) throw new VaultError("oldText is ambiguous. Include more surrounding text.");
      const next = note.content.slice(0, offset) + newText + note.content.slice(offset + oldText.length);
      const bytes = this.validateWrite(path, next);
      return { note, bytes, changed: next !== note.content };
    };
    const preview = await prepare();
    const result = { path, applied: false, changed: preview.changed, previousRevision: expectedRevision,
      revision: createHash("sha256").update(preview.bytes).digest("hex"), bytes: preview.bytes.length,
      backupPath: null as string | null };
    if (dryRun || !preview.changed) return result;
    const target = await this.writeTarget(path);
    const lockPath = join(target.parent, `.obsidian-vault-${createHash("sha256").update(basename(path)).digest("hex")}.lock`);
    let lock;
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new VaultError("Another edit holds the note lock. Retry after it completes; a stale lock needs local recovery.");
      throw error;
    }
    const temp = join(target.parent, `.obsidian-vault-${randomUUID()}.tmp`);
    let tempCreated = false;
    try {
      const current = await prepare();
      const original = await lstat(await this.resolve(path));
      const backupName = `.obsidian-vault-${randomUUID()}.bak`;
      await this.writeExclusive(join(target.parent, backupName), Buffer.from(current.note.content, "utf8"));
      await this.writeExclusive(temp, current.bytes, original.mode & 0o777);
      tempCreated = true;
      // Recheck immediately before rename. External editors do not honor our lock.
      const final = await this.readDocument(path);
      const info = await lstat(await this.resolve(path));
      if (final.revision !== expectedRevision || info.ino !== original.ino || info.dev !== original.dev) {
        throw new VaultError("Revision conflict during write. Read the note again before editing.");
      }
      if (await this.resolve(target.folder, true) !== target.parent) throw new VaultError("Parent folder changed. Retry.");
      await rename(temp, target.file);
      tempCreated = false;
      return { ...result, applied: true, backupPath: target.folder ? `${target.folder}/${backupName}` : backupName };
    } finally {
      if (tempCreated) await unlink(temp).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
  }

  async readSettingsDocument(name: string) {
    return this.readText(`${this.config.configDir ?? ".vault"}/${name}`, true);
  }

  async readDocument(path: string) { return this.readText(path); }

  private async readText(path: string, configuration = false) {
    if (!configuration && !path.toLowerCase().endsWith(".md")) throw new VaultError("Only Markdown (.md) notes are supported.");
    const file = await this.resolve(path, false, configuration);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink > 1) throw new VaultError("Only regular, non-hard-linked notes are supported.");
      if (before.size > LIMITS.fileBytes) throw new VaultError("Note exceeds the 1 MiB read limit.");
      // Recheck the pathname after opening, before reading any note content.
      const checked = await this.resolve(path, false, configuration);
      const current = await lstat(checked);
      if (current.dev !== before.dev || current.ino !== before.ino) throw new VaultError("Note changed while opening. Retry.");
      const buffer = Buffer.alloc(LIMITS.fileBytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > LIMITS.fileBytes) throw new VaultError("Note exceeds the 1 MiB read limit.");
      const after = await handle.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
        throw new VaultError("Note changed while reading. Retry.");
      }
      const bytes = buffer.subarray(0, length);
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw new VaultError("Note must contain valid UTF-8 text."); }
      return { content, revision: createHash("sha256").update(bytes).digest("hex"), bytes: length };
    } finally { await handle.close(); }
  }

  async readNote(path: string, offset = 0, maxChars: number = LIMITS.pageChars) {
    const note = await this.readDocument(path);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > note.content.length) throw new VaultError("Offset is outside the note.");
    if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > LIMITS.pageChars) throw new VaultError("Invalid page size.");
    // Offsets use JavaScript UTF-16 code units. Avoid splitting surrogate pairs.
    let end = Math.min(offset + maxChars, note.content.length);
    if (end < note.content.length && /[\uD800-\uDBFF]/u.test(note.content[end - 1] ?? "")) end--;
    if (end === offset && end < note.content.length) end = Math.min(offset + 2, note.content.length);
    return { path, revision: note.revision, content: note.content.slice(offset, end), offset,
      nextOffset: end < note.content.length ? end : null, totalChars: note.content.length };
  }

  async listEntries(folder = "", maxDepth = 4, maxEntries = 200, markdownOnly = false) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 64) throw new VaultError("Depth must be between 1 and 64.");
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 5000) throw new VaultError("Entry limit must be between 1 and 5000.");
    await this.resolve(folder, true);
    const entries: { path: string; name: string; type: "file" | "directory"; depth: number }[] = [];
    const queue = [{ path: folder, depth: 0 }];
    let visitedEntries = 0, skippedEntries = 0, truncated = false;
    const limitReasons = new Set<string>();
    outer: while (queue.length) {
      const directory = queue.shift()!;
      let dir;
      try { dir = await opendir(await this.resolve(directory.path, true)); }
      catch { skippedEntries++; continue; }
      for await (const entry of dir) {
        if (++visitedEntries > LIMITS.searchEntries) { truncated = true; limitReasons.add("scan"); break outer; }
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.isSymbolicLink()) continue;
        const path = directory.path ? `${directory.path}/${entry.name}` : entry.name;
        if (this.config.excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))) continue;
        if (!entry.isFile() && !entry.isDirectory()) continue;
        if (markdownOnly && entry.isFile() && !entry.name.toLowerCase().endsWith(".md")) continue;
        try { await this.resolve(path, entry.isDirectory()); } catch { skippedEntries++; continue; }
        const depth = directory.depth + 1;
        entries.push({ path, name: entry.name, type: entry.isDirectory() ? "directory" : "file", depth });
        if (entry.isDirectory()) {
          if (depth < maxDepth) queue.push({ path, depth });
          else { truncated = true; limitReasons.add("depth"); }
        }
        if (entries.length >= maxEntries) { truncated = true; limitReasons.add("entries"); break outer; }
      }
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { folder, entries, skippedEntries, truncated, limitReasons: [...limitReasons] };
  }

  async getTree(folder = "", maxDepth = 4, maxEntries = 200) {
    const result = await this.listEntries(folder, maxDepth, maxEntries);
    const children = new Map<string, typeof result.entries>();
    for (const entry of result.entries) {
      const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
      const siblings = children.get(parent) ?? [];
      siblings.push(entry);
      children.set(parent, siblings);
    }
    const lines = [folder ? `${folder}/` : "/"];
    const render = (parent: string, prefix: string) => {
      const siblings = children.get(parent) ?? [];
      siblings.sort((a, b) => a.type === b.type ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.type === "directory" ? -1 : 1);
      siblings.forEach((entry, index) => {
        const last = index === siblings.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${entry.name}${entry.type === "directory" ? "/" : ""}`);
        if (entry.type === "directory") render(entry.path, prefix + (last ? "    " : "│   "));
      });
    };
    render(folder, "");
    return { ...result, tree: lines.join("\n") };
  }

  async searchNotes(query: string, folder = "", limit = 20) {
    if (!query.trim() || query.length > 200) throw new VaultError("Query must contain 1–200 characters.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new VaultError("Limit must be between 1 and 50.");
    await this.resolve(folder, true);
    const results: { path: string; revision: string; match: string; line: number | null; snippet: string }[] = [];
    const queue = [folder];
    let scannedFiles = 0, visitedEntries = 0, skippedFiles = 0, readBytes = 0, truncated = false;
    const needle = query.normalize("NFC").toLowerCase();
    const matches = (value: string) => value.normalize("NFC").toLowerCase().includes(needle);
    outer: while (queue.length) {
      const directory = queue.shift()!;
      let dir;
      try { dir = await opendir(await this.resolve(directory, true)); }
      catch { skippedFiles++; continue; }
      for await (const entry of dir) {
        if (++visitedEntries > LIMITS.searchEntries) { truncated = true; break outer; }
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.isSymbolicLink()) continue;
        const path = directory ? `${directory}/${entry.name}` : entry.name;
        if (this.config.excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`))) continue;
        if (entry.isDirectory()) { queue.push(path); continue; }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
        if (scannedFiles >= LIMITS.searchFiles || readBytes >= LIMITS.searchBytes) { truncated = true; break outer; }
        scannedFiles++;
        let note;
        try { note = await this.readDocument(path); } catch { skippedFiles++; continue; }
        readBytes += note.bytes;
        const lines = note.content.split(/\r?\n/u);
        const lineIndex = lines.findIndex(matches);
        const pathMatch = matches(path);
        if (!pathMatch && lineIndex < 0) continue;
        const line = lines[lineIndex >= 0 ? lineIndex : 0] ?? "";
        const normalized = line.normalize("NFC");
        const matchIndex = normalized.toLowerCase().indexOf(needle);
        const start = Math.max(0, matchIndex - 80);
        results.push({ path, revision: note.revision, match: pathMatch ? "path" : "content",
          line: lineIndex >= 0 ? lineIndex + 1 : null, snippet: normalized.slice(start, start + 240) });
        if (results.length >= limit) { truncated = true; break outer; }
      }
    }
    return { results, scannedFiles, skippedFiles, truncated };
  }
}

export function safeError(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  return "Unable to access the note or folder. Check its relative path and local permissions.";
}
