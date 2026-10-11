// The field-ownership rule (ADR 0045). A table says which files may write which unit field; any other file that writes the
// field (x.p = v, x.p += v, x.p++, delete x.p, x['p'] = v, a destructuring target, Object.assign(x, { p })) is an error.
// Creating a new object ({ p: 1 } in a return or a const) is not a write: constructors and factories initialise fields that way.
// Computed non-literal keys and non-literal Object.assign sources cannot be seen statically and are ignored.
import { relative, sep } from 'node:path';

/** @typedef {{ fields: Record<string, string[]>, root?: string }} FieldOwnershipOptions */

/** A glob as a regex: `**` crosses directories, `*` and `?` stay inside one path segment, the rest is literal. @param {string} glob */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      out += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Whether a root-relative forward-slash path matches any of the globs. @param {string} path @param {string[]} globs */
export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

/** The statically known property name of a member expression, or null. @param {any} node */
function memberName(node) {
  const p = node.property;
  if (!node.computed) return p.type === 'Identifier' ? p.name : null;
  return p.type === 'Literal' && typeof p.value === 'string' ? p.value : null;
}

/** The statically known key of an object-literal property, or null. @param {any} prop */
function keyName(prop) {
  if (prop.type !== 'Property') return null;
  const k = prop.key;
  if (!prop.computed && k.type === 'Identifier') return k.name;
  return k.type === 'Literal' && typeof k.value === 'string' ? k.value : null;
}

/** @param {string} file @param {string} root the path relative to root, forward slashes */
function relativePath(file, root) {
  return relative(root, file).split(sep).join('/');
}

/** @type {import('eslint').Rule.RuleModule} */
export const fieldOwnership = {
  meta: {
    type: 'problem',
    docs: { description: 'unit fields are written only by the modules the ownership table names' },
    schema: [{
      type: 'object',
      properties: {
        fields: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        root: { type: 'string' },
      },
      required: ['fields'],
      additionalProperties: false,
    }],
    messages: { notOwner: 'Only {{owners}} may write the unit field "{{field}}" (ADR 0045).' },
  },
  create(context) {
    /** @type {FieldOwnershipOptions} */
    const opts = context.options[0] ?? { fields: {} };
    const table = new Map(Object.entries(opts.fields));
    const path = relativePath(context.filename, opts.root ?? context.cwd);

    /** @param {any} node the reported node @param {string | null} name */
    const check = (node, name) => {
      const owners = name === null ? undefined : table.get(name);
      if (!owners || matchesAny(path, owners)) return;
      context.report({ node, messageId: 'notOwner', data: { owners: owners.join(', '), field: String(name) } });
    };

    /** A write target: a member expression, or a destructuring pattern holding some. @param {any} node */
    const target = (node) => {
      if (!node) return;
      switch (node.type) {
        case 'MemberExpression': check(node, memberName(node)); break;
        case 'ChainExpression': target(node.expression); break;
        case 'ObjectPattern': for (const p of node.properties) target(p.type === 'Property' ? p.value : p); break;
        case 'ArrayPattern': for (const e of node.elements) target(e); break;
        case 'AssignmentPattern': target(node.left); break;
        case 'RestElement': target(node.argument); break;
        default: break;
      }
    };

    /** @param {any} node a for-in / for-of statement */
    const loopTarget = (node) => { if (node.left.type !== 'VariableDeclaration') target(node.left); };

    return {
      AssignmentExpression: (node) => target(node.left),
      UpdateExpression: (node) => target(node.argument),
      UnaryExpression: (node) => { if (node.operator === 'delete') target(node.argument); },
      ForInStatement: loopTarget,
      ForOfStatement: loopTarget,
      CallExpression(node) {
        const c = node.callee;
        const isAssign = c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Object' && memberName(c) === 'assign';
        if (!isAssign) return;
        for (const arg of node.arguments.slice(1)) {
          if (arg.type === 'ObjectExpression') for (const prop of arg.properties) check(prop, keyName(prop));
        }
      },
    };
  },
};
