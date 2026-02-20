/**
 * Neo N3 contract hash computation.
 *
 * Implements the deterministic formula used by ContractManagement.Deploy:
 *   contractHash = Hash160(ABORT || EmitPush(sender) || EmitPush(nefChecksum) || EmitPush(name))
 * where Hash160 = RIPEMD160(SHA256(bytes))
 *
 * This lets us know the deployed contract hash BEFORE submitting the tx.
 *
 * RIPEMD-160 reference: https://homes.esat.kuleuven.be/~bosCOSclaes/ripemd160.html
 */

// ---------------------------------------------------------------------------
// RIPEMD-160 pure-JS implementation
// ---------------------------------------------------------------------------

const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
const SL = [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12],
  [11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5],
  [11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12],
  [9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6],
];
const SR = [
  [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6],
  [9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11],
  [9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5],
  [15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8],
  [8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11],
];
const RL = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8],
  [3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12],
  [1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2],
  [4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13],
];
const RR = [
  [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12],
  [6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2],
  [15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13],
  [8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14],
  [12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11],
];

function f(j: number, x: number, y: number, z: number): number {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function ripemd160(data: Uint8Array): Uint8Array {
  // Pad message
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen % 64) < 56 ? 56 - (msgLen % 64) : 120 - (msgLen % 64));
  const padded = new Uint8Array(msgLen + padLen + 8);
  padded.set(data);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

  for (let blk = 0; blk < padded.length; blk += 64) {
    const X: number[] = [];
    for (let i = 0; i < 16; i++) X.push(dv.getUint32(blk + i * 4, true));

    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

    for (let j = 0; j < 80; j++) {
      const round = Math.floor(j / 16);
      let tl = rotl((al + f(j, bl, cl, dl) + X[RL[round][j % 16]] + KL[round]) >>> 0, SL[round][j % 16]);
      tl = (tl + el) >>> 0;
      al = el; el = dl; dl = rotl(cl, 10); cl = bl; bl = tl;

      let tr = rotl((ar + f(79 - j, br, cr, dr) + X[RR[round][j % 16]] + KR[round]) >>> 0, SR[round][j % 16]);
      tr = (tr + er) >>> 0;
      ar = er; er = dr; dr = rotl(cr, 10); cr = br; br = tr;
    }

    const t = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = t;
  }

  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0, true); ov.setUint32(4, h1, true);
  ov.setUint32(8, h2, true); ov.setUint32(12, h3, true);
  ov.setUint32(16, h4, true);
  return out;
}

// ---------------------------------------------------------------------------
// Script builder helpers (mirrors Neo C# ScriptBuilder)
// ---------------------------------------------------------------------------

function emitPushBytes(out: number[], data: Uint8Array): void {
  if (data.length <= 255) {
    out.push(0x0c, data.length);   // PUSHDATA1
  } else if (data.length <= 65535) {
    out.push(0x0d, data.length & 0xff, (data.length >> 8) & 0xff); // PUSHDATA2
  } else {
    const l = data.length;
    out.push(0x0e, l & 0xff, (l >> 8) & 0xff, (l >> 16) & 0xff, (l >> 24) & 0xff); // PUSHDATA4
  }
  data.forEach((b) => out.push(b));
}

function emitPushUint32(out: number[], value: number): void {
  if (value === 0) { out.push(0x10); return; }           // PUSH0
  if (value >= 1 && value <= 16) { out.push(0x10 + value); return; } // PUSH1-16

  // Minimal signed little-endian byte array
  const bytes: number[] = [];
  let n = value >>> 0;
  while (n > 0) { bytes.push(n & 0xff); n >>>= 8; }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0x00); // sign byte for positive

  if (bytes.length === 1) { out.push(0x00, bytes[0]); }                                 // PUSHINT8
  else if (bytes.length === 2) { out.push(0x01, bytes[0], bytes[1]); }                  // PUSHINT16
  else if (bytes.length <= 4) { out.push(0x02); for (let i = 0; i < 4; i++) out.push(bytes[i] ?? 0); } // PUSHINT32
  else { out.push(0x03); for (let i = 0; i < 8; i++) out.push(bytes[i] ?? 0); }        // PUSHINT64
}

