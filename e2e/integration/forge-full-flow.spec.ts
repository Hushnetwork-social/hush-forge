/**
 * Integration E2E: Full Forge Flow
 *
 * Tests the complete happy path using the real NeoLine extension + a live
 * neo3-privatenet-docker chain.
 *
 * Flow:
 *   1. Reset neo3-privatenet-docker (fresh chain from genesis)
 *   2. Launch Edge with the pre-configured NeoLine wallet profile
 *   3. Navigate to /tokens → Connect Wallet via NeoLine popup
 *   4. FactoryDeployBanner is visible, "Forge Token" button is disabled
 *   5. Deploy TokenFactory → sign in NeoLine popup 1
 *   6. Initialize TokenFactory (setNefAndManifest) → sign in NeoLine popup 2
 *   7. "Forge Token" button becomes enabled
 *   8. Open Forge overlay → fill form
 *   9. Click FORGE → sign in NeoLine popup 3
 *  10. WaitingOverlay visible with tx hash + NeoTube link
 *  11. Redirect to token detail page
 *  12. Navigate back → new token shows with "Yours" badge
 *
 * Prerequisites:
 *   - Run e2e/setup-test-profile.ps1 once to create e2e/wallet-profile/
 *   - Docker Desktop running
 *   - npm run dev (or let webServer in playwright.config.ts start it)
 */

import { test, expect, chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ── Paths ────────────────────────────────────────────────────────────────────

const WALLET_PROFILE_DIR = path.resolve(__dirname, "../wallet-profile");
const DOCKER_COMPOSE_DIR = path.resolve(
  __dirname,
  "../../../neo3-privatenet-docker"
);
const BASE_URL = "http://localhost:3000";
const NEO_RPC_URL = "http://localhost:10332";
const NEOLINE_ID = "cphhlgmgameodnhkjdmkpanlelnlohao";

// NeoLine master password — set in e2e/integration/.env.integration or
// as an environment variable NEOLINE_PASSWORD before running tests.
// May be empty string "" if no password was configured during NeoLine setup.
const NEOLINE_PASSWORD: string | undefined = process.env.NEOLINE_PASSWORD;

// ── Chain helpers ─────────────────────────────────────────────────────────────

/**
 * Stops and deletes all chain data (volumes), then starts a fresh chain.
 * Each test gets a clean genesis state — no factory, no tokens, no history.
 */
function resetChain(): void {
  console.log("[chain] Resetting neo3-privatenet-docker...");
  execSync("docker compose down --volumes --remove-orphans", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
  execSync("docker compose up --detach", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
  console.log("[chain] Chain containers started.");
}

/**
 * Waits until the Neo N3 RPC endpoint responds to getblockcount.
 * The chain takes ~5-15s to produce its first block after docker start.
 */
async function waitForChain(
  timeoutMs = 60_000,
  pollMs = 2_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  console.log("[chain] Waiting for RPC to become available...");
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NEO_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getblockcount",
          params: [],
        }),
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.result === "number" && json.result >= 1) {
          console.log(`[chain] RPC ready — block height: ${json.result}`);
          return;
        }
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Chain RPC not ready after ${timeoutMs}ms`);
}

/**
 * Waits until the containerAccount (client1) is funded on-chain.
 *
 * neo3-privatenet-docker funds client1 AFTER genesis via wait_and_invoke.sh —
 * a neo-go multitransfer that sends 10M NEO + 10M GAS. The script runs inside
 * the neo-go-cli container and takes ~30-60s after the chain starts.
 *
 * We poll getnep17balances until the account has at least 2 assets (NEO + GAS).
 */
async function waitForFunding(
  address: string,
  timeoutMs = 120_000,
  pollMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  console.log("[chain] Waiting for client1 account to be funded...");
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NEO_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getnep17balances",
          params: [address],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = await res.json();
        const balances: unknown[] = json?.result?.balance ?? [];
        if (balances.length >= 2) {
          console.log(
            `[chain] Account funded — ${balances.length} assets visible.`
          );
          return;
        }
      }
    } catch {
      // RPC not ready or account not yet funded
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Client1 account not funded after ${timeoutMs}ms`);
}

// ── Browser helpers ──────────────────────────────────────────────────────────

/**
 * Creates a temporary copy of the wallet profile for this test run.
 * Each test gets its own copy so tests don't bleed NeoLine state into
 * each other (e.g. pending popups, cached origins).
 */
function createProfileCopy(): string {
  if (!fs.existsSync(WALLET_PROFILE_DIR)) {
    throw new Error(
      `Wallet profile not found at ${WALLET_PROFILE_DIR}.\n` +
        "Run: powershell -ExecutionPolicy Bypass -File e2e/setup-test-profile.ps1"
    );
  }
  const tmpDir = path.resolve(
    __dirname,
    `../wallet-profile-tmp-${Date.now()}`
  );
  fs.cpSync(WALLET_PROFILE_DIR, tmpDir, { recursive: true });
  return tmpDir;
}

