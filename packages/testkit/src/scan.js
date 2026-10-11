// Source scans for the compatibility layer (ADR 0056): where a module reads given names when it is loaded — outside every
// function, so the value read then stays — as opposed to inside functions, where each call reads the value of the moment.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** @type {{ parse(code: string, options: object): any }} */
const espree = require('espree');

/** Keys of a node that are not child nodes. */
const SKIP = new Set(['type', 'loc', 'range', 'start', 'end', 'parent']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * Whether an identifier node is a read of the variable (not a property name, an object key, a declaration, or a name
 * in an import or export list).
 * @param {any} node @param {any} parent @param {string} key
 */
function isRead(node, parent, key) {
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return false;
  if (parent.type === 'Property' && key === 'key' && !parent.computed) return false;
  if (parent.type === 'VariableDeclarator' && key === 'id') return false;
  return !['ImportSpecifier', 'ExportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(parent.type);
}

/**
 * The places a module reads any of `names` while it loads (outside every function body), with their line numbers.
 * @param {string} source an ES module @param {string[]} names @returns {{ name: string, line: number }[]}
 */
export function loadTimeReads(source, names) {
  const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
  const wanted = new Set(names);
  /** @type {{ name: string, line: number }[]} */
  const out = [];
  /** @param {any} node @param {any} parent @param {string} key @param {number} depth */
  const walk = (node, parent, key, depth) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier' && wanted.has(node.name) && depth === 0 && isRead(node, parent, key)) out.push({ name: node.name, line: node.loc.start.line });
    const inner = FUNCTIONS.has(node.type) ? depth + 1 : depth;
    for (const [k, v] of Object.entries(node)) {
      if (SKIP.has(k)) continue;
      if (Array.isArray(v)) for (const x of v) walk(x, node, k, inner);
      else if (v && typeof v === 'object') walk(v, node, k, inner);
    }
  };
  walk(ast, null, '', 0);
  return out;
}
