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
async function newPage({ viewport = { width: 1280, height: 860 }, init = {}, context: ctxIn, gpu = true } = {}) {
  const context = ctxIn || await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|status of 40\d|status of 50\d|JSON attempt failed|A saved model file is broken|engine said|Something odd happened|Error: stopped|stalled|cancelled|worker-failed|exceeds shard size|Tensor-cache record/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.addInitScript(({ init, gpu }) => {
    globalThis.__fakeLLM = { tokenDelay: 1, ...init };
    if (gpu) {
      const adapter = { features: new Set(['shader-f16']), info: { vendor: 'apple', architecture: 'metal-3', description: '' }, limits: { maxBufferSize: 4294967296, maxStorageBufferBindingSize: 4294967292 }, requestDevice: async () => ({ lost: new Promise(() => {}), limits: {}, features: new Set() }) };
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' } });
    } else Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  }, { init, gpu });
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
  eq(r.pm, ['fast', 'think', 'deep'], 'pickMode');
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