// ---------------------------------------------------------------------------
// Base58 (no-check) decoder
// ---------------------------------------------------------------------------

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let num = BigInt(0);
  for (const c of s) {
    const idx = BASE58_CHARS.indexOf(c);
    if (idx === -1) throw new Error(`Invalid base58 char: ${c}`);
    num = num * 58n + BigInt(idx);
  }
  let leadingZeros = 0;
  for (const c of s) {
    if (c !== "1") break;
    leadingZeros++;
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a Neo N3 address (Base58Check) to a "0x" + LE-hex script hash.
 *
 * Neo N3 addresses are encoded as:
 *   Base58Check( 0x35 || scriptHash_LE_20bytes )
 * The decoded LE bytes are already in the format expected by computeContractHash.
 */
export async function addressToScriptHash(address: string): Promise<string> {
  const decoded = base58Decode(address); // 25 bytes: [version(1)] [hashLE(20)] [checksum(4)]
  if (decoded.length !== 25) throw new Error(`Invalid Neo N3 address length: ${decoded.length}`);
  if (decoded[0] !== 0x35) throw new Error(`Invalid address version byte: 0x${decoded[0].toString(16)}`);

  // Verify checksum: SHA256(SHA256(first 21 bytes)) → first 4 bytes must match last 4
  const payload = decoded.slice(0, 21);
  const sha1 = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  const sha2 = new Uint8Array(await crypto.subtle.digest("SHA-256", sha1));
  for (let i = 0; i < 4; i++) {
    if (decoded[21 + i] !== sha2[i]) throw new Error("Invalid address checksum");
  }

  // The base58 BigInt decode builds bytes big-endian (via unshift), so
  // decoded[1:21] is the hash in big-endian order — reverse to get LE.
  const scriptHashLE = Array.from(decoded.slice(1, 21)).reverse();
  return "0x" + scriptHashLE.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Reads the NEF checksum from the last 4 bytes of the NEF file (LE uint32).
 */
export function readNefChecksum(nefBytes: Uint8Array): number {
  const view = new DataView(nefBytes.buffer, nefBytes.byteOffset + nefBytes.byteLength - 4, 4);
  return view.getUint32(0, true);
}

/**
 * Computes the Neo N3 contract hash that will result from deploying a contract
 * with the given NEF and manifest name, by the given sender address.
 *
 * @param senderHashHex  Sender's script hash as "0x" + LE hex (42 chars), e.g. "0xf4cc01b3..."
 * @param nefBytes       Raw NEF file bytes (used to extract the checksum)
 * @param manifestName   The "name" field from the manifest JSON (e.g. "TokenFactory")
 * @returns              Contract hash as "0x" + LE hex (42 chars)
 */
export async function computeContractHash(
  senderHashHex: string,
  nefBytes: Uint8Array,
  manifestName: string
): Promise<string> {
  // Parse sender script hash LE bytes from "0xf4cc01b3..."
  const hex = senderHashHex.startsWith("0x") ? senderHashHex.slice(2) : senderHashHex;
  const senderLE = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  const checksum = readNefChecksum(nefBytes);
  const nameBytes = new TextEncoder().encode(manifestName);

  // Build script: ABORT + EmitPush(senderLE) + EmitPush(checksum) + EmitPush(name)
  const script: number[] = [];
  script.push(0x40); // OpCode.ABORT
  emitPushBytes(script, senderLE);
  emitPushUint32(script, checksum);
  emitPushBytes(script, nameBytes);

  // Hash160 = RIPEMD160(SHA256(script))
  const scriptBytes = new Uint8Array(script);
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", scriptBytes));
  const hash = ripemd160(sha);

  return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}
