/* Lumen's end-to-end tests. Run:  node tests/run.mjs            (all tests)
                                  node tests/run.mjs download     (only tests whose name contains "download")
   Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
   The real AI model is never used: tests/fake-webllm.js stands in for it, and every website Lumen talks to
   (Hugging Face, Wikipedia, ...) is answered by the pretend servers below, so the tests need no internet. */
import { startServer } from './server.mjs';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  for (const p of ['/opt/node-tools/node_modules/playwright', '/usr/local/lib/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return createRequire(import.meta.url)(p); } catch {}
  }
  throw new Error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
}
const { chromium } = await loadPlaywright();
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const server = await startServer({ fake: true });
const BASE = server.url;
const browser = await chromium.launch({ executablePath: process.env.CHROME || (await import('node:fs')).existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));

/* ---------- the pretend model files on "Hugging Face" ---------- */
const MB = 1024 * 1024;
const SHARDS = [Math.round(2.6 * MB), 300000, 410000, 520000, 630000, 740000];
function shardBytes(i) { const b = Buffer.alloc(SHARDS[i]); for (let k = 0; k < b.length; k += 4096) b[k] = (i * 31 + k) & 255; return b; }
const SHARD_DATA = SHARDS.map((_, i) => shardBytes(i));
const TENSOR_CACHE = JSON.stringify({ metadata: { ParamSize: 12, ParamBytes: SHARDS.reduce((a, b) => a + b, 0) }, records: SHARDS.map((n, i) => ({ dataPath: `params_shard_${i}.bin`, format: 'raw-shard', nbytes: n,
  records: [{ name: `p${i}.a`, shape: [n / 2], dtype: 'uint8', format: 'raw', nbytes: Math.floor(n / 2), byteOffset: 0 }, { name: `p${i}.b`, shape: [n - Math.floor(n / 2)], dtype: 'uint8', format: 'raw', nbytes: n - Math.floor(n / 2), byteOffset: Math.floor(n / 2) }] })) });
const CONFIG = JSON.stringify({ model_type: 'qwen3_5', tokenizer_files: ['tokenizer.json', 'tokenizer_config.json'], context_window_size: 32768, conv_template: { name: 'qwen' } });
const TOKENIZER = JSON.stringify({ version: '1.0', model: { type: 'BPE', vocab: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['t' + i, i])) } });
const WASM = Buffer.concat([Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), Buffer.alloc(70000, 7)]);

function modelFile(url) {
  const u = new URL(url);
  if (u.hostname === 'raw.githubusercontent.com' && u.pathname.endsWith('.wasm')) return { body: WASM, type: 'application/wasm' };
  const m = u.pathname.match(/^\/mlc-ai\/([^/]+)\/resolve\/main\/(.+)$/);
  if (!m) return null;
  const f = m[2];
  if (f === 'mlc-chat-config.json') return { body: Buffer.from(CONFIG), type: 'application/json' };
  if (f === 'tensor-cache.json') return { body: Buffer.from(TENSOR_CACHE), type: 'application/json' };
  if (f === 'tokenizer.json' || f === 'tokenizer_config.json') return { body: Buffer.from(TOKENIZER), type: 'application/json' };
  const s = f.match(/^params_shard_(\d+)\.bin$/);
  if (s && SHARD_DATA[+s[1]]) return { body: SHARD_DATA[+s[1]], type: 'application/octet-stream' };
  return null;
}

/* ---------- the pretend Wikipedia ---------- */
const ARTICLE = 'Photosynthesis is a biological process used by plants, algae and cyanobacteria to turn light energy into chemical energy that fuels their activities. It was described in 1779.\n\n== Overview ==\nMost photosynthetic organisms use sunlight, water and carbon dioxide to make sugar and oxygen. The process happens in chloroplasts, which contain chlorophyll.\n\n== History ==\nJan Ingenhousz showed in 1779 that light is needed for plants to restore air. Later scientists worked out the light and dark reactions in detail.';
function wikiAnswer(url) {
  const u = new URL(url), p = Object.fromEntries(u.searchParams);
  const page = { pageid: 1, ns: 0, title: 'Photosynthesis', index: 1, description: 'Biological process', extract: ARTICLE.split('\n\n')[0], fullurl: 'https://en.wikipedia.org/wiki/Photosynthesis', touched: '2026-10-01T00:00:00Z', pageprops: { wikibase_item: 'Q11982' }, pageviews: { '2026-10-01': 5000 } };
  if (p.generator === 'search') return { query: { pages: /zzzz|qqqq/i.test(p.gsrsearch || '') ? [] : [page] } };
  if (p.list === 'search') return { query: { search: [{ title: 'Photosynthesis' }], searchinfo: {} } };
  if (p.action === 'query' && p.titles) return { query: { pages: [{ ...page, extract: ARTICLE }] } };
  if (p.action === 'parse') return { parse: { text: '<div class="current-events-main" id="2026_October_16"><div class="current-events-content"><ul><li>Scientists announced a new discovery about photosynthesis in plants today.</li></ul></div></div>' } };
  if (p.action === 'wbgetclaims') return { claims: {} };
  return { query: {} };
}

/* ---------- one page with all the pretend servers ---------- */
const hits = new Map();   // url -> number of requests (model files)
const faults = { abortTimes: new Map(), status: new Map(), noRange: false, slowMs: 0 };
async function newPage({ viewport = { width: 1280, height: 860 }, init = {}, context: ctxIn, gpu = true, firstRun = false } = {}) {
  const context = ctxIn || await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 40\d|status of 50\d|JSON attempt failed|A saved model file is broken|engine said|Something odd happened|Error: stopped|stalled|cancelled|worker-failed|exceeds shard size|Tensor-cache record/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(({ init, gpu, firstRun }) => {
    globalThis.__fakeLLM = { tokenDelay: 1, ...init };
    try { if (!firstRun && !localStorage.getItem('lumen.settings')) localStorage.setItem('lumen.settings', JSON.stringify({ setupDone: 2 })); } catch {}   // the setup questions are tested on their own (sandboxed preview frames have no storage)
    if (gpu) {
      const adapter = { features: new Set(['shader-f16']), info: { vendor: 'apple', architecture: 'metal-3', description: '' }, limits: { maxBufferSize: 4294967296, maxStorageBufferBindingSize: 4294967292 }, requestDevice: async () => ({ lost: new Promise(() => {}), limits: {}, features: new Set() }) };
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' } });
    } else Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  }, { init, gpu, firstRun });
  await context.route(/^https:\/\/(huggingface\.co|raw\.githubusercontent\.com)\//, async route => {
    const url = route.request().url();
    hits.set(url, (hits.get(url) || 0) + 1);
    const left = faults.abortTimes.get(url) || 0;
    if (left > 0) { faults.abortTimes.set(url, left - 1); return route.abort('connectionreset'); }
    if (faults.status.has(url)) return route.fulfill({ status: faults.status.get(url), body: 'error', headers: { 'access-control-allow-origin': '*' } });
    const f = modelFile(url);
    if (!f) return route.fulfill({ status: 404, body: 'Entry not found', headers: { 'access-control-allow-origin': '*' } });
    if (faults.slowMs) await new Promise(r => setTimeout(r, faults.slowMs));
    const range = route.request().headers()['range'];
    const headers = { 'access-control-allow-origin': '*', 'content-type': f.type, 'accept-ranges': 'bytes' };
    if (range && !faults.noRange) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const a = +m[1], b = m[2] ? Math.min(+m[2], f.body.length - 1) : f.body.length - 1;
      return route.fulfill({ status: 206, body: f.body.subarray(a, b + 1), headers: { ...headers, 'content-range': `bytes ${a}-${b}/${f.body.length}` } });
    }
    return route.fulfill({ status: 200, body: f.body, headers });
  });
  await context.route(/^https:\/\/[a-z.]*wikipedia\.org\/w\/api\.php/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(wikiAnswer(route.request().url())) }));
  await context.route(/^https:\/\/(?!127\.0\.0\.1)(?!huggingface\.co)(?!raw\.githubusercontent\.com)(?![a-z.]*wikipedia\.org\/w\/api\.php)/, route => route.fulfill({ status: 503, body: 'offline in tests', headers: { 'access-control-allow-origin': '*' } }));
  return { page, context, errors };
}
async function open(opts = {}) {
  const p = await newPage(opts);
  await p.page.goto(BASE + (opts.hash || ''));
  await p.page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking', null, { timeout: 15000 });
  return p;
}
const L = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });

/* ---------- tiny test framework ---------- */
const results = [];
let current = null;
function assert(cond, msg) { if (!cond) throw new Error('assertion failed: ' + msg); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/* ===================== unit tests (pure functions, through window.__lumen) ===================== */
test('unit: calculator', async () => {
  const { page, errors } = await open();
  const r = await L(page, () => { const { Calc } = window.__lumen; return ['2+3*4', '(2+3)*4', '2^10', '10/4', '5!', 'sqrt(16)', '7 mod 3', '-3^2', '2*-3', 'sin(90°)', '1/0', 'abc', '3 + ', '1,000 + 1'].map(e => [e, Calc.evaluate(e)]); });
  const want = { '2+3*4': 14, '(2+3)*4': 20, '2^10': 1024, '10/4': 2.5, '5!': 120, 'sqrt(16)': 4, '7 mod 3': 1, '2*-3': -6, 'sin(90°)': 1, '1/0': null, 'abc': null, '3 + ': null, '1,000 + 1': 1001 };
  for (const [e, v] of r) if (e in want) eq(v === null ? null : Math.round(v * 1e9) / 1e9, want[e], 'Calc ' + e);
  eq(r.find(x => x[0] === '-3^2')[1], -9, 'unary minus binds weaker than power');
  eq(errors, [], 'page errors');
});
test('unit: unit conversion words', async () => {
  const { page } = await open();
  const r = await L(page, () => { const { unitNotes } = window.__lumen; return ['5 feet in meters', '1 foot in cm', '10 inches to cm', '3 miles to km', '100 f to c', '2 cups in ml', 'convert 5 kg to lbs', 'how many feet in 3 miles', '1 inch in cm']; }).then(qs => L(page, qs => qs.map(q => window.__lumen.unitNotes(q)), qs));
  assert(/= 1\.524 metres/.test(r[0]), r[0]);
  assert(/^5 feet/.test(r[0]), 'plural of foot is feet: ' + r[0]);
  assert(/^1 foot = 30\.48 centimetres/.test(r[1]), r[1]);
  assert(/^10 inches = 25\.4 centimetres/.test(r[2]), 'plural of inch: ' + r[2]);
  assert(/37\.7777|37\.778/.test(r[4]), r[4]);
  assert(/= 15840 feet/.test(r[7]), r[7]);
  assert(/^1 inch = 2\.54 centimetres/.test(r[8]), r[8]);
});
test('unit: dates and times', async () => {
  const { page } = await open();
  const r = await L(page, () => {
    const { timeNotes } = window.__lumen; const now = new Date(2026, 9, 17, 10, 0, 0);
    return ['what time is it in Tokyo', 'how many days until christmas', 'what day is 25 december 2026', 'what is the date today', 'how many days between 1 january 2026 and 1 march 2026'].map(q => timeNotes(q, now)?.lines?.[0] || null);
  });
  assert(/Asia\/Tokyo/.test(r[0]), r[0]);
  assert(/in 69 days/.test(r[1]), r[1]);
  assert(/Friday/.test(r[2]), r[2]);
  assert(/Saturday,? 17 October 2026/.test(r[3]), r[3]);
  assert(/there are 59 days/.test(r[4]), r[4]);
});
test('unit: intents and slash parsing', async () => {
  const { page } = await open();
  const r = await L(page, () => {
    const { fxIntent, weatherIntent, cryptoIntent, parseSlash, shouldLookUp, pickMode } = window.__lumen;
    return {
      fx: fxIntent('convert 100 euros to dollars'), fx2: fxIntent('$50 in yen'), wx: weatherIntent('What is the weather in Paris tomorrow?'), wx2: weatherIntent('why does it rain'),
      cr: cryptoIntent('bitcoin price today'), sl: parseSlash('/quiz volcanoes'), sl2: parseSlash('/nope x'), lu: [shouldLookUp('hi'), shouldLookUp('who was Napoleon?'), shouldLookUp('write a poem about cats')],
      pm: [pickMode('hi').key, pickMode('why is the sky blue?').key, pickMode('write a detailed report on climate change').key],
    };
  });
  eq(r.fx, { amount: 100, from: 'EUR', to: 'USD' }, 'fx');
  eq(r.fx2, { amount: 50, from: 'USD', to: 'JPY' }, 'fx $');
  eq(r.wx?.place, 'Paris', 'weather place');
  eq(r.wx2, null, 'explainer is not a weather lookup');
  eq(r.cr?.coins?.[0]?.id, 'bitcoin', 'crypto');
  eq(r.sl, { cmd: 'quiz', arg: 'volcanoes' }, 'slash');
  eq(r.sl2, null, 'unknown slash');
  eq(r.lu, [false, true, false], 'shouldLookUp');
  eq(r.pm, ['low', 'high', 'max'], 'pickMode');
});
test('unit: answer helpers', async () => {
  const { page } = await open();
  const r = await L(page, () => {
    const { splitStream, cleanAnswer, looping, jsonFromText, checkArithmetic, voteKey, solveParts, finalAnswerOf, trimRepeat } = window.__lumen;
    const rep = 'This sentence repeats itself a lot for testing. '.repeat(12);
    return {
      s1: splitStream('<think>abc</think>Answer', true), s2: splitStream('<think>still', true), clean: cleanAnswer('<think>x</think> Hi'), loop: looping(rep), noloop: looping('A normal answer. '.repeat(2)),
      json: jsonFromText('```json\n{"a":[1,2,{"b":3}]}\n```'), cut: jsonFromText('{"title":"x","cards":[{"front":"a","back":"b"},{"front":"c"'),
      ar: checkArithmetic('Steps: 22 - 7 = 15 and 3 * 4 = 13.'), vk: [voteKey('B) Paris'), voteKey('Yes'), voteKey('1,000 apples'), voteKey('3/4')],
      sp: solveParts('**Given:** x\n**Find:** y\n**Method:** z\n**Steps:** 1\n**Check:** ok\n**Answer:** 5'), fa: finalAnswerOf('work\nFinal answer: **42**.'), tr: trimRepeat(rep).length < rep.length,
    };
  });
  eq(r.s1, { thinking: 'abc', answer: 'Answer', closed: true }, 'splitStream closed');
  eq(r.s2.closed, false, 'splitStream open');
  eq(r.clean, 'Hi', 'cleanAnswer');
  eq([r.loop, r.noloop], [true, false], 'looping');
  eq(r.json, { a: [1, 2, { b: 3 }] }, 'jsonFromText');
  eq(r.cut.cards.length >= 1, true, 'cut JSON repaired');
  eq(r.ar.checked, 2, 'arithmetic checked'); eq(r.ar.wrong.length, 1, 'arithmetic wrong');
  eq(r.vk, ['c:b', 'b:true', 'n:1000', 'n:0.75'], 'voteKey');
  eq(r.sp, [], 'solve parts'); eq(r.fa, '42', 'final answer'); eq(r.tr, true, 'trimRepeat');
});
test('unit: markdown is sanitized', async () => {
  const { page } = await open();
  const html = await L(page, () => window.__lumen.renderMarkdown('Hi <img src=x onerror=alert(1)> <script>alert(1)</script> [x](javascript:alert(1)) $x^2$ `code $y$`'));
  assert(!/onerror|<script|javascript:/i.test(html), 'unsafe html kept: ' + html);
  assert(/katex/.test(html), 'math rendered');
  assert(/<code>code \$y\$<\/code>/.test(html), 'math not rendered inside code');
});
test('unit: source check and documents', async () => {
  const { page } = await open();
  const r = await L(page, () => {
    const { Ground, chunkDoc, selectDocText } = window.__lumen;
    const g = Ground.check('The tower was finished in 1889 by Gustave Eiffel and is 330 metres tall. It cost 7,799,401 francs.', 'The Eiffel Tower was built in 1889 by the company of Gustave Eiffel. It is 330 m tall.');
    const chunks = chunkDoc('[Page 1]\n' + 'Alpha beta gamma. '.repeat(120) + '\n[Page 2]\nDelta epsilon.');
    const sel = selectDocText([{ name: 'a.txt', text: 'Mitochondria are the powerhouse of the cell.\n\n' + 'Filler text. '.repeat(2000) }], 'What are mitochondria?', '', 2000);
    return { flagged: g.flagged.map(f => f.text), n: chunks.length, loc: chunks[chunks.length - 1].loc, sel: /Mitochondria/.test(sel.block), cov: sel.coverage < 1 };
  });
  eq(r.flagged, ['7,799,401'], 'only the number not in the sources is flagged');
  assert(r.n >= 3 && r.loc === 'p. 2', 'chunks with pages');
  eq([r.sel, r.cov], [true, true], 'best part of the file is picked');
});

/* ===================== the app ===================== */
test('app: first screen has no errors and shows the model card', async () => {
  const { page, errors } = await open();
  await page.waitForSelector('#welcome:not([hidden])');
  const text = await page.textContent('body');
  assert(/Download/.test(text), 'download offered');
  eq(errors, [], 'errors on load');
});
test('app: no WebGPU shows a clear message', async () => {
  const { page, errors } = await open({ gpu: false });
  await until(page, () => window.__lumen.Brain.state === 'unsupported');
  const t = await page.textContent('body');
  assert(/can’t run the AI model|cannot run the AI model|WebGPU/.test(t), 'unsupported message');
  eq(errors, [], 'errors');
});

async function download(page, key = 'Qwen3.5-2B') {
  await L(page, k => { const { S, Brain } = window.__lumen; S.model = k; return Brain.load(k); }, key);
  await until(page, () => window.__lumen.Brain.state === 'ready');
}
async function ask(page, text) {
  const n0 = await L(page, () => window.__lumen.App.chats.reduce((s, c) => s + c.messages.length, 0));
  await page.fill('#input', text);
  await page.press('#input', 'Enter');
  await until(page, n0 => !window.__lumen.App.run && window.__lumen.App.chats.reduce((s, c) => s + c.messages.length, 0) >= n0 + 2, n0, 30000);
  return L(page, () => { const c = window.__lumen.App.chats.find(x => x.id === window.__lumen.App.currentId); return c.messages[c.messages.length - 1]; });
}

test('app: download, start and answer with sources', async () => {
  const { page, errors } = await open();
  await download(page);
  const m = await ask(page, 'What is photosynthesis?');
  eq(m.state, 'done', 'answer state');
  assert(/test answer/.test(m.content), 'answer text: ' + m.content);
  assert(m.sources?.length >= 1, 'sources shown');
  await page.waitForSelector('.msg-ai .md');
  eq(errors, [], 'errors');
});
test('app: stop, answer again, versions and edit', async () => {
  const { page, errors } = await open({ init: { tokenDelay: 25 } });
  await download(page);
  await page.fill('#input', 'Tell me a long story about dragons');
  await page.press('#input', 'Enter');
  await until(page, () => { const r = window.__lumen.App.run; return r && r.am.content.length > 10; });
  await page.click('#sendBtn');   // Stop
  await until(page, () => !window.__lumen.App.run);
  let st = await L(page, () => window.__lumen.App.chats[0].messages[1].state);
  eq(st, 'stopped', 'stopped');
  await L(page, () => { window.__fakeLLM.tokenDelay = 1; });
  await page.click('.msg-ai [aria-label="Answer again"]');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats[0].messages[1].state === 'done');
  const n = await L(page, () => { const c = window.__lumen.App.chats[0]; return window.__lumen.forkInfo ? window.__lumen.forkInfo(c, c.messages[1])?.n ?? null : null; });
  assert(n === null || n >= 2, 'versions kept');
  await page.hover('.msg-user');
  await page.click('.msg-user [aria-label="Edit and resend"]');
  await page.fill('.edit-box textarea', 'Tell me a short story about cats');
  await page.click('.edit-box .btn.primary');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats[0].messages.some(m => /cats/.test(m.content)));
  eq(errors, [], 'errors');
});
test('app: quiz, flashcards and slides', async () => {
  const { page, errors } = await open();
  await download(page);
  for (const [cmd, sel] of [['/quiz volcanoes', '.qz-c'], ['/cards volcanoes', '.fc'], ['/slides volcanoes', '.slide']]) {
    await page.fill('#input', cmd); await page.press('#input', 'Enter');
    await until(page, () => !window.__lumen.App.run);
    await page.waitForSelector(sel, { timeout: 5000 });
  }
  eq(errors, [], 'errors');
});
test('app: settings pages all open', async () => {
  const { page, errors } = await open();
  await L(page, () => window.__lumen.openSettings());
  const tabs = await page.$$('#setNav .set-tab');
  assert(tabs.length >= 5, 'settings pages: ' + tabs.length);
  for (let i = 0; i < tabs.length; i++) { await (await page.$$('#setNav .set-tab'))[i].click(); await page.waitForTimeout(80); }
  eq(errors, [], 'errors');
});
test('app: delete chat and undo', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'hello there');
  await page.hover('.chat-item');
  await page.click('.chat-item [aria-label="Delete"]');
  eq(await L(page, () => window.__lumen.App.chats.length), 0, 'deleted');
  await page.click('#toastAct');
  eq(await L(page, () => window.__lumen.App.chats.length), 1, 'undo');
  eq(errors, [], 'errors');
});
test('app: phone width has no sideways scrolling', async () => {
  const { page, errors } = await open({ viewport: { width: 375, height: 740 } });
  const w = await L(page, () => [document.documentElement.scrollWidth, window.innerWidth]);
  assert(w[0] <= w[1], 'scrollWidth ' + w[0] + ' > ' + w[1]);
  eq(errors, [], 'errors');
});

