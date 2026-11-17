<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { registerSW } from 'virtual:pwa-register';
  import Icon from './lib/Icon.svelte';
  import FinancePanel from './lib/FinancePanel.svelte';
  import TrendsPanel from './lib/TrendsPanel.svelte';
  import PlanningPanel from './lib/PlanningPanel.svelte';
  import InvestmentsPanel from './lib/InvestmentsPanel.svelte';
  import RecurringPanel from './lib/RecurringPanel.svelte';
  import { accountIds, accountLabels, bucketLabelForMonth, defaultCategories, emptyLedger, isMonth, localDateTime, mergeLedgers, monthKey, occurrenceTime, parseAmount, spendingBucketsForMonth, totals, validateLedger, type AccountId, type BudgetBucket, type Entry, type EntryKind, type Ledger } from './lib/finance';
  import { recurringForMonth } from './lib/recurring';
  import { loadLedger, updateLedger } from './lib/storage';

  type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
  let ledger = $state<Ledger>(emptyLedger());
  let loaded = $state(false);
  let storageError = $state(false);
  let busy = $state(false);
  let page = $state<'overview' | 'activity' | 'monthly' | 'finance' | 'trends' | 'planning' | 'investments' | 'backup'>('overview');
  let month = $state(localDateTime().slice(0, 7));
  let search = $state('');
  let filter = $state<'all' | EntryKind>('all');
  let error = $state('');
  let toast = $state('');
  let online = $state(navigator.onLine);
  let offlineReady = $state(false);
  let updateReady = $state(false);
  let installEvent = $state<InstallEvent | null>(null);
  let installed = $state(matchMedia('(display-mode: standalone)').matches);
  let showForm = $state(false);
  let editing = $state<Entry | null>(null);
  let kind = $state<EntryKind>('expense');
  let amount = $state('');
  let note = $state('');
  let category = $state(defaultCategories[0]);
  let incomeCategory = $state('Salary');
  let occurredAt = $state(localDateTime());
  let formError = $state('');
  let entryAccount = $state<AccountId>('wallet');
  let entryBucket = $state<BudgetBucket | ''>('life');
  let unclassifiedOnly = $state(false);
  let importError = $state('');
  let deleteTarget = $state<Entry | null>(null);
  let imported = $state<Ledger | null>(null);
  let importMode = $state<'merge' | 'replace'>('merge');
  let lastBackup = $state('');
  let channel: BroadcastChannel | undefined;
  let toastTimeout: ReturnType<typeof setTimeout>;
  const money = (minor: number) => new Intl.NumberFormat('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const monthLabel = $derived(new Date(`${month || localDateTime().slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  const monthly = $derived(ledger.entries.filter(e => monthKey(e.occurredAt) === month));
  const summary = $derived(totals(monthly));
  const visible = $derived(monthly.filter(e => (!unclassifiedOnly || (e.kind === 'expense' && !e.bucket)) && (filter === 'all' || e.kind === filter) && `${e.note} ${e.category}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
  const categories = $derived([...new Set([...defaultCategories, ...ledger.entries.filter(e => e.kind === 'expense').map(e => e.category)])]);
  const incomeCategories = $derived([...new Set(['Salary', 'Freelance', 'Business', 'Bonus', 'Gift', 'Other', ...ledger.entries.filter(e => e.kind === 'income').map(e => e.category)])]);
  const entryMonth = $derived(isMonth(occurredAt.slice(0, 7)) ? occurredAt.slice(0, 7) : month);
  const entryBuckets = $derived(spendingBucketsForMonth(ledger, entryMonth));
  const used = $derived(summary.income > 0 ? Math.round(summary.expenses / summary.income * 100) : 0);
  const categoryIcon = (e: Entry) => e.kind === 'income' ? 'down' : ({ 'Food & drinks': 'food', 'Transport': 'transport', 'Shopping': 'bag', 'Fun': 'spark' }[e.category] ?? 'wallet');

  function notify(message: string) { toast = message; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast = '', 5000); }
  function modal(node: HTMLDialogElement) { node.showModal(); return { destroy: () => node.close() }; }
  function startEntry(nextKind: EntryKind, entry: Entry | null = null) {
    entryAccount = entry?.account ?? 'wallet';
    editing = entry; kind = nextKind; amount = entry ? (entry.amountMinor / 100).toFixed(2) : '';
    note = entry?.note ?? ''; category = entry?.kind === 'expense' ? entry.category : defaultCategories[0];
    incomeCategory = entry?.kind === 'income' ? entry.category : 'Salary';
    occurredAt = localDateTime(entry ? new Date(entry.occurredAt) : new Date());
    entryBucket = entry ? entry.bucket ?? '' : spendingBucketsForMonth(ledger, occurredAt.slice(0, 7)).find(bucket => bucket.id === 'life')?.id ?? 'unallocated';
    formError = ''; showForm = true;
  }
  async function mutate(transform: (current: Ledger) => Ledger): Promise<boolean> {
    if (busy || !loaded || storageError) return false;
    busy = true; error = '';
    try {
      ledger = await updateLedger(transform);
      channel?.postMessage('changed'); return true;
    } catch (e) { error = e instanceof Error ? e.message : 'Could not save. Your existing data has been kept.'; return false; }
    finally { busy = false; }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault(); formError = '';
    try {
      const amountMinor = parseAmount(amount);
      if (!note.trim()) throw new Error('Add a short description.');
      if (!(kind === 'income' ? incomeCategory : category).trim()) throw new Error('Choose or add a category.');
      const date = new Date(occurredAt);
      if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid date and time.');
      const now = new Date().toISOString();
      const entry: Entry = { id: editing?.id ?? crypto.randomUUID(), kind, amountMinor, note: note.trim(), category: (kind === 'income' ? incomeCategory : category).trim(), occurredAt: occurrenceTime(occurredAt, editing?.occurredAt), createdAt: editing?.createdAt ?? now, updatedAt: now, account: entryAccount, ...(kind === 'expense' && entryBucket ? { bucket: entryBucket } : {}) };
      const saved = await mutate(current => {
        if (editing && !current.entries.some(e => e.id === entry.id)) throw new Error('This entry was deleted in another tab. Close this form and try again.');
        return { ...current, entries: [...current.entries.filter(e => e.id !== entry.id), entry] };
      });
      if (saved) {
        showForm = false; month = monthKey(entry.occurredAt);
        const pending = !editing && entry.kind === 'income' && entry.category.toLowerCase() === 'salary' ? recurringForMonth(ledger, month).filter(row => !row.payment).length : 0;
        if (pending) { page = 'monthly'; notify(`Salary added. ${pending} monthly ${pending === 1 ? 'payment is' : 'payments are'} remaining.`); }
        else notify(editing ? 'Entry updated.' : kind === 'income' ? 'Income added.' : 'Spending recorded.');
      }
      else formError = error || 'Could not save. Try again.';
    } catch (e) { formError = e instanceof Error ? e.message : 'Check your entry.'; }
  }
  async function removeEntry() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    if (await mutate(current => ({ ...current, entries: current.entries.filter(e => e.id !== id), recurringPayments: current.recurringPayments.filter(payment => payment.entryId !== id) }))) { deleteTarget = null; notify('Entry deleted.'); }
  }
  async function exportData() {
    try {
    const current = await loadLedger();
    ledger = current;
    const blob = new Blob([JSON.stringify({ ...ledger, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `fintrack-backup-${localDateTime().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); lastBackup = new Date().toLocaleString(); notify('Backup download started. Keep the file somewhere safe.');
    } catch (e) { error = e instanceof Error ? e.message : 'Could not export your records.'; }
  }
  async function readImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a backup smaller than 20 MB.');
      imported = validateLedger(JSON.parse(await file.text())); importMode = 'merge'; importError = '';
    } catch (e) { error = e instanceof Error ? e.message : 'Could not read this backup.'; }
    input.value = '';
  }
  async function restoreData() {
    if (!imported) return;
    const backup = imported;
    if (await mutate(current => {
      if (importMode === 'replace') return backup;
      return mergeLedgers(current, backup);
    })) { imported = null; notify('Backup imported successfully.'); }
    else importError = error || 'Could not import this backup.';
  }
  async function install() {
    if (!installEvent) return;
    await installEvent.prompt(); await installEvent.userChoice; installEvent = null;
  }
  const updateSW = registerSW({ onOfflineReady() { offlineReady = true; }, onNeedRefresh() { updateReady = true; }, onRegisterError() { error = 'Offline setup did not finish. Reopen the app while online to retry.'; } });
  onMount(() => {
    loadLedger().then(data => { ledger = data; loaded = true; }).catch(() => { storageError = true; error = 'Local storage could not be opened. Close other tabs or check browser storage permissions, then reload. No data has been overwritten.'; });
    navigator.serviceWorker?.ready.then(registration => { if (registration.active) offlineReady = true; }).catch(() => { offlineReady = false; });
    // An existing controlling worker means this app shell was previously installed.
    if (navigator.serviceWorker?.controller) offlineReady = true;
    const connection = () => online = navigator.onLine;
    const beforeInstall = (event: Event) => { event.preventDefault(); installEvent = event as InstallEvent; };
    const afterInstall = () => { installed = true; installEvent = null; notify('FinTrack installed. Make yourself at home.'); };
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', beforeInstall); window.addEventListener('appinstalled', afterInstall);
    if ('BroadcastChannel' in window) { channel = new BroadcastChannel('fintrack'); channel.onmessage = () => loadLedger().then(data => ledger = data).catch(() => error = 'Could not refresh data from another tab. Reload to try again.'); }
    return () => { clearTimeout(toastTimeout); channel?.close(); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', afterInstall); };
  });
</script>

<svelte:head><title>{page === 'backup' ? 'Backup' : page === 'trends' ? 'Trends' : page === 'investments' ? 'Investments' : page === 'planning' ? 'Wishlist' : page === 'finance' ? 'Plan & accounts' : page === 'monthly' ? 'Monthly spending' : page === 'activity' ? 'Activity' : 'Overview'} · FinTrack</title></svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <a href="#overview" class="brand" onclick={() => page = 'overview'} aria-label="FinTrack overview"><span class="brand-mark">f<span>↗</span></span>fintrack<span class="brand-dot">.</span></a>
    <div class="workspace-label">YOUR PERSONAL SPACE</div>
    <nav aria-label="Main navigation">
      {#each [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'activity', label: 'Activity', icon: 'list' }, { id: 'monthly', label: 'Monthly spending', icon: 'calendar' }, { id: 'finance', label: 'Plan & accounts', icon: 'wallet' }, { id: 'trends', label: 'Trends', icon: 'up' }, { id: 'planning', label: 'Wishlist', icon: 'spark' }, { id: 'investments', label: 'Investments', icon: 'spark' }, { id: 'backup', label: 'Backup & data', icon: 'backup' }] as item}
        <button class:active={page === item.id} aria-current={page === item.id ? 'page' : undefined} onclick={() => { page = item.id as typeof page; search = ''; filter = 'all'; unclassifiedOnly = false; }}><Icon name={item.icon} /><span>{item.label}</span>{#if page === item.id}<span class="nav-dot"></span>{/if}</button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <div class="privacy-card"><span class="privacy-icon"><Icon name="shield" size={22} /></span><strong>Your money. Your business.</strong><p>Saved on this device.<br />No login. No cloud. Just you.</p><span class="tiny-label">PRIVATE BY DESIGN</span></div>
      <div class="sidebar-footer"><span class="status-dot"></span> Local-first, always <span>v0.4</span></div>
    </div>
  </aside>

  <main>
    <header class="topbar"><span class="breadcrumb">Your workspace <span>/</span> <strong>{page === 'backup' ? 'Backup & data' : page === 'trends' ? 'Trends' : page === 'investments' ? 'Investments' : page === 'planning' ? 'Wishlist' : page === 'finance' ? 'Plan & accounts' : page === 'monthly' ? 'Monthly spending' : page === 'activity' ? 'Activity' : 'Overview'}</strong></span><span class="connection"><span class="status-dot" class:disconnected={!online}></span>{online ? 'On this device' : 'Offline mode'}<Icon name="shield" size={15} /></span></header>
    <div class="main-content">
      {#if error}<div class="alert" role="alert"><span>{error}</span><button class="icon-button" aria-label="Dismiss error" onclick={() => error = ''}><Icon name="close" size={18} /></button></div>{/if}
      {#if updateReady}<div class="update-banner"><span>A fresh version is ready. Finish your entry before updating.</span><button class="text-button" onclick={() => updateSW(true)}>Update app <Icon name="up" size={16} /></button></div>{/if}
      <div class="page-heading"><div><p class="eyebrow">A LITTLE CLARITY, EVERY DAY</p><h1>{page === 'backup' ? 'Your data, in your hands.' : page === 'trends' ? 'See the bigger picture.' : page === 'investments' ? 'Know what came back.' : page === 'planning' ? 'Make room for your goals.' : page === 'finance' ? 'A plan for your money.' : page === 'monthly' ? 'Monthly spending.' : page === 'activity' ? 'Every little detail.' : 'Your money at a glance.'}</h1><p class="subtitle">{page === 'backup' ? 'Take a copy with you. Bring it back whenever you need.' : page === 'trends' ? 'Your records, your patterns. A little more clarity.' : page === 'investments' ? 'Track costs, cash returns and your actual investment results.' : page === 'planning' ? 'Expected income and savings-only wishlist forecasts.' : page === 'finance' ? 'Set your priorities. Keep your accounts in step.' : page === 'monthly' ? 'Your recurring payments, organized by month.' : page === 'activity' ? 'A simple record of what comes in and what goes out.' : 'A simple space to keep your everyday finances in check.'}</p></div>{#if page !== 'backup' && page !== 'planning' && page !== 'investments'}<label class="month-picker"><Icon name="calendar" size={18} /><span class="sr-only">Select month</span><input aria-label="Select month" type="month" min="1900-01" max="9999-12" bind:value={month} required /></label>{/if}</div>

      {#if page === 'backup'}
        <section class="backup-grid" in:fly={{ y: 10, duration: 200 }}>
          <article class="panel backup-card"><span class="feature-icon"><Icon name="backup" size={28} /></span><p class="eyebrow">KEEP A COPY</p><h2>Export your data</h2><p>One JSON file, with all your income, spending, plans, monthly payments, account movements, expected income, wishlist and investment records. Ready to restore here or move with you later.</p><div class="data-count"><strong>{ledger.entries.length}</strong> entries <span>·</span> EGP <span>·</span> Backup format v{ledger.schemaVersion}</div><button class="primary-button" disabled={!loaded || storageError || busy} onclick={exportData}><Icon name="backup" size={18} /> Download backup</button>{#if lastBackup}<small>Last download started: {lastBackup}</small>{/if}</article>
          <article class="panel backup-card"><span class="feature-icon warm"><Icon name="file" size={28} /></span><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Import a backup</h2><p>Choose a FinTrack JSON backup. You’ll review it before anything changes. Merge entries or replace your current data.</p><label class="secondary-button import-button" class:disabled={!loaded || storageError || busy}><Icon name="plus" size={18} /> Choose JSON file<input aria-label="Import JSON backup" type="file" accept=".json,application/json" onchange={readImport} disabled={!loaded || storageError || busy} /></label></article>
        </section>
        <section class="panel device-card"><span class="feature-icon"><Icon name="shield" size={24} /></span><div><h2>A little housekeeping</h2><p>Your records live in this browser on this device. Clearing site data, private browsing, or losing your device can remove them. Keep regular JSON backups somewhere safe.</p><p>{offlineReady ? 'The app is cached for offline use.' : 'Open the production app once online to prepare offline use.'} {installed ? 'You’re using the installed app.' : 'Install it from your browser menu for an app-like home screen experience. On iPhone/iPad, use Safari → Share → Add to Home Screen.'}</p>{#if installEvent}<button class="text-button" onclick={install}>Install FinTrack <Icon name="up" size={16} /></button>{/if}</div></section>
      {:else if page === 'trends'}
        {#if loaded}<TrendsPanel {ledger} month={isMonth(month) ? month : localDateTime().slice(0, 7)} onedit={(entry) => startEntry(entry.kind, entry)} />{:else}<p class="finance-notice">{storageError ? 'Storage needs attention.' : 'Opening your ledger…'}</p>{/if}
      {:else if page === 'investments'}
        {#if loaded}<InvestmentsPanel {ledger} {busy} disabled={storageError} commit={mutate} getError={() => error} />{:else}<p class="finance-notice">{storageError ? 'Storage needs attention.' : 'Opening your ledger…'}</p>{/if}
      {:else if page === 'planning'}
        {#if loaded}<PlanningPanel {ledger} {busy} disabled={storageError} commit={mutate} getError={() => error} />{:else}<p class="finance-notice">{storageError ? 'Storage needs attention.' : 'Opening your ledger…'}</p>{/if}
      {:else if page === 'monthly'}
        {#if loaded}<RecurringPanel {ledger} {month} {busy} disabled={storageError} commit={mutate} getError={() => error} onedit={(entry) => startEntry(entry.kind, entry)} />{:else}<p class="finance-notice">{storageError ? 'Storage needs attention.' : 'Opening your ledger…'}</p>{/if}
      {:else if page === 'finance'}
        {#if loaded}<FinancePanel {ledger} {month} {busy} disabled={storageError} commit={mutate} getError={() => error} onedit={(entry) => startEntry(entry.kind, entry)} onreview={() => { page = 'activity'; filter = 'expense'; search = ''; unclassifiedOnly = true; }} onmonthly={() => page = 'monthly'} />{:else}<div class="panel empty-state"><h2>{storageError ? 'Storage needs attention' : 'Opening your ledger…'}</h2></div>{/if}
      {:else}
        {#if page === 'overview'}
          <section class="overview-grid" in:fly={{ y: 12, duration: 220 }}>
            <article class="balance-card"><div class="balance-top"><span><span class="live-dot"></span> THIS MONTH’S BALANCE</span><Icon name="wallet" size={23} /></div><div class="balance-amount"><span class="currency">EGP</span> {money(summary.balance)}</div><p>{summary.income === 0 && summary.expenses === 0 ? 'A fresh month. Make it yours.' : summary.balance < 0 ? 'Spending is above this month’s income.' : 'What’s left from this month’s income.'}</p><div class="balance-bottom"><span>{monthLabel}</span><span class="balance-tag">{loaded ? 'Stored locally' : 'Opening your ledger…'} <Icon name="shield" size={13} /></span></div><div class="card-orbit orbit-one"></div><div class="card-orbit orbit-two"></div></article>
            <div class="summary-stack"><article class="stat-card"><span class="stat-icon income"><Icon name="down" /></span><div><p>Money in</p><h2><small>EGP</small> {money(summary.income)}</h2></div><span class="stat-caption">{monthly.filter(e => e.kind === 'income').length} entries</span></article><article class="stat-card"><span class="stat-icon expense"><Icon name="up" /></span><div><p>Money out</p><h2><small>EGP</small> {money(summary.expenses)}</h2></div><span class="stat-caption">{monthly.filter(e => e.kind === 'expense').length} entries</span></article></div>
          </section>
          <section class="quick-actions"><button class="primary-button" disabled={!loaded || storageError || busy} onclick={() => startEntry('expense')}><Icon name="plus" size={19} /> Add spending</button><button class="secondary-button" disabled={!loaded || storageError || busy} onclick={() => startEntry('income')}><Icon name="plus" size={19} /> Add income</button><span class="quick-hint"><Icon name="leaf" size={16} /> Small habits. A clearer picture.</span></section>
          <section class="month-note"><div class="note-heading"><span><Icon name="spark" size={17} /><strong>Your monthly pulse</strong></span><span>{summary.income > 0 ? `${used}% spent` : 'Your pace, your way'}</span></div><div class="spending-track" role="meter" aria-label="Monthly income spent" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, used)} aria-valuetext={summary.income > 0 ? `${used}% of income spent` : 'No income recorded'}><span class:over-budget={used > 100} style:width={`${Math.min(100, used)}%`}></span></div><p>{summary.income === 0 ? 'Add your income to see how your month is shaping up.' : summary.balance < 0 ? `You’ve spent EGP ${money(-summary.balance)} more than you’ve received this month.` : `You have EGP ${money(summary.balance)} left this month. One entry at a time, you’ve got this.`}</p></section>
        {/if}

        <section class="panel activity-panel" in:fade={{ duration: 180 }}>
          <div class="section-heading"><div><h2>{page === 'activity' ? 'Your activity' : 'Recent activity'} <span class="count-badge">{monthly.length}</span></h2><p>{monthLabel} · All the little things add up.</p></div>{#if page === 'overview'}<button class="text-button" onclick={() => page = 'activity'}>View all <Icon name="chevron" size={15} /></button>{:else}<button class="primary-button small" disabled={!loaded || storageError || busy} onclick={() => startEntry('expense')}><Icon name="plus" size={17} /> Add entry</button>{/if}</div>
          <div class="activity-toolbar">{#if unclassifiedOnly}<button class="text-button" onclick={() => unclassifiedOnly = false}>Unclassified spending · Clear filter ×</button>{/if}<div class="segmented" aria-label="Filter by entry type">{#each ['all', 'expense', 'income'] as value}<button class:selected={filter === value} aria-pressed={filter === value} onclick={() => filter = value as typeof filter}>{value === 'all' ? 'All entries' : value === 'expense' ? 'Spending' : 'Income'}</button>{/each}</div><label class="search-box"><Icon name="search" size={17} /><input type="search" aria-label="Search entries" placeholder="Find an entry…" bind:value={search} /></label></div>
          {#if !loaded}<div class="empty-state"><span class="empty-icon"><Icon name="wallet" size={30} /></span><h3>{storageError ? 'Your ledger needs attention' : 'Opening your ledger…'}</h3><p>{storageError ? 'Check the message above, then reload to try again.' : 'Getting your on-device records ready.'}</p></div>
          {:else if visible.length === 0}<div class="empty-state"><span class="empty-icon"><Icon name={monthly.length ? 'search' : 'wallet'} size={30} /></span><h3>{monthly.length ? 'No matching entries' : 'Your story starts here'}</h3><p>{monthly.length ? 'Try another search or entry type.' : 'Add your income, log your first coffee, and get a little closer to your money.'}</p>{#if !monthly.length}<button class="text-button" disabled={storageError} onclick={() => startEntry('income')}>Add your first income <Icon name="up" size={17} /></button>{/if}</div>
          {:else}<div class="entry-list">{#each (page === 'overview' ? visible.slice(0, 5) : visible) as entry (entry.id)}<article class="entry-row" animate:flip={{ duration: 180 }}><span class="entry-icon" class:income={entry.kind === 'income'}><Icon name={categoryIcon(entry)} size={20} /></span><div class="entry-description"><h3>{entry.note}</h3><p><span>{entry.category}</span><span>· {accountLabels[entry.account ?? 'wallet']}{entry.kind === 'expense' ? ` · ${entry.bucket ? bucketLabelForMonth(ledger, entry.bucket, monthKey(entry.occurredAt)) : 'Needs budget review'}` : ''}</span><span class="dot-divider">·</span><time datetime={entry.occurredAt}>{dateLabel(entry.occurredAt)} <span class="entry-time">at {timeLabel(entry.occurredAt)}</span></time></p></div><span class="entry-amount" class:positive={entry.kind === 'income'}>{entry.kind === 'income' ? '+' : '−'}{money(entry.amountMinor)}<small>EGP</small></span><div class="entry-actions"><button class="icon-button" aria-label={`Edit ${entry.note}`} disabled={busy || storageError} onclick={() => startEntry(entry.kind, entry)}><Icon name="edit" size={16} /></button><button class="icon-button delete-button" aria-label={`Delete ${entry.note}`} disabled={busy || storageError} onclick={() => { error = ''; deleteTarget = entry; }}><Icon name="trash" size={16} /></button></div></article>{/each}</div>{#if page === 'overview' && visible.length > 5}<button class="more-entries" onclick={() => page = 'activity'}>View all {visible.length} entries <Icon name="chevron" size={15} /></button>{/if}{/if}
        </section>
        <div class="gentle-footer"><Icon name="shield" size={15} /><span>Just your money, on your device. Remember to <button onclick={() => page = 'backup'}>make a backup.</button></span><span class="phase-label">THE EVERYDAY EDITION</span></div>
      {/if}
    </div>
  </main>
  <nav class="mobile-nav" aria-label="Mobile navigation">
    {#each [{id:'overview', label:'Overview', icon:'grid'}, {id:'activity', label:'Activity', icon:'list'}, {id:'finance', label:'Plan', icon:'wallet'}, {id:'monthly', label:'Monthly', icon:'calendar'}] as item}<button class:active={page === item.id} onclick={() => page = item.id as typeof page}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>{/each}
    <label class="mobile-more" class:active={['trends','planning','investments','backup'].includes(page)}><Icon name="list" size={20} /><span>{page === 'trends' ? 'Trends' : page === 'planning' ? 'Wishlist' : page === 'investments' ? 'Invest' : page === 'backup' ? 'Backup' : 'More'}</span><select aria-label="More sections" value={['trends','planning','investments','backup'].includes(page) ? page : ''} onchange={(event) => page = event.currentTarget.value as typeof page}><option value="" disabled>More sections</option><option value="trends">Trends</option><option value="planning">Wishlist</option><option value="investments">Investments</option><option value="backup">Backup & data</option></select></label>
  </nav>
</div>

{#if toast}<div class="toast" role="status" transition:fly={{ y: 15, duration: 200 }}><Icon name="check" size={19} />{toast}</div>{/if}

{#if showForm}
  <dialog use:modal oncancel={(event) => { if (busy) event.preventDefault(); else showForm = false; }} aria-labelledby="entry-title" class="entry-dialog">
    <div class="dialog-content"><div class="dialog-heading"><div><p class="eyebrow">MAKE A LITTLE NOTE</p><h2 id="entry-title">{editing ? 'Edit your entry' : 'A little money moment.'}</h2></div><button class="icon-button" aria-label="Close entry form" disabled={busy} onclick={() => showForm = false}><Icon name="close" /></button></div>
      <form onsubmit={submit}><fieldset disabled={busy}><div class="kind-switch"><button type="button" class:selected={kind === 'expense'} onclick={() => kind = 'expense'}><Icon name="up" size={17} /> Spending</button><button type="button" class:selected={kind === 'income'} onclick={() => kind = 'income'}><Icon name="down" size={17} /> Income</button></div><label class="form-label amount-label">Amount <span>EGP</span><input class="amount-input" aria-label="Amount in EGP" inputmode="decimal" placeholder="0.00" bind:value={amount} required maxlength="13" /></label><label class="form-label">{kind === 'income' ? 'Where did it come from?' : 'What was it for?'}<input placeholder={kind === 'income' ? 'e.g. November salary' : 'e.g. Coffee on the way to work'} bind:value={note} maxlength="300" required /></label>{#if kind === 'expense'}<label class="form-label">Category <span>Choose one or type your own</span><input list="categories" bind:value={category} maxlength="60" required /><datalist id="categories">{#each categories as item}<option value={item}></option>{/each}</datalist></label>{:else}<label class="form-label">Income type <span>Choose one or type your own</span><input list="income-categories" bind:value={incomeCategory} maxlength="60" required /><datalist id="income-categories">{#each incomeCategories as item}<option value={item}></option>{/each}</datalist></label>{/if}<label class="form-label">Account<select bind:value={entryAccount}>{#each accountIds as account}<option value={account}>{accountLabels[account]}</option>{/each}</select></label>{#if kind === 'expense'}<label class="form-label">Budget bucket<select bind:value={entryBucket}><option value="">Unclassified — review later</option>{#if entryBucket && !entryBuckets.some(bucket => bucket.id === entryBucket)}<option value={entryBucket}>{bucketLabelForMonth(ledger, entryBucket, entryMonth)} (removed)</option>{/if}{#each entryBuckets as bucket (bucket.id)}<option value={bucket.id}>{bucket.name}</option>{/each}</select></label>{/if}<label class="form-label">Date & time<input type="datetime-local" bind:value={occurredAt} required /></label><p class="form-help">Use the time it happened. We’ll remember when you recorded it, too.</p>{#if formError}<p class="form-error" role="alert">{formError}</p>{/if}<button class="primary-button full-width" type="submit" disabled={busy}>{busy ? 'Saving to your device…' : editing ? 'Save changes' : kind === 'income' ? 'Add income' : 'Save spending'}<Icon name="check" size={18} /></button></fieldset></form></div>
  </dialog>
{/if}
{#if deleteTarget}<dialog use:modal oncancel={(event) => { if (busy) event.preventDefault(); else deleteTarget = null; }} aria-labelledby="delete-title"><div class="dialog-content"><span class="feature-icon warm"><Icon name="trash" size={25} /></span><h2 id="delete-title">Delete this entry?</h2><p class="dialog-copy">“{deleteTarget.note}” · EGP {money(deleteTarget.amountMinor)} will be removed from your records. This can’t be undone.</p>{#if error}<p class="form-error" role="alert">{error}</p>{/if}<div class="dialog-actions"><button class="secondary-button" disabled={busy} onclick={() => deleteTarget = null}>Keep entry</button><button class="danger-button" disabled={busy} onclick={removeEntry}>{busy ? 'Deleting…' : 'Delete entry'}</button></div></div></dialog>{/if}
{#if imported}<dialog use:modal oncancel={(event) => { if (busy) event.preventDefault(); else imported = null; }} aria-labelledby="import-title"><div class="dialog-content"><span class="feature-icon"><Icon name="file" size={25} /></span><h2 id="import-title">Your backup is ready.</h2><p class="dialog-copy">{imported.entries.length} entries, {imported.transfers.length} transfers, {imported.openings.length} opening balances, {imported.plans.length} plan versions, {imported.recurringExpenses.length} monthly schedules, {imported.recurringPayments.length} monthly payments, {imported.expectedIncomes.length} income estimates, {imported.wishlist.length} goals, {imported.investments.length} investments, {imported.investmentEvents.length} cash events · EGP · Current format v{imported.schemaVersion}. How would you like to import them?</p><label class="radio-option"><input type="radio" bind:group={importMode} value="merge" /><span><strong>Merge with my entries</strong><small>Add new records. Current records win matching IDs, opening accounts and expected-income months. Conflicting plan revisions, monthly payments or mismatched cash links stop the import.</small></span></label><label class="radio-option"><input type="radio" bind:group={importMode} value="replace" /><span><strong>Replace everything</strong><small>Remove all current records, including monthly schedules and payments, and use this backup instead. Export your current data first.</small></span></label>{#if importMode === 'replace'}<button class="text-button" onclick={exportData}>Download current data first <Icon name="backup" size={16} /></button>{/if}{#if importError}<p class="form-error" role="alert">{importError}</p>{/if}<div class="dialog-actions"><button class="secondary-button" disabled={busy} onclick={() => imported = null}>Cancel</button><button class="primary-button" disabled={busy} onclick={restoreData}>{busy ? 'Importing…' : importMode === 'replace' ? 'Replace all data' : 'Merge backup'}</button></div></div></dialog>{/if}
