# FinTrack implementation plan

Status: Phases 1–4 and the authorized allocation/monthly-spending update are implemented. The previous release checks passed; the latest changes have a passing production build but were not tested at the user's request. Deployment, hosted CI and physical-device acceptance remain pending. Phase 5 is planned, not implemented.

## Product

A mobile-first personal finance app that starts fully offline with no login or application server. Users enter income and spending, retain ownership of their data, and later opt into online sync. Phase 1 defaults to EGP. Browser-native installability is the interpretation of “Native PWA”; no native shell or app store dependency.

## Technical foundation

- Dark theme only (requested 2026-11-17). Screenshot is a visual reference only: near-black backgrounds, warm gold headings/accent, burgundy detail, warm-white body text, bold sans-serif typography. Use a local Arial/Helvetica-compatible font stack as a close visual match; the image does not identify an exact font. No theme switch or automatic light mode.

- Current resolved versions: Svelte 5.57.3, TypeScript 7.0.2, Tailwind CSS 4.3.5, Vite 8.3.8, Bun 1.4.4. Registry latest verified on 2026-11-17. User requests no exact manifest pins: dependencies use latest selectors, except TypeScript-6 tooling/ECharts-6.1 compatibility ranges; retain the tested Bun lockfile for reproducible production installs.
- Svelte-check requires TypeScript 6.0.3’s tooling API alongside the TypeScript 7 native compiler alias. Both Svelte and standalone type-check commands explicitly run TypeScript 7.
- Static client application. Development/preview uses a local static asset server; production has no API or server-side code. Installable PWAs require HTTPS (or localhost) for the initial load; `file://` is not a supported launch method.
- IndexedDB stores the versioned ledger transactionally. Browser storage is device/origin specific and may be cleared or evicted; JSON backups are essential.
- Offline app shell and locally bundled resources through a generated Workbox service worker. Updates prompt before reloading. No CDNs, telemetry, remote fonts, or login.
- Apache ECharts **6.1.x only** for charts. Manifest uses that family range; lockfile currently resolves 6.1.0. All chart modules are bundled/cached locally.
- Separate agent execution checklist and human-only acceptance/decision checklist.

## Phase 1 — Income and daily spending

### Deliverables

1. Responsive monthly overview with income, spending, remaining balance, and spending-to-income indicator. All summaries use the selected month, not lifetime carryover.
2. Add multiple income entries per month, each with amount, description, and actual date/time.
3. Add spending with positive amount, required note, category, and actual date/time defaulting to now. Users can backdate entries. Stored timestamps are ISO UTC; display and month boundaries follow the device’s timezone.
4. Edit or delete entries, with explicit deletion confirmation. Keep immutable entry ID and creation timestamp during edits.
5. List/search/filter monthly activity. Remember custom spending categories from existing records and suggest them in subsequent forms.
6. IndexedDB persistence, write failures surfaced without discarding current data, cross-tab refresh and serialized writes where Web Locks is available.
7. Export all records as JSON. Validate import format/version/currency, timestamps, sizes, positive integer amounts and unique IDs. Preview import counts, merge without duplicate IDs, or explicitly replace all records. Current records win ID conflicts during merge; replacement restores the backup exactly.
8. PWA manifest with regular/maskable icons, standalone mode, offline reload support, update prompt, native installation prompt when supported, and Safari installation instructions.
9. Meaningful domain tests, production build, browser verification, setup/architecture documentation.

### Phase 1 acceptance

Income and spending survive reload and a closed/reopened installed PWA. Entries remain readable/editable offline after the initial online load. Editing timestamps moves entries to the correct local month. Empty and overspent months display correctly. Backup round trips preserve IDs, amounts, and timestamps. Invalid imports never overwrite the ledger. No account or network API is necessary. Physical mobile install checks remain human acceptance tasks.

### Data contract v1

`{ schemaVersion: 1, currency: "EGP", entries: Entry[] }`

