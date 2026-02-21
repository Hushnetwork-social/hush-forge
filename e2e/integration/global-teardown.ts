import { execSync } from "child_process";

/**
 * Playwright global teardown — runs once after all tests complete.
 *
 * Next.js dev server (Turbopack) spawns child worker processes that survive
 * when Playwright kills the parent `npm run dev` process, leaving port 3000
 * occupied until manually freed.  This teardown force-kills anything still
 * listening on port 3000 so the next run can start a fresh server.
 */
export default async function globalTeardown() {
  try {
    execSync(
      `powershell -Command "` +
        `$pids = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess; ` +
        `if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }" `,
      { stdio: "inherit" }
    );
  } catch {
    // Server may already be stopped — not an error
  }
}
