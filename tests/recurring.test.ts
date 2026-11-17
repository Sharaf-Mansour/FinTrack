import { describe, expect, test } from 'bun:test';
import { accountBalances, addPlan, budgetForMonth, defaultShares, emptyLedger, mergeLedgers, totals, validateLedger, type Entry, type RecurringExpense, type RecurringPayment } from '../src/lib/finance';
import { deleteRecurringExpense, dueDateForMonth, recordRecurringPayment, recurringForMonth, saveRecurringExpense, undoRecurringPayment } from '../src/lib/recurring';

const at = new Date(2026, 10, 10, 12).toISOString();
const schedule: RecurringExpense = { id: 'rent', name: 'Rent', amountMinor: 125000, category: 'Bills', account: 'wallet', bucket: 'life', startMonth: '2026-11', endDate: '2027-12-31', dueDay: 15, createdAt: at, updatedAt: at };
const expense: Entry = { id: 'rent-entry', kind: 'expense', amountMinor: 125000, note: 'Rent', category: 'Bills', account: 'wallet', bucket: 'life', occurredAt: at, createdAt: at, updatedAt: at };
const payment: RecurringPayment = { id: 'rent-payment', recurringId: 'rent', month: '2026-11', entryId: 'rent-entry', createdAt: at, updatedAt: at };

describe('monthly spending backups', () => {
  test('migrates older plans and entries without creating schedules or payments', () => {
    const ledger = addPlan({ ...emptyLedger(), entries: [expense] }, '2026-11', defaultShares);
    const oldPlan = { ...ledger.plans[0] } as Partial<typeof ledger.plans[0]>;
    delete oldPlan.allocations;
    const migrated = validateLedger({ ...ledger, schemaVersion: 4, plans: [oldPlan] });
    expect(migrated.entries).toEqual([expense]);
    expect(migrated.plans[0].allocations.map(allocation => allocation.id)).toEqual(['life', 'fun', 'savings', 'investment']);
    expect(migrated.recurringExpenses).toEqual([]);
    expect(migrated.recurringPayments).toEqual([]);
    expect(validateLedger({ ...ledger, schemaVersion: 5 }).recurringExpenses).toEqual([]);
  });
  test('roundtrips schedules and uniquely linked monthly expenses', () => {
    const ledger = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule], recurringPayments: [payment] };
    expect(validateLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
    expect(mergeLedgers(ledger, ledger)).toEqual(ledger);
  });
  test('migrates inclusive v6 end months and retains open-ended legacy schedules', () => {
    const { endDate, ...oldSchedule } = schedule;
    const ledger = { ...emptyLedger(), schemaVersion: 6, recurringExpenses: [{ ...oldSchedule, endMonth: '2028-02' }] };
    expect(validateLedger(ledger).recurringExpenses[0].endDate).toBe('2028-02-29');
    expect(validateLedger({ ...ledger, recurringExpenses: [oldSchedule] }).recurringExpenses[0].endDate).toBeUndefined();
    expect(endDate).toBe('2027-12-31');
  });
  test('rejects invalid schedules, duplicate months, and missing or mismatched cash links', () => {
    const base = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule], recurringPayments: [payment] };
    for (const patch of [
      { recurringExpenses: [{ ...schedule, amountMinor: 0 }] },
      { recurringExpenses: [{ ...schedule, endDate: '2026-10-31' }] },
      { recurringExpenses: [{ ...schedule, endDate: '2027-02-30' }] },
      { recurringExpenses: [{ ...schedule, dueDay: 32 }] },
      { recurringExpenses: [{ ...schedule, bucket: 'missing' }] },
      { recurringPayments: [{ ...payment, entryId: 'missing' }] },
      { recurringPayments: [{ ...payment, month: '2026-12' }] },
      { recurringPayments: [payment, { ...payment, id: 'duplicate' }] },
      { entries: [{ ...expense, kind: 'income' }] }
    ]) expect(() => validateLedger({ ...base, ...patch })).toThrow();
  });
});