Entry: `id` (UUID for app-created records), `kind` (`income | expense`), `amountMinor` (positive integer piastres), `note`, `category`, `occurredAt`, `createdAt`, `updatedAt` (ISO timestamps). Export adds `exportedAt`, which import may ignore. Currency is ledger-wide. The entry kind determines direction; negative inputs are not allowed. Schema upgrades must be explicit migrations, never destructive resets.

## Phase 2 — Editable allocation plan and accounts

Authorized by the user on 2026-11-17. Initial policies: monthly budget limits reset without rollover; real account balances carry forward. Allocations are recommendations, with explicit user-recorded transfers. Opening balances are zero until provided. The missing 10% stays unallocated. Existing expenses retain an unclassified budget bucket until the user chooses one; category text is preserved.

Proposed defaults from the brief:

| Allocation | Share |
| --- | ---: |
| Day-to-day life (food, bills, transport) | 55% |
| Fun (cinema, movies) | 5% |
| Savings account | 15% |
| Investment account | 15% |
| Unallocated, pending user decision | 10% |

The requested percentages add to 90%. Keep the remaining 10% visible as unallocated until decided. Do not normalize or redistribute it silently.

Implemented: editable versioned allocation plans with effective months; budget versus actual; opening balances; wallet/savings/investment account ledgers; explicit transfers so account movements do not inflate income or spending; deterministic rounding to piastres; multiple income deposits; overspending warnings and a monthly reset policy. Allocations recommend amounts only; they never create transfers. Existing spending remains unclassified until user review. Shares must total <=100%, with the remainder explicitly shown.

### Phase 2 data and calculation contract

Schema v2: `{ schemaVersion: 2, currency: "EGP", entries, plans, transfers, openings }`. Import still accepts v1 and upgrades in memory without changing IDs, amounts, occurrence/creation/update timestamps, notes or categories. Read-only loading leaves stored v1 untouched; the next successful transactional save writes v2. Future schema versions are rejected without resetting data.

- Entries add optional `account` (`wallet | savings | investment`) and expense-only `bucket` (`life | fun | unallocated`). Missing account means wallet; missing bucket means unclassified. There is no automatic classification of existing records.
- Plans contain immutable ID, effective month, positive revision number unique to that month, basis-point shares, and creation timestamp. Highest applicable month, then highest revision, wins. Saving a new month does not change prior months. Explicitly revising a past/current effective month recalculates that month onward until the next dated plan, while retaining prior revisions.
- Shares have two-decimal percentage precision (100 basis points = 1%). Targets use monthly actual income, integer/BigInt largest-remainder rounding, and fixed tie order: life, fun, savings, investment, unallocated. Every piastre reconciles.
- Transfers contain ID, different source/destination accounts, positive piastre amount, note and the three timestamps. Both sides are represented by one record. Edits/deletions recalculate both sides; transfers never change income or expense totals.
- Each account may have one starting-funds record: ID, account, nonnegative amount, effective occurrence time, creation/update times. It adds held funds once, not income, and is editable or neutralized by setting zero. Earlier recorded entries are not erased or replaced.
- Account balance through selected month end = starting funds effective by then + income − expenses + transfers received − transfers sent. Account balances carry forward. Negative balances are allowed and flagged. Investment here is a cash ledger, not market value or ROI.
- Monthly budget spending sums explicitly assigned life/fun/unallocated expense buckets regardless of payment account. Unclassified spending remains in overall totals and is surfaced separately for manual review. No budget rollover. Savings/investment progress is net transfers + direct income − direct expenses for that account/month; starting funds are excluded.
- V2 JSON backups include all collections. Merge keeps current records by matching ID and current starting funds by matching account; conflicting plan revisions fail the whole import. Explicit replace restores all collections. V1 replacement contains no Phase 2 records, so it clears those collections after confirmation.

Verification: 25 passing Bun tests / 2,110 assertions; clean Svelte/TypeScript 7 check and production PWA build, 14 cached resources. Browser UI/offline launch has not been verified because the earlier origin approval gate remains a limitation; physical-device checks stay with the human.

Exit: monthly allocations reconcile to income; real balances reconcile to deposits, withdrawals, and transfers; editing a future plan does not rewrite past allocations.

