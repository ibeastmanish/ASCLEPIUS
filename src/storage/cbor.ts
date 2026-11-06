// Minimal CBOR (RFC 8949) encoder/decoder for outbox payloads.
// Supports: null, undefined (as null), booleans, numbers, strings, Uint8Array,
// arrays and plain objects. Enough for compact, deterministic summaries.

type CborValue = null | undefined | boolean | number | string | Uint8Array | CborValue[] | { [k: string]: CborValue };

class Writer {
  private buf = new Uint8Array(256);
  private len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap);
    b.set(this.buf.subarray(0, this.len));
    this.buf = b;
  }
  byte(b: number) { this.ensure(1); this.buf[this.len++] = b; }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  head(major: number, n: number) {
    const m = major << 5;
    if (n < 24) this.byte(m | n);
    else if (n < 0x100) { this.byte(m | 24); this.byte(n); }
    else if (n < 0x10000) { this.byte(m | 25); this.byte(n >> 8); this.byte(n & 0xff); }
    else if (n < 0x100000000) { this.byte(m | 26); const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, n); this.bytes(new Uint8Array(d.buffer)); }
    else { this.byte(m | 27); const d = new DataView(new ArrayBuffer(8)); d.setBigUint64(0, BigInt(n)); this.bytes(new Uint8Array(d.buffer)); }
  }
  out() { return this.buf.slice(0, this.len); }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function write(w: Writer, v: CborValue): void {
  if (v === null || v === undefined) return w.byte(0xf6);
  if (v === false) return w.byte(0xf4);
  if (v === true) return w.byte(0xf5);
  if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) {
      return v >= 0 ? w.head(0, v) : w.head(1, -1 - v);
    }
    w.byte(0xfb);
    const d = new DataView(new ArrayBuffer(8));
    d.setFloat64(0, v);
    return w.bytes(new Uint8Array(d.buffer));
  }
  if (typeof v === "string") { const b = enc.encode(v); w.head(3, b.length); return w.bytes(b); }
  if (v instanceof Uint8Array) { w.head(2, v.length); return w.bytes(v); }
  if (Array.isArray(v)) { w.head(4, v.length); for (const x of v) write(w, x); return; }
  const keys = Object.keys(v).filter((k) => v[k] !== undefined);
  w.head(5, keys.length);
  for (const k of keys) { write(w, k); write(w, v[k]); }
}

export function encode(v: unknown): Uint8Array {
  const w = new Writer();
  write(w, v as CborValue);
  return w.out();
}

export function decode(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const len = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return view.getUint8(p++);
    if (info === 25) { const n = view.getUint16(p); p += 2; return n; }
    if (info === 26) { const n = view.getUint32(p); p += 4; return n; }
    if (info === 27) { const n = Number(view.getBigUint64(p)); p += 8; return n; }
    throw new Error("CBOR: unsupported length");
  };
  const read = (): unknown => {
    const ib = view.getUint8(p++);
    const major = ib >> 5;
    const info = ib & 0x1f;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); const b = bytes.slice(p, p + n); p += n; return b; }
      case 3: { const n = len(info); const s = dec.decode(bytes.subarray(p, p + n)); p += n; return s; }
      case 4: { const n = len(info); const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; }
      case 5: { const n = len(info); const o: Record<string, unknown> = {}; for (let i = 0; i < n; i++) { const k = read() as string; o[k] = read(); } return o; }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22 || info === 23) return null;
        if (info === 27) { const f = view.getFloat64(p); p += 8; return f; }
        throw new Error("CBOR: unsupported simple/float");
      default: throw new Error(`CBOR: unsupported major type ${major}`);
    }
  };
  const v = read();
  if (p !== bytes.length) throw new Error("CBOR: trailing bytes");
  return v;
}
