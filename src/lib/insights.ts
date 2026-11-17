import { accountBalances, allocatePlanIncome, allocationsForMonth, isMonth, localDateTime, monthKey, totals, type Ledger, type Wish } from './finance';

export function shiftMonth(month: string, offset: number): string {
  if (!isMonth(month) || !Number.isInteger(offset)) throw new Error('Invalid month.');
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + m - 1 + offset;
  const result = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
  if (!isMonth(result)) throw new Error('Month outside supported range.');
  return result;
}
export function monthEnd(month: string): string {
  if (!isMonth(month)) throw new Error('Invalid month.');
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 1, 0, 0, 0, -1).toISOString();
}
export function monthlyTrends(ledger: Ledger, end: string, count = 6) {
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('Choose 1–24 months.');
  if (!isMonth(end)) throw new Error('Choose a valid month.');
  const [year, m] = end.split('-').map(Number);
  count = Math.min(count, (year - 1900) * 12 + m);
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(end, i - count + 1);
    const entries = ledger.entries.filter(e => monthKey(e.occurredAt) === month);
    const { income, expenses } = totals(entries);
    const expected = ledger.expectedIncomes.find(e => e.month === month);
    const balances = accountBalances(ledger, monthEnd(month));
    return { month, income, expenses, hasIncome: entries.some(e => e.kind === 'income'), hasActivity: entries.length > 0, expectedIncome: entries.some(e => e.kind === 'income') ? null : expected?.amountMinor ?? null, savings: balances.savings, investment: balances.investment };
  });
}
export function spendingDetails(ledger: Ledger, month: string) {
  if (!isMonth(month)) throw new Error('Choose a valid month.');
  const [year, m] = month.split('-').map(Number);
  const daily = Array.from({ length: new Date(year, m, 0).getDate() }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`, amountMinor: 0, count: 0 }));
  const entries = ledger.entries.filter(e => e.kind === 'expense' && monthKey(e.occurredAt) === month).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const groups = new Map<string, { category: string; amountMinor: number; count: number }>();
  for (const entry of entries) {
    const index = new Date(entry.occurredAt).getDate() - 1;
    daily[index].amountMinor += entry.amountMinor; daily[index].count++;
    const group = groups.get(entry.category) ?? { category: entry.category, amountMinor: 0, count: 0 };
    group.amountMinor += entry.amountMinor; group.count++; groups.set(entry.category, group);
  }
  return { entries, daily, categories: [...groups.values()].sort((a, b) => b.amountMinor - a.amountMinor || a.category.localeCompare(b.category)) };
}
export function recentAssumptions(ledger: Ledger, now: Date) {
  const current = monthKey(now.toISOString());
  const prior = [-3, -2, -1].flatMap(offset => { try { return [shiftMonth(current, offset)]; } catch { return []; } });
  const observed = prior.map(month => ledger.entries.filter(e => monthKey(e.occurredAt) === month));
  const incomeMonths = observed.filter(entries => entries.some(e => e.kind === 'income')).map(entries => totals(entries).income);
  const expenseMonths = observed.filter(entries => entries.length > 0).map(entries => totals(entries).expenses);
  const average = (values: number[]) => values.length ? Number((values.reduce((sum, value) => sum + BigInt(value), 0n) + BigInt(Math.floor(values.length / 2))) / BigInt(values.length)) : null;
  return { incomeMinor: average(incomeMonths), expensesMinor: average(expenseMonths) ?? 0, incomeMonths: incomeMonths.length, expenseMonths: expenseMonths.length };
}
export const orderedWishlist = (items: Wish[]) => [...items].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
export interface ForecastOptions { horizonMonths: number; fallbackIncomeMinor?: number; monthlyExpensesMinor?: number }
export interface ForecastPoint { month: string; incomeMinor: number | null; source: 'actual' | 'expected' | 'scenario' | 'history' | 'unknown'; knownNetMinor: number; projectedContributionMinor: number; savingsMinor: number; shortfall: boolean; uncertain: boolean }
export interface GoalEstimate { wish: Wish; reservedBeforeMinor: number; availableNowMinor: number; estimatedMonth: string | null; status: 'now' | 'projected' | 'conditional' | 'insufficient' | 'beyond'; targetMet: boolean | null }
export function forecastSavings(ledger: Ledger, now: Date, options: ForecastOptions) {
  if (!Number.isInteger(options.horizonMonths) || options.horizonMonths < 1 || options.horizonMonths > 120) throw new Error('Choose a forecast horizon between 1 and 120 months.');
  for (const value of [options.fallbackIncomeMinor, options.monthlyExpensesMinor]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999)) throw new Error('Invalid forecast assumption.');
  const asOf = now.toISOString(); const start = monthKey(asOf);
  const assumptions = recentAssumptions(ledger, now);
  const startingSavingsMinor = accountBalances(ledger, asOf).savings;
  const monthlyExpensesMinor = options.monthlyExpensesMinor ?? assumptions.expensesMinor;
  let savings = startingSavingsMinor; let uncertain = false;
  const points: ForecastPoint[] = [];
  for (let i = 0; i < options.horizonMonths; i++) {
    let month: string;
    try { month = shiftMonth(start, i); } catch { break; }
    const entries = ledger.entries.filter(e => monthKey(e.occurredAt) === month);
    const incomes = entries.filter(e => e.kind === 'income');
    const expected = ledger.expectedIncomes.find(e => e.month === month);
    const fallback = options.fallbackIncomeMinor ?? assumptions.incomeMinor;
    const incomeMinor = incomes.length ? totals(incomes).income : expected ? expected.amountMinor : fallback;
    const source: ForecastPoint['source'] = incomes.length ? 'actual' : expected ? 'expected' : options.fallbackIncomeMinor !== undefined ? 'scenario' : assumptions.incomeMinor !== null ? 'history' : 'unknown';
    const transfers = ledger.transfers.filter(t => monthKey(t.occurredAt) === month);
    let funded = 0; let knownNetMinor = 0;
    for (const entry of entries) if (entry.account === 'savings') {
      if (entry.kind === 'income') funded += entry.amountMinor;
      if (entry.occurredAt > asOf) knownNetMinor += entry.kind === 'income' ? entry.amountMinor : -entry.amountMinor;
    }
    for (const transfer of transfers) {
      if (transfer.to === 'savings') funded += transfer.amountMinor;
      if (transfer.occurredAt > asOf) { if (transfer.to === 'savings') knownNetMinor += transfer.amountMinor; if (transfer.from === 'savings') knownNetMinor -= transfer.amountMinor; }
    }
    for (const opening of ledger.openings) if (opening.account === 'savings' && opening.occurredAt > asOf && monthKey(opening.occurredAt) === month) knownNetMinor += opening.amountMinor;
    const targets = allocatePlanIncome(incomeMinor ?? 0, allocationsForMonth(ledger, month));
    const expenses = Math.max(monthlyExpensesMinor, totals(entries).expenses);
    const capacity = Math.max(0, (incomeMinor ?? 0) - expenses - targets.investment);
    const projectedContributionMinor = Math.max(0, Math.min(targets.savings, capacity) - funded);
    savings += knownNetMinor + projectedContributionMinor;
    if (!Number.isSafeInteger(savings)) throw new Error('Forecast exceeds supported monetary limits.');
    uncertain ||= source === 'unknown';
    points.push({ month, incomeMinor, source, knownNetMinor, projectedContributionMinor, savingsMinor: savings, shortfall: incomeMinor !== null && incomeMinor < expenses + targets.investment, uncertain });
  }
  let reserved = 0;
  const goals: GoalEstimate[] = orderedWishlist(ledger.wishlist).map(wish => {
    const reservedBeforeMinor = reserved; reserved += wish.priceMinor;
    if (!Number.isSafeInteger(reserved)) throw new Error('Wishlist exceeds supported monetary limits.');
    const availableNowMinor = Math.min(wish.priceMinor, Math.max(0, startingSavingsMinor - reservedBeforeMinor));
    const availableNow = startingSavingsMinor >= reserved;
    const point = availableNow ? undefined : points.find(p => p.savingsMinor >= reserved);
    const estimatedMonth = availableNow ? start : point?.month ?? null;
    const status: GoalEstimate['status'] = availableNow ? 'now' : point ? point.uncertain ? 'conditional' : 'projected' : points.some(p => p.source === 'unknown') ? 'insufficient' : 'beyond';
    const targetMet = wish.targetMonth ? estimatedMonth ? estimatedMonth <= wish.targetMonth : status === 'insufficient' || wish.targetMonth > (points.at(-1)?.month ?? start) ? null : false : null;
    return { wish, reservedBeforeMinor, availableNowMinor, estimatedMonth, status, targetMet };
  });
  return { startingSavingsMinor, assumptions, monthlyExpensesMinor, points, goals, asOf };
}
