// A Node loader hook for the compatibility test (docs/spec/compat.md 兼容-1): the oracle's constants module, as the kits
// import it, resolves to a wrapper whose COLS and ROWS are our live grid's — the way the import mapping table will point
// the kits at our modules (ADR 0010). The wrapper's own import of the original passes through.

/** @type {{ constants: string, wrapper: string }} */
let data;

/** @param {{ constants: string, wrapper: string }} d */
export function initialize(d) {
  data = d;
}

/** @param {string} specifier @param {{ parentURL?: string }} context @param {Function} next */
export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url === data.constants && context.parentURL !== data.wrapper) return { url: data.wrapper, shortCircuit: true };
  return r;
}
