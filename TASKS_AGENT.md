# Agent task checklist

Work one task at a time. `[x]` means completed with evidence; `[ ]` means outstanding. Phases 1–4 and Vercel production preparation are authorized. Human-only tasks belong in `TASKS_HUMAN.md`.

## Phase 1

- [x] 01 — Inspect workspace and verify requested package versions using the registry.
- [x] 02 — Write full Phase 1–5 plan and record unresolved allocation/ROI semantics.
- [x] 03 — Set up pinned Svelte, Tailwind, TypeScript 7, Vite, and Bun project.
- [x] 04 — Implement versioned finance types, integer currency handling, local timestamps and import validation.
- [x] 05 — Add IndexedDB storage with commit-aware persistence and error reporting.
- [x] 06 — Build mobile-first overview, monthly summaries, activity search and filters.
- [x] 07 — Add/edit/delete dated income and spending, and suggest custom categories.
- [x] 08 — Add JSON export, validated import preview, merge and explicit replace flows.
- [x] 09 — Configure offline PWA, manifest, install icons, native install prompt and update prompt.
- [x] 10 — Run domain/persistence tests and resolve type/build failures: 10 tests, 43 assertions, zero checker errors/warnings, production PWA build passed.
- [x] 11 — Verify browser workflows, responsive layout and production offline reload. Previously blocked by the origin approval gate; later access was granted. Selected workflows and 320/390px layouts were exercised, and the production preview reloaded with uncached requests blocked under offline emulation. Physical-device acceptance remains pending.
- [x] 12 — Finalize README, verification evidence, and human-only acceptance checklist; browser/device checks are explicitly pending.

## Phase 2 — authorized 2026-11-17

- [x] 01 — Review plan and existing data flows; record Phase 2 authorization and implementation defaults.
- [x] 02 — Implement schema v2, nondestructive v1 migration, allocation versions, accounts/transfers, calculations and validated backups. Domain functions added in `src/lib/finance.ts`; verification follows task 04.
- [x] 03 — Build editable allocation and account interfaces; add account and explicit budget-bucket selection to entries. `FinancePanel.svelte` includes plans/history, dated opening funds and transfer CRUD; `App.svelte` exposes navigation and entry classification. Svelte/TS checks pass with zero warnings.
- [x] 04 — Test allocation rounding, plan history, balances, transfer reconciliation, migration, merge and persistence; pass production build. 25 Bun tests / 2,110 assertions pass; Svelte and TypeScript 7 checks have zero errors/warnings; production PWA precaches 14 resources (~148 KiB).
- [x] 05 — Document behavior and actual verification; update human-only acceptance checks. README/PLAN describe v2 migration, monthly reset, manual transfers, starting funds, classification, and restore behavior. Physical-device/browser checks remain pending.

Implementation defaults: monthly budget limits reset without rollover; actual account balances carry forward. Plans recommend allocations and never move money automatically. Keep the missing 10% unallocated. Opening balances start at zero until entered by the user. Old expenses remain unclassified until explicitly edited. These defaults are reviewable/editable where relevant and do not require fabricated financial records.

## Dark-only visual update — authorized 2026-11-17

- [x] 01 — Review plan, current styles, and screenshot reference. Use its colors and typography only; keep finance content and workflows.
- [x] 02 — Replace light palette with near-black surfaces, warm gold headings/actions, warm-white text and burgundy accents; apply a close offline-safe sans-serif font match. Updated every existing color declaration and added shared dark palette tokens, bold Arial/Helvetica typography, semantic warning/selection/focus styling.
- [x] 03 — Match native form controls, PWA launch/background colors and app icons to dark-only styling. Set dark color-scheme, HTML startup background/theme metadata and manifest to #090a0e; regenerated regular/maskable/touch PNG icons and SVG in gold/burgundy.
- [x] 04 — Run existing tests and production build; document actual verification and pending visual/device acceptance. 25 tests / 2,110 assertions pass; Svelte/TypeScript checks clean; production PWA built. Browser visual/device checks remain pending.

## Phase 3 — authorized 2026-11-17

