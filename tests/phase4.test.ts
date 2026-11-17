import { describe, expect, test } from 'bun:test';
import { accountBalances, emptyLedger, localDateTime, mergeLedgers, validateLedger, type Entry, type Investment, type Ledger } from '../src/lib/finance';
import { investmentStats, recordInvestmentEvent, removeInvestment, removeInvestmentEvent } from '../src/lib/investments';

const at = '2026-11-10T10:20:42.987Z';
const localTime = localDateTime(new Date(at));
const position: Investment = { id: 'gold', name: 'Gold', label: 'Gold', note: '', status: 'open', createdAt: at, updatedAt: at };
const base = (): Ledger => ({ ...emptyLedger(), investments: [{ ...position }] });
const add = (ledger: Ledger, kind: 'cost' | 'return' | 'fee' | 'loss', amountMinor: number) => recordInvestmentEvent(ledger, { investmentId: 'gold', kind, amountMinor, note: `${kind} event`, localTime });
const close = (ledger: Ledger): Ledger => validateLedger({ ...ledger, investments: ledger.investments.map(i => ({ ...i, status: 'closed', valuation: undefined })) });

describe('investment outcomes', () => {
  test('20 cost and nothing returned is a 20 loss / -100% ROI', () => {
    const ledger = close(add(add(base(), 'cost', 2000), 'return', 0));
    const stats = investmentStats(ledger, 'gold');
    expect(stats.realizedMinor).toBe(-2000); expect(stats.roiPercent).toBe(-100);
    expect(ledger.entries).toHaveLength(1);
  });
  test('20 cost plus 20 extra loss is -40 / -200% ROI', () => {
    const ledger = close(add(add(base(), 'cost', 2000), 'loss', 2000));
    expect(investmentStats(ledger, 'gold').realizedMinor).toBe(-4000);
    expect(investmentStats(ledger, 'gold').roiPercent).toBe(-200);
    expect(accountBalances(ledger).investment).toBe(-4000);
  });
  test('20 returned on 20 cost breaks even; 40 returned produces +20 / +100%', () => {
    const ledger = add(base(), 'cost', 2000);
    expect(investmentStats(close(add(ledger, 'return', 2000)), 'gold').roiPercent).toBe(0);
    const profit = investmentStats(close(add(ledger, 'return', 4000)), 'gold');
    expect(profit.realizedMinor).toBe(2000); expect(profit.roiPercent).toBe(100);
  });
  test('multiple costs, partial returns, fees and additional losses reconcile exactly', () => {
    let ledger = add(add(base(), 'cost', 2000), 'cost', 3000);
    ledger = add(add(add(add(ledger, 'return', 2000), 'return', 3000), 'fee', 100), 'loss', 200);
    const stats = investmentStats(close(ledger), 'gold');
    expect([stats.costMinor, stats.returnedMinor, stats.feesMinor, stats.lossesMinor, stats.realizedMinor]).toEqual([5000, 5000, 100, 200, -300]);
    expect(stats.roiPercent).toBe(-6);
    expect(accountBalances(ledger).investment).toBe(-300);
  });
  test('open positions have no realized ROI; manual valuations never create cash', () => {
    let ledger = add(add(add(base(), 'cost', 2000), 'return', 500), 'fee', 100);
    expect(investmentStats(ledger, 'gold').realizedMinor).toBeNull();
    expect(investmentStats(ledger, 'gold').estimatedMinor).toBeNull();
    const before = accountBalances(ledger);
    ledger = validateLedger({ ...ledger, investments: [{ ...position, valuation: { amountMinor: 3000, valuedAt: at } }] });
    const stats = investmentStats(ledger, 'gold');
    expect(stats.estimatedMinor).toBe(1400); expect(stats.estimatedRoiPercent).toBe(70);
    expect(stats.roiPercent).toBeNull(); expect(accountBalances(ledger)).toEqual(before);
  });
  test('cost-free closing and closed manual valuation are rejected', () => {
    expect(() => close(base())).toThrow('Record a cost');
    const ledger = add(base(), 'cost', 100);
    expect(() => validateLedger({ ...ledger, investments: [{ ...position, status: 'closed', valuation: { amountMinor: 100, valuedAt: at } }] })).toThrow();
  });
});

