// ESLint (flat config) from @aue/lint: the maintainability limits, the package boundaries, the determinism rules for
// the code every peer and the server must run to the same bits, and who may write which unit field (ADR 0045).
import { readFileSync } from 'node:fs';
import { aueConfig } from '@aue/lint';

/** The unit field ownership table, without its comment. */
const fields = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./packages/sim/fields.json', import.meta.url), 'utf8')))
  .filter(([k]) => !k.startsWith('$')));

export default aueConfig({
  deterministic: ['packages/math/src/**', 'packages/sim/src/**', 'packages/content/src/**'],
  fieldOwnership: { files: ['packages/sim/src/**', 'packages/content/src/**'], fields },
  exempt: [],
  // agents' git worktrees live under .claude/
  ignores: ['.claude/'],
});