- [x] 01 — Review plan, confirm ECharts 6.1.0, and define forecast assumptions. Use savings only, ordered wishlist reservations, actual monthly income over expected, then optional scenario/recent-history fallback; no real balance changes.
- [x] 02 — Implement schema v3, legacy migration, expected income/wishlist validation and merge; add trend aggregation and savings forecast domain functions. Added `insights.ts` and v3 collections in `finance.ts`; tests follow task 05.
- [x] 03 — Add accessible, responsive ECharts 6.1 dark dashboards, insights, category/day drilldown and account history. Modular SVG charts load on demand with resize/disposal, reduced motion and tables. Navigation wired.
- [x] 04 — Add expected-income and wishlist CRUD, priority ordering, target months and adjustable forecast assumptions. Forms, ordered reservations, forecasts, delete confirmation and v3 backup UI wired.
- [x] 05 — Test reconciliation, forecasts, migration/import/persistence and production PWA build; document verification and human acceptance. 47 tests / 2,186 assertions pass; Svelte/TS7 and production build clean; offline cache includes dynamic ECharts modules (17 resources, ~726 KiB). Manual visual/device checks remain pending.

## Phase 4 & Vercel production preparation — authorized 2026-11-17

- [x] 01 — Review plan and verify latest packages plus Vercel Bun/static configuration. Registry latest versions currently match the existing stack; ECharts 6.1.0 remains latest. Use explicit cost/returned/fee/additional-loss terminology.
- [x] 02 — Update dependency selectors without exact pins, refresh lockfile, and run all tooling under Bun. Registry latest refreshed; manifest uses latest selectors with TS6 tooling/ECharts 6.1 compatibility ranges, and all scripts explicitly use Bun.
- [x] 03 — Implement schema v4 investment positions/events, cash-entry linking, realized/unrealized ROI, migration and validated backups. `finance.ts` validation and `investments.ts` enforce unique matching cash links and optional valuation semantics.
- [x] 04 — Build optional investment management, event CRUD/linking, valuation and ROI interfaces in the existing dark mobile UI. Investment screen, confirmed deletion choices and mobile More menu are wired; Svelte/TS checks pass.
- [x] 05 — Harden atomic persistence, update/error behavior, and static Vercel deployment with caching/security headers and release checks. Added atomic IndexedDB mutations, Vercel config, Bun release/asset validation and CSP-compatible static output checks.
- [x] 06 — Complete tests, dependency audit and production checks; document deployment and actual verification limits. 63 tests / 2,241 assertions pass; Bun release/check/build/artifact verification and frozen install pass; audit finds no vulnerabilities after glob override. Deployment guide and manual acceptance checklist updated.

## Income and monthly spending update — authorized 2026-11-17

- [x] 01 — Add selectable and custom income types without changing existing records. Existing entry categories are retained; `bun run check` passes with zero diagnostics.
- [x] 02 — Support adding, editing and deleting allocation buckets while preserving historical plans, spending and backups. Dated allocation snapshots retain stable bucket IDs; 66 tests / 2,255 assertions and production build pass with zero Svelte/TypeScript diagnostics.
- [x] 03 — Add reusable monthly installment tasks with required end dates, salary reminders and explicit payment-to-spending/bucket links with validated backups. `bun run release`: 79 tests / 2,320 assertions, clean Svelte/TypeScript checks and verified production artifacts; browser exercised allocation, income, payments, end dates, backup merge and responsive layout, and production preview saved/reloaded a schedule under offline emulation.
- [x] 04 — Update the plan, usage/deployment documentation and human acceptance checks with current behavior and verification evidence. README, PLAN, DEPLOYMENT and TASKS_HUMAN describe v7 migration, schedule end dates and pending device/deployment acceptance; `git diff --check` passes.

## Allocation amounts and production loading — authorized 2026-11-17

- [x] 01 — Support percentage or fixed EGP allocations and improve plan-page resilience without changing existing financial records. Fixed-amount support, an older-browser compatibility change and a rendering error boundary are implemented; `bun run build` and Svelte/TypeScript checks pass. Tests were not run as requested. The original phone-specific failure remains unconfirmed without device details.
- [x] 02 — Allow new and existing monthly schedules to have no end date, without changing dated schedules or recording payments automatically. `bun run build` and Svelte/TypeScript checks pass; tests were not run as requested.

## Monthly remaining balances — authorized 2026-11-17

- [x] 01 — Add optional remaining balances to monthly schedules, update them with linked payment changes, and show them on payment cards. Schema v9 preserves older records and reconciles tracked payments and imports; `bun run build` passes with zero Svelte/TypeScript diagnostics. Tests were not run as requested.

## Fixed mobile viewport — authorized 2026-11-17

- [x] 01 — Disable viewport scaling and pinch-to-zoom on mobile. `index.html` sets `maximum-scale=1` and `user-scalable=no`; `bun test` passes (82 tests / 2,333 assertions), `bun run build` passes with zero Svelte/TypeScript diagnostics, and the production HTML contains the viewport settings.

## Roadmap status

