/* Screenshots of Lumen for a quick look at the design:  node tests/shots.mjs [outdir]
   Uses the pretend engine (tests/fake-webllm.js), so it needs no graphics chip and no internet. */
import { startServer } from './server.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const out = process.argv[2] || 'tests/shots';
fs.mkdirSync(out, { recursive: true });
let pw; try { pw = await import('playwright'); } catch { pw = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright'); }
const server = await startServer({ fake: true });
const browser = await pw.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
const MB = 1048576;
const files = { 'mlc-chat-config.json': JSON.stringify({ tokenizer_files: ['tokenizer.json'] }), 'tensor-cache.json': JSON.stringify({ records: [0, 1, 2].map(i => ({ dataPath: `params_shard_${i}.bin`, nbytes: MB, records: [{ byteOffset: 0, nbytes: MB }] })) }), 'tokenizer.json': '{}' };

async function shot(name, { width = 1280, height = 820, dark = false, setup, clean = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
  await ctx.addInitScript(({ clean }) => {
    globalThis.__fakeLLM = { tokenDelay: 0 };
    const adapter = { features: new Set(['shader-f16']), info: { vendor: 'apple', architecture: 'metal-3' }, limits: {} };
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => adapter } });
    if (!clean && !localStorage.getItem('lumen.settings')) localStorage.setItem('lumen.settings', JSON.stringify({ name: 'Luka', setupDone: 2 }));
  }, { clean });
  await ctx.route(/^https:\/\/(huggingface\.co|raw\.githubusercontent\.com)\//, r => {
    const f = r.request().url().split('/').pop();
    const body = files[f] ?? (/params_shard/.test(f) ? Buffer.alloc(MB, 1) : Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 1, 2, 3]));
    return r.fulfill({ status: 200, body, headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/^https:\/\/[a-z.]*wikipedia\.org\/w\/api\.php/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ query: { pages: [{ title: 'Photosynthesis', index: 1, extract: 'Photosynthesis is how plants turn light into chemical energy. It happens in chloroplasts.', fullurl: 'https://en.wikipedia.org/wiki/Photosynthesis', description: 'Biological process' }] } }) }));
  await ctx.route(/^https:\/\/(?!127\.0\.0\.1)(?!huggingface\.co)(?!raw\.githubusercontent\.com)(?![a-z.]*wikipedia\.org\/w\/api\.php)/, r => r.fulfill({ status: 503, body: "" }));
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking');
  if (setup) await setup(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
const chat = async page => {
  await page.evaluate(() => window.__lumen.Brain.load('Qwen3.5-2B'));
  await page.waitForFunction(() => window.__lumen.Brain.state === 'ready');
  await page.fill('#input', 'How does photosynthesis work?');
  await page.press('#input', 'Enter');
  await page.waitForFunction(() => !window.__lumen.App.run && window.__lumen.App.chats.length);
};
const only = process.argv.slice(3);
const all = {
  home: {}, homeDark: { dark: true }, setup: { clean: true }, chat: { setup: chat }, chatDark: { dark: true, setup: chat },
  phone: { width: 390, height: 844 }, phoneChat: { width: 390, height: 844, setup: chat },
  settings: { setup: async p => { await p.evaluate(() => window.__lumen.openSettings('models')); } },
};
for (const [k, v] of Object.entries(all)) if (!only.length || only.includes(k)) { try { await shot(k, v); console.log('saved', k); } catch (e) { console.log('failed', k, e.message); } }
await browser.close(); await server.close();