## Phase 3 — Trends, insights, and wishlist forecasts

Authorized 2026-11-17. Implemented with the following assumptions: order wishlist items by priority and reserve earlier prices before later goals; do not earmark wallet/investment funds. Forecast from actual savings now. Actual monthly income overrides expected income for the entire month, never adding the two. Otherwise use explicit expected income, an optional temporary fallback, or average income from recorded months in the previous three completed calendar months. Expenses use an editable assumption defaulting to averages for months with recorded entries over those same three months (income-only months have zero recorded spending; entirely missing months are excluded). Project only savings transfers supported by income after expense/investment needs, capped by the effective savings share. Already-recorded savings inflows count toward that target; never add them twice. Unknown months assume no extra savings and are flagged, so estimates depending on them are conditional. Forecasts are scenarios, not real account movements or promises.

### Delivered screens

- **Trends:** daily spending for the selected local month, top 10 category chart with complete category table, month-by-month actual/expected income and spending, cumulative savings/investment cash balances, top category/highest-spend day/monthly spending comparison, and category/day/description drilldown with entry editing. History windows: 3, 6, 12 or 24 months ending in the selected month. Missing actual income is explicitly missing, not a zero-income claim.
- **Wishlist:** saved expected income (one amount per month, including explicit zero), goal CRUD with target prices/priorities/optional target months, up/down ordering, current savings available after prior reservations, and estimated month-end affordability. Savings forecasts run from now independently of the selected dashboard history month.
- **Charts:** Apache ECharts 6.1.0 pinned in Bun lockfile; modular bar/line charts with SVG renderer, on-demand loading, ResizeObserver and disposal, reduced-motion handling, descriptions, keyboard-accessible data tables and drilldown alternatives. Chart code/renderer are separate local bundles, included in the offline cache. No remote chart runtime requests.

### Phase 3 data contract and forecasting rules

Schema v3 adds `expectedIncomes` and `wishlist` to v2. V1/v2 inputs migrate in memory with empty planning collections, preserving existing financial data and IDs. Next successful save commits the complete v3 ledger atomically. Export includes all collections. Merge preserves current expected income by month and ID, and current wishlist records by ID; repeated merges are idempotent. Explicit replacement with an older backup clears fields that version does not contain.

ExpectedIncome: ID, local `month`, nonnegative `amountMinor`, required note, creation/update timestamps. Wish: ID, name, positive `priceMinor`, integer priority (1–100000), optional target month, creation/update timestamps. Tied priorities sort by creation time then ID; reorder renumbers the queue. Both are planning records, never real income, transactions or balances.

Forecast steps (1–120 months; UI choices 12/36/60/120):

1. Start at actual savings through the current timestamp. Wallet/investment funds cannot make a goal affordable.
2. For each month, choose actual income (any entry replaces the full expected estimate), expected income, explicit temporary fallback, recent average, or unknown in that order. Recent averages use only recorded income months in the prior three completed calendar months.
3. Use that month’s effective allocation. Savings capacity is `max(0, min(savings target, income - max(assumed expenses, recorded monthly spending) - investment target))`. Expense assumptions default from recent recorded history; users may override to zero or another nonnegative amount. Future deficits do not automatically withdraw money from savings.
4. Extra projected contributions are `max(0, capacity - already recorded savings inflows for that month)`. Apply recorded future savings movements (income, expenses, transfers, opening funds) once. Earlier savings inflows are already in the starting balance. No automatic replenishment of withdrawals and no investment return assumptions.
5. Compare each goal’s cumulative price (including prior goals) with the starting savings and projected month-end balances. The chart is before wishlist purchases; prices are reserved separately. Editing priorities recalculates those reservations. No purchases or account entries are created.
6. Show enough-now, estimated month, conditional month, insufficient-data or not-reached-within-horizon. Unknown months assume no additional contributions and mark later estimates conditional. A target outside the forecast window or blocked by missing data remains unassessed. Estimates are conditional scenarios, not promises.

