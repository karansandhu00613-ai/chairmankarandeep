#!/usr/bin/env node
/**
 * Behavioural tests for the LLM failover chain.
 *
 * These run the real scripts/llm.js against real HTTP servers standing in for
 * Gemini and Groq. Nothing here mocks the code under test: the chain opens
 * sockets, reads status codes and decides for itself whether to move on, which
 * is the only way to know that a spent free tier really does roll over to the
 * next provider instead of failing the request.
 *
 * Each case records what the fake providers were actually asked, so a test can
 * prove a provider was never called rather than only that the answer looked
 * right.
 */

const http = require('http');
const path = require('path');

const LLM = path.join(__dirname, 'llm.js');

let passed = 0;
let failed = 0;

function check(cond, what) {
  if (!cond) throw new Error(what);
}

async function test(name, fn) {
  try {
    await fn();
    console.log('✅ ' + name);
    passed++;
  } catch (e) {
    console.log('❌ ' + name + ': ' + e.message);
    failed++;
  }
}

/** A models-list call, as opposed to an actual generate call. */
function isListCall(url) {
  const path = url.split('?')[0];
  if (path.endsWith('/models')) return true;                    // OpenAI-compatible shape
  return url.indexOf('/v1beta/models?') === 0;                  // Gemini shape
}

/**
 * A stand-in provider. `replies` is a queue of [status, body] pairs; each
 * request takes the next one, and the last is reused once the queue runs dry.
 *
 * The chain asks a free provider which models it serves before its first call,
 * so by default this answers that list itself with one ordinary chat model and
 * does NOT consume the queue. A test that cares about discovery passes its own
 * `opts.models` reply, and then the list is answered from that instead.
 */
function fakeProvider(replies, opts) {
  const options = opts || {};
  const calls = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
      calls.push({ url: req.url, auth: req.headers.authorization || '', body: parsed });

      if (isListCall(req.url)) {
        const list = options.models || {
          data: [{ id: 'a-chat-model' }],
          models: [{ name: 'models/a-chat-model', supportedGenerationMethods: ['generateContent'] }]
        };
        res.writeHead(options.modelsStatus || 200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(list));
      }

      const [status, payload] = replies[Math.min(i++, replies.length - 1)];
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        calls,
        url: 'http://127.0.0.1:' + server.address().port,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

/** The calls that actually asked for an answer, excluding model discovery. */
const asks = f => f.calls.filter(c => !isListCall(c.url));

const geminiText = t => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const groqText = t => ({ choices: [{ message: { content: t } }] });

// The module reads process.env at call time, so each case sets its own world
// and this restores it afterwards. Requiring llm.js fresh is unnecessary.
const LLM_VARS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY',
  'GEMINI_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL',
  'GEMINI_MODEL', 'GROQ_MODEL', 'OPENAI_MODEL',
  'LLM_ORDER', 'LLM_TIMEOUT_MS'];

function withEnv(vars, fn) {
  // Discovery is cached per provider for the life of the process, which is what
  // we want in production and exactly wrong between test cases.
  require(LLM).forgetModels();
  const saved = {};
  LLM_VARS.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, vars);
  return Promise.resolve().then(fn).finally(() => {
    LLM_VARS.forEach(k => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });
}

