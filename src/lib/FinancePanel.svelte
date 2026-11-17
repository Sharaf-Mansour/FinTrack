<script lang="ts">
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import {
    accountBalances, accountIds, accountLabels, addAllocationPlan, allocationsForMonth, budgetForMonth,
    bucketLabelForMonth, isMonth, localDateTime, monthKey, occurrenceTime, parseAmount, parsePercent, spendingBucketsForMonth,
    type AccountId, type Entry, type Ledger, type OpeningBalance, type Transfer
  } from './finance';
  import { recurringForMonth, saveRecurringExpense } from './recurring';

  let { ledger, month, busy, disabled, commit, getError, onedit, onreview, onmonthly }: {
    ledger: Ledger; month: string; busy: boolean; disabled: boolean;
    commit: (transform: (current: Ledger) => Ledger) => Promise<boolean>;
    getError: () => string;
    onedit: (entry: Entry) => void; onreview: () => void; onmonthly: () => void;
  } = $props();
  const money = (minor: number) => new Intl.NumberFormat('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  const date = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const budget = $derived(budgetForMonth(ledger, month));
  const spendingBuckets = $derived(spendingBucketsForMonth(ledger, month));
  const removedBuckets = $derived(Object.keys(budget.spent).filter(id => id !== 'unclassified' && budget.spent[id] > 0 && !spendingBuckets.some(bucket => bucket.id === id)));
  const monthlyPayments = $derived(isMonth(month) ? recurringForMonth(ledger, month) : []);
  const endOfMonth = $derived.by(() => {
    if (!/^\d{4}-\d\d$/.test(month)) return new Date().toISOString();
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m, 1, 0, 0, 0, -1).toISOString();
  });
  const balances = $derived(accountBalances(ledger, endOfMonth));
  let account = $state<AccountId>('wallet');
  let limit = $state(30);
  let message = $state('');
  let planOpen = $state(false);
  let effectiveMonth = $state('');
  let allocationDraft = $state<{ id: string; name: string; percent: string }[]>([]);
  let planError = $state('');
  const remainder = $derived(100 - allocationDraft.reduce((sum, allocation) => sum + Number(allocation.percent), 0));
  let form = $state<'transfer' | 'opening' | null>(null);
  let editingTransfer = $state<Transfer | null>(null);
  let openingId = $state<string | undefined>();
  let from = $state<AccountId>('wallet');
  let to = $state<AccountId>('savings');
  let openingAccount = $state<AccountId>('wallet');
  let amount = $state('');
  let note = $state('');
  let occurredAt = $state(localDateTime());
  let formError = $state('');
  let deleting = $state<Transfer | null>(null);
  let deleteError = $state('');
  const history = $derived([
    ...ledger.entries.filter(e => (e.account ?? 'wallet') === account && monthKey(e.occurredAt) === month).map(e => ({ id: e.id, type: 'entry' as const, at: e.occurredAt, label: e.note, detail: `${e.kind === 'income' ? 'Income' : 'Spending'} · ${e.category}`, amount: e.kind === 'income' ? e.amountMinor : -e.amountMinor, source: e })),
    ...ledger.transfers.filter(t => (t.from === account || t.to === account) && monthKey(t.occurredAt) === month).map(t => ({ id: t.id, type: 'transfer' as const, at: t.occurredAt, label: t.note, detail: `${accountLabels[t.from]} → ${accountLabels[t.to]}`, amount: t.to === account ? t.amountMinor : -t.amountMinor, source: t })),
    ...ledger.openings.filter(o => o.account === account && monthKey(o.occurredAt) === month).map(o => ({ id: o.id, type: 'opening' as const, at: o.occurredAt, label: 'Opening balance', detail: 'Starting funds · excluded from income', amount: o.amountMinor, source: o }))
  ].sort((a, b) => b.at.localeCompare(a.at)));
  function modal(node: HTMLDialogElement) { node.showModal(); return { destroy: () => node.close() }; }
  function openPlan() {
    allocationDraft = allocationsForMonth(ledger, month).map(allocation => ({ id: allocation.id, name: allocation.name, percent: String(allocation.share / 100) }));
    effectiveMonth = month; planError = ''; planOpen = true; message = '';
  }
  function addAllocation(account?: 'savings' | 'investment') {
    allocationDraft = [...allocationDraft, { id: account ?? crypto.randomUUID(), name: account ? accountLabels[account] : '', percent: '0' }];
  }
  async function savePlan(event: SubmitEvent) {
    event.preventDefault(); planError = '';
    try {
      const allocations = allocationDraft.map(allocation => ({ id: allocation.id, name: allocation.name, share: parsePercent(allocation.percent) }));
      if (await commit(current => addAllocationPlan(current, effectiveMonth, allocations))) { planOpen = false; message = 'Plan version saved. No money was moved.'; }
      else planError = getError() || 'Could not save this plan. Try again.';
    } catch (e) { planError = e instanceof Error ? e.message : 'Check your percentages.'; }
  }
  async function assignBucket(scheduleId: string, nextBucket: string, select: HTMLSelectElement) {
    const previous = ledger.recurringExpenses.find(schedule => schedule.id === scheduleId)?.bucket ?? '';
    const saved = await commit(current => {
      const schedule = current.recurringExpenses.find(item => item.id === scheduleId);
      if (!schedule) throw new Error('This monthly schedule was deleted in another tab.');
      const draft = { ...schedule };
      if (nextBucket) draft.bucket = nextBucket; else delete draft.bucket;
      return saveRecurringExpense(current, draft, scheduleId);
    });
    if (saved) message = 'Monthly payment bucket updated. Recorded spending was not changed.';
    else select.value = previous;
  }
  function openTransfer(t: Transfer | null = null) {
    editingTransfer = t; from = t?.from ?? 'wallet'; to = t?.to ?? 'savings';
    amount = t ? (t.amountMinor / 100).toFixed(2) : ''; note = t?.note ?? '';
    occurredAt = localDateTime(t ? new Date(t.occurredAt) : new Date()); formError = ''; form = 'transfer';
  }
  function openOpening(target: AccountId) {
    const opening = ledger.openings.find(o => o.account === target);
    openingId = opening?.id; openingAccount = target;
    amount = opening ? (opening.amountMinor / 100).toFixed(2) : '';
    occurredAt = localDateTime(opening ? new Date(opening.occurredAt) : new Date()); formError = ''; form = 'opening';
  }
  async function saveMovement(event: SubmitEvent) {
    event.preventDefault(); formError = '';
    try {
      const amountMinor = form === 'opening' && /^0{1,10}(\.0{1,2})?$/.test(amount.trim()) ? 0 : parseAmount(amount);
      const now = new Date().toISOString();
      const editingId = editingTransfer?.id;
      const saved = await commit(current => {
        if (form === 'transfer') {
          if (from === to) throw new Error('Choose two different accounts.');
          if (!note.trim()) throw new Error('Add a transfer description.');
          const existing = editingId ? current.transfers.find(t => t.id === editingId) : undefined;
          if (editingTransfer && !existing) throw new Error('This transfer was deleted in another tab.');
          const transfer: Transfer = { id: existing?.id ?? crypto.randomUUID(), from, to, amountMinor, note: note.trim(), occurredAt: occurrenceTime(occurredAt, existing?.occurredAt), createdAt: existing?.createdAt ?? now, updatedAt: now };
          return { ...current, transfers: [...current.transfers.filter(t => t.id !== transfer.id), transfer] };
        }
        const existing = current.openings.find(o => o.account === openingAccount);
        if (existing?.id !== openingId) throw new Error('This opening balance changed in another tab. Reopen the form.');
        const opening: OpeningBalance = { id: existing?.id ?? crypto.randomUUID(), account: openingAccount, amountMinor, occurredAt: occurrenceTime(occurredAt, existing?.occurredAt), createdAt: existing?.createdAt ?? now, updatedAt: now };
        return { ...current, openings: [...current.openings.filter(o => o.account !== openingAccount), opening] };
      });
      if (saved) { message = form === 'transfer' ? 'Transfer saved. Income and spending totals are unchanged.' : 'Opening balance saved. This is starting money, not income.'; form = null; }
      else formError = getError() || 'Could not save. Try again.';
    } catch (e) { formError = e instanceof Error ? e.message : 'Check the amount and date.'; }
  }
  async function removeTransfer() {
    if (!deleting) return;
    const id = deleting.id;
    if (await commit(current => ({ ...current, transfers: current.transfers.filter(t => t.id !== id) }))) { deleting = null; message = 'Transfer deleted. Both account balances have been recalculated.'; }
    else deleteError = getError() || 'Could not delete. Try again.';
  }