Verification: 47 Bun tests / 2,186 assertions pass. Svelte/TypeScript 7 checks and production build pass without warnings. Workbox precaches 17 resources (~726 KiB), including all dynamic chart bundles. Interactive visual, chart interaction, native install and offline launch checks remain pending under the previously recorded browser-origin restriction; that restriction was not bypassed.

Use modular Apache ECharts 6.1.x, locally bundled and accessible with text/table equivalents. Dashboards: daily spending, category totals, descriptions/drilldown, month-to-month actual income, savings account and investment account activity. Custom categories remain user-editable and suggested later. Every visualization respects local dates, selected period, and missing data.

Wishlist: named item, target price in EGP, priority/order, current savings available, optional target date. Estimate affordability using **only savings**, explicitly accounting for higher-priority wishlist reservations. Show forecast assumptions and a clear insufficient-data state. No guaranteed purchase dates.

Expected income: separate forecast records with expected month/date and amount. Use them only for months without actual income according to a documented replacement rule; never count forecast as a real balance or double count actual income. Initial forecast can project current allocation percentages against expected income and recent actual income where available. Show an adjustable scenario and estimated earliest affordability date, plus handling for zero/negative saving capacity and uncertain future income.

Exit: daily/monthly totals reconcile with ledger; forecasts distinguish actual and assumed values, explain savings-only constraints, and update when real income arrives.

## Phase 4 — Optional investment outcomes and ROI

Authorized 2026-11-17, including production preparation for static Vercel deployment. Implementation uses explicit costs, cash returned, fees and extra losses; investment funding transfers remain transfers. Each monetary investment event creates or uniquely links one real investment-account cash entry, so it is counted once. Open positions may have an optional dated manual valuation; closed positions show realized ROI. No live price feeds or trading actions.

Package policy changed by user: remove exact manifest pins and refresh to latest available releases. Retain a TypeScript 6 tooling compatibility range alongside latest native TypeScript, and the required ECharts 6.1.x range. The Bun lockfile records resolved packages for reproducible deployment. Vercel serves the static app; Bun runs installation, checks/tests and build. No Phase 5 backend/auth is added.

Optional labeled investment positions (gold, software, other), contributions/costs, proceeds/returns, dates, fees, and explicit additional liabilities/outflows. Distinguish cash returned from profit and current valuation. Use `(net proceeds - total cost) / total cost * 100` for realized ROI when cost >0; display currency profit/loss alongside percentage. Handle pending/unrealized and break-even separately.

Implemented cash-flow examples (all amounts EGP):

| Cost | Total cash returned | Extra loss/liability | Net result | ROI |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 0 | 0 | -20 | -100% |
| 20 | 0 | 20 | -40 | -200% |
| 20 | 20 | 0 | 0 (break-even) | 0% |
| 20 | 40 | 0 | +20 | +100% |

The UI asks for **total cash returned**, including principal, and **additional money lost** explicitly. Returning 20 total breaks even on a cost of 20; earning 20 profit requires 40 total returned. Funding transfers are excluded from investment costs. Multiple cost/return/fee/loss events retain independent dates, IDs and audit timestamps.

### Phase 4 delivered model and behavior

Schema v4 adds `investments` and `investmentEvents`. V1–v3 data migrates in memory with empty investment collections; existing financial/planning data remains unchanged. The next successful save commits the entire current ledger. Backups include all collections; a replacement with an older version clears newer collections after explicit confirmation.

Investment: ID, name, custom/suggested label, note, open/closed status, optional `{ amountMinor, valuedAt }` manual remaining value, creation/update timestamps. InvestmentEvent: ID, position ID, kind (`cost | return | fee | loss`), piastre amount, note, occurrence/creation/update times and linked cash-entry ID.

