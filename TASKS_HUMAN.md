# Human checklist

Only tasks delegated to the human appear here. These are acceptance checks and future product decisions; no coding work is delegated.

## Phase 1 device acceptance

- [ ] Run `bun run build` then `bun run preview`, open the printed localhost URL in your browser, and check the overview, spending/income forms, edit/delete, search, and backup import/export. The agent checked selected workflows and a production offline simulation; complete broader acceptance with your own test records.
- [ ] Install the production app on your actual Android/desktop browser using its Install/Add to Home Screen action. On iPhone/iPad use Safari → Share → Add to Home Screen. Initial access must use HTTPS or localhost; a phone accessing a PC’s plain HTTP LAN address cannot install this PWA.
- [ ] On each device you care about, add an income and a spending entry, close the installed app, enable airplane mode, reopen it, and verify entries survive and can be edited.
- [ ] Download a JSON backup and store it outside the browser. Import a copy and confirm your real records and timestamps look correct.
- [ ] Confirm EGP and device-local dates/time are right for your daily use. Device/browser installations each have separate data until Phase 5.

## Phase 2 acceptance

- [ ] Open **Plan & accounts** and review the default 55/5/15/15 percentages plus 10% unallocated. Edit them if needed. Default policy is monthly budget reset with actual account balances carrying forward; allocation plans recommend amounts, and transfers are explicit.
- [ ] Enter your real starting funds only for money held before tracked income/spending. Avoid double counting money already recorded; use zero if no opening funds are needed.
- [ ] Review old expenses marked **Needs budget review** and select their budget buckets. Their original categories and timestamps are preserved.
- [ ] On a production build, verify a transfer changes the two account balances equally without changing money-in/money-out totals. Check edit/delete confirmation and a later month’s carried balance using test records you control.
- [ ] Export a current backup and verify it restores plans, starting funds and transfers on a separate test browser/origin. Keep a copy of your original backup before any replacement.
- [ ] Verify the plan/account screens on your phone and installed PWA while offline. Browser emulation passed for selected screens; actual device acceptance remains pending.

## Monthly spending acceptance

- [ ] Using disposable records, add a monthly installment with an end date and due day, link it to a custom allocation, record salary and complete one payment. Check that the expense and bucket totals agree, the next month is pending, and no task appears after the end date.
- [ ] Add a new schedule after the previous one ends. Check editing/undoing a payment and deleting a schedule, then export and restore a current backup on a separate test origin. Verify the same workflows on your phone and installed PWA.

## Dark-theme acceptance

- [ ] Review overview, activity, plans/accounts, backup and dialogs on your phone. Confirm the near-black/gold/burgundy palette and Arial/Helvetica-style font are a good match to your reference, including while your device is set to light mode.
- [ ] Reopen the production PWA online and apply its update prompt, then verify the dark startup screen and offline launch. Installed icons may refresh on the browser’s own schedule.

## Phase 3 acceptance

- [ ] Open **Trends** on a production build. Compare daily/category/monthly totals with your own records, use the data tables and category/day/description filters, and check the charts on your phone with reduced motion enabled.
- [ ] Add expected income for a missing month, then enter actual income for that month. Verify the estimate is labeled superseded and does not add to actual income or real account balances.
- [ ] Add/reorder wishlist goals and review the cumulative savings reservations. Check actual starting savings and the expense/income assumptions before relying on an estimate. Only savings should fund affordability.
- [ ] Review the forecast’s insufficient-data/conditional labels, monthly source table, and target-month results. Adjust temporary income/expense assumptions as needed; these overrides are not saved.
- [ ] Export a current backup and restore it on a separate test browser/origin; confirm expected income and wishlist goals survive with earlier financial records.
- [ ] After the production app finishes caching online, reopen it in airplane mode and visit **Trends** and **Wishlist**, including charts you have not opened before. Chart bundles are precached by the build; actual installed-device offline behavior remains unverified by the agent.

## Phase 4 and production release acceptance

- [ ] In **Investments** (mobile: **More**), verify your interpretation using disposable test records: 20 cost/0 returned = -20; cost20/extra loss20 = -40; cost20/returned20 = break-even; cost20/returned40 = +20. Close positions to see realized ROI.
- [ ] Link an already-recorded investment transaction and confirm no duplicate cash entry appears. Edit its event, try a manual valuation, and review the keep-cash versus delete-cash confirmation choices.
- [ ] Export a current backup and restore it on a separate test origin/browser; confirm investments, cash links and earlier financial/planning records survive.
- [ ] Follow `DEPLOYMENT.md` to import the repository into Vercel and deploy the final HTTPS domain. The agent prepared the config but did not create a deployment or run hosted CI.
- [ ] Export records from localhost/your old domain, then import them on the production domain. Finance data is origin-specific and remains local; changing domains or deploying to Vercel does not migrate or back it up automatically.
- [ ] On that final deployment verify actual HTTP cache/security headers, no CSP errors, phone layout/navigation/forms, installation, a complete airplane-mode session including charts/investments, and update prompts. These runtime/device checks remain unverified by the agent.

## Decisions needed before later phases

- [ ] Phase 5: choose authentication/recovery preferences and approve real-data migration after offline acceptance.
