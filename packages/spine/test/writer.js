// A small writer of the Spine 3.8 binary primitives, for tests: it builds skeletons byte by byte so the reader can be
// checked on every section and code without shipping any real skeleton.

/** Bytes written in order. */
export class Writer {
  constructor() {
    /** @type {number[]} */
    this.out = [];
    /** @type {string[]} */
    this.table = [];
  }

  /** @param {number} b */
  byte(b) { this.out.push(b & 0xff); return this; }
  /** @param {boolean} v */
  bool(v) { return this.byte(v ? 1 : 0); }
  /** @param {number} v */
  short(v) { return this.byte(v >> 8).byte(v); }
  /** @param {number} v */
  int32(v) { return this.byte(v >>> 24).byte(v >>> 16).byte(v >>> 8).byte(v); }
  /** @param {number} v */
  float(v) {
    const d = new DataView(new ArrayBuffer(4));
    d.setFloat32(0, v);
    for (let i = 0; i < 4; i++) this.byte(d.getUint8(i));
    return this;
  }

  /** A varint, zigzag-encoded unless `positive`. @param {number} v @param {boolean} [positive] */
  varint(v, positive = true) {
    let u = positive ? v >>> 0 : ((v << 1) ^ (v >> 31)) >>> 0;
    do {
      const b = u & 0x7f;
      u >>>= 7;
      this.byte(u ? b | 0x80 : b);
    } while (u);
    return this;
  }

  /** @param {string | null} s */
  string(s) {
    if (s === null) return this.varint(0);
    const b = new TextEncoder().encode(s);
    this.varint(b.length + 1);
    for (const x of b) this.byte(x);
    return this;
  }

  /** A reference into the string table, adding the string when it is new. @param {string | null} s */
  ref(s) {
    if (s === null) return this.varint(0);
    let i = this.table.indexOf(s);
    if (i < 0) i = this.table.push(s) - 1;
    return this.varint(i + 1);
  }

  /** @param {number[]} vs */
  floats(vs) { for (const v of vs) this.float(v); return this; }

  bytes() { return Uint8Array.from(this.out); }
}

/**
 * A whole skeleton: the header and string table (whose strings are known only once the body is written), then the body.
 * @param {(w: Writer) => void} body writes everything after the string table
 * @param {{ version?: string, nonessential?: boolean }} [o]
 */
export function skeleton(body, o = {}) {
  const b = new Writer();
  body(b);
  const h = new Writer();
  h.string('hash').string(o.version ?? '3.8.99').floats([1, 2, 30, 40]).bool(!!o.nonessential);
  if (o.nonessential) h.float(30).string('./images/').string(null);
  h.varint(b.table.length);
  for (const s of b.table) h.string(s);
  return Uint8Array.from([...h.out, ...b.out]);
}