- Every positive event creates or uniquely links one matching investment-account cash entry; costs/fees/losses are expenses, returns are income. Zero cash returned is a valid event without an income entry. No positive event may have a dangling, reused or mismatched cash link. Transferring funds to the investment account is separate and never counted as a purchase.
- Event edits synchronize cash amount, direction and occurrence timestamp in the same transaction. Metadata-only edits preserve exact original seconds/milliseconds. Direct changes/deletions that would break an investment link are rejected with instructions to edit/remove tracking first.
- Closed result = returned cash − costs − fees − extra losses. Realized ROI = result ÷ costs × 100. Closing requires a recorded cost. Open positions show cash flow; optional remaining value produces a distinct estimated/unrealized total result. Valuations never enter real cash balances. Aggregate closed ROI is cost-weighted, not an average of percentages.
- Removal confirmation keeps cash by default. An explicit checkbox also removes linked cash and changes balances/totals. Removing the last cost reopens a closed position. Removing a whole position removes its reporting events, with the same explicit cash-retention choice.
- Investments remain optional; empty tracking creates no records or requirements elsewhere. Labels such as gold/software/subscription are editable. The mobile More menu provides Investments, Wishlist and Backup without cramming seven tabs into the navigation bar.
- Cash events appear once in overall money-in/money-out and cash-income history; returns may include principal and are not all salary or profit. New investment expenses default to the unallocated budget bucket; existing linked classifications are retained.

### Production preparation

`vercel.json` selects Vite, rolling Bun `1.x`, frozen install, `bun run release`, and `dist`. It includes extensionless SPA fallback, same-origin CSP and security headers, immutable hashed assets, revalidating HTML/manifest/icons, and noncached service worker. This is static hosting; no server functions or database are deployed. `DEPLOYMENT.md` explains final-domain data migration and required manual acceptance.

All scripts run through Bun. Main package selectors are latest; TypeScript 6 is the Svelte tooling compatibility bridge, while the native compiler is latest TypeScript 7. ECharts remains within 6.1.x. A latest glob override updates Workbox’s transitive glob/minimatch graph to patched versions; the generated PWA and cached-asset checks pass with it. Frozen installs use the committed tested lockfile, rather than upgrading dependencies during deployment.

Storage mutations now read, transform, validate and write in one IndexedDB read/write transaction. Concurrent updates survive across tabs without Web Locks. Failed validations abort without changing stored data. Backup export refreshes from committed storage first. Release checks validate manifest, icons, Bun/static settings, no exact manifest pins, CSP-compatible HTML, and precaching of all dynamic code/styles. GitHub CI runs frozen install, dependency audit and release checks using Bun latest.

Verification: 63 tests / 2,241 assertions pass, zero Svelte/TypeScript warnings/errors, release artifact check passes, frozen install succeeds, and audit reports no vulnerabilities in 445 checked packages. The PWA precaches 17 resources (~753 KiB). No Vercel deployment or hosted Linux CI run was performed. Interactive UI, actual deployed headers/CSP, native installation and offline launch remain unverified under the prior browser-origin restriction; no bypass was attempted. Manual checks remain in `TASKS_HUMAN.md`.

Exit: each example above computes correctly; optional investments can remain unused without blocking the rest of the app; account balances and ROI reconcile.

## Custom allocations and monthly spending — authorized 2026-11-17

- Named allocation snapshots use stable bucket IDs, editable names and basis-point shares. Plans remain effective by month and retain revisions; removed buckets keep historical spending. Unallocated remains the explicit remainder. Savings/investment targets retain their account semantics, and forecasts use the same allocation rounding as the plan.
- Income categories offer salary and other suggested/custom types using the existing entry category. Adding a salary opens pending monthly payments for that month but never automatically creates an expense.
- Monthly schedules have a name, positive piastre amount, category, account, optional bucket, starting month, optional end date, and optional due day. No end date means the schedule continues indefinitely. A due day after an end date excludes that final month's task; without a due day the last month is included. Due days clamp to the last day of short months. The original new-schedule end-date requirement was removed at the user's request.
- Explicit completion atomically creates one real expense and a unique schedule/month link; the following month stays pending. Payment corrections retain the link and must stay in its month. Undo removes the linked expense. Deleting a schedule keeps its cash entries. Changing the schedule's bucket or other defaults never rewrites completed entries. Plan & accounts exposes bucket assignments.
- Schema v7 contains allocation snapshots, `recurringExpenses` and `recurringPayments`. Older versions migrate in memory without changing financial records; a v6 inclusive end month becomes its last calendar date. Backups validate schedule dates, unique monthly links, referenced cash entries and conflicts before writing. Current records win matching IDs; incompatible payment or plan merges fail atomically.
- Verification: `bun run release` passes 79 tests / 2,320 assertions, clean Svelte/TypeScript checks and production artifact verification; 17 resources (~787 KiB) are precached. Browser checks covered custom allocations, salary/freelance, bucket assignment, completed/undone payments, end dates, backup merge, reload and mobile widths. A production preview reloaded and persisted a schedule under offline emulation with an uncached request blocked. Physical devices, deployed headers and hosted CI remain unverified.

