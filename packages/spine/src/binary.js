// The primitive values of a Spine 3.8 binary skeleton (docs/spec/spine.md 骨骼-1): big-endian bytes, shorts, 32-bit
// integers and floats, variable-length integers, booleans, UTF-8 strings with a length prefix, and references into the
// skeleton's string table.

/** A cursor over the bytes of a binary skeleton. */
export class BinaryReader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
    /** @type {string[]} the string table, read after the header (骨骼-2) */
    this.strings = [];
  }

  /** @param {number} n */
  need(n) {
    if (this.pos + n > this.bytes.length) throw new RangeError(`skeleton: read past the end at byte ${this.pos}`);
  }

  /** A signed byte. */
  byte() {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }

  /** A signed big-endian 16-bit integer. */
  short() {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  /** A signed big-endian 32-bit integer. */
  int32() {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  /** A big-endian 32-bit float, as the number it is exactly. */
  float() {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }

  /** A boolean: any byte but 0 is true. */
  bool() {
    return this.byte() !== 0;
  }

  /**
   * A variable-length integer: 7 bits a byte, low bits first, the high bit saying another byte follows (at most 5).
   * Unless `positive`, it is zigzag-encoded.
   * @param {boolean} positive
   */
  varint(positive) {
    let result = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const b = this.byte();
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
    }
    return positive ? result : (result >>> 1) ^ -(result & 1);
  }

  /** A string: its byte count + 1 as a positive varint (0: null, 1: empty), then UTF-8. @returns {string | null} */
  string() {
    const n = this.varint(true);
    if (n === 0) return null;
    if (n === 1) return '';
    this.need(n - 1);
    const s = new TextDecoder('utf-8').decode(this.bytes.subarray(this.pos, this.pos + n - 1));
    this.pos += n - 1;
    return s;
  }

  /** A reference into the string table: an index + 1 as a positive varint, 0 for null. @returns {string | null} */
  stringRef() {
    const i = this.varint(true);
    if (i === 0) return null;
    if (i > this.strings.length) throw new RangeError(`skeleton: string reference ${i} past the table of ${this.strings.length}`);
    return this.strings[i - 1];
  }

  /** n floats, each times `scale`. @param {number} n @param {number} [scale] */
  floats(n, scale = 1) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.float() * scale;
    return out;
  }

  /** A count as a positive varint, then that many shorts. */
  shorts() {
    const n = this.varint(true), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.short();
    return out;
  }
}
