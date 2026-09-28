import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_INSTRUCTION_NAMES, getApplicableInstructions } from './instructions.js';
import { Vault, VaultError } from './vault.js';

type Review = {path: string; names: string[]; snapshot: string; expires: number};
const fingerprint = (value: Awaited<ReturnType<typeof getApplicableInstructions>>) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const complete = (value: Awaited<ReturnType<typeof getApplicableInstructions>>) =>
  !value.truncated && value.skippedFiles === 0 && value.incompleteScopes.length === 0;

/** Session-local evidence that the client requested complete applicable instructions. */
export class InstructionReviews {
  private readonly reviews = new Map<string, Review>();
  constructor(private readonly vault: Vault, private readonly now = Date.now) {}

  async inspect(path: string, targetType: 'file' | 'directory', names: string[]) {
    const result = await getApplicableInstructions(this.vault, path, targetType, names);
    const hasDefaults = DEFAULT_INSTRUCTION_NAMES.every(name => names.some(n => n.toLowerCase() === name.toLowerCase()));
    let reviewToken: string | null = null;
    if (targetType === 'file' && path.toLowerCase().endsWith('.md') && hasDefaults && complete(result)) {
      for (const [key, review] of this.reviews) if (review.expires <= this.now()) this.reviews.delete(key);
      while (this.reviews.size >= 256) this.reviews.delete(this.reviews.keys().next().value!);
      reviewToken = randomUUID();
      this.reviews.set(reviewToken, {path, names: [...names], snapshot: fingerprint(result), expires: this.now() + 300_000});
    }
    return {...result, reviewToken, reviewExpiresInSeconds: reviewToken ? 300 : null,
      reviewNotice: 'Writes require a complete file-target review including AGENTS.md, CLAUDE.md and INSTRUCTIONS.md. Apply the returned guidance; the token proves retrieval, not comprehension. Incomplete reviews cannot authorize writes.'};
  }

  async verify(path: string, token: string) {
    const review = this.reviews.get(token);
    if (!review || review.path !== path || review.expires <= this.now()) {
      throw new VaultError('Instruction review required. Call get_applicable_instructions for this exact file path and pass its fresh reviewToken.');
    }
    const current = await getApplicableInstructions(this.vault, path, 'file', review.names);
    if (!complete(current) || fingerprint(current) !== review.snapshot) {
      this.reviews.delete(token);
      throw new VaultError('Applicable instructions changed or could not be fully read. Review them again before writing.');
    }
  }

  consume(token: string) { this.reviews.delete(token); }
}
