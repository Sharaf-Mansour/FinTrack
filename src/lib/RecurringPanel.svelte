<script lang="ts">
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { accountIds, accountLabels, bucketLabelForMonth, defaultCategories, isMonth, localDateTime, monthKey, parseAmount, parseNonNegativeAmount, spendingBucketsForMonth, type AccountId, type Entry, type Ledger, type RecurringExpense } from './finance';
  import { deleteRecurringExpense, recordRecurringPayment, recurringForMonth, saveRecurringExpense, undoRecurringPayment } from './recurring';

  let { ledger, month, busy, disabled, commit, getError, onedit }: {
    ledger: Ledger; month: string; busy: boolean; disabled: boolean;
    commit: (transform: (current: Ledger) => Ledger) => Promise<boolean>;
    getError: () => string; onedit: (entry: Entry) => void;
  } = $props();

  const money = (minor: number) => new Intl.NumberFormat('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  const rows = $derived(recurringForMonth(ledger, isMonth(month) ? month : localDateTime().slice(0, 7)));
  const pending = $derived(rows.filter(row => !row.payment));
  const pendingTotal = $derived(pending.reduce((sum, row) => sum + row.schedule.amountMinor, 0));
  const paidTotal = $derived(rows.reduce((sum, row) => sum + (row.entry?.amountMinor ?? 0), 0));
  const salaryRecorded = $derived(ledger.entries.some(entry => entry.kind === 'income' && entry.category.toLowerCase() === 'salary' && monthKey(entry.occurredAt) === month));
  let filter = $state<'all' | 'pending' | 'paid'>('all');
  const visible = $derived(rows.filter(row => filter === 'all' || (filter === 'paid' ? Boolean(row.payment) : !row.payment)));
  const categories = $derived([...new Set([...defaultCategories, ...ledger.entries.filter(entry => entry.kind === 'expense').map(entry => entry.category), ...ledger.recurringExpenses.map(schedule => schedule.category)])]);

  let form = $state<'schedule' | 'payment' | null>(null);
  let editing = $state<RecurringExpense | null>(null);
  let name = $state('');
  let amount = $state('');
  let remaining = $state('');
  let remainingEdited = $state(false);
  let category = $state('Bills');
  let account = $state<AccountId>('wallet');
  let bucket = $state('life');
  let startMonth = $state('');
  let endDate = $state('');
  let dueDay = $state('');
  let paymentMonth = $state('');
  let paidAt = $state('');
  let formError = $state('');
  let message = $state('');
  let deletion = $state<{ type: 'schedule' | 'payment'; id: string; name: string; amountMinor?: number } | null>(null);
  let deleteError = $state('');
  const formMonth = $derived(isMonth(form === 'payment' ? paymentMonth : startMonth) ? (form === 'payment' ? paymentMonth : startMonth) : localDateTime().slice(0, 7));
  const formBuckets = $derived(spendingBucketsForMonth(ledger, formMonth));

  function modal(node: HTMLDialogElement) { node.showModal(); return { destroy: () => node.close() }; }
  function openSchedule(schedule: RecurringExpense | null = null) {
    editing = schedule; name = schedule?.name ?? ''; amount = schedule ? (schedule.amountMinor / 100).toFixed(2) : '';
    remaining = schedule?.remainingMinor === undefined ? '' : (Math.max(0, schedule.remainingMinor) / 100).toFixed(2); remainingEdited = false;
    category = schedule?.category ?? 'Bills'; account = schedule?.account ?? 'wallet';
    startMonth = schedule?.startMonth ?? (isMonth(month) ? month : localDateTime().slice(0, 7));
    bucket = schedule ? schedule.bucket ?? '' : spendingBucketsForMonth(ledger, startMonth).find(item => item.id === 'life')?.id ?? 'unallocated';
    endDate = schedule?.endDate ?? ''; dueDay = schedule?.dueDay ? String(schedule.dueDay) : '';
    formError = ''; form = 'schedule';
  }
  function openPayment(schedule: RecurringExpense) {
    editing = schedule; name = schedule.name; amount = (schedule.amountMinor / 100).toFixed(2);
    category = schedule.category; account = schedule.account; bucket = schedule.bucket ?? '';
    paymentMonth = month; paidAt = localDateTime().slice(0, 7) === month ? localDateTime() : '';
    formError = ''; form = 'payment';
  }
  async function save(event: SubmitEvent) {
    event.preventDefault(); formError = '';
    try {
      const amountMinor = parseAmount(amount);
      if (!name.trim() || !category.trim()) throw new Error('Add a name and category.');
      if (form === 'schedule' && dueDay && !/^(?:[1-9]|[12]\d|3[01])$/.test(dueDay)) throw new Error('Due day must be between 1 and 31.');
      const remainingMinor = form === 'schedule' && remaining.trim() ? parseNonNegativeAmount(remaining) : undefined;
      const saved = await commit(current => {
        if (form === 'schedule') return saveRecurringExpense(current, { name: name.trim(), amountMinor, ...(remainingMinor !== undefined ? { remainingMinor } : {}), category: category.trim(), account, ...(bucket ? { bucket } : {}), startMonth, ...(endDate ? { endDate } : {}), ...(dueDay ? { dueDay: Number(dueDay) } : {}) }, editing?.id, !editing || remainingEdited);
        if (!editing) throw new Error('Choose a monthly payment.');
        return recordRecurringPayment(current, editing.id, paymentMonth, { amountMinor, note: name.trim(), category: category.trim(), account, ...(bucket ? { bucket } : {}), localTime: paidAt });
      });
      if (saved) { message = form === 'schedule' ? 'Monthly schedule saved. No spending has been recorded.' : 'Payment recorded as spending for this month.'; form = null; }
      else formError = getError() || 'Could not save. Try again.';
    } catch (error) { formError = error instanceof Error ? error.message : 'Check your payment details.'; }
  }
  async function remove() {
    if (!deletion) return;
    const target = deletion;
    if (await commit(current => target.type === 'schedule' ? deleteRecurringExpense(current, target.id) : undoRecurringPayment(current, target.id))) {
      message = target.type === 'schedule' ? 'Schedule removed. Recorded spending was kept.' : 'Payment undone. The linked spending entry was removed.';
      deletion = null;
    } else deleteError = getError() || 'Could not remove this record.';
  }
</script>

<div class="monthly-space" in:fade={{ duration: 180 }}>
  {#if message}<p class="finance-notice" role="status"><Icon name="check" size={17} />{message}</p>{/if}
  <section class="panel">
    <div class="section-heading"><div><h2>Payments for {month}</h2><p>{salaryRecorded ? 'Salary recorded' : 'No salary recorded'} · {pending.length} remaining</p></div><button class="primary-button small" disabled={disabled || busy} onclick={() => openSchedule()}><Icon name="plus" size={17} /> Add monthly payment</button></div>
    {#if rows.length}
      <div class="monthly-summary"><div><span>Remaining</span><strong>EGP {money(pendingTotal)}</strong></div><div><span>Paid</span><strong>EGP {money(paidTotal)}</strong></div><div><span>Completed</span><strong>{rows.length - pending.length} / {rows.length}</strong></div></div>
      <div class="monthly-filter"><div class="segmented" aria-label="Filter monthly payments">{#each ['all', 'pending', 'paid'] as option}<button class:selected={filter === option} aria-pressed={filter === option} onclick={() => filter = option as typeof filter}>{option === 'all' ? 'All' : option === 'pending' ? 'Remaining' : 'Paid'}</button>{/each}</div></div>
      {#if !visible.length}<div class="empty-state"><h3>No matching payments</h3></div>{:else}
        <div class="monthly-list">
          {#each visible as row (row.schedule.id)}
            <article class="monthly-row">
              <span class="monthly-status" class:paid={Boolean(row.payment)} aria-label={row.payment ? 'Paid' : 'Remaining'}><Icon name={row.payment ? 'check' : 'calendar'} size={18} /></span>
              <div class="monthly-description"><h3>{row.schedule.name}</h3><p>{row.payment ? 'Paid' : row.dueDate ? `Due ${row.dueDate}` : 'Due this month'} · {row.schedule.category} · {row.schedule.bucket ? bucketLabelForMonth(ledger, row.schedule.bucket, month) : 'Unclassified'} · {accountLabels[row.schedule.account]}</p><p>{row.schedule.endDate ? `Ends ${row.schedule.endDate}` : 'No end date'}</p>{#if row.entry}<p>Recorded {new Date(row.entry.occurredAt).toLocaleDateString('en-GB')} · {row.entry.bucket ? bucketLabelForMonth(ledger, row.entry.bucket, month) : 'Unclassified'}</p>{/if}</div>
              <div class="monthly-amount"><strong>EGP {money(row.entry?.amountMinor ?? row.schedule.amountMinor)}</strong><small>{row.payment ? 'Paid' : 'Planned'}</small>{#if row.schedule.remainingMinor !== undefined}<small>Current remaining EGP {money(Math.max(0, row.schedule.remainingMinor))}</small>{#if row.schedule.remainingMinor < 0}<small>Overpaid EGP {money(-row.schedule.remainingMinor)}</small>{/if}{/if}</div>
              <div class="monthly-actions">
                {#if row.payment && row.entry}<button class="secondary-button small" disabled={disabled || busy} onclick={() => { if (row.entry) onedit(row.entry); }}><Icon name="edit" size={15} /> Edit payment</button><button class="icon-button" title="Undo payment" aria-label={`Undo payment ${row.schedule.name}`} disabled={disabled || busy} onclick={() => { if (row.payment) deletion = { type: 'payment', id: row.payment.id, name: row.schedule.name, amountMinor: row.entry?.amountMinor }; deleteError = ''; }}><Icon name="close" size={17} /></button>
                {:else}<button class="primary-button small" disabled={disabled || busy} onclick={() => openPayment(row.schedule)}><Icon name="check" size={16} /> Record payment</button>{/if}
                <button class="icon-button" title="Edit schedule" aria-label={`Edit schedule ${row.schedule.name}`} disabled={disabled || busy} onclick={() => openSchedule(row.schedule)}><Icon name="edit" size={17} /></button>
                <button class="icon-button delete-button" title="Delete schedule" aria-label={`Delete schedule ${row.schedule.name}`} disabled={disabled || busy} onclick={() => { deletion = { type: 'schedule', id: row.schedule.id, name: row.schedule.name }; deleteError = ''; }}><Icon name="trash" size={17} /></button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    {:else}<div class="empty-state"><span class="empty-icon"><Icon name="calendar" size={28} /></span><h3>No payments for this month</h3><p>Add a recurring payment or choose a month with an existing schedule.</p><button class="text-button" disabled={disabled || busy} onclick={() => openSchedule()}>Add monthly payment <Icon name="plus" size={16} /></button></div>{/if}
    {#if ledger.recurringExpenses.length}<details class="plan-history"><summary>All schedules · {ledger.recurringExpenses.length}</summary>{#each [...ledger.recurringExpenses].sort((first, second) => first.name.localeCompare(second.name)) as schedule (schedule.id)}<div class="monthly-schedule"><div><strong>{schedule.name}</strong><small>EGP {money(schedule.amountMinor)} · {schedule.startMonth}{schedule.endDate ? ` to ${schedule.endDate}` : ' onward (no end date)'}{schedule.remainingMinor !== undefined ? ` · Remaining EGP ${money(Math.max(0, schedule.remainingMinor))}` : ''}{schedule.remainingMinor !== undefined && schedule.remainingMinor < 0 ? ` · Overpaid EGP ${money(-schedule.remainingMinor)}` : ''}</small></div><div><button class="icon-button" title="Edit schedule" aria-label={`Edit schedule ${schedule.name} from all schedules`} disabled={disabled || busy} onclick={() => openSchedule(schedule)}><Icon name="edit" size={16} /></button><button class="icon-button delete-button" title="Delete schedule" aria-label={`Delete schedule ${schedule.name} from all schedules`} disabled={disabled || busy} onclick={() => { deletion = { type: 'schedule', id: schedule.id, name: schedule.name }; deleteError = ''; }}><Icon name="trash" size={16} /></button></div></div>{/each}</details>{/if}
  </section>
</div>

{#if form}
  <dialog use:modal aria-labelledby="monthly-form-title" oncancel={(event) => { if (busy) event.preventDefault(); else form = null; }}>
    <div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">MONTHLY SPENDING</p><h2 id="monthly-form-title">{form === 'payment' ? `Record payment for ${paymentMonth}` : editing ? 'Edit monthly payment' : 'Add monthly payment'}</h2></div><button class="icon-button" title="Close" aria-label="Close monthly spending form" disabled={busy} onclick={() => form = null}><Icon name="close" /></button></div>
      <form onsubmit={save}><fieldset disabled={busy}>
        <label class="form-label">{form === 'payment' ? 'Spending description' : 'Payment name'}<input bind:value={name} maxlength="120" placeholder="e.g. Rent" required /></label>
        <label class="form-label">Amount (EGP)<input inputmode="decimal" bind:value={amount} maxlength="13" placeholder="0.00" required /></label>
        {#if form === 'schedule'}<label class="form-label">Remaining amount (EGP, optional)<input inputmode="decimal" bind:value={remaining} oninput={() => remainingEdited = true} maxlength="13" placeholder="Not tracked" /></label>{/if}
        <label class="form-label">Category<input list="monthly-categories" bind:value={category} maxlength="60" required /><datalist id="monthly-categories">{#each categories as item}<option value={item}></option>{/each}</datalist></label>
        <label class="form-label">Account<select bind:value={account}>{#each accountIds as id}<option value={id}>{accountLabels[id]}</option>{/each}</select></label>
        {#if form === 'schedule'}<div class="monthly-date-grid"><label class="form-label">Starting month<input type="month" min="1900-01" max="9999-12" bind:value={startMonth} required /></label><label class="form-label">End date (optional)<input type="date" min={isMonth(startMonth) ? `${startMonth}-01` : '1900-01-01'} max="9999-12-31" bind:value={endDate} /></label></div><label class="form-label">Due day (optional)<input inputmode="numeric" bind:value={dueDay} maxlength="2" placeholder="1 to 31" /></label><p class="form-help">Leave the end date blank for an ongoing payment. A payment due after an end date will not appear in that final month.</p>{:else}<label class="form-label">Actual payment date &amp; time<input type="datetime-local" bind:value={paidAt} required /></label><p class="form-help">Choose a date in {paymentMonth}.</p>{/if}
        <label class="form-label">Budget bucket<select bind:value={bucket}><option value="">Unclassified</option>{#if bucket && !formBuckets.some(item => item.id === bucket)}<option value={bucket}>{bucketLabelForMonth(ledger, bucket, formMonth)} (removed)</option>{/if}{#each formBuckets as item (item.id)}<option value={item.id}>{item.name}</option>{/each}</select></label>
        {#if form === 'schedule'}<p class="form-help">Saving a schedule does not create an expense. Recorded payments keep their original details when this schedule changes.</p>{/if}
        {#if formError}<p class="form-error" role="alert">{formError}</p>{/if}<button class="primary-button full-width" type="submit">{busy ? 'Saving…' : form === 'payment' ? 'Record spending' : 'Save schedule'}<Icon name="check" size={17} /></button>
      </fieldset></form>
    </div>
  </dialog>
{/if}

{#if deletion}<dialog use:modal aria-labelledby="monthly-delete-title" oncancel={(event) => { if (busy) event.preventDefault(); else deletion = null; }}><div class="dialog-content"><h2 id="monthly-delete-title">{deletion.type === 'schedule' ? 'Delete this schedule?' : 'Undo this payment?'}</h2><p class="dialog-copy">{deletion.type === 'schedule' ? `“${deletion.name}” will no longer appear as a monthly task. All recorded spending will remain in your activity.` : `The EGP ${money(deletion.amountMinor ?? 0)} spending entry for “${deletion.name}” will be deleted and the task will be marked remaining.`}</p>{#if deleteError}<p class="form-error" role="alert">{deleteError}</p>{/if}<div class="dialog-actions"><button class="secondary-button" disabled={busy} onclick={() => deletion = null}>Cancel</button><button class="danger-button" disabled={busy} onclick={remove}>{busy ? 'Removing…' : deletion.type === 'schedule' ? 'Delete schedule' : 'Undo payment'}</button></div></div></dialog>{/if}