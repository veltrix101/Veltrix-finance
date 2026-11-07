# Business Tools

Isolated static tools at /business/. Purchases and account/cloud sync are not enabled. No finance schema or account scripts are modified.

Browser-only records use `veydravo-business-v1`, separate from personal-finance storage. Existing preview records are not imported automatically. User can download/restore business JSON backups. Browser data is visible to anyone using the same browser profile, regardless of the signed-in finance account. Use separate browser profiles on shared devices.

Each tool is planned as a separately priced one-time purchase. Before enabling paid access, set prices and implement server-verified entitlements and purchase/refund handling. Do not use client-side flags as paid access controls.

## Verification
`node tests/business-tools.cjs` checks calculations and malformed backups. Browser review covers normal and narrow widths. Normal and multi-page files from the PDF export engine have been rendered. This does not certify physical iPhone/Android behavior.

## Removal
Remove homepage Business Tools links and the `#business-tools` section, remove the finance header Business Tools link, then remove the `business/` directory. Preserve users' browser records and backups; do not clear local storage. No finance database rollback is needed. Git parent commit preserves the previous website.
