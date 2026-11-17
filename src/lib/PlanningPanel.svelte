<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import { localDateTime, parseAmount, parseNonNegativeAmount, type ExpectedIncome, type Ledger, type Wish } from './finance';
  import { forecastSavings, orderedWishlist } from './insights';
  import Chart from './Chart.svelte';
  import Icon from './Icon.svelte';
  let { ledger, busy, disabled, commit, getError }: {
    ledger: Ledger; busy: boolean; disabled: boolean;
    commit: (transform: (current: Ledger) => Ledger) => Promise<boolean>; getError: () => string;
  } = $props();
  let now = $state(new Date());
  $effect(() => { ledger.entries; ledger.transfers; ledger.openings; now = new Date(); });
  onMount(() => { const timer = setInterval(() => now = new Date(), 60_000); return () => clearInterval(timer); });
  const currentMonth = $derived(localDateTime(now).slice(0, 7));
  const money = (minor: number) => new Intl.NumberFormat('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  let horizon = $state(36);
  let fallbackIncome = $state('');
  let expenses = $state('');
  let message = $state('');
  let form = $state<'wish' | 'expected' | null>(null);
  let editing = $state<Wish | ExpectedIncome | null>(null);
  let name = $state('');
  let amount = $state('');
  let month = $state(localDateTime().slice(0, 7));
  let targetMonth = $state('');
  let priority = $state('1');
  let formError = $state('');
  let deletion = $state<{ id: string; name: string; type: 'wish' | 'expected' } | null>(null);
  let deleteError = $state('');
  const wishes = $derived(orderedWishlist(ledger.wishlist));
  const result = $derived.by(() => {
    try {
      return { data: forecastSavings(ledger, now, { horizonMonths: horizon, ...(fallbackIncome.trim() ? { fallbackIncomeMinor: parseNonNegativeAmount(fallbackIncome) } : {}), ...(expenses.trim() ? { monthlyExpensesMinor: parseNonNegativeAmount(expenses) } : {}) }), error: '' };
    } catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Check your assumptions.' }; }
  });
  const projection = $derived<EChartsCoreOption>({
    backgroundColor: 'transparent', textStyle: { color: '#bdb6b1', fontFamily: 'Arial, Helvetica, sans-serif' },
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    grid: { left: 18, right: 20, top: 20, bottom: 20, containLabel: true },
    xAxis: { type: 'category', data: result.data?.points.map(p => p.month) ?? [], axisLabel: { color: '#bdb6b1', hideOverlap: true } },
    yAxis: { type: 'value', name: 'EGP', axisLabel: { color: '#bdb6b1' }, splitLine: { lineStyle: { color: '#26262b' } } },
    series: [{ name: 'Projected savings before wishlist purchases', type: 'line', showSymbol: false, data: result.data?.points.map(p => p.savingsMinor / 100) ?? [], lineStyle: { color: '#d9b777', type: 'dashed' }, itemStyle: { color: '#d9b777' } }]
  });
  function modal(node: HTMLDialogElement) { node.showModal(); return { destroy: () => node.close() }; }
  function openWish(wish: Wish | null = null) {
    editing = wish; name = wish?.name ?? ''; amount = wish ? (wish.priceMinor / 100).toFixed(2) : '';
    priority = String(wish?.priority ?? Math.min(100_000, Math.max(0, ...ledger.wishlist.map(w => w.priority)) + 1));
    targetMonth = wish?.targetMonth ?? ''; formError = ''; form = 'wish';
  }
  function openExpected(expected: ExpectedIncome | null = null) {
    editing = expected; name = expected?.note ?? ''; amount = expected ? (expected.amountMinor / 100).toFixed(2) : '';
    month = expected?.month ?? currentMonth; formError = ''; form = 'expected';
  }
  async function save(event: SubmitEvent) {
    event.preventDefault(); formError = '';
    try {
      if (!name.trim()) throw new Error('Add a name or note.');
      const amountMinor = form === 'expected' ? parseNonNegativeAmount(amount) : parseAmount(amount);
      const id = editing?.id; const timestamp = new Date().toISOString();
      const saved = await commit(current => {
        if (form === 'wish') {
          const existing = current.wishlist.find(w => w.id === id);
          if (id && !existing) throw new Error('This goal was removed in another tab. Reopen the form.');
          if (!/^\d{1,6}$/.test(priority)) throw new Error('Priority must be a whole number from 1 to 100000.');
          const wish: Wish = { id: existing?.id ?? crypto.randomUUID(), name: name.trim(), priceMinor: amountMinor, priority: Number(priority), ...(targetMonth ? { targetMonth } : {}), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
          return { ...current, wishlist: [...current.wishlist.filter(w => w.id !== wish.id), wish] };
        }
        const existing = current.expectedIncomes.find(e => e.id === id);
        if (id && !existing) throw new Error('This expected income was removed in another tab.');
        if (current.expectedIncomes.some(e => e.month === month && e.id !== id)) throw new Error('That month already has expected income. Edit its existing record.');
        const expected: ExpectedIncome = { id: existing?.id ?? crypto.randomUUID(), month, amountMinor, note: name.trim(), createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
        return { ...current, expectedIncomes: [...current.expectedIncomes.filter(e => e.id !== expected.id), expected] };
      });
      if (saved) { message = form === 'wish' ? 'Wishlist updated. Real balances are unchanged.' : 'Expected income saved for scenarios only.'; form = null; }
      else formError = getError() || 'Could not save. Try again.';
    } catch (e) { formError = e instanceof Error ? e.message : 'Check your inputs.'; }
  }
  async function move(id: string, direction: -1 | 1) {
    if (await commit(current => {
      const order = orderedWishlist(current.wishlist); const index = order.findIndex(w => w.id === id);
      if (index < 0 || index + direction < 0 || index + direction >= order.length) return current;
      [order[index], order[index + direction]] = [order[index + direction], order[index]];
      const timestamp = new Date().toISOString();
      return { ...current, wishlist: order.map((wish, i) => wish.priority === i + 1 ? wish : { ...wish, priority: i + 1, updatedAt: timestamp }) };
    })) message = 'Priority updated. Earlier goals reserve savings first.';
  }
  async function remove() {
    if (!deletion) return;
    const { id, type } = deletion;
    if (await commit(current => type === 'wish' ? { ...current, wishlist: current.wishlist.filter(w => w.id !== id) } : { ...current, expectedIncomes: current.expectedIncomes.filter(e => e.id !== id) })) { deletion = null; message = 'Planning record removed. Real transactions are unchanged.'; }
    else deleteError = getError() || 'Could not remove this record.';
  }
  const sourceLabel = { actual: 'Actual income', expected: 'Expected only', scenario: 'Temporary fallback', history: 'Recent-income average', unknown: 'No income data' };
</script>

<div class="planning-space">
  {#if message}<p class="finance-notice" role="status"><Icon name="check" size={17} />{message}</p>{/if}
  <section class="panel"><div class="section-heading"><div><h2>Expected income</h2><p>One estimate per month. Any actual income for that month replaces this whole estimate in forecasts.</p></div><button class="primary-button small" disabled={disabled || busy} onclick={() => openExpected()}><Icon name="plus" size={16} /> Add estimate</button></div>{#if !ledger.expectedIncomes.length}<div class="empty-state"><h3>A little planning ahead</h3><p>Add expected salary for months without actual income. Zero is allowed for a month with no expected income.</p></div>{:else}<div class="entry-list">{#each [...ledger.expectedIncomes].sort((a, b) => a.month.localeCompare(b.month)) as expected (expected.id)}<article class="entry-row"><div class="entry-description"><h3>{expected.month} · {expected.note}</h3><p>{ledger.entries.some(e => e.kind === 'income' && localDateTime(new Date(e.occurredAt)).slice(0, 7) === expected.month) ? 'Superseded by actual income · retained as a planning record' : 'Expected only · excluded from real balances'}</p></div><span class="entry-amount">{money(expected.amountMinor)}<small>EGP expected</small></span><div class="entry-actions"><button class="icon-button" aria-label={`Edit expected income for ${expected.month}`} disabled={disabled || busy} onclick={() => openExpected(expected)}><Icon name="edit" size={16} /></button><button class="icon-button delete-button" aria-label={`Delete expected income for ${expected.month}`} disabled={disabled || busy} onclick={() => { deletion = { id: expected.id, name: `${expected.month} expected income`, type: 'expected' }; deleteError = ''; }}><Icon name="trash" size={16} /></button></div></article>{/each}</div>{/if}</section>
  <section class="panel"><div class="section-heading"><div><h2>Your wishlist</h2><p>Earlier goals reserve savings before later goals. Use arrows to change the order.</p></div><button class="primary-button small" disabled={disabled || busy} onclick={() => openWish()}><Icon name="plus" size={16} /> Add goal</button></div>{#if !wishes.length}<div class="empty-state"><span class="empty-icon"><Icon name="spark" size={26} /></span><h3>Something worth saving for?</h3><p>Add a GPU, a trip, or your next big idea. Only your savings account funds these goals.</p></div>{:else}<div class="goal-list">{#each wishes as wish, i (wish.id)}{@const estimate = result.data?.goals.find(g => g.wish.id === wish.id)}<article class="goal-card"><div class="goal-header"><span class="goal-rank">{i + 1}</span><div><h3>{wish.name}</h3><p>EGP {money(wish.priceMinor)}{wish.targetMonth ? ` · Target ${wish.targetMonth}` : ''}</p></div><div class="goal-actions"><button class="icon-button" aria-label={`Move ${wish.name} earlier`} disabled={disabled || busy || i === 0} onclick={() => move(wish.id, -1)}><span aria-hidden="true">↑</span></button><button class="icon-button" aria-label={`Move ${wish.name} later`} disabled={disabled || busy || i === wishes.length - 1} onclick={() => move(wish.id, 1)}><span aria-hidden="true">↓</span></button><button class="icon-button" aria-label={`Edit goal ${wish.name}`} disabled={disabled || busy} onclick={() => openWish(wish)}><Icon name="edit" size={16} /></button><button class="icon-button delete-button" aria-label={`Remove goal ${wish.name}`} disabled={disabled || busy} onclick={() => { deletion = { id: wish.id, name: wish.name, type: 'wish' }; deleteError = ''; }}><Icon name="trash" size={16} /></button></div></div>{#if estimate}<p class="goal-estimate">{estimate.status === 'now' ? 'Enough savings available now' : estimate.status === 'insufficient' ? 'Insufficient income data to estimate' : estimate.status === 'beyond' ? `Not reached within ${horizon} months` : `${estimate.status === 'conditional' ? 'Conditional estimate' : 'Estimated affordability'}: ${estimate.estimatedMonth} (month end)`}</p><p class="goal-detail">EGP {money(estimate.availableNowMinor)} available now after EGP {money(estimate.reservedBeforeMinor)} reserved for earlier goals.</p>{#if wish.targetMonth}<p class="goal-detail" class:budget-warning={estimate.targetMet === false}>{estimate.targetMet === null ? 'More data or a longer horizon is needed to assess your target.' : estimate.targetMet ? 'Scenario reaches your target month.' : 'Target month is not reached in this scenario.'}</p>{/if}{:else}<p class="goal-detail">Fix scenario inputs below to see an estimate.</p>{/if}</article>{/each}</div>{/if}</section>
  <section class="panel"><div class="section-heading"><div><h2>Savings-only scenario</h2><p>As of {now.toLocaleString('en-GB')}. This is independent of the dashboard’s history month.</p></div></div><div class="scenario-controls"><label>Horizon<select bind:value={horizon}><option value={12}>12 months</option><option value={36}>36 months</option><option value={60}>60 months</option><option value={120}>120 months</option></select></label><label>Fallback monthly income (EGP)<input inputmode="decimal" bind:value={fallbackIncome} placeholder="Use recent-income average" /></label><label>Monthly expenses (EGP)<input inputmode="decimal" bind:value={expenses} placeholder="Use recent recorded average" /></label></div><p class="scenario-help">Temporary overrides are not saved. Blank uses recent history; enter 0 explicitly for no income or no expenses.</p>{#if result.error}<p class="scenario-help form-error" role="alert">{result.error}</p>{:else if result.data}<div class="scenario-summary"><strong>Actual savings now: EGP {money(result.data.startingSavingsMinor)}</strong><p>Recent income average: {result.data.assumptions.incomeMinor === null ? 'not enough data' : `EGP ${money(result.data.assumptions.incomeMinor)}`} ({result.data.assumptions.incomeMonths} recorded income months). Expense assumption: EGP {money(result.data.monthlyExpensesMinor)}.</p></div><Chart option={projection} title="Conditional month-end savings projection before wishlist purchases in EGP" /><div class="finance-policy"><p>Income source: actual → expected → temporary fallback → average of recorded income months in the previous 3 completed calendar months. Expected income is never counted as real money.</p><p>Assumes you transfer the effective savings allocation, limited by income left after the greater of recorded/assumed expenses and the investment allocation. Already-recorded savings inflows count toward that target; future recorded savings movements are included once. No investment growth is assumed.</p><p>Unknown income months add no projected contributions and make later estimates conditional. Negative capacity adds no savings. The line is before wishlist purchases; goals reserve their cumulative prices separately. Forecasts do not execute purchases or create transactions.</p></div><details class="data-details"><summary>Forecast figures & assumptions by month</summary><!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable data tables need keyboard focus.) -->
<div class="table-scroll" role="region" aria-label="Savings forecast table" tabindex="0"><table><thead><tr><th scope="col">Month</th><th scope="col">Income source</th><th scope="col">Income EGP</th><th scope="col">Known savings movements</th><th scope="col">Extra projected savings</th><th scope="col">Projected balance</th></tr></thead><tbody>{#each result.data.points as point}<tr><td>{point.month}</td><td>{sourceLabel[point.source]}{point.uncertain ? ' · conditional' : ''}{point.shortfall ? ' · income shortfall' : ''}</td><td>{point.incomeMinor === null ? 'Unknown' : money(point.incomeMinor)}</td><td>{money(point.knownNetMinor)}</td><td>{money(point.projectedContributionMinor)}</td><td>{money(point.savingsMinor)}</td></tr>{/each}</tbody></table></div></details>{/if}</section>
</div>

{#if form}<dialog use:modal aria-labelledby="planning-form-title" oncancel={(event) => { if (busy) event.preventDefault(); else form = null; }}><div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h2 id="planning-form-title">{editing ? 'Edit' : 'Add'} {form === 'wish' ? 'wishlist goal' : 'expected income'}</h2></div><button class="icon-button" aria-label="Close planning form" disabled={busy} onclick={() => form = null}><Icon name="close" /></button></div><form onsubmit={save}><fieldset disabled={busy}><label class="form-label">{form === 'wish' ? 'Goal name' : 'Income note'}<input bind:value={name} maxlength={form === 'wish' ? 120 : 300} placeholder={form === 'wish' ? 'e.g. A new GPU' : 'e.g. Expected December salary'} required /></label><label class="form-label">{form === 'wish' ? 'Target price (EGP)' : 'Expected amount (EGP)'}<input inputmode="decimal" bind:value={amount} maxlength="13" placeholder="0.00" required /></label>{#if form === 'wish'}<label class="form-label">Priority (1 = first)<input inputmode="numeric" bind:value={priority} maxlength="6" required /></label><label class="form-label">Target month (optional)<input type="month" min="1900-01" max="9999-12" bind:value={targetMonth} /></label>{:else}<label class="form-label">Expected month<input type="month" min="1900-01" max="9999-12" bind:value={month} required /></label>{/if}<p class="form-help">Planning records do not change your income, expenses, or real account balances.</p>{#if formError}<p class="form-error" role="alert">{formError}</p>{/if}<button class="primary-button full-width" type="submit">{busy ? 'Saving…' : 'Save planning record'}<Icon name="check" size={17} /></button></fieldset></form></div></dialog>{/if}
{#if deletion}<dialog use:modal aria-labelledby="planning-delete-title" oncancel={(event) => { if (busy) event.preventDefault(); else deletion = null; }}><div class="dialog-content"><h2 id="planning-delete-title">Remove this planning record?</h2><p class="dialog-copy">“{deletion.name}” will be removed. This cannot be undone. Your real transactions and account balances stay unchanged.</p>{#if deleteError}<p class="form-error" role="alert">{deleteError}</p>{/if}<div class="dialog-actions"><button class="secondary-button" disabled={busy} onclick={() => deletion = null}>Keep record</button><button class="danger-button" disabled={busy} onclick={remove}>{busy ? 'Removing…' : 'Remove record'}</button></div></div></dialog>{/if}
