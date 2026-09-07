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

/*
 * Providers are found in the environment, not listed by hand here.
 *
 * Karan adds keys to Render and expects them used. Every provider below follows
 * one naming convention, so adding a key is the whole configuration:
 *
 *   <NAME>_API_KEY    the key. Its presence is what turns a provider on.
 *   <NAME>_MODEL      optional; discovered from the provider when unset.
 *   <NAME>_BASE_URL   optional for a known provider, required for any other.
 *
 * A key for a provider this file has never heard of still works: set its
 * base URL alongside it and it is used as an OpenAI-compatible endpoint, which
 * nearly all of them are. A key with no base URL and no entry here is NOT
 * silently ignored — it is reported by unusable(), and the dashboard says which
 * variable would make it work.
 */
const KNOWN = [
  // cost: 'free' has a usable free tier, 'paid' bills per message. Anything
  // discovered from the environment is 'unknown' and asked after the free ones,
  // because a key that was added on purpose is more likely free-tier than it is
  // to be the most expensive option here.
  { name: 'groq', label: 'Groq', base: 'https://api.groq.com', prefix: '/openai/v1', cost: 'free' },
  { name: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api', prefix: '/v1', cost: 'free' },
  { name: 'mistral', label: 'Mistral', base: 'https://api.mistral.ai', prefix: '/v1', cost: 'free' },
  { name: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com', prefix: '/v1', cost: 'paid' },
  { name: 'openai', label: 'OpenAI', base: 'https://api.openai.com', prefix: '/v1', cost: 'paid',
    // Paid and its line-up moves; choosing a model there is a decision about
    // money, so it is never guessed and never discovered.
    explicitModel: true }
];

const RANK = { free: 0, unknown: 1, paid: 2 };

function envName(name, suffix) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + suffix;
}

/** One OpenAI-compatible provider, built from a table row or from the environment. */
function compatible(spec) {
  return {
    label: spec.label,
    cost: spec.cost,
    key: () => process.env[envName(spec.name, '_API_KEY')] || '',
    async ask(prompt, system) {
      const base = process.env[envName(spec.name, '_BASE_URL')] || spec.base;
      const root = base + (spec.prefix || '/v1');
      const auth = { Authorization: 'Bearer ' + this.key() };

      let model = process.env[envName(spec.name, '_MODEL')];
      if (!model && spec.explicitModel) {
        return {
          ok: false,
          status: 0,
          error: envName(spec.name, '_MODEL') + ' is not set. Put the exact model id your '
            + spec.label + ' account has access to in that variable.'
        };
      }
      if (!model) {
        const found = await resolveModel(spec.name, root + '/models', auth,
          body => (body.data || []).map(m => String(m.id || '')));
        if (!found.ok) return { ok: false, status: 0, error: found.error, failover: true };
        model = found.model;
      }

      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      let res = await post(root + '/chat/completions', auth, { model, messages });

      // Some newer models are served only by a Responses endpoint and say so
      // rather than answering. Follow that instruction instead of reporting a
      // dead end, so a model this code has never heard of still works.
      if (res.status !== 200 && wantsResponsesApi(res)) {
        const body = { model, input: prompt };
        if (system) body.instructions = system;
        const alt = await post(root + '/responses', auth, body);
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
  };
}

const GEMINI = {
  label: 'Gemini',
  cost: 'free',
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
};

const PROVIDERS = { gemini: GEMINI };
KNOWN.forEach(spec => { PROVIDERS[spec.name] = compatible(spec); });

/*
 * Karan names his Render variables after the model, not the provider: `Gemini`,
 * `deepseek-v4-flash`, `glm-5.3`. Only GROQ_API_KEY matched the convention
 * above, which is exactly why the chat reported Groq as the only provider it
 * ever tried.
 *
 * So a variable is matched by the vendor named inside it as well. `Gemini` is a
 * Gemini key; `deepseek-v4-flash` is a DeepSeek key AND names the model to use.
 * A name identifying no vendor is never guessed at -- sending a key to the
 * wrong company is worse than not using it -- it is reported by unusable().
 */
const VENDOR_HINTS = [
  { match: /gemini|google/i, provider: 'gemini' },
  { match: /groq/i, provider: 'groq' },
  { match: /openrouter/i, provider: 'openrouter' },
  { match: /mistral|mixtral/i, provider: 'mistral' },
  { match: /deepseek/i, provider: 'deepseek' },
  { match: /openai|gpt/i, provider: 'openai' }
];

// A value that is a URL is a service address, not a credential. This is what
// keeps KARAN_API, CHAIRMAN_API and JARVIS_API out of the provider chain.
function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/*
 * `glm-5.3` is a model id; `NODE_OPTIONS` is not. Hyphens and dots are the
 * discriminator: environment variables conventionally use underscores, model
 * ids use hyphens and dots. Without that distinction an earlier version of this
 * reported PATH and half the system environment as unused API keys, which is
 * worse than saying nothing.
 */
function looksLikeModelId(name) {
  return /[-.]/.test(name) && /\d/.test(name);
}

/** Every variable that appears to carry an API key, and what it maps to. */
function scanEnvironment() {
  const out = [];
  Object.keys(process.env).forEach(varName => {
    if (!process.env[varName] || isUrl(process.env[varName])) return;

    const suffix = varName.match(/^([A-Za-z0-9_]+)_API_KEY$/);
    if (suffix) {
      out.push({ varName, provider: suffix[1].toLowerCase(), byName: true });
      return;
    }
    const hint = VENDOR_HINTS.find(h => h.match.test(varName));
    // Only a vendor name or a model-shaped name marks a variable as a key.
    // Everything else in the environment is left alone.
    if (!hint && !looksLikeModelId(varName)) return;
    out.push({
      varName,
      provider: hint ? hint.provider : null,
      model: looksLikeModelId(varName) ? varName : undefined
    });
  });
  return out;
}

/** A provider that reads its key, and optionally its model, from one variable. */
function boundTo(base, keyVar, model, providerName) {
  const bound = Object.create(base);
  bound.key = () => process.env[keyVar] || '';
  bound.ask = function (prompt, system) {
    const modelVar = envName(providerName, '_MODEL');
    const already = process.env[modelVar];
    // An explicit _MODEL still wins; the variable name only fills the gap.
    if (model && !already) process.env[modelVar] = model;
    return Promise.resolve(base.ask.call(bound, prompt, system)).finally(() => {
      if (model && !already) delete process.env[modelVar];
    });
  };
  return bound;
}

/**
 * Every provider available right now: the table above, plus anything found in
 * the environment. Rebuilt on each call so a variable added after start-up is
 * picked up without a redeploy.
 */
function all() {
  const found = Object.assign({}, PROVIDERS);

  scanEnvironment().forEach(entry => {
    if (!entry.provider) return;

    // Named after a vendor this chain knows: use it as that vendor's key.
    if (!entry.byName && found[entry.provider]) {
      if (found[entry.provider].key()) return;   // a proper _API_KEY already won
      found[entry.provider] = boundTo(
        found[entry.provider], entry.varName, entry.model, entry.provider);
      return;
    }
    if (found[entry.provider]) return;                        // already known

    const prefix = entry.varName.replace(/_API_KEY$/, '');
    if (!process.env[prefix + '_BASE_URL']) return;           // reported below
    found[entry.provider] = compatible({
      name: entry.provider,
      label: prefix.charAt(0) + prefix.slice(1).toLowerCase().replace(/_/g, ' '),
      base: process.env[prefix + '_BASE_URL'],
      prefix: '',      // the base URL is expected to include any version path
      cost: 'unknown'
    });
  });

  return found;
}

/**
 * Keys that were set but cannot be used, and what would fix each. A key Karan
 * added should never disappear without explanation.
 */
function unusable() {
  const known = all();
  return scanEnvironment()
    .filter(e => !e.provider || !known[e.provider] || !known[e.provider].key())
    .map(e => ({
      variable: e.varName,
      needs: e.provider
        ? e.provider.toUpperCase() + '_BASE_URL'
        : 'a name saying which company the key is for, so it is never sent to the wrong one'
    }));
}


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

/**
 * Who to ask, in order. Free tiers first, then anything found in the
 * environment whose cost is unknown, then the ones that certainly bill per
 * message. LLM_ORDER overrides the whole thing when a specific order is wanted.
 */
function order() {
  const found = all();
  const explicit = process.env.LLM_ORDER;
  if (explicit) {
    return explicit.split(',').map(x => x.trim().toLowerCase()).filter(n => found[n]);
  }
  return Object.keys(found).sort((a, b) => {
    const byCost = RANK[found[a].cost] - RANK[found[b].cost];
    return byCost || a.localeCompare(b);
  });
}

/** Which providers hold a key. Used to report configuration honestly. */
function configured() {
  const found = all();
  return order().filter(name => found[name].key());
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

  const found = all();
  for (const name of names) {
    const p = found[name];
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

module.exports = {
  ask, configured, order, all, unusable, PROVIDERS, shouldFailOver, forgetModels, pick
};

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
