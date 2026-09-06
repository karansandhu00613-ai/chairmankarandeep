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

/**
 * A stand-in provider. `replies` is a queue of [status, body] pairs; each
 * request takes the next one, and the last is reused once the queue runs dry.
 */
function fakeProvider(replies) {
  const calls = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
      calls.push({ url: req.url, auth: req.headers.authorization || '', body: parsed });
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

const geminiText = t => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const groqText = t => ({ choices: [{ message: { content: t } }] });

// The module reads process.env at call time, so each case sets its own world
// and this restores it afterwards. Requiring llm.js fresh is unnecessary.
const LLM_VARS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY',
  'GEMINI_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_MODEL',
  'LLM_ORDER', 'LLM_TIMEOUT_MS'];

function withEnv(vars, fn) {
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
        check(groq.calls.length === 1, 'backup was called ' + groq.calls.length + ' times');
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

      check(JSON.stringify(gem.calls[0].body).includes('BE STRICT'),
        'Gemini did not receive the system instruction');
      const first = groq.calls[0].body.messages[0];
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
        check(llm.order().join() === 'gemini,groq,openai', 'wrong default order: ' + llm.order());
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

  console.log('\n📊 ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
