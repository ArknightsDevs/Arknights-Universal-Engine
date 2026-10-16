// A minimal document for the UI's tests in Node: elements with styles, children, data sets, classes and listeners;
// a text measures 10 px a character at 20 px, scaled by its font size; no 2D canvas.

/** A CSS property's camel-case name. @param {string} k */
const camel = (k) => k.replace(/^-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class FakeStyle {
  /** Stores a property under its camel-case name, like the page's style. @param {string} k @param {string} v */
  setProperty(k, v) { /** @type {any} */ (this)[camel(k)] = v; }
  /** @param {string} k */
  getPropertyValue(k) { return /** @type {any} */ (this)[camel(k)] ?? ''; }
}

class FakeClassList {
  constructor() { /** @type {Set<string>} */ this.set = new Set(); }
  /** @param {string} c */
  add(c) { this.set.add(c); }
  /** @param {string} c */
  remove(c) { this.set.delete(c); }
  /** @param {string} c */
  contains(c) { return this.set.has(c); }
}

export class FakeElement {
  /** @param {string} tag @param {FakeDocument} doc */
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
    this.style = /** @type {any} */ (new FakeStyle());
    /** @type {FakeElement[]} */ this.children = [];
    /** @type {FakeElement | null} */ this.parentNode = null;
    /** @type {Record<string, string>} */ this.dataset = {};
    this.classList = new FakeClassList();
    /** @type {Record<string, ((e: any) => void)[]>} */ this.listeners = {};
    this.className = ''; this.textContent = ''; this.html = '';
  }

  get innerHTML() { return this.html || this.textContent; }
  set innerHTML(v) { this.html = v; this.textContent = v.replace(/<[^>]+>/g, ''); }
  get offsetWidth() { return this.textContent.length * 10 * (parseFloat(this.style.fontSize) || 20) / 20; }
  get offsetHeight() { return (parseFloat(this.style.fontSize) || 20) * 1.12; }

  /** @param {FakeElement} c */
  appendChild(c) { c.remove(); this.children.push(c); c.parentNode = this; return c; }
  /** @param {...FakeElement} cs */
  append(...cs) { for (const c of cs) this.appendChild(c); }
  /** @param {FakeElement} c @param {FakeElement} ref */
  insertBefore(c, ref) {
    c.remove();
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    c.parentNode = this;
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    const p = this.parentNode.children;
    p.splice(p.indexOf(this), 1);
    this.parentNode = null;
  }
  /** @param {string} t @param {(e: any) => void} f */
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  /** Fires a listener type, with the event's own fields. @param {string} t @param {Record<string, unknown>} [more] */
  fire(t, more = {}) { for (const f of this.listeners[t] ?? []) f({ type: t, stopPropagation() {}, preventDefault() {}, ...more }); }
  focus() { /** @type {any} */ (this.ownerDocument).focused = this; }
}

export class FakeDocument {
  constructor() {
    /** the element last focused @type {FakeElement | null} */
    this.focused = null;
  }
  /** @param {string} tag */
  createElement(tag) { return new FakeElement(tag, this); }
}

/** A fake document typed as the page's. */
export const fakeDocument = () => /** @type {Document} */ (/** @type {unknown} */ (new FakeDocument()));
/** An element typed as the page's. @param {Document} doc */
export const fakeHost = (doc) => /** @type {HTMLElement} */ (doc.createElement('div'));
