# Deploy FinTrack to Vercel

The project is prepared for a static Vercel deployment. No API, database, authentication, environment variables or server functions are required. Finance records remain in the browser’s IndexedDB; hosting the app does not back them up or synchronize devices.

## Deploy

1. Push this project to your Git repository, including `bun.lock` and `vercel.json`. Exclude `node_modules`, `dist`, `.bun-cache` and `.vercel` (already ignored).
2. Import the repository into Vercel. Select the project root containing `package.json`.
3. Keep the checked-in settings: framework **Vite**, install command `bun install --frozen-lockfile`, build command `bun run release`, output directory `dist`. `bunVersion: "1.x"` selects the supported rolling Bun runtime family. Do not add a Node engine override.
4. Deploy. The build runs tests, Bun-based Svelte/TypeScript checks, the production PWA build and artifact verification. GitHub CI additionally audits dependencies.
5. Use the final HTTPS production domain consistently. Complete the release acceptance checklist below before relying on it for your daily records.

Vercel’s supported configuration is documented in [Static Configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Bun Runtime](https://vercel.com/docs/functions/runtimes/bun). Bun runs installs, scripts and builds here. The deployed application runs in the browser as static JavaScript; there is no server process to keep alive.

## Local release check

```sh
bun install --frozen-lockfile
bun audit
bun run release
bun run preview
```

`bun run release` runs 79 tests, type/Svelte checks, static compilation and `scripts/verify-release.ts`. The artifact check verifies the dark standalone manifest, installation icons, every CSS/JS bundle in the offline cache, no remote/inline HTML scripts, no exact package manifest pins, Bun configuration and service-worker cache headers. It checks artifacts/configuration; it does not replace real device or deployed HTTP verification.

## Data migration to the hosted app

Before switching from localhost or another domain, export JSON using **Backup & data**. Open the production domain and import that file. Different origins—including localhost, Vercel preview deployments and your final domain—have separate IndexedDB databases and service-worker caches. Changing the domain does not automatically move financial records. Close older app tabs and apply the update prompt before editing schema-v9 data.

V9 backups include entries, named percentage/fixed-amount allocation plans, transfers, opening funds, expected income, wishlist, investments, investment events, recurring schedules, optional remaining balances and monthly payment links. V1–v8 backups migrate without inventing records or remaining balances. A replacement restores exactly the fields the older version supports and clears newer collections; export current data first. Merges keep current matching IDs and apply newly merged tracked payments once; incompatible balance tracking, conflicting plan revisions, duplicate monthly payments or inconsistent cash links reject the complete import.

## Caching and security settings

- Hashed bundles under `/assets/` and the hashed Workbox helper are immutable for one year.
- HTML, manifest and icons revalidate; `sw.js` uses `no-store` and allows root scope. New code is offered through the app’s update prompt. Finish entries before applying it.
- All chart bundles are precached, including those not opened yet. The initial install must finish online before offline use.
- The content security policy permits same-origin scripts/workers, local fonts and inline styles needed by Svelte/ECharts. It blocks external scripts, remote API connections, framing, plugins and external form submission. Vercel preview-toolbar/analytics injection is intentionally not allowlisted; those services are not required by this app.
- No financial records are uploaded by the app. JSON exports contain your data; store backups securely outside browser storage.

## Dependencies and updates

Package declarations use `latest` rather than exact versions. Two compatibility ranges remain: `echarts: "6.1.x"` as requested, and `typescript: "^6"` for Svelte’s tooling API. The compiler itself is latest TypeScript 7 through `@typescript/native: "npm:typescript@latest"` and both checks explicitly use it. Bun is rolling `1.x` on Vercel and latest in CI.

The committed lockfile records the tested resolution. `--frozen-lockfile` deploys that resolution rather than introducing untested upgrades during a release. To refresh packages:

```sh
bun update
bun audit
bun run release
```

Commit the updated lockfile after checks. Avoid `bun update --latest`: it overrides the TypeScript-6/ECharts-6.1 compatibility ranges. All main package resolutions were checked against registry latest on 2026-11-17; the main versions already matched latest. The latest `glob` override fixes [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and its updated minimatch dependency fixes [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) in Workbox’s build dependency graph. The generated PWA and cache asset check pass with that override. Remove the override when upstream Workbox moves to a patched compatible range.

## Release acceptance and current limits

Previous v7 results on 2026-11-17: 79 tests / 2,320 assertions passed; Svelte/TypeScript checks and production artifact verification passed. For v8 and v9, tests were not run at the user's request. The v9 production build and Svelte/TypeScript checks passed, with 17 resources (~793 KiB) precached. The earlier dependency audit and frozen install were not rerun.

No Vercel deployment was created in this task. GitHub CI was written but has not run on a hosted Linux runner. Browser approval was granted for the current checks: allocation/income/monthly-payment workflows and mobile widths were exercised, and the production preview reloaded and persisted a schedule under offline emulation. Chart controls, actual deployed headers/CSP, physical installation and airplane-mode launch remain unverified. They are tracked in `TASKS_HUMAN.md`.

After deploying, verify the investment examples (20→0 = -20/-100%; 20 plus 20 extra loss = -40/-200%; 20→20 = break-even; 20→40 = +20/+100%), backup restoration, two-tab edits, mobile controls, offline navigation/charts, and update prompts on the final HTTPS origin. The human checklist contains those acceptance tasks.
