/* A pretend WebLLM engine for the tests in this folder (never shipped to users).
   It is served in place of vendor/web-llm-0.2.85/index.js by tests/server.mjs.
   - The model list and the "is it saved?" / "delete it" helpers are the REAL ones from WebLLM, so the tests check
     that the files Lumen saves are found and deleted by the real engine code.
   - Loading a model behaves like WebLLM 0.2.85: it reads mlc-chat-config.json, the wasm, the tokenizer and
     tensor-cache.json through the same browser storage ("cache" = Cache API, "opfs", "indexeddb"), downloads what is
     missing 4 files at a time, and checks every tensor record against the shard size, with the same error text
     ("Tensor-cache record range [a, b) exceeds shard size N").
   - Answers come from a few simple rules, so the app can be driven end to end without a graphics chip.
   Tests steer it through globalThis.__fakeLLM (see tests/run.mjs). */
import * as real from '/__real/web-llm/index.js';

export const prebuiltAppConfig = real.prebuiltAppConfig;
export const modelVersion = real.modelVersion;
export const hasModelInCache = real.hasModelInCache;
export const deleteModelAllInfoInCache = real.deleteModelAllInfoInCache;
export const deleteModelInCache = real.deleteModelInCache;
export const deleteModelWasmInCache = real.deleteModelWasmInCache;
export const deleteChatConfigInCache = real.deleteChatConfigInCache;