describe('investment cash linkage and corrections', () => {
  const cash: Entry = { id: 'existing-expense', kind: 'expense', account: 'investment', amountMinor: 2000, note: 'Gold payment already logged', category: 'Gold', occurredAt: at, createdAt: at, updatedAt: at };
  test('link existing expense without another transaction, and reject duplicate linkage', () => {
    const ledger = recordInvestmentEvent({ ...base(), entries: [cash] }, { investmentId: 'gold', kind: 'cost', amountMinor: 2000, note: 'Linked cost', localTime, existingEntryId: cash.id });
    expect(ledger.entries).toEqual([cash]); expect(ledger.investmentEvents[0].occurredAt).toBe(at);
    expect(() => recordInvestmentEvent(ledger, { investmentId: 'gold', kind: 'fee', amountMinor: 2000, note: 'Duplicate', localTime, existingEntryId: cash.id })).toThrow('cash link');
  });
  test('funding transfers never count as purchase costs or ROI contributions', () => {
    const ledger = add({ ...base(), transfers: [{ id: 'funding', from: 'wallet', to: 'investment', amountMinor: 5000, note: 'Fund account', occurredAt: at, createdAt: at, updatedAt: at }] }, 'cost', 2000);
    expect(investmentStats(ledger, 'gold').costMinor).toBe(2000);
    expect(accountBalances(ledger)).toEqual({ wallet: -5000, investment: 3000, savings: 0 });
  });
  test('editing synchronizes cash amount/date and preserves occurrence precision on metadata-only edits', () => {
    const ledger = recordInvestmentEvent({ ...base(), entries: [cash] }, { investmentId: 'gold', kind: 'cost', amountMinor: 2000, note: 'Cost', localTime, existingEntryId: cash.id });
    const edited = recordInvestmentEvent(ledger, { id: ledger.investmentEvents[0].id, investmentId: 'gold', kind: 'cost', amountMinor: 3000, note: 'Corrected amount', localTime });
    expect(edited.entries).toHaveLength(1); expect(edited.entries[0].id).toBe(cash.id);
    expect(edited.entries[0].amountMinor).toBe(3000); expect(edited.entries[0].occurredAt).toBe(at);
    expect(edited.investmentEvents[0].amountMinor).toBe(3000);
    expect(edited.investmentEvents[0].createdAt).toBe(ledger.investmentEvents[0].createdAt);
    expect(() => validateLedger({ ...edited, entries: [] })).toThrow('cash link');
    expect(() => validateLedger({ ...edited, entries: [{ ...edited.entries[0], amountMinor: 999 }] })).toThrow('cash link');
  });
  test('deletion keeps cash by default, deletes it only explicitly, and reopens if last cost is removed', () => {
    const ledger = close(add(base(), 'cost', 2000)); const eventId = ledger.investmentEvents[0].id;
    const trackingOnly = removeInvestmentEvent(ledger, eventId);
    expect(trackingOnly.entries).toHaveLength(1); expect(trackingOnly.investments[0].status).toBe('open');
    expect(removeInvestmentEvent(ledger, eventId, true).entries).toHaveLength(0);
    expect(removeInvestment(ledger, 'gold').entries).toHaveLength(1);
    expect(removeInvestment(ledger, 'gold', true).entries).toHaveLength(0);
  });
  test('invalid transaction accounts/signs and malformed amounts never validate', () => {
    for (const bad of [{ ...cash, account: 'wallet' as const }, { ...cash, kind: 'income' as const }]) {
      expect(() => recordInvestmentEvent({ ...base(), entries: [bad] }, { investmentId: 'gold', kind: 'cost', amountMinor: 2000, note: 'bad link', localTime, existingEntryId: cash.id })).toThrow();
    }
    expect(() => add(base(), 'cost', 0)).toThrow(); expect(() => add(base(), 'return', -1)).toThrow();
  });
});

describe('v4 migration and JSON backup integrity', () => {
  test('v3 migrates without investments and without touching financial or planning data', () => {
    const { investments, investmentEvents, ...legacy } = emptyLedger();
    const migrated = validateLedger({ ...legacy, schemaVersion: 3 });
    expect(migrated).toEqual(emptyLedger());
  });
  test('investment/cash links roundtrip and repeated imports are idempotent', () => {
    const ledger = close(add(add(base(), 'cost', 2000), 'return', 4000));
    expect(validateLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    const merged = mergeLedgers(emptyLedger(), ledger);
    expect(mergeLedgers(merged, ledger)).toEqual(ledger);
  });
  test('dangling/reused links and conflicting current cash entries reject imports', () => {
    const ledger = add(base(), 'cost', 2000);
    expect(() => validateLedger({ ...ledger, investments: [] })).toThrow();
    expect(() => validateLedger({ ...ledger, investmentEvents: [{ ...ledger.investmentEvents[0], investmentId: 'missing' }] })).toThrow();
    expect(() => validateLedger({ ...ledger, investmentEvents: [...ledger.investmentEvents, { ...ledger.investmentEvents[0], id: 'new-event' }] })).toThrow('cash link');
    const current = { ...emptyLedger(), entries: [{ ...ledger.entries[0], amountMinor: 999 }] };
    expect(() => mergeLedgers(current, ledger)).toThrow('cash link');
  });
});