</script>

<div class="finance-space" in:fade={{ duration: 180 }}>
  {#if message}<p class="finance-notice" role="status"><Icon name="check" size={17} />{message}</p>{/if}
  <section class="panel">
    <div class="section-heading"><div><h2>Your allocation plan</h2><p>Based on this month’s actual income. Suggestions only — you control the transfers.</p></div><button class="secondary-button small" disabled={disabled || busy} onclick={openPlan}><Icon name="edit" size={16} /> Edit plan</button></div>
    <div class="allocation-list">
      {#each spendingBuckets as bucket (bucket.id)}
        {@const spent = budget.spent[bucket.id] ?? 0}
        {@const target = budget.targets[bucket.id] ?? 0}
        <div class="allocation-row"><div><strong>{bucket.name}</strong><small>{bucket.share / 100}% of income · Monthly spending limit</small></div><div class="allocation-numbers"><strong>EGP {money(target)}</strong><small class:budget-warning={spent > target}>{money(spent)} spent · {spent > target ? `${money(spent - target)} over` : `${money(target - spent)} left`}</small></div></div>
      {/each}
      {#each removedBuckets as bucket (bucket)}
        <div class="allocation-row"><div><strong>{bucketLabelForMonth(ledger, bucket, month)}</strong><small>Removed allocation · Spending retained</small></div><div class="allocation-numbers"><strong>EGP {money(budget.spent[bucket])}</strong><small>spent</small></div></div>
      {/each}
      {#each budget.allocations.filter(allocation => allocation.id === 'savings' || allocation.id === 'investment') as allocation (allocation.id)}
        {@const key = allocation.id as 'savings' | 'investment'}
        <div class="allocation-row"><div><strong>{allocation.name}</strong><small>{allocation.share / 100}% of income · {accountLabels[key]} net contribution target</small></div><div class="allocation-numbers"><strong>EGP {money(budget.targets[key])}</strong><small>{money(budget.netAdded[key])} net added · {budget.netAdded[key] >= budget.targets[key] ? 'Target met' : `${money(budget.targets[key] - budget.netAdded[key])} to go`}</small></div></div>
      {/each}
    </div>
    <div class="finance-policy"><p>Budget limits start fresh each month. Account balances carry forward. Allocation amounts include every piastre; any rounding remainder is distributed consistently.</p><p>Savings and investment progress uses net transfers + direct income − direct spending; opening balances are excluded.</p>{#if budget.spent.unclassified > 0}<p class="budget-warning">EGP {money(budget.spent.unclassified)} of spending has no budget bucket. It is included in total spending, but needs your review before it can be compared with a limit.</p><button class="text-button" onclick={onreview}>Review spending in Activity <Icon name="chevron" size={15} /></button>{/if}</div>
    {#if ledger.plans.length}<details class="plan-history"><summary>Plan history · {ledger.plans.length} versions</summary>{#each [...ledger.plans].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.revision - a.revision) as plan (plan.id)}<p><strong>{plan.effectiveMonth} · revision {plan.revision}</strong><span>{plan.allocations.map(allocation => `${allocation.name} ${allocation.share / 100}%`).join(' / ') || 'No allocations'}</span><small>Saved {date(plan.createdAt)}</small></p>{/each}</details>{/if}
  </section>

  <section class="panel">
    <div class="section-heading"><div><h2>Monthly spending buckets</h2><p>Choose the default bucket for each monthly payment.</p></div><button class="secondary-button small" onclick={onmonthly}><Icon name="calendar" size={16} /> Monthly spending</button></div>
    {#if !monthlyPayments.length}<div class="empty-state"><h3>No monthly payments for {month}</h3><button class="text-button" onclick={onmonthly}>Manage monthly spending <Icon name="chevron" size={15} /></button></div>{:else}
      <div class="monthly-bucket-list">{#each monthlyPayments as row (row.schedule.id)}<div class="monthly-bucket-row"><div><strong>{row.schedule.name}</strong><small>EGP {money(row.entry?.amountMinor ?? row.schedule.amountMinor)} · {row.payment ? 'Paid' : 'Remaining'}{row.entry ? ` · Recorded in ${row.entry.bucket ? bucketLabelForMonth(ledger, row.entry.bucket, month) : 'Unclassified'}` : ''}</small></div><label class="form-label"><span class="sr-only">Budget bucket for {row.schedule.name}</span><select value={row.schedule.bucket ?? ''} disabled={disabled || busy} onchange={(event) => assignBucket(row.schedule.id, event.currentTarget.value, event.currentTarget)}><option value="">Unclassified</option>{#if row.schedule.bucket && !spendingBuckets.some(bucket => bucket.id === row.schedule.bucket)}<option value={row.schedule.bucket}>{bucketLabelForMonth(ledger, row.schedule.bucket, month)} (removed)</option>{/if}{#each spendingBuckets as bucket (bucket.id)}<option value={bucket.id}>{bucket.name}</option>{/each}</select></label></div>{/each}</div>
    {/if}
  </section>

  <section aria-labelledby="accounts-heading"><div class="accounts-heading"><div><h2 id="accounts-heading">Your accounts</h2><p>Running balances through the end of {month || 'the selected month'}, including earlier months.</p></div><button class="primary-button small" disabled={disabled || busy} onclick={() => openTransfer()}><Icon name="plus" size={17} /> Transfer</button></div><div class="account-grid">{#each accountIds as id}<article class="panel account-card" class:chosen={account === id}><span class="stat-icon" class:income={id === 'savings'} class:expense={id === 'investment'}><Icon name={id === 'wallet' ? 'wallet' : id === 'savings' ? 'leaf' : 'spark'} /></span><h3>{accountLabels[id]}</h3><p class="account-value" class:budget-warning={balances[id] < 0}><small>EGP</small> {money(balances[id])}</p>{#if balances[id] < 0}<p class="negative-note">Negative balance — check starting funds and recorded movements.</p>{/if}<button class="text-button" disabled={disabled || busy} onclick={() => openOpening(id)}>{ledger.openings.some(o => o.account === id) ? 'Edit starting funds' : 'Set starting funds'} <Icon name="edit" size={13} /></button><button class="secondary-button small" aria-pressed={account === id} onclick={() => { account = id; limit = 30; }}>View ledger</button></article>{/each}</div></section>

  <section class="panel"><div class="section-heading"><div><h2>{accountLabels[account]} ledger</h2><p>{month} · {history.length} movements. Transfers never count as income or spending.</p></div></div>{#if !history.length}<div class="empty-state"><span class="empty-icon"><Icon name="wallet" size={28} /></span><h3>No movements this month</h3><p>Record income, spending or a transfer. Set starting funds only for money you held before tracking.</p></div>{:else}<div class="entry-list">{#each history.slice(0, limit) as item (item.id)}<article class="entry-row"><span class="entry-icon"><Icon name={item.type === 'transfer' ? 'up' : 'wallet'} size={18} /></span><div class="entry-description"><h3>{item.label}</h3><p>{item.detail}</p><p>{date(item.at)}</p></div><span class="entry-amount" class:positive={item.amount > 0}>{item.amount >= 0 ? '+' : '−'}{money(Math.abs(item.amount))}<small>EGP</small></span><div class="entry-actions"><button class="icon-button" aria-label={`Edit ${item.label}`} disabled={disabled || busy} onclick={() => { if (item.type === 'entry') onedit(item.source); else if (item.type === 'transfer') openTransfer(item.source); else openOpening(item.source.account); }}><Icon name="edit" size={16} /></button>{#if item.type === 'transfer'}<button class="icon-button delete-button" aria-label={`Delete transfer ${item.label}`} disabled={disabled || busy} onclick={() => { deleting = item.source; deleteError = ''; }}><Icon name="trash" size={16} /></button>{/if}</div></article>{/each}</div>{#if history.length > limit}<button class="more-entries" onclick={() => limit += 30}>Show more movements</button>{/if}{/if}</section>
</div>

{#if planOpen}
  <dialog use:modal aria-labelledby="plan-title" oncancel={(event) => { if (busy) event.preventDefault(); else planOpen = false; }}>
    <div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">GIVE EVERY PIASTRE A PURPOSE</p><h2 id="plan-title">Edit your allocations</h2></div><button class="icon-button" aria-label="Close allocation form" disabled={busy} onclick={() => planOpen = false}><Icon name="close" /></button></div>
      <form onsubmit={savePlan}><fieldset disabled={busy}>
        <label class="form-label">Effective from month<input type="month" min="1900-01" max="9999-12" bind:value={effectiveMonth} required /></label>
        <p class="form-help">Changes apply from this month until the next plan. Removing an allocation keeps its past spending.</p>
        <div class="allocation-editor-list">
          {#each allocationDraft as allocation (allocation.id)}
            <div class="allocation-editor-row">
              <label class="form-label">{allocation.id === 'savings' ? 'Savings target' : allocation.id === 'investment' ? 'Investment target' : 'Spending bucket'}<input aria-label={`Name for ${allocation.name || 'new allocation'}`} bind:value={allocation.name} maxlength="60" required /></label>
              <label class="form-label">Percent<input aria-label={`Percentage for ${allocation.name || 'new allocation'}`} inputmode="decimal" bind:value={allocation.percent} required /></label>
              <button type="button" class="icon-button delete-button" title="Remove allocation" aria-label={`Remove ${allocation.name || 'new allocation'}`} onclick={() => allocationDraft = allocationDraft.filter(item => item.id !== allocation.id)}><Icon name="trash" size={17} /></button>
            </div>
          {/each}
        </div>
        <div class="allocation-editor-actions">
          <button type="button" class="secondary-button small" disabled={allocationDraft.length >= 100} onclick={() => addAllocation()}><Icon name="plus" size={16} /> Add allocation</button>
          {#if !allocationDraft.some(allocation => allocation.id === 'savings')}<button type="button" class="text-button" onclick={() => addAllocation('savings')}>Add savings target</button>{/if}
          {#if !allocationDraft.some(allocation => allocation.id === 'investment')}<button type="button" class="text-button" onclick={() => addAllocation('investment')}>Add investment target</button>{/if}
        </div>
        <p class="finance-notice" class:budget-warning={!Number.isFinite(remainder) || remainder < 0}>{Number.isFinite(remainder) ? remainder.toFixed(2) : '—'}% unallocated</p>
        {#if planError}<p class="form-error" role="alert">{planError}</p>{/if}<button class="primary-button full-width" type="submit">{busy ? 'Saving…' : 'Save plan version'}<Icon name="check" size={17} /></button>
      </fieldset></form>
    </div>
  </dialog>
{/if}
{#if form}<dialog use:modal aria-labelledby="movement-title" oncancel={(event) => { if (busy) event.preventDefault(); else form = null; }}><div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">KEEP YOUR ACCOUNTS IN STEP</p><h2 id="movement-title">{form === 'transfer' ? editingTransfer ? 'Edit transfer' : 'Move between accounts' : `${accountLabels[openingAccount]} starting funds`}</h2></div><button class="icon-button" aria-label="Close account form" disabled={busy} onclick={() => form = null}><Icon name="close" /></button></div><form onsubmit={saveMovement}><fieldset disabled={busy}>{#if form === 'transfer'}<label class="form-label">From account<select bind:value={from}>{#each accountIds as id}<option value={id}>{accountLabels[id]}</option>{/each}</select></label><label class="form-label">To account<select bind:value={to}>{#each accountIds as id}<option value={id}>{accountLabels[id]}</option>{/each}</select></label><label class="form-label">Description<input bind:value={note} maxlength="300" placeholder="e.g. Put this month’s savings aside" required /></label>{:else}<p class="form-help">Money already held before your tracked transactions. This is added once to your account balance, and never counted as income. Use 0.00 to clear it. Don’t include income already recorded in the app.</p>{/if}<label class="form-label">Amount (EGP)<input inputmode="decimal" bind:value={amount} maxlength="13" placeholder="0.00" required /></label><label class="form-label">{form === 'transfer' ? 'Date & time' : 'Starting date & time'}<input type="datetime-local" bind:value={occurredAt} required /></label><p class="form-help">{form === 'transfer' ? 'This records a transfer you made; it does not move money at your bank. Negative account balances are allowed and flagged for review.' : 'The opening amount takes effect at this time. Earlier account movements are still counted; this does not replace your account’s recorded history.'}</p>{#if formError}<p class="form-error" role="alert">{formError}</p>{/if}<button class="primary-button full-width" type="submit">{busy ? 'Saving…' : form === 'transfer' ? 'Save transfer' : 'Save starting funds'}<Icon name="check" size={17} /></button></fieldset></form></div></dialog>{/if}
{#if deleting}<dialog use:modal aria-labelledby="transfer-delete-title" oncancel={(event) => { if (busy) event.preventDefault(); else deleting = null; }}><div class="dialog-content"><h2 id="transfer-delete-title">Delete this transfer?</h2><p class="dialog-copy">{deleting.note} · EGP {money(deleting.amountMinor)}. This removes both sides of the transfer and recalculates balances. It can’t be undone.</p>{#if deleteError}<p class="form-error" role="alert">{deleteError}</p>{/if}<div class="dialog-actions"><button class="secondary-button" disabled={busy} onclick={() => deleting = null}>Keep transfer</button><button class="danger-button" disabled={busy} onclick={removeTransfer}>{busy ? 'Deleting…' : 'Delete transfer'}</button></div></div></dialog>{/if}
