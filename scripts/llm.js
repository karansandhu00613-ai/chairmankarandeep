#!/usr/bin/env node
/**
 * LLM provider chain with automatic failover.
 *
 * Free tiers have daily caps. When one is spent it answers 429, and the chain
 * moves to the next provider rather than failing the request. That is the whole
 * point: free, with limits, but the limits do not stop the system.
 *
 * Nothing here reports an answer it did not receive. Every reply carries the
 * provider that actually served it, and when every provider fails the caller
 * gets the reason for each one rather than a generic error.
 *
 * Providers are configured entirely by environment variable, so no key is ever
 * committed:
 *   GEMINI_API_KEY   Google AI Studio    (free tier)
 *   GROQ_API_KEY     Groq                (free tier)
 *   OPENAI_API_KEY   OpenAI              (paid per message)
 *   GEMINI_MODEL     optional; discovered from the provider when unset
 *   GROQ_MODEL       optional; discovered from the provider when unset
 *   OPENAI_MODEL     no default; set the exact model id your account has
 *   LLM_ORDER        comma-separated preference, default "gemini,groq,openai"
 *
 * Model names change constantly, and a hardcoded default rots: Groq deprecated
 * this file's old default and a correctly configured key started failing with
 * "the model does not exist". So the two free providers are ASKED which models
 * they serve, using the API key that is already set, and an explicit
 * GEMINI_MODEL or GROQ_MODEL overrides that when a specific one is wanted.
 *
 * OpenAI is not discovered and has no default, because it is paid: choosing a
 * model there is a choice about money, and it belongs to the operator.
 *
 * The default order puts the free tiers first because OpenAI charges per
 * message. Set LLM_ORDER to change that deliberately.
 *
 * GEMINI_BASE_URL and GROQ_BASE_URL override the host. They exist so the test
 * suite can point the real chain at a local server and watch it fail over for
 * itself, rather than asserting against a mock of the code under test.
 */

const https = require('https');
const http = require('http');

const TIMEOUT = Number(process.env.LLM_TIMEOUT_MS || 45000);

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const proto = u.protocol === 'http:' ? http : https;
    const payload = JSON.stringify(body);
    const req = proto.request({
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = { raw: data.slice(0, 400) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out after ' + TIMEOUT + 'ms')); });
    req.write(payload);
    req.end();
  });
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const proto = u.protocol === 'http:' ? http : https;
    const req = proto.request({
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: TIMEOUT,
      headers: headers || {}
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = { raw: data.slice(0, 400) }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out after ' + TIMEOUT + 'ms')); });
    req.end();
  });
}

/*
 * Which model to use, asked rather than assumed.
 *
 * A hardcoded default rots. `llama-3.3-70b-versatile` was this file's Groq
 * default and Groq has since deprecated it, so a correctly configured key
 * failed with "the model does not exist" and the only way out was for Karan to
 * go and read Groq's model list himself. Picking a different id would just
 * start the same clock again.
 *
 * Both free providers publish what they serve, and the API key is the only
 * credential needed to ask. So ask once per process, cache it, and let an
 * explicit GROQ_MODEL or GEMINI_MODEL override when he wants a specific one.
 *
 * The preference lists are a first choice, not a requirement: anything on them
 * is used if present, and otherwise the first model the provider offers that
 * is not obviously the wrong kind is used instead. A provider that changes its
 * whole line-up still works without a code change.
 */
const modelCache = new Map();

// Speech, embedding, moderation and image models answer the list endpoint too,
// and none of them can hold a conversation.
const NOT_CHAT = /whisper|tts|embed|guard|moderat|vision-only|image|dall|sora|distil/i;

const PREFERRED = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
};

function pick(ids, provider) {
  const usable = ids.filter(id => id && !NOT_CHAT.test(id));
  const first = (PREFERRED[provider] || []).find(p => usable.indexOf(p) !== -1);
  return first || usable[0] || null;
}

