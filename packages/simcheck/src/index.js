// @aue/simcheck: the cross-engine check (docs/spec/lockstep.md 同步-12; shared with Duel Channel and Stronghold
// Protocol): fixed matches simulated in Node and in each browser engine, their state hashes compared. The browser
// side (browsers.js, Playwright) and the command line (cli.js) are Node-only; the matches run anywhere.
export { SCENARIOS, HASH_EVERY, FRAMES, scriptOf, runScenario, runAll, kitsAt } from './scenarios.js';
export { firstDifference } from './compare.js';
