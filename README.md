# FinTrack

Offline, mobile-first personal finance. Phases 1–4: income, spending, editable allocation plans, monthly payments, account ledgers, ECharts trends, expected income, wishlist forecasts, investment ROI, and JSON backups. Prepared for static Vercel hosting with Bun. No login, API, backend or database dependency.

Dark theme only, inspired by the supplied visual reference: near-black (#090a0e), warm gold (#d9b777), warm-white (#e9e4dd), and burgundy (#bc3448). Bold Arial/Helvetica-style typography uses local system fonts so it works offline. Controls, dialogs, app icons, and PWA launch colors follow the same theme, regardless of the device’s light/dark preference. There is no light-mode toggle. The screenshot does not identify an exact font; this is a close visual match.

## Run with Bun

```sh
bun install --frozen-lockfile
bun run dev
```

Open the localhost URL printed by Vite. For a production PWA:

```sh
bun run build
bun run preview
```

The build emits a static `dist/` folder. The preview process only serves static files. Deploy that folder to HTTPS static hosting when you want installation on other devices. No application server is required. Service workers require HTTPS or localhost; opening `dist/index.html` using `file://` will not work. The development server does not register the production service worker.

For Vercel, import the repository with the checked-in `vercel.json`. It uses Bun, runs `bun run release` and publishes `dist`. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, data migration, security/cache settings and verification limits. No deployment was created in this task.

## Use it

Choose a month. Add income or spending with an amount, note and occurrence date/time. Income can be entered more than once a month; choose Salary, Freelance, Business, Bonus, Gift, Other, or enter your own income type. Spending categories accept your own text and suggest categories from existing entries. Edit or delete entries in Activity. Totals describe the selected month; they are not a cumulative bank balance.

Data saves to IndexedDB on this device and browser/origin, in EGP integer piastres. ISO timestamps preserve actual spending and entry creation times separately; display/month grouping follows device-local time. There are no sample financial records, telemetry, external fonts or network API calls. Financial trends are calculated locally.

Use **Backup & data** to export a versioned JSON file. Imports are validated before writing. Merge preserves existing entries with the same ID and adds new ones; replace explicitly replaces the complete ledger. Keep a backup before replacing. Browser data can be cleared or evicted; installed PWAs do not automatically back up data. Different browsers and origins have separate records.

### Plan & accounts

The default allocation is 55% day-to-day life, 5% fun, 15% savings and 15% investment, leaving **10% unallocated**. In **Plan & accounts**, add, rename, edit or remove allocations, with up to two decimal places and a total no higher than 100%. Custom allocations are spending buckets; the savings and investment targets remain linked to their accounts and can be restored after removal. Plans take effect by month and remain effective until the next dated plan. Each save adds an immutable revision; the latest revision for a given effective month wins. Editing a future month keeps earlier months unchanged. Editing the current/past effective month intentionally recalculates that month onward until the next dated plan; older versions remain visible in history. Removing a bucket never deletes its existing spending.

Monthly budgets use actual income entries only. Limits reset each month without rollover. Allocation uses exact integer arithmetic and largest-remainder rounding so every allocation plus the unallocated remainder adds back to income, including tiny amounts. It only recommends allocations: saving a plan never creates money movements. Savings/investment progress shows net transfers in minus out plus direct income minus direct spending in that account; starting funds are excluded.

Each income/spending form has an **Account** field. Spending also has a separate **Budget bucket**, including custom allocations, unallocated, or unclassified. Category labels remain independent, so you decide how to budget a shopping purchase. Historical expenses remain unclassified until you edit them; **Review spending in Activity** filters those entries for review. They are always included in overall spending. Assign the default bucket for each monthly payment directly in the plan; this does not change already-recorded payments.

Wallet, savings and investment account cards show cumulative balances **through the end of the selected month**. Prior balances carry forward. **Set starting funds** records money held before tracking began, without treating it as income; enter zero to clear that amount. There is one editable starting-funds record per account, effective at the entered date/time. It adds to, rather than replaces, recorded transactions, so do not include income already entered. No money or sample entries are created automatically.

**Transfer** records a real movement you made between two different accounts. It changes both balances equally and leaves income/spending totals unchanged. Transfers can be dated, edited, or deleted with confirmation. A withdrawal from savings is a transfer back to the wallet. Direct spending from savings/investment is also supported through the entry form. Negative balances are allowed to represent real records and flagged for review. These are local records; the app does not connect to banks or move real money. Investment account tracking in Phase 2 does not calculate ROI.

### Monthly spending

Open **Monthly spending** to add an installment or other recurring payment with its amount, category, account, budget bucket, starting month, required end date, and optional day of the month. The task appears each month until its end date. A due day after the end date is not scheduled in the final month; without a due day, the final month remains included. Days 29–31 fall on the last day of shorter months. Older schedules without an end date continue until edited.

Adding a salary opens that month's pending tasks, but does not pay them automatically. Select **Record payment**, confirm the actual amount, date, account and bucket, and the app creates one spending entry for that month. The schedule remains available in later months until it ends; you can add a new schedule for the next plan. Payments can be corrected in Activity, or undone from Monthly spending; undo removes the linked expense. Deleting a schedule keeps recorded expenses. Changes to schedule defaults do not rewrite earlier payments. A linked payment's date must stay in its original month; undo and record it again to move it to another month.

### Trends

Open **Trends** and select a history month. Charts show daily spending, top categories, month-to-month actual income/spending, and cumulative savings/investment cash balances. Choose 3–24 months for history. The complete figures are in expandable tables, including categories outside the top 10. Click a day/category or use the filters and tables to inspect spending descriptions and edit entries. Custom categories entered in spending forms are included and suggested on later entries.

Expected income is shown separately only when a month has no actual income. Missing actual income stays labeled as not recorded. Investment account charts show cash balances, not market values or ROI.

Charts use locally bundled Apache ECharts **6.1.0**, with SVG rendering, responsive resizing, reduced motion, and data tables for keyboard/screen-reader access. The implementation follows the official [modular import guidance](https://echarts.apache.org/handbook/en/basics/import/) and [accessibility guidance](https://echarts.apache.org/handbook/en/best-practices/aria/). Bundles load when a chart is mounted and are included in the PWA cache, so no CDN is needed.

### Wishlist and expected income

Open **Wishlist** to add expected salary/income by month. Estimates can be zero and remain planning records; they never enter your real balance. Once any actual income exists for that month, the full estimate is superseded, even if actual income is lower. Edit estimates as needed rather than adding a second estimate for the same month.

Create goals with a name, price in EGP, priority and optional target month. Earlier goals reserve their full price before later goals. Reorder with the arrows or edit priority. The app shows savings available now and estimated month-end affordability. Wallet and investment balances cannot fund wishlist eligibility. When you actually buy an item, record the spending and remove its goal yourself; the app never executes purchases or changes accounts automatically.

The scenario starts from actual savings **now**, independently of the history month selected in Trends. It refreshes as records change and at one-minute intervals. Choose a 12/36/60/120-month horizon. Temporary fallback-income and expense overrides are not saved; blank uses recent history, while an explicit zero means zero.

Forecast assumptions:

- Monthly income uses actual records, then expected income, then the temporary fallback, then the average of recorded income months in the previous three completed calendar months. Missing months are excluded from that average.
- Expenses default to the recorded average over prior-three-month periods with any entries (income-only months have zero recorded spending; entirely missing months are excluded). You can override this assumption. Each future month uses the greater of that assumption and its recorded spending.
- Projected savings contributions are limited to the effective savings allocation and what remains of income after expenses and the investment allocation. Already-recorded savings inflows count toward that target and are not added twice. Known future savings movements are applied once. Future deficits do not automatically withdraw from savings, and withdrawals are not automatically replenished.
- No income data means no assumed extra contribution for that month; later estimates are marked conditional. Zero/negative saving capacity does not invent savings. The line chart is **before wishlist purchases**; each goal is assessed against cumulative reserved prices. A deadline blocked by missing data or outside the forecast horizon remains unassessed.

These are transparent scenarios, not guaranteed purchase dates. Review the table’s income sources, assumed contributions and known account movements before relying on an estimate.

### Investments and ROI

Open **Investments** (mobile: **More → Investments**) to create optional labeled positions. Add costs, fees, cash returned and additional losses. Positive events create one investment-account cash entry or link an existing matching unlinked transaction. Linking avoids double counting. Funding the investment account with a transfer never counts as a purchase cost.

Returns are **total cash received, including principal**, not profit. A cost of EGP 20 and cash returned of EGP 20 breaks even. Returning EGP 40 means EGP 20 profit. No return on that cost means -20 / -100% ROI; an additional EGP 20 loss means -40 / -200% ROI. Multiple costs and partial returns are supported. Zero-return events create no income transaction.

Close a position when all returns and costs are recorded. Realized net result = cash returned − costs − fees − extra losses. ROI = that result ÷ purchase/contribution costs × 100. Open positions have no realized ROI; an optional dated manual remaining value produces an estimated result including unrealized value. Valuations never change cash balances. Closed-position summary ROI is weighted by recorded costs.

Editing an event updates its linked cash amount/type/date together. Changing a linked entry’s financial fields directly in Activity is rejected until the link is removed; metadata-only changes remain possible. Deleting tracking keeps cash entries by default. The confirmation checkbox explicitly deletes linked cash too and recalculates balances. Removing the last cost reopens a closed position.

Investment costs/returns are real cash outflows/inflows in the general ledger, so they appear in the overall money-in/money-out and cash-income history. Cash returned may include principal and is not all profit or salary. New investment expenses default to the unallocated budget bucket; existing linked classifications are preserved. Transfers remain excluded from income/spending totals.

### Backup format and migration

Exports use schema **v7**: `entries`, `plans`, `transfers`, `openings`, `expectedIncomes`, `wishlist`, `investments`, `investmentEvents`, `recurringExpenses`, and `recurringPayments`. Plans include named allocation snapshots. EGP values remain integer piastres. Existing v1–v6 data migrates in memory without discarding or inventing financial records. A v6 schedule's last month becomes its last calendar day; open-ended schedules remain open-ended. Mutations read/validate/write in one IndexedDB transaction, retaining simultaneous tab changes without relying on Web Locks. The next successful write commits v7. Legacy missing account means wallet; expense buckets stay unclassified. Export before upgrading, close older app tabs, and apply the update prompt before editing.

Merge adds new record IDs, keeps current records on matching IDs, current starting funds on matching accounts, and current expected income on matching months. Conflicting plan revisions, duplicate monthly payments, or mismatched/reused cash links reject the whole merge. Replace restores the complete backup; older versions clear newer collections they do not contain. Repeated merges are idempotent. Backup downloads refresh the committed ledger first so they include other tabs’ completed changes.

Install through the browser’s native Install action if available. On iOS/iPadOS: Safari → Share → Add to Home Screen. Open the production app online once and let offline preparation finish before disconnecting. The cached app shell then launches offline. An update banner allows you to finish your entry before reloading.

## Checks

```sh
bun test
bun run check
bun run build
bun audit
bun run release
```

Current verified resolutions: Svelte 5.57.3 · Tailwind 4.3.5 · TypeScript 7.0.2 · Vite 8.3.8 · Bun 1.4.4 · Apache ECharts 6.1.0. Dependencies use `latest` selectors rather than exact pins, except ECharts `6.1.x` and the TypeScript-6 tooling compatibility range. `bun.lock` retains the tested resolutions for production. The latest glob override fixes Workbox build-time dependency advisories; see [deployment notes](DEPLOYMENT.md).

Svelte-check currently needs the TypeScript 6 tooling API alongside TypeScript 7. The alias layout uses `typescript: "^6"` for tooling and `@typescript/native: "npm:typescript@latest"` for compilation. Both Svelte and standalone checks explicitly select TypeScript 7 and all scripts run with Bun.

Verified 2026-11-17: `bun run release` passes 79 Bun tests (2,320 assertions), Svelte/TypeScript checks and production PWA/artifact checks. The worker precaches 17 resources (~787 KiB), including dynamic charts. Browser checks exercised allocation editing, income types, monthly payments, end dates, backup merge and responsive views; production preview reloaded and saved a monthly schedule while uncached requests were blocked by offline emulation. Physical-device installation/airplane-mode behavior, hosted CI and Vercel deployment/headers remain unverified. Complete `TASKS_HUMAN.md` before relying on the deployment.

## Project map

- `src/App.svelte`: screens, entry forms, PWA lifecycle, backup workflows.
- `src/lib/finance.ts`: data contract, money arithmetic, date helpers, backup validation.
- `src/lib/FinancePanel.svelte`: allocation editor/history, account balances, starting funds and transfer/account ledgers.
- `src/lib/recurring.ts` / `src/lib/RecurringPanel.svelte`: monthly schedules, end dates, linked payments and task management.
- `src/lib/insights.ts`: trend aggregations, local calendar helpers, income assumptions and savings-only forecasts.
- `src/lib/TrendsPanel.svelte`: chart dashboards, tables, insights and spending drilldown.
- `src/lib/PlanningPanel.svelte`: expected income, wishlist, priorities and scenario forms.
- `src/lib/investments.ts` / `src/lib/InvestmentsPanel.svelte`: optional investment events, cash linking and realized/unrealized ROI.
- `src/lib/Chart.svelte` / `src/lib/charting.ts`: accessible, responsive ECharts lifecycle and modular engine loading.
- `src/lib/storage.ts`: transaction-based IndexedDB persistence.
- `src/app.css`: Tailwind entry, design tokens, responsive styling.
- `vite.config.ts`: static build and generated PWA configuration.
- `vercel.json` / `DEPLOYMENT.md`: Bun/Vercel settings and deployment instructions.
- `scripts/verify-release.ts` / `.github/workflows/ci.yml`: release artifact verification and Bun-based CI.
- `PLAN.md`: complete five-phase roadmap and data/ROI decisions.
- `TASKS_AGENT.md`: sequential implementation status and verification evidence.
- `TASKS_HUMAN.md`: physical-device acceptance and future decisions only.
- `AGENTS.md`: instructions for subsequent agent work.

Neon/auth and cross-device sync remain Phase 5 work. Vercel hosting does not store or synchronize financial records; keep JSON backups.