- [x] Phase 2 — Editable allocation plans and real account/transfer ledgers implemented and automated checks passed. Manual browser/device acceptance remains pending in the human checklist.
- [x] Phase 3 — ECharts 6.1 trends, expected income and savings-only wishlist planning implemented; automated verification passed. Manual browser/device acceptance remains pending.
- [x] Phase 4 — Optional investments, cash event links and realized/unrealized ROI implemented. Bun/Vercel production configuration and automated checks pass; deployed/browser/device acceptance remains pending.
- [ ] Phase 5 — Authenticated Neon migration and resilient cross-platform sync.

## Verification log

- 2026-11-17: Bun 1.4.4 available. Registry confirmed Svelte 5.57.3, Tailwind 4.3.5, TypeScript 7.0.2, Vite 8.3.8, ECharts 6.1.0, vite-plugin-pwa 2.0.0, svelte-check 4.7.8. Dependency installation succeeded and `bun.lock` was generated.
- TypeScript 7: svelte-check requires `typescript@6.0.3` plus `@typescript/native@npm:typescript@7.0.2`, with `--tsgo`. The check command uses TS7 for both Svelte and standalone TS. Shared cache contained a corrupt vitefu package; reinstalling into a fresh project cache resolved it.
- Automated results: `bun test`: 10 pass, 0 fail, 43 assertions. Coverage includes exact piastre conversion, invalid amounts, overspending, JSON roundtrip, schema/date/duplicate rejection, idempotent merge with conflict preservation, local month boundaries, IndexedDB save/read, failed-write data preservation and explicit replacement.
- `bun run build`: zero Svelte errors/warnings; native TypeScript 7 check passed; Vite emitted static assets and Workbox service worker, 14 resources precached (~118 KiB).
- Preview started successfully with Bun. Browser verification could not proceed: the origin approval gate denied access to `http://127.0.0.1:4175/`. No screenshots, UI interactions, installability or actual offline reload were verified. Do not bypass this restriction. Physical-device and manual browser acceptance remain pending.

## Phase 2 verification log — 2026-11-17

- User authorized Phase 2; no Phase 3+ code or chart library was introduced. Existing dependencies and Bun lockfile retained.
- Added schema v2 with v1 read migration, plan revisions/effective months, explicit account/budget selection, one opening-funds record per account, and dated transfer CRUD.
- 25 tests pass (2,110 assertions). Includes exact monetary allocation across 1,000 rounding scenarios, future plan isolation, preserved history, balance conservation, net contributions/withdrawals, unclassified historical expenses, v2 roundtrip, import conflicts, and IndexedDB v1-to-v2 commit without data loss.
- Fixed timestamp precision during edits: changing only a category, account, bucket or description preserves the original occurrence seconds/milliseconds. Covered by regression test.
- Final `bun run build`: Svelte-check and TypeScript 7 pass with zero warnings/errors; production service worker includes 14 precached resources (~148 KiB).
- Browser/physical-device checks were not performed. The prior origin approval denial was not retried or bypassed; no visual, native-install or offline-launch verification is claimed.

## Dark-only verification log — 2026-11-17

- Sampled the supplied reference locally: dominant background #090a0e, gold #d9b777, warm-white #e9e4dd, burgundy #bc3448. Only its visual style was used; its text/content was ignored.
- Replaced the light palette throughout existing screens and interaction states with shared dark tokens. Added bold Arial/Helvetica typography as a close offline-safe font match; the screenshot alone cannot identify the exact font.
- Checked core text contrast numerically: gold/canvas 10.35:1, warm-white/surface 14.81:1, muted text/raised surface 8.68:1. Destructive button and selection text use white for contrast against burgundy.
- Updated startup HTML background, dark-only native controls, PWA manifest theme/background, SVG and PNG installation icons. Reduced-motion behavior retained; no financial/data changes or dependency additions.
- Existing 25 Bun tests / 2,110 assertions pass. Production Svelte/TypeScript/PWA build passes with zero warnings/errors; 14 resources cached (~153 KiB).
- Visual browser QA remains unverified under the previously recorded origin restriction. Manual dark-mode/installed-device checks are delegated in TASKS_HUMAN.md.

## Phase 3 verification log — 2026-11-17