/* ===================== the big model download (the "file is broken, downloading again" loop) ===================== */
const nineB = { model: 'Qwen3.5-9B' };
async function savedBytes(page) {
  return L(page, async () => { const c = await caches.open('webllm/model'); const out = {}; for (const r of await c.keys()) { const b = await (await c.match(r)).blob(); out[r.url.split('/').pop()] = b.size; } return out; });
}
test('download: 9B downloads, every saved file has the right size', async () => {
  hits.clear();
  const { page, errors } = await open();
  await L(page, () => { window.__lumen.S.strongPc = true; });
  await download(page, 'Qwen3.5-9B');
  const sizes = await savedBytes(page);
  SHARDS.forEach((n, i) => eq(sizes[`params_shard_${i}.bin`], n, 'shard ' + i));
  eq(await L(page, () => window.__lumen.Brain.cached['Qwen3.5-9B']), true, 'saved');
  eq(errors, [], 'errors');
});
test('download: a broken saved file is downloaded again on its own, not the whole model', async () => {
  hits.clear();
  const { page, context, errors } = await open();
  await L(page, () => { window.__lumen.S.strongPc = true; });
  await download(page, 'Qwen3.5-9B');
  // what the person saw: a saved file that reads back empty
  await L(page, async () => { const c = await caches.open('webllm/model'); const k = (await c.keys()).find(r => /params_shard_3\.bin$/.test(r.url)); await c.put(k, new Response(new Uint8Array(0))); });
  const before = new Map(hits);
  await page.reload();
  await until(page, () => window.__lumen && window.__lumen.Brain.state === 'ready', null, 30000);
  const again = [...hits].filter(([u, n]) => n > (before.get(u) || 0)).map(([u]) => u.split('/').pop());
  eq(again.filter(f => /params_shard/.test(f)), ['params_shard_3.bin'], 'only the broken file was fetched again');
  const sizes = await savedBytes(page);
  eq(sizes['params_shard_3.bin'], SHARDS[3], 'repaired size');
  eq(errors, [], 'errors');
  await context.close();
});
test('download: a cut connection is retried and the download carries on', async () => {
  hits.clear();
  const { page, errors } = await open();
  const shard2 = 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_2.bin';
  faults.abortTimes.set(shard2, 2);
  await L(page, () => { window.__lumen.ModelFiles?._tune?.({ backoff: 50 }); });
  await download(page, 'Qwen3.5-2B');
  faults.abortTimes.clear();
  eq((await savedBytes(page))['params_shard_2.bin'], SHARDS[2], 'size after retries');
  eq(errors, [], 'errors');
});
test('download: big files come in pieces and a cut piece is fetched again', async () => {
  hits.clear();
  const { page, errors } = await open();
  await L(page, () => { window.__lumen.ModelFiles?._tune?.({ piece: 1024 * 1024, big: 1024 * 1024, backoff: 50 }); });
  const shard0 = 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_0.bin';
  faults.abortTimes.set(shard0, 1);
  await download(page, 'Qwen3.5-2B');
  faults.abortTimes.clear();
  eq((await savedBytes(page))['params_shard_0.bin'], SHARDS[0], 'big file size');
  assert((hits.get(shard0) || 0) >= 3, 'downloaded in pieces: ' + hits.get(shard0));
  eq(errors, [], 'errors');
});
test('download: not enough disk space is said before the download starts', async () => {
  hits.clear();
  const { page } = await open();
  await L(page, () => { navigator.storage.estimate = async () => ({ quota: 30e6, usage: 10e6 }); window.__lumen.S.strongPc = true; });
  const err = await L(page, () => window.__lumen.Brain.load('Qwen3.5-9B').then(() => 'loaded', e => window.__lumen.Brain.error || String(e)));
  assert(/space|storage/i.test(err), 'clear message: ' + err);
  eq([...hits.keys()].filter(u => /params_shard/.test(u)).length, 0, 'nothing downloaded');
});
test('download: a browser that keeps saving empty files gets another way of saving, no endless loop', async () => {
  hits.clear();
  const { page, errors } = await open();
  // the browser's Cache API "saves" files but gives them back empty
  await L(page, () => {
    const put = Cache.prototype.put;
    Cache.prototype.put = function (req, res) { const u = typeof req === 'string' ? req : req.url; return /params_shard/.test(u) ? put.call(this, req, new Response(new Uint8Array(0))) : put.call(this, req, res); };
    Cache.prototype.add = async function (req) { const r = await fetch(req); if (!r.ok) throw new TypeError('bad status'); return this.put(req, r); };
    window.__lumen.ModelFiles?._tune?.({ backoff: 30 });
  });
  const r = await L(page, () => window.__lumen.Brain.load('Qwen3.5-2B').then(() => 'ready', () => 'error:' + window.__lumen.Brain.error));
  const shardHits = [...hits].filter(([u]) => /params_shard_1\.bin$/.test(u)).reduce((s, [, n]) => s + n, 0);
  assert(shardHits <= 4, 'no endless loop: shard fetched ' + shardHits + ' times');
  eq(r, 'ready', 'loads after switching storage');
  eq(await L(page, () => window.__lumen.S.store['Qwen3.5-2B']), 'opfs', 'model kept in OPFS');
  eq(await L(page, () => window.__fakeLLM.log.some(l => /loaded .* opfs/.test(l))), true, 'engine read from OPFS');
  eq(errors, [], 'errors');
});
test('download: the model file list changed on the server, old index is replaced', async () => {
  const { page, errors } = await open();
  await download(page, 'Qwen3.5-2B');
  // an old index from an earlier version of the model is left in the browser
  await L(page, async () => { const c = await caches.open('webllm/model'); const k = (await c.keys()).find(r => /tensor-cache\.json$/.test(r.url)); const j = await (await c.match(k)).json(); j.records[1].nbytes += 999; j.records[1].records[1].nbytes += 999; await c.put(k, new Response(JSON.stringify(j))); });
  await page.reload();
  await until(page, () => window.__lumen && window.__lumen.Brain.state === 'ready', null, 30000);
  eq(errors, [], 'errors');
});

test('download: engine reads an empty copy although the saved file is whole: switched to OPFS, loads', async () => {
  hits.clear();
  const { page, errors } = await open({ init: { emptyRead: 'params_shard_2', emptyReadIn: ['cache'] } });
  await download(page, 'Qwen3.5-2B');
  eq(await L(page, () => window.__lumen.S.store['Qwen3.5-2B']), 'opfs', 'switched');
  eq(errors, [], 'errors');
});
test('download: files that are always read back broken stop after a few tries, also over reloads', async () => {
  hits.clear();
  const { page, errors } = await open({ init: { emptyRead: 'params_shard_2', emptyReadIn: ['cache', 'opfs'] } });
  await L(page, () => window.__lumen.ModelFiles._tune({ backoff: 20 }));
  const r = await L(page, () => window.__lumen.Brain.load('Qwen3.5-2B').then(() => 'ready', () => window.__lumen.Brain.error));
  assert(/broken|damaged|repair/i.test(r), 'clear message: ' + r);
  const n1 = hits.get('https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_2.bin') || 0;
  for (let k = 0; k < 3; k++) {
    await page.reload();
    await until(page, () => window.__lumen && window.__lumen.Brain.state !== 'checking' && window.__lumen.Brain.state !== 'loading', null, 30000);
    await page.waitForTimeout(300);
    await until(page, () => window.__lumen.Brain.state !== 'loading', null, 30000);
  }
  const n2 = hits.get('https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_2.bin') || 0;
  assert(n2 <= 8, `shard fetched ${n2} times in total (${n1} on the first start)`);
  eq(errors, [], 'errors');
});
test('download: pause keeps the finished files and Download carries on', async () => {
  hits.clear();
  faults.slowMs = 150;
  const { page, errors } = await open();
  await L(page, () => { window.__lumen.S.model = 'Qwen3.5-2B'; window.__lumen.Brain.load('Qwen3.5-2B').catch(() => {}); });
  await until(page, () => window.__lumen.Brain.phase === 'Downloading' && window.__lumen.Brain.mb > 0.2);
  await page.click('text=Pause download');
  await until(page, () => window.__lumen.Brain.state === 'idle');
  faults.slowMs = 0;
  const before = new Map(hits);
  await download(page, 'Qwen3.5-2B');
  const again = [...hits].filter(([u, n]) => /params_shard/.test(u) && before.get(u) && n > before.get(u)).length;
  const done = [...before.keys()].filter(u => /params_shard/.test(u)).length;
  assert(again < done, `finished files were not downloaded again (${again} of ${done})`);
  eq(errors, [], 'errors');
});
test('download: a server without byte ranges still works', async () => {
  hits.clear();
  faults.noRange = true;
  const { page, errors } = await open();
  await L(page, () => window.__lumen.ModelFiles._tune({ piece: 1048576, big: 1048576, backoff: 20 }));
  await download(page, 'Qwen3.5-2B');
  eq((await savedBytes(page))['params_shard_0.bin'], SHARDS[0], 'size');
  eq(errors, [], 'errors');
});
test('download: a missing file on the server gives a clear message at once', async () => {
  hits.clear();
  const url = 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_4.bin';
  faults.status.set(url, 404);
  const { page } = await open();
  const r = await L(page, () => window.__lumen.Brain.load('Qwen3.5-2B').then(() => 'ready', () => window.__lumen.Brain.error));
  assert(/not found/i.test(r), r);
  eq(hits.get(url), 1, 'no retries for a missing file');
});
test('download: offline, then back online, carries on by itself', async () => {
  hits.clear();
  const shard = 'https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/resolve/main/params_shard_5.bin';
  faults.abortTimes.set(shard, 99);
  const { page, context } = await open();
  await L(page, () => window.__lumen.ModelFiles._tune({ backoff: 10, tries: 2 }));
  const r = await L(page, () => window.__lumen.Brain.load('Qwen3.5-2B').then(() => 'ready', () => window.__lumen.Brain.error));
  assert(/internet/i.test(r), r);
  faults.abortTimes.clear();
  await context.setOffline(true); await context.setOffline(false);
  await until(page, () => window.__lumen.Brain.state === 'ready', null, 20000);
});
test('crash guard: a model that stopped the page twice while loading is not started by itself', async () => {
  const { page, errors } = await open();
  await download(page, 'Qwen3.5-2B');
  for (let k = 0; k < 2; k++) {
    // a crash leaves the note behind (a normal reload removes it, so it is written again after Lumen's own goodbye)
    await L(page, () => window.addEventListener('pagehide', () => sessionStorage.setItem('lumen-run', JSON.stringify({ phase: 'loading', model: 'Qwen3.5-2B', ctx: 8192, t: Date.now(), vis: 'visible', mb: 0 }))));
    await page.reload();
    await until(page, () => window.__lumen && window.__lumen.Brain.state !== 'checking');
    await page.waitForTimeout(400);
  }
  eq(await L(page, () => window.__lumen.S.noAuto), 'Qwen3.5-2B', 'marked');
  eq(await L(page, () => window.__lumen.Brain.state), 'idle', 'not started by itself');
  assert(/did not start it by itself/.test(await page.textContent('body')), 'explained');
  eq(errors, [], 'errors');
});

