#!/usr/bin/env node
/**
 * Tests for the approval gate, the web layer, and the sub-agents.
 *
 * The claim these have to hold up is the one that matters most in this system:
 * nothing goes online without Karan saying yes to that specific thing. So the
 * tests do not check that a permission flag was set. They stand a real HTTP
 * server in for the outside world and count its requests. If a request arrives
 * before an approval, the test fails.
 *
 * The provider chain is likewise a real local server, so the sub-agents make
 * real calls and their output is parsed for real.
 */

const http = require('http');
const path = require('path');

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

/** A stand-in for the outside world that records every request it receives. */
function outsideWorld(routes) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const key = Object.keys(routes).find(k => req.url.indexOf(k) === 0);
    const route = key ? routes[key] : null;
    if (!route) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': route.type || 'application/json' });
    res.end(typeof route.body === 'string' ? route.body : JSON.stringify(route.body));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      hits,
      port: server.address().port,
      url: 'http://127.0.0.1:' + server.address().port,
      close: () => new Promise(r => server.close(r))
    }));
  });
}

/** A stand-in provider that answers each call with the next scripted reply. */
function fakeModel(replies) {
  const prompts = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let b = '';
    req.on('data', d => b += d);
    req.on('end', () => {
      prompts.push(b);
      const text = replies[Math.min(i++, replies.length - 1)];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      prompts,
      url: 'http://127.0.0.1:' + server.address().port,
      close: () => new Promise(r => server.close(r))
    }));
  });
}

