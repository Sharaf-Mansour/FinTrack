# FinTrack agent instructions

Read `PLAN.md`, then `TASKS_AGENT.md` before changing code. Work through one unchecked task at a time and update its status with evidence. Keep completed tasks and verification history. Put work requiring the human in `TASKS_HUMAN.md`; never mix implementation tasks into that checklist.

## Product constraints

- Current scope: Phases 1–4 and production preparation for static Vercel deployment, authorized 2026-11-17. No authentication, backend, telemetry, or remote runtime requests. Financial analytics are local only. Phase 5 remains out of scope.
- Svelte, TypeScript 7 and Tailwind with Bun for installs/scripts/tests/build. User requests current packages and no exact manifest pins: use latest selectors, retaining the TypeScript 6 tooling compatibility range and ECharts 6.1.x contract. Commit `bun.lock` for reproducible production builds; use `bun update` followed by the release checks for deliberate upgrades. Do not override the two compatibility ranges with `--latest`.
- Prefer Svelte transitions and animations; respect reduced motion.
- Charts, when introduced, must use **Apache ECharts 6.1.x**. No chart dependency is necessary in Phase 1.
- Mobile first. Browser-native PWA: manifest, standalone display, bundled assets, service worker, offline app shell. Do not add a native wrapper unless explicitly requested.
- Dark theme only. Preserve the reference-inspired near-black, warm gold, burgundy and warm-white palette and bold Arial/Helvetica-style sans-serif typography. Do not add a light mode or remote font dependency.
- IndexedDB is the source of truth. Currency in Phase 1 is EGP; store amounts in integer piastres. Never save floating-point currency values.
- Preserve stable IDs, schema version, actual occurrence timestamps, creation timestamps, and update timestamps for future migration.
- Validate JSON imports before any write. Keep import replacement explicit. Never replace data automatically on startup failure.
- No fabricated financial entries. Empty states are part of the product.

## Verification

Run `bun test` and `bun run build` after relevant changes. The build includes Svelte and TypeScript checking. Verify PWA against the production build, not the development server. Record what was actually tested; keep physical-device acceptance checks pending until a human performs them.

## Phase boundaries

Do not silently allocate the missing 10% in the budget plan. Phase 4 investment ROI is authorized. Investments must reconcile with cash entries through unique links; never count an investment-account funding transfer as a purchase. Neon and authentication remain out of scope. `PLAN.md` captures assumptions and open decisions.