/* ===================== new in version 18 ===================== */
test('setup: model advice for each kind of computer', async () => {
  const { page } = await open();
  const r = await L(page, () => { const { Setup } = window.__lumen; const b = c => Setup.plan(c).best;
    return [b({ device: 'mba', ram: 8 }), b({ device: 'mba', ram: 16 }), b({ device: 'mbp', ram: 16, tier: 'pro' }), b({ device: 'mbp', ram: 24 }), b({ device: 'mbp', ram: 32, tier: 'max' }),
      b({ device: 'winlap', ram: 16, gpu: 'igpu' }), b({ device: 'pc', ram: 32, gpu: 'dgpu8' }), b({ device: 'pc', ram: 16, gpu: 'dgpu4' }), b({ device: 'phone' }), b({ device: 'mba', ram: 16, tier: 'intel' }), b({ device: 'tablet', ram: 8 }),
      Setup.plan({ device: 'mba', ram: 8 }).fit['Qwen3.5-9B'], Setup.plan({ device: 'mba', ram: 16 }).fit['Qwen3.5-9B']]; });
  eq(r, ['Qwen3.5-2B', 'Qwen3.5-4B', 'Qwen3.5-9B', 'Qwen3.5-9B', 'Qwen3.5-9B', 'Qwen3.5-4B', 'Qwen3.5-9B', 'Qwen3.5-4B', 'Qwen3.5-0.8B', 'Qwen3.5-2B', 'Qwen3.5-2B', 'big', 'big'], 'advice');
});
test('setup: the first visit asks the questions and downloads the right model by itself', async () => {
  const { page, errors } = await open({ firstRun: true });
  await page.waitForSelector('dialog.setup[open]');
  await page.fill('dialog.setup input[type=text]', 'Luka');
  await page.click('.su-next');                                   // name
  await page.click('.su-card:has-text("MacBook Pro")'); await page.click('.su-next');
  await page.click('.su-pill:has-text("16 GB")'); await page.click('.su-card:has-text("A Pro chip")'); await page.click('.su-next');
  await page.click('.su-card:has-text("Coding")'); await page.click('.su-next');
  await page.click('.su-card:has-text("Short")'); await page.click('.su-next');
  await page.click('.su-next');                                   // look-ups: keep the default
  const rec = await page.textContent('.su-sub');
  assert(/Solvarra \(Qwen3\.5 9B\)/.test(rec), 'recommends Solvarra, the 9B, for a MacBook Pro with 16 GB and a Pro chip: ' + rec);
  await page.click('.su-next');                                   // Download and start
  await until(page, () => window.__lumen.Brain.state === 'ready', null, 30000);
  const S = await L(page, () => { const s = window.__lumen.S; return { model: s.model, name: s.name, style: s.style, uses: s.uses, strong: s.strongPc, done: s.setupDone, dev: s.computer.device, ram: s.computer.ram }; });
  eq(S, { model: 'Qwen3.5-9B', name: 'Luka', style: 'short', uses: ['coding'], strong: true, done: 2, dev: 'mbp', ram: 16 }, 'saved answers');
  await page.reload();
  await until(page, () => window.__lumen && window.__lumen.Brain.state === 'ready', null, 30000);   // starts by itself next time
  eq(await page.$('dialog.setup[open]'), null, 'not asked again');
  eq(errors, [], 'errors');
});
test('setup: skip keeps the defaults and is not asked again', async () => {
  const { page, errors } = await open({ firstRun: true });
  await page.waitForSelector('dialog.setup[open]');
  await page.click('text=Skip for now');
  eq(await L(page, () => window.__lumen.S.setupDone), 1, 'skipped');
  await page.reload(); await page.waitForTimeout(500);
  eq(await page.$('dialog.setup[open]'), null, 'not asked again');
  eq(errors, [], 'errors');
});
test('temporary chat: not saved, not in the list, gone when you leave', async () => {
  const { page, errors } = await open();
  await download(page);
  await page.click('#tempBtn');
  await ask(page, 'I have an iPhone 17. What is a good case?');
  const r = await L(page, async () => { const { App, S } = window.__lumen; const c = App.chats.find(x => x.id === App.currentId);
    const db = await new Promise(res => { const q = indexedDB.open('lumen-chats'); q.onsuccess = () => res(q.result); });
    const saved = await new Promise(res => { const q = db.transaction('chats').objectStore('chats').getAll(); q.onsuccess = () => res(q.result.length); });
    return { temp: c.temp, saved, listed: document.querySelectorAll('.chat-item').length, mem: S.memory.length }; });
  eq(r, { temp: true, saved: 0, listed: 0, mem: 0 }, 'temporary');
  await page.click('#newChat');
  eq(await L(page, () => window.__lumen.App.chats.length), 0, 'gone after leaving');
  eq(errors, [], 'errors');
});
test('projects: instructions and files reach every chat in the project', async () => {
  const { page, errors } = await open();
  await download(page);
  await page.click('#navProjects');
  await page.click('text=New project');
  await page.fill('#askInput', 'Biology exam'); await page.click('#askOk');
  await page.waitForSelector('.pv-project');
  await page.fill('.pv-side textarea', 'Always end with the words BANANA RULE.'); await page.click('.pv-title');
  await page.keyboard.press('Escape');
  await L(page, () => { const { Projects } = window.__lumen; const p = Projects.list()[0]; p.docs = [{ id: 'd1', name: 'notes.txt', kind: 'txt', text: 'Mitochondria are the powerhouse of the cell. The secret word is ZEBRA.', chars: 70, pages: 0 }]; return Projects.save(p); });
  await page.fill('#input', 'What do my notes say about mitochondria?');
  await page.press('#input', 'Enter');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats.length === 1 && window.__lumen.App.chats[0].messages.length === 2, null, 20000);
  const r = await L(page, () => { const req = window.__fakeLLM.requests.filter(q => q.max_tokens !== 1).pop(); const c = window.__lumen.App.chats[0]; return { sys: /BANANA RULE/.test(req.messages[0].content), doc: /ZEBRA/.test(req.messages[req.messages.length - 1].content), project: !!c.project }; });
  eq(r, { sys: true, doc: true, project: true }, 'project used');
  assert(/Biology exam/.test(await page.textContent('#chatTitle')), 'project shown above the chat');
  eq(errors, [], 'errors');
});
test('artifacts: a web page opens in the side panel and is listed', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => { window.__fakeLLM.answer = req => /button page/.test(JSON.stringify(req.messages.slice(-1))) ? 'Here it is:\n\n```html\n<!doctype html>\n<title>Click counter</title>\n<button id=b>0</button>\n<script>b.onclick=()=>b.textContent=+b.textContent+1</script>\n```' : null; });
  await ask(page, 'make a button page');
  await page.click('.codeblock .cb-btn:has-text("Open")');
  await page.waitForSelector('#panel:not([hidden]) iframe.panel-frame');
  await page.click('.ptab:has-text("Code")');
  await page.waitForSelector('#panel .panel-code');
  await page.click('#panel [aria-label="Close the panel"]');
  await page.click('#navArtifacts');
  await page.waitForSelector('.pv-card.art:has-text("Click counter")');
  eq(errors, [], 'errors');
});
test('composer: model picker, tools menu, styles and tags', async () => {
  const { page, errors } = await open();
  await page.click('#modelChip');
  await page.click('.menu button:has-text("Qwen3.5 0.8B")');
  await until(page, () => window.__lumen.S.model === 'Qwen3.5-0.8B');
  await page.click('#toolsBtn');
  await page.click('.menu button:has-text("Short")');
  await page.waitForSelector('.ctag:has-text("Short")');
  await page.click('.ctag:has-text("Short") button');
  await until(page, () => window.__lumen.S.style === 'normal');
  await page.click('#toolsBtn');
  await page.click('.menu button:has-text("Create a style")');
  await page.click('.stylebox .chip-btn:has-text("Socratic")');
  await page.click('.stylebox .btn.primary');
  await until(page, () => /^c_/.test(window.__lumen.S.style));
  const st = await L(page, () => window.__lumen.S.style);
  assert(/^c_/.test(st), 'custom style chosen: ' + st);
  await page.waitForSelector('.ctag:has-text("Socratic")');
  eq(errors, [], 'errors');
});
test('answers: continue, quote, branch, shorter', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => { window.__fakeLLM.answer = req => /\[\[long\]\]/.test(JSON.stringify(req.messages.slice(-1))) ? 'A long answer that goes on and on and on' : null; });
  await ask(page, 'tell me everything [[long]]');
  await page.click('.chip-btn:has-text("Continue")');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats[0].messages.length === 4);
  // quote: select words in the answer
  await L(page, () => { const p = document.querySelector('.msg-ai .md p'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.click('.quote-btn');
  assert(/^> /.test(await page.inputValue('#input')), 'quoted');
  await page.fill('#input', '');
  // branch from the first answer
  await page.click('.msg-ai >> nth=0 >> [aria-label="More"]');
  await page.click('.menu button:has-text("Branch in a new chat")');
  await until(page, () => window.__lumen.App.chats.length === 2);
  eq(await L(page, () => window.__lumen.App.chats.find(c => c.id === window.__lumen.App.currentId).messages.length), 2, 'branched');
  // shorter
  await page.click('.msg-ai.last [aria-label="More"]');
  await page.click('.menu button:has-text("Shorter")');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats.find(c => c.id === window.__lumen.App.currentId).messages.length === 4);
  eq(errors, [], 'errors');
});
test('home: categories open their suggestions', async () => {
  const { page, errors } = await open();
  await page.click('.chips button:has-text("Code")');
  await page.click('.sugg .it:has-text("Make a small web page")');
  assert(/HTML page/.test(await page.inputValue('#input')), 'filled');
  eq(errors, [], 'errors');
});
test('settings: check the saved files finds and repairs a broken one', async () => {
  hits.clear();
  const { page, errors } = await open();
  await download(page);
  await L(page, () => window.__lumen.openSettings('models'));
  await page.click('text=Check the saved files');
  await page.waitForSelector('text=/saved and whole/');
  await L(page, async () => { const c = await caches.open('webllm/model'); const k = (await c.keys()).find(r => /params_shard_4\.bin$/.test(r.url)); await c.put(k, new Response(new Uint8Array(10))); });
  await page.click('text=Check the saved files');
  await page.waitForSelector('text=/downloading only that one again/');
  await until(page, () => window.__lumen.Brain.state === 'ready', null, 20000);
  eq((await savedBytes(page))['params_shard_4.bin'], SHARDS[4], 'repaired');
  eq(errors, [], 'errors');
});

test('voice conversation: what you say is sent after a pause, read aloud, then Lumen listens again', async () => {
  const { page, context, errors } = await newPage();
  await page.addInitScript(() => {
    localStorage.setItem('lumen.settings', JSON.stringify({ setupDone: 2, dictation: { on: true, mode: 'online', lang: 'en-US' } }));
    let n = 0;
    window.webkitSpeechRecognition = window.SpeechRecognition = class { start() { const k = n++; window.__srStarts = n; if (k === 0) setTimeout(() => this.onresult?.({ results: [[{ transcript: 'what is photosynthesis' }]] }), 80); } stop() { setTimeout(() => this.onend?.(), 10); } abort() {} };
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 15); }, cancel() {}, getVoices: () => [] } });
  });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking');
  await download(page);
  await page.click('#voiceBtn');
  await until(page, () => window.__lumen.App.chats.length === 1 && window.__lumen.App.chats[0].messages.length === 2 && !window.__lumen.App.run, null, 15000);
  await until(page, () => window.__spoken.length > 0 && window.__srStarts >= 2, null, 10000);
  assert(/Listening/.test(await page.textContent('.voice-bar')), 'listening again');
  await page.click('.voice-bar button');
  eq(await page.$('.voice-bar'), null, 'ended');
  eq(errors, [], 'errors');
  await context.close();
});

