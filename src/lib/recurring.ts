import { isMonth, monthKey, occurrenceTime, validateLedger, type AccountId, type BudgetBucket, type Entry, type Ledger, type RecurringExpense } from './finance';

export type RecurringDraft = Omit<RecurringExpense, 'id' | 'createdAt' | 'updatedAt'>;
export interface PaymentDetails { amountMinor: number; note: string; category: string; account: AccountId; bucket?: BudgetBucket; localTime: string }

export function dueDateForMonth(schedule: RecurringExpense, month: string): string | null {
  if (!isMonth(month)) throw new Error('Choose a valid month.');
  if (!schedule.dueDay) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const day = Math.min(schedule.dueDay, new Date(year, monthNumber, 0).getDate());
  return `${month}-${String(day).padStart(2, '0')}`;
}
export function isScheduledForMonth(schedule: RecurringExpense, month: string): boolean {
  if (!isMonth(month)) throw new Error('Choose a valid month.');
  if (schedule.startMonth > month || (schedule.endDate && schedule.endDate.slice(0, 7) < month)) return false;
  const dueDate = dueDateForMonth(schedule, month);
  return !schedule.endDate || month < schedule.endDate.slice(0, 7) || !dueDate || dueDate <= schedule.endDate;
}

export function recurringForMonth(ledger: Ledger, month: string) {
  if (!isMonth(month)) throw new Error('Choose a valid month.');
  const payments = new Map(ledger.recurringPayments.filter(payment => payment.month === month).map(payment => [payment.recurringId, payment]));
  const entries = new Map(ledger.entries.map(entry => [entry.id, entry]));
  return ledger.recurringExpenses.flatMap(schedule => {
    const payment = payments.get(schedule.id);
    const scheduled = isScheduledForMonth(schedule, month);
    return scheduled || payment ? [{ schedule, payment, entry: payment ? entries.get(payment.entryId) : undefined, dueDate: dueDateForMonth(schedule, month) }] : [];
  }).sort((first, second) => (first.dueDate ?? '9999').localeCompare(second.dueDate ?? '9999') || first.schedule.name.localeCompare(second.schedule.name) || first.schedule.id.localeCompare(second.schedule.id));
}

export function saveRecurringExpense(ledger: Ledger, draft: RecurringDraft, editingId?: string): Ledger {
  const existing = editingId ? ledger.recurringExpenses.find(schedule => schedule.id === editingId) : undefined;
  if (editingId && !existing) throw new Error('This monthly schedule was deleted in another tab.');
  if (!existing && !draft.endDate) throw new Error('Choose an end date for this monthly payment.');
  const now = new Date().toISOString();
  const schedule: RecurringExpense = { ...draft, id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  return validateLedger({ ...ledger, recurringExpenses: [...ledger.recurringExpenses.filter(item => item.id !== schedule.id), schedule] });
}

export function recordRecurringPayment(ledger: Ledger, recurringId: string, month: string, details: PaymentDetails): Ledger {
  if (!isMonth(month)) throw new Error('Choose a valid month.');
  const schedule = ledger.recurringExpenses.find(item => item.id === recurringId);
  if (!schedule) throw new Error('This monthly schedule was deleted in another tab.');
  if (!isScheduledForMonth(schedule, month)) throw new Error('This payment is not scheduled for the selected month.');
  if (ledger.recurringPayments.some(payment => payment.recurringId === recurringId && payment.month === month)) throw new Error('This month is already marked paid.');
  const date = new Date(details.localTime);
  if (!Number.isFinite(date.getTime()) || monthKey(date.toISOString()) !== month) throw new Error('Choose an actual payment date in the selected month.');
  const now = new Date().toISOString();
  const entry: Entry = { id: crypto.randomUUID(), kind: 'expense', amountMinor: details.amountMinor, note: details.note, category: details.category, account: details.account, ...(details.bucket ? { bucket: details.bucket } : {}), occurredAt: occurrenceTime(details.localTime), createdAt: now, updatedAt: now };
  return validateLedger({ ...ledger, entries: [...ledger.entries, entry], recurringPayments: [...ledger.recurringPayments, { id: crypto.randomUUID(), recurringId, month, entryId: entry.id, createdAt: now, updatedAt: now }] });
}

export function undoRecurringPayment(ledger: Ledger, paymentId: string): Ledger {
  const payment = ledger.recurringPayments.find(item => item.id === paymentId);
  if (!payment) throw new Error('This payment was already removed in another tab.');
  return validateLedger({ ...ledger, entries: ledger.entries.filter(entry => entry.id !== payment.entryId), recurringPayments: ledger.recurringPayments.filter(item => item.id !== paymentId) });
}

export function deleteRecurringExpense(ledger: Ledger, recurringId: string): Ledger {
  if (!ledger.recurringExpenses.some(item => item.id === recurringId)) throw new Error('This monthly schedule was already deleted in another tab.');
  return validateLedger({ ...ledger, recurringExpenses: ledger.recurringExpenses.filter(item => item.id !== recurringId), recurringPayments: ledger.recurringPayments.filter(payment => payment.recurringId !== recurringId) });
}