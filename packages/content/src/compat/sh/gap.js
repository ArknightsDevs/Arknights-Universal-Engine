// The compat layer's gaps (docs/spec/compat.md 兼容-2): a name a Stronghold kit imports that the layer does not stand in
// for yet. Loading a kit needs the name to exist; calling it throws, naming the module and the name, so a kit that
// reaches a gap fails loudly instead of doing something else.

/** A call into a part of the Stronghold interface the compat layer does not provide yet. */
export class CompatGap extends Error {
  /** @param {string} name module.name */
  constructor(name) {
    super(`compat: ${name} is not provided yet`);
    this.name = 'CompatGap';
    this.what = name;
  }
}

/** A stand-in that throws CompatGap when called. @param {string} name module.name @returns {(...args: unknown[]) => never} */
export const gap = (name) => () => { throw new CompatGap(name); };