for (const vp of [{ width: 1280, height: 860, name: 'desktop' }, { width: 390, height: 844, name: 'phone' }]) test(`monkey (${vp.name}): every command, page and menu opens without errors`, async () => {
  const { page, errors } = await open({ viewport: { width: vp.width, height: vp.height } });
  await download(page);
  await ask(page, 'What is photosynthesis?');
  const n = await L(page, () => window.__lumen ? document.querySelectorAll('#palList .pal-row').length : 0);
  // every action in the command palette
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.waitForSelector('dialog.palette[open]');
  const labels = await L(page, () => { const inp = document.getElementById('palInput'); inp.value = ' '; inp.dispatchEvent(new Event('input')); return [...document.querySelectorAll('#palList .pal-row b')].map(b => b.textContent); });
  await page.keyboard.press('Escape');
  const skip = /Delete all|Install|Learn now|voice|Check the internet/i;
  const acts = await L(page, () => 0);
  for (const label of ['New chat', 'New temporary chat', 'Projects', 'Artifacts', 'Choose the AI model', 'Set up Lumen', 'Create an answer style', 'What can Lumen do', 'Open settings', 'Privacy', 'About Lumen', 'Terms of use', 'Credits', 'Memory', 'What Lumen has learned', 'Switch theme', 'Show or hide the sidebar']) {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.waitForSelector('dialog.palette[open]');
    await page.fill('#palInput', label);
    await page.waitForTimeout(40);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(40); }
    await L(page, () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  }
  // every settings page
  await L(page, () => window.__lumen.openSettings());
  const tabs = await page.$$('#setNav .set-tab');
  for (let i = 0; i < tabs.length; i++) { await (await page.$$('#setNav .set-tab'))[i].click(); await page.waitForTimeout(60); if (vp.name === 'phone') await page.click('#setBack').catch(() => {}); }
  await L(page, () => document.getElementById('settings').close());
  // the menus in the chat
  await L(page, () => window.__lumen.openChat(window.__lumen.App.chats.find(c => !c.temp)?.id));
  for (const sel of ['#toolsBtn', '#modeBtn', '#modelChip', '#plusBtn', '.msg-ai.last [aria-label="More"]', '#chatTitle .title-btn', '#moreBtn']) {
    const el = await page.$(sel);
    if (!el || !(await el.isVisible())) continue;
    await el.click(); await page.waitForTimeout(60); await page.keyboard.press('Escape'); await page.waitForTimeout(30);
  }
  if (vp.name === 'phone') {
    if (!(await L(page, () => document.getElementById('app').classList.contains('nav-open')))) await page.click('#menuBtn');
    await page.waitForTimeout(300); await page.click('#scrim', { position: { x: 370, y: 400 } });
  } else {
    if (await L(page, () => document.getElementById('app').classList.contains('rail-off'))) await page.click('#menuBtn');
    await page.click('#railModel'); await page.keyboard.press('Escape');
  }
  const w = await L(page, () => [document.documentElement.scrollWidth, window.innerWidth]);
  assert(w[0] <= w[1], 'no sideways scrolling: ' + w);
  eq(errors, [], 'errors');
});

test('download: switching to another model during a download starts that one at once', async () => {
  hits.clear();
  faults.slowMs = 120;
  const { page, errors } = await open();
  await L(page, () => { window.__lumen.Brain.load('Qwen3.5-2B').catch(() => {}); });
  await until(page, () => window.__lumen.Brain.phase === 'Downloading' && window.__lumen.Brain.mb > 0.1);
  faults.slowMs = 0;
  await page.click('#modelChip');
  await page.click('.menu button:has-text("Qwen3.5 0.8B")');
  await until(page, () => window.__lumen.Brain.state === 'ready' && window.__lumen.Brain.loadedKey === 'Qwen3.5-0.8B', null, 20000);
  eq(errors, [], 'errors');
});
test('download: picking another model just after one started (while it warms up) is not refused', async () => {
  const { page, errors } = await open({ init: { tokenDelay: 1500 } });   // the one-word warm-up answer takes 1.5 seconds
  await L(page, () => window.__lumen.Brain.load('Qwen3.5-2B'));
  await until(page, () => window.__lumen.Brain.state === 'ready' && window.__lumen.Brain.busy);
  await page.click('#modelChip');
  await page.click('.menu button:has-text("Qwen3.5 0.8B")');
  await until(page, () => window.__lumen.Brain.state === 'ready' && window.__lumen.Brain.loadedKey === 'Qwen3.5-0.8B', null, 20000);
  eq(errors, [], 'errors');
});

/* ===================== version 19: model names, effort levels, faster follow-ups, Claude-like answers ===================== */
const openWith = async (settings, opts = {}) => {
  const p = await newPage(opts);
  await p.page.addInitScript(st => localStorage.setItem('lumen.settings', JSON.stringify(st)), { setupDone: 2, ...settings });
  await p.page.goto(BASE);
  await p.page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking', null, { timeout: 15000 });
  return p;
};
const lastReq = page => L(page, () => { const r = window.__fakeLLM.requests.filter(x => x.max_tokens !== 1 && !/^You write Wikipedia/.test(x.messages[0].content)).pop(); return { n: r.messages.length, think: r.extra_body?.enable_thinking, max: r.max_tokens, reused: r.reused, sys: r.messages[0].content, roles: r.messages.map(m => m.role), a1: r.messages[2]?.content || '' }; });