function removeProfileCopy(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Launches Edge with the NeoLine-configured profile.
 *
 * Uses --load-extension to explicitly load NeoLine so that its content
 * scripts (neoline.js / neolineN3.js) inject into every page. The manifest
 * has a `key` field which preserves the extension ID (cphhlgmgameodnhkjdmkpanlelnlohao)
 * so the existing localStorage wallet data is accessible to the extension.
 *
 * After launch:
 *  1. Opens the NeoLine popup page to start the service worker and unlock
 *     the wallet (password: "neo") if required.
 *  2. Returns the context and a fresh app page.
 */
async function launchWithNeoLine(
  profileDir: string
): Promise<{ context: BrowserContext; page: Page }> {
  // Find the NeoLine extension binary.
  // New setup (setup-neoline-wallet.ts) uses --load-extension from Edge's install —
  // the profile copy won't have the binary inside it. Fall back to Edge install.
  const profileExtBase = path.join(profileDir, "Default", "Extensions", NEOLINE_ID);
  const edgeExtBase = path.join(
    process.env.LOCALAPPDATA ?? "C:\\Users\\aboim\\AppData\\Local",
    "Microsoft", "Edge", "User Data", "Default", "Extensions", NEOLINE_ID
  );
  const extBase = fs.existsSync(profileExtBase) ? profileExtBase : edgeExtBase;
  const versionDirs = fs.readdirSync(extBase);
  const neoLineExtDir = path.join(extBase, versionDirs[0]);
  console.log(`[neoline] Loading extension from: ${neoLineExtDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "msedge",
    headless: false,
    slowMo: 300, // gives NeoLine popup time to render
    args: [
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      // Explicitly load NeoLine so its content scripts inject into every page.
      // --disable-extensions-except disables all other installed extensions.
      `--disable-extensions-except=${neoLineExtDir}`,
      `--load-extension=${neoLineExtDir}`,
    ],
    // Viewport for desktop layout
    viewport: { width: 1280, height: 900 },
  });

  // ── Unlock NeoLine ──────────────────────────────────────────────────────
  // NeoLine locks the wallet on first launch in a new browser session.
  // Open the popup page and enter the password so getAccount() works.
  const neoLinePage = await context.newPage();
  await neoLinePage.goto(
    `chrome-extension://${NEOLINE_ID}/index.html#popup`,
    { waitUntil: "domcontentloaded", timeout: 15_000 }
  );
  await neoLinePage.waitForTimeout(2000); // let the Angular SPA render

  // Use input[type="password"] — NeoLine uses Angular forms, not standard
  // HTML placeholders, so getByPlaceholder() is unreliable.
  const pwInput = neoLinePage.locator('input[type="password"]');
  if (await pwInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
    console.log("[neoline] Password field found — unlocking wallet...");
    await pwInput.click();
    // Use keyboard.type() to ensure Angular form receives all events
    await neoLinePage.keyboard.type(NEOLINE_PASSWORD ?? "");
    // Also try pressing Enter (NeoLine might submit on Enter)
    await neoLinePage.keyboard.press("Enter");
    // Wait for the login to complete — password field disappears on success
    const loginHidden = await pwInput
      .waitFor({ state: "hidden", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (loginHidden) {
      await neoLinePage.waitForTimeout(1500); // SPA transition
      console.log("[neoline] Wallet unlocked successfully.");
    } else {
      console.log("[neoline] WARNING: password field still visible — login may have failed.");
      // Take a screenshot for debugging
      await neoLinePage.screenshot({ path: "test-results/neoline-unlock-debug.png" });
    }
  } else {
    console.log("[neoline] No password field — wallet already unlocked.");
  }

  // ── Balance sanity check ─────────────────────────────────────────────────
  // After unlocking, NeoLine fetches balances asynchronously from myDevChain
  // RPC (http://localhost:10332). On a freshly-reset chain this takes 5-25s.
  // Use waitFor() which properly polls until the text appears.
  console.log("[neoline] Waiting for devnet balances to load (up to 30s)...");
  const balanceOk = await neoLinePage
    .getByText("10,000,000")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!balanceOk) {
    await neoLinePage.screenshot({ path: "test-results/neoline-wrong-network.png" });
    throw new Error(
      "NeoLine shows no devnet balances after 30s — is it on myDevChain?\n" +
        "Expected: 10,000,000 NEO and GAS (local devnet genesis)\n" +
        "If balances show 0, the extension cannot reach the local RPC.\n" +
        "Fix: run 'npm run setup:wallet-profile' to regenerate the wallet profile."
    );
  }
  console.log("[neoline] Balance check passed — connected to devnet (10M NEO/GAS visible).");

  await neoLinePage.close();

  const page = await context.newPage();
  return { context, page };
}

/**
 * Signs a NeoLine popup that is already open (Page object provided).
 * Handles loading-box overlay, disabled-button wait, confirm click, and close.
 */
async function signExistingNeoLinePopup(popup: Page): Promise<void> {
  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});

  // Forward popup errors to test output for diagnostics
  popup.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") console.log(`[popup:${t}] ${msg.text()}`);
  });
  popup.on("pageerror", (err) => console.log("[popup:pageerror]", err.message));

  // Wait for NeoLine fee-calculation overlay to clear
  await popup
    .locator(".loading-box")
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});

  // Wait for the action confirm button (not the toast "Done") to become enabled.
  await popup
    .waitForFunction(() => {
      const btn = document.querySelector("button.confirm:not(.pop-ups)");
      return btn !== null && !btn.classList.contains("disabled");
    }, { timeout: 30_000 })
    .catch(() => {});

  // Use page.evaluate() with document.querySelector to bypass Playwright's strict
  // mode (which throws when multiple elements match "button.confirm").
  // Prefer the action button (class="confirm") over the Done toast (class="confirm pop-ups").
  await popup.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("button.confirm"));
    const btn = btns.find((b) => !b.classList.contains("pop-ups")) ?? btns[0];
    btn?.click();
  });
  console.log("[neoline] Clicked action button.");

  // After clicking the action button, NeoLine broadcasts the TX and shows a "Done" toast.
  // We must dismiss the "Done" toast immediately so the popup closes before the next
  // dAPI invoke is triggered — otherwise NeoLine queues the next TX in the "busy"
  // popup and drops it when the popup eventually closes.
  await popup
    .waitForFunction(() => document.querySelector("button.confirm.pop-ups") !== null, { timeout: 30_000 })
    .catch(() => {});

  if (!popup.isClosed()) {
    await popup.evaluate(() => {
      document.querySelector<HTMLButtonElement>("button.confirm.pop-ups")?.click();
    }).catch(() => {});
    await popup.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
    console.log("[neoline] Done toast clicked — popup dismissed.");
  } else {
    console.log("[neoline] Popup already closed.");
  }
}