const T = () => (globalThis.__fakeLLM ||= {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => { (T().log ||= []).push(a.join(' ')); };

function cleanModelUrl(u) { u += u.endsWith('/') ? '' : '/'; if (!/.+\/resolve\/.+\//.test(u)) u += 'resolve/main/'; return new URL(u).href; }

/* Tests can make the engine read a file back empty (what the person with the 9B model saw): __fakeLLM.emptyRead = 'regex', emptyReadIn = ['cache'] */
const emptyRead = (url, kind) => { const t = T(); return !!t.emptyRead && new RegExp(t.emptyRead).test(url) && (t.emptyReadIn || ['cache']).includes(kind); };
/* ----- the three storage kinds, read the way WebLLM reads them ----- */
async function sha256hex(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function store(scope, backend) {
  if (backend === 'opfs') {
    const dir = async () => { let d = await navigator.storage.getDirectory(); d = await d.getDirectoryHandle('tvmjs-opfs-store', { create: true }); for (const p of scope.split('/').filter(Boolean)) d = await d.getDirectoryHandle(encodeURIComponent(p), { create: true }); return d; };
    const entry = async url => {
      const d = await dir(), h = await sha256hex(url);
      let rec, pay;
      try { rec = JSON.parse(await (await (await d.getFileHandle(h + '.record.json')).getFile()).text()); pay = await d.getFileHandle(h + '.bin'); } catch { return null; }
      if (!rec || rec.url !== url) return null;
      return { rec, pay };
    };
    return {
      async has(url) { const e = await entry(url); return !!e && (await e.pay.getFile()).size === e.rec.nbytes; },
      async read(url) { const e = await entry(url); if (!e) return undefined; const f = await e.pay.getFile(); if (emptyRead(url, 'opfs')) return new ArrayBuffer(0); return f.size === e.rec.nbytes ? f.arrayBuffer() : undefined; },
      async add(url, signal) {
        if (await this.has(url)) return;
        const res = await fetch(url, { signal }); if (!res.ok) throw new Error(`ArtifactOPFSCache: Unable to fetch ${url}, received status ${res.status}`);
        const d = await dir(), h = await sha256hex(url);
        try { await d.removeEntry(h + '.record.json'); } catch {}
        const buf = await res.arrayBuffer();
        const w = await (await d.getFileHandle(h + '.bin', { create: true })).createWritable(); await w.write(buf); await w.close();
        const w2 = await (await d.getFileHandle(h + '.record.json', { create: true })).createWritable(); await w2.write(JSON.stringify({ url, nbytes: buf.byteLength })); await w2.close();
      },
    };
  }
  if (backend === 'indexeddb') {
    const db = () => new Promise((res, rej) => { const r = indexedDB.open(scope, 1); r.onupgradeneeded = () => r.result.createObjectStore('urls', { keyPath: 'url' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const get = async url => { const d = await db(); return new Promise(res => { const r = d.transaction('urls').objectStore('urls').get(url); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); };
    return {
      async has(url) { return !!(await get(url)); },
      async read(url) { return (await get(url))?.data; },
      async add(url, signal) {
        if (await this.has(url)) return;
        const res = await fetch(url, { signal }); if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.arrayBuffer(); const d = await db();
        await new Promise((ok, no) => { const r = d.transaction('urls', 'readwrite').objectStore('urls').add({ url, data }); r.onsuccess = ok; r.onerror = () => no(r.error); });
      },
    };
  }
  let c = null; const open = async () => (c ||= await caches.open(scope));
  return {
    async has(url) { return !!(await (await open()).match(new Request(url))); },
    async read(url) { const r = await (await open()).match(new Request(url)); if (!r) throw new Error('Cannot fetch ' + url); if (emptyRead(url, 'cache')) return new ArrayBuffer(0); return r.arrayBuffer(); },
    async add(url, signal) { const cc = await open(); if (!(await cc.match(new Request(url)))) await cc.add(new Request(url, signal ? { signal } : undefined)); },
  };
}
async function fetchWithCache(st, url, signal) {
  if (st.read && (await st.has(url))) { const b = await st.read(url); if (b !== undefined) return b; }
  await st.add(url, signal);
  const b = await st.read(url);
  if (b === undefined) throw new Error('failed to fetch: ' + url);
  return b;
}

/* ----- the engine ----- */
class FakeEngine {
  constructor(cfg) { this.appConfig = cfg.appConfig || prebuiltAppConfig; this.cb = cfg.initProgressCallback; this.loaded = null; this.stop = false; this.chat = { completions: { create: req => this._create(req) } }; }
  setInitProgressCallback(cb) { this.cb = cb; }
  report(p) { try { this.cb?.(p); } catch {} }
  async reload(id, chatOpts) {
    const t = T();
    t.loads = (t.loads || 0) + 1;
    // tests: a start that never answers, as a graphics chip that is stuck or busy (hangLoad: true = always, 'once' = the first time)
    if (t.hangLoad === true || (t.hangLoad === 'once' && !t.hungOnce)) { t.hungOnce = true; t.hungIn = this.inWorker ? 'worker' : 'page'; await new Promise(() => {}); }
    const rec = this.appConfig.model_list.find(m => m.model_id === id);
    if (!rec) throw new Error('Cannot find model record in appConfig for ' + id);
    const backend = this.appConfig.cacheBackend || 'cache';
    const base = cleanModelUrl(rec.model);
    const cfgStore = store('webllm/config', backend), wasmStore = store('webllm/wasm', backend), modelStore = store('webllm/model', backend);
    const t0 = performance.now();
    await fetchWithCache(cfgStore, base + 'mlc-chat-config.json');
    const wasm = await fetchWithCache(wasmStore, rec.model_lib);
    if (!wasm.byteLength) throw new Error('WebAssembly.instantiate(): BufferSource argument is empty');
    if (t.gpuFail) throw new Error(t.gpuFail);
    await fetchWithCache(modelStore, base + 'tokenizer.json');
    const list = JSON.parse(new TextDecoder().decode(await fetchWithCache(modelStore, base + 'tensor-cache.json'))).records;
    const total = list.reduce((s, r) => s + r.nbytes, 0);
    const urls = list.map(r => new URL(r.dataPath, base).href);
    let have = true; for (const u of urls) if (!(await modelStore.has(u))) { have = false; break; }
    this.report({ progress: 0, timeElapsed: 0, text: 'Start to fetch params' });
    let done = 0, n = 0;
    if (!have) {
      t.webllmDownloads = (t.webllmDownloads || 0) + 1;
      const part = async (a, b) => { for (let i = a; i < b; i++) { await modelStore.add(urls[i]); done += list[i].nbytes; n++; this.report({ progress: done / total, timeElapsed: Math.ceil((performance.now() - t0) / 1000), text: `Fetching param cache[${n}/${list.length}]: ${Math.ceil(done / 1048576)}MB fetched. ${Math.floor(done * 100 / total)}% completed, ${Math.ceil((performance.now() - t0) / 1000)} secs elapsed. It can take a while when we first visit this page to populate the cache. Later refreshes will become faster.` }); } };
      const q = Math.floor(list.length / 4);
      await Promise.all([part(0, q), part(q, 2 * q), part(2 * q, 3 * q), part(3 * q, list.length)]);
    }
    done = 0; n = 0;
    for (let i = 0; i < list.length; i++) {
      const buf = new Uint8Array(await fetchWithCache(modelStore, urls[i]));
      for (const r of list[i].records) {
        const end = r.byteOffset + r.nbytes;
        if (end > buf.byteLength) throw new Error(`Tensor-cache record range [${r.byteOffset}, ${end}) exceeds shard size ${buf.byteLength}`);
      }
      done += list[i].nbytes; n++;
      this.report({ progress: done / total, timeElapsed: Math.ceil((performance.now() - t0) / 1000), text: `Loading model from cache[${n}/${list.length}]: ${Math.ceil(done / 1048576)}MB loaded. ${Math.floor(done * 100 / total)}% completed, ${Math.ceil((performance.now() - t0) / 1000)} secs elapsed.` });
    }
    if (chatOpts?.context_window_size > (t.maxCtx || 1e9)) throw new Error('GPUOutOfMemory: could not allocate the KV cache');
    this.report({ progress: 1, timeElapsed: Math.ceil((performance.now() - t0) / 1000), text: 'Finish loading on WebGPU - apple' });
    this.loaded = id; this.ctx = chatOpts?.context_window_size;
    log('loaded', id, backend, chatOpts?.context_window_size);
  }
  async unload() { this.loaded = null; this.conv = null; this.out = ''; }
  async interruptGenerate() { this.stop = true; }
  /* Like WebLLM: the output of the last request, as the engine keeps it (with the empty thinking block when thinking was off). */
  async getMessage() { return this.out || ''; }
  async _create(req) {
    if (!this.loaded) throw new Error('Model not loaded before calling chatCompletion');
    const t = T();
    (t.requests ||= []).push(req);
    // WebLLM keeps the chat it last answered (all messages, plus its own output). If the new request is that chat plus one
    // new user message, only the new message is read (the "KV cache" is reused); otherwise everything is read again.
    const flat = ms => JSON.stringify(ms.map(m => [m.role, m.content]));
    const reused = !!this.conv && flat(req.messages.slice(0, -1)) === flat(this.conv);
    req.reused = reused;
    if (reused) t.reused = (t.reused || 0) + 1; else t.fresh = (t.fresh || 0) + 1;
    this.conv = null; this.out = '';
    if (t.requests.length > 400) t.requests.shift();
    const text = answerFor(req, t);
    if (text instanceof Error) throw text;
    this.stop = false;
    const self = this;
    const delay = t.tokenDelay ?? 2;
    const pieces = text.match(/\S+\s*|\s+/g) || [''];
    const finishLen = /\[\[long\]\]/.test(lastUser(req)) || (req.max_tokens && pieces.length > req.max_tokens);
    const prefix = req.extra_body?.enable_thinking === false ? '<think>\n\n</think>\n\n' : '';
    let said = '';
    const remember = () => { self.out = prefix + said; self.conv = [...req.messages.map(m => ({ role: m.role, content: m.content })), { role: 'assistant', content: self.out }]; };
    return {
      async *[Symbol.asyncIterator]() {
        let k = 0;
        for (const p of pieces) {
          if (self.stop) break;
          if (req.max_tokens && k >= req.max_tokens) break;
          if (delay) await sleep(delay);
          if (t.hangAfter != null && k >= t.hangAfter) await new Promise(() => {});
          k++;
          said += p;
          yield { choices: [{ delta: { content: p }, finish_reason: null }] };
        }
        remember();
        yield { choices: [{ delta: {}, finish_reason: finishLen ? 'length' : 'stop' }] };
        const prompt = req.messages.reduce((s, m) => s + String(m.content || '').length, 0);
        yield { choices: [], usage: { prompt_tokens: Math.ceil(prompt / 4), completion_tokens: k, extra: { decode_tokens_per_s: 42 } } };
      },
    };
  }
}
function lastUser(req) { const u = [...(req.messages || [])].reverse().find(m => m.role === 'user'); return String(u?.content || ''); }
function answerFor(req, t) {
  const sys = String(req.messages?.[0]?.content || ''), u = lastUser(req);
  if (t.answer) { const a = t.answer(req); if (a != null) return a; }
  if (/\[\[error\]\]/.test(u)) return new Error('Something odd happened in the engine');
  if (req.response_format || /Reply with JSON only/.test(u)) {
    if (/"questions"/.test(u) || /quiz/i.test(sys)) return JSON.stringify({ title: 'Test quiz', questions: [0, 1, 2, 3, 4].map(i => ({ question: `Question ${i + 1} about the topic?`, choices: [`Right ${i}`, `Wrong A${i}`, `Wrong B${i}`, `Wrong C${i}`], answer: 0, why: 'Because it is right.' })) });
    if (/"cards"/.test(u) || /flashcards/i.test(sys)) return JSON.stringify({ title: 'Test cards', cards: [1, 2, 3, 4, 5].map(i => ({ front: `Term ${i}`, back: `Meaning ${i}` })) });
    if (/"slides"/.test(u) || /slide decks/i.test(sys)) return JSON.stringify({ title: 'Test deck', subtitle: 'A test', slides: [1, 2, 3, 4].map(i => ({ title: `Slide ${i}`, bullets: ['First point here', 'Second point here', 'Third point here'], notes: 'Say this.' })) });
    return '{}';
  }
  if (/^You give feedback on ONE paragraph/.test(sys)) {
    const para = (u.match(/<paragraph>\n?([\s\S]*?)\n?<\/paragraph>/) || [, ''])[1];
    const sent = (para.match(/[^.!?]{25,}[.!?]/) || [para])[0].trim();
    return JSON.stringify({ comments: [{ quote: sent, kind: 'Clarity', comment: 'Say this more simply.', better: 'A simpler sentence.' }] });
  }
  if (/^You choose the most important fixes/.test(sys)) return JSON.stringify({ top: [1], extra: [] });
  if (/^You estimate the level a student essay/.test(sys)) return JSON.stringify({ levels: [] });
  if (/^You write Wikipedia search queries/.test(sys)) return 'photosynthesis\nplant energy';
  if (/^You list the factual claims/.test(sys)) return 'Paris is the capital of France.\nThe Eiffel Tower was finished in 1889.';
  if (/^You check one claim/.test(sys)) return 'supported';
  if (/keep the memory of a tutoring chat/.test(sys)) return 'The user asked several test questions about photosynthesis and got short answers.';
  if (/faithful summaries of parts/.test(sys)) return 'This part explains the main idea of the file.';
  if (/Final answer:/.test(u)) return 'Step 1: count. Step 2: check.\n\nFinal answer: 9';
  if (req.max_tokens === 1) return 'Hi';
  const q = (u.match(/My question: ([\s\S]*?)(?:\n\n\(Take every|$)/) || [, u])[1].trim().slice(0, 80);
  const think = req.extra_body?.enable_thinking ? '<think>Let me think about what the user is asking. I will check the notes and plan the answer.</think>\n' : '';
  const cite = /<notes>/.test(u) ? ' [1]' : '';
  return think + `**Short answer:** here is a test answer about “${q}”${cite}.\n\nIt explains the idea in simple steps:\n\n1. First step.\n2. Second step.\n\nThat is all.`;
}

export async function CreateMLCEngine(id, cfg = {}, chatOpts) { const e = new FakeEngine(cfg); T().lastWay = 'page'; await e.reload(id, chatOpts); return e; }
/* The real one runs the engine in a worker. The pretend one ignores the worker and runs in the page. */
export async function CreateWebWorkerMLCEngine(worker, id, cfg = {}, chatOpts) { if (T().workerFails) throw new Error('worker-failed'); const e = new FakeEngine(cfg); e.inWorker = true; T().lastWay = 'worker'; await e.reload(id, chatOpts); return e; }
export class WebWorkerMLCEngineHandler { onmessage() {} }