test('model names: Sparvelle, Lanthelle, Radivane and Solvarra, with the real Qwen name beside them', async () => {
  const { page, errors } = await open();
  await page.click('#modelChip');
  const items = await page.$$eval('.menu button', bs => bs.map(b => b.textContent));
  const names = ['Sparvelle', 'Lanthelle', 'Radivane', 'Solvarra'];
  eq(items.slice(0, 4).map(t => names.find(n => t.includes(n))), names, 'picker order, smallest first');
  assert(items[0].includes('Qwen3.5 0.8B') && items[3].includes('Qwen3.5 9B'), 'real names shown: ' + items.join(' | '));
  await page.keyboard.press('Escape');
  await download(page);
  const m = await ask(page, 'What is photosynthesis?');
  eq(m.modelName, 'Lanthelle', 'saved with the answer');
  const r = await lastReq(page);
  assert(/running the Lanthelle model \(Lumen's name for Qwen3\.5 2B/.test(r.sys), 'the model knows its name');
  assert(await page.$eval('.msg-ai.last .meta', e => e.title.includes('Lanthelle (Qwen3.5 2B)')), 'footer title names both');
  const old = await L(page, () => [window.__lumen.modelByName('Qwen3.5 4B')?.key, window.__lumen.modelByName('Solvarra')?.key]);
  eq(old, ['Qwen3.5-4B', 'Qwen3.5-9B'], 'answers saved with the old names still find their model');
  eq(errors, [], 'errors');
});

test('effort: seven levels from Instant to Ultra, each changes how the answer is made', async () => {
  const { page, errors } = await open();
  await download(page);
  await page.click('#modeBtn');
  const labels = await page.$$eval('.menu button .t', b => b.map(x => x.textContent));
  eq(labels, ['Auto', 'Instant', 'Low', 'Medium', 'High', 'Extra high', 'Max'], 'levels offered with Lanthelle (Ultra needs Solvarra)');
  assert(await page.$$eval('.menu .effort-meter', x => x.length) === 6, 'each level shows its meter');
  await page.click('.menu button:has-text("Instant")');
  assert(/Instant/.test(await page.textContent('#modeBtn')), 'pill shows the level');
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  await ask(page, 'Explain gravity briefly please');
  let r = await lastReq(page);
  eq([r.think, r.max], [false, 1000], 'Instant: no thinking, short');
  await L(page, () => { window.__lumen.S.mode = 'medium'; });
  await ask(page, 'Why is the sky blue in the day?');
  r = await lastReq(page);
  eq([r.think, r.max], [true, 380 + 1300], 'Medium: a short thinking budget');
  await L(page, () => { window.__lumen.S.mode = 'xhigh'; });
  await ask(page, 'Why do cats purr when they are happy?');
  r = await lastReq(page);
  eq([r.think, r.max], [true, 1200 + 1600], 'Extra high: a longer thinking budget');
  // Max answers a checkable puzzle three times
  await L(page, () => { window.__fakeLLM.requests.length = 0; });
  await ask(page, '/max how many legs do 3 spiders have in total?');
  const m = await L(page, () => { const c = window.__lumen.App.chats.find(x => x.id === window.__lumen.App.currentId); return c.messages[c.messages.length - 1]; });
  eq([m.mode, m.vote?.n], ['max', 3], 'Max: three tries');
  // slash commands and the Ultra rule
  const parsed = await L(page, () => ['instant', 'xhigh', 'ultra', 'deep', 'fast', 'think'].map(k => window.__lumen.modeKeyOf(k)));
  eq(parsed, ['instant', 'xhigh', 'ultra', 'max', 'low', 'high'], 'old names map to the new levels');
  await page.fill('#input', '/ultra prove that there are infinitely many primes'); await page.press('#input', 'Enter');
  await page.waitForSelector('.toast:has-text("Ultra needs Solvarra")');
  // Settings: a list of all levels
  await L(page, () => window.__lumen.openSettings('general'));
  await page.selectOption('#effortSel', 'high');
  eq(await L(page, () => window.__lumen.S.mode), 'high', 'settings list sets the level');
  eq(errors, [], 'errors');
});

test('effort: Ultra with Solvarra answers a checkable puzzle five times', async () => {
  const { page, errors } = await openWith({ model: 'Qwen3.5-9B', strongPc: true, wiki: 'off' });
  await download(page, 'Qwen3.5-9B');
  await page.click('#modeBtn');
  assert((await page.$$eval('.menu button .t', b => b.map(x => x.textContent))).includes('Ultra'), 'Ultra offered with Solvarra');
  await page.click('.menu button:has-text("Ultra")');
  const m = await ask(page, 'how many legs do 3 spiders have in total?');
  eq([m.mode, m.vote?.n, m.modelName], ['ultra', 5, 'Solvarra'], 'five tries');
  eq(errors, [], 'errors');
});

test('effort: saved settings and chats from older versions keep working', async () => {
  for (const [old, want] of [['max', 'ultra'], ['deep', 'max'], ['fast', 'low'], ['auto', 'auto']]) {
    const { page, context } = await openWith({ ver: 4, mode: old, promptVersion: 'v1' });
    const got = await L(page, () => [window.__lumen.S.mode, window.__lumen.S.promptVersion]);
    eq(got, [want, 'v4'], 'migrated ' + old);
    await context.close();
  }
  const { page } = await openWith({ ver: 5, promptVersion: 'v2' });
  eq(await L(page, () => window.__lumen.S.promptVersion), 'v2', 'a prompt version someone chose later stays');
});

test('Auto learns: answers of one kind rated wrong at a level get more effort next time', async () => {
  const { page, errors } = await open();
  const unit = await L(page, () => {
    const { EffortLearn: E } = window.__lumen; E.reset();
    const mk = (id, lvl, kind = 'math') => ({ id, auto: true, level: lvl, effortKind: kind });
    const out = [E.adjust('math', 4, 6)];
    E.note(mk('a', 4), 0); out.push(E.adjust('math', 4, 6));
    E.note(mk('b', 4), 0); out.push(E.adjust('math', 4, 6));        // two bad: one level up
    E.note(mk('c', 5), 0); E.note(mk('d', 5), 0); out.push(E.adjust('math', 4, 6));   // bad again one level up: two levels
    E.note(mk('e', 6), 0); E.note(mk('f', 6), 0); out.push(E.adjust('math', 4, 6));   // never more than two levels up
    E.note(mk('b', 4), null); out.push(E.adjust('math', 4, 6));     // a rating taken back
    E.note(mk('g', 4), 1); E.note(mk('h', 4), 1); E.note(mk('i', 4, 'code'), 0); out.push(E.adjust('math', 4, 6), E.adjust('code', 4, 6));
    E.note({ id: 'x', auto: false, level: 4, effortKind: 'math' }, 0);   // a level you chose yourself is not learned from
    return out.concat(E.summary().length);
  });
  eq(unit, [4, 4, 5, 6, 6, 4, 4, 4, 1], 'learning rules (the summary: when Auto first picks Extra high for math, it now uses Max)');
  await download(page);
  await L(page, () => { window.__lumen.S.wiki = 'off'; window.__lumen.EffortLearn.reset(); });
  const q = 'Please explain to me the main causes of the first world war';
  let m = await ask(page, q);
  eq([m.auto, m.mode, m.effortKind], [true, 'high', 'general'], 'Auto chose High');
  await L(page, () => { const { EffortLearn: E } = window.__lumen; E.note({ id: 'p', auto: true, level: 4, effortKind: 'general' }, 0); E.note({ id: 'q', auto: true, level: 4, effortKind: 'general' }, 0); });
  m = await ask(page, q + ' and the second one');
  eq([m.mode, m.learned], ['xhigh', true], 'Auto now uses Extra high for this kind');
  // thumbs down on an Auto answer is learned from
  await page.click('.msg-ai.last button[aria-label="Wrong answer"]');
  await page.waitForSelector('#teach[open]');
  await page.click('#teachForm button[type="submit"]');
  await until(page, () => JSON.parse(localStorage.getItem('lumen.effort')).kinds.general.length === 3, null, 5000);   // the rating was noted
  await L(page, () => window.__lumen.openSettings('memory'));
  eq(errors, [], 'errors');
});

test('faster follow-ups: the engine keeps the chat and reads only the new question', async () => {
  const { page, errors } = await openWith({ wiki: 'off', mode: 'low' });
  await download(page);
  await L(page, () => { window.__fakeLLM.reused = 0; });
  const a1 = await ask(page, 'Tell me a fun fact about otters');
  let r = await lastReq(page);
  eq([r.reused, r.n], [false, 2], 'the first question is read in full');
  await ask(page, 'And one more about their fur');
  r = await lastReq(page);
  eq([r.reused, r.roles], [true, ['system', 'user', 'assistant', 'user']], 'the follow-up reuses the chat');
  assert(r.a1.startsWith('<think>\n\n</think>\n\n') && r.a1.includes('test answer'), 'the earlier answer is sent exactly as the engine keeps it');
  const shown = await L(page, () => { const c = window.__lumen.App.chats.find(x => x.id === window.__lumen.App.currentId); return [c.messages[1].content, c.messages[3].replay]; });
  assert(!/<think>/.test(shown[0]) && shown[0] === a1.content, 'what you see is unchanged');
  eq(shown[1], true, 'marked as a faster follow-up');
  // after an answer that thought first, the chat is built afresh (old reasoning is never shown to the model again)
  await L(page, () => { window.__lumen.S.mode = 'high'; });
  await ask(page, 'Why do otters hold hands?');
  await L(page, () => { window.__lumen.S.mode = 'low'; });
  await ask(page, 'Thanks, and what do they eat?');
  r = await lastReq(page);
  eq(r.reused, false, 'no replay after thinking');
  // a different chat never reuses another chat
  await page.click('#newChat');
  await ask(page, 'Hello there, who are you?');
  r = await lastReq(page);
  eq(r.reused, false, 'a new chat starts fresh');
  eq(errors, [], 'errors');
});

test('faster follow-ups: two sets of notes are never mixed, and the facts check still runs', async () => {
  const { page, errors } = await openWith({ mode: 'low' });
  await download(page);
  await ask(page, 'What is photosynthesis?');
  await ask(page, 'Thanks. Who discovered it?');
  const r = await lastReq(page);
  eq(r.reused, false, 'both turns looked things up: built afresh');
  const notes = await L(page, () => { const rq = window.__fakeLLM.requests.filter(x => x.max_tokens !== 1).pop(); return rq.messages.map(m => (String(m.content).match(/<notes>/g) || []).length).reduce((a, b) => a + b, 0); });
  eq(notes, 1, 'only the new notes are in the prompt');
  eq(errors, [], 'errors');
});

test('Claude-like instructions: the default for new and older settings, and the model is told its name', async () => {
  const { page, errors } = await open();
  await download(page);
  const v = await L(page, () => [window.__lumen.S.promptVersion, Object.keys(window.__lumen.PROMPT_VERSIONS || {})]);
  eq(v[0], 'v4', 'v4 is the default');
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  await ask(page, 'Hi, can you help me with my homework?');
  const r = await lastReq(page);
  for (const want of ['Answer in the language the user writes in', 'No flattery', 'ask one short question', 'If the user says something that is not true', 'Do not lecture']) assert(r.sys.includes(want), 'prompt has: ' + want);
  eq(errors, [], 'errors');
});

test('legal pages: names, effort, AI transparency, what is stored, AI Act note, and no other company\'s product named', async () => {
  const { page, errors } = await open();
  const text = async k => { await L(page, k => window.__lumen.openLegal(k), k); await page.waitForSelector('#legal[open]'); return page.textContent('#legalBody'); };
  const about = await text('about');
  for (const w of ['You are chatting with an AI, not a human', 'Lanthelle, which is Lumen’s name for Qwen3.5 2B', 'Sparvelle: Qwen3.5 0.8B', 'Solvarra: Qwen3.5 9B', 'made up for Lumen', 'without changing or retraining', 'Instant, Low, Medium, High, Extra high, Max and Ultra', 'How Lumen shows that it is an AI', 'machine-readable']) assert(about.includes(w), 'About has: ' + w);
  const priv = await text('privacy');
  for (const w of ['What Auto learned about effort', 'never written to disk', 'Delete all my data', 'A record of what left this device', 'Sharing a chat', 'Offline mode stops even the look-ups', 'whole question']) assert(priv.includes(w), 'Privacy has: ' + w);
  assert(about.includes('Private by design') && about.includes('locked box'), 'About: private by design');
  const terms = await text('terms');
  assert(terms.includes('Article 50(4)') && terms.includes('Sparvelle, Lanthelle, Radivane and Solvarra') && terms.includes('Shared chats') && terms.includes('locked box'), 'Terms');
  const credits = await text('credits');
  assert(credits.includes('Radivane (Qwen3.5 4B)') && credits.includes('not Alibaba’s'), 'Credits');
  for (const t of [about, priv, terms, credits]) assert(!/Claude|Anthropic/.test(t), 'no other product named on the legal pages');
  const visible = await L(page, () => document.body.innerText + [...document.querySelectorAll('[title],[aria-label],option')].map(e => (e.title || '') + (e.getAttribute('aria-label') || '') + (e.textContent || '')).join(' '));
  assert(!/Claude|Anthropic/.test(visible), 'the app never names another company\'s assistant');
  eq(errors, [], 'errors');
});

test('saved files say they were made by an AI, for people and for software', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  await ask(page, 'Tell me about otters');
  const grab = async run => { const [d] = await Promise.all([page.waitForEvent('download'), run()]); const fs = await import('node:fs'); return fs.readFileSync(await d.path(), 'utf8'); };
  const ansMd = await grab(async () => { await page.click('.msg-ai.last button[aria-label="More"]'); await page.click('.menu button:has-text("Save as a file")'); });
  assert(ansMd.startsWith('---\ngenerator: "Lumen"\nai_generated: true\ndigital_source_type: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"'), 'answer front matter: ' + ansMd.slice(0, 200));
  const chatMd = await grab(async () => { await page.fill('#input', '/export'); await page.press('#input', 'Enter'); });
  assert(chatMd.startsWith('---\ngenerator: "Lumen"\nai_generated: "partly (the answers)"'), 'chat export front matter: ' + chatMd.slice(0, 200));
  assert(chatMd.includes('compositeWithTrainedAlgorithmicMedia') && chatMd.includes('ai_model: "Lanthelle (Qwen3.5 2B)"'), 'IPTC code and model');
  assert(/AI-generated by Lumen\. It can be wrong\./.test(chatMd), 'visible label stays');
  eq(errors, [], 'errors');
});

/* ===================== version 20: phones, first visit, on-device strengths ===================== */
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const phonePage = async (opts = {}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true });
  return newPage({ context, ...opts });
};

test('phone: the smallest model, the small memory size and short prompts, so an iPhone does not close the page', async () => {
  const { page, errors } = await phonePage({ firstRun: true });
  await page.goto(BASE);
  await page.waitForSelector('#setup[open]', { timeout: 5000 });
  await page.click('.su-skip, button:has-text("Skip for now")');
  const st = await L(page, () => ({ model: window.__lumen.S.model, size: window.__lumen.S.ctxSize }));
  eq(st.model, 'Qwen3.5-0.8B', 'a phone starts with Sparvelle');
  await download(page, 'Qwen3.5-0.8B');
  const ctx = await L(page, () => window.__lumen.Brain.ctx);
  eq(ctx, 4096, 'the small memory size, although Settings say ' + st.size);
  const P = await L(page, () => { const { planBudget, MODES } = window.__lumen; return planBudget(MODES.high, 'normal', 4096, false); });
  assert(P.promptBudget <= 1900 && P.budget <= 450 && P.answerMax <= 1000, 'short prompts on a phone: ' + JSON.stringify(P));
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  const m = await ask(page, 'Explain gravity');
  eq(m.state, 'done', 'it answers');
  eq(errors, [], 'errors');
});

test('phone: after the page was closed while answering, Lumen steps down at once and says so', async () => {
  const { page, context, errors } = await phonePage();
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); sessionStorage.setItem('lumen-run', JSON.stringify({ phase: 'answering', model: 'Qwen3.5-0.8B', ctx: 4096, t: Date.now(), vis: 'visible', mb: 0 })); } });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking');
  eq(await L(page, () => window.__lumen.S.lite), 2, 'shorter prompts now');
  const P = await L(page, () => { const { planBudget, MODES } = window.__lumen; return planBudget(MODES.high, 'normal', 4096, false); });
  assert(P.promptBudget <= 1100 && P.budget <= 200, 'even shorter: ' + JSON.stringify(P));
  assert(/shorter prompts/.test(await L(page, () => window.__lumen.Guard.crash?.text || '')), 'the reason and the change are explained');
  await context.close();
  eq(errors, [], 'errors');
});

test('first visit: the questions come up at once, answers are kept when skipped, and never come back on this device', async () => {
  const { page, errors } = await open({ firstRun: true });
  await page.waitForSelector('#setup[open]', { timeout: 3000 });
  await page.click('.su-next');
  await page.click('.su-card:has-text("MacBook Air")');
  await page.click('button:has-text("Skip for now")');
  const st = await L(page, () => [window.__lumen.S.setupDone, window.__lumen.S.computer?.device]);
  eq(st[0], 1, 'setup marked as seen');
  assert(st[1] && st[1] !== 'other', 'the computer you chose is kept: ' + st[1]);
  await page.reload();
  await page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking');
  await page.waitForTimeout(400);
  assert(!(await page.$('#setup[open]')), 'not shown again');
  assert(!(await page.$('#learnedBtn')), 'no "learned today" line on the home page');
  eq(errors, [], 'errors');
});