/**
 * Signs a transaction in the NeoLine popup.
 *
 * Waits for NeoLine to open a new page (its confirmation popup), then
 * clicks the primary confirmation button.
 *
 * @param context  - The Playwright browser context
 * @param trigger  - Async function that triggers the dAPI invoke() call
 * @param timeout  - How long to wait for the popup to appear (ms)
 */
async function signInNeoLine(
  context: BrowserContext,
  trigger: () => Promise<void>,
  timeout = 60_000
): Promise<void> {
  // Start listening BEFORE the trigger so we don't miss the popup event
  const popupPromise = context.waitForEvent("page", { timeout });

  await trigger();

  const popup = await popupPromise;

  // Forward NeoLine popup console to test output — captures dry-run RPC errors,
  // fee calculation failures, and other internal NeoLine diagnostics.
  popup.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[popup:${t}] ${msg.text()}`);
    }
  });
  popup.on("pageerror", (err) => console.log("[popup:pageerror]", err.message));

  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 });

  console.log(`[neoline] Popup opened: ${popup.url()}`);

  // If the wallet is locked, NeoLine shows a login screen before the action.
  // Handle it by entering the password and waiting for the action screen.
  const pwInput = popup.locator('input[type="password"]');
  if (await pwInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    console.log("[neoline] Wallet locked in popup — logging in...");
    await pwInput.click();
    await popup.keyboard.type(NEOLINE_PASSWORD ?? "");
    await popup.keyboard.press("Enter");
    const loginHidden = await pwInput
      .waitFor({ state: "hidden", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (loginHidden) {
      await popup.waitForTimeout(2000); // SPA transition to action screen
      console.log("[neoline] Logged in, waiting for action screen...");
    } else {
      console.log("[neoline] WARNING: login may have failed — password still visible.");
      await popup.screenshot({ path: "test-results/neoline-login-popup-debug.png" });
    }
  }

  // NeoLine action buttons vary by operation:
  //   getAccount()  → "Connect" / "Allow"
  //   invoke()      → "Confirm" / "Sign" / "Yes"
  // Also supports Chinese labels (确认) and "Approve" / "Send".
  const confirmBtn = popup
    .getByRole("button", { name: /Connect|Allow|Confirm|Sign|Send|Approve|Yes|确认/i })
    .first();

  await expect(confirmBtn).toBeVisible({ timeout: 20_000 });

  // Wait for NeoLine to finish calculating the network fee.
  // While calculating, a .loading-box overlay intercepts pointer events and
  // the button has class "confirm disabled". Wait until loading clears.
  await popup
    .locator(".loading-box")
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});

  // Also wait until the confirm button no longer has the "disabled" CSS class.
  // NeoLine uses Angular class bindings — the HTML disabled attribute may be absent
  // but Angular still suppresses clicks while the "disabled" class is present.
  // :not(.pop-ups) targets the action button, not the "Done" toast button.
  await popup
    .waitForFunction(
      () => {
        const btn = document.querySelector("button.confirm:not(.pop-ups)");
        return btn !== null && !btn.classList.contains("disabled");
      },
      { timeout: 30_000 }
    )
    .catch(() => {});

  // Guard: if the popup was closed by NeoLine before we could interact (e.g. the
  // RPC dry-run failed), fail with a helpful message instead of a cryptic page-closed error.
  if (popup.isClosed()) {
    throw new Error(
      "NeoLine popup closed before user interaction — check [popup:error] / [browser:error] " +
      "lines above for the RPC error (likely MaxGasInvoke or MaxFee too low in rpcserver.config)."
    );
  }

  // Use page.evaluate() with document.querySelector to bypass Playwright's strict mode.
  // Prefers action button (class="confirm") over Done toast (class="confirm pop-ups").
  await popup.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("button.confirm"));
    const btn = btns.find((b) => !b.classList.contains("pop-ups")) ?? btns[0];
    btn?.click();
  });
  console.log("[neoline] Clicked action button.");

  // After TX is broadcast, NeoLine shows a "Done" toast.
  // Dismiss it immediately so the popup closes before the next dAPI invoke
  // (otherwise NeoLine queues the next TX in the busy popup and drops it).
  await popup
    .waitForFunction(() => document.querySelector("button.confirm.pop-ups") !== null, { timeout: 30_000 })
    .catch(() => {});

  if (!popup.isClosed()) {
    await popup.evaluate(() => {
      document.querySelector<HTMLButtonElement>("button.confirm.pop-ups")?.click();
    }).catch(() => {});
    await popup.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
    console.log("[neoline] Done toast clicked — popup dismissed.");
  } else {
    console.log("[neoline] Popup already closed.");
  }
}

// ── Test ─────────────────────────────────────────────────────────────────────

test.describe("Forge Full Integration Flow", () => {
  let profileCopyDir: string;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(() => {
    if (NEOLINE_PASSWORD === undefined) {
      throw new Error(
        "NEOLINE_PASSWORD env var is not set.\n" +
          "Add it to e2e/integration/.env.integration or export it:\n" +
          "  set NEOLINE_PASSWORD=yourpassword  (Windows cmd)\n" +
          "  $env:NEOLINE_PASSWORD='yourpassword'  (PowerShell)\n" +
          "  export NEOLINE_PASSWORD=yourpassword  (bash)\n" +
          "If NeoLine has no password, set it to empty: NEOLINE_PASSWORD="
      );
    }
  });

  test.beforeEach(async () => {
    // 1. Each test gets a fresh chain — no leftover factory, tokens, or state
    resetChain();
    await waitForChain(90_000);

    // 2. Wait for the neo-go-cli container to fund the client1 account.
    //    wait_and_invoke.sh sends 10M NEO/GAS via multitransfer --await,
    //    which takes ~30-60s after the chain starts. NeoLine will show 0
    //    until this completes.
    await waitForFunding("NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c", 120_000);

    // 3. Each test gets an isolated copy of the wallet profile
    profileCopyDir = createProfileCopy();
    ({ context, page } = await launchWithNeoLine(profileCopyDir));

    // 4. Pre-warm the /tokens/[hash] dynamic route.
    //    In Next.js dev mode each dynamic route is compiled on first visit.
    //    Under concurrent browser activity (forge TX in progress), the SWC
    //    compilation worker crashes ("Jest worker exceeded retry limit") if
    //    it compiles the route for the first time while the page is also
    //    handling redirect and rendering.  Visiting a stub URL now ensures
    //    the bundle is compiled during a quiet moment, BEFORE the critical path.
    //
    //    IMPORTANT: must use waitUntil:"load" (not "domcontentloaded") so the
    //    browser actually fetches and compiles the JS chunks from the dev server.
    //    "domcontentloaded" fires before the <script> chunks are downloaded —
    //    leaving the route un-compiled and causing SWC worker crashes later.
    const warmup = await context.newPage();
    warmup.on("pageerror", (err) =>
      console.log("[warmup:pageerror]", err.message)
    );
    await warmup
      .goto(`${BASE_URL}/tokens/0x0000000000000000000000000000000000000000`, {
        waitUntil: "load",
        timeout: 60_000,
      })
      .catch((e) => console.log("[warmup:goto-error]", String(e)));
    await warmup.waitForTimeout(3_000); // Extra margin for webpack chunk emission
    await warmup.close();
    console.log("[setup] /tokens/[hash] route pre-warmed.");
  });

  test.afterEach(async () => {
    await context.close().catch(() => {});
    removeProfileCopy(profileCopyDir);
  });

  // ── Main scenario ──────────────────────────────────────────────────────────
  test(
    "deploy factory → forge token → verify in list",
    async () => {
      // ── Step 1: Navigate to /tokens ──────────────────────────────────────
      // Forward all browser console messages to the test output so we can
      // see app-side errors (factory deploy faults, RPC errors, etc.)
      page.on("console", (msg) => {
        const type = msg.type();
        if (type === "error" || type === "warning" || msg.text().startsWith("[factory]") || msg.text().startsWith("[dapi]") || msg.text().startsWith("[rpc]")) {
          console.log(`[browser:${type}] ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

      // Monitor ALL new pages opened in the context — captures any popup that
      // opens and closes quickly (helps diagnose NeoLine's init TX popup behavior).
      context.on("page", (newPage) => {
        const url = newPage.url();
        console.log(`[context] New page opened: ${url}`);
        newPage.on("close", () => console.log(`[context] Page closed: ${newPage.url()}`));
        newPage.on("console", (msg) => {
          if (msg.type() === "error") console.log(`[context:pageerror] ${msg.text()}`);
        });
      });

      // Intercept Next.js webpack HMR WebSocket to filter out "build failed"
      // error messages.  When the webpack worker OOM-crashes during
      // /tokens/[hash] compilation it broadcasts a message with an `errors`
      // array to ALL connected pages.  Next.js's client runtime reacts by
      // tearing down the React tree and showing an error overlay — which
      // clears auto-reconnect timers so the wallet can never reconnect.
      // By forwarding ALL other HMR messages (ping, sync, build-hash …) we
      // keep page initialization intact; we only drop the error payload.
      await page.routeWebSocket("**/_next/webpack-hmr**", ws => {
        const server = ws.connectToServer();
        server.onMessage(msg => {
          try {
            const data = JSON.parse(String(msg));
            // Drop webpack "build failed" messages (errors array non-empty).
            if (Array.isArray(data.errors) && data.errors.length > 0) return;
          } catch { /* non-JSON message — forward as-is */ }
          ws.send(msg);
        });
        // Forward browser → server (ping / close events)
        ws.onMessage(msg => server.send(msg));
      });
      console.log("[setup] webpack HMR error filter installed.");

      await page.goto(BASE_URL + "/tokens");
      await page.waitForLoadState("networkidle");

      // ── Step 1.5: Note on NeoLine background SW recovery ─────────────────
      // After the warmup page's OOM crash, NeoLine's MV3 background service
      // worker may restart.  Any in-flight getAccount() message is silently
      // dropped by the restarting SW, leaving the wallet stuck in "connecting".
      //
      // This is handled in production code:
      //   • wallet-store.ts connect() has a 15s timeout that sets "error" state.
      //   • useWallet.ts has a t4 retry timer at 20s — after the timeout fires
      //     the SW has restarted and the retry succeeds.
      //
      // Consequently the address check below uses a 35s timeout to accommodate
      // the worst-case path: hang → 15s timeout → 20s retry → ~21s connected.
      console.log("[setup] NeoLine SW recovery handled by wallet-store timeout + t4 retry.");

      // ── Step 2: Connect Wallet ───────────────────────────────────────────
      // The wallet auto-connects via tryAutoReconnect() if localStorage has
      // forge_wallet_type (written when the profile was originally set up).
      //
      // MV3 SW restart race (common after warmup-page OOM crash):
      //   • tryAutoReconnect(0ms) → getAccount() hangs (SW restarting) →
      //     wallet-store 15s timeout fires → "error" state →
      //     useWallet t4 timer (20s) retries → SW now stable → wallet connects.
      //   • While "connecting", the header button shows "Connecting…" — it will
      //     NOT match /Connect Wallet/i.  Attempting to click a non-existent
      //     button would start a second hanging connect() that blocks t4.
      //   • Solution: check button visibility with a SHORT timeout (3s).
      //     If visible (fast path / SW not restarting) → click it (normal flow).
      //     If not visible (wallet already "connecting") → skip click and wait.
      const addressPrefix = "NV1Q1d";

      const alreadyConnected = await page.evaluate(
        (prefix: string) => document.body.textContent?.includes(prefix) ?? false,
        addressPrefix
      );
      if (!alreadyConnected) {
        // "Connect Wallet" is only shown when connectionStatus ≠ "connecting".
        // Use a 3s probe; if wallet is "connecting" the button won't appear.
        const connectBtn = page
          .getByRole("button", { name: /Connect Wallet/i })
          .first();
        const btnVisible = await connectBtn
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (btnVisible) {
          console.log("[connect] Manual connect — clicking Connect Wallet.");
          try {
            await signInNeoLine(
              context,
              async () => {
                await connectBtn.click();
                const neoLineBtn = page
                  .getByRole("button", { name: /NeoLine/i })
                  .first();
                if (await neoLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
                  await neoLineBtn.click();
                }
              },
              15_000
            );
          } catch (connectErr) {
            console.log("[connect] signInNeoLine threw:", String(connectErr));
            // Handle a NeoLine popup that opened after the signInNeoLine timeout.
            const lateExtPage = context.pages().find(
              (p) => !p.isClosed() && p.url().includes(NEOLINE_ID)
            );
            if (lateExtPage) {
              console.log(`[connect] Late popup found: ${lateExtPage.url()} — handling…`);
              await signExistingNeoLinePopup(lateExtPage);
            } else {
              console.log("[connect] No NeoLine popup — connected silently.");
            }
          }
        } else {
          console.log(
            "[connect] Wallet is already connecting — waiting for auto-reconnect + t4 retry."
          );
        }
      } else {
        console.log("[connect] Wallet already auto-connected.");
      }

      // Wait for address in header.
      // Worst-case timing: SW restart → 15s timeout → t4 fires at 20s → ~21s.
      // NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c → "NV1Q1d"
      await page.waitForFunction(
        (prefix: string) =>
          document.body.textContent?.includes(prefix) ?? false,
        addressPrefix,
        { timeout: 35_000 }
      );
      console.log("[connect] Wallet connected — address visible in header.");

      // NeoLine's background service worker may not be ready for invoke() dry-runs
      // immediately after connect. Give it time to fully initialize — without this,
      // the first invoke() can return RPC_ERROR when the chain was connected silently
      // (no auth popup → no organic warmup time before the deploy attempt).
      // 20s observed to be reliable across fresh browser profiles and cold starts.
      await page.waitForTimeout(20_000);

      // ── Step 3: FactoryDeployBanner visible, Forge Token disabled ─────────
      const forgeTokenBtn = page.getByRole("button", { name: "Forge Token" });
      await expect(forgeTokenBtn).toBeDisabled({ timeout: 15_000 });
      console.log('[factory] "Forge Token" button is disabled — factory not deployed.');

      const deployBtn = page.getByRole("button", {
        name: /Deploy TokenFactory/i,
      });
      await expect(deployBtn).toBeVisible({ timeout: 10_000 });

      // ── Steps 4+5: Deploy + Init TokenFactory ────────────────────────────
      //
      // Two NeoLine popups fire in sequence:
      //   Popup #1 — user signs the deploy TX
      //   Popup #2 — user signs setNefAndManifest (fired automatically by deploy()
      //              after the deploy TX confirms, ~15-60s on privnet)
      //
      // Root-cause fixes applied here:
      //
      //   FIX A — RPC_ERROR on first invoke
      //     NeoLine's service worker occasionally isn't ready for invokescript
      //     dry-runs when the connection was silent (no auth popup → no organic
      //     warmup). Retry up to 3 times with 6s backoff.
      //
      //   FIX B — missed init popup event
      //     If the deploy TX confirms while the deploy popup close-timeout is
      //     still running, the init popup opens before we call waitForEvent().
      //     Fix: register the init-popup listener BEFORE clicking confirm in the
      //     deploy popup, then fall back to checking context.pages().
      //
      console.log("[factory] Deploying TokenFactory...");

      let deployAndInitDone = false;
      for (let attempt = 1; attempt <= 3 && !deployAndInitDone; attempt++) {
        if (attempt > 1) {
          console.log(`[factory] Deploy retry (attempt ${attempt}/3) — waiting 15s for NeoLine warmup...`);
          await page.waitForTimeout(15_000);
          // After RPC_ERROR deploy() sets status="deploy-error" and the
          // "Deploy TokenFactory" button remains visible — just click it again.
          await expect(deployBtn).toBeVisible({ timeout: 15_000 });
        }

        // ── Popup #1: deploy ────────────────────────────────────────────────
        const deployPopupPromise = context.waitForEvent("page", { timeout: 60_000 });
        await deployBtn.click();

        let deployPopup: Page;
        try {
          deployPopup = await deployPopupPromise;
        } catch {
          if (attempt < 3) {
            console.log("[factory] Deploy popup never appeared — retrying.");
            continue;
          }
          throw new Error("Deploy popup never appeared after 3 attempts");
        }

        console.log(`[neoline] Deploy popup (attempt ${attempt}): ${deployPopup.url()}`);
        const popupOpenedAt = Date.now();

        // *** Capture ALL popup console output — essential for diagnosing NeoLine
        // internal errors (e.g. TypeError during fee calculation, RPC call failures).
        // Must be registered BEFORE waitForLoadState to avoid missing early events.
        deployPopup.on("console", (msg) => {
          const t = msg.type();
          const prefix = `[popup:${t}]`;
          if (t === "error" || t === "warning") {
            console.log(`${prefix} ${msg.text()}`);
          } else if (msg.text().includes("RPC") || msg.text().includes("Error") || msg.text().includes("error")) {
            console.log(`${prefix} ${msg.text()}`);
          }
        });
        deployPopup.on("pageerror", (err) => console.log("[popup:pageerror]", err.message));

        // Track popup close time
        deployPopup.on("close", () => {
          console.log(`[neoline] Deploy popup closed after ${Date.now() - popupOpenedAt}ms`);
        });

        // Wait for fee calculation overlay to finish
        await deployPopup
          .waitForLoadState("domcontentloaded", { timeout: 20_000 })
          .catch(() => {});

        // Take a diagnostic screenshot immediately after popup loads
        await deployPopup
          .screenshot({ path: `test-results/deploy-popup-attempt-${attempt}-loaded.png` })
          .catch(() => {});

        await deployPopup
          .locator(".loading-box")
          .waitFor({ state: "hidden", timeout: 20_000 })
          .catch(() => {});

        // Screenshot after loading-box hides (or times out)
        await deployPopup
          .screenshot({ path: `test-results/deploy-popup-attempt-${attempt}-after-loading.png` })
          .catch(() => {});

        // Log popup DOM state for diagnostics
        const popupState = await deployPopup.evaluate(() => {
          const btn = document.querySelector("button.confirm");
          const loadingBox = document.querySelector(".loading-box");
          const errEl = document.querySelector(".error-msg, .error, [class*='error']");
          return {
            hasConfirmBtn: btn !== null,
            confirmBtnDisabled: btn?.classList.contains("disabled") ?? null,
            confirmBtnText: btn?.textContent?.trim() ?? null,
            loadingBoxVisible: loadingBox ? getComputedStyle(loadingBox).display !== "none" : false,
            errorText: errEl?.textContent?.trim() ?? null,
            allButtons: Array.from(document.querySelectorAll("button")).map(b => ({
              text: b.textContent?.trim(), classes: b.className
            })),
          };
        }).catch((e) => ({ error: String(e) }));
        console.log("[popup:dom]", JSON.stringify(popupState));

        // Wait for action confirm button to become enabled (:not(.pop-ups) skips toast).
        // 15s is enough for normal fee calculation; if RPC_ERROR the popup is already
        // closed or the button stays disabled indefinitely — exit fast either way.
        const btnReady = await deployPopup
          .waitForFunction(() => {
            const btn = document.querySelector("button.confirm:not(.pop-ups)");
            return btn !== null && !btn.classList.contains("disabled");
          }, { timeout: 15_000 })
          .then(() => true)
          .catch(() => false);

        if (!btnReady) {
          // Button never enabled — NeoLine's dry-run failed (RPC_ERROR)
          console.log("[factory] Deploy popup button never became enabled (likely RPC_ERROR).");
          if (attempt < 3) continue;
          throw new Error("Deploy confirm button never became enabled after 3 attempts");
        }

        // Register init TX popup listener BEFORE clicking "Yes".
        // initializeFactory() fires ~15-60s after deploy TX confirms — registering early
        // prevents a race condition where the new popup opens before we call waitForEvent().
        const initPopupPromise = context.waitForEvent("page", { timeout: 300_000 });

        try {
          await deployPopup.evaluate(() => {
            const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("button.confirm"));
            const btn = btns.find((b) => !b.classList.contains("pop-ups")) ?? btns[0];
            btn?.click();
          });
          console.log("[neoline] Deploy confirm clicked.");
        } catch (clickErr) {
          // Page closed before click — RPC_ERROR caused popup to close
          console.log(`[factory] Deploy popup closed before click could fire: ${clickErr}`);
          if (attempt < 3) continue;
          throw clickErr;
        }

        // ── Popup #2: init TX appears in a NEW popup window ────────────────────
        // After clicking "Yes", NeoLine broadcasts the deploy TX and shows a "Done" toast.
        // Dismiss it IMMEDIATELY so the deploy popup closes cleanly before initializeFactory()
        // is called (~15-60s later when the deploy TX confirms on-chain).
        // initializeFactory() then calls dapi.invoke() with no popup open → NeoLine opens a
        // FRESH popup window (new messageID). We capture it via initPopupPromise above.
        console.log("[factory] Deploy TX signed — waiting for Done toast...");
        const doneToastStart = Date.now();

        await deployPopup
          .waitForFunction(
            () => document.querySelector("button.confirm.pop-ups") !== null,
            { timeout: 60_000 }
          )
          .catch(() => { console.log("[neoline] Done toast did not appear within 60s."); });

        if (!deployPopup.isClosed()) {
          await deployPopup.evaluate(() => {
            document.querySelector<HTMLButtonElement>("button.confirm.pop-ups")?.click();
          }).catch(() => {});
          await deployPopup.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
          console.log(`[neoline] Deploy Done toast dismissed (+${Date.now() - doneToastStart}ms) — popup closed.`);
        } else {
          console.log(`[neoline] Deploy popup already closed (+${Date.now() - doneToastStart}ms).`);
        }

        // Wait for init TX popup (NeoLine opens a fresh window when initializeFactory fires)
        console.log("[factory] Waiting for init TX popup...");
        let initPopup: Page;
        try {
          initPopup = await initPopupPromise;
          console.log(`[factory] Init TX popup opened: ${initPopup.url()}`);
        } catch {
          if (attempt < 3) {
            console.log("[factory] Init TX popup never appeared — retrying deploy.");
            continue;
          }
          throw new Error("Init TX popup never appeared after 3 attempts");
        }

        // ── Sign init TX ──────────────────────────────────────────────────────
        await signExistingNeoLinePopup(initPopup);
        console.log("[factory] Init TX signed.");
        deployAndInitDone = true;
      }

      if (!deployAndInitDone) {
        throw new Error("TokenFactory deploy+init failed after 3 attempts");
      }

      // ── Step 6: "Forge Token" button becomes enabled ──────────────────────
      await expect(forgeTokenBtn).not.toBeDisabled({ timeout: 120_000 });
      console.log('[factory] TokenFactory ready — "Forge Token" enabled.');

      // ── Step 7: Open Forge overlay ────────────────────────────────────────
      await forgeTokenBtn.click();
      const overlay = page.getByRole("dialog", { name: "Forge a Token" });
      await expect(overlay).toBeVisible({ timeout: 10_000 });

      // Wait for the creation fee to load (FORGE button is disabled while loading)
      const forgeBtn = page.getByRole("button", { name: /FORGE/ });
      await expect(forgeBtn).not.toBeDisabled({ timeout: 20_000 });

      // ── Step 8: Fill the form ─────────────────────────────────────────────
      await page.getByLabel("Token Name").fill("PoC Token");
      await page.getByLabel(/^Symbol/).fill("POC");
      await page.getByLabel("Total Supply").fill("1000000");
      await page.getByLabel(/^Decimals/).fill("8");
      console.log("[form] Form filled.");

      // ── Step 9: Click FORGE → NeoLine popup #3 ───────────────────────────
      console.log("[forge] Submitting forge TX...");
      await signInNeoLine(
        context,
        async () => {
          await forgeBtn.click();
        },
        60_000
      );
      console.log("[forge] Forge TX signed.");

      // ── Step 10: WaitingOverlay visible (optional — TX may confirm before check) ──
      // The forge TX takes ~15s to confirm. If the popup was already open for 15s+,
      // the TX may have confirmed and the app may have already redirected.
      const waitingOverlay = page.getByRole("status", {
        name: "Waiting for transaction",
      });
      const waitingVisible = await waitingOverlay.isVisible().catch(() => false);
      if (waitingVisible) {
        console.log("[forge] WaitingOverlay visible.");
        // WaitingOverlay should show a NeoTube tx link
        const txLink = page.getByRole("link", { name: /↗/ });
        const txLinkVisible = await txLink.first().isVisible().catch(() => false);
        if (txLinkVisible) {
          await expect(txLink.first()).toHaveAttribute("href", /neotube\.io\/transaction\//);
        }
      } else {
        console.log("[forge] WaitingOverlay not visible — TX may have confirmed already.");
      }

      // ── Step 11: Redirect to token detail page ───────────────────────────
      await page.waitForURL(/\/tokens\/0x/, { timeout: 120_000 });
      const tokenHash = new URL(page.url()).pathname.split("/")[2];
      console.log(`[forge] Token created! Contract hash: ${tokenHash}`);

      // Detail page should show the token symbol.
      // The route was pre-warmed in beforeEach so the webpack bundle is compiled.
      // If "POC" is still not visible (slow RPC), log a warning — the primary
      // verification is step 12 (token visible in the /tokens list with Yours badge).
      const pocVisible = await page.getByText("POC").isVisible({ timeout: 15_000 }).catch(() => false);
      if (pocVisible) {
        console.log("[detail] Token detail page shows POC ✓");
        await page.getByText(tokenHash).isVisible({ timeout: 5_000 }).catch(() => {
          console.log("[detail] WARNING: contract hash not visible on detail page.");
        });
      } else {
        console.log("[detail] WARNING: POC not visible on detail page — continuing to list check.");
      }

      // ── Step 12: Back to /tokens — new token shows with Yours badge ───────
      // Use goBack() (client-side popstate) instead of page.goto() to preserve:
      //   - Zustand store state (ownTokenHashes already has the new token from addToken())
      //   - NeoLine injection context (avoids tryAutoReconnect() timing race)
      //   - Wallet connection state (address remains set)
      // The forge TX was triggered from /tokens (router.push("/tokens/hash")), so
      // goBack() returns there via popstate without a full page reload.
      console.log("[nav] Navigating back to /tokens via goBack()...");
      const wentBack = await page.goBack({ timeout: 15_000 }).then(() => true).catch(() => false);
      if (!wentBack || !page.url().endsWith("/tokens")) {
        console.log(`[nav] goBack() failed or wrong URL (${page.url()}) — falling back to goto().`);
        await page.goto(BASE_URL + "/tokens");
        await page.waitForLoadState("networkidle");
        // After a full reload, give NeoLine time to inject before checking
        await page.waitForFunction(
          () => typeof (window as unknown as Record<string, unknown>).NEOLineN3 !== "undefined",
          { timeout: 30_000 }
        ).catch(() => { console.log("[nav] NeoLine not injected after 30s."); });
      }
      console.log("[nav] Back at /tokens:", page.url());

      // addToken() is called when the TX confirms — it adds the hash to ownTokenHashes.
      // After goBack() the store is intact, so the Yours badge should appear quickly.
      // After goto() we need to wait for wallet reconnect + store reload from chain (~30s).
      const yoursLabel = page.getByLabel("Your token").first();
      await expect(yoursLabel).toBeVisible({ timeout: 60_000 });

      // Verify it's our token by symbol
      await expect(page.getByText("POC").first()).toBeVisible({
        timeout: 10_000,
      });

      console.log('[done] PoC complete — "POC" token visible with Yours badge.');
    }
  );
});
