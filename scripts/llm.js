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
 *   GEMINI_MODEL     default gemini-2.0-flash
 *   GROQ_MODEL       default llama-3.3-70b-versatile
 *   LLM_ORDER        comma-separated preference, default "gemini,groq"
 *
 * Model names change; both are overridable without touching this file.
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
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
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
      const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const base = process.env.GROQ_BASE_URL || 'https://api.groq.com';
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
  }
};

function order() {
  return (process.env.LLM_ORDER || 'gemini,groq')
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
      error: 'No LLM provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY.'
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

module.exports = { ask, configured, order, PROVIDERS, shouldFailOver };

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
