import { describe, expect, test } from 'bun:test';
import {
  accountBalances, addAllocationPlan, addPlan, allocateIncome, allocationsForMonth, budgetForMonth, bucketLabelForMonth, defaultShares, emptyLedger,
  localDateTime, mergeLedgers, occurrenceTime, parsePercent, planForMonth, spendingBucketsForMonth, totals, validateLedger,
  type Entry, type Ledger, type OpeningBalance, type Transfer
} from '../src/lib/finance';

const at = '2026-11-10T10:00:00.000Z';
const stamps = { occurredAt: at, createdAt: at, updatedAt: at };
const income = (id = 'income', amountMinor = 100_000): Entry => ({ ...stamps, id, kind: 'income', note: 'Salary', category: 'Income', amountMinor, account: 'wallet' });
const transfer = (extra: Partial<Transfer> = {}): Transfer => ({ ...stamps, id: 'transfer', from: 'wallet', to: 'savings', note: 'Savings deposit', amountMinor: 15000, ...extra });
const opening = (extra: Partial<OpeningBalance> = {}): OpeningBalance => ({ ...stamps, id: 'opening', account: 'savings', amountMinor: 20000, ...extra });

describe('schema migration and portable backups', () => {
  test('classifying an existing record preserves its exact occurrence timestamp', () => {
    const original = '2026-11-10T10:00:42.987Z';
    expect(occurrenceTime(localDateTime(new Date(original)), original)).toBe(original);
    const changed = new Date(2026, 10, 11, 13, 20);
    expect(occurrenceTime(localDateTime(changed), original)).toBe(changed.toISOString());
  });
  test('migrates v1 without inventing classifications, funds or changing identities/timestamps', () => {
    const oldEntry = income(); delete oldEntry.account;
    const migrated = validateLedger({ schemaVersion: 1, currency: 'EGP', entries: [oldEntry] });
    expect(migrated).toEqual({ ...emptyLedger(), entries: [oldEntry] });
    expect(migrated.entries[0].bucket).toBeUndefined();
    expect(accountBalances(migrated)).toEqual({ wallet: 100000, savings: 0, investment: 0 });
  });
  test('roundtrips v2 plans, direct spending account/bucket, transfers and opening balances', () => {
    const ledger = addPlan({ ...emptyLedger(), entries: [income(), { ...income('expense', 100), kind: 'expense', bucket: 'fun', account: 'savings' }], transfers: [transfer()], openings: [opening()] }, '2026-11', defaultShares);
    expect(validateLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
  });
  test('rejects malformed account records before accepting a backup', () => {
    for (const patch of [
      { transfers: [transfer({ to: 'wallet' })] }, { transfers: [transfer({ amountMinor: -100 })] },
      { transfers: [transfer({ from: 'unknown' as 'wallet' })] }, { transfers: [transfer({ occurredAt: 'invalid' })] },
      { openings: [opening(), opening({ id: 'different' })] }, { openings: [opening({ amountMinor: -1 })] },
      { entries: [{ ...income(), account: 'invalid' }] }, { entries: [{ ...income(), bucket: 'fun' }] },
      { plans: [{ id: 'bad', effectiveMonth: '2026-13', revision: 1, shares: defaultShares, createdAt: at }] },
      { transfers: [transfer({ id: 'income' })], entries: [income()] }, { plans: null }
    ]) expect(() => validateLedger({ ...emptyLedger(), ...patch })).toThrow();
  });
  test('merge is idempotent across all v2 collections, preserving current opening accounts', () => {
    const current = { ...emptyLedger(), entries: [income()], openings: [opening()] };
    const backup = addPlan({ ...emptyLedger(), transfers: [transfer()], openings: [opening({ id: 'other-opening', amountMinor: 999 })] }, '2026-12', defaultShares);
    const merged = mergeLedgers(current, backup);
    expect(merged.openings).toEqual(current.openings);
    expect(merged.transfers).toHaveLength(1); expect(merged.plans).toHaveLength(1);
    expect(mergeLedgers(merged, backup)).toEqual(merged);
  });
  test('conflicting same-month plan revisions reject the merge instead of changing plans silently', () => {
    const a = addPlan(emptyLedger(), '2026-11', defaultShares);
    const b = addPlan(emptyLedger(), '2026-11', { ...defaultShares, life: 5000 });
    expect(() => mergeLedgers(a, b)).toThrow('Conflicting plan revisions');
    expect(a.plans[0].shares).toEqual(defaultShares);
  });
});

describe('versioned allocation plans', () => {
  test('custom allocations reconcile, retain history, and survive backup roundtrips', () => {
    const original = allocationsForMonth(emptyLedger(), '2026-11');
    const december = addAllocationPlan({ ...emptyLedger(), entries: [income()] }, '2026-12', [...original, { id: 'rent', name: 'Rent', share: 1000 }]);
    const revised = addAllocationPlan(december, '2027-01', december.plans[0].allocations.filter(allocation => allocation.id !== 'rent').map(allocation => allocation.id === 'life' ? { ...allocation, name: 'Essentials' } : allocation));
    const expense = { ...income('rent-expense', 3000), kind: 'expense' as const, bucket: 'rent', occurredAt: '2027-01-10T10:00:00.000Z' };
    const ledger = validateLedger({ ...revised, entries: [...revised.entries, expense] });
    expect(allocationsForMonth(ledger, '2026-12').some(allocation => allocation.id === 'rent')).toBe(true);
    expect(spendingBucketsForMonth(ledger, '2027-01').some(allocation => allocation.id === 'rent')).toBe(false);
    expect(bucketLabelForMonth(ledger, 'rent', '2027-01')).toBe('Rent');
    expect(bucketLabelForMonth(ledger, 'life', '2027-01')).toBe('Essentials');
    expect(budgetForMonth(ledger, '2027-01').spent.rent).toBe(3000);
    expect(validateLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    const targets = budgetForMonth({ ...ledger, entries: [{ ...income(), occurredAt: '2026-12-10T10:00:00.000Z' }] }, '2026-12').targets;
    expect(targets.rent).toBe(10000);
    expect(Object.values(targets).reduce((sum, value) => sum + value, 0)).toBe(100000);
  });
  test('rejects invalid custom allocations and unknown spending buckets', () => {
    const defaults = allocationsForMonth(emptyLedger(), '2026-11');
    for (const extra of [{ id: 'rent', name: 'Rent', share: 1001 }, { id: 'life', name: 'Different', share: 0 }, { id: 'rent', name: 'Fun', share: 0 }, { id: 'constructor', name: 'Unsafe', share: 0 }]) {
      expect(() => addAllocationPlan(emptyLedger(), '2026-11', [...defaults, extra])).toThrow();
    }
    expect(() => validateLedger({ ...emptyLedger(), entries: [{ ...income(), kind: 'expense', bucket: 'missing' }] })).toThrow('unknown allocation');
  });
  test('defaults preserve the unallocated 10% and multiple incomes reconcile', () => {
    const b = budgetForMonth({ ...emptyLedger(), entries: [income('a', 10000), income('b', 20000)] }, '2026-11');
    expect(b.targets).toEqual({ life: 16500, fun: 1500, savings: 4500, investment: 4500, unallocated: 3000 });
    expect(Object.values(b.targets).reduce((a, v) => a + v, 0)).toBe(30000);
  });
  test('largest remainder allocation never loses or fabricates piastres', () => {
    for (let amount = 0; amount < 1000; amount++) {
      const result = allocateIncome(amount, { life: 3333, fun: 3333, savings: 3333, investment: 0 });
      expect(Object.values(result).reduce((a, v) => a + v, 0)).toBe(amount);
      expect(Object.values(result).every(Number.isInteger)).toBe(true);
    }
    expect(allocateIncome(1, defaultShares)).toEqual({ life: 1, fun: 0, savings: 0, investment: 0, unallocated: 0 });
    expect(Object.values(allocateIncome(Number.MAX_SAFE_INTEGER, defaultShares)).reduce((a, v) => a + v, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
  test('future plans preserve previous months; explicit revisions retain earlier versions', () => {
    const first = addPlan(emptyLedger(), '2026-12', { life: 5000, fun: 1000, savings: 2000, investment: 2000 });
    const revised = addPlan(first, '2026-12', { life: 4000, fun: 1000, savings: 3000, investment: 1000 });
    expect(planForMonth(revised, '2026-11')).toEqual(defaultShares);
    expect(planForMonth(revised, '2026-12').life).toBe(4000);
    expect(planForMonth(revised, '2027-01').savings).toBe(3000);
    expect(revised.plans.map(p => p.revision)).toEqual([1, 2]);
    expect(first.plans[0].shares.life).toBe(5000);
  });
  test('validates shares, percentages and effective months', () => {
    expect(parsePercent('15.25')).toBe(1525); expect(parsePercent('0')).toBe(0);
    for (const value of ['-1', '100.01', '1.001', 'NaN', '1e2', '']) expect(() => parsePercent(value)).toThrow();
    for (const shares of [{ ...defaultShares, life: 9000 }, { ...defaultShares, life: -1 }, { ...defaultShares, fun: 1.5 }]) expect(() => allocateIncome(100, shares)).toThrow();
    expect(() => addPlan(emptyLedger(), '2026-13', defaultShares)).toThrow();
  });
});

describe('account reconciliation and budget versus actual', () => {
  test('transfers move money between accounts without changing income, spending or total funds', () => {
    const base: Ledger = { ...emptyLedger(), entries: [income()], openings: [opening()] };
    const moved = { ...base, transfers: [transfer(), transfer({ id: 'to-investment', from: 'savings', to: 'investment', amountMinor: 5000 })] };
    expect(accountBalances(moved)).toEqual({ wallet: 85000, savings: 30000, investment: 5000 });
    expect(Object.values(accountBalances(moved)).reduce((a, v) => a + v, 0)).toBe(120000);
    expect(totals(moved.entries)).toEqual(totals(base.entries));
    expect(budgetForMonth(moved, '2026-11').netAdded).toEqual({ savings: 10000, investment: 5000 });
    expect(accountBalances({ ...moved, transfers: [] })).toEqual(accountBalances(base));
  });
  test('balances carry forward, respect dates, and reflect direct expenses and withdrawals', () => {
    const ledger: Ledger = { ...emptyLedger(), entries: [income(), { ...income('fun', 2000), kind: 'expense', account: 'savings', bucket: 'fun' }], transfers: [transfer(), transfer({ id: 'withdrawal', from: 'savings', to: 'wallet', amountMinor: 3000 })], openings: [opening()] };
    expect(accountBalances(ledger, '2026-11-01T00:00:00.000Z')).toEqual({ wallet: 0, savings: 0, investment: 0 });
    expect(accountBalances(ledger)).toEqual({ wallet: 88000, savings: 30000, investment: 0 });
    expect(accountBalances(ledger, '2026-12-31T23:59:59.999Z')).toEqual(accountBalances(ledger));
    expect(budgetForMonth(ledger, '2026-11').netAdded.savings).toBe(10000);
    expect(budgetForMonth(ledger, '2026-12').targets.life).toBe(0);
    expect(budgetForMonth(ledger, '2026-12').spent.fun).toBe(0);
  });
  test('unclassified historical spending is visible and never inferred from category', () => {
    const ledger = { ...emptyLedger(), entries: [income(), { ...income('old', 500), kind: 'expense' as const, category: 'Fun' }, { ...income('new', 6000), kind: 'expense' as const, bucket: 'fun' as const }] };
    const budget = budgetForMonth(ledger, '2026-11');
    expect(budget.spent).toEqual({ life: 0, fun: 6000, unallocated: 0, unclassified: 500 });
    expect(budget.spent.fun).toBeGreaterThan(budget.targets.fun);
    expect(totals(ledger.entries).expenses).toBe(6500);
  });
  test('zero opening funds and negative real balances remain valid and explicit', () => {
    const ledger = validateLedger({ ...emptyLedger(), openings: [opening({ amountMinor: 0 })], transfers: [transfer()] });
    expect(accountBalances(ledger).wallet).toBe(-15000);
    expect(accountBalances(ledger).savings).toBe(15000);
  });
});
