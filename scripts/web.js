#!/usr/bin/env node
/**
 * Reading the open web.
 *
 * Free, no key, no dependency. Three public sources plus a general reader:
 *
 *   hn(q)      Hacker News via the Algolia API. A real JSON API, no key.
 *   reddit(q)  Reddit's public search JSON. No key, rate limited by IP.
 *   search(q)  DuckDuckGo's HTML endpoint, parsed. No key.
 *   read(url)  Fetch one page and reduce it to readable text.
 *
 * Nothing here decides anything. It fetches, and it reports exactly what came
 * back including the status code, so a caller can never present a page it did
 * not actually receive. A failure is returned as a failure with its reason, not
 * as an empty result that reads like "nothing found" -- those are different
 * facts and confusing them is how a search-scope limitation gets reported as
 * proven absence.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Overridable so the test suite can point the real functions at a local server
// and watch them parse a real response, rather than asserting against a mock of
// the code under test.
// Read at call time, not at load time, so a caller that sets one after
// requiring this module still gets it.
const HN_BASE = () => process.env.HN_BASE_URL || 'https://hn.algolia.com';
const REDDIT_BASE = () => process.env.REDDIT_BASE_URL || 'https://www.reddit.com';
const DDG_BASE = () => process.env.DDG_BASE_URL || 'https://html.duckduckgo.com';

const TIMEOUT = Number(process.env.WEB_TIMEOUT_MS || 20000);
const MAX_BYTES = Number(process.env.WEB_MAX_BYTES || 600000);
const UA = 'KaranDashboard/1.0 (personal dashboard; +https://github.com/karansandhu00613-ai)';

/**
 * This runs on a server, so a URL from a model is a URL from an untrusted
 * source. Refuse anything that is not plain http(s) to a public host, or the
 * chain becomes a way to reach the container's own network.
 */
function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return { ok: false, error: 'Not a URL: ' + raw }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https are allowed, not ' + u.protocol };
  }
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' || host === '::1' || host.endsWith('.localhost') ||
    host.endsWith('.internal') || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host) ||
    /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate && !process.env.WEB_ALLOW_PRIVATE) {
    return { ok: false, error: 'Refusing a private or loopback address: ' + host };
  }
  return { ok: true, url: u };
}

function get(rawUrl, headers, redirectsLeft) {
  const checked = checkUrl(rawUrl);
  if (!checked.ok) return Promise.resolve({ ok: false, error: checked.error });
  const u = checked.url;
  const left = redirectsLeft === undefined ? 4 : redirectsLeft;

  return new Promise(resolve => {
    const proto = u.protocol === 'http:' ? http : https;
    const req = proto.request({
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: TIMEOUT,
      headers: Object.assign({
        'User-Agent': UA,
        'Accept-Language': 'en',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
      }, headers || {})
    }, res => {
      const location = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && location) {
        res.resume();
        if (left <= 0) return resolve({ ok: false, error: 'Too many redirects from ' + rawUrl });
        return resolve(get(new URL(location, u).toString(), headers, left - 1));
      }

      let data = '';
      let bytes = 0;
      let cut = false;
      res.on('data', d => {
        bytes += d.length;
        if (bytes > MAX_BYTES) { cut = true; res.destroy(); return; }
        data += d;
      });
      const done = () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        url: u.toString(),
        truncated: cut,
        body: data,
        error: res.statusCode >= 200 && res.statusCode < 300
          ? undefined : 'HTTP ' + res.statusCode + ' from ' + u.hostname
      });
      res.on('end', done);
      res.on('close', done);
    });
    req.on('error', e => resolve({ ok: false, error: e.message, url: u.toString() }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timed out after ' + TIMEOUT + 'ms', url: u.toString() });
    });
    req.end();
  });
}

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&apos;': "'"
};

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, m => (ENTITIES[m] !== undefined ? ENTITIES[m] : m));
}

