// @aue/sdk: the SDK for mod authors (ADR 0064) — mods' folders read as a host reads them, checked, played headless,
// packed; new mods from the template; the JSON Schemas of their files. The command line is cli.js (`aue`).
export { readModFolder, readModFolders, isModFolder } from './folders.js';
export { checkMods } from './check.js';
export { playMods } from './play.js';
export { packMod } from './pack.js';
export { newMod } from './new.js';
export { SCHEMA_BASE, packSchema, dataSchema, schemaFiles } from './schemas.js';
export { zip, crc32 } from './zip.js';
/** @typedef {import('./folders.js').ReadFolder} ReadFolder @typedef {import('./play.js').Played} Played */
