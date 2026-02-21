/**
 * e2e/fix-wallet-magic-number.cjs
 *
 * One-time patch for the NeoLine wallet profile LevelDB:
 * Changes `"magicNumber":"5195086"` (string) → `"magicNumber":5195086`  (number)
 * in the n3Networks chrome.storage.local entry.
 *
 * The patch is SIZE-PRESERVING: the quoted string `"5195086"` (9 bytes) is
 * replaced with `5195086  ` (7 digits + 2 spaces = 9 bytes).  Trailing
 * whitespace before a JSON comma is legal, so the JSON remains valid.
 * Because the byte count is unchanged, the LevelDB WAL record length and
 * CRC32-C checksum are still correct — no binary reformatting required.
 *
 * Run from the hush-forge root:
 *   node e2e/fix-wallet-magic-number.cjs
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const WAL = path.resolve(
  __dirname,
  "wallet-profile",
  "Default",
  "Local Extension Settings",
  "cphhlgmgameodnhkjdmkpanlelnlohao",
  "000003.log"
);

if (!fs.existsSync(WAL)) {
  console.error(`WAL file not found: ${WAL}`);
  console.error("Run 'npm run setup:test-profile' first.");
  process.exit(1);
}

const buf = fs.readFileSync(WAL);

// The old byte sequence: "magicNumber":"5195086"
// We only target the value part: "5195086" → 5195086  (trailing spaces pad to same 9 bytes)
const OLD = Buffer.from('"5195086"',  "utf8"); //  9 bytes
const NEW = Buffer.from('5195086  ',  "utf8"); //  9 bytes (7 digits + 2 spaces)

let replaced = 0;
let pos = buf.indexOf(OLD);
while (pos !== -1) {
  // Verify this occurrence is preceded by : (i.e. it's a JSON value, not a key name)
  if (pos > 0 && buf[pos - 1] === 0x3a /* ':' */) {
    NEW.copy(buf, pos);
    replaced++;
    console.log(`  Patched at byte offset ${pos}`);
  }
  pos = buf.indexOf(OLD, pos + OLD.length);
}

if (replaced === 0) {
  // Check if already patched (number form present)
  const already = buf.indexOf(Buffer.from('"magicNumber":5195086', "utf8"));
  if (already !== -1) {
    console.log("Already patched — magicNumber is already a number. No changes made.");
  } else {
    console.log('Pattern "5195086" not found in WAL. Nothing to patch.');
    console.log("The wallet profile may not have a myDevChain custom network, or");
    console.log("the magic number may differ. Check the profile manually.");
  }
  process.exit(0);
}

fs.writeFileSync(WAL, buf);
console.log(`\nDone! Patched ${replaced} occurrence(s).`);
console.log(`WAL file: ${WAL}`);
console.log(`\nVerification — check JSON is valid around the patch:`);

// Print the surrounding context for verification
const verifyPattern = Buffer.from('"magicNumber":', "utf8");
let vPos = buf.indexOf(verifyPattern);
while (vPos !== -1) {
  const start = Math.max(0, vPos - 10);
  const end   = Math.min(buf.length, vPos + 40);
  console.log(`  ...${buf.slice(start, end).toString("utf8")}...`);
  vPos = buf.indexOf(verifyPattern, vPos + verifyPattern.length);
}
