import { describe, expect, test } from 'bun:test';
import { emptyLedger, localDateTime, mergeLedgers, monthKey, parseAmount, totals, validateLedger, type Entry } from '../src/lib/finance';

const entry = (overrides: Partial<Entry> = {}): Entry => ({ id: 'entry-1', kind: 'expense', amountMinor: 2050, note: 'Lunch', category: 'Food & drinks', occurredAt: '2026-11-17T11:30:00.000Z', createdAt: '2026-11-17T12:00:00.000Z', updatedAt: '2026-11-17T12:00:00.000Z', ...overrides });
describe('money', () => {
  test('converts decimal EGP to integer piastres without float drift', () => {
    expect(parseAmount('0.29')).toBe(29); expect(parseAmount('20.5')).toBe(2050); expect(parseAmount(' 100 ')).toBe(10000);
  });
  test('rejects zero, negative, extra precision, exponent notation and non-money', () => {
    for (const value of ['0', '-20', '1.001', '1e3', 'abc', '', 'Infinity', '10000000000']) expect(() => parseAmount(value)).toThrow();
  });
  test('calculates overspending and multiple income entries accurately', () => {
    expect(totals([entry({ kind: 'income', amountMinor: 10000 }), entry({ id: '2', kind: 'income', amountMinor: 5000 }), entry({ id: '3', amountMinor: 18000 })])).toEqual({ income: 15000, expenses: 18000, balance: -3000 });
    expect(totals([])).toEqual({ income: 0, expenses: 0, balance: 0 });
  });
});
describe('portable JSON backups', () => {
  test('merge adds new identities, preserves current conflicts and is idempotent', () => {
    const current = { ...emptyLedger(), entries: [entry()] };
    const backup = { ...emptyLedger(), entries: [entry({ note: 'Old value' }), entry({ id: 'entry-2', note: 'New entry' })] };
    const merged = mergeLedgers(current, backup);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[0].note).toBe('Lunch');
    expect(mergeLedgers(merged, backup)).toEqual(merged);
  });
  test('round trips records including creation and spending times', () => {
    const data = { ...emptyLedger(), entries: [entry()] };
    expect(validateLedger(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
  test('accepts empty backup and removes untrusted extra fields', () => {
    expect(validateLedger({ ...emptyLedger(), extra: 'ignore' })).toEqual(emptyLedger());
  });
  test('rejects malformed files, incompatible schemas, and duplicate identities', () => {
    for (const raw of [null, [], {}, { ...emptyLedger(), schemaVersion: 10 }, { ...emptyLedger(), currency: 'USD' }, { ...emptyLedger(), entries: [entry(), entry()] }]) expect(() => validateLedger(raw)).toThrow();
  });
  test('rejects invalid dates, amounts, kinds, and unbounded notes', () => {
    for (const bad of [{ amountMinor: 0 }, { amountMinor: 1.5 }, { amountMinor: -20 }, { occurredAt: 'not a date' }, { occurredAt: '2026-02-30T10:00:00.000Z' }, { createdAt: 'today' }, { note: ' ' }, { note: 'a'.repeat(301) }, { category: '' }, { kind: 'transfer' }]) expect(() => validateLedger({ ...emptyLedger(), entries: [entry(bad as Partial<Entry>)] })).toThrow();
  });
});
describe('local spending dates', () => {
  test('uses device-local month and preserves editable local time', () => {
    const date = new Date(2026, 10, 1, 0, 15);
    expect(monthKey(date.toISOString())).toBe('2026-11');
    expect(localDateTime(date)).toBe('2026-11-01T00:15');
  });
});