- Registry confirmed ECharts 6.1.0. Installed exact version through Bun and updated the lockfile. Modular bar/line/aria/grid/legend/tooltip/SVG imports follow official ECharts documentation; all modules are locally bundled.
- Schema v3 preserves v1/v2 financial records and adds validated expected-income and wishlist collections. Imports preview all counts; merge preserves current expected month/IDs and goal IDs. Replacement is explicit.
- Trends include local-date daily/category reconciliation, actual-versus-expected income separation, cumulative account balances and editable spending drilldown. Every chart has a data table; chart engine uses SVG, lazy loading, resize/disposal and reduced-motion behavior.
- Savings forecasts use actual savings only, current target shares, expense/investment constraints, recorded inflow deduplication, known future savings movements, priority reservations, explicit missing-data/conditional states and target-month checks. Planning never writes real transactions.
- `bun test`: 47 passing tests / 2,186 assertions. New coverage includes schema v2→v3, planning JSON roundtrip and idempotent merge, malformed/duplicate planning data, local trend reconciliation/leap years, income-source precedence, prior-three-month assumptions, savings-only eligibility, goal ordering, future inflow/outflow deduplication, zero/negative capacity, future plans, unknown months, unassessed deadlines and v3 IndexedDB persistence with invalid-write preservation.
- `bun run build`: zero Svelte/TypeScript errors/warnings; production bundle/PWA successful. Split ECharts (~364 KiB) and renderer (~182 KiB) bundles are lazy-loaded and precached. Total cache: 17 resources, ~726 KiB.
- No browser visual, click/keyboard, native installation or airplane-mode verification was performed. The previously denied browser origin was not retried or bypassed. Human checks are listed separately.

## Phase 4 & production verification log — 2026-11-17

- Latest registry versions checked; core packages already matched latest. Manifest exact pins replaced with latest selectors. TS6 tooling and ECharts 6.1 remain compatible nonexact ranges. Native TS compiler remains latest TS7. Bun 1.4.4 is current locally; Vercel/CI select rolling/latest Bun. Lockfile refreshed and frozen install succeeds.
- Implemented schema v4 with optional investments, cost/return/fee/loss events, open/closed semantics, optional manual valuation, unique matching real cash-entry links and v1–v3 migration. Backup preview/export/import include investments; invalid/dangling/conflicting links reject writes.
- Investment examples covered: 20→0 gives -20/-100%; cost20+extra loss20 gives -40/-200%; 20→20 breaks even; 20→40 gives +20/+100%. Partial returns, fees, valuation, linked-entry corrections and delete-cash choices also covered.
- Added atomic IndexedDB read/validate/transform/write and 20-concurrent-write regression test. Invalid changes retain previous ledger; v4 investment/cash data persists together. Downloads read current committed data.
- `bun run release`: 63 tests pass, 2,241 assertions, 0 fail; Svelte/TS7 checks have zero warnings/errors; production build and artifact verification succeed. 17 precached resources (~753 KiB), all dynamic chart CSS/JS assets included.
- Initial audit found moderate build-only glob/minimatch advisories in Workbox. Range-preserving audit fix could not resolve them. Added `glob: latest` override (14.0.6 / minimatch 11.0.9); generated PWA/asset checks pass; final `bun audit` reports no vulnerabilities (445 checked packages). No remaining audit issue was concealed.
- Added Vercel static/Bun config, cache/security/CSP headers, extensionless fallback, release script/artifact verifier and GitHub Actions (checkout v7/setup-bun v2). DEPLOYMENT.md includes official configuration references and human acceptance.
- No deployment created; hosted CI, real HTTP headers/CSP, interactive browser, native install and airplane-mode behavior remain unverified. The previous browser-origin denial was not retried or bypassed.

## Income and monthly spending verification log — 2026-11-17

- Schema v7 adds named allocation snapshots and linked recurring schedules/payments. Older plans and records migrate without fabricated entries; v6 end months become their last calendar dates, and legacy open-ended schedules remain open-ended until edited.
- `bun run release`: 79 tests / 2,320 assertions pass; Svelte/TypeScript checks and production artifact verification pass with zero warnings/errors. The worker precaches 17 resources (~787 KiB).
- Browser checks covered allocation CRUD and historical labels, income types, salary reminders, schedule/bucket assignment, explicit payment recording/undo/deletion, cross-month state, exact end-date boundaries, backup merge and 320/390px layouts. Disposable test data was removed.
- The production preview's service worker controlled the app; an uncached request failed while offline emulation was active, and a schedule was saved and persisted across an offline reload. The test schedule was removed. Actual device installation/airplane mode, hosted CI and Vercel deployment/headers remain pending.

## Viewport verification log — 2026-11-17

- Added a fixed initial scale and disabled user scaling in the viewport metadata. `bun test` passes (82 tests / 2,333 assertions), `bun run build` passes with zero Svelte/TypeScript diagnostics, and the emitted production HTML contains the updated viewport declaration.