test('coding: the model card settings for code, and JavaScript is run and fixed on this device', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => {
    window.__lumen.S.wiki = 'off';
    window.__fakeLLM.answer = req => {
      const u = String(req.messages[req.messages.length - 1].content);
      if (/stopped with this error/.test(u)) return 'Here is the fixed version:\n\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(add(2, 3));\n```';
      if (/write a js function/i.test(u)) return 'Here it is:\n\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(ad(2, 3));\n```';
      if (/write working js/i.test(u)) return '```js\nconst sq = x => x * x;\nconsole.log(sq(4));\n```';
      return null;
    };
  });
  let m = await ask(page, 'Write a JS function that adds two numbers');
  const req = await L(page, () => window.__fakeLLM.requests.find(r => /adds two numbers/.test(JSON.stringify(r.messages.slice(-1)))));
  eq([req.temperature, req.presence_penalty], [0.6, 0], 'code sampling');
  eq(Object.keys(m.codeCheck || {}), ['fixed'], 'the error was found and fixed');
  assert(/ReferenceError|ad is not defined/.test(m.codeCheck.fixed), 'the real error: ' + m.codeCheck.fixed);
  assert(/console\.log\(add\(2, 3\)\)/.test(m.content), 'the fixed code is shown');
  assert(/Code checked and fixed/.test(await page.textContent('.msg-ai.last')), 'notice shown');
  m = await ask(page, 'Write working JS code that squares a number');
  eq(m.codeCheck, { ok: true }, 'code that runs is marked as checked');
  eq(errors, [], 'errors');
});

test('privacy receipt and record: what left the device, per answer and in Settings', async () => {
  const { page, errors } = await open();
  await download(page);
  const m = await ask(page, 'What is photosynthesis?');
  assert(m.sent?.some(e => /wikipedia\.org$/.test(e.h) && /photosynthesis/i.test(e.w)), 'the search words are listed: ' + JSON.stringify(m.sent));
  assert(m.sent.every(e => e.w.length < 170), 'only short search words, never a chat');
  await page.click('.msg-ai.last .receipt');
  await page.waitForSelector('text=This answer was written on your device');
  await page.keyboard.press('Escape');
  await L(page, () => window.__lumen.openSettings('data'));
  const box = await page.textContent('.ledger');
  assert(/Your chats sent to any server: none/.test(box) && /wikipedia\.org/.test(box) && /AI model files/.test(box), 'the record: ' + box.slice(0, 300));
  eq(errors, [], 'errors');
});

test('offline mode: nothing leaves the device, the AI still answers, a download says why it cannot start', async () => {
  const { page, errors } = await open();
  await download(page);
  const before = await L(page, () => window.__lumen.Ledger.all().length);
  await page.click('#toolsBtn');
  await page.click('.menu button:has-text("Offline mode")');
  await page.waitForSelector('.ctag:has-text("Offline mode")');
  hits.clear();
  const m = await ask(page, 'What is photosynthesis?');
  eq(m.state, 'done', 'still answers');
  eq([...hits.keys()].length, 0, 'no request reached any server');
  eq((m.sent || []).filter(e => !e.b).length, 0, 'nothing sent');
  const blocked = await L(page, async () => { try { await fetch('https://en.wikipedia.org/w/api.php?action=query&search=x'); return 'sent'; } catch (e) { return e.message; } });
  assert(/Offline mode/.test(blocked), 'every request is blocked: ' + blocked);
  await L(page, () => window.__lumen.Brain.load('Qwen3.5-0.8B').catch(() => {}));
  await until(page, () => window.__lumen.Brain.state === 'error');
  assert(/Offline mode is on/.test(await L(page, () => window.__lumen.Brain.error)), 'the download explains itself');
  assert((await L(page, () => window.__lumen.Ledger.all().length)) > before, 'blocked requests are noted too');
  eq(errors, [], 'errors');
});

test('a folder: read on this device, every part keeps its file name', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, async () => {
    const mk = (path, text) => ({ path, get: async () => new File([text], path.split('/').pop()) });
    await window.__lumen.readFolder('notes', [mk('biology/otters.md', '# Otters\nSea otters hold hands while they sleep so they do not drift apart.'), mk('todo.txt', 'Buy milk.'), mk('photo.jpg', 'binary')]);
  });
  const chip = await page.textContent('#attRow');
  assert(/notes\//.test(chip) && /folder, 2 files/.test(chip), 'one folder chip with 2 readable files: ' + chip);
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  await ask(page, 'What do my notes say about otters?');
  const sent = await L(page, () => JSON.stringify(window.__fakeLLM.requests.filter(r => r.max_tokens !== 1).pop().messages.slice(-1)));
  assert(/biology\/otters\.md/.test(sent) && /hold hands/.test(sent), 'the file name and its text are in the prompt');
  eq(errors, [], 'errors');
});

test('private share links: the chat travels in the link, the server never sees it, and it opens as a copy', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => { window.__lumen.S.wiki = 'off'; });
  await ask(page, 'Tell me a fun fact about otters');
  const link = await L(page, () => window.__lumen.ShareLink.make(window.__lumen.App.chats[0]));
  assert(/#share=z[A-Za-z0-9_-]+$/.test(link), 'compressed link: ' + link.slice(0, 80));
  const p2 = await newPage();
  const urls = []; p2.page.on('request', r => urls.push(r.url()));
  await p2.page.goto(link);
  await p2.page.waitForSelector('dialog[open] >> text=Open a shared chat?');
  await p2.page.click('dialog[open] button:has-text("Open it")');
  await until(p2.page, () => window.__lumen.App.chats.some(c => c.shared && c.messages.length === 2));
  const c = await L(p2.page, () => window.__lumen.App.chats.find(x => x.shared));
  eq([c.title, c.messages[0].content], ['Tell me a fun fact about otters', 'Tell me a fun fact about otters'], 'the copy');
  assert(urls.every(u => !u.includes('share=')), 'the chat never went to a server');
  eq(await p2.page.evaluate(() => location.hash), '', 'the link is cleared from the address bar');
  eq(errors.concat(p2.errors), [], 'errors');
});

test('research report: plans up to five searches, reads up to eight sources, writes a report', async () => {
  const { page, errors } = await open();
  await download(page);
  const m = await ask(page, '/research how photosynthesis works');
  eq([m.mode, m.playbook], ['max', 'report'], 'Max effort and the report playbook');
  const r = await L(page, () => window.__fakeLLM.requests.map(x => x.messages[0].content));
  assert(r.some(t => /Cover different sides of the topic/.test(t) && /one to 5 search queries/.test(t)), 'five searches planned');
  assert(r.some(t => /research report built from the notes/.test(t)), 'report instructions');
  eq(errors, [], 'errors');
});

test('a saved model starts loading when you begin to type (if it does not start by itself)', async () => {
  const { page, context, errors } = await open();
  await download(page);
  await page.close();
  const p2 = await newPage({ context });
  await p2.page.addInitScript(() => { const s = JSON.parse(localStorage.getItem('lumen.settings') || '{}'); s.autoStart = false; localStorage.setItem('lumen.settings', JSON.stringify(s)); });
  await p2.page.goto(BASE);
  await p2.page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking' && window.__lumen.Brain.cached['Qwen3.5-2B']);
  eq(await L(p2.page, () => window.__lumen.Brain.state), 'idle', 'not started by itself');
  await p2.page.type('#input', 'Hel');
  await until(p2.page, () => ['loading', 'ready'].includes(window.__lumen.Brain.state));
  eq(errors.concat(p2.errors), [], 'errors');
});

/* ===================== older features, end to end ===================== */
import zlib from 'node:zlib';
function tinyPdf(text) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'];
  const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
