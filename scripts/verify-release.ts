import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert(config.bunVersion === '1.x' && config.framework === 'vite' && config.outputDirectory === 'dist', 'Vercel must use Bun and the static Vite output.');
assert(config.installCommand === 'bun install --frozen-lockfile', 'Production install must use the tested lockfile.');
assert(existsSync('bun.lock'), 'Missing Bun lockfile.');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  assert(!/^(?:npm:[^@]+@)?\d+\.\d+\.\d+$/.test(String(range)), `Exact package pin: ${name}`);
}
assert(!pkg.engines?.node, 'Do not override Bun with a Node engine.');
assert(String(pkg.dependencies.echarts) === '6.1.x', 'Charts must stay on the requested ECharts 6.1 family.');
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
assert(manifest.display === 'standalone' && manifest.start_url === '/' && manifest.scope === '/', 'Invalid standalone PWA manifest.');
assert(manifest.background_color === '#090a0e' && manifest.theme_color === '#090a0e', 'PWA must remain dark-only.');
for (const icon of manifest.icons) assert(existsSync(join('dist', icon.src)), `Missing PWA icon: ${icon.src}`);
const html = readFileSync('dist/index.html', 'utf8');
assert(!/<script[^>]*src=["']https?:/i.test(html), 'Remote script dependency in production HTML.');
assert(!/<script\b[^>]*>\s*[^<\s][\s\S]*?<\/script>/i.test(html), 'Inline scripts violate the production CSP.');
const worker = readFileSync('dist/sw.js', 'utf8');
const files = readdirSync('dist/assets').filter(name => /\.(js|css)$/.test(name));
assert(files.some(name => name.startsWith('echarts-')) && files.some(name => name.startsWith('chart-renderer-')), 'Missing local chart bundles.');
for (const file of files) assert(worker.includes(`assets/${file}`), `Offline cache is missing ${file}`);
assert(config.headers.some((r: { source: string; headers: { key: string; value: string }[] }) => r.source === '/sw.js' && r.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store'))), 'Service worker must not remain in the HTTP cache.');
console.log(`Release verified: Bun/Vercel static config, ${files.length} cached assets, standalone dark PWA, CSP-compatible HTML, no exact manifest pins.`);
