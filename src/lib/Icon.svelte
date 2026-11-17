<script lang="ts">
  export let name = 'plus';
  export let size = 20;
  const paths: Record<string, string> = {
    plus: 'M12 5v14M5 12h14',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
    backup: 'M12 3v12m-4-4 4 4 4-4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
    up: 'M7 17 17 7M7 7h10v10',
    down: 'M7 7 17 17M7 17h10V7',
    chevron: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12M6 18 18 6',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
    wallet: 'M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6m18 6h-5v5h5',
    edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    file: 'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8M8 17h5',
    check: 'm5 12 4 4L19 6',
    leaf: 'M20 3C9 2 3 8 5 15c4 9 17 3 15-12ZM4 21 15 10',
    calendar: 'M8 2v4M16 2v4M3 10h18M3 5h18v17H3z',
    food: 'M5 3v6a3 3 0 0 0 6 0V3M8 3v19M19 22V3c-4 2-4 10 0 10',
    bag: 'M4 8h16l1 13H3L4 8ZM8 8V6a4 4 0 0 1 8 0v2',
    transport: 'M4 16V5c0-3 16-3 16 0v11H4ZM4 10h16M7 16v5M17 16v5M7 13h.01M17 13h.01',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3',
    offline: 'M3 3l18 18M8 8a8 8 0 0 1 12 2M4 10l2-2M7 14a7 7 0 0 1 7-1M10 18l2 2 2-2'
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.wallet} /></svg>