async function run() {
  console.log('\n🧪 LLM failover tests\n');
  const llm = require(LLM);

  await test('With no key set, it says so instead of pretending', async () => {
    await withEnv({}, async () => {
      check(llm.configured().length === 0, 'a provider looked configured with no key');
      const r = await llm.ask('hello');
      check(r.ok === false, 'reported success with nothing configured');
      check(/GEMINI_API_KEY/.test(r.error), 'error does not name the variable to set: ' + r.error);
    });
  });

  await test('A working first provider answers and the second is never called', async () => {
    const gem = await fakeProvider([[200, geminiText('chain ok')]]);
    const groq = await fakeProvider([[200, groqText('should not be reached')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed against a healthy provider: ' + r.error);
        check(r.text === 'chain ok', 'wrong text: ' + r.text);
        check(r.provider === 'Gemini', 'wrong provider: ' + r.provider);
        check(r.tried.length === 0, 'reported failures that did not happen');
        check(groq.calls.length === 0, 'called the second provider unnecessarily');
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('A spent free tier (429) rolls over to the next provider', async () => {
    const gem = await fakeProvider([[429, { error: { message: 'Quota exceeded' } }]]);
    const groq = await fakeProvider([[200, groqText('served by the backup')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === true, 'did not fail over: ' + r.error);
        check(r.provider === 'Groq', 'wrong provider after failover: ' + r.provider);
        check(r.text === 'served by the backup', 'wrong text: ' + r.text);
        check(r.tried.length === 1 && r.tried[0].status === 429,
          'did not record why the first provider was skipped');
        check(/Quota exceeded/.test(r.tried[0].error), 'lost the provider reason');
        check(asks(groq).length === 1, 'backup was asked ' + asks(groq).length + ' times');
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('A rejected request (400) does not waste the other provider', async () => {
    const gem = await fakeProvider([[400, { error: { message: 'Invalid argument' } }]]);
    const groq = await fakeProvider([[200, groqText('should not be reached')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === false, 'reported success on a rejected request');
        check(groq.calls.length === 0, 'burned the backup on a request that fails everywhere');
        check(/Invalid argument/.test(r.error), 'hid the real reason: ' + r.error);
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('A 200 with no text is treated as a failure, not an empty answer', async () => {
    const gem = await fakeProvider([[200, { candidates: [] }]]);
    const groq = await fakeProvider([[200, groqText('real answer')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === true, 'gave up on an empty first response');
        check(r.text === 'real answer', 'returned an empty answer: ' + JSON.stringify(r.text));
        check(r.provider === 'Groq', 'wrong provider: ' + r.provider);
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('When every provider fails, each reason is reported', async () => {
    const gem = await fakeProvider([[429, { error: { message: 'Quota exceeded' } }]]);
    const groq = await fakeProvider([[503, { error: { message: 'Service unavailable' } }]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === false, 'claimed an answer when both providers failed');
        check(r.text === undefined, 'returned text that no provider sent');
        check(r.tried.length === 2, 'recorded ' + r.tried.length + ' attempts, expected 2');
        check(/Gemini/.test(r.error) && /Groq/.test(r.error),
          'error does not name both providers: ' + r.error);
        check(/Quota exceeded/.test(r.error) && /Service unavailable/.test(r.error),
          'error loses the individual reasons: ' + r.error);
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('An unreachable provider is survived, not fatal', async () => {
    const groq = await fakeProvider([[200, groqText('backup answered')]]);
    // A port nothing is listening on: connection refused, not an HTTP status.
    const dead = await fakeProvider([[200, {}]]);
    const deadUrl = dead.url;
    await dead.close();
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: deadUrl, GROQ_BASE_URL: groq.url
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === true, 'a dead provider killed the chain: ' + r.error);
        check(r.provider === 'Groq', 'wrong provider: ' + r.provider);
        check(r.tried.length === 1 && /ECONNREFUSED|connect/i.test(r.tried[0].error || ''),
          'did not record the connection failure: ' + JSON.stringify(r.tried));
      });
    } finally { await groq.close(); }
  });

  await test('LLM_ORDER decides who is asked first', async () => {
    const gem = await fakeProvider([[200, geminiText('gemini answered')]]);
    const groq = await fakeProvider([[200, groqText('groq answered')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GROQ_API_KEY: 'q-key',
        GEMINI_BASE_URL: gem.url, GROQ_BASE_URL: groq.url,
        LLM_ORDER: 'groq,gemini'
      }, async () => {
        const r = await llm.ask('hello');
        check(r.provider === 'Groq', 'ignored LLM_ORDER: ' + r.provider);
        check(gem.calls.length === 0, 'called the deprioritised provider anyway');
      });
    } finally { await gem.close(); await groq.close(); }
  });

  await test('A provider with no key is skipped rather than called without one', async () => {
    const groq = await fakeProvider([[200, groqText('only groq is configured')]]);
    try {
      await withEnv({ GROQ_API_KEY: 'q-key', GROQ_BASE_URL: groq.url }, async () => {
        check(llm.configured().join() === 'groq', 'configured() is wrong: ' + llm.configured());
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed with one provider configured: ' + r.error);
        check(r.tried.length === 0, 'reported a failure for a provider it never called');
        check(groq.calls[0].auth === 'Bearer q-key', 'key not sent: ' + groq.calls[0].auth);
      });
    } finally { await groq.close(); }
  });

  await test('The system instruction reaches both providers', async () => {
    const gem = await fakeProvider([[200, geminiText('ok')]]);
    const groq = await fakeProvider([[200, groqText('ok')]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'g-key', GEMINI_BASE_URL: gem.url
      }, async () => { await llm.ask('hello', 'BE STRICT'); });
      await withEnv({
        GROQ_API_KEY: 'q-key', GROQ_BASE_URL: groq.url
      }, async () => { await llm.ask('hello', 'BE STRICT'); });

      check(JSON.stringify(asks(gem)[0].body).includes('BE STRICT'),
        'Gemini did not receive the system instruction');
      const first = asks(groq)[0].body.messages[0];
      check(first.role === 'system' && first.content === 'BE STRICT',
        'Groq did not receive the system instruction');
    } finally { await gem.close(); await groq.close(); }
  });

  // ---- OpenAI, a model this code has never heard of --------------------------

  await test('OpenAI without a model id says so instead of guessing one', async () => {
    await withEnv({ OPENAI_API_KEY: 'sk-test' }, async () => {
      const r = await llm.ask('hello');
      check(r.ok === false, 'answered with no model set');
      check(/OPENAI_MODEL/.test(r.error), 'error does not name the variable: ' + r.error);
    });
  });

  await test('OpenAI answers through the chat endpoint', async () => {
    const oai = await fakeProvider([[200, { choices: [{ message: { content: 'gpt speaking' } }] }]]);
    try {
      await withEnv({
        OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: oai.url, OPENAI_MODEL: 'some-future-model'
      }, async () => {
        const r = await llm.ask('hello', 'BE STRICT');
        check(r.ok === true, 'failed: ' + r.error);
        check(r.text === 'gpt speaking', 'wrong text: ' + r.text);
        check(r.provider === 'OpenAI', 'wrong provider: ' + r.provider);
        check(r.model === 'some-future-model', 'did not use the given model: ' + r.model);
        check(oai.calls[0].url === '/v1/chat/completions', 'wrong endpoint: ' + oai.calls[0].url);
        check(oai.calls[0].auth === 'Bearer sk-test', 'key not sent');
      });
    } finally { await oai.close(); }
  });

  // A model served only by the Responses API says so. Following that is what
  // makes a model this code predates work without a code change.
  await test('A model that requires the Responses API is retried there', async () => {
    const oai = await fakeProvider([
      [400, { error: { message: 'This model is not supported in the v1/chat/completions endpoint. Use v1/responses.' } }],
      [200, { output: [{ content: [{ type: 'output_text', text: 'answered via responses' }] }] }]
    ]);
    try {
      await withEnv({
        OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: oai.url, OPENAI_MODEL: 'some-future-model'
      }, async () => {
        const r = await llm.ask('hello', 'BE STRICT');
        check(r.ok === true, 'did not retry: ' + r.error);
        check(r.text === 'answered via responses', 'wrong text: ' + r.text);
        check(oai.calls.length === 2, 'expected two calls, got ' + oai.calls.length);
        check(oai.calls[1].url === '/v1/responses', 'wrong retry endpoint: ' + oai.calls[1].url);
        check(oai.calls[1].body.instructions === 'BE STRICT',
          'the standing orders were dropped on the retry');
      });
    } finally { await oai.close(); }
  });

  await test('An OpenAI error unrelated to the endpoint is reported, not retried', async () => {
    const oai = await fakeProvider([[401, { error: { message: 'Incorrect API key provided' } }]]);
    try {
      await withEnv({
        OPENAI_API_KEY: 'sk-wrong', OPENAI_BASE_URL: oai.url, OPENAI_MODEL: 'm'
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === false, 'a bad key reported success');
        check(/Incorrect API key/.test(r.error), 'lost the reason: ' + r.error);
        check(oai.calls.length === 1, 'retried a request that would fail the same way');
      });
    } finally { await oai.close(); }
  });

  await test('The free tiers are asked before the paid one by default', async () => {
    const gem = await fakeProvider([[200, geminiText('free tier answered')]]);
    const oai = await fakeProvider([[200, { choices: [{ message: { content: 'paid' } }] }]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url,
        OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: oai.url, OPENAI_MODEL: 'm'
      }, async () => {
        // Assert the property, not a fixed list: adding a provider must not
        // break this test, but putting a paid one before a free one must.
        const found = llm.all();
        const costs = llm.order().map(n => found[n].cost);
        const lastFree = costs.lastIndexOf('free');
        const firstPaid = costs.indexOf('paid');
        check(firstPaid === -1 || firstPaid > lastFree,
          'a paid provider is asked before a free one: ' + llm.order().join());
        const r = await llm.ask('hello');
        check(r.provider === 'Gemini', 'went to the paid provider first: ' + r.provider);
        check(oai.calls.length === 0, 'spent money when a free tier was available');
      });
    } finally { await gem.close(); await oai.close(); }
  });

  await test('A spent free tier falls through to the paid provider', async () => {
    const gem = await fakeProvider([[429, { error: { message: 'Quota exceeded' } }]]);
    const groq = await fakeProvider([[429, { error: { message: 'Rate limit reached' } }]]);
    const oai = await fakeProvider([[200, { choices: [{ message: { content: 'paid backup' } }] }]]);
    try {
      await withEnv({
        GEMINI_API_KEY: 'k', GEMINI_BASE_URL: gem.url,
        GROQ_API_KEY: 'q', GROQ_BASE_URL: groq.url,
        OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: oai.url, OPENAI_MODEL: 'm'
      }, async () => {
        const r = await llm.ask('hello');
        check(r.ok === true, 'the chain gave up: ' + r.error);
        check(r.provider === 'OpenAI', 'wrong final provider: ' + r.provider);
        check(r.tried.length === 2, 'wrong number of skipped providers: ' + r.tried.length);
      });
    } finally { await gem.close(); await groq.close(); await oai.close(); }
  });

  // ---- Model discovery -------------------------------------------------------
  // Groq deprecated llama-3.3-70b-versatile, which was this file's default, and
  // a correctly configured key started failing with "the model does not exist".
  // The fix is not a newer default: it is asking the provider.

  await test('No model id is hardcoded as a default any more', () => {
    const src = require('fs').readFileSync(LLM, 'utf8');
    const defaults = src.match(/GROQ_MODEL\s*\|\|\s*'[^']+'|GEMINI_MODEL\s*\|\|\s*'[^']+'/g);
    check(!defaults, 'a model default is back in the source: ' + defaults);
    check(!/['"]llama-3\.3-70b-versatile['"]/.test(src),
      'the deprecated Groq model is back as a value, not just named in a comment');
  });

  await test('Groq is asked which models it has, and a chat model is chosen', async () => {
    const groq = await fakeProvider([[200, groqText('picked correctly')]], {
      models: { data: [
        { id: 'whisper-large-v3' },
        { id: 'openai/gpt-oss-20b' },
        { id: 'openai/gpt-oss-120b' },
        { id: 'meta-llama/llama-guard-4-12b' }
      ] }
    });
    try {
      await withEnv({ GROQ_API_KEY: 'q-key', GROQ_BASE_URL: groq.url }, async () => {
        llm.forgetModels();
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed: ' + r.error);
        check(r.model === 'openai/gpt-oss-120b', 'chose the wrong model: ' + r.model);
        check(groq.calls[0].url === '/openai/v1/models', 'did not list first: ' + groq.calls[0].url);
        check(groq.calls[0].auth === 'Bearer q-key', 'listed without the key');
        check(groq.calls.length === 2, 'expected list then ask, got ' + groq.calls.length);
      });
    } finally { await groq.close(); }
  });

  await test('Speech and moderation models are never chosen to hold a conversation', () => {
    check(llm.pick(['whisper-large-v3', 'meta-llama/llama-guard-4-12b', 'some-chat-model'], 'groq')
      === 'some-chat-model', 'picked a non-chat model');
    check(llm.pick(['text-embedding-004', 'imagen-3.0', 'gemini-x'], 'gemini') === 'gemini-x',
      'picked an embedding or image model');
  });

  await test('A provider that changes its whole line-up still works', () => {
    // Nothing on the preference list; it must still find something usable.
    check(llm.pick(['brand-new-model-2027'], 'groq') === 'brand-new-model-2027',
      'refused an unfamiliar model instead of using it');
    check(llm.pick(['whisper-only'], 'groq') === null, 'accepted a line-up with no chat model');
  });

  await test('An explicit model id skips discovery entirely', async () => {
    const groq = await fakeProvider([[200, groqText('explicit wins')]]);
    try {
      await withEnv({
        GROQ_API_KEY: 'q-key', GROQ_BASE_URL: groq.url, GROQ_MODEL: 'my-exact-choice'
      }, async () => {
        llm.forgetModels();
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed: ' + r.error);
        check(r.model === 'my-exact-choice', 'ignored the explicit model: ' + r.model);
        check(groq.calls.length === 1, 'listed models when it did not need to');
        check(groq.calls[0].url === '/openai/v1/chat/completions', 'wrong endpoint');
      });
    } finally { await groq.close(); }
  });

  await test('Gemini only picks a model that can answer generateContent', async () => {
    const gem = await fakeProvider([[200, geminiText('gemini picked correctly')]], {
      models: { models: [
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] }
      ] }
    });
    try {
      await withEnv({ GEMINI_API_KEY: 'g-key', GEMINI_BASE_URL: gem.url }, async () => {
        llm.forgetModels();
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed: ' + r.error);
        check(r.model === 'gemini-2.0-flash', 'chose the wrong model: ' + r.model);
        check(gem.calls[0].url.indexOf('/v1beta/models?key=') === 0,
          'did not list first: ' + gem.calls[0].url);
      });
    } finally { await gem.close(); }
  });

  await test('A provider whose list cannot be read fails over instead of stopping', async () => {
    const gem = await fakeProvider([[200, geminiText('never reached')]],
      { modelsStatus: 500, models: { error: { message: 'list is down' } } });
    const groq = await fakeProvider([[200, groqText('backup answered')]],
      { models: { data: [{ id: 'openai/gpt-oss-120b' }] } });
    try {
      await withEnv({
        GEMINI_API_KEY: 'g', GEMINI_BASE_URL: gem.url,
        GROQ_API_KEY: 'q', GROQ_BASE_URL: groq.url
      }, async () => {
        llm.forgetModels();
        const r = await llm.ask('hello');
        check(r.ok === true, 'a failed model list killed the chain: ' + r.error);
        check(r.provider === 'Groq', 'wrong provider: ' + r.provider);
        check(/list is down/.test(r.tried[0].error), 'lost the real reason: ' + r.tried[0].error);
      });
    } finally { await gem.close(); await groq.close(); }
  });

  // ---- Keys found in the environment ----------------------------------------
  // Karan adds keys to Render and expects them used. A key that cannot be used
  // must be reported, never silently dropped.

  await test('A key for an unknown provider is used once its base URL is set', async () => {
    const svc = await fakeProvider([[200, groqText('the unknown provider answered')]]);
    try {
      await withEnv({ SOMENEWAI_API_KEY: 'k', SOMENEWAI_BASE_URL: svc.url }, async () => {
        check(llm.configured().indexOf('somenewai') !== -1,
          'did not pick the key up: ' + llm.configured().join());
        const r = await llm.ask('hello');
        check(r.ok === true, 'failed: ' + r.error);
        check(r.text === 'the unknown provider answered', 'wrong text: ' + r.text);
      });
    } finally {
      await svc.close();
      delete process.env.SOMENEWAI_API_KEY;
      delete process.env.SOMENEWAI_BASE_URL;
    }
  });

  await test('A key with nowhere to send it is reported, not ignored', async () => {
    await withEnv({ MYSTERYAI_API_KEY: 'k' }, async () => {
      const stuck = llm.unusable();
      const mine = stuck.find(u => u.variable === 'MYSTERYAI_API_KEY');
      check(!!mine, 'the key was silently dropped: ' + JSON.stringify(stuck));
      check(mine.needs === 'MYSTERYAI_BASE_URL', 'wrong fix named: ' + mine.needs);
      check(llm.configured().indexOf('mysteryai') === -1, 'tried to use a key with no endpoint');
    });
    delete process.env.MYSTERYAI_API_KEY;
  });

  await test('A known provider is never reported as unusable', async () => {
    await withEnv({ GROQ_API_KEY: 'k' }, async () => {
      check(!llm.unusable().some(u => u.variable === 'GROQ_API_KEY'),
        'a provider it knows was called unusable');
    });
  });

  await test('An unknown provider is asked before the ones that certainly bill', async () => {
    await withEnv({
      GROQ_API_KEY: 'k', SOMENEWAI_API_KEY: 'k', SOMENEWAI_BASE_URL: 'https://example.test/v1',
      OPENAI_API_KEY: 'k', OPENAI_MODEL: 'm'
    }, async () => {
      const o = llm.order();
      check(o.indexOf('groq') < o.indexOf('somenewai'), 'free tier not first: ' + o.join());
      check(o.indexOf('somenewai') < o.indexOf('openai'),
        'an unknown-cost key was asked after a paid one: ' + o.join());
    });
    delete process.env.SOMENEWAI_API_KEY;
    delete process.env.SOMENEWAI_BASE_URL;
  });

  console.log('\n📊 ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
