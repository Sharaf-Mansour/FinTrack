import { describe, expect, test } from 'bun:test';
import { accountBalances, addAllocationPlan, addPlan, defaultShares, emptyLedger, mergeLedgers, parseNonNegativeAmount, validateLedger, type Entry, type ExpectedIncome, type Ledger, type Wish } from '../src/lib/finance';
import { forecastSavings, monthEnd, monthlyTrends, orderedWishlist, recentAssumptions, shiftMonth, spendingDetails } from '../src/lib/insights';

const time = (month: string, day = 1) => { const [year, m] = month.split('-').map(Number); return new Date(year, m - 1, day, 12).toISOString(); };
const now = new Date(2026, 10, 15, 12);
const stamp = time('2026-11');
const entry = (id: string, month: string, amountMinor: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: 'income', amountMinor, note: id, category: 'Income', occurredAt: time(month), createdAt: stamp, updatedAt: stamp, ...extra });
const expected = (month: string, amountMinor: number, id = `expected-${month}`): ExpectedIncome => ({ id, month, amountMinor, note: 'Expected salary', createdAt: stamp, updatedAt: stamp });
const wish = (id = 'gpu', priceMinor = 15000, priority = 1, extra: Partial<Wish> = {}): Wish => ({ id, name: id, priceMinor, priority, createdAt: stamp, updatedAt: stamp, ...extra });
const savings = (amountMinor: number): Ledger => ({ ...emptyLedger(), openings: [{ id: 'starting-savings', account: 'savings', amountMinor, occurredAt: stamp, createdAt: stamp, updatedAt: stamp }] });
const run = (ledger: Ledger, extra: Partial<Parameters<typeof forecastSavings>[2]> = {}) => forecastSavings(ledger, now, { horizonMonths: 12, monthlyExpensesMinor: 0, ...extra });

