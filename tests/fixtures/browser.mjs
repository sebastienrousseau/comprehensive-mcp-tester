/**
 * The browser for the e2e suites: Playwright's Chromium, or PW_CHROMIUM_PATH.
 *
 * Suites skip (rather than fail) when no browser is available locally, but a
 * missing browser fails the run when CI=true: skipping would hide every UI regression.
 * Install for local runs:  npx playwright install chromium
 */
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed */ }

async function launch() {
  if (!chromium) return null;
  // An explicit PW_CHROMIUM_PATH is the only browser tried, so a wrong path is noticed
  const attempts = process.env.PW_CHROMIUM_PATH ? [process.env.PW_CHROMIUM_PATH] : [undefined, '/opt/pw-browsers/chromium'];
  for (const executablePath of attempts) {
    if (executablePath === null) continue;
    try { return await chromium.launch(executablePath ? { executablePath } : {}); } catch { /* try next */ }
  }
  return null;
}

/** → { browser, skip }: pass `skip` to each test's options */
export async function launchBrowser() {
  const browser = await launch();
  // In CI a missing browser must fail the run: skipping would hide every UI regression
  if (!browser && process.env.CI === 'true') {
    throw new Error('Chromium is required when CI=true: run `npx playwright install --with-deps chromium`, or fix PW_CHROMIUM_PATH');
  }
  return { browser, skip: browser ? false : 'Playwright/Chromium not available — run `npx playwright install chromium`' };
}
