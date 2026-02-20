import { describe, it, expect } from "vitest";
import { generateIdenticon, generateIdenticonDataUrl } from "./identicon";

const HASH_A = "0x6f8a483ee6b7aab966dea67680e180acf8679759"; // HUSH
const HASH_B = "0xebdd25f31701932699db477b4324fca296cc40be"; // ONE
const HASH_ZERO = "0x0000000000000000000000000000000000000000";

describe("generateIdenticon", () => {
  it("returns a valid SVG string", () => {
    const svg = generateIdenticon(HASH_A);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("xmlns=");
  });

  it("is deterministic — same hash produces same SVG", () => {
    expect(generateIdenticon(HASH_A)).toBe(generateIdenticon(HASH_A));
    expect(generateIdenticon(HASH_B)).toBe(generateIdenticon(HASH_B));
  });

  it("produces different output for different hashes", () => {
    expect(generateIdenticon(HASH_A)).not.toBe(generateIdenticon(HASH_B));
  });

  it("handles a zero hash without throwing", () => {
    expect(() => generateIdenticon(HASH_ZERO)).not.toThrow();
    expect(generateIdenticon(HASH_ZERO)).toContain("<svg");
  });

  it("handles hash without 0x prefix", () => {
    const withPrefix = generateIdenticon(HASH_A);
    const withoutPrefix = generateIdenticon(HASH_A.slice(2));
    expect(withPrefix).toBe(withoutPrefix);
  });

  it("respects the size parameter", () => {
    const small = generateIdenticon(HASH_A, 24);
    const large = generateIdenticon(HASH_A, 80);
    expect(small).toContain('width="24"');
    expect(large).toContain('width="80"');
  });

  it("embeds an HSL background color", () => {
    const svg = generateIdenticon(HASH_A);
    expect(svg).toMatch(/hsl\(\d+,\d+%,\d+%\)/);
  });
});

describe("generateIdenticonDataUrl", () => {
  it("returns a base64 data URI", () => {
    const url = generateIdenticonDataUrl(HASH_A);
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("is deterministic", () => {
    expect(generateIdenticonDataUrl(HASH_A)).toBe(
      generateIdenticonDataUrl(HASH_A)
    );
  });

  it("decodes back to valid SVG", () => {
    const url = generateIdenticonDataUrl(HASH_A);
    const b64 = url.replace("data:image/svg+xml;base64,", "");
    const decoded = atob(b64);
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("</svg>");
  });
});
