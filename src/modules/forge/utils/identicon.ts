/**
 * Deterministic SVG identicon generator for Neo N3 contract hashes.
 *
 * Algorithm:
 *   – 5×5 symmetric grid (left/right mirrored — 15 unique bits)
 *   – Hue, saturation and lightness derived from the hash bytes
 *   – Dark background, bright cell color, same hue family
 *
 * Inspired by GitHub's identicon approach; no external dependencies.
 */

/**
 * Parses a 0x-prefixed hex contract hash into an array of 20 bytes.
 * Handles malformed input gracefully (pads / truncates).
 */
function hashToBytes(contractHash: string): number[] {
  const hex = (
    contractHash.startsWith("0x") ? contractHash.slice(2) : contractHash
  )
    .replace(/[^0-9a-fA-F]/g, "")
    .padEnd(40, "0")
    .slice(0, 40);

  const bytes: number[] = [];
  for (let i = 0; i < 20; i++) {
    bytes.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  }
  return bytes;
}

/**
 * Generates a deterministic SVG string for the given contract hash.
 *
 * @param contractHash   0x-prefixed Neo N3 script hash (42 chars)
 * @param size           Rendered pixel dimensions (default 36)
 */
export function generateIdenticon(
  contractHash: string,
  size = 36
): string {
  const bytes = hashToBytes(contractHash);

  // ── Color derivation ────────────────────────────────────────────────────
  // Hue: spread evenly around the wheel using the first two bytes
  const hue = ((bytes[0] << 8) | bytes[1]) % 360;
  // Saturation: 55–85 % (always vivid)
  const sat = 55 + (bytes[2] % 30);
  // Cell lightness: 50–70 % (readable on dark bg)
  const cellLight = 50 + (bytes[3] % 20);
  // Background lightness: 10–20 % (dark, not pure black)
  const bgLight = 10 + (bytes[4] % 10);

  const cellColor = `hsl(${hue},${sat}%,${cellLight}%)`;
  const bgColor = `hsl(${hue},${sat}%,${bgLight}%)`;

  // ── Grid derivation ─────────────────────────────────────────────────────
  // 5×5 symmetric grid → 3 unique cols × 5 rows = 15 bits
  // We use bytes 5..6 (16 bits) — last bit unused.
  const gridBits =
    ((bytes[5] ?? 0) << 8) |
    (bytes[6] ?? 0);

  const cells: boolean[][] = [];
  let bit = 15; // we have 16 bits; consume from MSB
  for (let row = 0; row < 5; row++) {
    const row5: boolean[] = new Array(5).fill(false);
    for (let col = 0; col < 3; col++) {
      const on = ((gridBits >> bit) & 1) === 1;
      row5[col] = on;
      row5[4 - col] = on; // mirror
      bit--;
    }
    cells.push(row5);
  }

  // ── SVG generation ───────────────────────────────────────────────────────
  const pad = size * 0.1;                  // 10 % padding on each side
  const inner = size - pad * 2;
  const cell = inner / 5;
  const rx = cell * 0.18;                  // slight rounding on cells

  let rects = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (!cells[row][col]) continue;
      const x = (pad + col * cell).toFixed(2);
      const y = (pad + row * cell).toFixed(2);
      const wh = cell.toFixed(2);
      rects += `<rect x="${x}" y="${y}" width="${wh}" height="${wh}" rx="${rx.toFixed(2)}" fill="${cellColor}"/>`;
    }
  }

  // Outer circle clip keeps the identicon pill-shaped like a standard avatar
  const r = (size / 2).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${bgColor}"/>` +
    rects +
    `</svg>`
  );
}

/**
 * Returns a `data:image/svg+xml;base64,...` URI ready for use in
 * an `<img src>` or CSS `background-image`.
 */
export function generateIdenticonDataUrl(
  contractHash: string,
  size = 36
): string {
  return (
    "data:image/svg+xml;base64," +
    btoa(generateIdenticon(contractHash, size))
  );
}
