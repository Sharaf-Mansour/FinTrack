import { occurrenceTime, validateLedger, type Entry, type InvestmentEvent, type InvestmentEventKind, type Ledger } from './finance';

export const eventLabels: Record<InvestmentEventKind, string> = { cost: 'Investment cost', return: 'Cash returned', fee: 'Fee', loss: 'Additional loss' };
export function investmentStats(ledger: Ledger, id: string) {
  const position = ledger.investments.find(i => i.id === id);
  if (!position) throw new Error('Investment not found.');
  const events = ledger.investmentEvents.filter(e => e.investmentId === id);
  const sum = (kind: InvestmentEventKind) => events.filter(e => e.kind === kind).reduce((s, e) => s + e.amountMinor, 0);
  const costMinor = sum('cost'); const returnedMinor = sum('return');
  const feesMinor = sum('fee'); const lossesMinor = sum('loss');
  const netCashMinor = returnedMinor - costMinor - feesMinor - lossesMinor;
  const realizedMinor = position.status === 'closed' ? netCashMinor : null;
  const estimatedMinor = position.status === 'open' && position.valuation ? netCashMinor + position.valuation.amountMinor : null;
  const roiPercent = costMinor > 0 && realizedMinor !== null ? realizedMinor / costMinor * 100 : null;
  const estimatedRoiPercent = costMinor > 0 && estimatedMinor !== null ? estimatedMinor / costMinor * 100 : null;
  return { position, events, costMinor, returnedMinor, feesMinor, lossesMinor, netCashMinor, realizedMinor, estimatedMinor, roiPercent, estimatedRoiPercent };
}
export interface EventDraft { investmentId: string; kind: InvestmentEventKind; amountMinor: number; note: string; localTime: string; id?: string; existingEntryId?: string }
export function recordInvestmentEvent(ledger: Ledger, draft: EventDraft): Ledger {
  const position = ledger.investments.find(i => i.id === draft.investmentId);
  if (!position) throw new Error('This investment was removed.');
  const previous = draft.id ? ledger.investmentEvents.find(e => e.id === draft.id && e.investmentId === position.id) : undefined;
  if (draft.id && !previous) throw new Error('This investment event was removed. Reopen the form.');
  const now = new Date().toISOString();
  const linking = draft.existingEntryId ? ledger.entries.find(e => e.id === draft.existingEntryId) : undefined;
  if (draft.existingEntryId && (!linking || previous)) throw new Error('Choose an existing transaction only when creating a new event.');
  const entryId = previous?.entryId ?? linking?.id ?? (draft.amountMinor > 0 ? crypto.randomUUID() : undefined);
  const existingCash = entryId ? ledger.entries.find(e => e.id === entryId) : undefined;
  if (previous?.entryId && draft.amountMinor === 0) throw new Error('To record zero returned, explicitly remove this event/cash entry first, then add a zero-return event.');
  const amountMinor = linking?.amountMinor ?? draft.amountMinor;
  const occurredAt = linking?.occurredAt ?? occurrenceTime(draft.localTime, previous?.occurredAt);
  const event: InvestmentEvent = { id: previous?.id ?? crypto.randomUUID(), investmentId: position.id, kind: draft.kind, amountMinor, note: draft.note.trim(), occurredAt, createdAt: previous?.createdAt ?? now, updatedAt: now, ...(entryId ? { entryId } : {}) };
  let entries = ledger.entries;
  if (entryId && !linking) {
    const entry: Entry = { id: entryId, account: 'investment', kind: draft.kind === 'return' ? 'income' : 'expense', amountMinor, note: existingCash?.note ?? `${position.name}: ${eventLabels[draft.kind]} — ${draft.note.trim()}`.slice(0, 300), category: existingCash?.category ?? `Investment: ${position.label}`.slice(0, 60), ...(draft.kind !== 'return' ? { bucket: existingCash?.bucket ?? 'unallocated' } : {}), occurredAt, createdAt: existingCash?.createdAt ?? now, updatedAt: now };
    entries = [...entries.filter(e => e.id !== entryId), entry];
  }
  return validateLedger({ ...ledger, entries, investmentEvents: [...ledger.investmentEvents.filter(e => e.id !== event.id), event] });
}
export function removeInvestmentEvent(ledger: Ledger, id: string, removeCash = false): Ledger {
  const event = ledger.investmentEvents.find(e => e.id === id);
  if (!event) return ledger;
  const investmentEvents = ledger.investmentEvents.filter(e => e.id !== id);
  // Reopen if deleting the last cost invalidates a closed position's realized result.
  const investments = ledger.investments.map(i => i.id === event.investmentId && i.status === 'closed' && !investmentEvents.some(e => e.investmentId === i.id && e.kind === 'cost') ? { ...i, status: 'open' as const, updatedAt: new Date().toISOString() } : i);
  return validateLedger({ ...ledger, investments, investmentEvents, entries: removeCash ? ledger.entries.filter(e => e.id !== event.entryId) : ledger.entries });
}
export function removeInvestment(ledger: Ledger, id: string, removeCash = false): Ledger {
  const entryIds = new Set(ledger.investmentEvents.filter(e => e.investmentId === id).map(e => e.entryId));
  return validateLedger({ ...ledger, investments: ledger.investments.filter(i => i.id !== id), investmentEvents: ledger.investmentEvents.filter(e => e.investmentId !== id), entries: removeCash ? ledger.entries.filter(e => !entryIds.has(e.id)) : ledger.entries });
}
