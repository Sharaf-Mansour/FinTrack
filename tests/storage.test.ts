import 'fake-indexeddb/auto';
import { expect, test } from 'bun:test';
import { addPlan, defaultShares, emptyLedger, type Entry, type Ledger } from '../src/lib/finance';
import { loadLedger, saveLedger, updateLedger } from '../src/lib/storage';
import { recordInvestmentEvent } from '../src/lib/investments';

test('IndexedDB persists complete ledgers, rejects bad imports without data loss, and supports replacement', async () => {
  expect(await loadLedger()).toEqual(emptyLedger());
  const ledger: Ledger = { ...emptyLedger(), entries: [{ id: 'persisted-1', kind: 'income', amountMinor: 100_000, note: 'Salary', category: 'Income', occurredAt: '2026-11-01T08:00:00.000Z', createdAt: '2026-11-01T08:30:00.000Z', updatedAt: '2026-11-01T08:30:00.000Z' }] };
  await saveLedger(ledger);
  expect(await loadLedger()).toEqual(ledger);
  // Mutating the caller’s object cannot mutate an already committed record.
  ledger.entries[0].note = 'Unsaved change';
  expect((await loadLedger()).entries[0].note).toBe('Salary');
  await expect(saveLedger({ ...ledger, entries: [{ ...ledger.entries[0], amountMinor: -100 }] })).rejects.toThrow();
  expect((await loadLedger()).entries[0].amountMinor).toBe(100_000);
  expect((await loadLedger()).entries[0].note).toBe('Salary');
  await saveLedger(emptyLedger());
  expect(await loadLedger()).toEqual(emptyLedger());
});

test('atomic concurrent mutations retain every write and reject invalid changes without data loss', async () => {
  await saveLedger(emptyLedger());
  const at = '2026-11-01T08:00:00.000Z';
  await Promise.all(Array.from({ length: 20 }, (_, i) => updateLedger(current => ({ ...current, entries: [...current.entries, { id: `concurrent-${i}`, kind: 'expense', amountMinor: 100, note: 'Concurrent expense', category: 'Other', occurredAt: at, createdAt: at, updatedAt: at }] }))));
  expect((await loadLedger()).entries).toHaveLength(20);
  await expect(updateLedger(current => ({ ...current, entries: [...current.entries, { ...current.entries[0], amountMinor: -1 }] }))).rejects.toThrow();
  expect((await loadLedger()).entries).toHaveLength(20);
  await saveLedger(emptyLedger());
});

test('reads legacy IndexedDB data without destructive writes and commits the current ledger schema', async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('fintrack', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const legacy: { schemaVersion: 1; currency: 'EGP'; entries: Entry[] } = { schemaVersion: 1, currency: 'EGP', entries: [{ id: 'legacy-record', kind: 'expense', amountMinor: 2050, note: 'Legacy lunch', category: 'Food', occurredAt: '2026-11-01T08:00:00.000Z', createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z' }] };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('ledger', 'readwrite');
    tx.objectStore('ledger').put(legacy, 'current');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  const readRaw = () => new Promise<{ schemaVersion: number }>((resolve, reject) => {
    const req = db.transaction('ledger').objectStore('ledger').get('current');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  const migrated = await loadLedger();
  expect(migrated.schemaVersion).toBe(4);
  expect(migrated.entries).toEqual(legacy.entries);
  expect((await readRaw()).schemaVersion).toBe(1);
  const at = '2026-11-01T08:00:00.000Z';
  const next = addPlan({ ...migrated,
    transfers: [{ id: 'persisted-transfer', from: 'wallet', to: 'savings', amountMinor: 15000, note: 'Save', occurredAt: at, createdAt: at, updatedAt: at }],
    openings: [{ id: 'persisted-opening', account: 'wallet', amountMinor: 100000, occurredAt: at, createdAt: at, updatedAt: at }]
  }, '2026-11', defaultShares);
  await saveLedger(next);
  expect(await loadLedger()).toEqual(next);
  expect((await readRaw()).schemaVersion).toBe(4);
  await expect(saveLedger({ ...next, transfers: [{ ...next.transfers[0], to: 'wallet' }] })).rejects.toThrow();
  expect(await loadLedger()).toEqual(next);
  await saveLedger(emptyLedger()); db.close();
});

test('persists v3 planning records and preserves them after an invalid write', async () => {
  const at = '2026-11-01T08:00:00.000Z';
  const ledger: Ledger = { ...emptyLedger(), expectedIncomes: [{ id: 'expected-persist', month: '2026-12', amountMinor: 100000, note: 'Expected salary', createdAt: at, updatedAt: at }], wishlist: [{ id: 'goal-persist', name: 'GPU', priceMinor: 30000, priority: 1, targetMonth: '2027-03', createdAt: at, updatedAt: at }] };
  await saveLedger(ledger);
  expect(await loadLedger()).toEqual(ledger);
  await expect(saveLedger({ ...ledger, expectedIncomes: [...ledger.expectedIncomes, { ...ledger.expectedIncomes[0], id: 'different-id' }] })).rejects.toThrow();
  expect(await loadLedger()).toEqual(ledger);
  await saveLedger(emptyLedger());
});

test('persists v4 investment/cash relationships atomically and rejects dangling links', async () => {
  const at = '2026-11-01T08:00:00.000Z';
  const ledger = recordInvestmentEvent({ ...emptyLedger(), investments: [{ id: 'software', name: 'Software', label: 'Software', note: '', status: 'open', createdAt: at, updatedAt: at }] }, { investmentId: 'software', kind: 'cost', amountMinor: 2000, note: 'License cost', localTime: '2026-11-01T10:00' });
  await saveLedger(ledger);
  expect(await loadLedger()).toEqual(ledger);
  await expect(updateLedger(current => ({ ...current, entries: [] }))).rejects.toThrow('cash link');
  expect(await loadLedger()).toEqual(ledger);
  await saveLedger(emptyLedger());
});
