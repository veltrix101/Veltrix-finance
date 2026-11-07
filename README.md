# VEYDRAVO Finance

Website and private personal-finance dashboard.

## Browser support

Target current Safari on iOS/macOS, Chrome and Edge, Firefox, and Samsung Internet. Older browsers may lack required web APIs; this is not a promise to support every historical browser or embedded webview.

Account scripts and the pinned Supabase 2.57.0 browser SDK are served from this repository. There is no runtime ESM CDN dependency. Shared fallbacks cover dialog opening/closing and focus, secure UUID generation, and replacing avatar contents. Mobile form controls use a 16px font and 44px-or-larger targets; date fields and account dialogs stay within narrow layouts.

## Verification

- `npm test`: 52 account/recovery checks and 13 browser-fallback checks.
- `npm ci`, then `npx playwright install chromium firefox webkit` to prepare browser tests.
- `npm run test:browsers -- chromium` (or `firefox`, `webkit`) runs a local fixture; it never sends real login emails or touches production data.
- Browser fixtures cover 320, 390, 768, and 1440px widths, all eight dashboard sections, account-code navigation, and transaction save/reload. The vendored SDK is checked separately without replacing it with the fixture.

The 2026-11-06 compatibility pass verified the Chromium layout cases at all four widths and live Chrome account startup. Firefox page creation did not complete in the executor. WebKit could not run because host libraries were unavailable. Those are unverified here; physical iPhone/iPad and Android testing remains necessary before claiming certification on those devices.
