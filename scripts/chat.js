#!/usr/bin/env node
/**
 * One chat turn, including the Chairman asking to go online.
 *
 * He cannot reach the web himself. He can ask, and the ask becomes an item in
 * the approval queue. The web call and the follow-up answer happen inside that
 * item's runner, so they only ever run after Karan says yes to that specific
 * request. A denied or ignored request means nothing was fetched and nothing
 * was read, and the transcript says so.
 *
 * The request line is parsed from the end of the reply and removed before the
 * text is shown, so the protocol never leaks into the conversation.
 */

const llm = require('./llm');
const web = require('./web');
const approvals = require('./approvals');
const prompt = require('./chairman-prompt');

const KINDS = {
  SEARCH: {
    verb: 'search the web',
    summary: q => 'Search the web for: ' + q,
    run: async q => {
      const r = await web.search(q, 8);
      if (!r.ok) return { ok: false, error: r.error, source: r.source };
      return {
        ok: true,
        source: r.source,
        material: r.results.map((x, i) =>
          '[' + (i + 1) + '] ' + x.title + '\n    ' + x.url).join('\n'),
        sources: r.results.map(x => ({ title: x.title, url: x.url }))
      };
    }
  },
  READ: {
    verb: 'open a page',
    summary: u => 'Open and read: ' + u,
    run: async u => {
      const r = await web.read(u, 7000);
      if (!r.ok) return { ok: false, error: r.error, source: 'the page' };
      return {
        ok: true,
        source: r.url,
        material: (r.title ? r.title + '\n\n' : '') + r.text,
        sources: [{ title: r.title || r.url, url: r.url }]
      };
    }
  },
  FORUMS: {
    verb: 'read public forums',
    summary: q => 'Read Hacker News and Reddit for: ' + q,
    run: async q => {
      const [h, r] = await Promise.all([web.hn(q, 10), web.reddit(q, 10)]);
      const items = []
        .concat(h.ok ? h.results.map(x => Object.assign({ source: 'Hacker News' }, x)) : [])
        .concat(r.ok ? r.results.map(x => Object.assign({ source: 'Reddit' }, x)) : []);
      if (!items.length) {
        const why = [h.ok ? null : 'Hacker News: ' + h.error, r.ok ? null : 'Reddit: ' + r.error]
          .filter(Boolean).join('; ');
        return { ok: false, error: why || 'Neither source returned any posts.' };
      }
      return {
        ok: true,
        source: 'Hacker News and Reddit',
        material: items.map((x, i) =>
          '[' + (i + 1) + '] (' + x.source + ', ' + (x.comments || 0) + ' comments) '
          + x.title + '\n    ' + x.url).join('\n'),
        sources: items.map(x => ({ title: x.title, url: x.url }))
      };
    }
  }
};

/**
 * Pull a trailing request line off a reply.
 * Returns { text, request } where request is null when there is none.
 */
function parseRequest(reply) {
  const lines = String(reply || '').split('\n');
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    const m = lines[i].trim().match(/^(SEARCH|READ|FORUMS)\s*:\s*(.+)$/);
    if (!m) continue;
    const arg = m[2].trim().replace(/^["'<]|["'>]$/g, '').trim();
    if (!arg) continue;
    // A READ has to be a URL we would actually be willing to open.
    if (m[1] === 'READ') {
      const check = web.checkUrl(arg);
      if (!check.ok) continue;
    }
    lines.splice(i, 1);
    return { text: lines.join('\n').trim(), request: { kind: m[1], arg } };
  }
  return { text: String(reply || '').trim(), request: null };
}

/**
 * Run the approved web call, then answer from what actually came back.
 * Anything it could not fetch is reported as not fetched.
 */
async function fulfil(request, question) {
  const spec = KINDS[request.kind];
  const fetched = await spec.run(request.arg);
  if (!fetched.ok) {
    return {
      ok: false,
      error: 'Could not ' + spec.verb + ': ' + fetched.error,
      answer: 'I could not ' + spec.verb + '. ' + fetched.error
        + ' So I have not seen anything, and I am not going to guess at what it would have said.'
    };
  }

  const followUp = await llm.ask(
    'Karan asked: ' + question + '\n\n'
    + 'You asked to ' + spec.verb + ', he approved it, and this is what came back '
    + 'from ' + fetched.source + '. Use only this. Cite the sources you use by their '
    + 'number. If it does not answer his question, say so plainly rather than '
    + 'filling the gap.\n\n' + fetched.material,
    prompt.SYSTEM);

  if (!followUp.ok) {
    return {
      ok: false,
      error: followUp.error,
      sources: fetched.sources,
      answer: 'The material came back but no model was available to read it: ' + followUp.error
    };
  }
  return {
    ok: true,
    answer: parseRequest(followUp.text).text,
    provider: followUp.provider,
    sources: fetched.sources
  };
}

/** One turn. Returns either an answer or an approval waiting to be decided. */
async function turn(message) {
  const first = await llm.ask(message, prompt.SYSTEM);
  if (!first.ok) return { ok: false, error: first.error, tried: first.tried };

  const { text, request } = parseRequest(first.text);
  if (!request) {
    return {
      ok: true,
      kind: 'answer',
      reply: text,
      provider: first.provider,
      model: first.model,
      failedOver: first.tried.map(t => t.provider)
    };
  }

  const spec = KINDS[request.kind];
  const item = approvals.request(
    'web.' + request.kind.toLowerCase(),
    spec.summary(request.arg),
    { kind: request.kind, argument: request.arg, question: message },
    () => fulfil(request, message));

  return {
    ok: true,
    kind: 'approval',
    // What he said before asking: the reason for the request.
    reply: text,
    approval: item,
    provider: first.provider,
    failedOver: first.tried.map(t => t.provider)
  };
}

module.exports = { turn, parseRequest, fulfil, KINDS };
