<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsCoreOption, EChartsType } from 'echarts/core';
  let { option, title, onselect }: { option: EChartsCoreOption; title: string; onselect?: (name: string) => void } = $props();
  let element: HTMLDivElement;
  let chart = $state.raw<EChartsType | null>(null);
  let failed = $state(false);
  let reduced = $state(false);
  onMount(() => {
    let destroyed = false;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = preference.matches;
    const change = () => reduced = preference.matches;
    preference.addEventListener('change', change);
    const observer = new ResizeObserver(() => chart?.resize());
    observer.observe(element);
    import('./charting').then(({ init }) => {
      if (destroyed) return;
      chart = init(element, undefined, { renderer: 'svg' });
      chart.on('click', (event: unknown) => {
        const name = (event as { name?: string }).name;
        if (name) onselect?.(name);
      });
    }).catch(() => { if (!destroyed) failed = true; });
    return () => { destroyed = true; observer.disconnect(); preference.removeEventListener('change', change); chart?.dispose(); chart = null; };
  });
  $effect(() => {
    if (chart) chart.setOption({ ...option, animation: !reduced, animationDuration: 250, animationDurationUpdate: 200, aria: { enabled: true, label: { description: title } } }, { notMerge: true });
  });
</script>

<div class="chart-canvas" bind:this={element} role="img" aria-label={title}></div>
{#if failed}<p class="form-error" role="alert">Chart unavailable. The complete figures are available in the data table below.</p>{/if}
