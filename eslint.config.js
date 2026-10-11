// ESLint (flat config) from @aue/lint: the maintainability limits, the package boundaries, and the determinism rules
// for the code every peer and the server must run to the same bits.
import { aueConfig } from '@aue/lint';

export default aueConfig({
  deterministic: ['packages/math/src/**', 'packages/sim/src/**', 'packages/content/src/**'],
  exempt: [],
});