async function resolveModel(provider, listUrl, headers, extract) {
  if (modelCache.has(provider)) return modelCache.get(provider);
  let out;
  try {
    const res = await get(listUrl, headers);
    if (res.status !== 200) {
      const msg = (res.body && res.body.error && res.body.error.message) || ('HTTP ' + res.status);
      out = { ok: false, error: 'Could not ask ' + provider + ' which models it has: ' + msg };
    } else {
      const chosen = pick(extract(res.body), provider);
      out = chosen
        ? { ok: true, model: chosen }
        : { ok: false, error: provider + ' listed no model this chain can hold a conversation with.' };
    }
  } catch (e) {
    out = { ok: false, error: 'Could not reach ' + provider + ' to list its models: ' + e.message };
  }
  modelCache.set(provider, out);
  return out;
}

/** Test seam, and a way to pick up a provider's new line-up without a restart. */
function forgetModels() { modelCache.clear(); }

// A spent free tier, a rate limit, or a temporary outage: all worth moving on
// from. A malformed request is not — that would fail identically everywhere.
function shouldFailOver(status) {
  return status === 429 || status === 403 || status === 500 || status === 502
      || status === 503 || status === 529;
}

const PROVIDERS = {
  gemini: {
    label: 'Gemini',
    key: () => process.env.GEMINI_API_KEY || '',
    async ask(prompt, system) {
      const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
      let model = process.env.GEMINI_MODEL;
      if (!model) {
        const found = await resolveModel('gemini',
          base + '/v1beta/models?key=' + encodeURIComponent(this.key()), {},
          body => (body.models || [])
            // Only models that can actually answer a generateContent call.
            .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
            .map(m => String(m.name || '').replace(/^models\//, '')));
        if (!found.ok) return { ok: false, status: 0, error: found.error, failover: true };
        model = found.model;
      }
      const url = base + '/v1beta/models/'
        + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(this.key());
      const body = { contents: [{ parts: [{ text: prompt }] }] };
      if (system) body.systemInstruction = { parts: [{ text: system }] };

      const res = await post(url, {}, body);
      if (res.status !== 200) {
        const msg = (res.body && res.body.error && res.body.error.message) || ('HTTP ' + res.status);
        return { ok: false, status: res.status, error: msg };
      }
      const cand = res.body && res.body.candidates && res.body.candidates[0];
      const text = cand && cand.content && cand.content.parts
        && cand.content.parts.map(p => p.text || '').join('').trim();
      // A 200 carrying nothing is this provider failing, not the request being
      // wrong, so the next provider is worth asking.
      if (!text) return { ok: false, status: 200, error: 'empty response', failover: true };
      return { ok: true, text, model };
    }
  },

  groq: {
    label: 'Groq',
    key: () => process.env.GROQ_API_KEY || '',
    async ask(prompt, system) {
      const base = process.env.GROQ_BASE_URL || 'https://api.groq.com';
      let model = process.env.GROQ_MODEL;
      if (!model) {
        const found = await resolveModel('groq', base + '/openai/v1/models',
          { Authorization: 'Bearer ' + this.key() },
          body => (body.data || []).map(m => String(m.id || '')));
        if (!found.ok) return { ok: false, status: 0, error: found.error, failover: true };
        model = found.model;
      }
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const res = await post(base + '/openai/v1/chat/completions',
        { Authorization: 'Bearer ' + this.key() }, { model, messages });

      if (res.status !== 200) {
        const msg = (res.body && res.body.error && res.body.error.message) || ('HTTP ' + res.status);
        return { ok: false, status: res.status, error: msg };
      }
      const text = res.body && res.body.choices && res.body.choices[0]
        && res.body.choices[0].message && res.body.choices[0].message.content;
      if (!text) return { ok: false, status: 200, error: 'empty response', failover: true };
      return { ok: true, text: text.trim(), model };
    }
  },

  openai: {
    label: 'OpenAI',
    key: () => process.env.OPENAI_API_KEY || '',
    async ask(prompt, system) {
      // No default. OpenAI's line-up moves, and a model id guessed here would
      // fail with a confusing 404 rather than saying what is actually wrong.
      const model = process.env.OPENAI_MODEL || '';
      if (!model) {
        return {
          ok: false,
          status: 0,
          error: 'OPENAI_MODEL is not set. Put the exact model id your account '
            + 'has access to in that variable.'
        };
      }
      const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
      const auth = { Authorization: 'Bearer ' + this.key() };

      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      let res = await post(base + '/v1/chat/completions', auth, { model, messages });

      // Newer OpenAI models are served only by the Responses API, and say so
      // rather than answering. Follow that instruction instead of reporting a
      // dead end, so a model this code has never heard of still works.
      if (res.status !== 200 && wantsResponsesApi(res)) {
        const body = { model, input: prompt };
        if (system) body.instructions = system;
        const alt = await post(base + '/v1/responses', auth, body);
        if (alt.status === 200) {
          const text = responsesText(alt.body);
          if (!text) return { ok: false, status: 200, error: 'empty response', failover: true };
          return { ok: true, text, model };
        }
        res = alt;
      }

      if (res.status !== 200) {
        const msg = (res.body && res.body.error && res.body.error.message) || ('HTTP ' + res.status);
        return { ok: false, status: res.status, error: msg };
      }
      const text = res.body && res.body.choices && res.body.choices[0]
        && res.body.choices[0].message && res.body.choices[0].message.content;
      if (!text) return { ok: false, status: 200, error: 'empty response', failover: true };
      return { ok: true, text: text.trim(), model };
    }
  }
};

function wantsResponsesApi(res) {
  if (res.status !== 400 && res.status !== 404) return false;
  const msg = (res.body && res.body.error && res.body.error.message) || '';
  return /v1\/responses|Responses API|not supported in the v1\/chat\/completions/i.test(msg);
}

/** Pull the assistant text out of a Responses API reply, whatever its shape. */
function responsesText(body) {
  if (!body) return '';
  if (typeof body.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }
  const parts = [];
  (body.output || []).forEach(item => {
    (item.content || []).forEach(c => {
      if (typeof c.text === 'string') parts.push(c.text);
    });
  });
  return parts.join('').trim();
}

function order() {
  // Free tiers first. A paid provider is a real cost per message, so it is the
  // last resort unless LLM_ORDER deliberately puts it first.
  return (process.env.LLM_ORDER || 'gemini,groq,openai')
    .split(',').map(s => s.trim().toLowerCase()).filter(n => PROVIDERS[n]);
}

/** Which providers hold a key. Used to report configuration honestly. */
function configured() {
  return order().filter(name => PROVIDERS[name].key());
}

/**
 * Ask the chain. Returns { ok, text, provider, model, tried } on success, or
 * { ok:false, error, tried } where `tried` names every provider and why it
 * failed — so a spent quota is distinguishable from a bad key.
 */
async function ask(prompt, system) {
  const tried = [];
  const names = configured();

  if (!names.length) {
    return {
      ok: false,
      tried,
      error: 'No LLM provider is configured. Set GEMINI_API_KEY, GROQ_API_KEY, '
        + 'or OPENAI_API_KEY with OPENAI_MODEL.'
    };
  }

  for (const name of names) {
    const p = PROVIDERS[name];
    try {
      const out = await p.ask(prompt, system);
      if (out.ok) {
        return { ok: true, text: out.text, provider: p.label, model: out.model, tried };
      }
      tried.push({ provider: p.label, status: out.status, error: out.error });
      // A request the provider rejected on its merits fails the same way
      // everywhere, so there is nothing to gain by asking the next one.
      if (!(out.failover || shouldFailOver(out.status))) break;
    } catch (e) {
      tried.push({ provider: p.label, error: e.message });
    }
  }

  return {
    ok: false,
    tried,
    error: 'Every configured provider failed: '
      + tried.map(t => t.provider + ' (' + (t.error || t.status) + ')').join('; ')
  };
}

module.exports = { ask, configured, order, PROVIDERS, shouldFailOver, forgetModels, pick };

if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ') || 'Reply with exactly: chain ok';
  const names = configured();
  console.log('Configured providers: ' + (names.length ? names.join(' -> ') : 'none'));
  ask(prompt).then(r => {
    if (r.ok) {
      console.log('\nServed by ' + r.provider + ' (' + r.model + ')');
      if (r.tried.length) console.log('Failed over from: ' + r.tried.map(t => t.provider).join(', '));
      console.log('\n' + r.text);
    } else {
      console.log('\n' + r.error);
      process.exit(1);
    }
  });
}
