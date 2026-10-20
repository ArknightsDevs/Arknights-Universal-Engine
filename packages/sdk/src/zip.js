// A zip archive written the same every time (docs/mods.md, `aue mod pack`): deflated entries in the given order, UTF-8
// names, every time stamp 1980-01-01 00:00, no extra fields.
import { deflateRawSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** @param {Uint8Array} bytes @returns {number} the CRC-32 of the bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 in the zip's DOS date: day 1, month 1, year 0. */
const DOS_DATE = (1 << 5) | 1, UTF8_NAMES = 0x0800, DEFLATE = 8, VERSION = 20;

/**
 * A local header or a central directory entry.
 * @param {{ name: Buffer, crc: number, size: number, packed: number }} e @param {number | null} offset the local header's offset, for a central entry
 */
function header(e, offset) {
  const central = offset !== null, h = Buffer.alloc(central ? 46 : 30);
  let at = 0;
  const u16 = (/** @type {number} */ v) => { at = h.writeUInt16LE(v, at); };
  const u32 = (/** @type {number} */ v) => { at = h.writeUInt32LE(v, at); };
  u32(central ? 0x02014b50 : 0x04034b50);
  if (central) u16(VERSION);
  [VERSION, UTF8_NAMES, DEFLATE, 0, DOS_DATE].forEach(u16);
  [e.crc, e.packed, e.size].forEach(u32);
  u16(e.name.length);
  u16(0);
  if (central) {
    [0, 0, 0].forEach(u16);
    [0, /** @type {number} */ (offset)].forEach(u32);
  }
  return Buffer.concat([h, e.name]);
}

/**
 * A zip archive of the entries, in their order.
 * @param {{ name: string, data: Uint8Array }[]} entries @returns {Buffer}
 */
export function zip(entries) {
  /** @type {Buffer[]} */
  const parts = [];
  /** @type {Buffer[]} */
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const packed = deflateRawSync(data, { level: 9 });
    const e = { name: Buffer.from(name, 'utf8'), crc: crc32(data), size: data.length, packed: packed.length };
    const local = header(e, null);
    central.push(header(e, offset));
    parts.push(local, packed);
    offset += local.length + packed.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