describe('monthly installment lifecycle', () => {
  test('schedules recur within their date range and due days respect short months', () => {
    const ledger = { ...emptyLedger(), recurringExpenses: [{ ...schedule, startMonth: '2027-01', endDate: '2027-03-31', dueDay: 31 }] };
    expect(recurringForMonth(ledger, '2026-12')).toHaveLength(0);
    expect(recurringForMonth(ledger, '2027-02')[0].dueDate).toBe('2027-02-28');
    expect(dueDateForMonth(ledger.recurringExpenses[0], '2028-02')).toBe('2028-02-29');
    expect(recurringForMonth(ledger, '2027-04')).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
  });
  test('stops after the actual end date, while allowing a replacement plan to start later', () => {
    const first = { ...schedule, startMonth: '2027-01', endDate: '2027-02-14', dueDay: 15 };
    const next = { ...schedule, id: 'new-plan', name: 'New plan', startMonth: '2027-02', endDate: '2027-04-15', dueDay: 15 };
    const ledger = { ...emptyLedger(), recurringExpenses: [first, next] };
    expect(recurringForMonth(ledger, '2027-01').map(row => row.schedule.id)).toEqual(['rent']);
    expect(recurringForMonth(ledger, '2027-02').map(row => row.schedule.id)).toEqual(['new-plan']);
    expect(recurringForMonth(ledger, '2027-04').map(row => row.schedule.id)).toEqual(['new-plan']);
    expect(recurringForMonth(ledger, '2027-05')).toHaveLength(0);
    expect(recurringForMonth({ ...ledger, recurringExpenses: [{ ...first, dueDay: undefined }] }, '2027-02')).toHaveLength(1);
    expect(() => recordRecurringPayment(ledger, first.id, '2027-02', { amountMinor: 100, note: 'Rent', category: 'Bills', account: 'wallet', localTime: '2027-02-10T12:00' })).toThrow('not scheduled');
  });
  test('requires an end date for newly created schedules', () => {
    const draft = { ...schedule }; delete draft.endDate;
    expect(() => saveRecurringExpense(emptyLedger(), draft)).toThrow('end date');
    expect(saveRecurringExpense(emptyLedger(), schedule).recurringExpenses[0].endDate).toBe('2027-12-31');
  });
  test('records an expense exactly once and leaves the next month pending', () => {
    const ledger = { ...emptyLedger(), recurringExpenses: [schedule] };
    const details = { amountMinor: 125000, note: 'November rent', category: 'Bills', account: 'wallet' as const, bucket: 'life', localTime: '2026-11-10T12:00' };
    const paid = recordRecurringPayment(ledger, schedule.id, '2026-11', details);
    expect(recurringForMonth(paid, '2026-11')[0].entry?.note).toBe('November rent');
    expect(recurringForMonth(paid, '2026-12')[0].payment).toBeUndefined();
    expect(totals(paid.entries).expenses).toBe(125000);
    expect(budgetForMonth(paid, '2026-11').spent.life).toBe(125000);
    expect(accountBalances(paid).wallet).toBe(-125000);
    expect(() => recordRecurringPayment(paid, schedule.id, '2026-11', details)).toThrow('already marked paid');
    expect(() => recordRecurringPayment(ledger, schedule.id, '2026-11', { ...details, localTime: '2026-12-01T10:00' })).toThrow('selected month');
    const paidAgain = recordRecurringPayment(paid, schedule.id, '2026-12', { ...details, localTime: '2026-12-01T10:00', amountMinor: 130000 });
    expect(paidAgain.entries).toHaveLength(2);
    expect(recurringForMonth(paidAgain, '2026-11')[0].entry?.amountMinor).toBe(125000);
    expect(recurringForMonth(paidAgain, '2026-12')[0].entry?.amountMinor).toBe(130000);
    expect(recurringForMonth(paidAgain, '2027-01')[0].payment).toBeUndefined();
  });
  test('allows corrections within the same month without changing the schedule or link', () => {
    const ledger = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule], recurringPayments: [payment] };
    const corrected = validateLedger({ ...ledger, entries: [{ ...expense, amountMinor: 120000, bucket: 'fun' }] });
    expect(recurringForMonth(corrected, '2026-11')[0].entry?.amountMinor).toBe(120000);
    expect(budgetForMonth(corrected, '2026-11').spent.fun).toBe(120000);
    expect(corrected.recurringExpenses[0]).toEqual(schedule);
    expect(() => validateLedger({ ...corrected, entries: [{ ...corrected.entries[0], occurredAt: new Date(2026, 11, 1, 12).toISOString() }] })).toThrow('Monthly payment link');
  });
  test('editing a schedule preserves prior payments; undo removes only the linked expense', () => {
    const ledger = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule], recurringPayments: [payment] };
    const edited = saveRecurringExpense(ledger, { ...schedule, name: 'Updated rent', amountMinor: 150000, startMonth: '2026-12' }, schedule.id);
    expect(edited.recurringExpenses[0].id).toBe(schedule.id);
    expect(edited.recurringExpenses[0].createdAt).toBe(schedule.createdAt);
    expect(recurringForMonth(edited, '2026-11')[0].entry).toEqual(expense);
    const undone = undoRecurringPayment(edited, payment.id);
    expect(undone.entries).toHaveLength(0);
    expect(undone.recurringPayments).toHaveLength(0);
    expect(undone.recurringExpenses).toHaveLength(1);
  });
  test('deleting a schedule retains real expenses and conflicting merges are rejected', () => {
    const ledger = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule], recurringPayments: [payment] };
    const deleted = deleteRecurringExpense(ledger, schedule.id);
    expect(deleted.entries).toEqual([expense]);
    expect(deleted.recurringExpenses).toHaveLength(0);
    expect(deleted.recurringPayments).toHaveLength(0);
    const conflict = { ...ledger, entries: [{ ...expense, id: 'other-entry' }], recurringPayments: [{ ...payment, id: 'other-payment', entryId: 'other-entry' }] };
    expect(() => mergeLedgers(ledger, conflict)).toThrow('duplicated');
    expect(ledger.entries).toEqual([expense]);
  });
  test('rejects reusing a cash entry across different monthly schedules', () => {
    const ledger = { ...emptyLedger(), entries: [expense], recurringExpenses: [schedule, { ...schedule, id: 'phone', name: 'Phone' }], recurringPayments: [payment, { ...payment, id: 'phone-payment', recurringId: 'phone' }] };
    expect(() => validateLedger(ledger)).toThrow('duplicated');
  });
});