async function run() {
  console.log('\n🧪 Approval gate, web layer and sub-agents\n');

  // Private addresses are needed to talk to the local stand-ins.
  process.env.WEB_ALLOW_PRIVATE = '1';

  const web = require(path.join(__dirname, 'web.js'));
  const approvals = require(path.join(__dirname, 'approvals.js'));
  const agents = require(path.join(__dirname, 'agents.js'));
  const chat = require(path.join(__dirname, 'chat.js'));

  // ---- The web layer's guards ---------------------------------------------

  await test('A URL that is not http or https is refused', () => {
    ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)'].forEach(u => {
      const r = web.checkUrl(u);
      check(!r.ok, 'accepted ' + u);
    });
  });

  await test('Private and loopback addresses are refused by default', () => {
    delete process.env.WEB_ALLOW_PRIVATE;
    ['http://localhost/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/x', 'http://192.168.1.1/x', 'http://172.16.0.1/x'].forEach(u => {
      const r = web.checkUrl(u);
      check(!r.ok, 'accepted ' + u);
      check(/private or loopback/.test(r.error), 'wrong reason for ' + u + ': ' + r.error);
    });
    process.env.WEB_ALLOW_PRIVATE = '1';
  });

  await test('A page is reduced to its readable text', async () => {
    const site = await outsideWorld({
      '/page': {
        type: 'text/html',
        body: '<html><head><title>A Title</title><style>b{}</style></head>'
          + '<body><script>var x=1</script><p>First line.</p><p>Second line.</p></body></html>'
      }
    });
    try {
      const r = await web.read(site.url + '/page');
      check(r.ok, 'read failed: ' + r.error);
      check(r.title === 'A Title', 'wrong title: ' + r.title);
      check(/First line\./.test(r.text) && /Second line\./.test(r.text), 'lost the text');
      check(!/var x=1/.test(r.text), 'kept the script contents');
      check(!/b\{\}/.test(r.text), 'kept the stylesheet');
    } finally { await site.close(); }
  });

  await test('A failed fetch is a failure, never an empty result', async () => {
    const r = await web.read('http://127.0.0.1:1/nothing');
    check(!r.ok, 'a dead host reported success');
    check(!!r.error, 'no reason given');
    check(r.text === undefined, 'returned text from a page it never read');
  });

  // ---- The approval gate ---------------------------------------------------

  await test('A registered action does not run until it is approved', async () => {
    approvals._reset();
    let ran = 0;
    const item = approvals.request('test', 'Do the thing', {}, () => { ran++; return 'done'; });
    check(item.status === 'pending', 'not pending: ' + item.status);
    check(ran === 0, 'it ran on registration');
    check(approvals.pending().length === 1, 'not in the pending list');

    const out = await approvals.approve(item.id);
    check(out.ok, 'approve failed: ' + out.error);
    check(ran === 1, 'it did not run on approval');
    check(out.item.result === 'done', 'lost the result');
  });

  await test('An approval is spent once used and cannot be replayed', async () => {
    approvals._reset();
    let ran = 0;
    const item = approvals.request('test', 'Do the thing', {}, () => { ran++; });
    await approvals.approve(item.id);
    const again = await approvals.approve(item.id);
    check(!again.ok, 'a second approval was accepted');
    check(ran === 1, 'the action ran ' + ran + ' times');
  });

  await test('A denied action never runs', async () => {
    approvals._reset();
    let ran = 0;
    const item = approvals.request('test', 'Do the thing', {}, () => { ran++; });
    const out = approvals.deny(item.id);
    check(out.ok, 'deny failed: ' + out.error);
    check(ran === 0, 'a denied action ran');
    check(approvals.pending().length === 0, 'still pending after denial');
    const after = await approvals.approve(item.id);
    check(!after.ok, 'a denied item could still be approved');
    check(ran === 0, 'a denied action ran after the fact');
  });

  await test('A failing action is reported as failed, not as done', async () => {
    approvals._reset();
    const item = approvals.request('test', 'Break', {}, () => {
      throw new Error('it broke');
    });
    const out = await approvals.approve(item.id);
    check(!out.ok, 'a throwing action reported success');
    check(/it broke/.test(out.error), 'lost the reason: ' + out.error);
    check(approvals.get(item.id).status === 'failed', 'wrong final status');
  });

  await test('There is no way to approve everything at once', () => {
    const surface = Object.keys(approvals).join(' ').toLowerCase();
    check(!/approveall|approve_all|all/.test(surface),
      'the module exposes a blanket approval: ' + surface);
  });

  // ---- The chat gate -------------------------------------------------------

  await test('Asking to search fetches nothing until it is approved', async () => {
    approvals._reset();
    const world = await outsideWorld({
      '/html/': {
        type: 'text/html',
        body: '<a class="result__a" href="https://example.com/a">A result</a>'
      }
    });
    const model = await fakeModel([
      'I need the current price, which I cannot know.\nSEARCH: current price of the thing',
      'The page gives one price [1]. That is what it says; I have not verified it elsewhere.'
    ]);
    Object.assign(process.env, {
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url, DDG_BASE_URL: world.url
    });
    delete process.env.GROQ_API_KEY;

    try {
      const turn = await chat.turn('What does it cost right now?');
      check(turn.ok, 'the turn failed: ' + turn.error);
      check(turn.kind === 'approval', 'no approval was raised: ' + turn.kind);
      check(world.hits.length === 0,
        'it went online before approval: ' + JSON.stringify(world.hits));
      check(!/SEARCH:/.test(turn.reply), 'the protocol line leaked into the reply');
      check(/current price of the thing/.test(turn.approval.summary),
        'the approval does not say what it will do: ' + turn.approval.summary);

      const out = await approvals.approve(turn.approval.id);
      check(out.ok, 'approval failed: ' + out.error);
      check(world.hits.length === 1, 'expected exactly one fetch, got ' + world.hits.length);
      check(/example\.com/.test(JSON.stringify(out.item.result.sources)),
        'the real source was not carried back');
      check(/one price/.test(out.item.result.answer), 'the follow-up answer was lost');
      check(model.prompts.length === 2, 'the model was called ' + model.prompts.length + ' times');
      check(/A result/.test(model.prompts[1]),
        'the second call did not carry what was actually fetched');
    } finally { await world.close(); await model.close(); }
  });

  await test('Denying the request means nothing was fetched, and it says so', async () => {
    approvals._reset();
    const world = await outsideWorld({ '/html/': { type: 'text/html', body: '<a class="result__a" href="https://x.test/a">R</a>' } });
    const model = await fakeModel(['Reason.\nSEARCH: something']);
    Object.assign(process.env, {
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url, DDG_BASE_URL: world.url
    });
    try {
      const turn = await chat.turn('question');
      approvals.deny(turn.approval.id);
      check(world.hits.length === 0, 'a denied request still went online');
      check(approvals.get(turn.approval.id).status === 'denied', 'not marked denied');
    } finally { await world.close(); await model.close(); }
  });

  await test('A reply with no request line is just an answer', async () => {
    approvals._reset();
    const model = await fakeModel(['Two plus two is four.']);
    Object.assign(process.env, { GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url });
    try {
      const turn = await chat.turn('what is 2+2');
      check(turn.kind === 'answer', 'raised an approval for nothing: ' + turn.kind);
      check(approvals.pending().length === 0, 'left something in the queue');
    } finally { await model.close(); }
  });

  await test('A request to read a private address is not offered at all', async () => {
    approvals._reset();
    delete process.env.WEB_ALLOW_PRIVATE;
    const model = await fakeModel(['Checking.\nREAD: http://169.254.169.254/latest/meta-data']);
    Object.assign(process.env, { GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url });
    try {
      const turn = await chat.turn('look at the metadata service');
      check(turn.kind === 'answer', 'offered to open a private address');
      check(approvals.pending().length === 0, 'queued a request for a private address');
    } finally {
      await model.close();
      process.env.WEB_ALLOW_PRIVATE = '1';
    }
  });

  // ---- Citations -----------------------------------------------------------

  await test('A citation the evidence cannot support is dropped', () => {
    const evidence = [
      { title: 'First post', url: 'https://a.test/1', source: 'Hacker News' },
      { title: 'Second post', url: 'https://b.test/2', source: 'Reddit' }
    ];
    const out = agents.resolveCitations(
      'People hate this [1]. It costs them money [2]. A study proves it [9].', evidence);
    check(!/\[9\]/.test(out.text), 'kept a citation to a post that does not exist');
    check(/\[1\]/.test(out.text) && /\[2\]/.test(out.text), 'dropped real citations');
    check(out.citations.length === 2, 'wrong citation count: ' + out.citations.length);
    check(out.citations[0].url === 'https://a.test/1', 'wrong URL mapped');
    check(out.invented.join() === '9', 'did not record the invented citation');
  });

  // ---- The scout -----------------------------------------------------------

  await test('With nothing retrieved, the scout fails honestly instead of inventing', async () => {
    approvals._reset();
    const model = await fakeModel(['should never be called']);
    Object.assign(process.env, {
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url,
      HN_BASE_URL: 'http://127.0.0.1:1', REDDIT_BASE_URL: 'http://127.0.0.1:1'
    });
    try {
      const run = await agents.scout(['anything']).done;
      check(run.status === 'failed', 'claimed success with no evidence: ' + run.status);
      check(!run.proposals.length, 'produced proposals from nothing');
      check(model.prompts.length === 0, 'asked a model to reason over nothing');
      check(/nothing to reason about/.test(run.error), 'unclear reason: ' + run.error);
    } finally { await model.close(); }
  });

  await test('A full scout run cites real posts and proposes rather than builds', async () => {
    approvals._reset();
    const world = await outsideWorld({
      '/api/v1/search': {
        body: {
          hits: [
            { title: 'Invoicing eats my week', objectID: '1', url: 'https://hn.test/1', num_comments: 210, points: 90 },
            { title: 'Chasing late payers again', objectID: '2', url: 'https://hn.test/2', num_comments: 140, points: 40 }
          ]
        }
      },
      '/search.json': {
        body: {
          data: {
            children: [
              { data: { title: 'Freelancers: how do you chase invoices?', permalink: '/r/f/1', num_comments: 88, score: 30, selftext: 'I spend hours on this.' } }
            ]
          }
        }
      }
    });
    const model = await fakeModel([
      // analyst
      '1. Freelancers lose hours chasing unpaid invoices [1] [3]. It recurs constantly '
      + 'and the posts describe whole days lost to it, so the cost is real. A study I '
      + 'made up says the same [77].\n'
      + '2. Small studios cannot tell which client is unprofitable [2]. They describe '
      + 'guessing at margins with no data to hand, month after month.',
      // market-check and build-plan run together, then monetisation, then reviewer
      'Contested. Several tools do this and charge monthly. My knowledge has a cutoff '
      + 'and this needs verifying before acting on it.',
      'A single page that watches one inbox and nudges late payers. It does not do '
      + 'accounting. Free tier throughout. Two days for one person.',
      'Charge per month per user. Twenty customers for a first meaningful amount. '
      + 'This holds only if chasing is the painful part, not the invoicing.',
      'The weakest claim is that people will pay for a nudge alone.\nWORTH A TEST'
    ]);
    Object.assign(process.env, {
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url,
      HN_BASE_URL: world.url, REDDIT_BASE_URL: world.url
    });

    const proposed = [];
    try {
      const run = await agents.scout(['invoice chasing'], {
        maxIdeas: 1,
        onProposal: p => {
          proposed.push(p);
          approvals.request('venture.setup', 'Set up a test for: ' + p.id, {}, () => 'setup');
        }
      }).done;

      check(run.status === 'done', 'run failed: ' + run.error);
      check(run.evidence.length === 3, 'wrong evidence count: ' + run.evidence.length);
      check(run.citations.length >= 1, 'no citations resolved');
      run.citations.forEach(c => {
        check(/^https?:\/\//.test(c.url), 'a citation without a real URL: ' + c.url);
      });
      check(!/\[77\]/.test(run.analysis), 'kept the invented citation');
      check(run.notes.some(n => /Dropped 1 citation/.test(n)),
        'did not report dropping it: ' + JSON.stringify(run.notes));

      check(run.proposals.length === 1, 'wrong proposal count: ' + run.proposals.length);
      const p = run.proposals[0];
      check(p.verdict === 'WORTH A TEST', 'wrong verdict: ' + p.verdict);
      check(p.market.ok && p.build.ok && p.money.ok, 'a sub-agent failed');
      check(p.agents.length === 3, 'wrong sub-agent count: ' + p.agents.length);

      check(proposed.length === 1, 'the proposal was not offered for approval');
      check(approvals.pending().length === 1, 'nothing waiting for a decision');
      check(/Set up a test/.test(approvals.pending()[0].summary),
        'the approval does not describe setting anything up');

      const steps = run.steps.map(s => s.name).join(',');
      check(/gather/.test(steps) && /scout-analyst/.test(steps) && /idea-1/.test(steps),
        'the run was not visible step by step: ' + steps);
    } finally { await world.close(); await model.close(); }
  });

  await test('A proposal the reviewer rejects is never offered for approval', async () => {
    approvals._reset();
    const world = await outsideWorld({
      '/api/v1/search': { body: { hits: [{ title: 'A recurring complaint about something', objectID: '1', url: 'https://hn.test/1', num_comments: 50 }] } },
      '/search.json': { body: { data: { children: [] } } }
    });
    const model = await fakeModel([
      '1. People complain about a thing that is already solved by everyone [1], and '
      + 'they say so repeatedly across the posts here.',
      'Crowded. This is thoroughly served already.',
      'A thin wrapper over what already exists. Two days.',
      'Charge monthly. It would need many customers.',
      'This is a solved problem and not worth the time.\nNOT WORTH IT'
    ]);
    Object.assign(process.env, {
      GEMINI_API_KEY: 'k', GEMINI_BASE_URL: model.url,
      HN_BASE_URL: world.url, REDDIT_BASE_URL: world.url
    });
    const proposed = [];
    try {
      const run = await agents.scout(['anything'], {
        maxIdeas: 1, onProposal: p => proposed.push(p)
      }).done;
      check(run.status === 'done', 'run failed: ' + run.error);
      check(run.proposals[0].verdict === 'NOT WORTH IT', 'wrong verdict: ' + run.proposals[0].verdict);
      check(proposed.length === 0, 'a rejected proposal was still put to Karan');
      check(approvals.pending().length === 0, 'a rejected proposal reached the queue');
    } finally { await world.close(); await model.close(); }
  });

  console.log('\n📊 ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