/** Strip a page to the text a reader would see. */
function toText(html) {
  return decode(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function title(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/** Read one page. Returns the text, or the reason it could not be read. */
async function read(url, limit) {
  const res = await get(url);
  if (!res.ok) return { ok: false, url, error: res.error };
  const text = toText(res.body);
  const cap = limit || 6000;
  return {
    ok: true,
    url: res.url,
    status: res.status,
    title: title(res.body),
    text: text.slice(0, cap),
    truncated: res.truncated || text.length > cap
  };
}

/** Hacker News, through Algolia's public API. */
async function hn(query, limit) {
  const url = HN_BASE() + '/api/v1/search?tags=story&hitsPerPage='
    + (limit || 15) + '&query=' + encodeURIComponent(query);
  const res = await get(url);
  if (!res.ok) return { ok: false, source: 'Hacker News', query, error: res.error };
  let body;
  try { body = JSON.parse(res.body); } catch (e) {
    return { ok: false, source: 'Hacker News', query, error: 'Unreadable response' };
  }
  const results = (body.hits || []).map(h => ({
    title: h.title || h.story_title || '',
    url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
    discussion: 'https://news.ycombinator.com/item?id=' + h.objectID,
    points: h.points || 0,
    comments: h.num_comments || 0,
    date: h.created_at || ''
  })).filter(r => r.title);
  return { ok: true, source: 'Hacker News', query, results };
}

/** Reddit's public search JSON. */
async function reddit(query, limit) {
  const url = REDDIT_BASE() + '/search.json?limit=' + (limit || 15)
    + '&sort=relevance&t=year&q=' + encodeURIComponent(query);
  const res = await get(url);
  if (!res.ok) return { ok: false, source: 'Reddit', query, error: res.error };
  let body;
  try { body = JSON.parse(res.body); } catch (e) {
    return { ok: false, source: 'Reddit', query, error: 'Unreadable response' };
  }
  const children = (body.data && body.data.children) || [];
  const results = children.map(c => c.data).filter(Boolean).map(d => ({
    title: d.title || '',
    url: 'https://www.reddit.com' + (d.permalink || ''),
    subreddit: d.subreddit_name_prefixed || '',
    points: d.score || 0,
    comments: d.num_comments || 0,
    text: String(d.selftext || '').slice(0, 500)
  })).filter(r => r.title);
  return { ok: true, source: 'Reddit', query, results };
}

/**
 * DuckDuckGo's HTML endpoint. There is no free search API without a key, and
 * this is the closest honest substitute. It is HTML, so the parse is defensive:
 * when the markup changes and nothing matches, that is reported as a parse
 * failure rather than as "no results", because those mean opposite things.
 */
async function search(query, limit) {
  const url = DDG_BASE() + '/html/?q=' + encodeURIComponent(query);
  const res = await get(url);
  if (!res.ok) return { ok: false, source: 'DuckDuckGo', query, error: res.error };

  const results = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(res.body)) && results.length < (limit || 10)) {
    let href = decode(m[1]);
    // DuckDuckGo wraps results in a redirect carrying the real URL in uddg.
    const wrapped = href.match(/[?&]uddg=([^&]+)/);
    if (wrapped) href = decodeURIComponent(wrapped[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    const text = decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text && /^https?:/.test(href)) results.push({ title: text, url: href });
  }

  if (!results.length) {
    const looksLikeResults = /result__a|result__body/.test(res.body);
    return {
      ok: false,
      source: 'DuckDuckGo',
      query,
      error: looksLikeResults
        ? 'The results page could not be parsed; its markup has changed.'
        : 'DuckDuckGo returned no result list for this query. It may have been rate limited.'
    };
  }
  return { ok: true, source: 'DuckDuckGo', query, results };
}

module.exports = { read, search, hn, reddit, get, toText, checkUrl };

if (require.main === module) {
  const [what, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ');
  const fn = { read, search, hn, reddit }[what];
  if (!fn || !arg) {
    console.log('usage: node scripts/web.js <read|search|hn|reddit> <url or query>');
    process.exit(1);
  }
  fn(arg).then(r => console.log(JSON.stringify(r, null, 2)));
}