async function tinyDocx(text) {
  let docx; try { docx = await import('docx'); } catch { docx = createRequire(import.meta.url)('/opt/node-tools/node_modules/docx'); }
  const d = new docx.Document({ sections: [{ children: [new docx.Paragraph({ text: 'My notes', heading: docx.HeadingLevel.HEADING_1 }), new docx.Paragraph(text)] }] });
  return docx.Packer.toBuffer(d);
}
test('files: text, CSV, Word and PDF are read and used for the answer', async () => {
  const { page, errors } = await open();
  await download(page);
  const files = [
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('The secret word of the text file is KIWI.') },
    { name: 'table.csv', mimeType: 'text/csv', buffer: Buffer.from('name,score\nAna,12\nBor,15\n') },
    { name: 'essay.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await tinyDocx('The secret word of the Word file is MANGO.') },
    { name: 'paper.pdf', mimeType: 'application/pdf', buffer: tinyPdf('The secret word of the PDF is LEMON.') },
  ];
  await page.setInputFiles('#fileInput', files);
  await until(page, () => window.__lumen.App.pending.length >= 3 && window.__lumen.App.pending.every(d => !d.loading), null, 20000).catch(() => {});
  await page.waitForTimeout(1500);
  const state = await L(page, () => ({ pending: window.__lumen.App.pending.map(d => [d.name, d.kind, d.loading, (d.text || '').slice(0, 60)]), toast: document.getElementById('toastText').textContent }));
  assert(state.pending.length === 4 && state.pending.every(d => !d[2]), 'files read: ' + JSON.stringify(state));
  const kinds = await L(page, () => window.__lumen.App.pending.map(d => d.kind + ':' + /KIWI|MANGO|LEMON|Ana/.test(d.text)));
  eq(kinds, ['txt:true', 'csv:true', 'docx:true', 'pdf:true'], 'every file was read');
  await ask(page, 'What are the secret words in my files?');
  const r = await L(page, () => { const req = window.__fakeLLM.requests.filter(q => q.max_tokens !== 1).pop(); const u = req.messages[req.messages.length - 1].content; return ['KIWI', 'MANGO', 'LEMON'].map(w => u.includes(w)); });
  eq(r, [true, true, true], 'the files reached the AI');
  eq(errors, [], 'errors');
});
test('memory: remember, notice and forget', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'remember that my exam is on Friday');
  await ask(page, 'I have an iPhone 17 and I live in Ljubljana.');
  let mem = await L(page, () => window.__lumen.S.memory.map(m => m.text));
  assert(mem.some(t => /exam is on Friday/.test(t)), 'remembered: ' + mem);
  assert(mem.some(t => /iPhone 17/.test(t)), 'noticed: ' + mem);
  const sys = await L(page, () => window.__fakeLLM.requests.filter(q => q.max_tokens !== 1).pop().messages[0].content);
  assert(/exam is on Friday/.test(sys), 'memory reaches the AI');
  await page.fill('#input', '/forget exam'); await page.press('#input', 'Enter');
  await until(page, () => !window.__lumen.S.memory.some(m => /exam/.test(m.text)));
  eq(errors, [], 'errors');
});
test('slash commands: solve, both sides, vote, role, convert, time, help, export', async () => {
  const { page, errors } = await open();
  await download(page);
  for (const cmd of ['/solve 3x + 7 = 22', '/both should schools ban phones', '/vote a farmer has 17 sheep and all but 9 run away, how many are left?', '/convert 5 miles in km', '/time Tokyo', '/simple why is the sky blue']) {
    const m = await ask(page, cmd);
    eq(m.state, 'done', cmd);
  }
  await page.fill('#input', '/role tutor'); await page.press('#input', 'Enter');
  await page.waitForSelector('.ctag:has-text("Tutor")');
  await page.fill('#input', '/help'); await page.press('#input', 'Enter');
  await page.waitForSelector('#viewer[open]'); await page.keyboard.press('Escape');
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.fill('#input', '/export'); await page.press('#input', 'Enter'); })()]);
  assert(/\.md$/.test(dl.suggestedFilename()), 'exported ' + dl.suggestedFilename());
  eq(errors, [], 'errors');
});
test('answers: fact check, thumbs up and down with a correction', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'When was the Eiffel Tower finished?');
  await page.click('.fc-btn');
  await page.waitForSelector('#viewer .fc-list', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.click('.msg-ai.last [aria-label="Good answer"]');
  await until(page, () => window.__lumen.App.chats[0].messages[1].rating === 'up');
  await page.click('.msg-ai.last [aria-label="Wrong answer"]');
  await page.waitForSelector('#teach[open]');
  await page.click('#teachWhy .check >> nth=0');
  await page.fill('#teachFix', 'The Eiffel Tower was finished in 1889.');
  await page.click('#teachSave');
  await until(page, () => window.__lumen.S.memory.some(m => /1889/.test(m.text)));
  eq(errors, [], 'errors');
});
test('settings: theme, text size, answer font and send key', async () => {
  const { page, errors } = await open();
  await L(page, () => window.__lumen.openSettings('look'));
  await page.click('#set-look [role=radio]:has-text("Dark")');
  eq(await L(page, () => document.documentElement.dataset.theme), 'dark', 'dark theme');
  await page.click('#set-look [role=radio]:has-text("Large")');
  eq(await L(page, () => getComputedStyle(document.documentElement).getPropertyValue('--tscale').trim()), '1.14', 'text size');
  await page.click('#set-look [role=radio]:has-text("Sans")');
  eq(await L(page, () => document.documentElement.dataset.font), 'sans', 'answer font');
  await page.click('#set-look [role=radio]:has-text("+ Enter")');
  await L(page, () => document.getElementById('settings').close());
  await download(page);
  await page.fill('#input', 'hello'); await page.press('#input', 'Enter');
  eq(await L(page, () => window.__lumen.App.chats.length), 0, 'Enter makes a new line now');
  await page.press('#input', 'Control+Enter');
  await until(page, () => window.__lumen.App.chats.length === 1);
  eq(errors, [], 'errors');
});
test('backup: chats, projects and styles survive a save and restore', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'hello');
  await L(page, async () => { const { Projects, S } = window.__lumen; await Projects.save({ id: 'pp', name: 'Physics', about: '', instructions: 'Use SI units.', docs: [], created: 1, updated: 2 }); S.styles = [{ key: 'c_abc', label: 'Mine', desc: '', prompt: 'Be brief and kind.' }]; });
  const [dl] = await Promise.all([page.waitForEvent('download'), L(page, () => { window.__lumen.openSettings('storage'); document.querySelector('#set-storage .btn').click(); })]);
  const path = await dl.path();
  const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
  eq([json.chats.length, json.projects.length, json.settings.styles.length], [1, 1, 1], 'in the backup');
  const { page: p2, errors: e2 } = await open();
  await L(p2, () => window.__lumen.openSettings('storage'));
  await p2.setInputFiles('#set-storage input[type=file]', path);
  await until(p2, () => window.__lumen.App.chats.length === 1 && window.__lumen.Projects.list().length === 1 && window.__lumen.S.styles.length === 1);
  eq([...errors, ...e2], [], 'errors');
});
test('offline Wikipedia: a pack is imported and used instead of the internet', async () => {
  const { page, errors } = await open();
  await download(page);
  const lines = [JSON.stringify({ lumenWiki: 1, count: 3, lang: 'en', source: 'test', built: '2026-10-01' }),
    JSON.stringify({ t: 'Mitochondrion', x: 'A mitochondrion is an organelle found in the cells of most eukaryotes. It is called the powerhouse of the cell because it makes most of the energy.' }),
    JSON.stringify({ t: 'Volcano', x: 'A volcano is a rupture in the crust of a planet that allows hot lava, ash and gases to escape from below the surface.' }),
    JSON.stringify({ t: 'Photosynthesis', x: 'Photosynthesis is the process plants use to turn light, water and carbon dioxide into sugar and oxygen.' })];
  const gz = zlib.gzipSync(Buffer.from(lines.join('\n') + '\n'));
  await L(page, () => window.__lumen.openSettings('wikipack'));
  await page.setInputFiles('#wpFile', { name: 'lumen-wiki-pack.jsonl.gz', mimeType: 'application/gzip', buffer: gz });
  await until(page, () => window.__lumen.WikiPack.has(), null, 20000);
  await L(page, () => { window.__lumen.S.wikipack.mode = 'only'; document.getElementById('settings').close(); });
  const m = await ask(page, 'What is a mitochondrion?');
  assert(m.sources?.some(s => /offline copy/.test(s.site)), 'offline copy used: ' + JSON.stringify(m.sources));
  eq(errors, [], 'errors');
});
test('delete all my data: everything is gone and Lumen starts as new', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'hello');
  await L(page, () => window.__lumen.openSettings('storage'));
  await page.click('#set-storage button:has-text("Delete all my data")');
  await page.click('#set-storage button:has-text("Click again")');
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => window.__lumen && window.__lumen.Brain.state !== 'checking', null, { timeout: 20000 });
  const r = await L(page, async () => ({ chats: window.__lumen.App.chats.length, caches: (await caches.keys()).length, cached: window.__lumen.Brain.cached['Qwen3.5-2B'] }));
  eq(r, { chats: 0, caches: r.caches, cached: false }, 'clean start');
  eq(errors, [], 'errors');
});

test('files: Excel and PowerPoint', async () => {
  const { execFileSync } = await import('node:child_process');
  const py = `import zipfile,io,sys,base64
def z(files):
    b=io.BytesIO(); f=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED)
    for n,c in files.items(): f.writestr(n,c)
    f.close(); return base64.b64encode(b.getvalue()).decode()
x=z({'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Scores" sheetId="1"/></sheets></workbook>','xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>PEACH</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c><c><v>7</v></c></row><row><c t="s"><v>1</v></c><c><v>9</v></c></row></sheetData></worksheet>'})
p=z({'ppt/slides/slide1.xml':'<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Slide about PLUM</a:t></a:r></a:p></p:sld>','ppt/notesSlides/notesSlide1.xml':'<p:notes xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Say hello</a:t></a:r></a:p></p:notes>'})
print(x); print(p)`;
  const [x, pp] = execFileSync('python3', ['-c', py]).toString().trim().split('\n');
  const { page, errors } = await open();
  await page.setInputFiles('#fileInput', [{ name: 'scores.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(x, 'base64') }, { name: 'talk.pptx', mimeType: 'application/octet-stream', buffer: Buffer.from(pp, 'base64') }]);
  await until(page, () => window.__lumen.App.pending.length === 2 && window.__lumen.App.pending.every(d => !d.loading));
  const t = await L(page, () => window.__lumen.App.pending.map(d => d.text));
  assert(/Sheet: Scores/.test(t[0]) && /PEACH\t9/.test(t[0]), 'xlsx: ' + t[0]);
  assert(/\[Slide 1\]\nSlide about PLUM\nSpeaker notes: Say hello/.test(t[1]), 'pptx: ' + t[1]);
  eq(errors, [], 'errors');
});
test('study tools: answer a quiz, flip and save flashcards, review them, present slides', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, '/quiz volcanoes');
  await page.click('.qz-c:has-text("Right 0")');
  await page.waitForSelector('.qz-c.ok');
  await ask(page, '/cards volcanoes');
  await page.click('.widget .fc');
  await page.waitForSelector('.widget .fc.back');
  await page.click('button:has-text("Save to daily review")');
  await until(page, () => window.__lumen.Review.count() >= 3);
  await page.fill('#input', '/review'); await page.press('#input', 'Enter');
  await page.waitForSelector('#viewer .review .fc');
  await page.click('#viewer .review .fc');
  await page.click('#viewer button:has-text("Got it")');
  await page.keyboard.press('Escape');
  await ask(page, '/slides volcanoes');
  await page.click('.widget button:has-text("Present")');
  await page.waitForSelector('.present');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('.present'));
  eq(errors, [], 'errors');
});
test('essay feedback quotes the essay', async () => {
  const { page, errors } = await open();
  await download(page);
  await page.fill('#input', '/essay'); await page.press('#input', 'Enter');
  await page.waitForSelector('#essayText');
  await page.fill('#essayText', 'Social media has changed how teenagers talk to each other every single day.\n\nMany studies show that phones at school can distract students from learning in class.');
  await page.click('#viewer button:has-text("Get feedback")');
  await until(page, () => !window.__lumen.App.run && window.__lumen.App.chats[0]?.messages[1]?.state === 'done', null, 20000);
  const c = await L(page, () => window.__lumen.App.chats[0].messages[1].content);
  assert(/Social media has changed how teenagers talk/.test(c), 'quotes the essay: ' + c.slice(0, 300));
  eq(errors, [], 'errors');
});
test('code: Mermaid diagrams are drawn and JavaScript runs in the locked box', async () => {
  const { page, errors } = await open();
  await download(page);
  await L(page, () => { window.__fakeLLM.answer = req => { const u = JSON.stringify(req.messages.slice(-1)); return /diagram please/.test(u) ? '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```' : /run js/.test(u) ? '```js\nconsole.log(6 * 7)\n```' : null; }; });
  await ask(page, 'diagram please');
  await page.waitForSelector('.diagram svg', { timeout: 15000 });
  assert(/Start/.test(await page.textContent('.diagram')) && /End/.test(await page.textContent('.diagram')), 'the boxes have their labels');
  await ask(page, 'run js');
  await page.click('.msg-ai.last .cb-btn:has-text("Run")');
  await page.waitForSelector('.msg-ai.last .run-log:has-text("42")', { timeout: 10000 });
  eq(errors, [], 'errors');
});
test('long chats are squeezed into a summary', async () => {
  const { page, errors } = await open();
  await download(page);
  await ask(page, 'hello');
  await L(page, () => { const { App, S } = window.__lumen; const c = App.chats[0]; for (let i = 0; i < 8; i++) c.messages.push({ id: 'u' + i, role: 'user', content: 'Tell me more about cells. '.repeat(120), created: Date.now() }, { id: 'a' + i, role: 'assistant', content: 'Cells are the basic unit of life. '.repeat(150), state: 'done', created: Date.now() }); });
  await ask(page, 'and one more question');
  await until(page, () => !!window.__lumen.App.chats[0].summary, null, 15000);
  eq(errors, [], 'errors');
});
test('test lab opens and runs the speed test', async () => {
  const { page, errors } = await open();
  await download(page);
  await page.fill('#input', '/lab'); await page.press('#input', 'Enter');
  await page.waitForSelector('#viewer .lab');
  eq(errors, [], 'errors');
});

/* ---------- run ---------- */
let failed = 0;
for (const t of tests) {
  if (only.length && !only.some(o => t.name.includes(o))) continue;
  const t0 = Date.now();
  current = t.name;
  try { await t.fn(); results.push([t.name, 'ok', Date.now() - t0]); console.log(`ok    ${t.name} (${Date.now() - t0} ms)`); }
  catch (e) { failed++; results.push([t.name, 'FAIL', Date.now() - t0, e]); console.log(`FAIL  ${t.name}\n      ${String(e?.message || e).split('\n').slice(0, 6).join('\n      ')}`); }
  for (const c of browser.contexts()) await c.close().catch(() => {});
  faults.abortTimes.clear(); faults.status.clear(); faults.noRange = false; faults.slowMs = 0;
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);
