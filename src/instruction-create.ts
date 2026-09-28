import {posix} from 'node:path';
import {DEFAULT_INSTRUCTION_NAMES, getApplicableInstructions} from './instructions.js';
import {InstructionReviews} from './instruction-review.js';
import {LIMITS, Vault, VaultError} from './vault.js';

/** Create discoverable guidance without replacing existing rules or bypassing reviews. */
export async function createInstructionFile(vault: Vault, reviews: InstructionReviews,
  path: string, content: string, reviewToken: string, dryRun = true) {
  vault.validateScope(path);
  if (!DEFAULT_INSTRUCTION_NAMES.some(name => name.toLowerCase() === posix.basename(path).toLowerCase())) {
    throw new VaultError('Use AGENTS.md, CLAUDE.md, or INSTRUCTIONS.md as the instruction filename.');
  }
  if (!content.trim() || content.length > LIMITS.pageChars) {
    throw new VaultError('Instruction content must be nonempty and at most 20,000 UTF-16 code units.');
  }
  await reviews.verify(path, reviewToken);
  const current = await getApplicableInstructions(vault, path, 'file', DEFAULT_INSTRUCTION_NAMES);
  if (current.truncated || current.skippedFiles || current.incompleteScopes.length ||
    current.instructions.reduce((size, item) => size + item.totalChars, content.length) > 40_000) {
    throw new VaultError('The resulting guidance would exceed the complete review limit. Shorten or reorganize scoped instructions first.');
  }
  const result = await vault.createNote(path, content, dryRun);
  if (result.applied) reviews.consume(reviewToken);
  const parent = posix.dirname(path);
  return {...result, scope: parent === '.' ? '' : parent};
}