## Fixed allocation update — authorized 2026-11-17

- Schema v8 preserves existing percentage plans and allows each allocation to use either basis points or a nonnegative fixed amount in piastres. Percentages apply to full monthly income; fixed targets are not reduced when income is low. The unallocated target is the remaining income, or zero with an explicit over-allocation warning. Forecasts use the same targets.
- A compatibility change removes reliance on `Object.hasOwn`, and a plan-page error boundary keeps the rest of the app and backup accessible if rendering fails. The reported production-phone failure could not be reproduced with its device-local data; its root cause remains unconfirmed.
- Tests were not run at the user's request. Svelte/TypeScript checks and the production build passed; physical-device acceptance remains pending.

## Monthly remaining balances — authorized 2026-11-17

- Schema v9 adds an optional current remaining balance to recurring schedules, stored as integer piastres. Earlier ledgers migrate without assuming a balance. Payment records created while tracking is enabled record how much was applied; payment edits, deletion and undo adjust the balance atomically. Balances may carry an overpayment internally, displayed as zero remaining and the excess overpaid.
- Adding a balance does not retroactively apply earlier payments. Removing tracking clears payment balance links. Editing the schedule without changing its balance preserves concurrent payment updates. Reaching zero does not stop or delete a schedule.
- Backup merges apply newly imported tracked payments once to an existing tracked balance; incompatible tracking rejects the merge before writing. The production build and Svelte/TypeScript checks pass; tests were not run at the user's request. Physical-device acceptance remains pending.

## Phase 5 — Neon database, authentication, cross-platform sync

Begin after offline workflows and backup recovery pass acceptance. Select an auth provider and add a trusted API/backend: never expose privileged Neon credentials in the browser. Design authenticated per-user access, authorization, validation, rate limits, and tenant isolation before real uploads.

Migrate local schemas to versioned relational entities: users, entries, allocation plans, accounts/transfers, forecasts, wishlist items, investments and return events. Preserve local UUIDs and audit timestamps. Add explicit opt-in migration with dry-run counts and amount reconciliation, a downloadable pre-migration backup, and idempotent imports. Keep local-first IndexedDB plus an outbox for offline use; implement sync cursors, tombstones for deletions, revision/conflict policy, retries, and multi-device timezone rules. Surface conflicts instead of silently overwriting. Include export, account/data deletion, recovery, and disaster-backup strategy.

Exit: offline-created changes sync once authenticated; cross-user isolation passes tests; interrupted migrations resume without duplicates; conflicting edits/deletions have a tested resolution; user can still export all their data.

## Decisions queued for future phases

- Phase 2 defaults chosen for review: 10% unallocated, no budget rollover, explicit transfers. User can edit percentage allocations and enter real opening balances. Automatic transfers or rollover would require a later change request.
- Phase 3 defaults for review: cumulative priority reservations and three completed calendar months of recorded income history. Temporary forecast assumptions are editable and are not saved.
- Phase 4 uses explicit total-cash-return terminology, paid fees/extra losses, independent partial cash events and optional manual unrealized valuation. Outstanding unpaid liabilities, tax accounting and live market prices are not modeled.
- Auth provider, sync conflict policy, multi-currency needs, and cross-device timezone policy.
