export type EntryKind = 'income' | 'expense';
export const accountIds = ['wallet', 'savings', 'investment'] as const;
export type AccountId = typeof accountIds[number];
export const accountLabels: Record<AccountId, string> = { wallet: 'Everyday wallet', savings: 'Savings', investment: 'Investment' };
export const budgetBuckets = ['life', 'fun', 'unallocated'] as const;
export type BudgetBucket = typeof budgetBuckets[number];
export const bucketLabels: Record<BudgetBucket, string> = { life: 'Day-to-day life', fun: 'Fun', unallocated: 'Unallocated' };
export interface Stamped { id: string; occurredAt: string; createdAt: string; updatedAt: string }
export interface Transfer extends Stamped { from: AccountId; to: AccountId; amountMinor: number; note: string }
export interface OpeningBalance extends Stamped { account: AccountId; amountMinor: number }
export type Shares = { life: number; fun: number; savings: number; investment: number };
export interface AllocationPlan { id: string; effectiveMonth: string; revision: number; shares: Shares; createdAt: string }
export interface ExpectedIncome { id: string; month: string; amountMinor: number; note: string; createdAt: string; updatedAt: string }
export interface Wish { id: string; name: string; priceMinor: number; priority: number; targetMonth?: string; createdAt: string; updatedAt: string }
export interface Investment { id: string; name: string; label: string; note: string; status: 'open' | 'closed'; valuation?: { amountMinor: number; valuedAt: string }; createdAt: string; updatedAt: string }
export type InvestmentEventKind = 'cost' | 'return' | 'fee' | 'loss';
export interface InvestmentEvent extends Stamped { investmentId: string; kind: InvestmentEventKind; amountMinor: number; note: string; entryId?: string }
export const defaultShares: Shares = { life: 5500, fun: 500, savings: 1500, investment: 1500 };
export interface Entry {
  id: string;
  kind: EntryKind;
  amountMinor: number;
  note: string;
  category: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  account?: AccountId;
  bucket?: BudgetBucket;
}
export interface Ledger { schemaVersion: 4; currency: 'EGP'; entries: Entry[]; plans: AllocationPlan[]; transfers: Transfer[]; openings: OpeningBalance[]; expectedIncomes: ExpectedIncome[]; wishlist: Wish[]; investments: Investment[]; investmentEvents: InvestmentEvent[] }
export const emptyLedger = (): Ledger => ({ schemaVersion: 4, currency: 'EGP', entries: [], plans: [], transfers: [], openings: [], expectedIncomes: [], wishlist: [], investments: [], investmentEvents: [] });
export const defaultCategories = ['Food & drinks', 'Bills', 'Transport', 'Shopping', 'Fun', 'Health', 'Other'];
export function parseAmount(value: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a positive amount with up to 2 decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be greater than zero.');
  return amount;
}
export function parseNonNegativeAmount(value: string): number {
  return /^0{1,10}(\.0{1,2})?$/.test(value.trim()) ? 0 : parseAmount(value);
}
export function localDateTime(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
export function monthKey(iso: string): string { return localDateTime(new Date(iso)).slice(0, 7); }
export function occurrenceTime(localValue: string, previous?: string): string {
  // A note/account/bucket edit must preserve the original seconds and milliseconds.
  if (previous && localDateTime(new Date(previous)) === localValue) return previous;
  return new Date(localValue).toISOString();
}
export function totals(entries: Entry[]) {
  const income = entries.filter(e => e.kind === 'income').reduce((s, e) => s + e.amountMinor, 0);
  const expenses = entries.filter(e => e.kind === 'expense').reduce((s, e) => s + e.amountMinor, 0);
  return { income, expenses, balance: income - expenses };
}
export function mergeLedgers(current: Ledger, backup: Ledger): Ledger {
  const merge = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const ids = new Set(a.map(e => e.id));
    return [...a, ...b.filter(e => !ids.has(e.id))];
  };
  // Each account has one opening; keep the current opening on merge.
  const accounts = new Set(current.openings.map(e => e.account));
  const openingIds = new Set(current.openings.map(e => e.id));
  const expectedMonths = new Set(current.expectedIncomes.map(e => e.month));
  const expectedIds = new Set(current.expectedIncomes.map(e => e.id));
  return validateLedger({ ...current, entries: merge(current.entries, backup.entries),
    plans: merge(current.plans, backup.plans), transfers: merge(current.transfers, backup.transfers),
    openings: [...current.openings, ...backup.openings.filter(e => !accounts.has(e.account) && !openingIds.has(e.id))],
    expectedIncomes: [...current.expectedIncomes, ...backup.expectedIncomes.filter(e => !expectedMonths.has(e.month) && !expectedIds.has(e.id))],
    wishlist: merge(current.wishlist, backup.wishlist), investments: merge(current.investments, backup.investments), investmentEvents: merge(current.investmentEvents, backup.investmentEvents) });
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function validateLedger(raw: unknown): Ledger {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a FinTrack backup.');
  const data = raw as Record<string, unknown>;
  if (![1, 2, 3, 4].includes(Number(data.schemaVersion)) || typeof data.schemaVersion !== 'number' || data.currency !== 'EGP' || !Array.isArray(data.entries)) throw new Error('Unsupported backup version or currency.');
  if (data.entries.length > 100_000) throw new Error('Backup contains too many entries.');
  const ids = new Set<string>();
  const entries: Entry[] = data.entries.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid entry in backup.');
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id || e.id.length > 100 || ids.has(e.id) ||
      !['income', 'expense'].includes(String(e.kind)) || !Number.isSafeInteger(e.amountMinor) ||
      (e.amountMinor as number) <= 0 || (e.amountMinor as number) > 999_999_999_999 ||
      typeof e.note !== 'string' || e.note.length > 300 || !e.note.trim() ||
      typeof e.category !== 'string' || !e.category.trim() || e.category.length > 60 ||
      !isDate(e.occurredAt) || !isDate(e.createdAt) || !isDate(e.updatedAt)) throw new Error('Backup contains an invalid or duplicate entry.');
    ids.add(e.id);
    if (e.account !== undefined && !accountIds.includes(e.account as AccountId)) throw new Error('Invalid entry account.');
    if (e.bucket !== undefined && (!budgetBuckets.includes(e.bucket as BudgetBucket) || e.kind !== 'expense')) throw new Error('Invalid spending budget bucket.');
    return { id: e.id, kind: e.kind as EntryKind, amountMinor: e.amountMinor as number, note: e.note.trim(), category: e.category.trim(), occurredAt: e.occurredAt, createdAt: e.createdAt, updatedAt: e.updatedAt,
      ...(e.account !== undefined ? { account: e.account as AccountId } : {}), ...(e.bucket !== undefined ? { bucket: e.bucket as BudgetBucket } : {}) };
  });
  const collection = (name: string): Record<string, unknown>[] => {
    if (data.schemaVersion === 1 || (data.schemaVersion === 2 && ['expectedIncomes', 'wishlist'].includes(name)) || ((data.schemaVersion as number) < 4 && ['investments', 'investmentEvents'].includes(name))) return [];
    const items = data[name];
    if (!Array.isArray(items) || items.length > 100_000) throw new Error(`Invalid ${name} in backup.`);
    return items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${name} record.`);
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string' || !record.id || record.id.length > 100 || ids.has(record.id)) throw new Error('Invalid or duplicate record ID.');
      ids.add(record.id); return record;
    });
  };
  const stamped = (e: Record<string, unknown>): Stamped => {
    if (!isDate(e.occurredAt) || !isDate(e.createdAt) || !isDate(e.updatedAt)) throw new Error('Invalid record timestamp.');
    return { id: e.id as string, occurredAt: e.occurredAt, createdAt: e.createdAt, updatedAt: e.updatedAt };
  };
  const amount = (v: unknown, allowZero = false): number => {
    if (!Number.isSafeInteger(v) || (v as number) < (allowZero ? 0 : 1) || (v as number) > 999_999_999_999) throw new Error('Invalid account amount.');
    return v as number;
  };
  const transfers: Transfer[] = collection('transfers').map(e => {
    if (!accountIds.includes(e.from as AccountId) || !accountIds.includes(e.to as AccountId) || e.from === e.to || typeof e.note !== 'string' || !e.note.trim() || e.note.length > 300) throw new Error('Invalid transfer.');
    return { ...stamped(e), from: e.from as AccountId, to: e.to as AccountId, amountMinor: amount(e.amountMinor), note: e.note.trim() };
  });
  const openingAccounts = new Set<AccountId>();
  const openings: OpeningBalance[] = collection('openings').map(e => {
    if (!accountIds.includes(e.account as AccountId) || openingAccounts.has(e.account as AccountId)) throw new Error('Only one opening balance per account is allowed.');
    openingAccounts.add(e.account as AccountId);
    return { ...stamped(e), account: e.account as AccountId, amountMinor: amount(e.amountMinor, true) };
  });
  const revisions = new Set<string>();
  const plans: AllocationPlan[] = collection('plans').map(e => {
    if (typeof e.effectiveMonth !== 'string' || !isMonth(e.effectiveMonth) || !Number.isSafeInteger(e.revision) || (e.revision as number) < 1 || !isDate(e.createdAt)) throw new Error('Invalid allocation plan.');
    const revisionKey = `${e.effectiveMonth}:${e.revision}`;
    if (revisions.has(revisionKey)) throw new Error('Conflicting plan revisions. Use replace to restore this backup instead.');
    revisions.add(revisionKey);
    const shares = validateShares(e.shares);
    return { id: e.id as string, effectiveMonth: e.effectiveMonth, revision: e.revision as number, shares, createdAt: e.createdAt };
  });
  const expectedMonths = new Set<string>();
  const expectedIncomes: ExpectedIncome[] = collection('expectedIncomes').map(e => {
    if (typeof e.month !== 'string' || !isMonth(e.month) || expectedMonths.has(e.month) || typeof e.note !== 'string' || !e.note.trim() || e.note.length > 300 || !isDate(e.createdAt) || !isDate(e.updatedAt)) throw new Error('Invalid or duplicate expected income month.');
    expectedMonths.add(e.month);
    return { id: e.id as string, month: e.month, amountMinor: amount(e.amountMinor, true), note: e.note.trim(), createdAt: e.createdAt, updatedAt: e.updatedAt };
  });
  const wishlist: Wish[] = collection('wishlist').map(e => {
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 120 || !Number.isSafeInteger(e.priority) || (e.priority as number) < 1 || (e.priority as number) > 100_000 || (e.targetMonth !== undefined && (typeof e.targetMonth !== 'string' || !isMonth(e.targetMonth))) || !isDate(e.createdAt) || !isDate(e.updatedAt)) throw new Error('Invalid wishlist item.');
    return { id: e.id as string, name: e.name.trim(), priceMinor: amount(e.priceMinor), priority: e.priority as number, ...(e.targetMonth ? { targetMonth: e.targetMonth as string } : {}), createdAt: e.createdAt, updatedAt: e.updatedAt };
  });
  const investments: Investment[] = collection('investments').map(e => {
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > 120 || typeof e.label !== 'string' || !e.label.trim() || e.label.length > 60 || typeof e.note !== 'string' || e.note.length > 300 || !['open', 'closed'].includes(String(e.status)) || !isDate(e.createdAt) || !isDate(e.updatedAt)) throw new Error('Invalid investment position.');
    let valuation: Investment['valuation'];
    if (e.valuation !== undefined) {
      if (!e.valuation || typeof e.valuation !== 'object' || e.status === 'closed') throw new Error('Only open investments can have a current valuation.');
      const v = e.valuation as Record<string, unknown>;
      if (!isDate(v.valuedAt)) throw new Error('Invalid valuation date.');
      valuation = { amountMinor: amount(v.amountMinor, true), valuedAt: v.valuedAt };
    }
    return { id: e.id as string, name: e.name.trim(), label: e.label.trim(), note: e.note, status: e.status as Investment['status'], ...(valuation ? { valuation } : {}), createdAt: e.createdAt, updatedAt: e.updatedAt };
  });
  const positions = new Map(investments.map(i => [i.id, i]));
  const cashEntries = new Map(entries.map(e => [e.id, e]));
  const linkedIds = new Set<string>();
  const costTotals = new Map<string, number>();
  const investmentEvents: InvestmentEvent[] = collection('investmentEvents').map(e => {
    if (typeof e.investmentId !== 'string' || !positions.has(e.investmentId) || !['cost', 'return', 'fee', 'loss'].includes(String(e.kind)) || typeof e.note !== 'string' || !e.note.trim() || e.note.length > 300) throw new Error('Invalid investment event or missing position.');
    const amountMinor = amount(e.amountMinor, e.kind === 'return');
    const timestamps = stamped(e);
    if (amountMinor > 0) {
      const entry = typeof e.entryId === 'string' ? cashEntries.get(e.entryId) : undefined;
      if (!entry || linkedIds.has(entry.id) || entry.account !== 'investment' || entry.amountMinor !== amountMinor || entry.kind !== (e.kind === 'return' ? 'income' : 'expense') || entry.occurredAt !== timestamps.occurredAt) throw new Error('Investment cash link is missing, reused or mismatched. Edit the event in Investments, or remove its link before changing/deleting that cash entry.');
      linkedIds.add(entry.id);
    } else if (e.entryId !== undefined) throw new Error('A zero cash return cannot link a transaction.');
    if (e.kind === 'cost') costTotals.set(e.investmentId, (costTotals.get(e.investmentId) ?? 0) + amountMinor);
    return { ...timestamps, investmentId: e.investmentId, kind: e.kind as InvestmentEventKind, amountMinor, note: e.note.trim(), ...(typeof e.entryId === 'string' ? { entryId: e.entryId } : {}) };
  });
  if (investments.some(i => i.status === 'closed' && (costTotals.get(i.id) ?? 0) <= 0)) throw new Error('Record a cost before closing an investment.');
  const amounts = [...entries, ...transfers, ...openings, ...expectedIncomes];
  const recordCount = entries.length + transfers.length + openings.length + plans.length + expectedIncomes.length + wishlist.length + investments.length + investmentEvents.length;
  const aggregate = amounts.reduce((s, e) => s + BigInt(e.amountMinor), 0n) + wishlist.reduce((s, e) => s + BigInt(e.priceMinor), 0n) + investments.reduce((s, e) => s + BigInt(e.valuation?.amountMinor ?? 0), 0n);
  if (recordCount > 100_000 || aggregate > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Backup exceeds supported limits.');
  return { schemaVersion: 4, currency: 'EGP', entries, transfers, openings, plans, expectedIncomes, wishlist, investments, investmentEvents };
}

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 9999;
export function validateShares(raw: unknown): Shares {
  if (!raw || typeof raw !== 'object') throw new Error('Enter all four allocation percentages.');
  const shares = raw as Shares;
  const result = { life: shares.life, fun: shares.fun, savings: shares.savings, investment: shares.investment };
  if (Object.values(result).some(v => !Number.isInteger(v) || v < 0 || v > 10000) || Object.values(result).reduce((s, v) => s + v, 0) > 10000) throw new Error('Allocations must be nonnegative and total at most 100%.');
  return result;
}
export function parsePercent(value: string): number {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) throw new Error('Percentages need up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps > 10000) throw new Error('A percentage cannot exceed 100%.');
  return bps;
}
export function planForMonth(ledger: Ledger, month: string): Shares {
  return ledger.plans.filter(p => p.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.revision - a.revision)[0]?.shares ?? { ...defaultShares };
}
export function addPlan(ledger: Ledger, month: string, shares: Shares): Ledger {
  if (!isMonth(month)) throw new Error('Choose a valid effective month (1900 or later).');
  const revision = Math.max(0, ...ledger.plans.filter(p => p.effectiveMonth === month).map(p => p.revision)) + 1;
  return validateLedger({ ...ledger, plans: [...ledger.plans, { id: crypto.randomUUID(), effectiveMonth: month, revision, shares: validateShares(shares), createdAt: new Date().toISOString() }] });
}
export function allocateIncome(income: number, raw: Shares): Record<keyof Shares | 'unallocated', number> {
  const shares = validateShares(raw);
  if (!Number.isSafeInteger(income) || income < 0) throw new Error('Invalid income total.');
  const weights = { ...shares, unallocated: 10000 - Object.values(shares).reduce((s, v) => s + v, 0) };
  const parts = Object.entries(weights).map(([key, weight], order) => {
    const product = BigInt(income) * BigInt(weight);
    return { key: key as keyof typeof weights, value: Number(product / 10000n), remainder: Number(product % 10000n), order };
  });
  const remaining = income - parts.reduce((sum, p) => sum + p.value, 0);
  const ranked = [...parts].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (let i = 0; i < remaining; i++) ranked[i].value++;
  return Object.fromEntries(parts.map(p => [p.key, p.value])) as Record<keyof Shares | 'unallocated', number>;
}
export function accountBalances(ledger: Ledger, through = '9999-12-31T23:59:59.999Z'): Record<AccountId, number> {
  const balances = { wallet: 0, savings: 0, investment: 0 };
  for (const o of ledger.openings) if (o.occurredAt <= through) balances[o.account] += o.amountMinor;
  for (const e of ledger.entries) if (e.occurredAt <= through) balances[e.account ?? 'wallet'] += e.kind === 'income' ? e.amountMinor : -e.amountMinor;
  for (const t of ledger.transfers) if (t.occurredAt <= through) { balances[t.from] -= t.amountMinor; balances[t.to] += t.amountMinor; }
  return balances;
}
export function budgetForMonth(ledger: Ledger, month: string) {
  const entries = ledger.entries.filter(e => monthKey(e.occurredAt) === month);
  const shares = planForMonth(ledger, month);
  const targets = allocateIncome(totals(entries).income, shares);
  const spent = { life: 0, fun: 0, unallocated: 0, unclassified: 0 };
  for (const e of entries) if (e.kind === 'expense') spent[e.bucket ?? 'unclassified'] += e.amountMinor;
  const netAdded = { savings: 0, investment: 0 };
  for (const account of ['savings', 'investment'] as const) {
    for (const e of entries) if (e.account === account) netAdded[account] += e.kind === 'income' ? e.amountMinor : -e.amountMinor;
    for (const t of ledger.transfers) if (monthKey(t.occurredAt) === month) {
      if (t.to === account) netAdded[account] += t.amountMinor;
      if (t.from === account) netAdded[account] -= t.amountMinor;
    }
  }
  return { shares, targets, spent, netAdded };
}