describe('v3 records and migrations', () => {
  test('v2 upgrades without changing existing records or inventing forecasts', () => {
    const { expectedIncomes, wishlist, ...v2 } = { ...savings(5000), entries: [entry('legacy', '2026-10', 10000)] };
    const migrated = validateLedger({ ...v2, schemaVersion: 2 });
    expect(migrated).toEqual({ ...v2, schemaVersion: 9, expectedIncomes: [], wishlist: [] });
  });
  test('expected income and wishlist roundtrip with no effect on real balances', () => {
    const ledger = { ...savings(10000), expectedIncomes: [expected('2026-12', 500000)], wishlist: [wish('GPU', 60000, 1, { targetMonth: '2027-02' })] };
    expect(validateLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    expect(accountBalances(ledger)).toEqual(accountBalances(savings(10000)));
  });
  test('zero expected income is explicit; bad amounts/months/priorities and duplicate IDs are rejected', () => {
    expect(parseNonNegativeAmount('0.00')).toBe(0);
    expect(validateLedger({ ...emptyLedger(), expectedIncomes: [expected('2026-12', 0)] }).expectedIncomes[0].amountMinor).toBe(0);
    for (const patch of [
      { expectedIncomes: [expected('2026-13', 100)] }, { expectedIncomes: [expected('2026-12', -1)] },
      { expectedIncomes: [expected('2026-12', 100), expected('2026-12', 200, 'second')] },
      { wishlist: [wish('a', 0)] }, { wishlist: [wish('a', 100, 0)] }, { wishlist: [wish('a', 100, 1.5)] },
      { wishlist: [wish('a', 100, 1, { targetMonth: 'bad' })] }, { wishlist: [wish('a'), wish('a')] },
      { expectedIncomes: [expected('2026-12', 100, 'same')], wishlist: [wish('same')] }, { wishlist: null }
    ]) expect(() => validateLedger({ ...emptyLedger(), ...patch })).toThrow();
  });
  test('merge preserves current expected months and wishlist IDs and is idempotent', () => {
    const current = { ...emptyLedger(), expectedIncomes: [expected('2026-12', 100)], wishlist: [wish('GPU', 200)] };
    const backup = { ...emptyLedger(), expectedIncomes: [expected('2026-12', 900, 'other-id'), expected('2027-01', 800)], wishlist: [wish('GPU', 900), wish('Trip', 1000, 2)] };
    const merged = mergeLedgers(current, backup);
    expect(merged.expectedIncomes.map(e => e.amountMinor)).toEqual([100, 800]);
    expect(merged.wishlist.map(w => w.priceMinor)).toEqual([200, 1000]);
    expect(mergeLedgers(merged, backup)).toEqual(merged);
  });
  test('current expected-income ID wins when a backup has moved it to another month', () => {
    const current = { ...emptyLedger(), expectedIncomes: [expected('2026-12', 100, 'same')] };
    const backup = { ...emptyLedger(), expectedIncomes: [expected('2027-01', 999, 'same')] };
    expect(mergeLedgers(current, backup).expectedIncomes).toEqual(current.expectedIncomes);
  });
});

describe('local trend aggregation', () => {
  test('daily/category totals reconcile, including custom categories and spending timestamps', () => {
    const ledger = { ...emptyLedger(), entries: [entry('lunch', '2026-11', 2000, { kind: 'expense', category: 'Food', occurredAt: time('2026-11', 2) }), entry('train', '2026-11', 500, { kind: 'expense', category: 'Transport', occurredAt: time('2026-11', 2) }), entry('software', '2026-11', 3000, { kind: 'expense', category: 'My custom category' }), entry('other-month', '2026-10', 999, { kind: 'expense' }), entry('salary', '2026-11', 10000)] };
    const details = spendingDetails(ledger, '2026-11');
    expect(details.daily).toHaveLength(30);
    expect(details.daily.reduce((s, d) => s + d.amountMinor, 0)).toBe(5500);
    expect(details.categories.reduce((s, c) => s + c.amountMinor, 0)).toBe(5500);
    expect(details.daily[1]).toEqual({ day: '2026-11-02', amountMinor: 2500, count: 2 });
    expect(details.categories[0].category).toBe('My custom category');
    expect(spendingDetails(emptyLedger(), '2028-02').daily).toHaveLength(29);
  });
  test('actual income replaces expected income in trends; missing stays missing', () => {
    const ledger = { ...emptyLedger(), entries: [entry('salary1', '2026-11', 10000), entry('salary2', '2026-11', 5000)], expectedIncomes: [expected('2026-11', 90000), expected('2026-12', 70000)] };
    const rows = monthlyTrends(ledger, '2026-12', 3);
    expect(rows[0].hasIncome).toBe(false); expect(rows[0].expectedIncome).toBeNull();
    expect(rows[1].income).toBe(15000); expect(rows[1].expectedIncome).toBeNull();
    expect(rows[2].hasIncome).toBe(false); expect(rows[2].expectedIncome).toBe(70000);
  });
  test('month-end balances carry over, include transfers and respect calendar boundaries', () => {
    const ledger = { ...savings(1000), transfers: [{ id: 'transfer', from: 'savings' as const, to: 'investment' as const, amountMinor: 400, note: 'Invest', occurredAt: time('2026-12'), createdAt: stamp, updatedAt: stamp }] };
    const rows = monthlyTrends(ledger, '2027-01', 3);
    expect(rows.map(r => [r.savings, r.investment])).toEqual([[1000, 0], [600, 400], [600, 400]]);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(new Date(monthEnd('2028-02')).getDate()).toBe(29);
    expect(monthlyTrends(emptyLedger(), '1900-01', 24)).toHaveLength(1);
  });
});

describe('savings-only forecast', () => {
  test('uses the same custom allocation rounding as the monthly plan', () => {
    const ledger = addAllocationPlan({ ...emptyLedger(), expectedIncomes: [expected('2026-11', 1)] }, '2026-11', [
      { id: 'bills', name: 'Bills', share: 5000 },
      { id: 'savings', name: 'Savings', share: 5000 }
    ]);
    expect(run(ledger).points[0].projectedContributionMinor).toBe(0);
  });
  test('actual income replaces expected for a month, never adding both', () => {
    const ledger = { ...emptyLedger(), entries: [entry('actual', '2026-11', 100000)], expectedIncomes: [expected('2026-11', 999000)] };
    const result = run(ledger);
    expect(result.points[0].incomeMinor).toBe(100000);
    expect(result.points[0].source).toBe('actual');
    expect(result.points[0].projectedContributionMinor).toBe(15000);
  });
  test('income precedence is actual, expected, explicit scenario, recent history, unknown', () => {
    const ledger = { ...emptyLedger(), entries: [entry('old', '2026-10', 200000), entry('current', '2026-11', 100000)], expectedIncomes: [expected('2026-12', 300000)] };
    const result = run(ledger, { fallbackIncomeMinor: 400000 });
    expect(result.points.slice(0, 3).map(p => [p.source, p.incomeMinor])).toEqual([['actual', 100000], ['expected', 300000], ['scenario', 400000]]);
    expect(run(ledger).points[2].source).toBe('history');
    expect(run(emptyLedger()).points[0].source).toBe('unknown');
  });
  test('history averages observed completed months only and excludes the current month', () => {
    const ledger = { ...emptyLedger(), entries: [entry('aug', '2026-08', 10000), entry('oct', '2026-10', 20000), entry('current', '2026-11', 999999), entry('spent', '2026-10', 4000, { kind: 'expense' }), entry('outside', '2026-07', 90000)] };
    expect(recentAssumptions(ledger, now)).toEqual({ incomeMinor: 15000, expensesMinor: 2000, incomeMonths: 2, expenseMonths: 2 });
  });
  test('wallet and investment balances cannot make a goal affordable', () => {
    const ledger = { ...emptyLedger(), openings: [{ id: 'wallet', account: 'wallet' as const, amountMinor: 1000000, occurredAt: stamp, createdAt: stamp, updatedAt: stamp }, { id: 'invest', account: 'investment' as const, amountMinor: 1000000, occurredAt: stamp, createdAt: stamp, updatedAt: stamp }], wishlist: [wish()] };
    expect(run(ledger).startingSavingsMinor).toBe(0);
    expect(run(ledger).goals[0].status).toBe('insufficient');
  });
  test('priority reserves cumulative goal prices and supports immediately affordable goals', () => {
    const ledger = { ...savings(20000), wishlist: [wish('second', 15000, 2), wish('first', 15000, 1)] };
    const result = run(ledger, { fallbackIncomeMinor: 100000 });
    expect(result.goals.map(g => g.wish.id)).toEqual(['first', 'second']);
    expect(result.goals[0].status).toBe('now');
    expect(result.goals[1].availableNowMinor).toBe(5000);
    expect(result.goals[1].reservedBeforeMinor).toBe(15000);
    expect(result.goals[1].estimatedMonth).toBe('2026-11');
  });
  test('recorded current savings inflows are not projected a second time', () => {
    const ledger = { ...emptyLedger(), entries: [entry('salary', '2026-11', 100000)], transfers: [{ id: 'saved', from: 'wallet' as const, to: 'savings' as const, amountMinor: 5000, note: 'Saved already', occurredAt: stamp, createdAt: stamp, updatedAt: stamp }] };
    const result = run(ledger);
    expect(result.startingSavingsMinor).toBe(5000);
    expect(result.points[0].projectedContributionMinor).toBe(10000);
    expect(result.points[0].savingsMinor).toBe(15000);
  });
  test('known future savings inflows/outflows are applied once; forecasts do not mutate ledgers', () => {
    const ledger: Ledger = { ...savings(10000), entries: [entry('salary', '2026-12', 100000)], transfers: [{ id: 'future-saved', from: 'wallet', to: 'savings', amountMinor: 15000, note: 'Scheduled', occurredAt: time('2026-12'), createdAt: stamp, updatedAt: stamp }, { id: 'future-withdrawal', from: 'savings', to: 'wallet', amountMinor: 2000, note: 'Withdraw', occurredAt: time('2026-12', 2), createdAt: stamp, updatedAt: stamp }] };
    const snapshot = JSON.stringify(ledger);
    const result = run(ledger, { fallbackIncomeMinor: 0 });
    expect(result.startingSavingsMinor).toBe(10000);
    expect(result.points[1].knownNetMinor).toBe(13000);
    expect(result.points[1].projectedContributionMinor).toBe(0);
    expect(result.points[1].savingsMinor).toBe(23000);
    expect(JSON.stringify(ledger)).toBe(snapshot);
  });
  test('expected zero and negative saving capacity produce no invented savings', () => {
    const ledger = { ...savings(100), expectedIncomes: [expected('2026-11', 0)], wishlist: [wish()] };
    const result = run(ledger, { fallbackIncomeMinor: 0, monthlyExpensesMinor: 10000 });
    expect(result.points.every(p => p.projectedContributionMinor === 0)).toBe(true);
    expect(result.goals[0].status).toBe('beyond');
    expect(result.points[0].shortfall).toBe(true);
  });
  test('explicit zero-savings plans stop new projected contributions', () => {
    const ledger = addPlan({ ...emptyLedger(), expectedIncomes: [expected('2026-11', 100000)], wishlist: [wish()] }, '2026-11', { ...defaultShares, savings: 0 });
    const result = run(ledger, { fallbackIncomeMinor: 100000 });
    expect(result.points.every(p => p.projectedContributionMinor === 0)).toBe(true);
    expect(result.goals[0].estimatedMonth).toBeNull();
  });
  test('unknown months make subsequent estimates conditional; dates are not promises', () => {
    const ledger = { ...emptyLedger(), expectedIncomes: [expected('2026-12', 100000)], wishlist: [wish('GPU', 15000, 1, { targetMonth: '2026-11' })] };
    const result = run(ledger);
    expect(result.goals[0].status).toBe('conditional');
    expect(result.goals[0].estimatedMonth).toBe('2026-12');
    expect(result.goals[0].targetMet).toBe(false);
  });
  test('expense and investment needs constrain savings targets and future plans take effect', () => {
    const ledger = addPlan(emptyLedger(), '2026-12', { life: 5000, fun: 0, savings: 5000, investment: 0 });
    const result = run(ledger, { fallbackIncomeMinor: 100000, monthlyExpensesMinor: 80000 });
    expect(result.points[0].projectedContributionMinor).toBe(5000);
    expect(result.points[1].projectedContributionMinor).toBe(20000);
  });
  test('priority tie order is stable and invalid scenarios are rejected', () => {
    expect(orderedWishlist([wish('b'), wish('a')]).map(w => w.id)).toEqual(['a', 'b']);
    expect(() => run(emptyLedger(), { horizonMonths: 0 })).toThrow();
    expect(() => run(emptyLedger(), { fallbackIncomeMinor: -1 })).toThrow();
    expect(() => run(emptyLedger(), { monthlyExpensesMinor: 1.5 })).toThrow();
  });
  test('missing data or a target outside the forecast window does not claim a missed deadline', () => {
    expect(run({ ...emptyLedger(), wishlist: [wish('goal', 100, 1, { targetMonth: '2027-01' })] }).goals[0].targetMet).toBeNull();
    expect(run({ ...emptyLedger(), wishlist: [wish('goal', 100, 1, { targetMonth: '2030-01' })] }, { fallbackIncomeMinor: 0 }).goals[0].targetMet).toBeNull();
  });
});
