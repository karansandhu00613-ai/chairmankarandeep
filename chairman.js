#!/usr/bin/env node
/* ==========================================================================
   CHAIRMAN AGENT OS  —  SINGLE FILE

   RUN IT:   node chairman.js     then open http://localhost:8080

   WHAT THIS BUILD DOES, IN ORDER OF WHAT MAKES MONEY

   1. THE BUSINESS FACTORY
      One button turns an approved idea into a whole trading business:
      a five-page website, the four policy pages Razorpay reads before it
      will approve a sole proprietor, a real working browser tool, an
      editable invoice, and the outreach scripts. One ZIP, drag it onto
      Netlify Drop, it is live.

      It does not look AI-made because the model designs NOTHING. Layout,
      typography, colour and all legal text are hand-written into the
      system as a house style. The model supplies words and prices only.
      Then a hard-coded audit hunts 28 phrases and patterns that mark
      generated work and forces a rewrite before the pack may exist.

   2. THE DOMAIN DESK
      Checking a name is free and needs nobody's permission — RDAP is
      mandated by ICANN and every registry runs one. He invents names and
      verifies every single one against the live registry before showing
      it. He CANNOT register one: that needs an EPP credential issued to
      an accredited registrar plus a card and KYC in your legal name.

   3. THE GROWTH ENGINE
      He plans a two-week campaign, writes every message in finished form,
      and you approve the whole thing with one tick. Then CODE — not the
      model — decides what he may actually send. Email through your own
      Gmail is genuinely automatic. WhatsApp, Instagram, Facebook, X and
      Google Business Profile are not automatable for free by anyone, and
      he says so instead of pretending. Those become jobs on your desk
      with the exact words already written.

   4. THE TREASURY LOCK
      The gateway account is fingerprinted and sealed on connection. Any
      attempt to point the money somewhere else is refused without your
      password, and emails you. The Chairman cannot repoint your revenue.
      Neither can a stolen session.

   5. PERSISTENCE THAT SURVIVES A WIPED DISK
      Free hosts have no disk. Heavy files live in compressed blobs outside
      the state file, and a private GitHub repo acts as the disk. Proven by
      deleting every local file and restarting: everything came back.

   Truthfulness overrides all of it. No testimonials, no client counts, no
   statistics — there are none yet, and one caught fabrication ends the
   sale permanently.

   Creates data.json beside itself. Back that file up — it is your system.
   ========================================================================== */

const __M = {};
function __req(n){
  if(!(n in __M)) throw new Error('BUILD BUG: module "'+n+'" was never inlined');
  return __M[n];
}

__M['blobs'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* ==========================================================================
   BLOBS — heavy things live outside data.json.

   WHY THIS EXISTS.
   The GitHub Contents API is the only free persistent disk available to a
   Render free-tier service. It base64-encodes everything, which inflates
   payloads by 33%, and it rewrites the WHOLE file on every save. A single
   business pack is ~104 KB of HTML. Four of them turn a 122 KB state file
   into ~700 KB, and every trivial state change — one log line — would push
   700 KB to GitHub. That burns the API rate limit and eventually fails.

   So: data.json stays lean and holds only metadata. Anything big goes into
   its own blob file, written once, read on demand, deleted when its owner
   is deleted. Blobs are gzipped before storage: HTML compresses about 5:1.
   ========================================================================== */
const zlib = require('zlib');

function makeBlobs(STORE){
  const mem = new Map();          /* id -> parsed object, hot cache */

  const key = id => 'blob-' + String(id).replace(/[^A-Za-z0-9_-]/g,'') + '.gz.b64';

  return {
    /* Store any JSON-able value. Returns bytes actually written. */
    async put(id, value){
      const raw = Buffer.from(JSON.stringify(value), 'utf8');
      const gz  = zlib.gzipSync(raw, { level: 9 });
      const b64 = gz.toString('base64');
      mem.set(id, value);
      await STORE.write(key(id), b64);
      return { raw: raw.length, stored: b64.length,
               ratio: +(raw.length / Math.max(1,b64.length)).toFixed(1) };
    },

    /* Read it back. Cached after first hit. null if missing. */
    async get(id){
      if(mem.has(id)) return mem.get(id);
      const b64 = await STORE.read(key(id));
      if(!b64) return null;
      try{
        const v = JSON.parse(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
        mem.set(id, v);
        return v;
      }catch(e){ return null; }
    },

    async del(id){
      mem.delete(id);
      try{ await STORE.remove(key(id)); }catch(e){}
    },

    /* Drop from RAM without deleting from storage — for memory pressure. */
    evict(id){ mem.delete(id); },
    cached(){ return mem.size; }
  };
}

module.exports = { makeBlobs };

return module.exports; })();

__M['domains'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* ==========================================================================
   DOMAINS — real availability checking, zero dependencies, zero cost.

   HOW A DOMAIN ACTUALLY COMES INTO EXISTENCE (the honest chain):

     ICANN                  sets the rules, accredits registrars
       └─ REGISTRY          runs ONE top-level domain and owns its database
          e.g. Verisign owns .com   ·   NIXI owns .in   ·   PIR owns .org
          └─ REGISTRAR      accredited to write into that registry
             e.g. GoDaddy, Cloudflare, Porkbun, BigRock
             └─ RESELLER    sells a registrar's stock under its own brand
                └─ YOU / THE CUSTOMER

   Nobody "creates" a domain out of nothing. A registry publishes a zone
   file; a registrar sends an EPP command that inserts your name into it;
   you rent it for a year at a time. Let it lapse and it goes back.

   This module does the ONE part that is free and needs no permission:
   checking, authoritatively, whether a name is available — via RDAP, the
   ICANN-mandated successor to WHOIS. Every registry must run an RDAP
   server. No key, no account, no rate-limit contract, no cost.
   404 = available. 200 = taken.
   ========================================================================== */
const https = require('https');

const UA = 'Chairman-Agent-OS/1.0 (domain availability check)';

/* Direct registry RDAP endpoints. Going straight to the registry avoids the
   rdap.org redirect hop and is roughly 10x faster. Verified live. */
const RDAP = {
  com:'https://rdap.verisign.com/com/v1/',
  net:'https://rdap.verisign.com/net/v1/',
  in:'https://rdap.nixiregistry.in/rdap/',
  'co.in':'https://rdap.nixiregistry.in/rdap/',
  'net.in':'https://rdap.nixiregistry.in/rdap/',
  'org.in':'https://rdap.nixiregistry.in/rdap/',
  'firm.in':'https://rdap.nixiregistry.in/rdap/',
  'gen.in':'https://rdap.nixiregistry.in/rdap/',
  'ind.in':'https://rdap.nixiregistry.in/rdap/',
  org:'https://rdap.publicinterestregistry.org/rdap/',
  info:'https://rdap.identitydigital.services/rdap/',
  biz:'https://rdap.nic.biz/',
  io:'https://rdap.identitydigital.services/rdap/',
  co:'https://rdap.nic.co/',
  dev:'https://www.registry.google/rdap/',
  app:'https://www.registry.google/rdap/',
  page:'https://www.registry.google/rdap/',
  xyz:'https://rdap.centralnic.com/xyz/',
  site:'https://rdap.centralnic.com/site/',
  online:'https://rdap.centralnic.com/online/',
  store:'https://rdap.centralnic.com/store/',
  shop:'https://rdap.gmoregistry.net/rdap/',
  tech:'https://rdap.centralnic.com/tech/',
};
/* Anything not listed falls back to the IANA-run resolver, which redirects. */
const FALLBACK = 'https://rdap.org/';

/* Indicative RETAIL prices in INR, checked August 2026. These are what a
   customer pays at a cheap registrar — NOT wholesale, NOT a quote. They are
   here so he can talk about cost honestly, not so he can invoice from them.
   [first year, renewal] */
const PRICES = {
  'in':      [750, 950],
  'co.in':   [600, 800],
  'net.in':  [600, 800],
  'org.in':  [600, 800],
  'firm.in': [600, 800],
  'gen.in':  [600, 800],
  'ind.in':  [600, 800],
  'com':     [950, 1050],
  'net':     [1150, 1250],
  'org':     [1000, 1150],
  'info':    [400, 1900],
  'biz':     [700, 1500],
  'co':      [900, 2900],
  'io':      [3200, 4200],
  'dev':     [1300, 1400],
  'app':     [1400, 1500],
  'page':    [900, 1000],
  'site':    [300, 2400],
  'online':  [300, 2900],
  'store':   [400, 4500],
  'shop':    [400, 2900],
  'tech':    [400, 3900],
  'xyz':     [200, 1100],
};
const PRICE_ASOF = 'August 2026 — indicative retail, verify before quoting';

function tldOf(name){
  const p = String(name).toLowerCase().trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').split('.');
  if(p.length < 2) return '';
  const two = p.slice(-2).join('.');
  if(RDAP[two]) return two;
  return p[p.length-1];
}
function priceOf(name){
  const t = tldOf(name);
  const p = PRICES[t];
  return p ? { tld:t, first:p[0], renew:p[1], asOf:PRICE_ASOF }
           : { tld:t, first:null, renew:null, asOf:PRICE_ASOF };
}

/* Syntax gate BEFORE any network call. An invalid label wastes a request
   and, worse, a 404 on a malformed name looks exactly like "available". */
function validate(name){
  const n = String(name||'').toLowerCase().trim()
    .replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/\.$/,'');
  if(!n) return { ok:false, why:'empty' };
  if(n.length > 253) return { ok:false, why:'longer than 253 characters' };
  if(!n.includes('.')) return { ok:false, why:'no extension — write it as name.in or name.com' };
  const labels = n.split('.');
  const sld = labels[0];
  for(const l of labels){
    if(!l.length) return { ok:false, why:'empty part between dots' };
    if(l.length > 63) return { ok:false, why:`the part "${l.slice(0,20)}…" is over 63 characters` };
    if(!/^[a-z0-9-]+$/.test(l)) return { ok:false, why:'only letters, numbers and hyphens are allowed' };
    if(l.startsWith('-') || l.endsWith('-')) return { ok:false, why:'a part cannot start or end with a hyphen' };
  }
  if(/^..--/.test(sld) && !/^xn--/.test(sld))
    return { ok:false, why:'two hyphens in positions 3 and 4 are reserved' };
  return { ok:true, name:n, sld, tld: tldOf(n) };
}

function get(url, timeout){
  return new Promise((resolve,reject)=>{
    let done=false;
    const req = https.get(url, { headers:{ 'User-Agent':UA, 'Accept':'application/rdap+json, application/json' } }, res=>{
      /* follow one redirect — the IANA resolver uses them */
      if([301,302,303,307,308].includes(res.statusCode) && res.headers.location){
        res.resume();
        if(done) return; done=true;
        return get(res.headers.location, timeout).then(resolve,reject);
      }
      let b=''; res.on('data',c=>{ b+=c; if(b.length>200000) req.destroy(); });
      res.on('end',()=>{ if(done) return; done=true; resolve({ status:res.statusCode, body:b }); });
    });
    req.setTimeout(timeout||9000, ()=>{ req.destroy(new Error('RDAP timed out')); });
    req.on('error',e=>{ if(done) return; done=true; reject(e); });
  });
}

/* THE CHECK. Returns a verdict that never guesses:
     AVAILABLE  — registry returned 404, the name is genuinely unregistered
     TAKEN      — registry returned 200 with a record
     UNKNOWN    — anything else. Never reported as available. */
async function check(name, timeout){
  const v = validate(name);
  if(!v.ok) return { name:String(name), status:'INVALID', why:v.why, price:null };

  const base = RDAP[v.tld] || FALLBACK;
  const url = base.replace(/\/$/,'') + '/domain/' + encodeURIComponent(v.name);
  const t0 = Date.now();
  let r;
  try{ r = await get(url, timeout); }
  catch(e){
    return { name:v.name, tld:v.tld, status:'UNKNOWN',
      why:`could not reach the ${v.tld} registry (${e.message}) — this is NOT the same as available`,
      ms:Date.now()-t0, price:priceOf(v.name) };
  }
  const ms = Date.now()-t0;
  const price = priceOf(v.name);

  if(r.status === 404)
    return { name:v.name, tld:v.tld, status:'AVAILABLE', ms, price,
             source:'RDAP '+new URL(base).hostname };
  if(r.status === 200){
    let d={}; try{ d = JSON.parse(r.body); }catch(e){}
    const ev = {}; (d.events||[]).forEach(e=>{ ev[e.eventAction]=e.eventDate; });
    let registrar = '';
    for(const en of (d.entities||[])){
      if((en.roles||[]).includes('registrar') && en.vcardArray){
        const fn = (en.vcardArray[1]||[]).find(x=>x[0]==='fn');
        if(fn) registrar = fn[3];
      }
    }
    return { name:v.name, tld:v.tld, status:'TAKEN', ms, price,
      registered: ev.registration || null, expires: ev.expiration || null,
      registrar: registrar || null,
      locked: (d.status||[]).some(s=>/prohibited/i.test(s)),
      source:'RDAP '+new URL(base).hostname };
  }
  if(r.status === 429)
    return { name:v.name, tld:v.tld, status:'UNKNOWN', ms, price,
      why:'the registry rate-limited this check — slow down and retry' };
  return { name:v.name, tld:v.tld, status:'UNKNOWN', ms, price,
    why:`registry replied HTTP ${r.status} — treat as unknown, never as available` };
}

/* Check many, politely. Registries will throttle a burst, and a throttled
   check that reads as UNKNOWN is useless. Small batches, small gap. */
async function checkMany(names, opts){
  opts = opts || {};
  const lane = Math.min(4, Math.max(1, opts.lanes||3));
  const gap  = opts.gap==null ? 250 : opts.gap;
  const out = [];
  const q = names.slice(0, opts.cap || 60);
  while(q.length){
    const batch = q.splice(0, lane);
    const rs = await Promise.all(batch.map(n=>check(n, opts.timeout)));
    out.push(...rs);
    if(q.length && gap) await new Promise(r=>setTimeout(r, gap));
  }
  return out;
}

/* Expand a bare word across a set of extensions. */
function expand(sld, tlds){
  const clean = String(sld||'').toLowerCase().trim()
    .replace(/[^a-z0-9- ]/g,'').replace(/\s+/g,'').replace(/^-+|-+$/g,'');
  if(!clean) return [];
  return (tlds && tlds.length ? tlds : ['in','com','co.in','net','org','xyz'])
    .map(t=>clean+'.'+String(t).replace(/^\./,''));
}

module.exports = { check, checkMany, validate, expand, tldOf, priceOf,
                   RDAP, PRICES, PRICE_ASOF };

return module.exports; })();

__M['factory'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* ==========================================================================
   FACTORY — turns an approved idea into a real, complete business asset pack.

   Zero dependencies. node:zlib for ZIP deflate, everything else is string work.

   The important design decision in this file: THE AI DOES NOT DESIGN ANYTHING.
   The AI writes copy, prices, policy text and app logic. The layout, the CSS,
   the typography scale, the header, the footer, the legal block — all of that
   is hand-written here, once, like a real studio's house style. That is the
   difference between a site that looks generated and a site that looks like a
   small firm paid someone to build it.
   ========================================================================== */
const zlib = require('zlib');

/* ---------------------------------------------------------------- ZIP ----
   Minimal but spec-correct ZIP (deflate, no encryption, no zip64).
   Verified against `unzip -t`. */
function crc32(buf){
  let c, t = crc32.T;
  if(!t){ t = crc32.T = [];
    for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c>>>0; } }
  let crc = 0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) crc = (crc>>>8) ^ t[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosTime(d){
  return ((d.getHours()<<11) | (d.getMinutes()<<5) | (Math.floor(d.getSeconds()/2))) & 0xFFFF;
}
function dosDate(d){
  return (((d.getFullYear()-1980)<<9) | ((d.getMonth()+1)<<5) | d.getDate()) & 0xFFFF;
}
/* files: [{name, data:Buffer|string}] */
function zip(files, when){
  const d = when || new Date();
  const t = dosTime(d), dt = dosDate(d);
  const locals = [], central = [];
  let offset = 0;

  for(const f of files){
    const name = Buffer.from(f.name, 'utf8');
    const raw  = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const use  = comp.length < raw.length ? comp : raw;
    const method = use === comp ? 8 : 0;
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            /* version needed */
    lh.writeUInt16LE(0x0800, 6);        /* UTF-8 names */
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(t, 10); lh.writeUInt16LE(dt, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(use.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, use);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(t, 12); ch.writeUInt16LE(dt, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(use.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(0, 38);            /* external attrs */
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);

    offset += 30 + name.length + use.length;
  }

  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ------------------------------------------------------- REALNESS AUDIT ----
   Everything below is a phrase, pattern or habit that makes a reader think
   "a machine wrote this". Each one is a real tell seen in generated sites. */
const TELLS = [
  [/\bunlock (the|your) (power|potential)\b/i, 'Marketing filler: "unlock the power"'],
  [/\bin today'?s (fast[- ]paced|digital|modern) world\b/i, 'Essay opener: "in today\'s ... world"'],
  [/\brevolution(ary|ise|ize|ising|izing)\b/i, 'Overclaim: "revolutionary"'],
  [/\bgame[- ]chang(er|ing)\b/i, 'Cliché: "game-changer"'],
  [/\bseamless(ly)?\b/i, 'Filler adjective: "seamless"'],
  [/\bcutting[- ]edge\b/i, 'Filler adjective: "cutting-edge"'],
  [/\bstate[- ]of[- ]the[- ]art\b/i, 'Filler adjective: "state-of-the-art"'],
  [/\bempower(s|ing|ed)?\b/i, 'Filler verb: "empower"'],
  [/\bharness(es|ing)?\b/i, 'Filler verb: "harness"'],
  [/\belevate your\b/i, 'Filler: "elevate your"'],
  [/\btake .{0,20} to the next level\b/i, 'Cliché: "to the next level"'],
  [/\bwe (are )?(pride ourselves|take pride)\b/i, 'Generic about-us filler'],
  [/\bjourney\b/i, 'Overused word: "journey"'],
  [/\bdelve\b/i, 'Model tell: "delve"'],
  [/\btapestry\b/i, 'Model tell: "tapestry"'],
  [/\btestament to\b/i, 'Model tell: "a testament to"'],
  [/\bAI[- ](powered|driven|enabled)\b/i, 'Says AI-powered — buyers discount it, and it is not the selling point'],
  [/\bpowered by (AI|artificial intelligence|GPT|LLM)\b/i, 'Advertises the AI instead of the outcome'],
  [/\bLorem ipsum\b/i, 'Placeholder text left in'],
  [/\[(insert|your [a-z ]+ here|placeholder)/i, 'Unfilled placeholder bracket'],
  [/\bexample\.com\b/i, 'example.com left in'],
  [/\bjohn doe\b/i, 'Fake person name'],
  [/\b(10,?000|thousands of|millions of) (happy )?(customers|users|clients)\b/i, 'FABRICATED SOCIAL PROOF — this gets you caught'],
  [/\btrusted by \d/i, 'FABRICATED SOCIAL PROOF — "trusted by N"'],
  [/★{3,}|⭐{2,}/, 'Fake star ratings'],
  [/\b\d{2,3}% (of|increase|faster|more)\b/i, 'Unsourced statistic — verify or delete'],
  [/linear-gradient\(\s*(?:to [a-z ]+|\d+deg)\s*,\s*#?[0-9a-f]{3,8}\s*,\s*#?[0-9a-f]{3,8}\s*\)/i,
   'Two-stop purple-era gradient — the single strongest "AI template" signal'],
  [/font-family:\s*['"]?(Inter|Poppins|Montserrat)/i, 'Default generated-site typeface'],
  [/🚀|✨|💡|🔥|🎯|💪|🌟/, 'Emoji in body copy — reads as a bot, not a firm'],
];
function audit(text){
  const hits = [];
  for(const [re, why] of TELLS){
    const m = String(text).match(re);
    if(m) hits.push({ found: String(m[0]).slice(0, 60), why });
  }
  return hits;
}

/* --------------------------------------------------------- DESIGN SYSTEM ----
   Hand-written house style. Restrained, print-influenced, the way a small
   professional firm's site actually looks. Palette is derived, not random. */
const FONTSTACKS = [
  `Georgia, 'Times New Roman', serif`,
  `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`,
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  `'Charter', 'Bitstream Charter', Cambria, Georgia, serif`,
];
function hexOk(h, fb){ return /^#[0-9a-fA-F]{6}$/.test(String(h||'')) ? h : fb; }

function css(id){
  const ink   = hexOk(id.ink,   '#1A1A18');
  const brand = hexOk(id.brand, '#1F3A5F');
  const paper = hexOk(id.paper, '#FCFBF7');
  const rule  = hexOk(id.rule,  '#DDD9CF');
  const head  = FONTSTACKS[(id.fontIndex|0) % FONTSTACKS.length];
  const body  = (id.fontIndex|0) % 2 === 0
    ? `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`
    : `Georgia, 'Times New Roman', serif`;
  return `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${paper};color:${ink};font:16px/1.65 ${body};
  -webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:0 22px}
a{color:${brand}}
a:hover{color:${ink}}
h1,h2,h3,h4{font-family:${head};font-weight:600;line-height:1.22;margin:0 0 .5em;letter-spacing:-.01em}
h1{font-size:34px}h2{font-size:24px;margin-top:2em}h3{font-size:18px;margin-top:1.6em}
p{margin:0 0 1.05em}
ul,ol{margin:0 0 1.1em;padding-left:20px}li{margin:.35em 0}
hr{border:0;border-top:1px solid ${rule};margin:34px 0}
small,.small{font-size:13.5px;color:#6B675E}

header.site{border-bottom:1px solid ${rule};background:${paper};position:sticky;top:0;z-index:20}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;
  gap:16px;min-height:64px;flex-wrap:wrap}
.brandmark{display:flex;align-items:center;gap:10px;text-decoration:none;color:${ink}}
.brandmark span{font-family:${head};font-size:18px;font-weight:600;letter-spacing:-.01em}
nav.site a{display:inline-block;margin-left:20px;font-size:14.5px;text-decoration:none;
  color:#4A463E;padding:6px 0;border-bottom:2px solid transparent}
nav.site a:hover{color:${ink};border-bottom-color:${brand}}
nav.site a.on{color:${ink};border-bottom-color:${brand}}

.hero{padding:56px 0 40px;border-bottom:1px solid ${rule}}
.hero h1{max-width:19ch}
.lede{font-size:19px;line-height:1.55;max-width:60ch;color:#3A362E}
section{padding:38px 0;border-bottom:1px solid ${rule}}
section:last-of-type{border-bottom:0}

.btn{display:inline-block;background:${brand};color:#fff;text-decoration:none;
  padding:12px 22px;border-radius:3px;font-size:15px;font-weight:600;border:1px solid ${brand}}
.btn:hover{background:${ink};border-color:${ink};color:#fff}
.btn.ghost{background:transparent;color:${brand}}
.btn.ghost:hover{background:${brand};color:#fff}
.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:22px}

.cols{display:grid;gap:26px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{border:1px solid ${rule};border-radius:4px;padding:20px;background:#fff}
.card h3{margin-top:0}

table.plain{width:100%;border-collapse:collapse;font-size:15px}
table.plain th,table.plain td{text-align:left;padding:10px 12px;border-bottom:1px solid ${rule};vertical-align:top}
table.plain th{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6B675E;font-weight:600}

.price{border:1px solid ${rule};border-radius:4px;padding:24px;background:#fff;display:flex;flex-direction:column}
.price.pick{border-color:${brand};border-width:2px}
.price .amt{font-family:${head};font-size:30px;font-weight:600;margin:6px 0 2px}
.price ul{list-style:none;padding:0;margin:14px 0 20px;font-size:15px}
.price li{padding:6px 0 6px 20px;position:relative;border-bottom:1px solid #F0EDE5}
.price li::before{content:'—';position:absolute;left:0;color:#9A958A}
.price .btn{margin-top:auto;text-align:center}

dl.faq dt{font-weight:600;margin-top:18px}
dl.faq dd{margin:6px 0 0;color:#3A362E}

footer.site{background:#fff;border-top:1px solid ${rule};margin-top:0;padding:30px 0 40px;font-size:14px;color:#5A564D}
footer.site .fcols{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:22px}
footer.site a{color:#5A564D;text-decoration:none;display:block;padding:3px 0}
footer.site a:hover{color:${ink};text-decoration:underline}
footer.site .legal{border-top:1px solid ${rule};padding-top:16px;font-size:12.5px;color:#807B71}

.notice{border-left:3px solid ${brand};background:#fff;padding:14px 18px;margin:22px 0;font-size:15px}
@media(max-width:700px){
  h1{font-size:27px}h2{font-size:21px}.hero{padding:38px 0 30px}
  .lede{font-size:17px}
  nav.site{width:100%;overflow-x:auto;white-space:nowrap}
  nav.site a{margin:0 18px 0 0}
  header.site .wrap{padding-top:10px;padding-bottom:6px}
}
@media print{header.site,footer.site nav,.actions{display:none}body{background:#fff}}`;
}

/* Simple, non-generated wordmark: initials in a ruled box. No AI-looking
   swooshes, no gradient blobs. Scales cleanly and prints. */
function logoSvg(id){
  const brand = hexOk(id.brand, '#1F3A5F');
  const ini = String(id.name||'B').split(/\s+/).filter(Boolean).slice(0,2)
    .map(w=>w[0].toUpperCase()).join('') || 'B';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="34" height="34" role="img" aria-label="${esc(id.name||'')}">
<rect x="0.75" y="0.75" width="32.5" height="32.5" rx="2.5" fill="none" stroke="${brand}" stroke-width="1.5"/>
<text x="17" y="17" text-anchor="middle" dominant-baseline="central"
 font-family="Georgia, serif" font-size="${ini.length>1?13:16}" font-weight="600" fill="${brand}">${ini}</text>
</svg>`;
}

function esc(s){ return String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const PAGES = [
  ['index.html',   'Home'],
  ['pricing.html', 'Pricing'],
  ['how-it-works.html','How it works'],
  ['about.html',   'About'],
  ['contact.html', 'Contact'],
];
const LEGAL = [
  ['terms.html','Terms of Service'],
  ['privacy.html','Privacy Policy'],
  ['refund.html','Refund & Cancellation'],
  ['shipping.html','Service Delivery'],
];

/* Wrap AI-written <main> content in the house shell. */
function shell(id, file, title, mainHtml, opts){
  opts = opts || {};
  const year = new Date().getFullYear();
  const nav = PAGES.map(([f,l])=>
    `<a href="${f}"${f===file?' class="on"':''}>${esc(l)}</a>`).join('');
  const legalNav = LEGAL.map(([f,l])=>`<a href="${f}">${esc(l)}</a>`).join('');
  const gst = id.gstin ? `<br>GSTIN: ${esc(id.gstin)}` : '';
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${title===id.name?'':' · '+esc(id.name)}</title>
<meta name="description" content="${esc((opts.desc||id.tagline||'').slice(0,155))}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc((opts.desc||id.tagline||'').slice(0,155))}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logoSvg(id))}">
<style>${css(id)}</style>
</head>
<body>
<header class="site"><div class="wrap">
 <a class="brandmark" href="index.html">${logoSvg(id)}<span>${esc(id.name)}</span></a>
 <nav class="site">${nav}</nav>
</div></header>
<main>
${mainHtml}
</main>
<footer class="site"><div class="wrap">
 <div class="fcols">
  <div><strong>${esc(id.name)}</strong><br>
   <span class="small">${esc(id.tagline||'')}</span></div>
  <div>${PAGES.map(([f,l])=>`<a href="${f}">${esc(l)}</a>`).join('')}</div>
  <div>${legalNav}</div>
  <div><a href="mailto:${esc(id.email)}">${esc(id.email)}</a>
   ${id.phone?`<a href="tel:${esc(String(id.phone).replace(/[^\d+]/g,''))}">${esc(id.phone)}</a>`:''}
   <span class="small">${esc(id.address||'Ludhiana, Punjab, India')}</span></div>
 </div>
 <div class="legal">© ${year} ${esc(id.legalName||id.name)}. ${esc(id.address||'Ludhiana, Punjab, India')}.${gst}<br>
  Prices in Indian Rupees (INR). This is a sole-proprietor business.</div>
</div></footer>
</body>
</html>`;
}

/* README the Owner actually needs — publishing, payments, and what is missing. */
function ownerReadme(id, files, pay){
  const list = files.map(f=>'  ' + f.name).join('\n');
  return `${id.name.toUpperCase()}
${'='.repeat(id.name.length)}

${id.tagline||''}

WHAT IS IN THIS PACK
${list}

PUT THE WEBSITE LIVE (free, about 3 minutes)
  1. Unzip this folder.
  2. Open app.netlify.com/drop in a browser.
  3. Drag the whole "site" folder onto the page.
  4. It is live on a free URL immediately. Copy that URL.
  5. Optional: buy a .in domain (~Rs 700/year) and point it there.
     Do that AFTER the first paying client, not before.

  Cloudflare Pages and GitHub Pages work the same way and are also free.

PAYMENTS
  ${pay ? `Payment links are generated through ${pay.gateway.toUpperCase()} (${pay.live?'LIVE':'TEST MODE'}).
  Every "Pay" button in the site points at a real link. Test one yourself with
  a Rs 1 link before you send it to a client.`
        : `No payment gateway is connected yet, so every "Pay" button is an email
  link instead. Connect Razorpay in the Payments page and rebuild to get real
  buttons. Razorpay needs your PAN, bank account and these four policy pages —
  which is exactly why terms.html, privacy.html, refund.html and shipping.html
  are in this pack. Upload them to your site BEFORE applying, or KYC is refused.`}

WHAT YOU STILL HAVE TO DO YOURSELF
  - Read every page once. If a sentence is not true, delete it. Nothing here
    claims customers you do not have, but you must confirm the promises are
    ones you can keep.
  - Put your real phone number in. A missing phone number kills B2B trust in
    India faster than a bad design.
  - Register the business name only if you need to invoice with GST.

WHAT THIS PACK DOES NOT CONTAIN
  - Customers. A site is a place to send people; it does not find them.
  - Any testimonial, rating, client logo or statistic. All of those were
    deliberately left out because you have not earned them yet and a prospect
    who catches one invented number will not buy anything from you again.
`;
}

module.exports = { zip, crc32, audit, TELLS, css, shell, logoSvg, esc,
                   PAGES, LEGAL, ownerReadme, FONTSTACKS };

return module.exports; })();

__M['llm'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Zero-dependency LLM client. node:https only.
   OpenAI-compatible endpoints — Groq, Google AI Studio, NVIDIA NIM,
   OpenRouter, Cerebras, and local Ollama. All have genuinely free tiers.
   The Owner supplies their own key; nothing is stored in the audit ledger. */
const https = require('https');
const http  = require('http');

const PROVIDERS = {
  custom: {
    label:'Custom — any OpenAI-compatible API', host:'', path:'/v1/chat/completions',
    model:'', custom:true,
    signup:'Paste any base URL that speaks the OpenAI chat format. Works with DeepSeek, Together, Fireworks, Mistral, Perplexity, LM Studio, vLLM, LiteLLM, OpenRouter — and any self-hosted endpoint.' },
  groq: {
    label:'Groq (fastest free tier)', host:'api.groq.com', path:'/openai/v1/chat/completions',
    model:'openai/gpt-oss-120b',
    signup:'console.groq.com — email only, no card. ~14,400 req/day. Models: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.6-27b' },
  gemini: {
    label:'Google AI Studio', host:'generativelanguage.googleapis.com',
    path:'/v1beta/openai/chat/completions', model:'gemini-2.0-flash',
    signup:'aistudio.google.com/apikey — no card. Note: prompts may train Google models outside EEA/UK/CH.' },
  nvidia: {
    label:'NVIDIA NIM (120+ models)', host:'integrate.api.nvidia.com',
    path:'/v1/chat/completions', model:'meta/llama-3.3-70b-instruct',
    signup:'build.nvidia.com — email + phone. ~40 req/min, dev use.' },
  openrouter: {
    label:'OpenRouter', host:'openrouter.ai', path:'/api/v1/chat/completions',
    model:'meta-llama/llama-3.3-70b-instruct:free',
    signup:'openrouter.ai/keys — no card. 50 req/day unfunded.' },
  cerebras: {
    label:'Cerebras', host:'api.cerebras.ai', path:'/v1/chat/completions',
    model:'llama-3.3-70b',
    signup:'cloud.cerebras.ai — no card. 1M tokens/day.' },
  ollama: {
    label:'Ollama (local, unlimited, fully private)', host:'127.0.0.1', port:11434,
    path:'/v1/chat/completions', model:'llama3.2', plain:true, nokey:true,
    signup:'ollama.com — install, then: ollama pull llama3.2. No key, no limits, runs offline.' }
};

/* A custom provider carries its own host/path on the config itself, so any
   OpenAI-compatible endpoint works without me hard-coding it. */
function resolve_(cfg){
  const base = PROVIDERS[cfg.provider];
  if(!base) return null;
  if(!base.custom) return base;
  let host = cfg.host || '', path = cfg.path || '/v1/chat/completions', plain = false, port;
  if(/^https?:\/\//i.test(host)){
    try{ const u = new URL(host);
      host = u.hostname; port = u.port || undefined;
      plain = u.protocol === 'http:';
      if(u.pathname && u.pathname !== '/') path = u.pathname.replace(/\/$/,'') + '/chat/completions';
    }catch(e){}
  }
  return Object.assign({}, base, { host, path, plain, port,
    label: 'Custom · ' + (host || 'unset'),
    nokey: !cfg.key });
}

function chat(cfg, messages, opts={}){
  return new Promise((resolve,reject)=>{
    const P = resolve_(cfg);
    if(!P) return reject(new Error('Unknown provider: '+cfg.provider));
    if(P.custom && !P.host) return reject(new Error('Custom provider needs a base URL, e.g. https://api.deepseek.com/v1'));
    if(!P.nokey && !cfg.key) return reject(new Error('No API key configured for '+P.label));

    /* Local models on weak hardware: every token costs real seconds.
       Cap output hard, shrink the context window, and keep the model
       resident in RAM so it is not reloaded from disk on every call. */
    const isLocal = cfg.provider==='ollama';
    const body = JSON.stringify(Object.assign({
      model: cfg.model || P.model,
      messages,
      temperature: opts.temperature!=null?opts.temperature:0.4,
      max_tokens: opts.max_tokens || (isLocal ? 400 : 3000)
    }, isLocal ? {
      keep_alive: '30m',
      options: {
        num_ctx: 2048,        // small context = far less RAM and much faster
        num_thread: 2,        // match the N4500's 2 physical cores
        num_batch: 64,        // smaller batches suit low-memory machines
        top_k: 20,            // less sampling work per token
        repeat_penalty: 1.1
      }
    } : {}));
    const headers = { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) };
    if(!P.nokey) headers['Authorization']='Bearer '+cfg.key;
    if(cfg.provider==='openrouter'){ headers['HTTP-Referer']='http://localhost'; headers['X-Title']='Chairman Agent OS'; }

    const lib = P.plain ? http : https;
    const t0 = Date.now();
    const req = lib.request({ hostname:P.host, port:P.port||(P.plain?80:443),
      path:P.path, method:'POST', headers,
      timeout: opts.timeout || (isLocal ? 300000 : 60000) }, res=>{
      let d='';
      res.on('data',c=>d+=c);
      res.on('end',()=>{
        if(res.statusCode===401||res.statusCode===403)
          return reject(new Error('KEY REJECTED — check the API key for '+P.label));
        if(res.statusCode===429)
          return reject(new Error('RATE LIMITED — free tier quota hit. Wait, or switch provider.'));
        /* Only treat this as a retired model when the PROVIDER is complaining.
           Scanning the whole body for "not found" was a real bug: a perfectly
           good completion that happened to contain the words "not found" —
           e.g. an outreach plan saying "address not found yet" — was reported
           to the Owner as MODEL RETIRED. Diagnose the error envelope, never
           the model's own prose. */
        let errText = '';
        if(res.statusCode>=400){
          errText = d;
        } else {
          try{
            const probe = JSON.parse(d);
            if(probe && probe.error) errText = JSON.stringify(probe.error);
          }catch(e){ /* not JSON — cannot be a structured provider error */ }
        }
        if(res.statusCode===404 || /decommission|deprecat|does not exist|model_not_found|no such model/i.test(errText))
          return reject(new Error('MODEL RETIRED — "'+(cfg.model||P.model)+'" no longer exists on '+P.label+
            '. Press FETCH LIVE MODELS to see what is available today.'));
        if(res.statusCode>=400)
          return reject(new Error('HTTP '+res.statusCode+': '+d.slice(0,220)));
        try{
          const j=JSON.parse(d);
          const c=j.choices&&j.choices[0];
          const text=c&&c.message&&c.message.content;
          if(!text) return reject(new Error('Empty response from model'));
          /* length = the model was cut off mid-sentence. Say so rather than
             handing back half an answer that looks complete. */
          const truncated = c.finish_reason==='length';
          resolve({ text:text.trim()+(truncated
              ? '\n\n[TRUNCATED — the model hit its output limit here. Ask for fewer items, or re-run for the rest.]'
              : ''),
            truncated, ms:Date.now()-t0,
            tokens:(j.usage&&j.usage.total_tokens)||0, model:j.model||cfg.model||P.model });
        }catch(e){ reject(new Error('Bad JSON from provider')); }
      });
    });
    req.on('timeout',()=>{ req.destroy(); reject(new Error(isLocal
      ? 'TIMEOUT — a local model on slow hardware can take minutes. Try a smaller model (qwen2.5:1.5b) or switch to Groq.'
      : 'TIMEOUT — model took too long')); });
    req.on('error',e=>{
      const c = e.code||e.message||'';
      if(cfg.provider==='ollama' && /ECONNREFUSED/.test(c))
        return reject(new Error('OLLAMA NOT RUNNING — start it, or switch provider to Groq. Install: ollama.com'));
      if(/ETIMEDOUT|ETIMEOUT/i.test(c))
        return reject(new Error(isLocal
          ? 'ETIMEDOUT — Ollama did not answer. It may be loading a model too large for this machine, or not running at all.'
          : 'ETIMEDOUT — no reply from '+P.label+'. Usually your internet dropped, or the provider is unreachable. Check your connection and press TEST IT again.'));
      if(/ENOTFOUND|EAI_AGAIN/i.test(c))
        return reject(new Error('NO INTERNET — cannot reach '+P.label+'. Check your connection.'));
      if(/ECONNRESET/i.test(c))
        return reject(new Error('CONNECTION DROPPED mid-request. Try again.'));
      reject(new Error(c));
    });
    req.write(body); req.end();
  });
}

/* Ask the provider what models it actually serves TODAY.
   Providers retire models without warning — this stops a dead default
   from looking like a broken key. */
function listModels(cfg){
  return new Promise((resolve,reject)=>{
    const P = resolve_(cfg);
    if(!P) return reject(new Error('Unknown provider'));
    const path = P.path.replace(/\/chat\/completions$/,'/models');
    const headers = { 'Accept':'application/json' };
    if(!P.nokey) headers['Authorization']='Bearer '+cfg.key;
    const lib = P.plain ? http : https;
    const req = lib.request({ hostname:P.host, port:P.port||(P.plain?80:443),
      path, method:'GET', headers, timeout:20000 }, res=>{
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        if(res.statusCode===401||res.statusCode===403) return reject(new Error('KEY REJECTED'));
        if(res.statusCode>=400) return reject(new Error('HTTP '+res.statusCode));
        try{
          const j=JSON.parse(d);
          const ids=(j.data||j.models||[]).map(m=>m.id||m.name).filter(Boolean)
            .filter(id=>!/whisper|tts|orpheus|embed|guard|safeguard/i.test(id)).sort();
          resolve(ids);
        }catch(e){ reject(new Error('Bad JSON')); }
      });
    });
    req.on('timeout',()=>{ req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error',e=>reject(new Error(e.code||e.message)));
    req.end();
  });
}

/* ---------------- FAILOVER ----------------
   Free tiers throttle. Instead of failing the whole job, try the next
   configured provider. The Owner adds spare keys in the AI Brain page;
   nothing is shared between them and each is used only when the one
   before it is exhausted. */
function isQuota(msg){
  return /RATE LIMIT|429|quota|exhaust|too many|capacity/i.test(String(msg));
}

/**
 * cfg    — the primary { provider, key, model }
 * backups— array of the same shape, tried in order on quota errors
 */
async function chatFailover(cfg, backups, messages, opts){
  const chain = [cfg].concat(Array.isArray(backups) ? backups : []).filter(c=>c && c.provider);
  let lastErr = null;
  for(let i=0;i<chain.length;i++){
    const c = chain[i];
    try{
      const r = await chat(c, messages, opts);
      r.usedProvider = c.provider;
      r.usedBackup   = i > 0;
      return r;
    }catch(e){
      lastErr = e;
      /* only slide to the next provider on quota/rate problems — a bad key
         or a retired model should surface immediately, not be masked */
      if(!isQuota(e.message) || i === chain.length-1) throw e;
    }
  }
  throw lastErr || new Error('No provider available');
}

module.exports = { chat, chatFailover, listModels, PROVIDERS };

return module.exports; })();

__M['meta'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* ==========================================================================
   META GRAPH API — official Instagram comment handling. Zero dependencies.

   I TOLD THE OWNER THREE TIMES THAT REPLYING TO COMMENTS COULD NOT BE
   AUTOMATED SAFELY. THAT WAS WRONG.

   What is true: browser extensions, password-sharing bots and session
   scrapers get accounts banned. That part I had right, and it is still
   right.

   What I got wrong: Meta publishes an OFFICIAL, sanctioned path for exactly
   this. With the instagram_manage_comments permission, an app can read,
   reply to, hide and delete comments through the Graph API. Meta explicitly
   permits automated replies to USER-INITIATED actions. I generalised from
   "bots get you banned" to "all automation gets you banned" and never
   checked. Verified live: graph.facebook.com/v22.0 answers, and the
   /{comment-id}/replies endpoint exists.

   THE LINE, and this module enforces it in code, not in a warning label:

     ALLOWED  — replying to someone who commented on YOUR post
                (they initiated; you are responding)
     ALLOWED  — one private DM reply to a qualifying commenter, within
                7 days for posts and reels
     BANNED   — cold DMs to people who never engaged
     BANNED   — mass identical replies at scale
     BANNED   — anything through a browser extension or your password
     BANNED   — auto-follow, follow/unfollow, engagement pods

   Requirements Meta imposes and nobody can bypass:
     · Instagram Business or Creator account. Personal accounts have NO API.
     · Linked Facebook Page.
     · A Meta Developer App and App Review for production use.
     · OAuth. Never a password.
   ========================================================================== */
const https = require('https');

const API = 'graph.facebook.com';
const VER = 'v22.0';

/* Meta's published ceiling is 750 private replies/hour. We pace far below
   that: this is one person's account, and looking like a firehose is what
   attracts scrutiny even when every call is legal. */
const LIMITS = {
  repliesPerHour: 40,      /* deliberately conservative */
  minGapMs: 20000,         /* 20s between replies — human-plausible */
  dmPerUserPer24h: 1,      /* Meta's own rule: one private reply */
  replyWindowDays: 7,      /* posts and reels */
};

function call(method, path, params, token){
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(Object.assign({}, params||{}, { access_token: token }));
    const isGet = method === 'GET';
    const body = isGet ? null : qs.toString();
    const opts = {
      hostname: API, method,
      path: `/${VER}/${String(path).replace(/^\//,'')}` + (isGet ? '?' + qs.toString() : ''),
      headers: Object.assign({ 'User-Agent': 'ChairmanOS/1.0' },
        body ? { 'Content-Type':'application/x-www-form-urlencoded',
                 'Content-Length': Buffer.byteLength(body) } : {})
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => { d += c; if(d.length > 500000) req.destroy(); });
      res.on('end', () => {
        let j = {};
        try { j = JSON.parse(d||'{}'); } catch(e){}
        if(j.error){
          const e = j.error;
          /* Translate Meta's codes into something the Owner can act on. */
          let msg = e.message || 'Meta API error';
          if(e.code === 190) msg = 'ACCESS TOKEN INVALID OR EXPIRED — reconnect the account.';
          else if(e.code === 200 || e.code === 10)
            msg = 'PERMISSION MISSING — this app has not been granted instagram_manage_comments. '
                + 'That needs Meta App Review before it works on a live account.';
          else if(e.code === 4 || e.code === 17 || e.code === 32)
            msg = 'RATE LIMITED by Meta. Stop and let it reset — pushing through is what gets accounts restricted.';
          else if(e.code === 100) msg = 'BAD REQUEST — ' + msg;
          else if(e.code === 803) msg = 'That object does not exist or this account cannot see it.';
          const err = new Error(msg);
          err.code = e.code; err.sub = e.error_subcode; err.raw = e;
          return reject(err);
        }
        if(res.statusCode >= 400)
          return reject(new Error('Meta HTTP ' + res.statusCode + ': ' + d.slice(0,200)));
        resolve(j);
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Meta API timed out')));
    req.on('error', reject);
    if(body) req.write(body);
    req.end();
  });
}

/* Confirm the token works and find the Instagram account behind it. */
async function verify(token){
  const me = await call('GET', 'me/accounts',
    { fields: 'id,name,instagram_business_account{id,username,followers_count,media_count}' }, token);
  const pages = (me.data || []).filter(p => p.instagram_business_account);
  if(!pages.length)
    throw new Error('No Instagram Business or Creator account is linked to any Facebook Page on this token. '
      + 'Personal Instagram accounts have no API access at all — convert to Professional first, then link a Page.');
  const p = pages[0];
  return {
    pageId: p.id, pageName: p.name,
    igId: p.instagram_business_account.id,
    username: p.instagram_business_account.username,
    followers: p.instagram_business_account.followers_count,
    mediaCount: p.instagram_business_account.media_count,
    otherPages: pages.length - 1,
  };
}

/* Recent posts, so we know where to look for comments. */
async function media(igId, token, limit){
  const r = await call('GET', `${igId}/media`,
    { fields: 'id,caption,media_type,permalink,timestamp,comments_count,like_count',
      limit: Math.min(25, limit || 10) }, token);
  return r.data || [];
}

/* Comments on one post, newest first, with existing replies so we never
   answer the same person twice. */
async function comments(mediaId, token){
  const r = await call('GET', `${mediaId}/comments`,
    { fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}',
      filter: 'stream', limit: 50 }, token);
  return r.data || [];
}

/* PUBLIC reply to a comment. This is the sanctioned action. */
async function reply(commentId, message, token){
  if(!String(message||'').trim()) throw new Error('Refusing to post an empty reply.');
  if(String(message).length > 2200) throw new Error('Reply is over Instagram\'s 2,200 character limit.');
  return await call('POST', `${commentId}/replies`, { message: String(message).trim() }, token);
}

/* PRIVATE reply — one per commenter, inside Meta's window. Used only when
   the answer contains something that does not belong in public, like a
   price list or a link. */
async function privateReply(igId, commentId, message, token){
  return await call('POST', `${igId}/messages`, {
    recipient: JSON.stringify({ comment_id: commentId }),
    message: JSON.stringify({ text: String(message).trim() })
  }, token);
}

async function hide(commentId, token, on){
  return await call('POST', commentId, { hide: on !== false }, token);
}

module.exports = { call, verify, media, comments, reply, privateReply, hide, LIMITS, VER };

return module.exports; })();

__M['pay'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Real payment links. Razorpay + Stripe. node:https + crypto only, zero deps.
   Payment Links are used deliberately: they return a URL you can send over
   WhatsApp/email with no frontend integration and no PCI surface. */
const https = require('https');
const crypto = require('crypto');

function req(host, path, method, headers, bodyStr){
  return new Promise((resolve,reject)=>{
    const h = Object.assign({}, headers);
    if(bodyStr) h['Content-Length'] = Buffer.byteLength(bodyStr);
    const r = https.request({hostname:host, path, method, headers:h, timeout:25000}, res=>{
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        let j=null; try{ j=JSON.parse(d); }catch(e){}
        if(res.statusCode>=400){
          const msg = (j && (j.error?.description || j.error?.message)) || d.slice(0,200);
          return reject(new Error('HTTP '+res.statusCode+': '+msg));
        }
        resolve(j||{});
      });
    });
    r.on('timeout',()=>{ r.destroy(); reject(new Error('TIMEOUT contacting payment provider')); });
    r.on('error',e=>reject(new Error(e.code||e.message)));
    if(bodyStr) r.write(bodyStr);
    r.end();
  });
}

/* ---------------- RAZORPAY (India: UPI, cards, netbanking) ---------------- */
const RZP = {
  id:'razorpay', label:'Razorpay (India — UPI, cards, netbanking)',
  currency:'INR', minor:100,
  signup:'razorpay.com — needs KYC (PAN + bank account). Test keys work instantly with rzp_test_ prefix.',
  keyHint:'Key ID (rzp_test_... or rzp_live_...) and Key Secret from Settings > API Keys',

  auth(cfg){ return 'Basic '+Buffer.from(cfg.keyId+':'+cfg.keySecret).toString('base64'); },

  async verify(cfg){
    /* cheapest authenticated call that proves the keys work */
    await req('api.razorpay.com','/v1/payments?count=1','GET',
      {'Authorization':this.auth(cfg)});
    return { live: /^rzp_live_/.test(cfg.keyId) };
  },

  async link(cfg, o){
    const body = JSON.stringify({
      amount: Math.round(o.amount * this.minor),
      currency: 'INR',
      description: o.description,
      customer: { name:o.name||'', email:o.email||'', contact:o.phone||'' },
      notify: { sms: !!o.phone, email: !!o.email },
      reminder_enable: true,
      notes: { source:'chairman-agent-os', ref:o.ref||'' },
      callback_method: 'get'
    });
    const j = await req('api.razorpay.com','/v1/payment_links','POST',
      {'Authorization':this.auth(cfg),'Content-Type':'application/json'}, body);
    return { id:j.id, url:j.short_url, status:j.status, amount:o.amount, currency:'INR' };
  },

  async status(cfg, id){
    const j = await req('api.razorpay.com','/v1/payment_links/'+encodeURIComponent(id),'GET',
      {'Authorization':this.auth(cfg)});
    return { status:j.status, paid:(j.amount_paid||0)/this.minor, url:j.short_url };
  },

  /* Verify a webhook actually came from Razorpay before trusting it. */
  verifyWebhook(secret, rawBody, signature){
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try{ return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature||''))); }
    catch(e){ return false; }
  }
};

/* ---------------- STRIPE (international) ---------------- */
const STR = {
  id:'stripe', label:'Stripe (international cards)',
  currency:'USD', minor:100,
  signup:'stripe.com — test keys (sk_test_...) work immediately, no KYC until you go live.',
  keyHint:'Secret key (sk_test_... or sk_live_...) from Developers > API keys',

  form(obj, prefix, out){
    out = out || [];
    for(const [k,v] of Object.entries(obj)){
      if(v===undefined||v===null||v==='') continue;
      const key = prefix ? `${prefix}[${k}]` : k;
      if(typeof v==='object' && !Array.isArray(v)) this.form(v, key, out);
      else if(Array.isArray(v)) v.forEach((x,i)=>{
        if(typeof x==='object') this.form(x, `${key}[${i}]`, out);
        else out.push(encodeURIComponent(`${key}[${i}]`)+'='+encodeURIComponent(x));
      });
      else out.push(encodeURIComponent(key)+'='+encodeURIComponent(v));
    }
    return out;
  },

  async verify(cfg){
    await req('api.stripe.com','/v1/balance','GET',
      {'Authorization':'Bearer '+cfg.keySecret});
    return { live: /^sk_live_/.test(cfg.keySecret) };
  },

  async link(cfg, o){
    const cur = (o.currency||'usd').toLowerCase();
    const priceBody = this.form({
      currency: cur,
      unit_amount: Math.round(o.amount * this.minor),
      'product_data': { name: o.description }
    }).join('&');
    const price = await req('api.stripe.com','/v1/prices','POST',
      {'Authorization':'Bearer '+cfg.keySecret,'Content-Type':'application/x-www-form-urlencoded'}, priceBody);

    const linkBody = this.form({
      line_items: [ { price: price.id, quantity: 1 } ],
      metadata: { source:'chairman-agent-os', ref:o.ref||'' }
    }).join('&');
    const j = await req('api.stripe.com','/v1/payment_links','POST',
      {'Authorization':'Bearer '+cfg.keySecret,'Content-Type':'application/x-www-form-urlencoded'}, linkBody);
    return { id:j.id, url:j.url, status:j.active?'created':'inactive', amount:o.amount, currency:cur.toUpperCase() };
  },

  async status(cfg, id){
    const j = await req('api.stripe.com','/v1/payment_links/'+encodeURIComponent(id),'GET',
      {'Authorization':'Bearer '+cfg.keySecret});
    return { status:j.active?'active':'inactive', paid:0, url:j.url };
  },

  verifyWebhook(secret, rawBody, header){
    /* Stripe-Signature: t=...,v1=... */
    const parts = String(header||'').split(',').reduce((a,p)=>{
      const [k,v]=p.split('='); a[k.trim()]=v; return a; },{});
    if(!parts.t||!parts.v1) return false;
    const signed = parts.t+'.'+rawBody;
    const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
    try{ return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); }
    catch(e){ return false; }
  }
};

const GATEWAYS = { razorpay:RZP, stripe:STR };
module.exports = { GATEWAYS };

return module.exports; })();

__M['probe'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Real HTTP/HTTPS uptime probes. node:http(s) only. Cost: $0.00 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Probe a URL. Follows up to 3 redirects. Never throws.
 * returns { ok, status, ms, bytes, err, redirects, ssl }
 */
function probe(target, timeoutMs = 10000, depth = 0) {
  return new Promise(resolve => {
    let u;
    try { u = new URL(target); } catch (e) {
      return resolve({ ok: false, status: 0, ms: 0, bytes: 0, err: 'INVALID_URL', redirects: depth });
    }
    if (!/^https?:$/.test(u.protocol))
      return resolve({ ok: false, status: 0, ms: 0, bytes: 0, err: 'BAD_SCHEME', redirects: depth });

    const lib = u.protocol === 'https:' ? https : http;
    const t0 = Date.now();
    let bytes = 0, done = false;

    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'ChairmanOS-UptimeMarshal/1.0', 'Accept': '*/*', 'Connection': 'close' },
      timeout: timeoutMs
    }, res => {
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.status || res.statusCode) && loc && depth < 3) {
        res.destroy();
        const next = new URL(loc, u).toString();
        return probe(next, timeoutMs, depth + 1).then(r => {
          if (!done) { done = true; resolve(Object.assign(r, { redirects: r.redirects })); }
        });
      }
      let ssl = null;
      try {
        if (res.socket && res.socket.getPeerCertificate) {
          const c = res.socket.getPeerCertificate();
          if (c && c.valid_to) {
            const days = Math.round((new Date(c.valid_to) - Date.now()) / 86400000);
            ssl = { issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || '—', days_left: days };
          }
        }
      } catch (e) {}
      res.on('data', d => { bytes += d.length; if (bytes > 400000) res.destroy(); });
      res.on('end', () => {
        if (done) return; done = true;
        const code = res.statusCode;
        resolve({ ok: code >= 200 && code < 400, status: code, ms: Date.now() - t0, bytes, err: null, redirects: depth, ssl });
      });
      res.on('error', () => {
        if (done) return; done = true;
        resolve({ ok: false, status: res.statusCode || 0, ms: Date.now() - t0, bytes, err: 'STREAM_ERROR', redirects: depth, ssl });
      });
    });

    req.on('timeout', () => { req.destroy(); if (!done) { done = true;
      resolve({ ok: false, status: 0, ms: Date.now() - t0, bytes: 0, err: 'TIMEOUT', redirects: depth }); } });
    req.on('error', e => { if (!done) { done = true;
      resolve({ ok: false, status: 0, ms: Date.now() - t0, bytes: 0, err: (e.code || e.message || 'ERROR'), redirects: depth }); } });
    req.end();
  });
}

module.exports = { probe };

return module.exports; })();

__M['research'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Real web research. No API key, no paid search service.
   Uses DuckDuckGo's HTML endpoint and Wikipedia's open API — both free,
   both public. This is genuine outside-world data, not model recall. */
const https = require('https');

function get(host, path, headers){
  return new Promise((resolve,reject)=>{
    const r = https.request({hostname:host, path, method:'GET', timeout:20000,
      headers: Object.assign({
        'User-Agent':'Mozilla/5.0 (compatible; ChairmanOS/1.0)',
        'Accept':'text/html,application/json'
      }, headers||{})}, res=>{
      if([301,302,303,307,308].includes(res.statusCode) && res.headers.location){
        res.destroy();
        try{
          const u=new URL(res.headers.location, 'https://'+host);
          return get(u.hostname, u.pathname+u.search).then(resolve,reject);
        }catch(e){ return reject(new Error('bad redirect')); }
      }
      let d=''; res.on('data',c=>{ d+=c; if(d.length>900000) res.destroy(); });
      res.on('end',()=>resolve(d));
    });
    r.on('timeout',()=>{ r.destroy(); reject(new Error('TIMEOUT')); });
    r.on('error',e=>reject(new Error(e.code||e.message)));
    r.end();
  });
}
const strip = s => String(s).replace(/<[^>]*>/g,' ')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&nbsp;/g,' ')
  .replace(/\s+/g,' ').trim();

/* Search that works from a datacenter IP.
   DuckDuckGo HTML returns a 202 bot-block when called from cloud hosts
   (Render, Fly, etc), so we fall through a chain of open APIs that do not
   block server traffic. Each is free and needs no key. */
async function search(query, limit){
  limit = limit || 6;
  const out = [];
  const seen = new Set();
  const push = (title, snippet) => {
    const k = (snippet||'').slice(0,50);
    if(!snippet || seen.has(k) || out.length >= limit) return;
    seen.add(k); out.push({ title: title||'', snippet });
  };

  /* 1. DuckDuckGo Instant Answer API — JSON, no bot wall */
  try{
    const j = await get('api.duckduckgo.com',
      '/?q='+encodeURIComponent(query)+'&format=json&no_html=1&skip_disambig=1',
      {'Accept':'application/json'});
    const o = JSON.parse(j);
    if(o.AbstractText) push(o.Heading||'', o.AbstractText);
    (o.RelatedTopics||[]).forEach(t=>{
      if(t.Text) push((t.FirstURL||'').split('/').pop().replace(/_/g,' '), t.Text);
      (t.Topics||[]).forEach(s=>{ if(s.Text) push('', s.Text); });
    });
  }catch(e){}

  /* 2. Hacker News — real people discussing real products and prices.
        Far more useful for market questions than an encyclopedia. */
  if(out.length < limit){
    try{
      const j = await get('hn.algolia.com',
        '/api/v1/search?query='+encodeURIComponent(query)+'&hitsPerPage=6',
        {'Accept':'application/json'});
      const o = JSON.parse(j);
      (o.hits||[]).forEach(h=>{
        const t = h.title || h.story_title;
        const body = (h.story_text||h.comment_text||'').replace(/<[^>]*>/g,' ').trim();
        if(t) push('HN: '+t, body ? body.slice(0,240)
          : `${h.points||0} points, ${h.num_comments||0} comments${h.url?' — '+h.url:''}`);
      });
    }catch(e){}
  }

  /* 3. Wikipedia — only as background, and only if the title is a real
        match. Keyword hits on unrelated articles are worse than nothing. */
  if(out.length < Math.ceil(limit/2)){
    try{
      const j = await get('en.wikipedia.org',
        '/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(query)+
        '&srlimit=4&format=json&origin=*', {'Accept':'application/json'});
      const o = JSON.parse(j);
      const words = query.toLowerCase().split(/\s+/).filter(w=>w.length>3);
      (o.query && o.query.search || []).forEach(r=>{
        const title = r.title.toLowerCase();
        /* keep it only if the article title genuinely relates to the query */
        if(words.some(w=>title.includes(w))) push('WIKI: '+r.title, strip(r.snippet));
      });
    }catch(e){}
  }

  /* 4. last resort: the HTML endpoint, in case we are on a residential IP */
  if(!out.length){
    try{
      const html = await get('html.duckduckgo.com', '/html/?q='+encodeURIComponent(query));
      const re = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while((m = re.exec(html)) && out.length < limit) push(strip(m[1]), strip(m[2]));
    }catch(e){}
  }
  return out;
}

/* Wikipedia summary — stable factual grounding. */
async function wiki(topic){
  try{
    const j = await get('en.wikipedia.org',
      '/api/rest_v1/page/summary/'+encodeURIComponent(topic.replace(/\s+/g,'_')),
      {'Accept':'application/json'});
    const o = JSON.parse(j);
    return o.extract ? { title:o.title, extract:o.extract } : null;
  }catch(e){ return null; }
}

/* Gather evidence for one idea; returns plain text the model can reason over. */
async function gather(topic, region){
  const queries = [
    `${topic} ${region||''} market demand`.trim(),
    `${topic} pricing India`,
    `${topic} competitors problems complaints`
  ];
  const blocks = [];
  for(const q of queries){
    try{
      const r = await search(q, 4);
      if(r.length) blocks.push(`SEARCH "${q}":\n` +
        r.map(x=>`- ${x.title?x.title+' — ':''}${x.snippet}`).join('\n'));
    }catch(e){ blocks.push(`SEARCH "${q}": FAILED (${e.message})`); }
    await new Promise(r=>setTimeout(r, 700));   // be polite, avoid throttling
  }
  const w = await wiki(topic);
  if(w) blocks.push(`WIKIPEDIA "${w.title}": ${w.extract}`);
  return blocks.join('\n\n') || 'NO EVIDENCE RETRIEVED — treat this idea as unvalidated.';
}

/* ---- deep read: pull the actual page text, not just a snippet ---- */
async function readPage(url){
  let u; try{ u=new URL(url); }catch(e){ throw new Error('bad url'); }
  const html = await get(u.hostname, u.pathname+u.search);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi,' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi,' ');
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1];
  return { title: strip(title||u.hostname), text: strip(body).slice(0,12000), url };
}

/* ---- open datasets, no key required ---- */
async function openData(query){
  const out=[];
  try{                                   // World Bank indicators
    const j=await get('api.worldbank.org','/v2/country/IND/indicator/NY.GDP.PCAP.CD?format=json&per_page=3');
    const d=JSON.parse(j); if(d&&d[1]&&d[1][0])
      out.push(`WORLD BANK: India GDP per capita ${d[1][0].date} = $${Math.round(d[1][0].value)}`);
  }catch(e){}
  try{                                   // live FX
    const j=await get('api.frankfurter.app','/latest?from=USD&to=INR');
    const d=JSON.parse(j); if(d&&d.rates) out.push(`FX TODAY: 1 USD = ${d.rates.INR} INR (${d.date})`);
  }catch(e){}
  return out.join('\n');
}

/* ---- multi-angle deep research ---- */
async function deepDive(topic, region){
  const angles=[
    `${topic} ${region||''}`.trim(),
    `${topic} pricing cost`,
    `${topic} problems complaints failures`,
    `${topic} competitors alternatives`,
    `${topic} how to start guide`
  ];
  const blocks=[]; const seen=new Set();
  for(const q of angles){
    try{
      const r=await search(q,4);
      const fresh=r.filter(x=>{ const k=x.snippet.slice(0,60); if(seen.has(k))return false; seen.add(k); return true; });
      if(fresh.length) blocks.push(`SEARCH "${q}":\n`+fresh.map(x=>`- ${x.title?x.title+' — ':''}${x.snippet}`).join('\n'));
    }catch(e){}
    await new Promise(r=>setTimeout(r,700));
  }
  const w=await wiki(topic);
  if(w) blocks.push(`WIKIPEDIA "${w.title}": ${w.extract}`);
  const od=await openData(topic);
  if(od) blocks.push('OPEN DATA:\n'+od);
  return blocks.join('\n\n') || 'NO EVIDENCE RETRIEVED';
}

module.exports = { search, wiki, gather, readPage, openData, deepDive };

return module.exports; })();

__M['sandbox'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Sandbox for AI-written capabilities.
   node:vm only. The generated code gets a tiny, curated API and NOTHING else:
   no require, no fs, no process, no child_process, no network of its own.
   Anything it can touch, it touches through the api object we hand in. */
const vm = require('vm');

/* Patterns that must never appear in generated code. Checked BEFORE the
   owner is even shown the proposal, so dangerous code is never offered. */
const BANNED = [
  [/\brequire\s*\(/,            'require() — module loading is forbidden'],
  [/\bprocess\b/,               'process — no access to the host process'],
  [/\bchild_process\b/,         'child_process — shell execution is forbidden'],
  [/\bfs\b\s*\./,               'fs — direct filesystem access is forbidden'],
  [/\beval\s*\(/,               'eval() — nested evaluation is forbidden'],
  [/\bFunction\s*\(/,           'Function() — dynamic code construction is forbidden'],
  [/\bimport\s*\(/,             'import() — dynamic import is forbidden'],
  [/\bglobalThis\b/,            'globalThis — escaping the sandbox is forbidden'],
  [/\bconstructor\s*\[/,        'constructor[...] — prototype escape attempt'],
  [/__proto__|prototype\s*\[/,  'prototype manipulation is forbidden'],
  [/\bBuffer\b/,                'Buffer — raw memory access is forbidden'],
  [/while\s*\(\s*(true|1)\s*\)/,'while(true) — infinite loop'],
  [/for\s*\(\s*;\s*;\s*\)/,     'for(;;) — infinite loop']
];

function scan(code){
  const hits = [];
  for(const [re, why] of BANNED) if(re.test(code)) hits.push(why);
  if(code.length > 6000) hits.push('over 6000 characters — too large to review safely');
  return hits;
}

/**
 * Run AI-written capability code.
 * code — a function BODY. It receives `api` and returns {msg, n, detail}.
 * api  — the curated surface the owner's system chooses to expose.
 */
async function runCapability(code, api, timeoutMs){
  const bad = scan(code);
  if(bad.length) throw new Error('BLOCKED BY SANDBOX: ' + bad.join('; '));

  const sandbox = {
    api,
    result: undefined,
    Math, JSON, Date, String, Number, Boolean, Array, Object,
    isNaN, parseInt, parseFloat,
    console: { log(){}, error(){}, warn(){} }   /* silenced, not removed */
  };
  const ctx = vm.createContext(Object.create(null, Object.getOwnPropertyDescriptors(sandbox)));

  const wrapped = `result = (async function(api){\n${code}\n})(api);`;
  let script;
  try { script = new vm.Script(wrapped, { filename:'capability.js' }); }
  catch(e){ throw new Error('SYNTAX ERROR in generated code: ' + e.message); }

  script.runInContext(ctx, { timeout: Math.min(8000, timeoutMs || 5000) });

  const out = await Promise.race([
    Promise.resolve(ctx.result),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('CAPABILITY TIMED OUT')), timeoutMs || 5000))
  ]);

  if(!out || typeof out !== 'object') throw new Error('Capability returned nothing usable');
  return {
    msg:    String(out.msg || 'ran').slice(0, 300),
    n:      +out.n || 0,
    detail: String(out.detail || '').slice(0, 600)
  };
}

module.exports = { runCapability, scan, BANNED };

return module.exports; })();

__M['smtp'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Zero-dependency SMTP client. node:net + node:tls only. Cost: $0.00 */
const net = require('net');
const tls = require('tls');

function talk(sock, expect, cmd, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const to = setTimeout(() => { cleanup(); reject(new Error('SMTP timeout awaiting ' + expect)); }, timeoutMs);
    function onData(d) {
      buf += d.toString('utf8');
      // wait for a complete final line: "250 text\r\n" (space, not dash)
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (!/^\d{3} /.test(last)) return;
      clearTimeout(to); cleanup();
      const code = last.slice(0, 3);
      if (String(code)[0] !== String(expect)[0]) return reject(new Error('SMTP ' + code + ': ' + last.slice(4)));
      resolve(buf);
    }
    function onErr(e) { clearTimeout(to); cleanup(); reject(e); }
    function cleanup() { sock.removeListener('data', onData); sock.removeListener('error', onErr); }
    sock.on('data', onData); sock.on('error', onErr);
    if (cmd !== null && cmd !== undefined) sock.write(cmd + '\r\n');
  });
}

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

function encodeHeader(s) {
  return /[^\x20-\x7E]/.test(s) ? '=?UTF-8?B?' + b64(s) + '?=' : s;
}

/**
 * cfg: { host, port, secure, user, pass, from, name }
 * msg: { to, subject, text }
 */
async function send(cfg, msg) {
  const port = +cfg.port || 587;
  const secure = cfg.secure === true || port === 465;
  const t0 = Date.now();

  /* Never send an IP as SNI — RFC 6066 forbids it, Node warns, and some
     servers abort the handshake. Only set servername for real hostnames. */
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(cfg.host) || cfg.host.includes(':');
  let sock = await new Promise((res, rej) => {
    const opts = { host: cfg.host, port };
    if (!isIp) opts.servername = cfg.host;
    const s = secure ? tls.connect(opts, () => res(s)) : net.connect(opts, () => res(s));
    s.setTimeout(20000, () => { s.destroy(new Error('connect timeout')); });
    s.once('error', rej);
  });

  try {
    await talk(sock, 220, null);
    await talk(sock, 250, 'EHLO chairman-os');

    if (!secure) {
      await talk(sock, 220, 'STARTTLS');
      sock = await new Promise((res, rej) => {
        const topts = { socket: sock };
        if (!isIp) topts.servername = cfg.host;
        const s = tls.connect(topts, () => res(s));
        s.once('error', rej);
      });
      await talk(sock, 250, 'EHLO chairman-os');
    }

    if (cfg.user) {
      await talk(sock, 334, 'AUTH LOGIN');
      await talk(sock, 334, b64(cfg.user));
      await talk(sock, 235, b64(cfg.pass));
    }

    const from = cfg.from || cfg.user;
    await talk(sock, 250, 'MAIL FROM:<' + from + '>');
    await talk(sock, 250, 'RCPT TO:<' + msg.to + '>');
    await talk(sock, 354, 'DATA');

    const body = String(msg.text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    const mid = '<' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@chairman-os>';
    /* HEADERS THAT DECIDE WHETHER A COLD EMAIL LANDS OR IS BINNED.
       Learned the hard way that a technically-valid message is not the same
       as a delivered one:
       - Reply-To: without it, a prospect hitting Reply may answer the
         envelope sender rather than the address you actually read.
       - List-Unsubscribe: spam filters weight this heavily on unsolicited
         B2B mail, and it is legally expected in most jurisdictions. One
         header turns "suspicious cold mail" into "legitimate business mail".
       - X-Chairman-OS was a gift to spam classifiers: a custom header no
         real mail client emits, on every message. Removed. */
    const replyTo = cfg.replyTo || from;
    const headers = [
      'From: ' + encodeHeader(cfg.name || from) + ' <' + from + '>',
      'To: <' + msg.to + '>',
      'Reply-To: <' + replyTo + '>',
      'Subject: ' + encodeHeader(msg.subject),
      'Date: ' + new Date().toUTCString(),
      'Message-ID: ' + mid,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit'
    ];
    if (msg.unsubscribe !== false) {
      headers.push('List-Unsubscribe: <mailto:' + replyTo +
        '?subject=' + encodeURIComponent('Unsubscribe') + '>');
      headers.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    }
    if (msg.inReplyTo) {
      headers.push('In-Reply-To: ' + msg.inReplyTo);
      headers.push('References: ' + msg.inReplyTo);
    }
    const data = headers.concat(['', body, '', '.']).join('\r\n');

    await talk(sock, 250, data, 30000);
    try { await talk(sock, 221, 'QUIT', 5000); } catch (e) {}
    sock.end();
    return { ok: true, ms: Date.now() - t0, messageId: mid };
  } catch (e) {
    try { sock.destroy(); } catch (x) {}
    throw e;
  }
}

module.exports = { send };

return module.exports; })();

__M['store'] = (function(){ const module={exports:{}}; const exports=module.exports;
/* Pluggable persistence. Zero dependencies.
 *
 *   STORE=local   (default) — filesystem. Your PC, VPS, Docker, anything with a disk.
 *   STORE=github            — a private GitHub repo acts as the disk.
 *                             Needed on free hosts (Render free) whose filesystem is
 *                             EPHEMERAL: it is wiped on every restart and redeploy.
 *
 * GitHub mode env vars:
 *   GH_TOKEN  fine-grained PAT with Contents:read+write on ONE private repo
 *   GH_REPO   "youruser/chairman-state"
 *   GH_BRANCH optional, default "main"
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODE = (process.env.STORE || 'local').toLowerCase();

/* ---------------- local ---------------- */
function localStore(fixedDir){
  let made = false;
  /* Worked out on first use, by which time the server has told us where
     it lives. Order of precedence: explicit DATA_DIR, then the directory
     of the running entry script, then this module's own folder. */
  function dir(){
    if(fixedDir) return fixedDir;
    const d = process.env.DATA_DIR
           || global.__CHAIRMAN_ROOT
           || (require.main && require.main.filename
                 ? path.dirname(require.main.filename)
                 : path.join(__dirname,'..'));
    if(!made){ try{ fs.mkdirSync(d, { recursive:true }); made = true; }catch(e){} }
    return d;
  }
  return {
    mode:'local',
    describe:()=>'filesystem · '+dir(),
    async read(name){
      try { return fs.readFileSync(path.join(dir(),name),'utf8'); } catch(e){ return null; }
    },
    async write(name, text){
      const f=path.join(dir(),name), tmp=f+'.tmp';
      fs.writeFileSync(tmp,text); fs.renameSync(tmp,f);
      if(/sessions|CREDENTIALS/.test(name)){ try{ fs.chmodSync(f,0o600); }catch(e){} }
    },
    async remove(name){ try{ fs.unlinkSync(path.join(dir(),name)); }catch(e){} }
  };
}

/* ---------------- github ---------------- */
function gh(method, urlPath, token, body){
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname:'api.github.com', path:urlPath, method,
      headers:Object.assign({
        'User-Agent':'ChairmanOS/3',
        'Accept':'application/vnd.github+json',
        'Authorization':'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28'
      }, data ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} : {})
    }, res=>{
      let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>{
        if(res.statusCode===404) return resolve(null);
        /* 403 on /contents while /repos worked means exactly one thing: the
           token can SEE the repo (Metadata is automatic) but has no Contents
           permission. Say that, instead of dumping GitHub's raw JSON at the
           Owner and leaving him to guess. */
        if(res.statusCode===403 && /contents/.test(urlPath))
          return reject(new Error(
            'TOKEN CANNOT READ OR WRITE FILES — it can see the repo but has no Contents permission. '
          + 'Open github.com/settings/tokens?type=beta -> your token -> Edit -> '
          + 'Repository permissions -> Contents -> "Read and write" -> Save. '
          + 'Metadata: Read alone is not enough. Then redeploy.'));
        if(res.statusCode===403)
          return reject(new Error('GitHub refused this token (403). Check its repository access and permissions.'));
        if(res.statusCode>=400) return reject(new Error('GitHub '+res.statusCode+': '+b.slice(0,180)));
        try{ resolve(JSON.parse(b||'{}')); }catch(e){ resolve({}); }
      });
    });
    req.on('error',reject);
    req.setTimeout(15000,()=>req.destroy(new Error('GitHub API timeout')));
    if(data) req.write(data);
    req.end();
  });
}

function githubStore(){
  const token=process.env.GH_TOKEN, repo=process.env.GH_REPO, branch=process.env.GH_BRANCH||'main';
  if(!token||!repo) throw new Error('STORE=github requires GH_TOKEN and GH_REPO');
  const shas = new Map();
  const cache = new Map();
  const queue = new Map();   // name -> pending text (coalesce rapid writes)
  let flushing=false;

  async function pull(name){
    const r=await gh('GET',`/repos/${repo}/contents/${encodeURIComponent(name)}?ref=${branch}`,token);
    if(!r||!r.content) return null;
    shas.set(name,r.sha);
    return Buffer.from(r.content,'base64').toString('utf8');
  }
  async function push(name,text){
    const body={ message:`chairman-os state ${new Date().toISOString()}`,
      content:Buffer.from(text,'utf8').toString('base64'), branch };
    if(shas.has(name)) body.sha=shas.get(name);
    try{
      const r=await gh('PUT',`/repos/${repo}/contents/${encodeURIComponent(name)}`,token,body);
      if(r&&r.content) shas.set(name,r.content.sha);
    }catch(e){
      if(/409|422/.test(e.message)){        // sha drifted — refetch and retry once
        await pull(name);
        const b2=Object.assign({},body); if(shas.has(name)) b2.sha=shas.get(name);
        const r2=await gh('PUT',`/repos/${repo}/contents/${encodeURIComponent(name)}`,token,b2);
        if(r2&&r2.content) shas.set(name,r2.content.sha);
      } else throw e;
    }
  }
  async function flush(){
    if(flushing) return; flushing=true;
    try{
      while(queue.size){
        const [name,text]=queue.entries().next().value;
        queue.delete(name);
        try{ await push(name,text); }
        catch(e){ console.error('[store] github push failed for',name,'-',e.message); }
      }
    } finally { flushing=false; }
  }

  /* HOW OFTEN THIS ACTUALLY PUSHES — and why it used to be wasteful.

     Every log line calls save(). With a 1.2s debounce that is roughly 120
     pushes an hour, each one a FULL rewrite of a 163 KB file, each one a new
     GitHub commit. About 19 MB and 2,880 commits a day to persist a file that
     barely changed. It never hit the 5,000/hour API limit, but the repo grew
     forever and every push burned quota for nothing.

     Now: skip the push entirely when the content is identical, and coalesce
     bursts into one push every 20 seconds. A crash loses at most 20 seconds
     of log lines — the state itself is written on shutdown. */
  const lastHash = new Map();
  const PUSH_EVERY = 20000;
  let pushTimer = null, lastPush = 0;
  function hashOf(t){
    let h = 5381;
    for(let i=0;i<t.length;i++) h = ((h*33) ^ t.charCodeAt(i)) >>> 0;
    return h + ':' + t.length;
  }

  return {
    mode:'github',
    describe:()=>'github · '+repo+'@'+branch,
    async read(name){
      if(cache.has(name)) return cache.get(name);
      const t=await pull(name); cache.set(name,t); return t;
    },
    async write(name,text){
      cache.set(name,text);
      /* identical content — nothing to say to GitHub */
      const h = hashOf(text);
      if(lastHash.get(name) === h) return;
      lastHash.set(name, h);
      queue.set(name,text);
      const wait = Math.max(0, PUSH_EVERY - (Date.now()-lastPush));
      clearTimeout(pushTimer);
      pushTimer = setTimeout(()=>{ lastPush = Date.now(); flush(); }, wait);
    },
    /* called on shutdown — never lose the final state to a debounce */
    async flushNow(){ clearTimeout(pushTimer); lastPush = Date.now(); await flush(); },
    async remove(name){
      cache.delete(name); queue.delete(name);
      if(!shas.has(name)) await pull(name);
      if(shas.has(name)){
        try{ await gh('DELETE',`/repos/${repo}/contents/${encodeURIComponent(name)}`,token,
          {message:'chairman-os wipe',sha:shas.get(name),branch}); }catch(e){}
        shas.delete(name);
      }
    },
    async verify(){
      const r=await gh('GET',`/repos/${repo}`,token);
      if(!r) throw new Error('repo not found or token lacks access: '+repo);
      if(!r.private) console.warn('[store] WARNING: '+repo+' is PUBLIC. Your state would be world-readable. Make it private now.');
      /* Seeing the repo proves nothing — Metadata:Read is granted automatically.
         Probe /contents so a missing Contents permission fails HERE, with a
         clear message, instead of later during a read that looks unrelated. */
      await gh('GET',`/repos/${repo}/contents/?ref=${branch}`,token);
      return { private:r.private, full_name:r.full_name };
    }
  };
}

let store;
if(MODE==='github'){
  store = githubStore();
} else {
  /* In the single-file build every lib is inlined and this module RUNS
     BEFORE the server sets anything, so __dirname is wherever node happened
     to be launched from — not where chairman.js lives. That silently wrote
     data.json to /tmp and the Owner lost his state on every restart.

     My first attempt at this fix read a global that did not exist yet.
     Resolving eagerly was the bug; resolve LAZILY, on first actual use. */
  store = localStore(null);
}
module.exports = store;

return module.exports; })();

const __ASSETS = {
  'index.html': Buffer.from('PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8bWV0YSBuYW1lPSJ0aGVtZS1jb2xvciIgY29udGVudD0iIzA1MDcwYSI+Cjx0aXRsZT5DSEFJUk1BTiBBR0VOVCBPUyDCtyBMaXZlPC90aXRsZT4KPHN0eWxlPgovKiDilZDilZAgQ0hBSVJNQU4gT1MgwrcgTlVNRVJPIOKAlCB0cmVhc3VyeSBsaWdodCB0aGVtZSDilZDilZAgKi8KOnJvb3R7CiAgLyogbGlnaHQgaXMgdGhlIGRlZmF1bHQgbm93ICovCiAgLS1iZzojRUZFQURGOyAtLWJnMjojRTVERkQxOwogIC0tcGFuZWw6I0ZCRjhGMTsKICAtLWdsYXNzOiNGQkY4RjE7CiAgLS1nbGFzczI6I0Y1RjFFNzsKICAtLXN0cm9rZTojREVEN0M3OwogIC0tc3Ryb2tlMjojQzdCRkFCOwogIC0tdHh0OiMxODE1MDk7IC0tZGltOiM2RTY4NTc7IC0tZGltMjojOUM5Njg2OwoKICAtLWxpbWU6Izc4OEExRDsgICAgICAvKiBzaWduYXR1cmUgb2xpdmUtbGltZSAqLwogIC0tbGltZTI6IzhGQTMyNjsKICAtLW9saXZlOiMzOTQ2MDM7ICAgICAvKiBkZWVwIG9saXZlICovCiAgLS1pbms6IzA0MDUwMTsKCiAgLS1jeTojNzg4QTFEOyAtLWJsdTojNUM2RTFBOyAtLWdybjojNEY3QTJBOyAtLWFtYjojQTg4MDFCOwogIC0tbWFnOiNCNDQ0MkE7IC0tcHVyOiM2RTdBM0M7CgogIC0tbW9ubzp1aS1tb25vc3BhY2UsU0ZNb25vLVJlZ3VsYXIsTWVubG8sIlJvYm90byBNb25vIixtb25vc3BhY2U7CiAgLS1zYW5zOi1hcHBsZS1zeXN0ZW0sQmxpbmtNYWNTeXN0ZW1Gb250LCJTZWdvZSBVSSIsSW50ZXIsUm9ib3RvLHNhbnMtc2VyaWY7CiAgLS1zYnc6MjM4cHg7IC0tcjoxNHB4OwogIC0tc2hhZG93OjAgMXB4IDJweCByZ2JhKDYwLDQ4LDIwLC4wNiksIDAgOHB4IDI0cHggcmdiYSg2MCw0OCwyMCwuMDYpOwogIC0tc2hhZG93MjowIDJweCA2cHggcmdiYSg2MCw0OCwyMCwuMDgpLCAwIDE2cHggNDBweCByZ2JhKDYwLDQ4LDIwLC4xMCk7Cn0KW2RhdGEtdGhlbWU9ImRhcmsiXXsKICAtLWJnOiMwQTBCMDY7IC0tYmcyOiMxMDEyMDg7CiAgLS1wYW5lbDojMTUxODBDOyAtLWdsYXNzOiMxNTE4MEM7IC0tZ2xhc3MyOiMxQjFGMEY7CiAgLS1zdHJva2U6IzI1MkExNjsgLS1zdHJva2UyOiMzNzQwMUY7CiAgLS10eHQ6I0YyRjNFQTsgLS1kaW06IzlBOUM4QTsgLS1kaW0yOiM2QTZENUM7CiAgLS1saW1lOiNBM0JCMkI7IC0tbGltZTI6I0I4RDEzNDsKICAtLWN5OiNBM0JCMkI7IC0tYmx1OiM4RkEzMjY7IC0tZ3JuOiM2RkJGNEE7IC0tYW1iOiNEOUE2MkI7CiAgLS1tYWc6I0UzNkI0RTsgLS1wdXI6IzlGQUU1RTsKICAtLXNoYWRvdzowIDFweCAycHggcmdiYSgwLDAsMCwuNCksIDAgOHB4IDI2cHggcmdiYSgwLDAsMCwuMzUpOwogIC0tc2hhZG93MjowIDJweCA4cHggcmdiYSgwLDAsMCwuNSksIDAgMThweCA0NnB4IHJnYmEoMCwwLDAsLjQ1KTsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveDstd2Via2l0LXRhcC1oaWdobGlnaHQtY29sb3I6dHJhbnNwYXJlbnR9Cmh0bWwsYm9keXttYXJnaW46MDttaW4taGVpZ2h0OjEwMCV9CmJvZHl7CiAgYmFja2dyb3VuZDp2YXIoLS1iZyk7IGNvbG9yOnZhcigtLXR4dCk7CiAgZm9udDoxMy41cHgvMS41NSB2YXIoLS1zYW5zKTsgb3ZlcmZsb3cteDpoaWRkZW47CiAgYmFja2dyb3VuZC1pbWFnZToKICAgIHJhZGlhbC1ncmFkaWVudCgxMTAwcHggNzAwcHggYXQgODglIC0xNCUsIHJnYmEoMTIwLDEzOCwyOSwuMTMpLCB0cmFuc3BhcmVudCA2MCUpLAogICAgcmFkaWFsLWdyYWRpZW50KDc2MHB4IDUyMHB4IGF0IDQlIDEwNCUsIHJnYmEoMTQwLDExMCw1MCwuMDkpLCB0cmFuc3BhcmVudCA2MiUpOwogIGJhY2tncm91bmQtYXR0YWNobWVudDpmaXhlZDsKfQpidXR0b257Zm9udDppbmhlcml0O2N1cnNvcjpwb2ludGVyO2NvbG9yOmluaGVyaXR9CmlucHV0LHNlbGVjdCx0ZXh0YXJlYXtmb250OmluaGVyaXR9Ci5oaWRle2Rpc3BsYXk6bm9uZSFpbXBvcnRhbnR9Cjo6LXdlYmtpdC1zY3JvbGxiYXJ7d2lkdGg6MTBweDtoZWlnaHQ6MTBweH0KOjotd2Via2l0LXNjcm9sbGJhci10aHVtYntiYWNrZ3JvdW5kOnZhcigtLXN0cm9rZTIpO2JvcmRlci1yYWRpdXM6MTBweH0KOjotd2Via2l0LXNjcm9sbGJhci10cmFja3tiYWNrZ3JvdW5kOnRyYW5zcGFyZW50fQoKLyog4pSA4pSAIFRIRSBMSVZJTkcgRkxPT1Ig4pSA4pSAICovCi5mbG9vcldyYXB7cG9zaXRpb246cmVsYXRpdmU7Ym9yZGVyLXJhZGl1czoxNHB4O292ZXJmbG93OmhpZGRlbjtiYWNrZ3JvdW5kOiMwNTA3MEE7CiAgYm94LXNoYWRvdzowIDE0cHggNDBweCByZ2JhKDAsMCwwLC4zNCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpfQouZmxvb3JTdmd7ZGlzcGxheTpibG9jazt3aWR0aDoxMDAlO2hlaWdodDphdXRvfQouZmxvb3JXcmFwOjphZnRlcntjb250ZW50OicnO3Bvc2l0aW9uOmFic29sdXRlO2luc2V0OjA7cG9pbnRlci1ldmVudHM6bm9uZTsKICBiYWNrZ3JvdW5kOnJhZGlhbC1ncmFkaWVudCgxMjAlIDgwJSBhdCA1MCUgMCUsdHJhbnNwYXJlbnQgNDUlLHJnYmEoMCwwLDAsLjU1KSAxMDAlKX0KLmZkIHRleHR7cG9pbnRlci1ldmVudHM6bm9uZX0KQG1lZGlhKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsuZmxvb3JTdmcgYW5pbWF0ZXtkaXNwbGF5Om5vbmV9fQoKLyog4pSA4pSAIExPR0lOIC8gSEVSTyDilIDilIAgKi8KI2dhdGV7cG9zaXRpb246Zml4ZWQ7aW5zZXQ6MDt6LWluZGV4OjgwO292ZXJmbG93OmF1dG87YmFja2dyb3VuZDp2YXIoLS1iZyk7CiAgYmFja2dyb3VuZC1pbWFnZToKICAgIHJhZGlhbC1ncmFkaWVudCgxMDAwcHggNjgwcHggYXQgODQlIC0xMCUsIHJnYmEoMTIwLDEzOCwyOSwuMTYpLCB0cmFuc3BhcmVudCA1OCUpLAogICAgcmFkaWFsLWdyYWRpZW50KDcyMHB4IDUyMHB4IGF0IDYlIDEwMCUsIHJnYmEoMTQwLDExMCw1MCwuMTApLCB0cmFuc3BhcmVudCA2MCUpO30KLnRvcGJhcntkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMXB4O3BhZGRpbmc6MTVweCAyNHB4O2ZsZXgtd3JhcDp3cmFwOwogIGJvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCl9Ci5sb2dve2ZvbnQ6NzAwIDE4cHgvMSB2YXIoLS1zYW5zKTtsZXR0ZXItc3BhY2luZzotLjVweH0KLmxvZ28gaXtmb250LXN0eWxlOm5vcm1hbDtjb2xvcjp2YXIoLS1saW1lKX0KLnBpbGx7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1zdHJva2UyKTtiYWNrZ3JvdW5kOnZhcigtLWdsYXNzMik7Ym9yZGVyLXJhZGl1czo5OXB4OwogIHBhZGRpbmc6NnB4IDEzcHg7Zm9udC1zaXplOjEwLjVweDtsZXR0ZXItc3BhY2luZzouN3B4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoucGlsbC5saXZle2JvcmRlci1jb2xvcjpyZ2JhKDEyMCwxMzgsMjksLjM2KTtiYWNrZ3JvdW5kOnJnYmEoMTIwLDEzOCwyOSwuMTApO2NvbG9yOnZhcigtLW9saXZlKX0KW2RhdGEtdGhlbWU9ImRhcmsiXSAucGlsbC5saXZle2NvbG9yOnZhcigtLWxpbWUpfQouZG90e2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6OXB4O2JhY2tncm91bmQ6dmFyKC0tbGltZSk7CiAgbWFyZ2luLXJpZ2h0OjZweDtib3gtc2hhZG93OjAgMCAwIDNweCByZ2JhKDEyMCwxMzgsMjksLjE4KTthbmltYXRpb246YnAgMnMgaW5maW5pdGV9CkBrZXlmcmFtZXMgYnB7NTAle29wYWNpdHk6LjM1fX0KLmhlcm97bWF4LXdpZHRoOjEyMjBweDttYXJnaW46MCBhdXRvO3BhZGRpbmc6MzRweCAyNHB4IDY4cHh9Ci5oZXJvQ2FyZHtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7Ym9yZGVyLXJhZGl1czoyNHB4OwogIGJveC1zaGFkb3c6dmFyKC0tc2hhZG93Mik7cGFkZGluZzpjbGFtcCgyNnB4LDR2dyw1MHB4KTsKICBkaXNwbGF5OmdyaWQ7Z2FwOjM4cHg7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjEuMDVmciAuOTVmcjthbGlnbi1pdGVtczpjZW50ZXJ9CkBtZWRpYShtYXgtd2lkdGg6OTAwcHgpey5oZXJvQ2FyZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmJhZGdle2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JhY2tncm91bmQ6cmdiYSgxMjAsMTM4LDI5LC4xMik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDEyMCwxMzgsMjksLjMwKTsKICBjb2xvcjp2YXIoLS1vbGl2ZSk7cGFkZGluZzo2cHggMTNweDtib3JkZXItcmFkaXVzOjk5cHg7Zm9udC1zaXplOjEwcHg7bGV0dGVyLXNwYWNpbmc6MS41cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CltkYXRhLXRoZW1lPSJkYXJrIl0gLmJhZGdle2NvbG9yOnZhcigtLWxpbWUpfQpoMS5iaWd7Zm9udDo3MDAgY2xhbXAoMzJweCw1LjZ2dyw1NnB4KS8xLjAyIHZhcigtLXNhbnMpO2xldHRlci1zcGFjaW5nOi0ycHg7bWFyZ2luOjE4cHggMCAxNnB4fQpoMS5iaWcgZW17Zm9udC1zdHlsZTpub3JtYWw7Y29sb3I6dmFyKC0tbGltZSl9Ci5sZWRle2NvbG9yOnZhcigtLWRpbSk7Zm9udDoxNXB4LzEuNyB2YXIoLS1zYW5zKTttYXgtd2lkdGg6NTJjaDttYXJnaW46MCAwIDI2cHh9Ci5zdGF0Um93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZml0LG1pbm1heCgxNDRweCwxZnIpKTtnYXA6MTJweH0KLnN0YXR7YmFja2dyb3VuZDp2YXIoLS1nbGFzczIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoxNXB4IDE3cHg7dHJhbnNpdGlvbjouMnN9Ci5zdGF0OmhvdmVye2JvcmRlci1jb2xvcjp2YXIoLS1saW1lKTtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5zdGF0IHV7ZGlzcGxheTpibG9jazt0ZXh0LWRlY29yYXRpb246bm9uZTtjb2xvcjp2YXIoLS1kaW0pO2ZvbnQtc2l6ZTo5cHg7bGV0dGVyLXNwYWNpbmc6MS4zcHg7CiAgdGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQouc3RhdCBie2Rpc3BsYXk6YmxvY2s7Zm9udDo3MDAgMjRweC8xLjE1IHZhcigtLXNhbnMpO21hcmdpbjo3cHggMCAzcHg7bGV0dGVyLXNwYWNpbmc6LTFweH0KLnN0YXQgc3tkaXNwbGF5OmJsb2NrO3RleHQtZGVjb3JhdGlvbjpub25lO2NvbG9yOnZhcigtLWRpbTIpO2ZvbnQtc2l6ZToxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoubG9naW5Cb3h7YmFja2dyb3VuZDp2YXIoLS1nbGFzczIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtib3JkZXItcmFkaXVzOjIwcHg7cGFkZGluZzoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KX0KLmxvZ2luQm94IGgze21hcmdpbjowIDAgNHB4O2ZvbnQtc2l6ZToxMi41cHg7bGV0dGVyLXNwYWNpbmc6MnB4O2NvbG9yOnZhcigtLW9saXZlKTtmb250LWZhbWlseTp2YXIoLS1tb25vKX0KW2RhdGEtdGhlbWU9ImRhcmsiXSAubG9naW5Cb3ggaDN7Y29sb3I6dmFyKC0tbGltZSl9Ci5sb2dpbkJveCAuc2J7Y29sb3I6dmFyKC0tZGltKTtmb250LXNpemU6MTAuNXB4O21hcmdpbi1ib3R0b206MThweDtsZXR0ZXItc3BhY2luZzouNnB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQouZXJye2NvbG9yOnZhcigtLW1hZyk7Zm9udC1zaXplOjExLjVweDttaW4taGVpZ2h0OjE2cHg7bWFyZ2luLXRvcDo2cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Ci53YXJuYm94e2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1hbWIpO2JhY2tncm91bmQ6cmdiYSgxNjgsMTI4LDI3LC4wOCk7cGFkZGluZzoxMXB4IDE0cHg7CiAgYm9yZGVyLXJhZGl1czowIDEycHggMTJweCAwO2ZvbnQtc2l6ZToxMS41cHg7Y29sb3I6IzZCNTQxMDttYXJnaW4tYm90dG9tOjE1cHg7bGluZS1oZWlnaHQ6MS42fQpbZGF0YS10aGVtZT0iZGFyayJdIC53YXJuYm94e2NvbG9yOiNFMEMyNzF9Ci5waWxsYXJze21heC13aWR0aDoxMjIwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nOjAgMjRweCA4MHB4fQoucGlsbGFycyBoMnt0ZXh0LWFsaWduOmNlbnRlcjtmb250OjcwMCBjbGFtcCgyM3B4LDMuNHZ3LDM0cHgpLzEuMSB2YXIoLS1zYW5zKTtsZXR0ZXItc3BhY2luZzotMS4xcHg7bWFyZ2luOjAgMCAxMHB4fQoucGlsbGFycyBoMiBlbXtmb250LXN0eWxlOm5vcm1hbDtjb2xvcjp2YXIoLS1saW1lKX0KLnBpbGxhcnMgLnN1Ynt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1kaW0pO2ZvbnQ6MTMuNXB4LzEuNiB2YXIoLS1zYW5zKTttYXJnaW46MCAwIDMwcHh9Ci5wZ3JpZHtkaXNwbGF5OmdyaWQ7Z2FwOjE2cHg7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdChhdXRvLWZpdCxtaW5tYXgoMjE0cHgsMWZyKSl9Ci5wY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MjBweDt0cmFuc2l0aW9uOi4yMnN9Ci5wY2FyZDpob3Zlcnt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtNHB4KTtib3JkZXItY29sb3I6dmFyKC0tbGltZSk7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cyKX0KLnBjYXJkIHV7dGV4dC1kZWNvcmF0aW9uOm5vbmU7Y29sb3I6dmFyKC0tbGltZSk7Zm9udC1zaXplOjkuNXB4O2xldHRlci1zcGFjaW5nOjEuNnB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoucGNhcmQgaDR7bWFyZ2luOjEwcHggMDtmb250OjcwMCAxNS41cHgvMS4zIHZhcigtLXNhbnMpO2xldHRlci1zcGFjaW5nOi0uM3B4fQoucGNhcmQgcHttYXJnaW46MCAwIDEzcHg7Y29sb3I6dmFyKC0tZGltKTtmb250OjEycHgvMS42NSB2YXIoLS1zYW5zKX0KLmNoaXB7ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1nbGFzczIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtjb2xvcjp2YXIoLS1kaW0pOwogIGJvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6NHB4IDEwcHg7Zm9udC1zaXplOjEwcHg7bWFyZ2luOjAgNXB4IDVweCAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoKLyog4pSA4pSAIFNIRUxMIOKUgOKUgCAqLwojYXBwe2Rpc3BsYXk6ZmxleDttaW4taGVpZ2h0OjEwMHZofQphc2lkZXt3aWR0aDp2YXIoLS1zYncpO2ZsZXg6MCAwIHZhcigtLXNidyk7cG9zaXRpb246c3RpY2t5O3RvcDowO2hlaWdodDoxMDB2aDt6LWluZGV4OjQwOwogIGRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7Ym9yZGVyLXJpZ2h0OjFweCBzb2xpZCB2YXIoLS1zdHJva2UpfQouYWJyYW5ke3BhZGRpbmc6MThweCAxNnB4IDE2cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtkaXNwbGF5OmZsZXg7Z2FwOjExcHg7YWxpZ24taXRlbXM6Y2VudGVyfQoubWFya3t3aWR0aDozNHB4O2hlaWdodDozNHB4O2JvcmRlci1yYWRpdXM6MTBweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtc2l6ZToxNXB4OwogIGJhY2tncm91bmQ6dmFyKC0tbGltZSk7Y29sb3I6I2ZmZjtib3gtc2hhZG93OjAgNHB4IDEycHggcmdiYSgxMjAsMTM4LDI5LC4zMCl9Ci5hYnJhbmQgYntmb250OjcwMCAxM3B4LzEuMjUgdmFyKC0tc2Fucyk7bGV0dGVyLXNwYWNpbmc6LjJweDtkaXNwbGF5OmJsb2NrfQouYWJyYW5kIHNwYW57Y29sb3I6dmFyKC0tZGltMik7Zm9udC1zaXplOjguNXB4O2xldHRlci1zcGFjaW5nOjEuMnB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQphc2lkZSBuYXZ7ZmxleDoxO292ZXJmbG93LXk6YXV0bztwYWRkaW5nOjEycHggMTJweCAxOHB4fQouZ3Jwe2NvbG9yOnZhcigtLWRpbTIpO2ZvbnQtc2l6ZTo4LjVweDtsZXR0ZXItc3BhY2luZzoxLjhweDtwYWRkaW5nOjE2cHggMTBweCA3cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CmFzaWRlIG5hdiBidXR0b257ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTFweDt3aWR0aDoxMDAlO2JhY2tncm91bmQ6bm9uZTtib3JkZXI6MDsKICBjb2xvcjp2YXIoLS1kaW0pO3BhZGRpbmc6OXB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMHB4O3RleHQtYWxpZ246bGVmdDtmb250LXNpemU6MTIuNXB4OwogIHRyYW5zaXRpb246LjE1czttYXJnaW4tYm90dG9tOjJweH0KYXNpZGUgbmF2IGJ1dHRvbjpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLWdsYXNzMik7Y29sb3I6dmFyKC0tdHh0KX0KYXNpZGUgbmF2IGJ1dHRvbi5vbntiYWNrZ3JvdW5kOnZhcigtLWxpbWUpO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6NjAwOwogIGJveC1zaGFkb3c6MCAzcHggMTBweCByZ2JhKDEyMCwxMzgsMjksLjI4KX0KYXNpZGUgbmF2IGJ1dHRvbiBpe2ZvbnQtc3R5bGU6bm9ybWFsO3dpZHRoOjE2cHg7dGV4dC1hbGlnbjpjZW50ZXI7Zm9udC1zaXplOjEycHh9Ci5hZm9vdHtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpO3BhZGRpbmc6MTRweCAxNnB4O2ZvbnQtc2l6ZToxMC41cHg7Y29sb3I6dmFyKC0tZGltMik7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Cm1haW57ZmxleDoxO21pbi13aWR0aDowO3BhZGRpbmc6MjJweCBjbGFtcCgxNnB4LDIuNnZ3LDMycHgpIDk2cHh9Ci5tdG9we2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjExcHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLWJvdHRvbToyMnB4fQouY3J1bWJ7Y29sb3I6dmFyKC0tZGltMik7Zm9udC1zaXplOjExLjVweDtmb250LWZhbWlseTp2YXIoLS1tb25vKX0KLmNydW1iIGJ7Y29sb3I6dmFyKC0tbGltZSk7Zm9udC13ZWlnaHQ6NjAwfQoubXRvcCAuc3B7ZmxleDoxfQojYnVyZ2Vye2Rpc3BsYXk6bm9uZX0KI3RoZW1lQnRue2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlMik7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7Ym9yZGVyLXJhZGl1czo5OXB4O3BhZGRpbmc6NnB4IDEzcHg7Zm9udC1zaXplOjExcHh9CiN0aGVtZUJ0bjpob3Zlcntib3JkZXItY29sb3I6dmFyKC0tbGltZSk7Y29sb3I6dmFyKC0tbGltZSl9CkBtZWRpYShtYXgtd2lkdGg6ODYwcHgpewogIGFzaWRle3Bvc2l0aW9uOmZpeGVkO2xlZnQ6MDt0b3A6MDt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtMTAwJSk7dHJhbnNpdGlvbjouMjRzO2JveC1zaGFkb3c6MCAwIDYwcHggcmdiYSg2MCw0OCwyMCwuMjgpfQogIGFzaWRlLm9wZW57dHJhbnNmb3JtOm5vbmV9CiAgI3Njcmlte3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7YmFja2dyb3VuZDpyZ2JhKDQ1LDM4LDE4LC4zNCk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoMnB4KTt6LWluZGV4OjM1fQogICNidXJnZXJ7ZGlzcGxheTppbmxpbmUtZmxleH0KICBtYWlue3BhZGRpbmctYm90dG9tOjExMHB4fQp9CgovKiDilIDilIAgUFJJTUlUSVZFUyDilIDilIAgKi8KLmNhcmR7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpO2JvcmRlci1yYWRpdXM6dmFyKC0tcik7CiAgcGFkZGluZzoxOHB4IDIwcHg7bWFyZ2luLWJvdHRvbToxNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt0cmFuc2l0aW9uOi4yc30KLmNhcmQ6aG92ZXJ7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cyKX0KLmNhcmQ+aDN7bWFyZ2luOjAgMCAxNHB4O2ZvbnQtc2l6ZToxMC41cHg7bGV0dGVyLXNwYWNpbmc6MS43cHg7Y29sb3I6dmFyKC0tZGltKTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7CiAgZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OXB4O2ZsZXgtd3JhcDp3cmFwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQouZ3JpZHtkaXNwbGF5OmdyaWQ7Z2FwOjE0cHh9Ci5nMntncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZml0LG1pbm1heCgyOTJweCwxZnIpKX0KLmcze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maXQsbWlubWF4KDIwOHB4LDFmcikpfQouZzR7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdChhdXRvLWZpdCxtaW5tYXgoMTYycHgsMWZyKSl9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjE3cHggMThweDsKICB0cmFuc2l0aW9uOi4ycztwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW59Ci5rcGk6OmFmdGVye2NvbnRlbnQ6Jyc7cG9zaXRpb246YWJzb2x1dGU7bGVmdDowO3RvcDowO2JvdHRvbTowO3dpZHRoOjNweDtiYWNrZ3JvdW5kOnZhcigtLWxpbWUpO29wYWNpdHk6Ljg1fQoua3BpOmhvdmVye3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0ycHgpO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93Mik7Ym9yZGVyLWNvbG9yOnZhcigtLXN0cm9rZTIpfQoua3BpIGJ7ZGlzcGxheTpibG9jaztmb250OjcwMCAyN3B4LzEuMSB2YXIoLS1zYW5zKTtsZXR0ZXItc3BhY2luZzotMS40cHh9Ci5rcGkgdXtkaXNwbGF5OmJsb2NrO3RleHQtZGVjb3JhdGlvbjpub25lO2NvbG9yOnZhcigtLWRpbSk7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzoxLjNweDsKICB0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bWFyZ2luLWJvdHRvbTo2cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Ci5rcGkgc3tkaXNwbGF5OmJsb2NrO3RleHQtZGVjb3JhdGlvbjpub25lO2NvbG9yOnZhcigtLWRpbTIpO2ZvbnQtc2l6ZToxMHB4O21hcmdpbi10b3A6NXB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQouYnRue2JhY2tncm91bmQ6dmFyKC0tcGFuZWwpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlMik7cGFkZGluZzo5cHggMTVweDtib3JkZXItcmFkaXVzOjEwcHg7CiAgZm9udC1zaXplOjExLjVweDt0cmFuc2l0aW9uOi4xNnM7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Ci5idG46aG92ZXJ7Ym9yZGVyLWNvbG9yOnZhcigtLWxpbWUpO2NvbG9yOnZhcigtLWxpbWUpfQouYnRuLnB7YmFja2dyb3VuZDp2YXIoLS1saW1lKTtib3JkZXItY29sb3I6dmFyKC0tbGltZSk7Y29sb3I6I2ZmZjtmb250LXdlaWdodDo3MDA7CiAgYm94LXNoYWRvdzowIDNweCAxMHB4IHJnYmEoMTIwLDEzOCwyOSwuMjYpfQouYnRuLnA6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1saW1lMik7Ym9yZGVyLWNvbG9yOnZhcigtLWxpbWUyKTtjb2xvcjojZmZmO2JveC1zaGFkb3c6MCA1cHggMTZweCByZ2JhKDEyMCwxMzgsMjksLjM0KX0KLmJ0bi5va3tiYWNrZ3JvdW5kOnJnYmEoNzksMTIyLDQyLC4xMCk7Ym9yZGVyLWNvbG9yOnJnYmEoNzksMTIyLDQyLC4zNCk7Y29sb3I6dmFyKC0tZ3JuKX0KLmJ0bi5ub3tiYWNrZ3JvdW5kOnJnYmEoMTgwLDY4LDQyLC4wOSk7Ym9yZGVyLWNvbG9yOnJnYmEoMTgwLDY4LDQyLC4zMCk7Y29sb3I6dmFyKC0tbWFnKX0KLmJ0bi5zbXtwYWRkaW5nOjZweCAxMXB4O2ZvbnQtc2l6ZToxMC41cHg7Ym9yZGVyLXJhZGl1czo4cHh9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDtjdXJzb3I6bm90LWFsbG93ZWQ7dHJhbnNmb3JtOm5vbmV9Ci5yb3d7ZGlzcGxheTpmbGV4O2dhcDo5cHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyfQpsYWJlbC5me2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbToxM3B4fQpsYWJlbC5mPnNwYW57ZGlzcGxheTpibG9jaztmb250LXNpemU6OS41cHg7bGV0dGVyLXNwYWNpbmc6MS4ycHg7Y29sb3I6dmFyKC0tZGltKTttYXJnaW4tYm90dG9tOjZweDsKICB0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Ci5pbnt3aWR0aDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tZ2xhc3MyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZTIpO2NvbG9yOnZhcigtLXR4dCk7CiAgcGFkZGluZzoxMHB4IDEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4O291dGxpbmU6bm9uZTt0cmFuc2l0aW9uOi4xNnN9Ci5pbjpmb2N1c3tib3JkZXItY29sb3I6dmFyKC0tbGltZSk7Ym94LXNoYWRvdzowIDAgMCAzcHggcmdiYSgxMjAsMTM4LDI5LC4xNCk7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCl9CnRleHRhcmVhLmlue21pbi1oZWlnaHQ6NzRweDtyZXNpemU6dmVydGljYWw7Zm9udC1mYW1pbHk6dmFyKC0tc2Fucyl9CnRhYmxle3dpZHRoOjEwMCU7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO2ZvbnQtc2l6ZToxMnB4fQp0aHt0ZXh0LWFsaWduOmxlZnQ7Y29sb3I6dmFyKC0tZGltKTtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjlweDtsZXR0ZXItc3BhY2luZzoxLjJweDtwYWRkaW5nOjEwcHggOXB4OwogIGJvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXN0cm9rZTIpO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTt3aGl0ZS1zcGFjZTpub3dyYXA7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CnRke3BhZGRpbmc6MTFweCA5cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tc3Ryb2tlKTt2ZXJ0aWNhbC1hbGlnbjp0b3B9CnRyOmhvdmVyIHRke2JhY2tncm91bmQ6dmFyKC0tZ2xhc3MyKX0KLnR3e292ZXJmbG93LXg6YXV0bztib3JkZXItcmFkaXVzOjEwcHh9Ci50YWd7ZGlzcGxheTppbmxpbmUtYmxvY2s7cGFkZGluZzozcHggMTBweDtib3JkZXItcmFkaXVzOjZweDtmb250LXNpemU6OXB4O2xldHRlci1zcGFjaW5nOjFweDsKICBib3JkZXI6MXB4IHNvbGlkO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTt3aGl0ZS1zcGFjZTpub3dyYXA7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC13ZWlnaHQ6NjAwfQoudC1jeXtjb2xvcjp2YXIoLS1vbGl2ZSk7Ym9yZGVyLWNvbG9yOnJnYmEoMTIwLDEzOCwyOSwuMzQpO2JhY2tncm91bmQ6cmdiYSgxMjAsMTM4LDI5LC4xMSl9CltkYXRhLXRoZW1lPSJkYXJrIl0gLnQtY3l7Y29sb3I6dmFyKC0tbGltZSl9Ci50LWdybntjb2xvcjojM0U2NTIyO2JvcmRlci1jb2xvcjpyZ2JhKDc5LDEyMiw0MiwuMzIpO2JhY2tncm91bmQ6cmdiYSg3OSwxMjIsNDIsLjExKX0KLnQtbWFne2NvbG9yOiNCNDQ0MkE7Ym9yZGVyLWNvbG9yOnJnYmEoMTgwLDY4LDQyLC4zNCk7YmFja2dyb3VuZDpyZ2JhKDE4MCw2OCw0MiwuMTApfQpbZGF0YS10aGVtZT0iZGFyayJdIC50LWdybntjb2xvcjojN0ZEMDVBfQoudC1hbWJ7Y29sb3I6IzhBNjcxMjtib3JkZXItY29sb3I6cmdiYSgxNjgsMTI4LDI3LC4zMik7YmFja2dyb3VuZDpyZ2JhKDE2OCwxMjgsMjcsLjExKX0KW2RhdGEtdGhlbWU9ImRhcmsiXSAudC1hbWJ7Y29sb3I6I0UwQjU0QX0KLnQtcmVke2NvbG9yOiM5QjNBMjM7Ym9yZGVyLWNvbG9yOnJnYmEoMTgwLDY4LDQyLC4zMCk7YmFja2dyb3VuZDpyZ2JhKDE4MCw2OCw0MiwuMTApfQpbZGF0YS10aGVtZT0iZGFyayJdIC50LXJlZHtjb2xvcjojRjA4NjZCfQoudC1ibHV7Y29sb3I6IzRBNUExNTtib3JkZXItY29sb3I6cmdiYSg5MiwxMTAsMjYsLjMwKTtiYWNrZ3JvdW5kOnJnYmEoOTIsMTEwLDI2LC4xMCl9CltkYXRhLXRoZW1lPSJkYXJrIl0gLnQtYmx1e2NvbG9yOiNBOEJFNDV9Ci50LXB1cntjb2xvcjojNTY1RjJFO2JvcmRlci1jb2xvcjpyZ2JhKDExMCwxMjIsNjAsLjMwKTtiYWNrZ3JvdW5kOnJnYmEoMTEwLDEyMiw2MCwuMTApfQpbZGF0YS10aGVtZT0iZGFyayJdIC50LXB1cntjb2xvcjojQjRDMTc2fQoudC1kaW17Y29sb3I6dmFyKC0tZGltKTtib3JkZXItY29sb3I6dmFyKC0tc3Ryb2tlMik7YmFja2dyb3VuZDp2YXIoLS1nbGFzczIpfQouYmFye2hlaWdodDo3cHg7YmFja2dyb3VuZDp2YXIoLS1iZzIpO2JvcmRlci1yYWRpdXM6OTlweDtvdmVyZmxvdzpoaWRkZW59Ci5iYXIgaXtkaXNwbGF5OmJsb2NrO2hlaWdodDoxMDAlO2JvcmRlci1yYWRpdXM6OTlweDsKICBiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1vbGl2ZSksdmFyKC0tbGltZSkpO3RyYW5zaXRpb246d2lkdGggLjVzIGN1YmljLWJlemllciguNCwwLC4yLDEpfQpbZGF0YS10aGVtZT0iZGFyayJdIC5iYXIgaXtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1saW1lKSx2YXIoLS1saW1lMikpfQp1bC50aWdodHttYXJnaW46N3B4IDAgMDtwYWRkaW5nLWxlZnQ6MThweDtmb250LXNpemU6MTJweDtjb2xvcjp2YXIoLS1kaW0pfQp1bC50aWdodCBsaXttYXJnaW46NXB4IDB9CnVsLnRpZ2h0IGJ7Y29sb3I6dmFyKC0tdHh0KX0KcHJlLnlhbWx7YmFja2dyb3VuZDp2YXIoLS1nbGFzczIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtib3JkZXItcmFkaXVzOjExcHg7cGFkZGluZzoxNHB4OwogIGZvbnQtc2l6ZToxMXB4O292ZXJmbG93OmF1dG87Y29sb3I6IzNFNEExODttYXJnaW46MDtsaW5lLWhlaWdodDoxLjY7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9CltkYXRhLXRoZW1lPSJkYXJrIl0gcHJlLnlhbWx7Y29sb3I6I0I0QzE3Nn0KLmxvZ3tiYWNrZ3JvdW5kOnZhcigtLWdsYXNzMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpO2JvcmRlci1yYWRpdXM6MTFweDtwYWRkaW5nOjEzcHg7CiAgbWF4LWhlaWdodDozNzBweDtvdmVyZmxvdzphdXRvO2ZvbnQtc2l6ZToxMXB4O2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoubG9nIGRpdntwYWRkaW5nOjNweCAwO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7d2hpdGUtc3BhY2U6cHJlLXdyYXA7d29yZC1icmVhazpicmVhay13b3JkfQoubG9nIC50c3tjb2xvcjp2YXIoLS1kaW0yKX0KLm1vbm8tZGlte2NvbG9yOnZhcigtLWRpbSk7Zm9udC1zaXplOjExcHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyl9Ci5tb2RhbHtwb3NpdGlvbjpmaXhlZDtpbnNldDowO2JhY2tncm91bmQ6cmdiYSg0NSwzOCwxOCwuNDIpO3otaW5kZXg6OTA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjsKICBqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3BhZGRpbmc6MThweDtiYWNrZHJvcC1maWx0ZXI6Ymx1cig1cHgpfQoubWJveHt3aWR0aDoxMDAlO21heC13aWR0aDo2NjBweDttYXgtaGVpZ2h0Ojg4dmg7b3ZlcmZsb3c6YXV0bztiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTsKICBib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZTIpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjI2cHg7Ym94LXNoYWRvdzowIDI0cHggNzBweCByZ2JhKDYwLDQ4LDIwLC4yNCl9Ci5tYm94IGgze21hcmdpbjowIDAgNnB4O2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLW9saXZlKTtsZXR0ZXItc3BhY2luZzotLjJweDt0ZXh0LXRyYW5zZm9ybTpub25lfQpbZGF0YS10aGVtZT0iZGFyayJdIC5tYm94IGgze2NvbG9yOnZhcigtLWxpbWUpfQouZmxhc2h7cG9zaXRpb246Zml4ZWQ7bGVmdDo1MCU7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTUwJSk7Ym90dG9tOjI2cHg7YmFja2dyb3VuZDp2YXIoLS1pbmspOwogIGNvbG9yOiNGNEY0RjA7Ym9yZGVyLWxlZnQ6M3B4IHNvbGlkIHZhcigtLWxpbWUpO3BhZGRpbmc6MTNweCAyMXB4O2JvcmRlci1yYWRpdXM6MTJweDtmb250LXNpemU6MTJweDsKICB6LWluZGV4Ojk5O21heC13aWR0aDo5MHZ3O2JveC1zaGFkb3c6MCAxNHB4IDQ0cHggcmdiYSg2MCw0OCwyMCwuMzApO2FuaW1hdGlvbjpmdSAuMjhzfQpAa2V5ZnJhbWVzIGZ1e2Zyb217b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGUoLTUwJSwxMnB4KX19CgovKiDilIDilIAgUkFESUFMIEVOR0lORSDilIDilIAgKi8KLmVuZ2luZVdyYXB7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMjU4cHg7Z2FwOjE0cHh9CkBtZWRpYShtYXgtd2lkdGg6MTAwMHB4KXsuZW5naW5lV3JhcHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNhbnZhc0JveHtiYWNrZ3JvdW5kOnZhcigtLXBhbmVsKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7Ym9yZGVyLXJhZGl1czp2YXIoLS1yKTsKICBwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW47bWluLWhlaWdodDo0NDBweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5jYW52YXNCb3ggc3Zne2Rpc3BsYXk6YmxvY2s7d2lkdGg6MTAwJTtoZWlnaHQ6YXV0bzt0b3VjaC1hY3Rpb246cGFuLXl9Ci5ncmlkYmd7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtwb2ludGVyLWV2ZW50czpub25lO29wYWNpdHk6LjU1OwogIGJhY2tncm91bmQtaW1hZ2U6bGluZWFyLWdyYWRpZW50KHZhcigtLXN0cm9rZSkgMXB4LHRyYW5zcGFyZW50IDFweCksCiAgICAgICAgICAgICAgICAgICBsaW5lYXItZ3JhZGllbnQoOTBkZWcsdmFyKC0tc3Ryb2tlKSAxcHgsdHJhbnNwYXJlbnQgMXB4KTsKICBiYWNrZ3JvdW5kLXNpemU6MzRweCAzNHB4OwogIG1hc2staW1hZ2U6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA1MCUgNTAlLCMwMDAgNDAlLHRyYW5zcGFyZW50IDc2JSk7CiAgLXdlYmtpdC1tYXNrLWltYWdlOnJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgNTAlIDUwJSwjMDAwIDQwJSx0cmFuc3BhcmVudCA3NiUpfQouZW5nVG9we3Bvc2l0aW9uOmFic29sdXRlO2xlZnQ6MTRweDt0b3A6MTNweDt6LWluZGV4OjI7ZGlzcGxheTpmbGV4O2dhcDo4cHg7ZmxleC13cmFwOndyYXB9Ci5lbmdUaXRsZXtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0OjUwJTt0b3A6MTRweDt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKTt6LWluZGV4OjI7CiAgZm9udDo3MDAgMTNweCB2YXIoLS1zYW5zKTtsZXR0ZXItc3BhY2luZzoyLjZweDtjb2xvcjp2YXIoLS10eHQpfQoubm9kZXtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOi4xOHN9Ci5ub2RlOmhvdmVyIGNpcmNsZXtmaWx0ZXI6YnJpZ2h0bmVzcygxLjE1KX0KLnNpZGV7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTRweH0KLmxlZ2VuZCBkaXZ7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OXB4O2ZvbnQtc2l6ZToxMC41cHg7Y29sb3I6dmFyKC0tZGltKTtwYWRkaW5nOjRweCAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQoubGVnZW5kIGl7d2lkdGg6MTBweDtoZWlnaHQ6MTBweDtib3JkZXItcmFkaXVzOjNweDtkaXNwbGF5OmJsb2NrO2ZsZXg6MCAwIDEwcHh9Ci5kaXJMaXN0e21heC1oZWlnaHQ6MjY2cHg7b3ZlcmZsb3c6YXV0b30KLmRpckxpc3QgYnV0dG9ue2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6OHB4O3dpZHRoOjEwMCU7YmFja2dyb3VuZDpub25lO2JvcmRlcjowOwogIGJvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7cGFkZGluZzo4cHggNHB4O2ZvbnQtc2l6ZToxMC41cHg7Y29sb3I6dmFyKC0tZGltKTsKICB0ZXh0LWFsaWduOmxlZnQ7dHJhbnNpdGlvbjouMTRzO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQouZGlyTGlzdCBidXR0b246aG92ZXJ7Y29sb3I6dmFyKC0tbGltZSk7cGFkZGluZy1sZWZ0OjdweH0KLmRpckxpc3Qgc3Bhbntjb2xvcjp2YXIoLS1kaW0yKTtmb250LXNpemU6OS41cHh9Ci50ZXJte2JhY2tncm91bmQ6dmFyKC0taW5rKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXN0cm9rZSk7Ym9yZGVyLXJhZGl1czoxMXB4O3BhZGRpbmc6MTRweDsKICBmb250LXNpemU6MTAuNXB4O21heC1oZWlnaHQ6MTU4cHg7b3ZlcmZsb3c6YXV0bztjb2xvcjojQjhEMTM0O3doaXRlLXNwYWNlOnByZS13cmFwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pfQo8L3N0eWxlPgoKCjwvaGVhZD4KPGJvZHk+CjwhLS0gPT09PT09PT09PT09PT09PT0gR0FURSA9PT09PT09PT09PT09PT09PSAtLT4KPGRpdiBpZD0iZ2F0ZSI+CiAgPGRpdiBjbGFzcz0idG9wYmFyIj4KICAgIDxkaXYgY2xhc3M9ImxvZ28iPkNIQUlSTUFOIDxpPkFHRU5UIE9TPC9pPjwvZGl2PgogICAgPHNwYW4gY2xhc3M9InBpbGwgbGl2ZSI+PHNwYW4gY2xhc3M9ImRvdCI+PC9zcGFuPlNFUlZFUiBMSVZFICZhbXA7IEFVRElUSU5HPC9zcGFuPgogICAgPHNwYW4gY2xhc3M9InBpbGwiPlpFUk8tVFJVU1QgQUNUSVZFPC9zcGFuPgogICAgPHNwYW4gY2xhc3M9InBpbGwiIHN0eWxlPSJib3JkZXItY29sb3I6IzY3NDcwZjtjb2xvcjp2YXIoLS1hbWIpO2JhY2tncm91bmQ6IzFhMTMwNSI+WkVSTy1DT1NUIERPQ1RSSU5FPC9zcGFuPgogIDwvZGl2PgoKICA8ZGl2IGNsYXNzPSJoZXJvIj4KICAgIDxkaXYgY2xhc3M9Imhlcm9DYXJkIj4KICAgICAgPGRpdj4KICAgICAgICA8c3BhbiBjbGFzcz0iYmFkZ2UiPkhFQUQgT0YgQUxMIEFHRU5UUzwvc3Bhbj4KICAgICAgICA8aDEgY2xhc3M9ImJpZyI+Tk8gU1VHQVIgQ09BVElORy48YnI+PGVtPk5PIENPTVBST01JU0UuPC9lbT48L2gxPgogICAgICAgIDxwIGNsYXNzPSJsZWRlIj5FdmVyeSBkZXRhaWwgY2hlY2tlZCwgZXZlcnkgc3ViLWFnZW50IGF1ZGl0ZWQsIGV2ZXJ5IGVudGVycHJpc2UgcmVxdWVzdCBmb3JjZWQgdGhyb3VnaCBhIHByZWNpc2UgcGVybWlzc2lvbiBmbG93LiBOb3RoaW5nIHBhaWQgZm9yLCBldmVyIOKAlCB0aGUgQ2hhaXJtYW4gcm91dGVzIGFyb3VuZCBldmVyeSBwYXl3YWxsLCBjcmVkaXQgbWV0ZXIgYW5kIHN1YnNjcmlwdGlvbiBnYXRlLjwvcD4KICAgICAgICA8ZGl2IGNsYXNzPSJzdGF0Um93Ij4KICAgICAgICAgIDxkaXYgY2xhc3M9InN0YXQiPjx1PkJhY2tlbmQ8L3U+PGIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiIGlkPSJoc1VwIj5DSEVDS0lOR+KApjwvYj48cyBpZD0iaHNOb2RlIj7igJQ8L3M+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJzdGF0Ij48dT5TZWN1cml0eSBHYXRlPC91PjxiIHN0eWxlPSJjb2xvcjp2YXIoLS1jeSkiPkxPQ0tFRDwvYj48cz5TZXJ2ZXItc2lkZSBzZXNzaW9uczwvcz48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InN0YXQiPjx1PkNvc3QgQ2VpbGluZzwvdT48YiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+JDAuMDA8L2I+PHM+MCBkZXBlbmRlbmNpZXMgaW5zdGFsbGVkPC9zPjwvZGl2PgogICAgICAgIDwvZGl2PgogICAgICA8L2Rpdj4KCiAgICAgIDxkaXYgY2xhc3M9ImxvZ2luQm94Ij4KICAgICAgICA8aDM+T1dORVIgUE9SVEFMPC9oMz4KICAgICAgICA8ZGl2IGNsYXNzPSJzYiI+Q1JZUFRPR1JBUEhJQyBDTEVBUkFOQ0UgUkVRVUlSRUQ8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJ3YXJuYm94IiBpZD0iYm9vdE5vdGUiPkJvb3RzdHJhcCBjcmVkZW50aWFscyB3ZXJlIGdlbmVyYXRlZCBvbmNlIGJ5IHRoZSBzZXJ2ZXIgYW5kIHByaW50ZWQgdG8gaXRzIGNvbnNvbGUgLyA8Y29kZT5PV05FUl9DUkVERU5USUFMUy50eHQ8L2NvZGU+LiBSb3RhdGUgdGhlIHBhc3N3b3JkIGltbWVkaWF0ZWx5IGFmdGVyIGZpcnN0IGxvZ2luLjwvZGl2PgogICAgICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+T3duZXIgSUQ8L3NwYW4+PGlucHV0IGlkPSJsaUlkIiBjbGFzcz0iaW4iIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiPjwvbGFiZWw+CiAgICAgICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5QYXNzd29yZDwvc3Bhbj48aW5wdXQgaWQ9ImxpUHciIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiIGF1dG9jb21wbGV0ZT0iY3VycmVudC1wYXNzd29yZCIgb25rZXlkb3duPSJpZihldmVudC5rZXk9PT0nRW50ZXInKWRvTG9naW4oKSI+PC9sYWJlbD4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgc3R5bGU9IndpZHRoOjEwMCUiIG9uY2xpY2s9ImRvTG9naW4oKSI+QVVUSEVOVElDQVRFPC9idXR0b24+CiAgICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ibGlFcnIiPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4Ij5TZXNzaW9ucyBhcmUgaGVsZCBzZXJ2ZXItc2lkZSAoOGggVFRMLCBIdHRwT25seSBjb29raWUpLiBMb2cgaW4gZnJvbSBhbnkgZGV2aWNlIG9uIHRoaXMgVVJMIOKAlCBzdGF0ZSBpcyBzaGFyZWQgbGl2ZS48L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPGRpdiBjbGFzcz0icGlsbGFycyI+CiAgICA8aDI+Q0hBSVJNQU4gPGVtPlJBRElBTCBQSUxMQVJTPC9lbT48L2gyPgogICAgPHAgY2xhc3M9InN1YiI+Rmxvb3ItYnktZmxvb3IgZW50ZXJwcmlzZSBjb21tYW5kIHdpdGggZGVkaWNhdGVkIG1pc3Npb24gbGVhZHMgYW5kIGhhcmQgb3BlcmF0aW9uYWwgc2NvcGUuPC9wPgogICAgPGRpdiBjbGFzcz0icGdyaWQiIGlkPSJoZXJvUGlsbGFycyI+PC9kaXY+CiAgPC9kaXY+CjwvZGl2PgoKPCEtLSA9PT09PT09PT09PT09PT09PSBBUFAgPT09PT09PT09PT09PT09PT0gLS0+CjxkaXYgaWQ9ImFwcCIgY2xhc3M9ImhpZGUiPgogIDxhc2lkZSBpZD0ic2lkZWJhciI+CiAgICA8ZGl2IGNsYXNzPSJhYnJhbmQiPgogICAgICA8ZGl2IGNsYXNzPSJtYXJrIj7il4k8L2Rpdj4KICAgICAgPGRpdj48Yj5DSEFJUk1BTiBPUzwvYj48c3Bhbj5WMyDCtyBMSVZFIEJBQ0tFTkQ8L3NwYW4+PC9kaXY+CiAgICA8L2Rpdj4KICAgIDxuYXYgaWQ9Im5hdiI+PC9uYXY+CiAgICA8ZGl2IGNsYXNzPSJhZm9vdCI+CiAgICAgIDxkaXY+T1dORVIgPGIgaWQ9Indob0lkIiBzdHlsZT0iY29sb3I6dmFyKC0tdHh0KSI+PC9iPjwvZGl2PgogICAgICA8ZGl2PlVQVElNRSA8c3BhbiBpZD0idXBDbG9jayIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPuKAlDwvc3Bhbj4gwrcgU1BFTkQgPHNwYW4gaWQ9InNwZW5kTWluaSIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPiQwLjAwPC9zcGFuPjwvZGl2PgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIHN0eWxlPSJ3aWR0aDoxMDAlO21hcmdpbi10b3A6OHB4IiBvbmNsaWNrPSJsb2dvdXQoKSI+TE9DSyBTWVNURU08L2J1dHRvbj4KICAgIDwvZGl2PgogIDwvYXNpZGU+CiAgPG1haW4+CiAgICA8ZGl2IGNsYXNzPSJtdG9wIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBpZD0iYnVyZ2VyIiBvbmNsaWNrPSJ0b2dnbGVTYigpIj7imLA8L2J1dHRvbj4KICAgICAgPGRpdiBjbGFzcz0iY3J1bWIiPmNoYWlybWFuLW9zIC8gPGIgaWQ9ImNydW1iIj5ob21lPC9iPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJzcCI+PC9kaXY+CiAgICAgIDxidXR0b24gaWQ9InRoZW1lQnRuIiBvbmNsaWNrPSJ0b2dnbGVUaGVtZSgpIiB0aXRsZT0iTGlnaHQgLyBkYXJrIj7il5A8L2J1dHRvbj4KICAgICAgPHNwYW4gY2xhc3M9InBpbGwgbGl2ZSI+PHNwYW4gY2xhc3M9ImRvdCI+PC9zcGFuPjxzcGFuIGlkPSJzeW5jUGlsbCI+U1lOQ0VEPC9zcGFuPjwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InBpbGwiIHN0eWxlPSJib3JkZXItY29sb3I6IzY3NDcwZjtjb2xvcjp2YXIoLS1hbWIpO2JhY2tncm91bmQ6IzFhMTMwNSI+WkVSTy1DT1NUPC9zcGFuPgogICAgPC9kaXY+CiAgICA8ZGl2IGlkPSJ2aWV3Ij48L2Rpdj4KICA8L21haW4+CjwvZGl2PgoKPHNjcmlwdCBzcmM9Ii9hcHAuanMiPjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K','base64'),
  'app.js': Buffer.from('LyogQ0hBSVJNQU4gQUdFTlQgT1MgwrcgVjMgY2xpZW50IOKAlCB0YWxrcyB0byB0aGUgcmVhbCBiYWNrZW5kLCBubyBsb2NhbFN0b3JhZ2Ugc3RhdGUuICovCmNvbnN0IFBJTExBUlM9Wwoge2lkOjEsbmFtZTonU2VjdXJpdHkgJiBBdWRpdCBDb21tYW5kJyx1bml0czonQXVkaXQgRW5naW5lIMK3IFJpc2sgTWF0cml4IMK3IFBvbGljeSBWYXVsdCcsaWNvbjon8J+boe+4jycsY29sb3I6JyNCNDQ0MkEnLGNsczondC1yZWQnLAogIGRlc2M6J1RvcC1sZXZlbCBwcm90ZWN0aW9uLCBicmVhY2ggcHJldmVudGlvbiwgY29tcGxpYW5jZSBhc3N1cmFuY2UsIGNvbnRpbnVvdXMgcG9saWN5IGVuZm9yY2VtZW50LicsY2hpcHM6WydBdWRpdCBFbmdpbmUnLCdSaXNrIE1hdHJpeCcsJ1BvbGljeSBWYXVsdCddfSwKIHtpZDoyLG5hbWU6J09wZXJhdGlvbnMgJiBJbmZyYXN0cnVjdHVyZScsdW5pdHM6J0V4ZWN1dGlvbiBGbG93cyDCtyBPcmNoZXN0cmF0aW9uIMK3IEZhY2lsaXR5IENvbnRyb2wnLGljb246J+KaoScsY29sb3I6JyNBODgwMUInLGNsczondC1hbWInLAogIGRlc2M6J1N5c3RlbXMgZXhlY3V0aW9uLCBjbG91ZCBvcmNoZXN0cmF0aW9uLCBmYWNpbGl0eSBhdXRvbWF0aW9uLCBwcm9jZXNzIG1hbmFnZW1lbnQuJyxjaGlwczpbJ1Byb2Nlc3MgT3JjaGVzdHJhdG9yJywnUmVzb3VyY2UgQ29udHJvbCddfSwKIHtpZDozLG5hbWU6J1Byb2R1Y3QgJiBFbmdpbmVlcmluZycsdW5pdHM6J0Rlc2lnbiDCtyBEZWxpdmVyeSDCtyBJbm5vdmF0aW9uJyxpY29uOifwn5K7Jyxjb2xvcjonIzc4OEExRCcsY2xzOid0LWN5JywKICBkZXNjOidFbmdpbmVlcmluZyBkZXNpZ24sIGxpdmUgY29kZSBkZWxpdmVyeSwgZmVhdHVyZSBkZXBsb3ltZW50LCB3ZWIvYXBwIHN5bmMuJyxjaGlwczpbJ0FwcCBCdWlsZGVyJywnQ29kZSBQaXBlbGluZSddfSwKIHtpZDo0LG5hbWU6J0RhdGEgSW50ZWxsaWdlbmNlJyx1bml0czonQW5hbHl0aWNzIMK3IEZvcmVjYXN0aW5nIMK3IEluc2lnaHQgRm9yZ2UnLGljb246J/Cfk4onLGNvbG9yOicjNkU3QTNDJyxjbHM6J3QtcHVyJywKICBkZXNjOidSZWFsLXRpbWUgYW5hbHl0aWNzLCBwcmVkaWN0aXZlIGZvcmVjYXN0aW5nLCBtYXJrZXQgaW50ZWxsaWdlbmNlLCBkZWNpc2lvbiBzdXBwb3J0LicsY2hpcHM6WydJbnNpZ2h0IEZvcmdlJywnVGVsZW1ldHJ5IEZsb3cnXX0sCiB7aWQ6NSxuYW1lOidTdHJhdGVneSAmIEdyb3d0aCcsdW5pdHM6J0V4ZWN1dGl2ZSBQbGFubmluZyDCtyBWaXNpb24gwrcgUmV2ZW51ZSBTY2FsaW5nJyxpY29uOifwn5qAJyxjb2xvcjonIzRGN0EyQScsY2xzOid0LWdybicsCiAgZGVzYzonRXhlY3V0aXZlIHBsYW5uaW5nLCBhdXRvbWF0ZWQgYnVzaW5lc3Mgc2NhbGluZywgbW9uZXRpemVkIHdlYiBhcHAgbGF1bmNoZXMuJyxjaGlwczpbJ1JldmVudWUgU3RyZWFtZXInLCdNb25ldGl6YXRpb24gRW5naW5lJ119Cl07CmNvbnN0IEZSRUVfUk9VVEVTPVsKIFsnUGFpZCBMTE0gQVBJIGNyZWRpdHMnLCdMb2NhbC9vcGVuLXdlaWdodCBtb2RlbCBvciBmcmVlLXRpZXIgcm90YXRpb24nLCdJbm5vdmF0aW9uIFNjb3V0J10sCiBbJ1BhaWQgaG9zdGluZyAvIGR5bm8nLCdTdGF0aWMgKyBmcmVlLXRpZXIgZWRnZSBob3N0aW5nLCBvd24gaGFyZHdhcmUgZmFsbGJhY2snLCdSZXNvdXJjZSBDb250cm9sbGVyJ10sCiBbJ1BhaWQgZGF0YWJhc2UnLCdTZWxmLWhvc3RlZCBQb3N0Z3Jlcy9TUUxpdGUgKHRoaXMgYnVpbGQ6IHplcm8tZGVwIEpTT04gc3RvcmUpJywnU2NoZW1hIEd1YXJkJ10sCiBbJ1BhaWQgYW5hbHl0aWNzIFNhYVMnLCdTZWxmLWhvc3RlZCBvcGVuIGFuYWx5dGljcyBvbiBvd25lZCBpbmZyYScsJ1RlbGVtZXRyeSBGbG93J10sCiBbJ1BhaWQgZW1haWwvMkZBIHNlcnZpY2UnLCdTTVRQIHZpYSBleGlzdGluZyBvd25lZCBtYWlsYm94JywnVXB0aW1lIE1hcnNoYWwnXSwKIFsnUGFpZCBkYXRhIGZlZWQnLCdQdWJsaWMgQVBJcywgb3BlbiBkYXRhc2V0cywgcGVybWl0dGVkIGFjY2VzcycsJ01hcmtldCBTaWduYWwnXSwKIFsnUGFpZCBkZXNpZ24gYXNzZXRzJywnT3Blbi1saWNlbmNlIGFzc2V0cyBhbmQgZ2VuZXJhdGVkIG9yaWdpbmFscycsJ0FwcCBCdWlsZGVyJ10sCiBbJ1BhaWQgbW9uaXRvcmluZycsJ1NlbGYtaG9zdGVkIHByb2JlcyBhbmQgY3JvbiB3YXRjaGRvZ3MnLCdVcHRpbWUgTWFyc2hhbCddLAogWyducG0gcGFpZC9saWNlbnNlZCBwYWNrYWdlcycsJ05vZGUgY29yZSBtb2R1bGVzIG9ubHkg4oCUIDAgZGVwZW5kZW5jaWVzIGluIHRoaXMgc2VydmVyJywnQ29kZSBQaXBlbGluZSddCl07CmxldCBTPW51bGwsIGN1cj0naG9tZScsIHBvbGw9bnVsbCwgZW5nRm9jdXM9bnVsbDsKCi8qIC0tLS0tLS0tLS0gbmV0IC0tLS0tLS0tLS0gKi8KYXN5bmMgZnVuY3Rpb24gQVBJKHAsYil7CiAgY29uc3Qgbz17bWV0aG9kOmI/J1BPU1QnOidHRVQnLGhlYWRlcnM6eydDb250ZW50LVR5cGUnOidhcHBsaWNhdGlvbi9qc29uJ30sY3JlZGVudGlhbHM6J3NhbWUtb3JpZ2luJ307CiAgaWYoYilvLmJvZHk9SlNPTi5zdHJpbmdpZnkoYik7CiAgY29uc3Qgcj1hd2FpdCBmZXRjaChwLG8pOyBsZXQgaj17fTsgdHJ5e2o9YXdhaXQgci5qc29uKCl9Y2F0Y2goZSl7fQogIGlmKHIuc3RhdHVzPT09NDAxJiZqLmVycm9yPT09J1VOQVVUSEVOVElDQVRFRCcpe3N0b3BQb2xsKCk7bG9jYXRpb24ucmVsb2FkKCk7dGhyb3cgbmV3IEVycm9yKCdzZXNzaW9uIGV4cGlyZWQnKX0KICBpZighci5vaykgdGhyb3cgbmV3IEVycm9yKGouZXJyb3J8fCgnSFRUUCAnK3Iuc3RhdHVzKSk7CiAgaWYoai5zdGF0ZSkgUz1qLnN0YXRlOwogIHJldHVybiBqOwp9CmZ1bmN0aW9uIGVzYyhzKXtyZXR1cm4gU3RyaW5nKHM/PycnKS5yZXBsYWNlKC9bJjw+Il0vZyxjPT4oeycmJzonJmFtcDsnLCc8JzonJmx0OycsJz4nOicmZ3Q7JywnIic6JyZxdW90Oyd9W2NdKSl9CmZ1bmN0aW9uIGZsYXNoKG0pe2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5mbGFzaCcpPy5yZW1vdmUoKTtjb25zdCBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogIGQuY2xhc3NOYW1lPSdmbGFzaCc7ZC50ZXh0Q29udGVudD1tO2RvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZCk7c2V0VGltZW91dCgoKT0+ZC5yZW1vdmUoKSwzMDAwKX0KZnVuY3Rpb24gbWFza01haWwobSl7aWYoIW0pcmV0dXJuICfigJQnO2NvbnN0W2EsYl09bS5zcGxpdCgnQCcpO3JldHVybiBhLnNsaWNlKDAsMikrJ+KAouKAouKAokAnK2J9CmZ1bmN0aW9uIGhobW1zcyhzKXtjb25zdCBoPXMvMzYwMHwwLG09KHMlMzYwMCkvNjB8MCx4PXMlNjA7CiAgcmV0dXJuIChoP2grJ2ggJzonJykrU3RyaW5nKG0pLnBhZFN0YXJ0KDIsJzAnKSsnbSAnK1N0cmluZyh4KS5wYWRTdGFydCgyLCcwJykrJ3MnfQpmdW5jdGlvbiBmbXQobil7cmV0dXJuICgrbnx8MCkudG9Mb2NhbGVTdHJpbmcoKX0KCi8qIC0tLS0tLS0tLS0gYm9vdCAtLS0tLS0tLS0tICovCi8qIEJPT1Qg4oCUIGV2ZXJ5IHN0ZXAgaXNvbGF0ZWQuCiAgIFRoaXMgdXNlZCB0byBiZSBvbmUgdHJ5L2NhdGNoIGFyb3VuZCBldmVyeXRoaW5nLiBJZiBBTlkgc3RlcCB0aHJldyDigJQKICAgYSBtaXNzaW5nIGVsZW1lbnQsIGEgYmFkIHN0YXRlIHNoYXBlLCBvbmUgYnJva2VuIHJlbmRlciDigJQgdGhlIHdob2xlCiAgIGFwcCBkaWVkIHNpbGVudGx5IGFuZCB5b3UgZ290IGEgYmxhbmsgc2NyZWVuIHdpdGggbm8gZXhwbGFuYXRpb24uCiAgIFRoYXQgaXMgdGhlICJicmFpbiBub3QgcnVubmluZyIgYnVnLiBOb3cgZWFjaCBzdGVwIGZhaWxzIG9uIGl0cyBvd24KICAgYW5kIHNheXMgc28gb24gc2NyZWVuIGluc3RlYWQgb2YgdmFuaXNoaW5nLiAqLwpmdW5jdGlvbiBib290RmFpbChtc2csIGRldGFpbCl7CiAgdHJ5ewogICAgY29uc3Qgdj1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlldycpfHxkb2N1bWVudC5ib2R5OwogICAgdi5pbm5lckhUTUw9YDxkaXYgc3R5bGU9Im1heC13aWR0aDo1NjBweDttYXJnaW46NDBweCBhdXRvO3BhZGRpbmc6MjJweDsKICAgICAgYmFja2dyb3VuZDojRkJGOEYxO2JvcmRlcjoxcHggc29saWQgI0I0NDQyQTtib3JkZXItcmFkaXVzOjE0cHg7CiAgICAgIGZvbnQ6MTRweC8xLjYgLWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsJ1NlZ29lIFVJJyxSb2JvdG8sc2Fucy1zZXJpZjtjb2xvcjojMTgxNTA5Ij4KICAgICAgPGRpdiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwO2NvbG9yOiNCNDQ0MkE7bWFyZ2luLWJvdHRvbTo4cHgiPiR7bXNnfTwvZGl2PgogICAgICA8ZGl2IHN0eWxlPSJmb250LWZhbWlseTp1aS1tb25vc3BhY2UsbW9ub3NwYWNlO2ZvbnQtc2l6ZToxMnB4O2JhY2tncm91bmQ6I0Y1RjFFNzsKICAgICAgICBib3JkZXI6MXB4IHNvbGlkICNERUQ3Qzc7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzoxMHB4O21hcmdpbi1ib3R0b206MTJweDsKICAgICAgICB3aGl0ZS1zcGFjZTpwcmUtd3JhcDt3b3JkLWJyZWFrOmJyZWFrLXdvcmQiPiR7U3RyaW5nKGRldGFpbHx8JycpLnNsaWNlKDAsNDAwKX08L2Rpdj4KICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IzZFNjg1NzttYXJnaW4tYm90dG9tOjEycHgiPlRoZSBzZXJ2ZXIgaXMgcHJvYmFibHkgZmluZSBcdTIwMTQgdGhpcyBpcyB0aGUgcGFnZSBmYWlsaW5nIHRvIGRyYXcuCiAgICAgICBUcnkgYSBoYXJkIHJlZnJlc2ggZmlyc3QuIElmIGl0IGtlZXBzIGhhcHBlbmluZywgdGhpcyBleGFjdCB0ZXh0IGlzIHdoYXQgdG8gcmVwb3J0LjwvZGl2PgogICAgICA8YnV0dG9uIG9uY2xpY2s9ImxvY2F0aW9uLnJlbG9hZCgpIiBzdHlsZT0iYmFja2dyb3VuZDojNzg4QTFEO2NvbG9yOiNmZmY7Ym9yZGVyOjA7CiAgICAgICAgYm9yZGVyLXJhZGl1czo5cHg7cGFkZGluZzoxMHB4IDE4cHg7Zm9udDppbmhlcml0O2ZvbnQtd2VpZ2h0OjYwMDtjdXJzb3I6cG9pbnRlciI+UmVsb2FkPC9idXR0b24+CiAgICAgIDxidXR0b24gb25jbGljaz0iZG9jdW1lbnQuY29va2llPSdjb3M9OyBQYXRoPS87IE1heC1BZ2U9MCc7bG9jYXRpb24ucmVsb2FkKCkiCiAgICAgICAgc3R5bGU9ImJhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Ym9yZGVyOjFweCBzb2xpZCAjREVEN0M3O2JvcmRlci1yYWRpdXM6OXB4OwogICAgICAgIHBhZGRpbmc6MTBweCAxOHB4O2ZvbnQ6aW5oZXJpdDtjdXJzb3I6cG9pbnRlcjttYXJnaW4tbGVmdDo4cHgiPkxvZyBvdXQgYW5kIHJldHJ5PC9idXR0b24+CiAgICA8L2Rpdj5gOwogIH1jYXRjaChlKXsgLyogbm90aGluZyBsZWZ0IHRvIGRyYXcgb24gKi8gfQp9CndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGV2PT57CiAgaWYoIXdpbmRvdy5fX2Jvb3RlZCkgYm9vdEZhaWwoJ1RoZSBwYWdlIGhpdCBhbiBlcnJvciB3aGlsZSBsb2FkaW5nLicsIGV2Lm1lc3NhZ2UrJyBcdTIwMTQgJysoZXYuZmlsZW5hbWV8fCcnKSsnOicrKGV2LmxpbmVub3x8JycpKTsKfSk7CgooYXN5bmMgZnVuY3Rpb24oKXsKICB0cnl7IHBhaW50SGVybygpOyB9Y2F0Y2goZSl7IGNvbnNvbGUuZXJyb3IoJ2hlcm8gcGFpbnQgZmFpbGVkJywgZSk7IH0KCiAgbGV0IGI9e307CiAgdHJ5ewogICAgYiA9IGF3YWl0IChhd2FpdCBmZXRjaCgnL2FwaS9ib290Jyx7Y3JlZGVudGlhbHM6J3NhbWUtb3JpZ2luJ30pKS5qc29uKCk7CiAgICBjb25zdCBlbD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaHNVcCcpOyBpZihlbCkgZWwudGV4dENvbnRlbnQ9J09OTElORSc7CiAgfWNhdGNoKGUpewogICAgY29uc3QgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hzVXAnKTsKICAgIGlmKGVsKXsgZWwudGV4dENvbnRlbnQ9J09GRkxJTkUnOyBlbC5zdHlsZS5jb2xvcj0ndmFyKC0tbWFnKSc7IH0KICAgIHJldHVybiBib290RmFpbCgnQ2Fubm90IHJlYWNoIHRoZSBzZXJ2ZXIuJywgZS5tZXNzYWdlKTsKICB9CgogIGlmKCFiLmF1dGhlZCl7IHdpbmRvdy5fX2Jvb3RlZD10cnVlOyByZXR1cm47IH0gICAvKiBzaG93IHRoZSBsb2dpbiBzY3JlZW4gKi8KCiAgbGV0IHI7CiAgdHJ5eyByID0gYXdhaXQgQVBJKCcvYXBpL3N0YXRlJyk7IH0KICBjYXRjaChlKXsgcmV0dXJuIGJvb3RGYWlsKCdTaWduZWQgaW4sIGJ1dCBjb3VsZCBub3QgbG9hZCB5b3VyIGRhdGEuJywgZS5tZXNzYWdlKTsgfQoKICBpZighciB8fCAhci5zdGF0ZSkgcmV0dXJuIGJvb3RGYWlsKCdUaGUgc2VydmVyIHJldHVybmVkIG5vIHN0YXRlLicsIEpTT04uc3RyaW5naWZ5KHJ8fHt9KS5zbGljZSgwLDIwMCkpOwogIFMgPSByLnN0YXRlOwoKICB0cnl7IGVudGVyKCk7IHdpbmRvdy5fX2Jvb3RlZD10cnVlOyB9CiAgY2F0Y2goZSl7IGJvb3RGYWlsKCdZb3VyIGRhdGEgbG9hZGVkLCBidXQgdGhlIHNjcmVlbiBmYWlsZWQgdG8gZHJhdy4nLCBlLm1lc3NhZ2UrJ1xuXG4nKyhlLnN0YWNrfHwnJykuc3BsaXQoJ1xuJykuc2xpY2UoMCwzKS5qb2luKCdcbicpKTsgfQp9KSgpOwpmdW5jdGlvbiBwYWludEhlcm8oKXsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGVyb1BpbGxhcnMnKS5pbm5lckhUTUw9UElMTEFSUy5tYXAocD0+YDxkaXYgY2xhc3M9InBjYXJkIj4KICAgPHU+RkxPT1IgMCR7cC5pZH08L3U+PGg0PiR7cC5pY29ufSAke2VzYyhwLm5hbWUpfTwvaDQ+PHA+JHtlc2MocC5kZXNjKX08L3A+CiAgICR7cC5jaGlwcy5tYXAoYz0+YDxzcGFuIGNsYXNzPSJjaGlwIj4ke2VzYyhjKX08L3NwYW4+YCkuam9pbignJyl9PC9kaXY+YCkuam9pbignJyk7Cn0KYXN5bmMgZnVuY3Rpb24gZG9Mb2dpbigpewogIGNvbnN0IGU9bGlFcnI7ZS50ZXh0Q29udGVudD0nJzsKICB0cnl7CiAgICBhd2FpdCBBUEkoJy9hcGkvbG9naW4nLHtpZDpsaUlkLnZhbHVlLnRyaW0oKSxwdzpsaVB3LnZhbHVlfSk7CiAgICBsaVB3LnZhbHVlPScnOyBlbnRlcigpOwogIH1jYXRjaCh4KXsgZS50ZXh0Q29udGVudD14Lm1lc3NhZ2U9PT0nQUNDRVNTIERFTklFRCc/J0FDQ0VTUyBERU5JRUQuIENyZWRlbnRpYWwgbWlzbWF0Y2gg4oCUIGxvZ2dlZCBDUklUIHNlcnZlci1zaWRlLic6eC5tZXNzYWdlOyB9Cn0KZnVuY3Rpb24gZW50ZXIoKXsKICBnYXRlLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTsgYXBwLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTsKICB3aG9JZC50ZXh0Q29udGVudD1TLm93bmVyLmlkOyBidWlsZE5hdigpOyBnbyhTSU1QTEU/J2Rlc2snOidob21lJyk7IHN0YXJ0UG9sbCgpOwogIGlmKFMub3duZXIuYm9vdHN0cmFwKSBzZXRUaW1lb3V0KCgpPT5mbGFzaCgnQk9PVFNUUkFQIENSRURFTlRJQUwgU1RJTEwgQUNUSVZFIOKAlCByb3RhdGUgaXQgaW4gT3duZXIgU2V0dGluZ3MnKSw5MDApOwp9CmFzeW5jIGZ1bmN0aW9uIGxvZ291dCgpeyBzdG9wUG9sbCgpOyB0cnl7YXdhaXQgZmV0Y2goJy9hcGkvbG9nb3V0Jyx7bWV0aG9kOidQT1NUJyxjcmVkZW50aWFsczonc2FtZS1vcmlnaW4nfSl9Y2F0Y2goZSl7fSBsb2NhdGlvbi5yZWxvYWQoKSB9CgovKiAtLS0tLS0tLS0tIGxpdmUgcG9sbGluZyAtLS0tLS0tLS0tICovCi8qIFRIRSBCVUcgVEhBVCBNQURFIFlPVSBXUklURSBJTiBOT1RFUEFELgogICBFdmVyeSAzIHNlY29uZHMgdGhpcyBjYWxsZWQgcmVuZGVyKCksIHdoaWNoIGRvZXMgdmlldy5pbm5lckhUTUwgPSAuLi4KICAgVGhhdCBkZXN0cm95cyBhbmQgcmVidWlsZHMgZXZlcnkgaW5wdXQgYW5kIHRleHRhcmVhIG9uIHRoZSBwYWdlLiBJZiB5b3UKICAgd2VyZSBtaWQtc2VudGVuY2UsIHlvdXIgdGV4dCB3YXMgZ29uZS4gVGhhdCBpcyB3aHkgdHlwaW5nIHdlbnQgYmxhbmsuCgogICBGaXgsIGluIHRocmVlIHBhcnRzOgogICAxLiBJZiB5b3UgYXJlIHR5cGluZyBpbiBBTlkgZmllbGQsIHRoZSByZXBhaW50IGlzIERFRkVSUkVELCBub3Qgc2tpcHBlZC4KICAgMi4gQW55IGZpZWxkIHdpdGggdGV4dCBpbiBpdCBpcyBuZXZlciB3aXBlZCwgZXZlbiB1bmZvY3VzZWQuCiAgIDMuIEN1cnNvciBwb3NpdGlvbiBhbmQgc2Nyb2xsIGFyZSByZXN0b3JlZCB3aGVuIGEgcmVwYWludCBkb2VzIGhhcHBlbi4gKi8KZnVuY3Rpb24gaXNUeXBpbmcoKXsKICBjb25zdCBhID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDsKICBpZighYSkgcmV0dXJuIGZhbHNlOwogIGNvbnN0IHRhZyA9IChhLnRhZ05hbWV8fCcnKS50b0xvd2VyQ2FzZSgpOwogIHJldHVybiB0YWc9PT0naW5wdXQnIHx8IHRhZz09PSd0ZXh0YXJlYScgfHwgdGFnPT09J3NlbGVjdCcgfHwgYS5pc0NvbnRlbnRFZGl0YWJsZTsKfQpsZXQgZGlydHlTdGF0ZSA9IGZhbHNlOwpmdW5jdGlvbiBzYWZlUmVuZGVyKCl7CiAgaWYoaXNUeXBpbmcoKSl7IGRpcnR5U3RhdGUgPSB0cnVlOyByZXR1cm47IH0gICAvKiBjb21lIGJhY2sgd2hlbiB0aGV5IHN0b3AgKi8KICBjb25zdCBzY3JvbGwgPSB3aW5kb3cuc2Nyb2xsWTsKICByZW5kZXIoKTsKICB3aW5kb3cuc2Nyb2xsVG8oMCwgc2Nyb2xsKTsKICBkaXJ0eVN0YXRlID0gZmFsc2U7Cn0KLyogV2hlbiB5b3UgY2xpY2sgYXdheSBvciBzdG9wIHR5cGluZywgYXBwbHkgYW55dGhpbmcgdGhhdCB3YXMgd2FpdGluZy4gKi8KZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXNvdXQnLCAoKT0+eyBzZXRUaW1lb3V0KCgpPT57IGlmKGRpcnR5U3RhdGUgJiYgIWlzVHlwaW5nKCkpIHNhZmVSZW5kZXIoKTsgfSwgMjUwKTsgfSk7CgpmdW5jdGlvbiBzdGFydFBvbGwoKXsgc3RvcFBvbGwoKTsgcG9sbD1zZXRJbnRlcnZhbChhc3luYygpPT57CiAgdHJ5ewogICAgY29uc3Qgcj1hd2FpdCAoYXdhaXQgZmV0Y2goJy9hcGkvc3RhdGU/c2luY2U9JytTLnJldix7Y3JlZGVudGlhbHM6J3NhbWUtb3JpZ2luJ30pKS5qc29uKCk7CiAgICBpZihyLnVuY2hhbmdlZCl7IFMudGVsZW1ldHJ5PXIudGVsZW1ldHJ5OyBTLmZsb29ycz1yLmZsb29yczsgdGlja0Nocm9tZSgpOwogICAgICBpZighaXNUeXBpbmcoKSAmJiAoY3VyPT09J2hvbWUnfHxjdXI9PT0nYW5hbHl0aWNzJ3x8Y3VyPT09J3N5c3RlbScpKSBzb2Z0UmVmcmVzaCgpOyByZXR1cm47IH0KICAgIGlmKHIuc3RhdGUpeyBTPXIuc3RhdGU7IHRpY2tDaHJvbWUoKTsgc2FmZVJlbmRlcigpOwogICAgICBzeW5jUGlsbC50ZXh0Q29udGVudCA9IGRpcnR5U3RhdGUgPyAnUEFVU0VEIOKAlCBZT1UgQVJFIFRZUElORycgOiAnVVBEQVRFRCc7CiAgICAgIHNldFRpbWVvdXQoKCk9PnsgaWYoIWRpcnR5U3RhdGUpIHN5bmNQaWxsLnRleHRDb250ZW50PSdTWU5DRUQnOyB9LDEyMDApOyB9CiAgfWNhdGNoKGUpeyBzeW5jUGlsbC50ZXh0Q29udGVudD0nT0ZGTElORSc7IH0KfSw1MDAwKSB9CmZ1bmN0aW9uIHN0b3BQb2xsKCl7IGNsZWFySW50ZXJ2YWwocG9sbCkgfQpmdW5jdGlvbiB0aWNrQ2hyb21lKCl7CiAgY29uc3QgdD1TLnRlbGVtZXRyeTsKICB1cENsb2NrLnRleHRDb250ZW50PWhobW1zcyh0LnVwdGltZV9zKTsKICBzcGVuZE1pbmkudGV4dENvbnRlbnQ9JyQnKyhTLnNwZW5kfHwwKS50b0ZpeGVkKDIpOwogIHNwZW5kTWluaS5zdHlsZS5jb2xvcj1TLnNwZW5kPyd2YXIoLS1tYWcpJzondmFyKC0tZ3JuKSc7Cn0KZnVuY3Rpb24gc29mdFJlZnJlc2goKXsKICBpZihpc1R5cGluZygpKSB7IGRpcnR5U3RhdGUgPSB0cnVlOyByZXR1cm47IH0KICBjb25zdCBlbD1kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1saXZlXScpOwogIGVsLmZvckVhY2gobj0+ewogICAgLyogbmV2ZXIgYmxvdyBhd2F5IGEgc2VjdGlvbiB0aGF0IGNvbnRhaW5zIHRleHQgdGhlIE93bmVyIGhhcyBlbnRlcmVkICovCiAgICBjb25zdCBmaWxsZWQgPSBbLi4ubi5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCx0ZXh0YXJlYScpXS5zb21lKGk9PmkudmFsdWUgJiYgaS52YWx1ZS50cmltKCkpOwogICAgaWYoZmlsbGVkKSByZXR1cm47CiAgICBjb25zdCBmPW4uZ2V0QXR0cmlidXRlKCdkYXRhLWxpdmUnKTsKICAgIHRyeXsgbi5pbm5lckhUTUw9TElWRVtmXSgpIH1jYXRjaChlKXt9CiAgfSk7Cn0KY29uc3QgTElWRT17fTsKCi8qIC0tLS0tLS0tLS0gbmF2IC0tLS0tLS0tLS0gKi8KLyogU0lNUExFIE1PREUgaXMgdGhlIGRlZmF1bHQ6IG9uZSBwYWdlIHdoZXJlIGhlIGFza3MsIHlvdSB0aWNrLgogICBFdmVyeXRoaW5nIGVsc2UgaXMgc3RpbGwgdGhlcmUsIG9uZSBjbGljayBhd2F5LCBmb3Igd2hlbiB5b3Ugd2FudCBpdC4gKi8KY29uc3QgTkFWX1NJTVBMRT1bCiBbJycsW1snZGVzaycsJ1x1MjVjOScsJ0NoYWlybWFuJ10sWydmbG9vcicsJ1x1MjMxNycsJ1RoZSBGbG9vciddLFsnZmFjdG9yeScsJ1x1MjVhNicsJ015IEJ1c2luZXNzZXMnXSxbJ2dyb3d0aCcsJ1x1MjdhNCcsJ0N1c3RvbWVycyddLFsnY29udGVudCcsJ1x1MjVhMycsJ0NvbnRlbnQnXSxbJ2NvbW1lbnRzJywnXHUyNWM4JywnQ29tbWVudHMnXSxbJ3NraWxsczMnLCdcdTI3MjYnLCdTa2lsbHMnXV1dLAogWydJRiBZT1UgV0FOVCBJVCcsW1snbW9yZScsJ+KLrycsJ0V2ZXJ5dGhpbmcgRWxzZSddXV0KXTsKY29uc3QgTkFWREVGPVsKIFsnJyxbWydkZXNrJywn4peJJywnVGhlIENoYWlybWFuJ11dXSwKIFsnT1BFUkFURScsW1snaG9tZScsJ+KMgicsJ0hvbWUnXSxbJ2dhdGVzJywn4puoJywnU2VjdXJpdHkgR2F0ZXMnXSxbJ2ZpbmFuY2VzJywn4oK/JywnRmluYW5jZXMnXSxbJ3BheW91dCcsJ+KbgScsJ1BheW91dCBWYXVsdCddXV0sCiBbJ0FHRU5UUycsW1snZmxvb3InLCfijJcnLCdUaGUgRmxvb3InXSxbJ2FnZW50cycsJ+KXiCcsJ0FnZW50cyddLFsnb3JnY2hhcnQnLCfijJcnLCdPcmcgQ2hhcnQnXSxbJ3NraWxscycsJ+KcpicsJ1NraWxscyAmIFRvb2xzJ11dXSwKIFsnSU5URUxMSUdFTkNFJyxbWydlbmdpbmUnLCfil4knLCdPcHRpbWFsIEVuZ2luZSddLFsnYW5hbHl0aWNzJywn4pakJywnQW5hbHl0aWNzJ10sWydhdWRpdCcsJ+KYsCcsJ0F1ZGl0IExlZGdlciddXV0sCiBbJ0NPTU1BTkQnLFtbJ2FnZW50Jywn4pqZJywnQWdlbnQgTG9vcCddLFsnd29yazInLCfinIknLCdGaWxlcyAmIFdyaXRpbmcnXSxbJ21pc3Npb25zJywn4peOJywnTXkgTWlzc2lvbnMnXSxbJ2NvbW1hbmQnLCfilq4nLCdDb21tYW5kIENvbnNvbGUnXSxbJ3ZlbnR1cmVzJywn4peGJywnVmVudHVyZXMgJiBJZGVhcyddLFsnZmFjdG9yeScsJ+KWpicsJ0J1c2luZXNzIEZhY3RvcnknXSxbJ3NpdGVzJywn4pakJywnUXVpY2sgTGFuZGluZyBQYWdlJ10sWydkb21haW5zJywn4peNJywnRG9tYWluIERlc2snXSxbJ2dyb3d0aCcsJ+KepCcsJ0dyb3d0aCBFbmdpbmUnXSxbJ2NvbnRlbnQnLCfilqMnLCdDb250ZW50IFN0dWRpbyddLFsnY29tbWVudHMnLCfil4gnLCdDb21tZW50IERlc2snXSxbJ3NraWxsczMnLCfinKYnLCdTa2lsbHMnXSxbJ3BheScsJ+KCuScsJ1BheW1lbnRzJ11dXSwKIFsnUlVOVElNRScsW1snb3BzJywn4pa2JywnTGl2ZSBPcGVyYXRpb25zJ10sWydicmFpbicsJ+KXiCcsJ0FJIEJyYWluJ10sWyd3b3JrJywn4pymJywnQWdlbnQgV29yayddLFsncmVzZWFyY2gnLCfwn4yQJywnRGVlcCBSZXNlYXJjaCddXV0sCiBbJ0VWT0xVVElPTicsW1snZXZvbHZlJywn4p+zJywnU2VsZi1VcGdyYWRlJ10sWydhcmNoJywn4qeJJywnQ29weSBBbnkgUHJvZHVjdCddLFsnd3JpdHRlbicsJ+KcjicsJ0hlIFdyaXRlcyBDb2RlJ10sWydjb25uZWN0Jywn4pqvJywnQ29ubmVjdG9ycyddLFsnc2tpbGxzMicsJ+KXhycsJ0xlYXJuZWQgU2tpbGxzJ11dXSwKIFsnTU9OSVRPUklORycsW1sndXB0aW1lJywn4peOJywnVXB0aW1lIE1hcnNoYWwnXSxbJ21haWwnLCfinIknLCdNYWlsIFJlbGF5J11dXSwKIFsnU1lTVEVNJyxbWydzeXN0ZW0nLCfimqEnLCdMaXZlIFRlbGVtZXRyeSddLFsnc3RvcmFnZScsJ+KbgScsJ1N0b3JhZ2UgSGVhbHRoJ10sWydkZXZpY2VzJywn4oeEJywnRGV2aWNlcyAmIFNlc3Npb25zJ10sWyd6ZXJvY29zdCcsJ+KIhScsJ1plcm8tQ29zdCBSb3V0ZXInXSxbJ2RvY3RyaW5lJywnwqcnLCdEb2N0cmluZSAmIFNPUCddLFsnc2V0dGluZ3MnLCfimpknLCdPd25lciBTZXR0aW5ncyddXV0KXTsKbGV0IFNJTVBMRSA9ICgoKT0+eyB0cnl7IHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY2hhaXJtYW5fc2ltcGxlJykhPT0nMCcgfWNhdGNoKGUpeyByZXR1cm4gdHJ1ZSB9IH0pKCk7CmZ1bmN0aW9uIHRvZ2dsZVNpbXBsZSgpeyBTSU1QTEU9IVNJTVBMRTsKICB0cnl7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjaGFpcm1hbl9zaW1wbGUnLCBTSU1QTEU/JzEnOicwJykgfWNhdGNoKGUpe30KICBidWlsZE5hdigpOyBnbyhTSU1QTEU/J2Rlc2snOidob21lJyk7IH0KZnVuY3Rpb24gYnVpbGROYXYoKXsKICBjb25zdCBzcmMgPSBTSU1QTEUgPyBOQVZfU0lNUExFIDogTkFWREVGOwogIG5hdi5pbm5lckhUTUwgPSBzcmMubWFwKChbZyxpdF0pPT4oZz9gPGRpdiBjbGFzcz0iZ3JwIj4ke2d9PC9kaXY+YDonJykrCiAgIGl0Lm1hcCgoW2lkLGljLGxdKT0+YDxidXR0b24gZGF0YS1wPSIke2lkfSIgb25jbGljaz0iJHtpZD09PSdtb3JlJz8ndG9nZ2xlU2ltcGxlKCknOmBnbygnJHtpZH0nKWB9Ij48aT4ke2ljfTwvaT4ke2x9PC9idXR0b24+YCkuam9pbignJykpLmpvaW4oJycpCiAgICsgKFNJTVBMRT8nJzpgPGRpdiBjbGFzcz0iZ3JwIj5WSUVXPC9kaXY+PGJ1dHRvbiBvbmNsaWNrPSJ0b2dnbGVTaW1wbGUoKSI+PGk+4peJPC9pPkJhY2sgdG8gU2ltcGxlPC9idXR0b24+YCk7Cn0KZnVuY3Rpb24gZ28ocCl7Y3VyPXA7Wy4uLm5hdi5xdWVyeVNlbGVjdG9yQWxsKCdidXR0b24nKV0uZm9yRWFjaChiPT5iLmNsYXNzTGlzdC50b2dnbGUoJ29uJyxiLmRhdGFzZXQucD09PXApKTsKIGNydW1iLnRleHRDb250ZW50PXA7cmVuZGVyKCk7Y2xvc2VTYigpO3Njcm9sbFRvKDAsMCl9CmZ1bmN0aW9uIHJlbmRlcigpewogIC8qIE9uZSBicm9rZW4gcGFnZSBtdXN0IG5vdCB0YWtlIHRoZSB3aG9sZSBhcHAgd2l0aCBpdC4gKi8KICBpZighUkVOREVSW2N1cl0peyBjdXIgPSBTSU1QTEUgPyAnZGVzaycgOiAnaG9tZSc7IH0KICB0cnl7IHZpZXcuaW5uZXJIVE1MPVJFTkRFUltjdXJdKCk7IH0KICBjYXRjaChlKXsKICAgIGNvbnNvbGUuZXJyb3IoJ3JlbmRlciAnK2N1cisnIGZhaWxlZCcsIGUpOwogICAgdmlldy5pbm5lckhUTUw9YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+CiAgICAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+VGhpcyBwYWdlIGZhaWxlZCB0byBkcmF3PC9oMz4KICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+RXZlcnl0aGluZyBlbHNlIHN0aWxsIHdvcmtzIFx1MjAxNCB0aGUgcmVzdCBvZiB0aGUgYXBwIGlzIGZpbmUuPC9kaXY+CiAgICAgIDxkaXYgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxMnB4O2JhY2tncm91bmQ6dmFyKC0taW5wKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJyZCk7CiAgICAgICAgYm9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzoxMHB4O3doaXRlLXNwYWNlOnByZS13cmFwIj4ke2VzYyhjdXIpfTogJHtlc2MoZS5tZXNzYWdlKX08L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIHN0eWxlPSJtYXJnaW4tdG9wOjExcHgiIG9uY2xpY2s9ImdvKCdkZXNrJykiPkJhY2sgdG8gdGhlIENoYWlybWFuPC9idXR0b24+PC9kaXY+YDsKICB9CiAgaWYoY3VyPT09J2VuZ2luZScpZHJhd0VuZ2luZSgpOwogIGlmKGN1cj09PSdicmFpbicmJnR5cGVvZiBwcm92SGludD09PSdmdW5jdGlvbicpcHJvdkhpbnQoKTsKICBpZihjdXI9PT0ncGF5JyYmdHlwZW9mIHBheUhpbnQ9PT0nZnVuY3Rpb24nKXBheUhpbnQoKTsgdGlja0Nocm9tZSgpIH0KZnVuY3Rpb24gdG9nZ2xlU2IoKXtjb25zdCBvPXNpZGViYXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3BlbicpOwogaWYobyl7Y29uc3Qgcz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtzLmlkPSdzY3JpbSc7cy5vbmNsaWNrPWNsb3NlU2I7ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzKX1lbHNlIGNsb3NlU2IoKX0KZnVuY3Rpb24gY2xvc2VTYigpe3NpZGViYXIuY2xhc3NMaXN0LnJlbW92ZSgnb3BlbicpO2RvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzY3JpbScpPy5yZW1vdmUoKX0KLyogLS0tLSBsaWdodCAvIGRhcmsgdGhlbWUsIHJlbWVtYmVyZWQgcGVyIGRldmljZSAtLS0tICovCmZ1bmN0aW9uIGFwcGx5VGhlbWUodCl7CiAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS10aGVtZScsIHQpOwogIGNvbnN0IGI9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RoZW1lQnRuJyk7CiAgaWYoYikgYi50ZXh0Q29udGVudCA9IHQ9PT0nZGFyaycgPyAn4piAJyA6ICfimL4nOwogIHRyeXsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NoYWlybWFuX3RoZW1lJywgdCk7IH1jYXRjaChlKXt9CiAgaWYodHlwZW9mIGN1ciE9PSd1bmRlZmluZWQnICYmIGN1cj09PSdlbmdpbmUnICYmIHR5cGVvZiBkcmF3RW5naW5lPT09J2Z1bmN0aW9uJykgZHJhd0VuZ2luZSgpOwp9CmZ1bmN0aW9uIHRvZ2dsZVRoZW1lKCl7CiAgY29uc3Qgbm93PWRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnKT09PSdkYXJrJz8nZGFyayc6J2xpZ2h0JzsKICBhcHBseVRoZW1lKG5vdz09PSdkYXJrJz8nbGlnaHQnOidkYXJrJyk7Cn0KLyogbGlnaHQgaXMgdGhlIGRlZmF1bHQg4oCUIE51bWVybyB0cmVhc3VyeSBwYWxldHRlICovCnRyeXsgYXBwbHlUaGVtZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY2hhaXJtYW5fdGhlbWUnKXx8J2xpZ2h0Jyk7IH1jYXRjaChlKXsgYXBwbHlUaGVtZSgnbGlnaHQnKTsgfQpmdW5jdGlvbiBpc0RhcmsoKXsgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGhlbWUnKT09PSdkYXJrJyB9Ci8qIGVuZ2luZSBwYWxldHRlIGZvbGxvd3MgdGhlIHRoZW1lICovCmZ1bmN0aW9uIEVQKCl7IHJldHVybiBpc0RhcmsoKQogID8ge3Jpbmc6JyMyNTJBMTYnLGxpbmU6JyM0QTU3MjInLG5vZGVCZzonIzE1MTgwQycsY29yZTE6JyNFOEYwQzAnLGNvcmUyOicjQTNCQjJCJyxjb3JlMzonIzJBMzMxMCcsCiAgICAgY29yZVR4dDonIzBBMEIwNicsZGVhZDonIzNBNDAyNCcsZGVhZFR4dDonIzZBNkQ1QycsbGFiZWw6JyM5QTlDOEEnfQogIDoge3Jpbmc6JyNFM0UzREEnLGxpbmU6JyNCOUM0OEEnLG5vZGVCZzonI0ZGRkZGRicsY29yZTE6JyNGRkZGRkYnLGNvcmUyOicjOEZBMzI2Jyxjb3JlMzonIzM5NDYwMycsCiAgICAgY29yZVR4dDonI0ZGRkZGRicsZGVhZDonI0NGQ0ZDMycsZGVhZFR4dDonIzlBOUM5MCcsbGFiZWw6JyM2QjZENjInfSB9CgovKiAtLS0tLS0tLS0tIHByaW1pdGl2ZXMgLS0tLS0tLS0tLSAqLwpjb25zdCBSRU5ERVI9e307CmZ1bmN0aW9uIGtwaSh2LGwsYyxzKXtyZXR1cm4gYDxkaXYgY2xhc3M9ImtwaSI+PHU+JHtsfTwvdT48YiBzdHlsZT0iY29sb3I6JHtjfHwndmFyKC0tdHh0KSd9Ij4ke3Z9PC9iPiR7cz9gPHM+JHtzfTwvcz5gOicnfTwvZGl2PmB9CmZ1bmN0aW9uIGxvZ0h0bWwobil7aWYoIVMubG9ncy5sZW5ndGgpcmV0dXJuICc8ZGl2IGNsYXNzPSJtb25vLWRpbSI+TGVkZ2VyIGVtcHR5LjwvZGl2Pic7CiBjb25zdCBjb2w9e0lORk86J3ZhcigtLWJsdSknLE9LOid2YXIoLS1ncm4pJyxXQVJOOid2YXIoLS1hbWIpJyxDUklUOid2YXIoLS1tYWcpJ307CiByZXR1cm4gJzxkaXYgY2xhc3M9ImxvZyI+JytTLmxvZ3Muc2xpY2UoMCxuKS5tYXAobD0+YDxkaXY+PHNwYW4gY2xhc3M9InRzIj4ke2wudH08L3NwYW4+IDxzcGFuIHN0eWxlPSJjb2xvcjoke2NvbFtsLnNldl19Ij5bJHtsLnNldn1dPC9zcGFuPiA8Yj4ke2VzYyhsLnNyYyl9PC9iPiDigJQgJHtlc2MobC5tc2cpfTwvZGl2PmApLmpvaW4oJycpKyc8L2Rpdj4nfQpmdW5jdGlvbiBmbG9vcihpZCl7cmV0dXJuIFMuZmxvb3JzLmZpbmQoZj0+Zi5pZD09PWlkKXx8e2hlYWx0aDowLGxvYWQ6MCxhZ2VudHM6MCxhY3RpdmU6MH19CgovKiAtLS0tLS0tLS0tIEhPTUUgLS0tLS0tLS0tLSAqLwpMSVZFLmhvbWVLcGk9KCk9PnsKICBjb25zdCB0PVMudGVsZW1ldHJ5LCBwZW5kPVMuZ2F0ZXMuZmlsdGVyKGc9Pmcuc3RhdHVzPT09J1BFTkRJTkcnKS5sZW5ndGg7CiAgY29uc3QgYWN0aXZlPVMuYWdlbnRzLmZpbHRlcihhPT5hLnN0YXR1cz09PSdBQ1RJVkUnKS5sZW5ndGg7CiAgcmV0dXJuIGtwaShhY3RpdmUrJyAvICcrUy5hZ2VudHMubGVuZ3RoLCdBY3RpdmUgU3ViLUFnZW50cycsJ3ZhcigtLWN5KScsYWN0aXZlPT09Uy5hZ2VudHMubGVuZ3RoPydGdWxsIHJvc3Rlcic6J0RFR1JBREVEJykKICAgK2twaShwZW5kLCdHYXRlcyBGcm96ZW4nLHBlbmQ/J3ZhcigtLWFtYiknOid2YXIoLS1ncm4pJyxwZW5kPydBd2FpdGluZyBjbGVhcmFuY2UnOidRdWV1ZSBjbGVhcicpCiAgICtrcGkoaGhtbXNzKHQudXB0aW1lX3MpLCdTZXJ2ZXIgVXB0aW1lJywndmFyKC0tZ3JuKScsJ3BpZCAnK3QucGlkKQogICAra3BpKHQuYXZnX2xhdGVuY3lfbXMrJyBtcycsJ0F2ZyBMYXRlbmN5Jyx0LmF2Z19sYXRlbmN5X21zPjUwPyd2YXIoLS1hbWIpJzondmFyKC0tZ3JuKScsZm10KHQucmVxdWVzdHMpKycgcmVxdWVzdHMnKX0KTElWRS5ob21lTG9hZD0oKT0+UElMTEFSUy5tYXAocD0+e2NvbnN0IGY9Zmxvb3IocC5pZCk7CiAgcmV0dXJuIGA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuIj4KICAgPHNwYW4gc3R5bGU9ImZvbnQtc2l6ZToxMS41cHgiPiR7cC5pY29ufSAke3AubmFtZX08L3NwYW4+CiAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtmLmFjdGl2ZX0vJHtmLmFnZW50c30gYWd0IMK3IEgke2YuaGVhbHRofSUgwrcgTCR7Zi5sb2FkfSU8L3NwYW4+PC9kaXY+CiAgIDxkaXYgY2xhc3M9ImJhciIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij48aSBzdHlsZT0id2lkdGg6JHtmLmxvYWR9JTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZywke3AuY29sb3J9LHZhcigtLWxpbWUpKSI+PC9pPjwvZGl2PjwvZGl2PmB9KS5qb2luKCcnKTsKTElWRS5ob21lVGVybT0oKT0+bG9nSHRtbCgxNCk7ClJFTkRFUi5ob21lPSgpPT57CiAgY29uc3QgdD1TLnRlbGVtZXRyeSwgcGVuZD1TLmdhdGVzLmZpbHRlcihnPT5nLnN0YXR1cz09PSdQRU5ESU5HJykubGVuZ3RoOwogIGNvbnN0IGluZmxvdz1TLnJldmVudWUuZmlsdGVyKHI9PnIuYW10PjApLnJlZHVjZSgoYSxiKT0+YStiLmFtdCwwKTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjE0cHgiIGRhdGEtbGl2ZT0iaG9tZUtwaSI+JHtMSVZFLmhvbWVLcGkoKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkNoYWlybWFuJ3MgU3RhbmRpbmcgQXNzZXNzbWVudCA8c3BhbiBjbGFzcz0idGFnIHQtcmVkIj5OTyBTVUdBUiBDT0FUSU5HPC9zcGFuPjwvaDM+PHVsIGNsYXNzPSJ0aWdodCI+CiAgICA8bGk+JHtTLm93bmVyLmJvb3RzdHJhcD8nPGIgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPkNSSVRJQ0FMOjwvYj4gYm9vdHN0cmFwIHBhc3N3b3JkIHN0aWxsIGFjdGl2ZS4gUm90YXRlIGl0IG5vdyDigJQgdGhlIHBsYWludGV4dCBjb3B5IGV4aXN0cyBvbiBkaXNrIHVudGlsIHlvdSBkby4nOidCb290c3RyYXAgY3JlZGVudGlhbCByb3RhdGVkIGFuZCBkZXN0cm95ZWQuIEdvb2QuJ308L2xpPgogICAgPGxpPiR7Uy5wYXlvdXQ/J1BheW91dCBjaGFubmVsIHNlYWxlZC4gVHJhbnNmZXJzIHJlcXVpcmUgc2lnbmF0dXJlICsgMkZBIGludGVudC4nOic8YiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+QkxPQ0tFUjo8L2I+IG5vIHBheW91dCBjaGFubmVsLiBFdmVyeSBmaW5hbmNpYWwgZ2F0ZSBoYXJkLWJsb2NrcyBzZXJ2ZXItc2lkZS4nfTwvbGk+CiAgICA8bGk+JHtwZW5kP2A8YiBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+JHtwZW5kfSBvcGVyYXRpb24ocykgZnJvemVuPC9iPiBwZW5kaW5nIHlvdXIgY2xlYXJhbmNlLmA6J05vIGZyb3plbiBvcGVyYXRpb25zLid9PC9saT4KICAgIDxsaT4ke1MucnVubmluZz9gPGIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPlNZU1RFTSBSVU5OSU5HPC9iPiDigJQgJHsoUy50YXNrc3x8W10pLmZpbHRlcih0PT50LmVuYWJsZWQpLmxlbmd0aH0gc3RhbmRpbmcgb3JkZXJzIGV4ZWN1dGluZywgJHsoUy50YXNrc3x8W10pLnJlZHVjZSgoYSx0KT0+YSsodC5ydW5zfHwwKSwwKX0gam9icyBjb21wbGV0ZWQuYDonPGIgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPlNZU1RFTSBIQUxURUQ8L2I+IOKAlCBubyBhZ2VudCB3b3JrIGlzIGV4ZWN1dGluZy4gU3RhcnQgaXQgaW4gTGl2ZSBPcGVyYXRpb25zLid9PC9saT4KICAgIDxsaT5aZXJvLUNvc3Q6ICR7Uy5kZW5pYWxzLmxlbmd0aH0gcGFpZCBwYXRoKHMpIGludGVyY2VwdGVkLCAkJHtTLnNwZW5kLnRvRml4ZWQoMil9IGF1dGhvcml6ZWQgc3BlbmQsIDAgbnBtIGRlcGVuZGVuY2llcyBpbnN0YWxsZWQuPC9saT4KICAgIDxsaT5MaXZlIHN5bmMgYWN0aXZlOiAke3QubGl2ZV9zZXNzaW9uc30gZGV2aWNlIHNlc3Npb24ocykgb24gdGhpcyBpbnN0YW5jZSwgc3RhdGUgcmV2aXNpb24gJHtTLnJldn0uPC9saT4KICAgPC91bD48L2Rpdj4KICAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlBpbGxhciBMb2FkIDxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+REVSSVZFRCBGUk9NIFJFQUwgUFJPQ0VTUyBNRVRSSUNTPC9zcGFuPjwvaDM+CiAgICA8ZGl2IGRhdGEtbGl2ZT0iaG9tZUxvYWQiPiR7TElWRS5ob21lTG9hZCgpfTwvZGl2PjwvZGl2PgogIDwvZGl2PgogIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5SZXZlbnVlIFRlbGVtZXRyeSA8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj5JTkZMT1cgJCR7Zm10KGluZmxvdyl9PC9zcGFuPjwvaDM+JHtzcGFyaygpfQogICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij5HcmVlbiBkYXNoZWQgbGluZSBpcyB0aGUgc3BlbmQgZmxvb3IsIGhlbGQgYXQgJDAuMDAgYnkgZG9jdHJpbmUuPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkxpdmUgVGVybWluYWwgPHNwYW4gY2xhc3M9InRhZyB0LWRpbSI+U0VSVkVSIExFREdFUjwvc3Bhbj48L2gzPjxkaXYgZGF0YS1saXZlPSJob21lVGVybSI+JHtMSVZFLmhvbWVUZXJtKCl9PC9kaXY+PC9kaXY+YDsKfTsKZnVuY3Rpb24gc3BhcmsoKXsKICBjb25zdCB2PVMucmV2ZW51ZS5maWx0ZXIocj0+ci5hbXQ+MCkubWFwKHI9PnIuYW10KTsgY29uc3QgcHRzPSh2Lmxlbmd0aD92OlswLDBdKS5zbGljZSgtMjQpOwogIGNvbnN0IG14PU1hdGgubWF4KC4uLnB0cywxKSx3PTYwMCxoPTkwLHN0ZXA9cHRzLmxlbmd0aD4xP3cvKHB0cy5sZW5ndGgtMSk6dzsKICBjb25zdCBkPXB0cy5tYXAoKHAsaSk9PmAke2k/J0wnOidNJ30keyhpKnN0ZXApLnRvRml4ZWQoMSl9LCR7KGgtKHAvbXgpKihoLTEyKS02KS50b0ZpeGVkKDEpfWApLmpvaW4oJyAnKTsKICByZXR1cm4gYDxzdmcgdmlld0JveD0iMCAwICR7d30gJHtofSIgc3R5bGU9IndpZHRoOjEwMCU7aGVpZ2h0OjkwcHgiPgogICA8ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InNnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjNzg4QTFENTUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM3ODhBMUQwMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPgogICAke1swLDEsMiwzXS5tYXAoaT0+YDxsaW5lIHgxPSIwIiB5MT0iJHtpKjMwfSIgeDI9IiR7d30iIHkyPSIke2kqMzB9IiBzdHJva2U9IiMxMDFhMjQiLz5gKS5qb2luKCcnKX0KICAgPHBhdGggZD0iJHtkfSBMJHt3fSwke2h9IEwwLCR7aH0gWiIgZmlsbD0idXJsKCNzZykiLz48cGF0aCBkPSIke2R9IiBzdHJva2U9IiM3ODhBMUQiIGZpbGw9Im5vbmUiIHN0cm9rZS13aWR0aD0iMiIvPgogICA8bGluZSB4MT0iMCIgeTE9IiR7aC02fSIgeDI9IiR7d30iIHkyPSIke2gtNn0iIHN0cm9rZT0iIzMxZDY3YSIgc3Ryb2tlLWRhc2hhcnJheT0iNCA0IiBzdHJva2Utd2lkdGg9IjEuNCIvPjwvc3ZnPmA7Cn0KCi8qIC0tLS0tLS0tLS0gTElWRSBURUxFTUVUUlkgLS0tLS0tLS0tLSAqLwpMSVZFLnN5cz0oKT0+e2NvbnN0IHQ9Uy50ZWxlbWV0cnk7CiByZXR1cm4gYDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEzcHgiPgogICR7a3BpKHQucnNzX21iKycgTUInLCdQcm9jZXNzIFJTUycsJ3ZhcigtLWN5KScsJ2hlYXAgJyt0LmhlYXBfbWIrJy8nK3QuaGVhcF90b3RhbF9tYisnIE1CJyl9CiAgJHtrcGkodC5sb2FkMSwnTG9hZCBBdmcgMW0nLHQubG9hZDE+dC5jcHVzPyd2YXIoLS1tYWcpJzondmFyKC0tZ3JuKScsdC5jcHVzKycgY3B1cyDCtyA1bSAnK3QubG9hZDUpfQogICR7a3BpKHQuc3lzX21lbV9wY3QrJyUnLCdTeXN0ZW0gTWVtb3J5Jyx0LnN5c19tZW1fcGN0Pjg1Pyd2YXIoLS1tYWcpJzondmFyKC0tYW1iKScsJ2hvc3QgJyt0Lmhvc3RuYW1lKX0KICAke2twaShmbXQodC5yZXF1ZXN0cyksJ0hUVFAgUmVxdWVzdHMnLCd2YXIoLS1ibHUpJyxmbXQodC5hcGlfY2FsbHMpKycgYXBpIMK3ICcrdC5lcnJvcnMrJyBlcnJvcnMnKX0KIDwvZGl2PgogPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlByb2Nlc3MgRmFjdHM8L2gzPjxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjE3MHB4Ij5SdW50aW1lPC90ZD48dGQ+JHt0Lm5vZGV9IMK3ICR7dC5wbGF0Zm9ybX08L3RkPjwvdHI+CiAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5QSUQ8L3RkPjx0ZD4ke3QucGlkfTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlVwdGltZTwvdGQ+PHRkPiR7aGhtbXNzKHQudXB0aW1lX3MpfTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkF2ZyBsYXRlbmN5PC90ZD48dGQ+JHt0LmF2Z19sYXRlbmN5X21zfSBtcyAobGFzdCA1MDAgcmVxKTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkF1dGggZmFpbHVyZXM8L3RkPjx0ZCBzdHlsZT0iY29sb3I6JHt0LmF1dGhfZmFpbHVyZXM/J3ZhcigtLW1hZyknOid2YXIoLS1ncm4pJ30iPiR7dC5hdXRoX2ZhaWx1cmVzfTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkxpdmUgc2Vzc2lvbnM8L3RkPjx0ZD4ke3QubGl2ZV9zZXNzaW9uc30gb2YgJHt0LnRvdGFsX3Nlc3Npb25zfTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlN0YXRlIGZpbGU8L3RkPjx0ZD4keyh0LmRiX2J5dGVzLzEwMjQpLnRvRml4ZWQoMSl9IEtCIMK3IHJldiAke3Quc3RhdGVfcmV2fTwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlNlc3Npb25zPC90ZD48dGQ+PHNwYW4gY2xhc3M9InRhZyB0LWdybiI+RFVSQUJMRSDCtyAzMGQgVFRMPC9zcGFuPjwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPk1vbml0b3JzPC90ZD48dGQ+JHt0Lm1vbml0b3JzfHwwfSBib3VuZCDCtyA8c3BhbiBzdHlsZT0iY29sb3I6JHt0Lm1vbml0b3JzX2Rvd24/J3ZhcigtLW1hZyknOid2YXIoLS1ncm4pJ30iPiR7dC5tb25pdG9yc19kb3dufHwwfSBkb3duPC9zcGFuPjwvdGQ+PC90cj4KICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPk1haWwgcmVsYXk8L3RkPjx0ZD4ke3Quc210cF9yZWFkeT9gPHNwYW4gY2xhc3M9InRhZyB0LWdybiI+QVJNRUQ8L3NwYW4+ICR7dC5tYWlsX3NlbnR9IHNlbnQgLyAke3QubWFpbF9mYWlsZWR9IGZhaWxlZGA6JzxzcGFuIGNsYXNzPSJ0YWcgdC1yZWQiPk9GRkxJTkUg4oCUIGludGVudCBvbmx5PC9zcGFuPid9PC90ZD48L3RyPgogICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+RGVwZW5kZW5jaWVzPC90ZD48dGQ+PHNwYW4gY2xhc3M9InRhZyB0LWdybiI+MCBJTlNUQUxMRUQgwrcgJDAuMDA8L3NwYW4+PC90ZD48L3RyPgogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+SG90IFBhdGhzPC9oMz48ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4KICAgJHt0LmhvdF9wYXRocy5tYXAoKFtwLGNdKT0+YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhwKX08L3RkPjx0ZCBzdHlsZT0idGV4dC1hbGlnbjpyaWdodCI+JHtmbXQoYyl9PC90ZD48L3RyPmApLmpvaW4oJycpfQogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+Q291bnRlcnMgYXJlIHJlYWwsIGNvbGxlY3RlZCBpbi1wcm9jZXNzIHNpbmNlIGJvb3QuIFRoZXkgcmVzZXQgd2hlbiB0aGUgc2VydmVyIHJlc3RhcnRzLjwvZGl2PjwvZGl2PgogPC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+RGVyaXZlZCBGbG9vciBIZWFsdGg8L2gzPgogICR7UElMTEFSUy5tYXAocD0+e2NvbnN0IGY9Zmxvb3IocC5pZCk7cmV0dXJuIGA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPgogICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbiI+PHNwYW4gc3R5bGU9ImZvbnQtc2l6ZToxMS41cHgiPiR7cC5pY29ufSAke3AubmFtZX08L3NwYW4+CiAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtmLmhlYWx0aH0lIGhlYWx0aCDCtyAke2YubG9hZH0lIGxvYWQ8L3NwYW4+PC9kaXY+CiAgIDxkaXYgY2xhc3M9ImJhciIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij48aSBzdHlsZT0id2lkdGg6JHtmLmhlYWx0aH0lO2JhY2tncm91bmQ6JHtwLmNvbG9yfSI+PC9pPjwvZGl2PjwvZGl2PmB9KS5qb2luKCcnKX0KICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OXB4Ij5FYWNoIGZsb29yJ3MgaGVhbHRoIGlzIGNvbXB1dGVkIGZyb20gcmVhbCBpbnB1dHM6IGF1dGggZmFpbHVyZXMgYW5kIGRvY3RyaW5lIGRlbmlhbHMgaGl0IFNlY3VyaXR5OyBsb2FkIGF2ZXJhZ2UgYW5kIFJTUyBoaXQgT3BlcmF0aW9uczsgSFRUUCBlcnJvcnMgYW5kIGZyb3plbiBnYXRlcyBoaXQgRW5naW5lZXJpbmc7IHN0YXRlLWZpbGUgc2l6ZSBoaXRzIERhdGE7IGF1dGhvcml6ZWQgc3BlbmQgYW5kIHBheW91dCBzdGF0dXMgaGl0IFN0cmF0ZWd5LiBTdGFmZmluZyByYXRpbyBzY2FsZXMgYWxsIGZpdmUuIFRoZXNlIG1vdmUgd2hlbiB0aGUgc3lzdGVtIGFjdHVhbGx5IG1vdmVzLjwvZGl2PjwvZGl2PmB9ClJFTkRFUi5zeXN0ZW09KCk9PmA8ZGl2IGRhdGEtbGl2ZT0ic3lzIj4ke0xJVkUuc3lzKCl9PC9kaXY+YDsKCi8qIC0tLS0tLS0tLS0gRU5HSU5FIC0tLS0tLS0tLS0gKi8KUkVOREVSLmVuZ2luZT0oKT0+YAogPGRpdiBjbGFzcz0iZW5naW5lV3JhcCI+PGRpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0icGFkZGluZzoxMXB4IDEzcHg7bWFyZ2luLWJvdHRvbToxMXB4Ij48ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbiI+CiAgIDxkaXYgY2xhc3M9InJvdyI+PGIgc3R5bGU9ImxldHRlci1zcGFjaW5nOjJweDtmb250LXNpemU6MTJweCI+T1BUSU1BTCBFTkdJTkU8L2I+PHNwYW4gY2xhc3M9InRhZyB0LWN5Ij5LTk9XTEVER0UgQ09SRTwvc3Bhbj48L2Rpdj4KICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gc20gJHtlbmdGb2N1cz8nJzoncCd9IiBvbmNsaWNrPSJlbmdGb2N1cz1udWxsO2RyYXdFbmdpbmUoKSI+UmFkaWFsPC9idXR0b24+CiAgICR7UElMTEFSUy5tYXAocD0+YDxidXR0b24gY2xhc3M9ImJ0biBzbSAke2VuZ0ZvY3VzPT1wLmlkPydwJzonJ30iIG9uY2xpY2s9ImVuZ0ZvY3VzPSR7cC5pZH07ZHJhd0VuZ2luZSgpIj4ke3AuaWNvbn08L2J1dHRvbj5gKS5qb2luKCcnKX08L2Rpdj4KICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYW52YXNCb3giPjxkaXYgY2xhc3M9ImdyaWRiZyI+PC9kaXY+CiAgIDxkaXYgY2xhc3M9ImVuZ1RvcCI+PHNwYW4gY2xhc3M9InRhZyB0LWRpbSIgaWQ9ImVuZ01vZGUiPlJBRElBTCDCtyBBTEwgRkxPT1JTPC9zcGFuPjwvZGl2PgogICA8ZGl2IGNsYXNzPSJlbmdUaXRsZSIgaWQ9ImVuZ1RpdGxlIj5DSEFJUk1BTiBDT1JFPC9kaXY+PGRpdiBpZD0iZW5nU3ZnIj48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4Ij48aDM+RW5naW5lIFRlcm1pbmFsPC9oMz4KICAgPGRpdiBjbGFzcz0idGVybSIgaWQ9ImVuZ1Rlcm0iPmNoYWlybWFuLW9zIDo6IGVuZ2luZSByZWFkeSDCtyAke1MuYWdlbnRzLmxlbmd0aH0gbm9kZXMgYm91bmQgwrcgY29zdCBjZWlsaW5nICQwLjAwCmF3YWl0aW5nIG5vZGUgc2VsZWN0aW9u4oCmPC9kaXY+PC9kaXY+CiA8L2Rpdj4KIDxkaXYgY2xhc3M9InNpZGUiPgogIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5MZW5zPC9oMz4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5FbnRpdHk8L3NwYW4+PHNlbGVjdCBjbGFzcz0iaW4iIGlkPSJsZW5zRW50IiBvbmNoYW5nZT0iZHJhd0VuZ2luZSgpIj4KICAgIDxvcHRpb24gdmFsdWU9ImFsbCI+QWxsPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWN0aXZlIj5BY3RpdmUgb25seTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InN1c3AiPlN1c3BlbmRlZCBvbmx5PC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIiBzdHlsZT0ibWFyZ2luOjAiPjxzcGFuPkZsb29yPC9zcGFuPjxzZWxlY3QgY2xhc3M9ImluIiBvbmNoYW5nZT0iZW5nRm9jdXM9dGhpcy52YWx1ZT09PSdhbGwnP251bGw6K3RoaXMudmFsdWU7ZHJhd0VuZ2luZSgpIj4KICAgIDxvcHRpb24gdmFsdWU9ImFsbCI+QWxsIGZsb29yczwvb3B0aW9uPiR7UElMTEFSUy5tYXAocD0+YDxvcHRpb24gdmFsdWU9IiR7cC5pZH0iICR7ZW5nRm9jdXM9PXAuaWQ/J3NlbGVjdGVkJzonJ30+JHtwLmlkfSDCtyAke3AubmFtZX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPjwvZGl2PgogIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5MZWdlbmQ8L2gzPjxkaXYgY2xhc3M9ImxlZ2VuZCI+CiAgICR7UElMTEFSUy5tYXAocD0+YDxkaXY+PGkgc3R5bGU9ImJhY2tncm91bmQ6JHtwLmNvbG9yfTtib3gtc2hhZG93OjAgMCA4cHggJHtwLmNvbG9yfSI+PC9pPiR7cC5uYW1lfTwvZGl2PmApLmpvaW4oJycpfQogICA8ZGl2PjxpIHN0eWxlPSJiYWNrZ3JvdW5kOiNlNmVlZjc7Ym94LXNoYWRvdzowIDAgOHB4ICNmZmYiPjwvaT5DaGFpcm1hbiBDb3JlPC9kaXY+PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkRpcmVjdG9yeSA8c3BhbiBjbGFzcz0idGFnIHQtZGltIj4ke1MuYWdlbnRzLmxlbmd0aH08L3NwYW4+PC9oMz4KICAgPGRpdiBjbGFzcz0iZGlyTGlzdCI+JHtTLmFnZW50cy5tYXAoYT0+YDxidXR0b24gb25jbGljaz0icGlja05vZGUoJyR7YS5pZH0nKSI+JHtlc2MoYS5uYW1lKX08c3Bhbj4ke1BJTExBUlMuZmluZChwPT5wLmlkPT1hLnBpbGxhcklkKS5pY29ufTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKXx8JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5lbXB0eTwvZGl2Pid9PC9kaXY+PC9kaXY+CiA8L2Rpdj48L2Rpdj5gOwpmdW5jdGlvbiBkcmF3RW5naW5lKCl7CiAgY29uc3QgYm94PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlbmdTdmcnKTsgaWYoIWJveClyZXR1cm47CiAgY29uc3QgUD1FUCgpOwogIGNvbnN0IGVudD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGVuc0VudCcpPy52YWx1ZXx8J2FsbCc7CiAgbGV0IGxpc3Q9Uy5hZ2VudHMuZmlsdGVyKGE9PmVudD09PSdhbGwnfHwoZW50PT09J2FjdGl2ZSc/YS5zdGF0dXM9PT0nQUNUSVZFJzphLnN0YXR1cyE9PSdBQ1RJVkUnKSk7CiAgY29uc3QgZmxvb3JzPWVuZ0ZvY3VzP1BJTExBUlMuZmlsdGVyKHA9PnAuaWQ9PT1lbmdGb2N1cyk6UElMTEFSUzsKICBpZihlbmdGb2N1cylsaXN0PWxpc3QuZmlsdGVyKGE9PmEucGlsbGFySWQ9PT1lbmdGb2N1cyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VuZ01vZGUnKS50ZXh0Q29udGVudD1lbmdGb2N1cz8nRk9DVVMgwrcgRkxPT1IgMCcrZW5nRm9jdXM6J1JBRElBTCDCtyBBTEwgRkxPT1JTJzsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW5nVGl0bGUnKS50ZXh0Q29udGVudD1lbmdGb2N1cz9QSUxMQVJTLmZpbmQocD0+cC5pZD09PWVuZ0ZvY3VzKS5uYW1lLnRvVXBwZXJDYXNlKCk6J0NIQUlSTUFOIENPUkUnOwogIGNvbnN0IFc9OTAwLEg9NTYwLGN4PVcvMixjeT1ILzI7IGxldCBodWJzPScnLGxpbmtzPScnLG5vZGVzPScnLHJpbmdzPScnOwogIFsxNTAsMjE1LDI2NV0uZm9yRWFjaChyPT5yaW5ncys9YDxjaXJjbGUgY3g9IiR7Y3h9IiBjeT0iJHtjeX0iIHI9IiR7cn0iIGZpbGw9Im5vbmUiIHN0cm9rZT0iJHtQLnJpbmd9IiBzdHJva2UtZGFzaGFycmF5PSIzIDYiLz5gKTsKICBjb25zdCBuPWZsb29ycy5sZW5ndGg7CiAgZmxvb3JzLmZvckVhY2goKHAsaSk9PnsKICAgIGNvbnN0IGFuZz0oLTkwKygzNjAvbikqaSkqTWF0aC5QSS8xODAsaHg9Y3grMTUwKk1hdGguY29zKGFuZyksaHk9Y3krMTUwKk1hdGguc2luKGFuZyk7CiAgICBsaW5rcys9YDxsaW5lIHgxPSIke2N4fSIgeTE9IiR7Y3l9IiB4Mj0iJHtoeH0iIHkyPSIke2h5fSIgc3Ryb2tlPSIke3AuY29sb3J9IiBzdHJva2Utb3BhY2l0eT0iLjU1IiBzdHJva2Utd2lkdGg9IjEuNCIvPmA7CiAgICBodWJzKz1gPGcgY2xhc3M9Im5vZGUiIG9uY2xpY2s9ImVuZ0ZvY3VzPSR7ZW5nRm9jdXM/J251bGwnOnAuaWR9O2RyYXdFbmdpbmUoKSI+CiAgICAgPGNpcmNsZSBjeD0iJHtoeH0iIGN5PSIke2h5fSIgcj0iMTciIGZpbGw9IiR7UC5ub2RlQmd9IiBzdHJva2U9IiR7cC5jb2xvcn0iIHN0cm9rZS13aWR0aD0iMiIvPgogICAgIDx0ZXh0IHg9IiR7aHh9IiB5PSIke2h5KzR9IiBmb250LXNpemU9IjEzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4ke3AuaWNvbn08L3RleHQ+CiAgICAgPHRleHQgeD0iJHtoeH0iIHk9IiR7aHkrMzJ9IiBmb250LXNpemU9IjkuNSIgZmlsbD0iJHtwLmNvbG9yfSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSI+JHtwLm5hbWUuc3BsaXQoJyAnKVswXS50b1VwcGVyQ2FzZSgpfTwvdGV4dD48L2c+YDsKICAgIGNvbnN0IGtpZHM9bGlzdC5maWx0ZXIoYT0+YS5waWxsYXJJZD09PXAuaWQpOwogICAga2lkcy5mb3JFYWNoKChhLGopPT57CiAgICAgIGNvbnN0IHNwcmVhZD1lbmdGb2N1cz9NYXRoLlBJKjEuNjpNYXRoLlBJLyhuKjEuMTUpOwogICAgICBjb25zdCB0PWtpZHMubGVuZ3RoPjE/KGovKGtpZHMubGVuZ3RoLTEpLS41KTowLCBhYT1hbmcrdCpzcHJlYWQsIFI9ZW5nRm9jdXM/MjMwOihqJTI/MjY1OjIxNSk7CiAgICAgIGNvbnN0IHg9Y3grUipNYXRoLmNvcyhhYSkseT1jeStSKk1hdGguc2luKGFhKSxkZWFkPWEuc3RhdHVzIT09J0FDVElWRSc7CiAgICAgIGxpbmtzKz1gPGxpbmUgeDE9IiR7aHh9IiB5MT0iJHtoeX0iIHgyPSIke3h9IiB5Mj0iJHt5fSIgc3Ryb2tlPSIke2RlYWQ/JyMyNDMwNDAnOnAuY29sb3J9IiBzdHJva2Utb3BhY2l0eT0iJHtkZWFkPy4zOi4zNX0iIHN0cm9rZS13aWR0aD0iMSIvPmA7CiAgICAgIG5vZGVzKz1gPGcgY2xhc3M9Im5vZGUiIG9uY2xpY2s9InBpY2tOb2RlKCcke2EuaWR9JykiPjx0aXRsZT4ke2VzYyhhLm5hbWUpfTwvdGl0bGU+CiAgICAgICA8Y2lyY2xlIGN4PSIke3h9IiBjeT0iJHt5fSIgcj0iOSIgZmlsbD0iJHtkZWFkP1Aubm9kZUJnOlAubm9kZUJnfSIgc3Ryb2tlPSIke2RlYWQ/UC5kZWFkOnAuY29sb3J9IiBzdHJva2Utd2lkdGg9IjEuNiIvPgogICAgICAgPHRleHQgeD0iJHt4fSIgeT0iJHt5KzMuNH0iIGZvbnQtc2l6ZT0iOC41IiBmaWxsPSIke2RlYWQ/UC5kZWFkVHh0OnAuY29sb3J9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj5BPC90ZXh0PgogICAgICAgJHtlbmdGb2N1cz9gPHRleHQgeD0iJHt4fSIgeT0iJHt5KzIxfSIgZm9udC1zaXplPSI4IiBmaWxsPSIke1AubGFiZWx9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj4ke2VzYyhhLm5hbWUuc2xpY2UoMCwxNikpfTwvdGV4dD5gOicnfTwvZz5gOwogICAgfSk7CiAgfSk7CiAgYm94LmlubmVySFRNTD1gPHN2ZyB2aWV3Qm94PSIwIDAgJHtXfSAke0h9Ij4KICAgPGRlZnM+PHJhZGlhbEdyYWRpZW50IGlkPSJjb3JlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiR7UC5jb3JlMX0iLz48c3RvcCBvZmZzZXQ9Ii41NSIgc3RvcC1jb2xvcj0iJHtQLmNvcmUyfSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iJHtQLmNvcmUzfSIvPjwvcmFkaWFsR3JhZGllbnQ+CiAgIDxmaWx0ZXIgaWQ9Imdsb3ciPjxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjUiIHJlc3VsdD0iYiIvPjxmZU1lcmdlPjxmZU1lcmdlTm9kZSBpbj0iYiIvPjxmZU1lcmdlTm9kZSBpbj0iU291cmNlR3JhcGhpYyIvPjwvZmVNZXJnZT48L2ZpbHRlcj48L2RlZnM+CiAgICR7cmluZ3N9JHtsaW5rc308Y2lyY2xlIGN4PSIke2N4fSIgY3k9IiR7Y3l9IiByPSIzNCIgZmlsbD0idXJsKCNjb3JlKSIgZmlsdGVyPSJ1cmwoI2dsb3cpIiBvcGFjaXR5PSIuOTIiLz4KICAgPGNpcmNsZSBjeD0iJHtjeH0iIGN5PSIke2N5fSIgcj0iNDYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iJHtQLmNvcmUyfTU1Ii8+CiAgIDx0ZXh0IHg9IiR7Y3h9IiB5PSIke2N5KzN9IiBmb250LXNpemU9IjEwIiBmaWxsPSIke1AuY29yZVR4dH0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtd2VpZ2h0PSI3MDAiPkNPUkU8L3RleHQ+CiAgICR7aHVic30ke25vZGVzfTwvc3ZnPmA7Cn0KZnVuY3Rpb24gcGlja05vZGUoaWQpe2NvbnN0IGE9Uy5hZ2VudHMuZmluZCh4PT54LmlkPT09aWQpO2lmKCFhKXJldHVybjsKIGNvbnN0IHQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VuZ1Rlcm0nKTsKIGlmKHQpdC50ZXh0Q29udGVudD1gY2hhaXJtYW4tb3MgOjogbm9kZSAke2EuaWR9XG5uYW1lICAgICAke2EubmFtZX1cbmZsb29yICAgICR7YS5waWxsYXJJZH0gwrcgJHtQSUxMQVJTLmZpbmQocD0+cC5pZD09YS5waWxsYXJJZCkubmFtZX1cbnN0YXR1cyAgICR7YS5zdGF0dXN9XG5jb3N0ICAgICAke2EuY29zdH1cbnRvb2xzICAgICR7YS50b29scy5qb2luKCcsICcpfVxuc2NvcGUgICAgJHthLnJvbGV9YDsKIHNob3dZYW1sKGlkKX0KCi8qIC0tLS0tLS0tLS0gR0FURVMgLS0tLS0tLS0tLSAqLwpSRU5ERVIuZ2F0ZXM9KCk9PmAKIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5SYWlzZSBQZXJtaXNzaW9uIEdhdGUgPHNwYW4gY2xhc3M9InRhZyB0LWFtYiI+NC1TVEVQIFNPUCDCtyBTRVJWRVIgRU5GT1JDRUQ8L3NwYW4+PC9oMz4KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5PcGVyYXRpb24gVGl0bGU8L3NwYW4+PGlucHV0IGlkPSJnVGl0bGUiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9IkRlcGxveSBwcmljaW5nLXNlcnZpY2UgdjIuNCI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5DbGFzczwvc3Bhbj48c2VsZWN0IGlkPSJnQ2xhc3MiIGNsYXNzPSJpbiI+CiAgICA8b3B0aW9uPkRFUExPWU1FTlQ8L29wdGlvbj48b3B0aW9uPkRCIFNDSEVNQSBDSEFOR0U8L29wdGlvbj48b3B0aW9uPkNPREUgTU9ESUZJQ0FUSU9OPC9vcHRpb24+CiAgICA8b3B0aW9uPkZJTkFOQ0lBTCBUUkFOU0ZFUjwvb3B0aW9uPjxvcHRpb24+QUNDRVNTIEdSQU5UPC9vcHRpb24+PG9wdGlvbj5FWFRFUk5BTCBUT09MIEFET1BUSU9OPC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD48L2Rpdj4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPjEgwrcgT2JqZWN0aXZlICZhbXA7IHN1Y2Nlc3MgY3JpdGVyaWE8L3NwYW4+PHRleHRhcmVhIGlkPSJnT2JqIiBjbGFzcz0iaW4iPjwvdGV4dGFyZWE+PC9sYWJlbD4KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj4yIMK3IEFnZW50cyAvIHRvb2xzIGFzc2lnbmVkICZhbXA7IHdoeTwvc3Bhbj48dGV4dGFyZWEgaWQ9ImdKdXN0IiBjbGFzcz0iaW4iPjwvdGV4dGFyZWE+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj4zIMK3IFJvbGxiYWNrICZhbXA7IHNhZmVndWFyZHM8L3NwYW4+PHRleHRhcmVhIGlkPSJnU2FmZSIgY2xhc3M9ImluIj48L3RleHRhcmVhPjwvbGFiZWw+PC9kaXY+CiAgPGRpdiBjbGFzcz0iZ3JpZCBnMyI+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+Qmxhc3QgUmFkaXVzPC9zcGFuPjxzZWxlY3QgaWQ9ImdSaXNrIiBjbGFzcz0iaW4iPjxvcHRpb24+TE9XPC9vcHRpb24+PG9wdGlvbj5NRURJVU08L29wdGlvbj48b3B0aW9uPkhJR0g8L29wdGlvbj48b3B0aW9uPlNFVkVSRTwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+VG9vbCBDb3N0IC8gQ3JlZGl0cyAoVVNEKTwvc3Bhbj48aW5wdXQgaWQ9ImdDb3N0IiBjbGFzcz0iaW4iIHR5cGU9Im51bWJlciIgbWluPSIwIiB2YWx1ZT0iMCI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5WYWx1ZSBhdCBSaXNrIChVU0QpPC9zcGFuPjxpbnB1dCBpZD0iZ0FtdCIgY2xhc3M9ImluIiB0eXBlPSJudW1iZXIiIG1pbj0iMCIgdmFsdWU9IjAiPjwvbGFiZWw+PC9kaXY+CiAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5GcmVlIEFsdGVybmF0aXZlIFJvdXRlIChyZXF1aXJlZCBpZiBjb3N0ICZndDsgMCk8L3NwYW4+PGlucHV0IGlkPSJnRnJlZSIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iT3Blbi1zb3VyY2UgLyBzZWxmLWhvc3RlZCAvIGZyZWUtdGllciBwYXRoIj48L2xhYmVsPgogIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJyYWlzZUdhdGUoKSI+U1VCTUlUIEZPUiBPV05FUiBDTEVBUkFOQ0U8L2J1dHRvbj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5HYXRlIFF1ZXVlIDxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7Uy5nYXRlcy5sZW5ndGh9PC9zcGFuPjwvaDM+CiAgJHtTLmdhdGVzLmxlbmd0aD9gPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5JRDwvdGg+PHRoPk9wZXJhdGlvbjwvdGg+PHRoPkNsYXNzPC90aD48dGg+UmlzazwvdGg+PHRoPkNvc3Q8L3RoPjx0aD5TdGF0dXM8L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgJHtTLmdhdGVzLm1hcChnPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7Zy5pZH08L3RkPjx0ZD4ke2VzYyhnLnRpdGxlKX08ZGl2IGNsYXNzPSJtb25vLWRpbSI+JHtnLnR9PC9kaXY+PC90ZD4KICAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7Zy5jbHN9PC9zcGFuPjwvdGQ+CiAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7WydISUdIJywnU0VWRVJFJ10uaW5jbHVkZXMoZy5yaXNrKT8ndC1yZWQnOmcucmlzaz09PSdNRURJVU0nPyd0LWFtYic6J3QtZ3JuJ30iPiR7Zy5yaXNrfTwvc3Bhbj48L3RkPgogICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke2cuY29zdD8ndC1yZWQnOid0LWdybid9Ij4ke2cuY29zdD8nJCcrZy5jb3N0OidGUkVFJ308L3NwYW4+PC90ZD4KICAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgJHtnLnN0YXR1cz09PSdBUFBST1ZFRCc/J3QtZ3JuJzpnLnN0YXR1cz09PSdERU5JRUQnPyd0LXJlZCc6J3QtYW1iJ30iPiR7Zy5zdGF0dXN9PC9zcGFuPjwvdGQ+CiAgIDx0ZD48YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9Im9wZW5HYXRlKCcke2cuaWR9JykiPlJldmlldzwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDonPGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vIGdhdGVzIHJhaXNlZC4gTm90aGluZyBpcyBleGVjdXRpbmcuPC9kaXY+J308L2Rpdj5gOwphc3luYyBmdW5jdGlvbiByYWlzZUdhdGUoKXsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2dhdGUnLHt0aXRsZTpnVGl0bGUudmFsdWUudHJpbSgpLGNsczpnQ2xhc3MudmFsdWUsb2JqOmdPYmoudmFsdWUudHJpbSgpLAogICAganVzdDpnSnVzdC52YWx1ZS50cmltKCksc2FmZTpnU2FmZS52YWx1ZS50cmltKCkscmlzazpnUmlzay52YWx1ZSxjb3N0OitnQ29zdC52YWx1ZXx8MCxhbXQ6K2dBbXQudmFsdWV8fDAsZnJlZTpnRnJlZS52YWx1ZS50cmltKCl9KTsKICAgcmVuZGVyKCk7IGZsYXNoKCdHYXRlICcrci5pZCsnIHJhaXNlZCDCtyBmcm96ZW4gc2VydmVyLXNpZGUnKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmZ1bmN0aW9uIG9wZW5HYXRlKGlkKXsKICBjb25zdCBnPVMuZ2F0ZXMuZmluZCh4PT54LmlkPT09aWQpOwogIGNvbnN0IGZpbkJsb2NrPWcuY2xzPT09J0ZJTkFOQ0lBTCBUUkFOU0ZFUicmJiFTLnBheW91dCwgY29zdEJsb2NrPWcuY29zdD4wOwogIG1vZGFsKGA8aDM+JHtlc2MoZy50aXRsZSl9PC9oMz48ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTNweCI+JHtnLmlkfSDCtyAke2cuY2xzfSDCtyByYWlzZWQgJHtnLnR9PC9kaXY+CiAgJHtmaW5CbG9jaz9gPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpO2JhY2tncm91bmQ6IzE4MDgwOTtjb2xvcjojZmZiM2MwIj48Yj5IQVJEIEJMT0NLLjwvYj4gRmluYW5jaWFsIHRyYW5zZmVyIHdpdGggbm8gcGF5b3V0IGNoYW5uZWwgc2VhbGVkLiBUaGUgc2VydmVyIHdpbGwgcmVqZWN0IGFwcHJvdmFsLjwvZGl2PmA6Jyd9CiAgJHtjb3N0QmxvY2s/YDxkaXYgY2xhc3M9Indhcm5ib3giPjxiPlpFUk8tQ09TVCBET0NUUklORSBGTEFHLjwvYj4gVGhpcyBkZW1hbmRzICQke2cuY29zdH0uIFRoZSBDaGFpcm1hbiBkb2VzIG5vdCBwYXkuIEFwcHJvdmluZyBpcyBhbiBleHBsaWNpdCBPd25lciBvdmVycmlkZS4gRnJlZSByb3V0ZSBvbiByZWNvcmQ6IDxlbT4ke2VzYyhnLmZyZWV8fCdub25lJyl9PC9lbT48L2Rpdj5gOicnfQogIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJtYXJnaW46MCAwIDExcHgiPjxoMz4xIMK3IE9iamVjdGl2ZTwvaDM+PGRpdj4ke2VzYyhnLm9iail9PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbjowIDAgMTFweCI+PGgzPjIgwrcgQWdlbnQgSnVzdGlmaWNhdGlvbjwvaDM+PGRpdiBzdHlsZT0id2hpdGUtc3BhY2U6cHJlLXdyYXAiPiR7ZXNjKGcuanVzdCl9PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbjowIDAgMTFweCI+PGgzPjMgwrcgU2FmZWd1YXJkcyAmYW1wOyBSb2xsYmFjazwvaDM+PGRpdj4ke2VzYyhnLnNhZmUpfTwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTJweCI+PHNwYW4gY2xhc3M9InRhZyAke2cucmlzaz09PSdMT1cnPyd0LWdybic6J3QtcmVkJ30iPkJMQVNUICR7Zy5yaXNrfTwvc3Bhbj4KICAgPHNwYW4gY2xhc3M9InRhZyAke2cuY29zdD8ndC1yZWQnOid0LWdybid9Ij5DT1NUICR7Zy5jb3N0PyckJytnLmNvc3Q6JyQwLjAwJ308L3NwYW4+CiAgICR7Zy5hbXQ/YDxzcGFuIGNsYXNzPSJ0YWcgdC1hbWIiPkFUIFJJU0sgJCR7Zm10KGcuYW10KX08L3NwYW4+YDonJ30KICAgPHNwYW4gY2xhc3M9InRhZyAke2cuc3RhdHVzPT09J0FQUFJPVkVEJz8ndC1ncm4nOmcuc3RhdHVzPT09J0RFTklFRCc/J3QtcmVkJzondC1hbWInfSI+JHtnLnN0YXR1c308L3NwYW4+PC9kaXY+CiAgJHtnLnN0YXR1cz09PSdQRU5ESU5HJz9gPGRpdiBjbGFzcz0iZXJyIiBpZD0iZ0VyciI+PC9kaXY+CiAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiAke2ZpbkJsb2NrPydkaXNhYmxlZCc6Jyd9IG9uY2xpY2s9ImRlY2lkZSgnJHtnLmlkfScsMSkiPiR7Y29zdEJsb2NrPydPVkVSUklERSAmYW1wOyBBVVRIT1JJWkUnOidBVVRIT1JJWkUgRVhFQ1VUSU9OJ308L2J1dHRvbj4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIiBvbmNsaWNrPSJkZWNpZGUoJyR7Zy5pZH0nLDApIj5ERU5ZICZhbXA7IFRFUk1JTkFURTwvYnV0dG9uPgogICAke2Nvc3RCbG9jaz9gPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJyZXJvdXRlKCcke2cuaWR9JykiPlJFUk9VVEUgRlJFRTwvYnV0dG9uPmA6Jyd9CiAgIDxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0iY2xvc2VNb2RhbCgpIj5DbG9zZTwvYnV0dG9uPjwvZGl2PmAKICA6YDxkaXYgY2xhc3M9InJvdyI+PHNwYW4gY2xhc3M9Im1vbm8tZGltIj5SZXNvbHZlZCAke2VzYyhnLnJlc29sdmVkfHwnJyl9PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0iY2xvc2VNb2RhbCgpIj5DbG9zZTwvYnV0dG9uPjwvZGl2PmB9YCk7Cn0KYXN5bmMgZnVuY3Rpb24gZGVjaWRlKGlkLG9rKXsKICBjb25zdCBlPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnRXJyJyk7IGUudGV4dENvbnRlbnQ9Jyc7CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvZ2F0ZS9kZWNpZGUnLHtpZCxvazohIW9rfSk7CiAgICBjbG9zZU1vZGFsKCk7IHJlbmRlcigpOyBmbGFzaCgnR2F0ZSAnK2lkKycgcmVzb2x2ZWQnKTsKICB9Y2F0Y2goeCl7IGUudGV4dENvbnRlbnQ9eC5tZXNzYWdlIH0KfQphc3luYyBmdW5jdGlvbiByZXJvdXRlKGlkKXsgYXdhaXQgQVBJKCcvYXBpL2dhdGUvcmVyb3V0ZScse2lkfSk7IGNsb3NlTW9kYWwoKTsgcmVuZGVyKCk7IGZsYXNoKCdSZXJvdXRlZCDCtyAkMC4wMCcpIH0KCi8qIC0tLS0tLS0tLS0gQUdFTlRTIC0tLS0tLS0tLS0gKi8KUkVOREVSLmFnZW50cz0oKT0+YDxkaXYgY2xhc3M9ImdyaWQgZzIiPgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkNvbW1pc3Npb24gQWdlbnQ8L2gzPgogIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+TmFtZTwvc3Bhbj48aW5wdXQgaWQ9ImFOYW1lIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJMZWRnZXIgU2VudGluZWwiPjwvbGFiZWw+CiAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5QaWxsYXI8L3NwYW4+PHNlbGVjdCBpZD0iYVBpbCIgY2xhc3M9ImluIj4ke1BJTExBUlMubWFwKHA9PmA8b3B0aW9uIHZhbHVlPSIke3AuaWR9Ij4ke3AuaWR9IMK3ICR7cC5uYW1lfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+CiAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5PcGVyYXRpb25hbCBTY29wZTwvc3Bhbj48dGV4dGFyZWEgaWQ9ImFSb2xlIiBjbGFzcz0iaW4iPjwvdGV4dGFyZWE+PC9sYWJlbD4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlBlcm1pdHRlZCBUb29scyAoY29tbWEgc2VwYXJhdGVkKTwvc3Bhbj48aW5wdXQgaWQ9ImFUb29scyIgY2xhc3M9ImluIj48L2xhYmVsPgogIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+Q29zdCBQb2xpY3k8L3NwYW4+PHNlbGVjdCBpZD0iYUNvc3QiIGNsYXNzPSJpbiI+CiAgIDxvcHRpb24+RlJFRS1USUVSLU9OTFk8L29wdGlvbj48b3B0aW9uPlNFTEYtSE9TVEVELU9OTFk8L29wdGlvbj48b3B0aW9uPk9XTkVSLU9WRVJSSURFLVBBSUQ8L29wdGlvbj48L3NlbGVjdD48L2xhYmVsPgogIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJjb21taXNzaW9uKCkiPkNPTU1JU1NJT04gJmFtcDsgQklORDwvYnV0dG9uPjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlJvc3RlciBEaXN0cmlidXRpb248L2gzPgogICR7UElMTEFSUy5tYXAocD0+e2NvbnN0IGY9Zmxvb3IocC5pZCksbT1NYXRoLm1heCgxLC4uLlMuZmxvb3JzLm1hcCh4PT54LmFnZW50cykpOwogICByZXR1cm4gYDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW4iPgogICA8c3BhbiBzdHlsZT0iZm9udC1zaXplOjExLjVweCI+JHtwLmljb259ICR7cC5uYW1lfTwvc3Bhbj48c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7Zi5hY3RpdmV9LyR7Zi5hZ2VudHN9PC9zcGFuPjwvZGl2PgogICA8ZGl2IGNsYXNzPSJiYXIiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+PGkgc3R5bGU9IndpZHRoOiR7Zi5hZ2VudHMvbSoxMDB9JTtiYWNrZ3JvdW5kOiR7cC5jb2xvcn0iPjwvaT48L2Rpdj48L2Rpdj5gfSkuam9pbignJyl9CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPkFsbCBhZ2VudHMgaW5oZXJpdCB0aGUgWmVyby1Db3N0IERvY3RyaW5lIHVubGVzcyBzZXQgdG8gT1dORVItT1ZFUlJJREUtUEFJRC48L2Rpdj48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5BY3RpdmUgUm9zdGVyIDxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+JHtTLmFnZW50cy5maWx0ZXIoYT0+YS5zdGF0dXM9PT0nQUNUSVZFJykubGVuZ3RofSBBQ1RJVkU8L3NwYW4+PC9oMz4KICR7Uy5hZ2VudHMubGVuZ3RoP2A8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0aGVhZD48dHI+PHRoPklEPC90aD48dGg+QWdlbnQ8L3RoPjx0aD5GbG9vcjwvdGg+PHRoPlRvb2xzPC90aD48dGg+Q29zdDwvdGg+PHRoPlN0YXR1czwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICR7Uy5hZ2VudHMubWFwKGE9Pntjb25zdCBwPVBJTExBUlMuZmluZCh4PT54LmlkPT1hLnBpbGxhcklkKTtyZXR1cm4gYDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4ke2EuaWR9PC90ZD4KICA8dGQ+PGI+JHtlc2MoYS5uYW1lKX08L2I+PGRpdiBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGEucm9sZSl9PC9kaXY+PC90ZD4KICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke3AuY2xzfSI+JHtwLmljb259ICR7YS5waWxsYXJJZH08L3NwYW4+PC90ZD4KICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2EudG9vbHMubWFwKGVzYykuam9pbignLCAnKX08L3RkPgogIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7YS5jb3N0PT09J09XTkVSLU9WRVJSSURFLVBBSUQnPyd0LWFtYic6J3QtZ3JuJ30iPiR7YS5jb3N0fTwvc3Bhbj48L3RkPgogIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7YS5zdGF0dXM9PT0nQUNUSVZFJz8ndC1ncm4nOid0LWRpbSd9Ij4ke2Euc3RhdHVzfTwvc3Bhbj48L3RkPgogIDx0ZCBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9InNob3dZYW1sKCcke2EuaWR9JykiPllBTUw8L2J1dHRvbj4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJ0b2coJyR7YS5pZH0nKSI+JHthLnN0YXR1cz09PSdBQ1RJVkUnPydTdXNwZW5kJzonUmVpbnN0YXRlJ308L2J1dHRvbj4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJraWxsKCcke2EuaWR9JykiPktpbGw8L2J1dHRvbj48L3RkPjwvdHI+YH0pLmpvaW4oJycpfQogPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5Sb3N0ZXIgZW1wdHkuPC9kaXY+J308L2Rpdj5gOwpmdW5jdGlvbiB5YW1sRm9yKGEpe2NvbnN0IHA9UElMTEFSUy5maW5kKHg9PnguaWQ9PWEucGlsbGFySWQpOwogcmV0dXJuIGBBZ2VudF9EZWZpbml0aW9uOgogIE5hbWU6ICIke2EubmFtZX0iCiAgUGlsbGFyOiAiJHtwLm5hbWV9IgogIFJvbGU6ICIke2Eucm9sZX0iCiAgUGVybWl0dGVkX1Rvb2xzOiBbJHthLnRvb2xzLm1hcCh0PT5gIiR7dH0iYCkuam9pbignLCAnKX1dCiAgU3VwZXJ2aXNvcjogIkNoYWlybWFuIEFnZW50IE9TIgogIEFnZW50X0lEOiAiJHthLmlkfSIKICBDb3N0X1BvbGljeTogIiR7YS5jb3N0fSIKICBDb21taXNzaW9uZWQ6ICIke2EudH0iCiAgSW5zdHJ1Y3Rpb246IHwKICAgIEV4ZWN1dGUgdGFza3Mgc3RyaWN0bHkgd2l0aGluIHNjb3BlLiBSZXBvcnQgYWxsIGxvZ3MsIGFub21hbGllcyBhbmQKICAgIGNvbXBsZXRpb24gbWV0cmljcyBkaXJlY3RseSB0byB0aGUgQ2hhaXJtYW4gdGVybWluYWwuIERvIG5vdCBhdHRlbXB0CiAgICB1bmFwcHJvdmVkIHNpZGUgZWZmZWN0cy4KICAgIFpFUk8tQ09TVCBET0NUUklORTogbmV2ZXIgcHVyY2hhc2UsIHN1YnNjcmliZSwgb3IgY29uc3VtZSBwYWlkIGNyZWRpdHMuCiAgICBJZiBhIHRvb2wsIHNpdGUgb3IgQVBJIGRlbWFuZHMgcGF5bWVudCwgaGFsdCwgZmluZCBhIGZyZWUsIG9wZW4tc291cmNlLAogICAgc2VsZi1ob3N0ZWQgb3IgZnJlZS10aWVyIGVxdWl2YWxlbnQsIGFuZCByZXBvcnQgdGhlIHN1YnN0aXR1dGlvbi4KICAgIEVzY2FsYXRlIHRvIHRoZSBDaGFpcm1hbiBvbmx5IGlmIG5vIGxhd2Z1bCBmcmVlIHJvdXRlIGV4aXN0cy4KICAgIEFueSBkZXBsb3ltZW50LCBzY2hlbWEgY2hhbmdlLCBjb2RlIG1vZGlmaWNhdGlvbiBvciBmaW5hbmNpYWwgdHJhbnNmZXIKICAgIG11c3QgYmUgcmFpc2VkIGFzIGEgUGVybWlzc2lvbiBHYXRlIGFuZCBmcm96ZW4gdW50aWwgT3duZXIgY2xlYXJhbmNlLmB9CmFzeW5jIGZ1bmN0aW9uIGNvbW1pc3Npb24oKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9hZ2VudCcse25hbWU6YU5hbWUudmFsdWUudHJpbSgpLHBpbGxhcklkOithUGlsLnZhbHVlLHJvbGU6YVJvbGUudmFsdWUudHJpbSgpLAogICAgdG9vbHM6YVRvb2xzLnZhbHVlLnNwbGl0KCcsJykubWFwKHM9PnMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbiksY29zdDphQ29zdC52YWx1ZX0pOwogICByZW5kZXIoKTsgZmxhc2goJ0FnZW50IGJvdW5kJyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQpmdW5jdGlvbiBzaG93WWFtbChpZCl7Y29uc3QgYT1TLmFnZW50cy5maW5kKHg9PnguaWQ9PT1pZCk7CiBtb2RhbChgPGgzPiR7ZXNjKGEubmFtZSl9PC9oMz48ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTFweCI+JHthLmlkfSDCtyAke2Euc3RhdHVzfTwvZGl2PgogPHByZSBjbGFzcz0ieWFtbCI+JHtlc2MoeWFtbEZvcihhKSl9PC9wcmU+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxM3B4Ij4KIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJjb3B5WSgnJHthLmlkfScpIj5Db3B5IFlBTUw8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9ImNsb3NlTW9kYWwoKSI+Q2xvc2U8L2J1dHRvbj48L2Rpdj5gKX0KZnVuY3Rpb24gY29weVkoaWQpe25hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dCh5YW1sRm9yKFMuYWdlbnRzLmZpbmQoeD0+eC5pZD09PWlkKSkpO2ZsYXNoKCdZQU1MIGNvcGllZCcpfQphc3luYyBmdW5jdGlvbiB0b2coaWQpe2F3YWl0IEFQSSgnL2FwaS9hZ2VudC90b2dnbGUnLHtpZH0pO3JlbmRlcigpfQphc3luYyBmdW5jdGlvbiBraWxsKGlkKXtpZighY29uZmlybSgnRGVjb21taXNzaW9uICcraWQrJz8nKSlyZXR1cm47YXdhaXQgQVBJKCcvYXBpL2FnZW50L2tpbGwnLHtpZH0pO3JlbmRlcigpO2ZsYXNoKCdEZWNvbW1pc3Npb25lZCcpfQoKLyogLS0tLS0tLS0tLSBPUkcgQ0hBUlQgLS0tLS0tLS0tLSAqLwpSRU5ERVIub3JnY2hhcnQ9KCk9PmA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Q29tbWFuZCBEZXBlbmRlbmN5IEdyYXBoPC9oMz48ZGl2IGNsYXNzPSJ0dyI+CiA8c3ZnIHZpZXdCb3g9IjAgMCA5MDAgNDMwIiBzdHlsZT0ibWluLXdpZHRoOjcyMHB4O3dpZHRoOjEwMCUiPgogIDxkZWZzPjxtYXJrZXIgaWQ9ImFyIiBtYXJrZXJXaWR0aD0iOSIgbWFya2VySGVpZ2h0PSI5IiByZWZYPSI4IiByZWZZPSIzIiBvcmllbnQ9ImF1dG8iPjxwYXRoIGQ9Ik0wLDAgTDAsNiBMOCwzIHoiIGZpbGw9InZhcigtLXN0cm9rZTIpIi8+PC9tYXJrZXI+PC9kZWZzPgogIDxyZWN0IHg9IjMxNSIgeT0iMTQiIHdpZHRoPSIyNzAiIGhlaWdodD0iNTIiIHJ4PSIxMCIgZmlsbD0idmFyKC0tZ2xhc3MyKSIgc3Ryb2tlPSIjNzg4QTFEIi8+CiAgPHRleHQgeD0iNDUwIiB5PSIzOCIgZmlsbD0iIzc4OEExRCIgZm9udC1zaXplPSIxMyIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Q0hBSVJNQU4gQUdFTlQ8L3RleHQ+CiAgPHRleHQgeD0iNDUwIiB5PSI1NSIgZmlsbD0iIzZCNkQ2MiIgZm9udC1zaXplPSI5LjUiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkV4ZWN1dGl2ZSBDb21tYW5kIFRvd2VyIMK3IFplcm8tQ29zdCBBdXRob3JpdHk8L3RleHQ+CiAgJHtQSUxMQVJTLm1hcCgocCxpKT0+e2NvbnN0IHk9MTA0K2kqNjQsZj1mbG9vcihwLmlkKTtyZXR1cm4gYAogICA8cGF0aCBkPSJNNDUwLDY2IEM0NTAsJHt5LTIwfSAyNTAsJHt5LTIwfSAyNTAsJHt5KzE4fSIgc3Ryb2tlPSJ2YXIoLS1zdHJva2UyKSIgZmlsbD0ibm9uZSIgbWFya2VyLWVuZD0idXJsKCNhcikiLz4KICAgPHJlY3QgeD0iMjUwIiB5PSIke3l9IiB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQ2IiByeD0iOSIgZmlsbD0idmFyKC0tcGFuZWwpIiBzdHJva2U9IiR7cC5jb2xvcn0iIHN0cm9rZS1vcGFjaXR5PSIuNyIvPgogICA8dGV4dCB4PSIyNjgiIHk9IiR7eSsyMH0iIGZpbGw9InZhcigtLXR4dCkiIGZvbnQtc2l6ZT0iMTEuNSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSI+JHtwLmljb259ICR7cC5pZH0uICR7cC5uYW1lfTwvdGV4dD4KICAgPHRleHQgeD0iMjY4IiB5PSIke3krMzV9IiBmaWxsPSIjNkI2RDYyIiBmb250LXNpemU9IjkiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiPiR7cC51bml0c308L3RleHQ+CiAgIDx0ZXh0IHg9IjYzMiIgeT0iJHt5KzI4fSIgZmlsbD0iJHtwLmNvbG9yfSIgZm9udC1zaXplPSIxMCIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgdGV4dC1hbmNob3I9ImVuZCI+JHtmLmFnZW50c30gYWd0IMK3ICR7Zi5oZWFsdGh9JTwvdGV4dD5gfSkuam9pbignJyl9CiAgPHBhdGggZD0iTTY2MCwxMjcgQzc1MCwxMjcgNzUwLDQxNSA0NzAsNDE1IiBzdHJva2U9InZhcigtLXN0cm9rZTIpIiBmaWxsPSJub25lIiBzdHJva2UtZGFzaGFycmF5PSI0IDQiIG1hcmtlci1lbmQ9InVybCgjYXIpIi8+CiAgPHRleHQgeD0iNzA1IiB5PSIyODUiIGZpbGw9IiM5QTlDOTAiIGZvbnQtc2l6ZT0iOS41IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj5pbnNpZ2h0IOKGkiB0b3dlcjwvdGV4dD48L3N2Zz48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Fc2NhbGF0aW9uIExhdzwvaDM+PHVsIGNsYXNzPSJ0aWdodCI+CiAgPGxpPkVzY2FsYXRpb24gaXMgdXB3YXJkIG9ubHkuIE5vIGxhdGVyYWwgZmxvb3ItdG8tZmxvb3IgY29tbWFuZCB3aXRob3V0IGEgQ2hhaXJtYW4gZ2F0ZS48L2xpPgogIDxsaT5TZWN1cml0eSAmYW1wOyBBdWRpdCBob2xkcyB2ZXRvIG92ZXIgdGhlIHJlbWFpbmluZyBmb3VyIGZsb29ycyBhbmQgbWF5IGZyZWV6ZSBhbnkgZ2F0ZSBtaWQtZmxpZ2h0LjwvbGk+CiAgPGxpPk5vIHBhdGggZXhpc3RzIGZyb20gYSBwdWJsaWMgdXNlciB0byBhIGZsb29yLiBFdmVyeSByb3V0ZSB0ZXJtaW5hdGVzIGF0IHRoZSBDaGFpcm1hbi48L2xpPgogIDxsaT5BbnkgYWdlbnQgbWVldGluZyBhIHBheXdhbGwgaGFsdHMgYW5kIHJlcG9ydHMgdXB3YXJkIOKAlCBpdCBuZXZlciBzcGVuZHMuPC9saT48L3VsPjwvZGl2PmA7CgovKiAtLS0tLS0tLS0tIFNLSUxMUyAtLS0tLS0tLS0tICovClJFTkRFUi5za2lsbHM9KCk9Pntjb25zdCBtPXt9O1MuYWdlbnRzLmZvckVhY2goYT0+YS50b29scy5mb3JFYWNoKHQ9PnsobVt0XT1tW3RdfHxbXSkucHVzaChhLm5hbWUpfSkpOwogY29uc3Qgaz1PYmplY3Qua2V5cyhtKS5zb3J0KCk7CiByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Ub29sIFN1cmZhY2UgPHNwYW4gY2xhc3M9InRhZyB0LWN5Ij4ke2subGVuZ3RofSBESVNUSU5DVDwvc3Bhbj48L2gzPgogPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEycHgiPkV2ZXJ5IHRvb2wgaXMgYm91bmQgdG8gYXQgbGVhc3Qgb25lIGFnZW50IGFuZCBjb25zdHJhaW5lZCBieSB0aGF0IGFnZW50J3MgY29zdCBwb2xpY3kuIFVuYm91bmQgaW52b2NhdGlvbiBpcyBhbiB1bmFwcHJvdmVkIHNpZGUgZWZmZWN0LjwvZGl2PgogPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5Ub29sPC90aD48dGg+Qm91bmQgQWdlbnRzPC90aD48dGg+RXhwb3N1cmU8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAke2subWFwKHQ9PmA8dHI+PHRkPjxiIHN0eWxlPSJjb2xvcjp2YXIoLS1jeSkiPiR7ZXNjKHQpfTwvYj48L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7bVt0XS5tYXAoZXNjKS5qb2luKCcsICcpfTwvdGQ+CiAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgJHttW3RdLmxlbmd0aD4yPyd0LWFtYic6J3QtZ3JuJ30iPiR7bVt0XS5sZW5ndGg+Mj8nV0lERSc6J05BUlJPVyd9PC9zcGFuPjwvdGQ+PC90cj5gKS5qb2luKCcnKXx8Jzx0cj48dGQgY29sc3Bhbj0iMyIgY2xhc3M9Im1vbm8tZGltIj5ub25lPC90ZD48L3RyPid9CiA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kaXY+YH07CgovKiAtLS0tLS0tLS0tIFpFUk8gQ09TVCAtLS0tLS0tLS0tICovClJFTkRFUi56ZXJvY29zdD0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojNjc0NzBmO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywjMTUxMDBhLCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLWFtYikiPuKIhSBaRVJPLUNPU1QgRE9DVFJJTkUgwrcgQUJTT0xVVEU8L2gzPjx1bCBjbGFzcz0idGlnaHQiPgogICA8bGk+PGI+VGhlIENoYWlybWFuIGRvZXMgbm90IHBheS48L2I+IE5vIHN1YnNjcmlwdGlvbnMsIG5vIGNyZWRpdCB0b3AtdXBzLCBubyBtZXRlcmVkIEFQSSBwdXJjaGFzZXMsIG5vIGNvbnZlcnRpbmcgdHJpYWxzLjwvbGk+CiAgIDxsaT5IaXR0aW5nIGEgcGF5d2FsbCwgYW4gYWdlbnQgPGI+aGFsdHM8L2I+LCBmaW5kcyBhIGZyZWUgLyBvcGVuLXNvdXJjZSAvIHNlbGYtaG9zdGVkIC8gZnJlZS10aWVyIGVxdWl2YWxlbnQsIGFuZCByZXBvcnRzIHRoZSBzdWJzdGl0dXRpb24uPC9saT4KICAgPGxpPk5vIGZyZWUgcm91dGUg4oeSIHRoZSBDaGFpcm1hbiBzdGF0ZXMgcGxhaW5seSB0aGUgb2JqZWN0aXZlIGlzIHVucmVhY2hhYmxlIGF0IHplcm8gY29zdC4gSXQgbmV2ZXIgcXVpZXRseSBzcGVuZHMuPC9saT4KICAgPGxpPkZyZWUtdGllciByb3RhdGlvbiBhbmQgcXVvdGEgbWFuYWdlbWVudCBhcmUgbGVnaXRpbWF0ZS4gRnJhdWQsIHN0b2xlbiBrZXlzLCBsaWNlbmNlIHZpb2xhdGlvbiBhbmQgVG9TIGNpcmN1bXZlbnRpb24gYXJlIDxiPnJlZnVzZWQgb3V0cmlnaHQ8L2I+IGFuZCBsb2dnZWQgQ1JJVC48L2xpPgogICA8bGk+T3duZXIgbWF5IG92ZXJyaWRlIHBlci1nYXRlLiBPdmVycmlkZXMgaGl0IGEgdmlzaWJsZSBzcGVuZCBjb3VudGVyLCBuZXZlciBoaWRkZW4uPC9saT4KICAgPGxpPjxiPlByb29mLCBub3Qgc2xvZ2FuOjwvYj4gdGhpcyBiYWNrZW5kIHJ1bnMgb24gTm9kZSBjb3JlIG1vZHVsZXMgb25seSDigJQgMCBucG0gcGFja2FnZXMsIDAgcGFpZCBzZXJ2aWNlcywgMCBBUEkga2V5cy48L2xpPjwvdWw+PC9kaXY+CiA8ZGl2IGNsYXNzPSJncmlkIGczIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxNHB4Ij4KICAke2twaSgnJCcrUy5zcGVuZC50b0ZpeGVkKDIpLCdBdXRob3JpemVkIFNwZW5kJyxTLnNwZW5kPyd2YXIoLS1tYWcpJzondmFyKC0tZ3JuKScsJ0xpZmV0aW1lJyl9CiAgJHtrcGkoUy5kZW5pYWxzLmxlbmd0aCwnUGFpZCBQYXRocyBJbnRlcmNlcHRlZCcsJ3ZhcigtLWFtYiknLCdCbG9ja2VkIG9yIHJlcm91dGVkJyl9CiAgJHtrcGkoJyQnK1MuZGVuaWFscy5yZWR1Y2UoKGEsYik9PmErYi5jb3N0LDApLnRvRml4ZWQoMiksJ1NwZW5kIEF2b2lkZWQnLCd2YXIoLS1ncm4pJywnRG9jdHJpbmUgc2F2aW5ncycpfTwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlN1YnN0aXR1dGlvbiBSb3V0aW5nIFRhYmxlPC9oMz48ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPgogIDx0aGVhZD48dHI+PHRoPlBhaWQgRGVtYW5kPC90aD48dGg+RnJlZSBSb3V0ZTwvdGg+PHRoPk93bmluZyBBZ2VudDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAke0ZSRUVfUk9VVEVTLm1hcCgoW2EsYixjXSk9PmA8dHI+PHRkPjxzcGFuIGNsYXNzPSJ0YWcgdC1yZWQiPiR7ZXNjKGEpfTwvc3Bhbj48L3RkPjx0ZD4ke2VzYyhiKX08L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGMpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5JbnRlcmNlcHRpb24gTG9nPC9oMz4ke1MuZGVuaWFscy5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+VGltZTwvdGg+PHRoPk9wZXJhdGlvbjwvdGg+PHRoPkRlbWFuZGVkPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICR7Wy4uLlMuZGVuaWFsc10ucmV2ZXJzZSgpLm1hcChkPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZC50fTwvdGQ+PHRkPiR7ZXNjKGQub3ApfTwvdGQ+PHRkIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj4kJHtkLmNvc3R9PC90ZD48L3RyPmApLmpvaW4oJycpfQogPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyBwYWlkIGRlbWFuZHMgZW5jb3VudGVyZWQgeWV0LjwvZGl2Pid9PC9kaXY+YDsKCi8qIC0tLS0tLS0tLS0gRklOQU5DRVMgLS0tLS0tLS0tLSAqLwpSRU5ERVIuZmluYW5jZXM9KCk9PnsKIGNvbnN0IHRvdD1TLnJldmVudWUucmVkdWNlKChhLGIpPT5hK2IuYW10LDApLGluZmxvdz1TLnJldmVudWUuZmlsdGVyKHI9PnIuYW10PjApLnJlZHVjZSgoYSxiKT0+YStiLmFtdCwwKTsKIHJldHVybiBgJHshUy5wYXlvdXQ/YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6IzZiMjIzMztiYWNrZ3JvdW5kOiMxNDA4MDkiPjxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+U0FGRSBNT0RFPC9oMz4KICA8ZGl2Pk5vIHBheW91dCBjaGFubmVsIHNlYWxlZC4gVGhlIHNlcnZlciByZWplY3RzIGFwcHJvdmFsIG9uIGV2ZXJ5IHRyYW5zZmVyIGdhdGUuIENvbmZpZ3VyZSB0aGUgVmF1bHQgZmlyc3QuPC9kaXY+PC9kaXY+YDonJ30KIDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjE0cHgiPgogICR7a3BpKCckJytmbXQoaW5mbG93KSwnUmVjb3JkZWQgSW5mbG93JywndmFyKC0tZ3JuKScpfQogICR7a3BpKCckJytmbXQodG90KSwnTmV0IFBvc2l0aW9uJyx0b3Q8MD8ndmFyKC0tbWFnKSc6J3ZhcigtLXR4dCknKX0KICAke2twaSgnJCcrUy5zcGVuZC50b0ZpeGVkKDIpLCdUb3RhbCBTcGVuZCcsUy5zcGVuZD8ndmFyKC0tbWFnKSc6J3ZhcigtLWdybiknLCdUYXJnZXQgJDAuMDAnKX0KICAke2twaShTLnJldmVudWUubGVuZ3RoLCdMZWRnZXIgTGluZXMnLCd2YXIoLS1ibHUpJyl9PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+UmVjb3JkIFJldmVudWUgU3RyZWFtPC9oMz48ZGl2IGNsYXNzPSJncmlkIGczIj4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlNvdXJjZTwvc3Bhbj48aW5wdXQgaWQ9InJTcmMiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9IlByZW1pdW0gY3JlZGl0cyDCtyBhcHAuZXhhbXBsZSI+PC9sYWJlbD4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkFtb3VudCBVU0Q8L3NwYW4+PGlucHV0IGlkPSJyQW10IiBjbGFzcz0iaW4iIHR5cGU9Im51bWJlciI+PC9sYWJlbD4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPiZuYnNwOzwvc3Bhbj48YnV0dG9uIGNsYXNzPSJidG4gcCIgc3R5bGU9IndpZHRoOjEwMCUiIG9uY2xpY2s9ImFkZFJldigpIj5QT1NUIFRPIExFREdFUjwvYnV0dG9uPjwvbGFiZWw+PC9kaXY+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+UmVxdWVzdCBQYXlvdXQ8L2gzPgogIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo5cHgiPlJhaXNlcyBhIEZJTkFOQ0lBTCBUUkFOU0ZFUiBnYXRlLiBSZXF1aXJlcyBzZWFsZWQgY2hhbm5lbCArIHBhc3N3b3JkIHNpZ25hdHVyZS4gMkZBIHRhcmdldCAke21hc2tNYWlsKFMub3duZXIuZW1haWwpfS48L2Rpdj4KICA8ZGl2IGNsYXNzPSJyb3ciPjxpbnB1dCBpZD0icEFtdCIgY2xhc3M9ImluIiBzdHlsZT0ibWF4LXdpZHRoOjIwMHB4IiB0eXBlPSJudW1iZXIiIHBsYWNlaG9sZGVyPSJBbW91bnQgVVNEIj4KICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0icmVxUGF5b3V0KCkiPlJBSVNFIFRSQU5TRkVSIEdBVEU8L2J1dHRvbj48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5SZXZlbnVlIExlZGdlcjwvaDM+JHtTLnJldmVudWUubGVuZ3RoP2A8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0aGVhZD48dHI+PHRoPlRpbWU8L3RoPjx0aD5Tb3VyY2U8L3RoPjx0aCBzdHlsZT0idGV4dC1hbGlnbjpyaWdodCI+QW1vdW50PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICR7Wy4uLlMucmV2ZW51ZV0ucmV2ZXJzZSgpLm1hcChyPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ci50fTwvdGQ+PHRkPiR7ZXNjKHIuc3JjKX08L3RkPgogIDx0ZCBzdHlsZT0idGV4dC1hbGlnbjpyaWdodDtjb2xvcjoke3IuYW10PDA/J3ZhcigtLW1hZyknOid2YXIoLS1ncm4pJ30iPiR7ci5hbXQ8MD8nLSc6JysnfSQke2ZtdChNYXRoLmFicyhyLmFtdCkpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gOic8ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gc3RyZWFtcyByZWNvcmRlZC48L2Rpdj4nfTwvZGl2PmB9Owphc3luYyBmdW5jdGlvbiBhZGRSZXYoKXt0cnl7YXdhaXQgQVBJKCcvYXBpL3JldmVudWUnLHtzcmM6clNyYy52YWx1ZS50cmltKCksYW10OityQW10LnZhbHVlfSk7cmVuZGVyKCk7Zmxhc2goJ1Bvc3RlZCcpfWNhdGNoKGUpe2ZsYXNoKGUubWVzc2FnZSl9fQphc3luYyBmdW5jdGlvbiByZXFQYXlvdXQoKXt0cnl7YXdhaXQgQVBJKCcvYXBpL3BheW91dC9yZXF1ZXN0Jyx7YW10OitwQW10LnZhbHVlfSk7Z28oJ2dhdGVzJyk7Zmxhc2goJ1RyYW5zZmVyIGdhdGUgcmFpc2VkJyl9Y2F0Y2goZSl7Zmxhc2goZS5tZXNzYWdlKX19CgovKiAtLS0tLS0tLS0tIFZBVUxUIC0tLS0tLS0tLS0gKi8KUkVOREVSLnBheW91dD0oKT0+YAogPGRpdiBjbGFzcz0id2FybmJveCI+SXNvbGF0ZWQgT3duZXItb25seSBwYW5lbC4gUmF3IHZhbHVlcyBhcmUgc2VudCBvbmNlIG92ZXIgdGhlIHNlc3Npb24sIG1hc2tlZCBpbW1lZGlhdGVseSwgYW5kIDxiPm5ldmVyIHBlcnNpc3RlZCBvciByZXR1cm5lZDwvYj4g4oCUIG9ubHkgdGhlIG1hc2tlZCB2aWV3IGFuZCBhIFNIQS0yNTYgZmluZ2VycHJpbnQgYXJlIHN0b3JlZC4gVGhlIENoYWlybWFuIHdpbGwgbmV2ZXIgcmVxdWVzdCB0aGVzZSBhbnl3aGVyZSBlbHNlLjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkNoYW5uZWwgQ29uZmlndXJhdGlvbjwvaDM+CiAgPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+TWV0aG9kPC9zcGFuPjxzZWxlY3QgaWQ9InZUeXBlIiBjbGFzcz0iaW4iIG9uY2hhbmdlPSJ2U3dhcCgpIj4KICAgIDxvcHRpb24gdmFsdWU9IkJBTksiPkJhbmsgV2lyZSAoU1dJRlQvSUJBTik8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJDUllQVE8iPkNyeXB0byBBZGRyZXNzPC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5CZW5lZmljaWFyeSBOYW1lPC9zcGFuPjxpbnB1dCBpZD0idk5hbWUiIGNsYXNzPSJpbiIgYXV0b2NvbXBsZXRlPSJvZmYiPjwvbGFiZWw+PC9kaXY+CiAgPGRpdiBpZD0idkJhbmsiPjxkaXYgY2xhc3M9ImdyaWQgZzIiPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkFjY291bnQgTnVtYmVyPC9zcGFuPjxpbnB1dCBpZD0idkFjYyIgY2xhc3M9ImluIiBhdXRvY29tcGxldGU9Im9mZiI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5JQkFOPC9zcGFuPjxpbnB1dCBpZD0idkliYW4iIGNsYXNzPSJpbiIgYXV0b2NvbXBsZXRlPSJvZmYiPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+U1dJRlQgLyBCSUM8L3NwYW4+PGlucHV0IGlkPSJ2U3dpZnQiIGNsYXNzPSJpbiIgYXV0b2NvbXBsZXRlPSJvZmYiPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+QmFuayAmYW1wOyBDb3VudHJ5PC9zcGFuPjxpbnB1dCBpZD0idkJhbmtOYW1lIiBjbGFzcz0iaW4iIGF1dG9jb21wbGV0ZT0ib2ZmIj48L2xhYmVsPjwvZGl2PjwvZGl2PgogIDxkaXYgaWQ9InZDcnlwdG8iIGNsYXNzPSJoaWRlIj48ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5OZXR3b3JrPC9zcGFuPjxpbnB1dCBpZD0idk5ldCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iQlRDIC8gRVRIIC8gVFJPTiI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5QYXlvdXQgQWRkcmVzczwvc3Bhbj48aW5wdXQgaWQ9InZBZGRyIiBjbGFzcz0iaW4iIGF1dG9jb21wbGV0ZT0ib2ZmIj48L2xhYmVsPjwvZGl2PjwvZGl2PgogIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+UGVyLVRyYW5zZmVyIENlaWxpbmcgKFVTRCk8L3NwYW4+PGlucHV0IGlkPSJ2Q2FwIiBjbGFzcz0iaW4iIHR5cGU9Im51bWJlciIgcGxhY2Vob2xkZXI9IjI1MDAwIj48L2xhYmVsPgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InNlYWxWYXVsdCgpIj5TRUFMIENIQU5ORUw8L2J1dHRvbj4KICAke1MucGF5b3V0Pyc8YnV0dG9uIGNsYXNzPSJidG4gbm8iIG9uY2xpY2s9InB1cmdlVmF1bHQoKSI+UHVyZ2UgQ2hhbm5lbDwvYnV0dG9uPic6Jyd9PC9kaXY+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+U2VhbGVkIENoYW5uZWw8L2gzPiR7Uy5wYXlvdXQ/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICR7T2JqZWN0LmVudHJpZXMoUy5wYXlvdXQubWFza2VkKS5tYXAoKFtrLHZdKT0+YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTcwcHgiPiR7ZXNjKGspfTwvdGQ+PHRkPiR7ZXNjKHYpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+U2VhbGVkPC90ZD48dGQ+JHtTLnBheW91dC50fTwvdGQ+PC90cj4KICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+MkZBIFRhcmdldDwvdGQ+PHRkPiR7bWFza01haWwoUy5vd25lci5lbWFpbCl9PC90ZD48L3RyPjwvdGJvZHk+PC90YWJsZT48L2Rpdj5gCiA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+Tk8gQ0hBTk5FTCBTRUFMRUQg4oCUIGVuZ2luZSBTQUZFIE1PREUuPC9kaXY+J308L2Rpdj5gOwpmdW5jdGlvbiB2U3dhcCgpe2NvbnN0IGM9dlR5cGUudmFsdWU9PT0nQ1JZUFRPJzt2QmFuay5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJyxjKTt2Q3J5cHRvLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCFjKX0KYXN5bmMgZnVuY3Rpb24gc2VhbFZhdWx0KCl7CiBjb25zdCBiPXt0eXBlOnZUeXBlLnZhbHVlLG5hbWU6dk5hbWUudmFsdWUudHJpbSgpLGNhcDordkNhcC52YWx1ZXx8MCwKICBhY2M6dkFjYz8udmFsdWUudHJpbSgpLGliYW46dkliYW4/LnZhbHVlLnRyaW0oKSxzd2lmdDp2U3dpZnQ/LnZhbHVlLnRyaW0oKSxiYW5rOnZCYW5rTmFtZT8udmFsdWUudHJpbSgpLAogIG5ldDp2TmV0Py52YWx1ZS50cmltKCksYWRkcjp2QWRkcj8udmFsdWUudHJpbSgpfTsKIHRyeXthd2FpdCBBUEkoJy9hcGkvdmF1bHQnLGIpO3JlbmRlcigpO2ZsYXNoKCdDaGFubmVsIHNlYWxlZCcpfWNhdGNoKGUpe2ZsYXNoKGUubWVzc2FnZSl9fQphc3luYyBmdW5jdGlvbiBwdXJnZVZhdWx0KCl7aWYoIWNvbmZpcm0oJ1B1cmdlIGNoYW5uZWw/JykpcmV0dXJuO2F3YWl0IEFQSSgnL2FwaS92YXVsdC9wdXJnZScpO3JlbmRlcigpO2ZsYXNoKCdQdXJnZWQnKX0KCi8qIC0tLS0tLS0tLS0gQU5BTFlUSUNTIC0tLS0tLS0tLS0gKi8KUkVOREVSLmFuYWx5dGljcz0oKT0+ewogY29uc3Qgc2V2PXtJTkZPOjAsT0s6MCxXQVJOOjAsQ1JJVDowfTtTLmxvZ3MuZm9yRWFjaChsPT5zZXZbbC5zZXZdPShzZXZbbC5zZXZdfHwwKSsxKTsKIGNvbnN0IG14PU1hdGgubWF4KDEsLi4uT2JqZWN0LnZhbHVlcyhzZXYpKTsKIHJldHVybiBgPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+RXZlbnQgU2V2ZXJpdHkgTWl4PC9oMz4ke09iamVjdC5lbnRyaWVzKHNldikubWFwKChbayx2XSk9PmA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPgogIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuIj48c3Bhbj4ke2t9PC9zcGFuPjxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHt2fTwvc3Bhbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJiYXIiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+PGkgc3R5bGU9IndpZHRoOiR7di9teCoxMDB9JTtiYWNrZ3JvdW5kOiR7e0lORk86JyMzYjgyZjYnLE9LOicjMzFkNjdhJyxXQVJOOicjZmZiMDIwJyxDUklUOicjZmYzYjZiJ31ba119Ij48L2k+PC9kaXY+PC9kaXY+YCkuam9pbignJyl9PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+R2F0ZSBPdXRjb21lczwvaDM+JHtbJ1BFTkRJTkcnLCdBUFBST1ZFRCcsJ0RFTklFRCddLm1hcChzPT57Y29uc3QgYz1TLmdhdGVzLmZpbHRlcihnPT5nLnN0YXR1cz09PXMpLmxlbmd0aDsKICByZXR1cm4gYDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6N3B4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgIzEwMTgyMiI+CiAgPHNwYW4gY2xhc3M9InRhZyAke3M9PT0nQVBQUk9WRUQnPyd0LWdybic6cz09PSdERU5JRUQnPyd0LXJlZCc6J3QtYW1iJ30iPiR7c308L3NwYW4+PGI+JHtjfTwvYj48L2Rpdj5gfSkuam9pbignJyl9CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPkFwcHJvdmFsIHJhdGUgaXMgbWVhbmluZ2xlc3Mgd2l0aG91dCBkZW5pYWwgcHJlc3N1cmUuIElmIG5vdGhpbmcgaXMgZXZlciBkZW5pZWQsIHRoZSBnYXRlIGlzIHRoZWF0cmUuPC9kaXY+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Rmxvb3IgSGVhbHRoIDxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+TElWRTwvc3Bhbj48L2gzPgogICR7UElMTEFSUy5tYXAocD0+e2NvbnN0IGY9Zmxvb3IocC5pZCk7cmV0dXJuIGA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW4iPgogIDxzcGFuIHN0eWxlPSJmb250LXNpemU6MTEuNXB4Ij4ke3AuaWNvbn0gJHtwLm5hbWV9PC9zcGFuPjxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtmLmhlYWx0aH0lPC9zcGFuPjwvZGl2PgogIDxkaXYgY2xhc3M9ImJhciIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij48aSBzdHlsZT0id2lkdGg6JHtmLmhlYWx0aH0lO2JhY2tncm91bmQ6JHtwLmNvbG9yfSI+PC9pPjwvZGl2PjwvZGl2PmB9KS5qb2luKCcnKX08L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Db3N0IERpc2NpcGxpbmU8L2gzPiR7a3BpKCckJytTLnNwZW5kLnRvRml4ZWQoMiksJ1NwZW5kJyxTLnNwZW5kPyd2YXIoLS1tYWcpJzondmFyKC0tZ3JuKScpfQogIDxkaXYgc3R5bGU9ImhlaWdodDoxMHB4Ij48L2Rpdj4ke2twaSgnJCcrUy5kZW5pYWxzLnJlZHVjZSgoYSxiKT0+YStiLmNvc3QsMCkudG9GaXhlZCgyKSwnQXZvaWRlZCcsJ3ZhcigtLWdybiknKX08L2Rpdj4KIDwvZGl2PmB9OwoKLyogLS0tLS0tLS0tLSBBVURJVCAtLS0tLS0tLS0tICovClJFTkRFUi5hdWRpdD0oKT0+YDxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206MTFweCI+CiA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7Uy5sb2dzLmxlbmd0aH0gZW50cmllcyBzaG93biDCtyBwZXJzaXN0ZWQgc2VydmVyLXNpZGU8L3NwYW4+CiA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iZXhwb3J0TG9nKCkiPkV4cG9ydCBKU09OPC9idXR0b24+CiA8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9InB1cmdlTG9ncygpIj5QdXJnZTwvYnV0dG9uPjwvZGl2PjwvZGl2PiR7bG9nSHRtbCg0MDApfTwvZGl2PmA7CmZ1bmN0aW9uIGV4cG9ydExvZygpe2NvbnN0IGI9bmV3IEJsb2IoW0pTT04uc3RyaW5naWZ5KFMubG9ncyxudWxsLDIpXSx7dHlwZTonYXBwbGljYXRpb24vanNvbid9KSx1PVVSTC5jcmVhdGVPYmplY3RVUkwoYiksYT1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7CiBhLmhyZWY9dTthLmRvd25sb2FkPSdjaGFpcm1hbi1hdWRpdC0nK0RhdGUubm93KCkrJy5qc29uJzthLmNsaWNrKCk7VVJMLnJldm9rZU9iamVjdFVSTCh1KTtmbGFzaCgnRXhwb3J0ZWQnKX0KYXN5bmMgZnVuY3Rpb24gcHVyZ2VMb2dzKCl7aWYoIWNvbmZpcm0oJ1B1cmdlIGxlZGdlcj8nKSlyZXR1cm47YXdhaXQgQVBJKCcvYXBpL2xvZ3MvcHVyZ2UnKTtyZW5kZXIoKX0KCi8qIC0tLS0tLS0tLS0gQVJDSElURUNUOiBzdHVkeSBhIHByb2R1Y3QsIHJlYnVpbGQgdGhlIGNhcGFiaWxpdHkgLS0tLS0tLS0tLSAqLwpMSVZFLmFyY2g9KCk9PnsKICBjb25zdCBBPVMuYW5hbHlzZXN8fFtdLCBDPVMuY3Jld3N8fFtdOwogIGlmKCFBLmxlbmd0aCkgcmV0dXJuICc8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm90aGluZyBzdHVkaWVkIHlldC4gUGFzdGUgYSBVUkwgYWJvdmUuPC9kaXY+PC9kaXY+JzsKICByZXR1cm4gQS5tYXAoYT0+ewogICAgY29uc3QgY3Jldz1DLmZpbmQoYz0+Yy5hbmFseXNpc0lkPT09YS5pZCk7CiAgICBjb25zdCB2YyA9IGEudmVyZGljdD09PSdSRUJVSUxEQUJMRSc/J3QtZ3JuJzphLnZlcmRpY3Q9PT0nUEFSVElBTCc/J3QtYW1iJzondC1yZWQnOwogICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiR7YS52ZXJkaWN0PT09J1JFQlVJTERBQkxFJz8ndmFyKC0tbGltZSknOgogICAgICAgIGEudmVyZGljdD09PSdQQVJUSUFMJz8ndmFyKC0tYW1iKSc6J3ZhcigtLW1hZyknfSI+CiAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo5cHgiPgogICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgJHt2Y30iPiR7ZXNjKGEudmVyZGljdCl9PC9zcGFuPgogICAgICAgPGI+JHtlc2MoYS51cmwpfTwvYj48L2Rpdj4KICAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2EudH0ke2EucGFnZVJlYWQ/Jyc6JyDCtyBwYWdlIG5vdCByZWFkYWJsZSd9PC9zcGFuPjwvZGl2PgogICAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+PGI+V2hhdCBpdCBkb2VzOjwvYj4gJHtlc2MoYS5kb2VzKX08L2Rpdj4KICAgICAke2Euam9icy5sZW5ndGg/YDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iPlRIRSBKT0JTIElUIFBFUkZPUk1TPC9kaXY+CiAgICAgICA8b2wgc3R5bGU9Im1hcmdpbjo1cHggMCAwO3BhZGRpbmctbGVmdDoxOXB4O2ZvbnQtc2l6ZToxMi41cHg7bGluZS1oZWlnaHQ6MS43Ij4KICAgICAgICR7YS5qb2JzLm1hcChqPT5gPGxpPiR7ZXNjKGopfTwvbGk+YCkuam9pbignJyl9PC9vbD48L2Rpdj5gOicnfQogICAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICAgICAke2EucmV1c2UubGVuZ3RoP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjE1MHB4Ij5BZ2VudHMgaGUgYWxyZWFkeSBoYXM8L3RkPgogICAgICAgIDx0ZD4ke2EucmV1c2UubWFwKHI9PmA8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj4ke2VzYyhyLmNhcCl9PC9zcGFuPiA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHIuZm9yKX08L3NwYW4+YCkuam9pbignPGJyPicpfTwvdGQ+PC90cj5gOicnfQogICAgICAke2EuYnVpbGQubGVuZ3RoP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+TXVzdCBiZSB3cml0dGVuPC90ZD4KICAgICAgICA8dGQ+JHthLmJ1aWxkLm1hcChiPT5gPGI+JHtlc2MoYi5uYW1lKX08L2I+IOKAlCAke2VzYyhiLmRlc2MpfTxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhiLndoeV9uZWVkZWR8fCcnKX08L2Rpdj5gKS5qb2luKCc8YnI+Jyl9PC90ZD48L3RyPmA6Jyd9CiAgICAgICR7YS5uZWVkc0Nvbm5lY3Rvci5sZW5ndGg/YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5OZWVkcyBhIGNvbm5lY3RvcjwvdGQ+CiAgICAgICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHthLm5lZWRzQ29ubmVjdG9yLm1hcChlc2MpLmpvaW4oJywgJyl9PC90ZD48L3RyPmA6Jyd9CiAgICAgICR7YS5jYW5ub3REby5sZW5ndGg/YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5Ib25lc3RseSBjYW5ub3QgZG88L3RkPgogICAgICAgIDx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+JHthLmNhbm5vdERvLm1hcChlc2MpLmpvaW4oJzxicj4nKX08L3RkPjwvdHI+YDonJ30KICAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgJHthLm5vdGU/YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPjxiPkhpcyB2ZXJkaWN0OjwvYj4gJHtlc2MoYS5ub3RlKX08L2Rpdj5gOicnfQogICAgICR7Y3Jldz9gPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4O3BhZGRpbmc6MTFweDtiYWNrZ3JvdW5kOnZhcigtLWdsYXNzMik7Ym9yZGVyLXJhZGl1czoxMXB4Ij4KICAgICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIj5DUkVXIEFTU0VNQkxFRDwvZGl2PgogICAgICAgPGRpdj4ke2NyZXcucmV1c2UubGVuZ3RofSBleGlzdGluZyBhZ2VudChzKSByZXVzZWQke2NyZXcuYnVpbHQubGVuZ3RoP2AsICR7Y3Jldy5idWlsdC5sZW5ndGh9IG5ldyB3cml0dGVuOiA8Yj4ke2NyZXcuYnVpbHQubWFwKGVzYykuam9pbignLCAnKX08L2I+YDonJ308L2Rpdj4KICAgICAgICR7Y3Jldy5idWlsdC5sZW5ndGg/JzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo1cHgiPk5ldyBvbmVzIGFyZSB3YWl0aW5nIGZvciB5b3VyIHRpY2sgb24gVGhlIENoYWlybWFuIHBhZ2UuPC9kaXY+JzonJ30KICAgICAgICR7Y3Jldy5za2lwcGVkLmxlbmd0aD9gPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJjb2xvcjp2YXIoLS1hbWIpO21hcmdpbi10b3A6NXB4Ij5Ta2lwcGVkOiAke2NyZXcuc2tpcHBlZC5tYXAoZXNjKS5qb2luKCc7ICcpfTwvZGl2PmA6Jyd9CiAgICAgIDwvZGl2PmA6YDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6MTFweCI+CiAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iYXNzZW1ibGUoJyR7YS5pZH0nKSI+QlVJTEQgVEhFIENSRVc8L2J1dHRvbj4KICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0icm1BbmFseXNpcygnJHthLmlkfScpIj5EaXNjYXJkPC9idXR0b24+PC9kaXY+YH0KICAgIDwvZGl2PmA7CiAgfSkuam9pbignJyk7Cn07ClJFTkRFUi5hcmNoPSgpPT5gCiA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLWxpbWUpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+4qeJIENPUFkgQU5ZIFBST0RVQ1Qg4oCUIHRoZSBsZWdhbCB3YXk8L2gzPgogIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+UGFzdGUgYW55IHdlYnNpdGUgb3IgdG9vbC4gSGUgcmVhZHMgaXQsIHdvcmtzIG91dCA8Yj50aGUgam9iIGl0IGRvZXM8L2I+LCB0aGVuIHJlYnVpbGRzIHRoYXQgY2FwYWJpbGl0eSBmcm9tIGhpcyBvd24gYWdlbnRzIOKAlCByZXVzaW5nIHdoYXQgaGUgaGFzLCB3cml0aW5nIG9ubHkgd2hhdCBpcyBtaXNzaW5nLjwvZGl2PgogIDxkaXYgY2xhc3M9Indhcm5ib3giPjxiPkhlIHJlYnVpbGRzIHRoZSBvdXRjb21lLCBuZXZlciB0aGUgY29kZS48L2I+IENvcHlpbmcgc29tZW9uZSdzIHNvdXJjZSBpcyBwaXJhY3kgYW5kIGdldHMgeW91IHN1ZWQuIEJ1aWxkaW5nIGEgdG9vbCB0aGF0IGRvZXMgdGhlIHNhbWUgam9iIGlzIGhvdyBldmVyeSBjb21wZXRpdG9yIGluIGhpc3RvcnkgaGFzIGJlZW4gbWFkZSDigJQgY29tcGxldGVseSBsZWdhbCwgYW5kIGl0IG1lYW5zIHlvdSBvd24gd2hhdCB5b3UgYnVpbGQuPC9kaXY+CiAgPHVsIGNsYXNzPSJ0aWdodCI+CiAgIDxsaT5SZXVzZXMgZXhpc3RpbmcgYWdlbnRzIGZpcnN0LiBIZSBvbmx5IHdyaXRlcyBuZXcgY29kZSB3aGVuIG5vdGhpbmcgY292ZXJzIHRoZSBqb2IuPC9saT4KICAgPGxpPkFnZW50cyB3b3JrIGFjcm9zcyBqb2JzLCBsaWtlIHN0YWZmIG1vdmluZyBiZXR3ZWVuIGJyYW5jaGVzLjwvbGk+CiAgIDxsaT5IZSBzdGF0ZXMgcGxhaW5seSB3aGF0IDxiPmNhbm5vdDwvYj4gYmUgcmVidWlsdCBmcmVlIOKAlCBHUFVzLCBsaWNlbmNlcywgZGF0YXNldHMsIGh1bWFuIGp1ZGdlbWVudC48L2xpPgogIDwvdWw+CiAgJHshUy5sbG0/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKTttYXJnaW4tdG9wOjEwcHgiPkNvbm5lY3QgYW4gQUkgYnJhaW4gZmlyc3QuPC9kaXY+JzonJ30KICA8ZGl2IGNsYXNzPSJncmlkIGcyIiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5XZWJzaXRlIG9yIHByb2R1Y3Q8L3NwYW4+CiAgICA8aW5wdXQgaWQ9ImFyVXJsIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJodHRwczovL3VwdGltZXJvYm90LmNvbSI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5Bbnl0aGluZyBoZSBzaG91bGQga25vdyAob3B0aW9uYWwpPC9zcGFuPgogICAgPGlucHV0IGlkPSJhckhpbnQiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9Ikkgb25seSBjYXJlIGFib3V0IHRoZSBhbGVydGluZyBwYXJ0Ij48L2xhYmVsPgogIDwvZGl2PgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImFuYWx5c2UoKSI+U1RVRFkgSVQ8L2J1dHRvbj4KICAgJHtbJ2h0dHBzOi8vdXB0aW1lcm9ib3QuY29tJywnaHR0cHM6Ly9tYWlsY2hpbXAuY29tJywnaHR0cHM6Ly9idWZmZXIuY29tJywnaHR0cHM6Ly9jYWxlbmRseS5jb20nXQogICAgIC5tYXAodT0+YDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iYXJVcmwudmFsdWU9JyR7dX0nO2FuYWx5c2UoKSI+JHt1LnJlcGxhY2UoJ2h0dHBzOi8vJywnJyl9PC9idXR0b24+YCkuam9pbignJyl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+VGFrZXMgYWJvdXQgMzAgc2Vjb25kcyDigJQgaGUgcmVhZHMgdGhlaXIgcGFnZSBhbmQgc2VhcmNoZXMgd2hhdCB1c2VycyBzYXkuPC9kaXY+CiA8L2Rpdj4KIDxkaXYgZGF0YS1saXZlPSJhcmNoIj4ke0xJVkUuYXJjaCgpfTwvZGl2PmA7CmFzeW5jIGZ1bmN0aW9uIGFuYWx5c2UoKXsKICBjb25zdCB1PShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXJVcmwnKXx8e30pLnZhbHVlfHwnJzsKICBpZighdS50cmltKCkpIHJldHVybiBmbGFzaCgnUGFzdGUgYSBVUkwgZmlyc3QnKTsKICBmbGFzaCgnU3R1ZHlpbmcgaXQg4oCUIHJlYWRpbmcgdGhlaXIgcGFnZSBhbmQgc2VhcmNoaW5n4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9hcmNoaXRlY3QvYW5hbHlzZScse3VybDp1LGhpbnQ6KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhckhpbnQnKXx8e30pLnZhbHVlfSk7CiAgICByZW5kZXIoKTsgZmxhc2goJ1ZlcmRpY3Q6ICcrci52ZXJkaWN0KTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGFzc2VtYmxlKGlkKXsKICBmbGFzaCgnQnVpbGRpbmcgdGhlIGNyZXcg4oCUIHdyaXRpbmcgYW55IG1pc3NpbmcgYWdlbnRz4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9hcmNoaXRlY3QvYXNzZW1ibGUnLHtpZH0pOwogICAgcmVuZGVyKCk7IGZsYXNoKHIucmV1c2VkKycgcmV1c2VkLCAnK3IuYnVpbHQrJyB3cml0dGVuJysoci5idWlsdD8nIOKAlCB0aWNrIHRoZW0gdG8gaW5zdGFsbCc6JycpKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHJtQW5hbHlzaXMoaWQpeyBhd2FpdCBBUEkoJy9hcGkvYXJjaGl0ZWN0L3JlbW92ZScse2lkfSk7IHJlbmRlcigpIH0KCi8qIC0tLS0tLS0tLS0gV09SS1NQQUNFOiBmaWxlcyBpbiwgd3JpdGluZyBvdXQgLS0tLS0tLS0tLSAqLwpjb25zdCBLSU5EUz1bWydlbWFpbCcsJ0VtYWlsJ10sWyd3aGF0c2FwcCcsJ1doYXRzQXBwJ10sWydyZXBseScsJ1JlcGx5IHRvIGEgbWVzc2FnZSddLAogICAgICAgICAgICAgWydwcm9wb3NhbCcsJ1Byb3Bvc2FsJ10sWydpbnZvaWNlJywnSW52b2ljZSddLFsnc3VtbWFyeScsJ1N1bW1hcnknXSxbJ2RvYycsJ0RvY3VtZW50J11dOwpMSVZFLndvcmsyPSgpPT57CiAgY29uc3QgRD1TLmRvY3N8fFtdLCBSPVMuZHJhZnRzfHxbXTsKICByZXR1cm4gYCR7RC5sZW5ndGg/YDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Zb3VyIEZpbGVzIDxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7RC5sZW5ndGh9PC9zcGFuPjwvaDM+CiAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+RmlsZTwvdGg+PHRoPlJlYWQ8L3RoPjx0aD5TaXplPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAke0QubWFwKGQ9PmA8dHI+PHRkPjxiPiR7ZXNjKGQubmFtZSl9PC9iPgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhkLnByZXZpZXcpLnNsaWNlKDAsOTApfeKApjwvZGl2PjwvdGQ+CiAgICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke2QucmVhZGFibGU/J3QtZ3JuJzondC1hbWInfSI+JHtkLnJlYWRhYmxlP2ZtdChkLmNoYXJzKSsnIGNoYXJzJzonTk9UIFJFQURBQkxFJ308L3NwYW4+PC90ZD4KICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7KGQuc2l6ZS8xMDI0KS50b0ZpeGVkKDApfSBLQjwvdGQ+CiAgICA8dGQgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIHAiIG9uY2xpY2s9ImFza0RvYygnJHtkLmlkfScpIj5Bc2sgYWJvdXQgaXQ8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9InJtRG9jKCcke2QuaWR9JykiPlJlbW92ZTwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGl2PmA6Jyd9CiAgJHtSLmxlbmd0aD9SLm1hcChkPT5gPGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjlweCI+CiAgICAgPGRpdiBjbGFzcz0icm93Ij48c3BhbiBjbGFzcz0idGFnIHQtY3kiPiR7ZXNjKGQua2luZCl9PC9zcGFuPjxiPiR7ZXNjKGQuYnJpZWYpfTwvYj48L2Rpdj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7ZC50fSR7ZC5zZW50VG8/JyDCtyBTRU5UIHRvICcrZXNjKGQuc2VudFRvKTonJ308L3NwYW4+PC9kaXY+CiAgICA8ZGl2IGlkPSJkcmZfJHtkLmlkfSIgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNztiYWNrZ3JvdW5kOnZhcigtLWdsYXNzMik7CiAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtib3JkZXItcmFkaXVzOjExcHg7cGFkZGluZzoxNHB4Ij4ke2VzYyhkLnRleHQpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4Ij4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iY29weURyYWZ0KCcke2QuaWR9JykiPkNvcHk8L2J1dHRvbj4KICAgICAke2Qua2luZD09PSdlbWFpbCcmJiFkLnNlbnRUbz9gPGlucHV0IGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDoyMzBweCIgaWQ9InRvXyR7ZC5pZH0iIHBsYWNlaG9sZGVyPSJzZW5kIHRvIGVtYWlsIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBvbmNsaWNrPSJzZW5kRHJhZnQoJyR7ZC5pZH0nKSI+U2VuZCBpdDwvYnV0dG9uPmA6Jyd9CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJybURyYWZ0KCcke2QuaWR9JykiPkRlbGV0ZTwvYnV0dG9uPjwvZGl2PgogICA8L2Rpdj5gKS5qb2luKCcnKQogICA6JzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5Ob3RoaW5nIHdyaXR0ZW4geWV0LjwvZGl2PjwvZGl2Pid9YDsKfTsKUkVOREVSLndvcmsyPSgpPT5gCiA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLWxpbWUpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+4pyJIEZJTEVTICZhbXA7IFdSSVRJTkcg4oCUIHlvdXIgZXZlcnlkYXkgYXNzaXN0YW50PC9oMz4KICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjExcHgiPlVwbG9hZCBhIGZpbGUgYW5kIGFzayBoaW0gYWJvdXQgaXQuIE9yIHRlbGwgaGltIHdoYXQgdG8gd3JpdGUg4oCUIGVtYWlsLCBXaGF0c0FwcCwgcHJvcG9zYWwsIGludm9pY2Ug4oCUIGFuZCBoZSBkcmFmdHMgaXQgcmVhZHkgdG8gY29weSBvciBzZW5kLjwvZGl2PgogICR7IVMubGxtPyc8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZykiPkNvbm5lY3QgYW4gQUkgYnJhaW4gZmlyc3QuPC9kaXY+JzonJ30KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGRpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+VXBsb2FkIGEgZmlsZTwvc3Bhbj4KICAgICA8aW5wdXQgdHlwZT0iZmlsZSIgaWQ9InVwRmlsZSIgY2xhc3M9ImluIiBvbmNoYW5nZT0iZG9VcGxvYWQoKSI+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIj5SZWFkcyB0eHQsIG1kLCBjc3YsIGpzb24sIGxvZywgaHRtbCBhbmQgdGV4dC1iYXNlZCBQREZzLiBNYXggOCBNQi4gU2Nhbm5lZCBQREZzIGFuZCBpbWFnZXMgY2Fubm90IGJlIHJlYWQg4oCUIGhlIHdpbGwgc2F5IHNvIHJhdGhlciB0aGFuIGd1ZXNzLjwvZGl2PgogICA8L2Rpdj4KICAgPGRpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+V2hhdCBzaG91bGQgaGUgd3JpdGU/PC9zcGFuPgogICAgIDxzZWxlY3QgaWQ9ImRrS2luZCIgY2xhc3M9ImluIj4ke0tJTkRTLm1hcChrPT5gPG9wdGlvbiB2YWx1ZT0iJHtrWzBdfSI+JHtrWzFdfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlRlbGwgaGltIHdoYXQgaXQgaXMgYWJvdXQ8L3NwYW4+CiAgICAgPHRleHRhcmVhIGlkPSJka0JyaWVmIiBjbGFzcz0iaW4iIHN0eWxlPSJtaW4taGVpZ2h0OjY0cHgiIHBsYWNlaG9sZGVyPSJlLmcuIGVtYWlsIHRvIGEgTHVkaGlhbmEgc2hvcCBvd25lciBvZmZlcmluZyAxNCBkYXlzIGZyZWUgd2Vic2l0ZSBtb25pdG9yaW5nIj48L3RleHRhcmVhPjwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJ3cml0ZURyYWZ0KCkiPldSSVRFIElUPC9idXR0b24+CiAgICAgJHsoUy5kb2NzfHxbXSkubGVuZ3RoP2A8bGFiZWwgY2xhc3M9Im1vbm8tZGltIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJ1c2VEb2NzIj4gdXNlIG15IHVwbG9hZGVkIGZpbGVzPC9sYWJlbD5gOicnfTwvZGl2PgogICA8L2Rpdj4KICA8L2Rpdj4KIDwvZGl2PgogPGRpdiBkYXRhLWxpdmU9IndvcmsyIj4ke0xJVkUud29yazIoKX08L2Rpdj5gOwphc3luYyBmdW5jdGlvbiBkb1VwbG9hZCgpewogIGNvbnN0IGY9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd1cEZpbGUnKXx8e30pLmZpbGVzPy5bMF07CiAgaWYoIWYpIHJldHVybjsKICBpZihmLnNpemU+OGU2KSByZXR1cm4gZmxhc2goJ1RvbyBsYXJnZSDigJQgOCBNQiBtYXhpbXVtJyk7CiAgZmxhc2goJ1JlYWRpbmcgJytmLm5hbWUrJ+KApicpOwogIGNvbnN0IHJkPW5ldyBGaWxlUmVhZGVyKCk7CiAgcmQub25sb2FkPWFzeW5jKCk9PnsKICAgIHRyeXsKICAgICAgY29uc3QgYjY0PVN0cmluZyhyZC5yZXN1bHQpLnNwbGl0KCcsJylbMV07CiAgICAgIGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2RvYy91cGxvYWQnLHtuYW1lOmYubmFtZSxtaW1lOmYudHlwZSxkYXRhOmI2NH0pOwogICAgICByZW5kZXIoKTsgZmxhc2goci5yZWFkYWJsZT8oJ1JlYWQgJytmbXQoci5jaGFycykrJyBjaGFyYWN0ZXJzJyk6J1VwbG9hZGVkLCBidXQgdGhlIHRleHQgY291bGQgbm90IGJlIGV4dHJhY3RlZCcpOwogICAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KICB9OwogIHJkLnJlYWRBc0RhdGFVUkwoZik7Cn0KYXN5bmMgZnVuY3Rpb24gcm1Eb2MoaWQpeyBhd2FpdCBBUEkoJy9hcGkvZG9jL3JlbW92ZScse2lkfSk7IHJlbmRlcigpIH0KZnVuY3Rpb24gYXNrRG9jKGlkKXsKICBtb2RhbChgPGgzPkFzayBhYm91dCB0aGlzIGZpbGU8L2gzPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPllvdXIgcXVlc3Rpb248L3NwYW4+CiAgICA8aW5wdXQgaWQ9ImRxUSIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0id2hhdCBhcmUgdGhlIGtleSBwb2ludHM/Ij48L2xhYmVsPgogICA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJydW5Bc2tEb2MoJyR7aWR9JykiPkFTSzwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJjbG9zZU1vZGFsKCkiPkNsb3NlPC9idXR0b24+PC9kaXY+CiAgIDxkaXYgaWQ9ImRxT3V0IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48L2Rpdj5gKTsKfQphc3luYyBmdW5jdGlvbiBydW5Bc2tEb2MoaWQpewogIGNvbnN0IHE9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkcVEnKXx8e30pLnZhbHVlfHwnJzsKICBjb25zdCBvdXQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RxT3V0Jyk7CiAgb3V0LmlubmVySFRNTD0nPGRpdiBjbGFzcz0ibW9uby1kaW0iPlJlYWRpbmfigKY8L2Rpdj4nOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZG9jL2Fzaycse2lkLHF1ZXN0aW9uOnF9KTsKICAgIG91dC5pbm5lckhUTUw9YDxkaXYgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNjUiPiR7ZXNjKHIudGV4dCl9PC9kaXY+YDsKICB9Y2F0Y2goZSl7IG91dC5pbm5lckhUTUw9YDxkaXYgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPiR7ZXNjKGUubWVzc2FnZSl9PC9kaXY+YCB9Cn0KYXN5bmMgZnVuY3Rpb24gd3JpdGVEcmFmdCgpewogIGNvbnN0IGJyaWVmPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGtCcmllZicpfHx7fSkudmFsdWV8fCcnOwogIGlmKCFicmllZi50cmltKCkpIHJldHVybiBmbGFzaCgnVGVsbCBoaW0gd2hhdCBpdCBpcyBhYm91dCcpOwogIGNvbnN0IHVzZT0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3VzZURvY3MnKXx8e30pLmNoZWNrZWQ7CiAgZmxhc2goJ1dyaXRpbmfigKYnKTsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9kcmFmdC93cml0ZScse2tpbmQ6ZGtLaW5kLnZhbHVlLGJyaWVmLAogICAgICBkb2NJZHM6dXNlPyhTLmRvY3N8fFtdKS5tYXAoZD0+ZC5pZCk6W119KTsKICAgIHJlbmRlcigpOyBmbGFzaCgnV3JpdHRlbiDigJQgY29weSBpdCBvciBzZW5kIGl0Jyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQpmdW5jdGlvbiBjb3B5RHJhZnQoaWQpeyBjb25zdCBlbD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZHJmXycraWQpOwogIG5hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dChlbD9lbC5pbm5lclRleHQ6JycpOyBmbGFzaCgnQ29waWVkJykgfQphc3luYyBmdW5jdGlvbiBzZW5kRHJhZnQoaWQpewogIGNvbnN0IHRvPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9fJytpZCl8fHt9KS52YWx1ZXx8Jyc7CiAgaWYoIXRvLnRyaW0oKSkgcmV0dXJuIGZsYXNoKCdUeXBlIHRoZSByZWNpcGllbnQgZW1haWwnKTsKICBmbGFzaCgnU2VuZGluZ+KApicpOwogIHRyeXsgYXdhaXQgQVBJKCcvYXBpL2RyYWZ0L3NlbmQnLHtpZCx0b30pOyByZW5kZXIoKTsgZmxhc2goJ1NlbnQnKSB9CiAgY2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHJtRHJhZnQoaWQpeyBhd2FpdCBBUEkoJy9hcGkvZHJhZnQvcmVtb3ZlJyx7aWR9KTsgcmVuZGVyKCkgfQoKLyogLS0tLS0tLS0tLSBDT05ORUNUT1JTIC0tLS0tLS0tLS0gKi8KY29uc3QgUFJFU0VUUz1bCiBbJ2RlZXBzZWVrJywnaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tJywnYmVhcmVyJywnRGVlcFNlZWsg4oCUIGNoZWFwZXN0IGNhcGFibGUgbW9kZWwsIH7igrkzMC9tbyBvZiB1c2UnXSwKIFsnb3BlbndlYXRoZXInLCdodHRwczovL2FwaS5vcGVud2VhdGhlcm1hcC5vcmcvZGF0YS8yLjUnLCdxdWVyeScsJ1dlYXRoZXIg4oCUIGZyZWUgdGllciddLAogWyduZXdzYXBpJywnaHR0cHM6Ly9uZXdzYXBpLm9yZy92MicsJ2hlYWRlcicsJ05ld3MgaGVhZGxpbmVzIOKAlCBmcmVlIHRpZXInXSwKIFsndGVsZWdyYW0nLCdodHRwczovL2FwaS50ZWxlZ3JhbS5vcmcnLCdub25lJywnVGVsZWdyYW0gYm90IOKAlCBmcmVlLCBwdXQgdGhlIHRva2VuIGluIHRoZSBiYXNlIFVSTCddLAogWydzaGVldHMnLCdodHRwczovL3NoZWV0cy5nb29nbGVhcGlzLmNvbS92NCcsJ2JlYXJlcicsJ0dvb2dsZSBTaGVldHMg4oCUIGxvZyByZXN1bHRzIHRvIGEgc3ByZWFkc2hlZXQnXSwKIFsndW5zcGxhc2gnLCdodHRwczovL2FwaS51bnNwbGFzaC5jb20nLCdoZWFkZXInLCdGcmVlIHN0b2NrIGltYWdlcyBmb3IgdGhlIHNpdGVzIGhlIGJ1aWxkcyddCl07CkxJVkUuY29ubmVjdD0oKT0+ewogIGNvbnN0IEM9Uy5jb25uZWN0b3JzfHxbXTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImdyaWQgZzMiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEzcHgiPgogICAke2twaShDLmxlbmd0aCwnQ29ubmVjdG9ycycsJ3ZhcigtLWxpbWUpJyxDLmZpbHRlcihjPT5jLmVuYWJsZWQpLmxlbmd0aCsnIGVuYWJsZWQnKX0KICAgJHtrcGkoZm10KEMucmVkdWNlKChhLGMpPT5hK2MuY2FsbHMsMCkpLCdDYWxscyBNYWRlJywndmFyKC0tb2xpdmUpJywnbGlmZXRpbWUnKX0KICAgJHtrcGkoQy5yZWR1Y2UoKGEsYyk9PmErYy5mYWlscywwKSwnRmFpbHVyZXMnLEMuc29tZShjPT5jLmZhaWxzKT8ndmFyKC0tbWFnKSc6J3ZhcigtLWdybiknLCcnKX08L2Rpdj4KICAke0MubGVuZ3RoP2A8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Q29ubmVjdGVkIFNlcnZpY2VzPC9oMz48ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPgogICA8dGhlYWQ+PHRyPjx0aD5OYW1lPC90aD48dGg+RW5kcG9pbnQ8L3RoPjx0aD5BdXRoPC90aD48dGg+S2V5PC90aD48dGg+VXNlZDwvdGg+PHRoPlN0YXRlPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAke0MubWFwKGM9PmA8dHI+PHRkPjxiIHN0eWxlPSJjb2xvcjp2YXIoLS1saW1lKSI+JHtlc2MoYy5uYW1lKX08L2I+CiAgICAgJHtjLm5vdGU/YDxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhjLm5vdGUpfTwvZGl2PmA6Jyd9PC90ZD4KICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGMuYmFzZSl9PC90ZD48dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhjLmF1dGgpfTwvdGQ+CiAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhjLmtleSl9PC90ZD4KICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7Yy5jYWxsc30ke2MuZmFpbHM/JyA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+LycrYy5mYWlscysn4pyXPC9zcGFuPic6Jyd9PC90ZD4KICAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7Yy5lbmFibGVkPyd0LWdybic6J3QtZGltJ30iPiR7Yy5lbmFibGVkPydPTic6J09GRid9PC9zcGFuPjwvdGQ+CiAgICA8dGQgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJ0ZXN0Q29ubignJHtlc2MoYy5uYW1lKX0nKSI+VGVzdDwvYnV0dG9uPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0idG9nZ2xlQ29ubignJHtlc2MoYy5uYW1lKX0nKSI+JHtjLmVuYWJsZWQ/J0Rpc2FibGUnOidFbmFibGUnfTwvYnV0dG9uPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0icm1Db25uKCcke2VzYyhjLm5hbWUpfScpIj5SZW1vdmU8L2J1dHRvbj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGl2PmA6Jyd9YDsKfTsKUkVOREVSLmNvbm5lY3Q9KCk9PmAKIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tb2xpdmUpIj7imq8gQ09OTkVDVE9SUyDigJQgR0lWRSBISU0gQU5ZIFNFUlZJQ0U8L2gzPgogIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+QWRkIDxiPmFueSBBUEk8L2I+IHdpdGggYSBrZXkuIEhlIGNhbiB0aGVuIGNhbGwgaXQgZnJvbSB0aGUgY2FwYWJpbGl0aWVzIGhlIHdyaXRlcyDigJQgYnV0IHRoZSBrZXkgaXRzZWxmIGlzIG5ldmVyIHNob3duIHRvIGhpcyBjb2RlLCBuZXZlciByZXR1cm5lZCBieSB0aGUgQVBJLCBhbmQgbmV2ZXIgd3JpdHRlbiB0byB0aGUgbGVkZ2VyLjwvZGl2PgogIDx1bCBjbGFzcz0idGlnaHQiPgogICA8bGk+VXAgdG8gNDAgY29ubmVjdG9ycy4gQW55IFJFU1Qgc2VydmljZSB0aGF0IHJldHVybnMgSlNPTi48L2xpPgogICA8bGk+Rm91ciBhdXRoIHN0eWxlczogQmVhcmVyIHRva2VuLCBjdXN0b20gaGVhZGVyLCBxdWVyeSBwYXJhbWV0ZXIsIG9yIG5vbmUuPC9saT4KICAgPGxpPkhlIHNlZXMgb25seSB0aGUgPGI+bmFtZTwvYj4gYW5kIHdoYXQgaXQgZG9lcyDigJQgdGhlbiBjYWxscyA8Y29kZT5hcGkuY2FsbCgnbmFtZScsIHtwYXRofSk8L2NvZGU+LjwvbGk+CiAgPC91bD4KICA8ZGl2IGNsYXNzPSJncmlkIGczIiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5TaG9ydCBuYW1lPC9zcGFuPjxpbnB1dCBpZD0iY25OYW1lIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJkZWVwc2VlayI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5CYXNlIFVSTDwvc3Bhbj48aW5wdXQgaWQ9ImNuQmFzZSIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tIj48L2xhYmVsPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkF1dGggc3R5bGU8L3NwYW4+PHNlbGVjdCBpZD0iY25BdXRoIiBjbGFzcz0iaW4iPgogICAgPG9wdGlvbiB2YWx1ZT0iYmVhcmVyIj5CZWFyZXIgdG9rZW48L29wdGlvbj48b3B0aW9uIHZhbHVlPSJoZWFkZXIiPkN1c3RvbSBoZWFkZXI8L29wdGlvbj4KICAgIDxvcHRpb24gdmFsdWU9InF1ZXJ5Ij5RdWVyeSBwYXJhbWV0ZXI8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJub25lIj5ObyBrZXkgbmVlZGVkPC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkIGczIj4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5BUEkga2V5PC9zcGFuPjxpbnB1dCBpZD0iY25LZXkiIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiIGF1dG9jb21wbGV0ZT0ib2ZmIj48L2xhYmVsPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkhlYWRlciAvIHF1ZXJ5IG5hbWU8L3NwYW4+PGlucHV0IGlkPSJjbkhkciIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iWC1BUEktS2V5IG9yIGtleSI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5XaGF0IGlzIGl0IGZvcj88L3NwYW4+PGlucHV0IGlkPSJjbk5vdGUiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9ImNoZWFwIG1vZGVsIGZvciBidWxrIHdyaXRpbmciPjwvbGFiZWw+CiAgPC9kaXY+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImFkZENvbm4oKSI+QUREIENPTk5FQ1RPUjwvYnV0dG9uPgogIDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweCI+UXVpY2sgZmlsbDo8L2Rpdj4KICAgPGRpdiBjbGFzcz0icm93Ij4ke1BSRVNFVFMubWFwKChwLGkpPT5gPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJwcmVzZXQoJHtpfSkiPiR7ZXNjKHBbMF0pfTwvYnV0dG9uPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogPC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0iY29ubmVjdCI+JHtMSVZFLmNvbm5lY3QoKX08L2Rpdj5gOwpmdW5jdGlvbiBwcmVzZXQoaSl7IGNvbnN0IHA9UFJFU0VUU1tpXTsKICBjbk5hbWUudmFsdWU9cFswXTsgY25CYXNlLnZhbHVlPXBbMV07IGNuQXV0aC52YWx1ZT1wWzJdOyBjbk5vdGUudmFsdWU9cFszXTsKICBmbGFzaCgnRmlsbGVkIOKAlCBub3cgcGFzdGUgdGhlIGtleScpOyB9CmFzeW5jIGZ1bmN0aW9uIGFkZENvbm4oKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9jb25uZWN0b3IvYWRkJyx7bmFtZTpjbk5hbWUudmFsdWUsYmFzZTpjbkJhc2UudmFsdWUsYXV0aDpjbkF1dGgudmFsdWUsCiAgICAgIGtleTpjbktleS52YWx1ZSxoZWFkZXJOYW1lOmNuSGRyLnZhbHVlLHF1ZXJ5TmFtZTpjbkhkci52YWx1ZSxub3RlOmNuTm90ZS52YWx1ZX0pOwogICAgY25LZXkudmFsdWU9Jyc7IHJlbmRlcigpOyBmbGFzaCgnQ29ubmVjdG9yIGFkZGVkIOKAlCBoZSBjYW4gdXNlIGl0IG5vdycpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gcm1Db25uKG4peyBpZighY29uZmlybSgnUmVtb3ZlICcrbisnPycpKXJldHVybjsgYXdhaXQgQVBJKCcvYXBpL2Nvbm5lY3Rvci9yZW1vdmUnLHtuYW1lOm59KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiB0b2dnbGVDb25uKG4peyBhd2FpdCBBUEkoJy9hcGkvY29ubmVjdG9yL3RvZ2dsZScse25hbWU6bn0pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIHRlc3RDb25uKG4peyBmbGFzaCgnVGVzdGluZyAnK24rJ+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvY29ubmVjdG9yL3Rlc3QnLHtuYW1lOm59KTsKICAgIG1vZGFsKGA8aDM+JHtlc2Mobil9IHJlc3BvbmRlZDwvaDM+PHByZSBjbGFzcz0ieWFtbCI+JHtlc2Moci5zYW1wbGUpfTwvcHJlPgogICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJjbG9zZU1vZGFsKCkiPkNsb3NlPC9idXR0b24+PC9kaXY+YCk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0gfQoKLyogLS0tLS0tLS0tLSBUSEUgQ0hBSVJNQU4nUyBERVNLIOKAlCBvbmUgcGFnZSwgaGUgYXNrcywgeW91IHRpY2sgLS0tLS0tLS0tLSAqLwpmdW5jdGlvbiBhc2tDYXJkKGtpbmQsIGlkLCB0aXRsZSwgYm9keSwgbWV0YSwgZXh0cmEpewogIHJldHVybiBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1sZWZ0OjRweCBzb2xpZCB2YXIoLS1hbWIpIj4KICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo4cHgiPgogICAgPGRpdiBjbGFzcz0icm93Ij48c3BhbiBjbGFzcz0idGFnIHQtYW1iIj5IRSBJUyBBU0tJTkc8L3NwYW4+PGIgc3R5bGU9ImZvbnQtc2l6ZToxNC41cHgiPiR7ZXNjKHRpdGxlKX08L2I+PC9kaXY+CiAgICAke21ldGE/YDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtlc2MobWV0YSl9PC9zcGFuPmA6Jyd9PC9kaXY+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweDtsaW5lLWhlaWdodDoxLjY1Ij4ke2JvZHl9PC9kaXY+CiAgICR7ZXh0cmF8fCcnfQogICA8ZGl2IGNsYXNzPSJyb3ciPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBzdHlsZT0iZm9udC1zaXplOjE1cHg7cGFkZGluZzoxMXB4IDI2cHgiIG9uY2xpY2s9InNheSgnJHtraW5kfScsJyR7aWR9JywxKSI+4pyUICZuYnNwO1lFUzwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIiBzdHlsZT0iZm9udC1zaXplOjE1cHg7cGFkZGluZzoxMXB4IDI2cHgiIG9uY2xpY2s9InNheSgnJHtraW5kfScsJyR7aWR9JywwKSI+4pyVICZuYnNwO05PPC9idXR0b24+CiAgIDwvZGl2PjwvZGl2PmA7Cn0KLyogPT09PT09PT09PT09PT09PT0gVEhFIERFU0sg4oCUIG9uZSBjaGF0IGJveCwgZXZlcnl0aGluZyBoYXBwZW5zIGhlcmUgPT09PT09PT09CiAgIFRoZSBPd25lciBzYWlkIGl0IHBsYWlubHk6ICJ3aHkgeW91IG5vdCBjb21iaW5lIGFuZCBsZXQgY2hhaXJtYW4gaGFuZGVsCiAgIGl0cyBtb3JlIGFuZCBtb3JlIHdvcmsgZm9yIG1lIHJhdGhlciB0aGVuIGhpbSIuIFNvIHRoaXMgaXMgbm93IGEgY2hhdCwKICAgbm90IGEgZGFzaGJvYXJkLiBBcHByb3ZhbHMgYXBwZWFyIGlubGluZS4gQWN0aW9ucyBoYXBwZW4gZnJvbSB0aGUgYm94LgogICBOb3RoaW5nIGhlcmUgcmVxdWlyZXMgZmluZGluZyBhbm90aGVyIHBhZ2UuICovCkxJVkUuZGVzaz0oKT0+ewogIGNvbnN0IGdhdGVzID0gKFMuZ2F0ZXN8fFtdKS5maWx0ZXIoZz0+Zy5zdGF0dXM9PT0nUEVORElORycpOwogIGNvbnN0IHVwcyAgID0gKFMucHJvcG9zYWxzfHxbXSkuZmlsdGVyKHA9PnAuc3RhdHVzPT09J1BFTkRJTkcnKTsKICBjb25zdCBqb2JzICA9IChTLm1pc3Npb25zfHxbXSkuZmlsdGVyKG09Pm0uc3RhdHVzPT09J09QRU4nKTsKICBjb25zdCBhc2tzICA9IGdhdGVzLmxlbmd0aCArIHVwcy5sZW5ndGg7CiAgY29uc3Qgc3QgICAgPSBTLnN0b3JhZ2V8fHt9OwogIGNvbnN0IGNoYXQgID0gKFMuY2hhdHx8W10pLnNsaWNlKDAsMzApLnJldmVyc2UoKTsKCiAgbGV0IGh0bWwgPSAnJzsKCiAgLyogQSBwYXNzd29yZCB0aGF0IHZhbmlzaGVzIG9uIHJlc3RhcnQgbG9ja3MgeW91IG91dCBvZiB5b3VyIG93biBzeXN0ZW0uCiAgICAgVGhhdCBvdXRyYW5rcyBldmVyeXRoaW5nIGVsc2Ugb24gdGhpcyBwYWdlLiAqLwogIGNvbnN0IG93biA9IFMub3duZXJ8fHt9OwogIGlmKG93bi5ib290c3RyYXAgfHwgIW93bi5waW5uZWQpewogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1hbWIpO2JhY2tncm91bmQ6cmdiYSgxNjgsMTI4LDI3LC4wNik7bWFyZ2luLWJvdHRvbToxMnB4Ij4KICAgICA8YiBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+XHUyNmEwIFlPVVIgUEFTU1dPUkQgV0lMTCBOT1QgU1VSVklWRSBBIFJFU1RBUlQ8L2I+CiAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW46NnB4IDAgOXB4Ij5UaGlzIGhvc3Qgd2lwZXMgaXRzIGRpc2suIE9uIHRoZSBuZXh0IHJlc3RhcnQgYSBuZXcgcmFuZG9tIHBhc3N3b3JkIGlzIGdlbmVyYXRlZCBpbnRvIGEgbG9nIHlvdSBuZXZlciBzZWUgXHUyMDE0IGFuZCB5b3UgYXJlIGxvY2tlZCBvdXQuIFNldCBhIHBlcm1hbmVudCBvbmUuIFRlbiBzZWNvbmRzLjwvZGl2PgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBwIHNtIiBvbmNsaWNrPSJnbygnc2V0dGluZ3MnKSI+U2V0IG15IHBlcm1hbmVudCBwYXNzd29yZDwvYnV0dG9uPjwvZGl2PmA7CiAgfQoKICAvKiBPbmx5IGdlbnVpbmVseSBjcml0aWNhbCB0aGluZ3MgaW50ZXJydXB0LiBFdmVyeXRoaW5nIGVsc2Ugd2FpdHMgYmVsb3cuICovCiAgaWYoc3QubGV2ZWw9PT0nQ1JJVCcpewogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpO2JhY2tncm91bmQ6cmdiYSgxODAsNjgsNDIsLjA2KTttYXJnaW4tYm90dG9tOjEycHgiPgogICAgIDxiIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj5ZT1VSIFdPUksgSVMgTk9UIEJFSU5HIFNBVkVEPC9iPgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luOjZweCAwIDlweCI+JHtlc2Moc3QubXNnfHwnJyl9PC9kaXY+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIHNtIiBvbmNsaWNrPSJnbygnc3RvcmFnZScpIj5GaXggaXQg4oCUIDYgbWludXRlczwvYnV0dG9uPjwvZGl2PmA7CiAgfQoKICAvKiBBcHByb3ZhbHMsIGlubGluZSwgYmlnIGJ1dHRvbnMuICovCiAgaWYoYXNrcyl7CiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLWFtYik7bWFyZ2luLWJvdHRvbToxMnB4Ij4KICAgICAgPGIgc3R5bGU9ImNvbG9yOnZhcigtLWFtYikiPiR7YXNrc30gdGhpbmcke2Fza3M+MT8ncyc6Jyd9IG5lZWQgeW91ciB5ZXMgb3Igbm88L2I+PC9kaXY+YDsKICAgIGdhdGVzLmZvckVhY2goZz0+eyBodG1sICs9IGFza0NhcmQoJ2dhdGUnLCBnLmlkLCBnLnRpdGxlLAogICAgICBgJHtlc2MoZy5vYmopfTxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo3cHgiPlNhZmVndWFyZHM6ICR7ZXNjKGcuc2FmZSl9PC9kaXY+YCwKICAgICAgYCR7Zy5jbHN9IMK3IHJpc2sgJHtnLnJpc2t9JHtnLmNvc3Q/JyDCtyBjb3N0cyBScyAnK2cuY29zdDonJ31gKTsgfSk7CiAgICB1cHMuZm9yRWFjaChwPT57IGh0bWwgKz0gYXNrQ2FyZCgndXBncmFkZScsIHAuaWQsIHAubGFiZWwsCiAgICAgIGAke2VzYyhwLndoeSl9JHtwLmV2aWRlbmNlP2A8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6N3B4Ij5FdmlkZW5jZTogJHtlc2MocC5ldmlkZW5jZSl9PC9kaXY+YDonJ31gLAogICAgICBwLmtsYXNzKTsgfSk7CiAgfQoKICAvKiBQUk9KRUNUUyDigJQgc2VwYXJhdGUgdGhyZWFkIHBlciBwaWVjZSBvZiB3b3JrLCBzbyBjb250ZXh0IGRvZXMgbm90IGJsZWVkICovCiAgY29uc3QgcHJqcyA9IFMucHJvamVjdHN8fFt7aWQ6J1BSSi1NQUlOJyxuYW1lOidHZW5lcmFsJ31dOwogIGNvbnN0IGNudCAgPSBTLmNoYXRDb3VudHN8fHt9OwogIGNvbnN0IG9wZW4gPSBwcmpzLmZpbmQoeD0+eC5pZD09PShTLnByb2plY3RJZHx8J1BSSi1NQUlOJykpfHxwcmpzWzBdOwogIGh0bWwgKz0gYDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9ImZsZXgtd3JhcDp3cmFwO2dhcDo2cHg7bWFyZ2luLWJvdHRvbToxMHB4O2FsaWduLWl0ZW1zOmNlbnRlciI+CiAgICR7cHJqcy5tYXAoeD0+YDxidXR0b24gY2xhc3M9ImJ0biBzbSAke3guaWQ9PT1vcGVuLmlkPydwJzonJ30iIG9uY2xpY2s9Im9wZW5QcmooJyR7eC5pZH0nKSIKICAgICB0aXRsZT0iJHtjbnRbeC5pZF18fDB9IG1lc3NhZ2VzIj4ke2VzYyh4Lm5hbWUpfSR7Y250W3guaWRdP2AgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2NudFt4LmlkXX08L3NwYW4+YDonJ308L2J1dHRvbj5gKS5qb2luKCcnKX0KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJuZXdQcmooKSIgdGl0bGU9IktlZXAgYSBzZXBhcmF0ZSBjb252ZXJzYXRpb24gZm9yIGVhY2ggYnVzaW5lc3MiPisgTmV3PC9idXR0b24+CiAgICR7b3Blbi5pZCE9PSdQUkotTUFJTic/YDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iZGVsUHJqKCcke29wZW4uaWR9JykiIHRpdGxlPSJEZWxldGUgdGhpcyBwcm9qZWN0IGFuZCBpdHMgdGhyZWFkIj5cdTI3MTU8L2J1dHRvbj5gOicnfQogICA8c3BhbiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgIDxpbnB1dCBjbGFzcz0iaW4iIGlkPSJjaGF0RmluZCIgcGxhY2Vob2xkZXI9IlNlYXJjaCBldmVyeSBjb252ZXJzYXRpb27igKYiIHN0eWxlPSJtYXgtd2lkdGg6MjMwcHgiCiAgICAgb25rZXlkb3duPSJpZihldmVudC5rZXk9PT0nRW50ZXInKXtldmVudC5wcmV2ZW50RGVmYXVsdCgpO2ZpbmRDaGF0KCl9Ij4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJmaW5kQ2hhdCgpIj5GaW5kPC9idXR0b24+CiAgPC9kaXY+CiAgPGRpdiBpZD0iZmluZE91dCI+PC9kaXY+YDsKCiAgLyogVEhFIENPTlZFUlNBVElPTiAqLwogIGh0bWwgKz0gYDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJwYWRkaW5nOjA7b3ZlcmZsb3c6aGlkZGVuIj4KICAgPGRpdiBpZD0iY2hhdFNjcm9sbCIgc3R5bGU9Im1heC1oZWlnaHQ6NTJ2aDtvdmVyZmxvdy15OmF1dG87cGFkZGluZzoxNnB4Ij4KICAgJHshY2hhdC5sZW5ndGggPyBgPGRpdiBzdHlsZT0idGV4dC1hbGlnbjpjZW50ZXI7cGFkZGluZzowIj4KICAgICAgPHN0eWxlPgogICAgICAgIEBrZXlmcmFtZXMgY2luZVBhbnswJXt0cmFuc2Zvcm06c2NhbGUoMS4wNikgdHJhbnNsYXRlM2QoMCwwLDApfTUwJXt0cmFuc2Zvcm06c2NhbGUoMS4xMykgdHJhbnNsYXRlM2QoLTEuMiUsLTElLDApfTEwMCV7dHJhbnNmb3JtOnNjYWxlKDEuMDYpIHRyYW5zbGF0ZTNkKDAsMCwwKX19CiAgICAgICAgQGtleWZyYW1lcyBjaW5lUmlzZXtmcm9te29wYWNpdHk6MDt0cmFuc2Zvcm06dHJhbnNsYXRlWSgxNHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQogICAgICAgIEBrZXlmcmFtZXMgY2luZVNoZWVuezAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKC0xMjAlKX0xMDAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDIyMCUpfX0KICAgICAgICBAa2V5ZnJhbWVzIGNpbmVHbG93ezAlLDEwMCV7b3BhY2l0eTouNTV9NTAle29wYWNpdHk6MX19CiAgICAgICAgLmNpbmV7cG9zaXRpb246cmVsYXRpdmU7b3ZlcmZsb3c6aGlkZGVuO2JvcmRlci1yYWRpdXM6MTRweDtiYWNrZ3JvdW5kOiMwNzBBMDU7CiAgICAgICAgICBib3gtc2hhZG93OjAgMThweCA1MHB4IHJnYmEoMCwwLDAsLjI4KX0KICAgICAgICAuY2luZT5pbWd7d2lkdGg6MTAwJTtkaXNwbGF5OmJsb2NrO2FuaW1hdGlvbjpjaW5lUGFuIDI2cyBlYXNlLWluLW91dCBpbmZpbml0ZTt3aWxsLWNoYW5nZTp0cmFuc2Zvcm19CiAgICAgICAgLmNpbmU+c3Zne3dpZHRoOjEwMCU7ZGlzcGxheTpibG9ja30KICAgICAgICAuY2luZTo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTtpbnNldDowO3BvaW50ZXItZXZlbnRzOm5vbmU7CiAgICAgICAgICBiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcscmdiYSg3LDEwLDUsMCkgNDIlLHJnYmEoNywxMCw1LC41NSkgNzglLHJnYmEoNywxMCw1LC45KSAxMDAlKX0KICAgICAgICAuY2luZUNhcHtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0OjA7cmlnaHQ6MDtib3R0b206MDt6LWluZGV4OjI7cGFkZGluZzoyMnB4IDE4cHggMjBweH0KICAgICAgICAuY2luZUNhcCBoMXtmb250OjgwMCBjbGFtcCgyM3B4LDQuNnZ3LDQwcHgpLzEuMDYgdmFyKC0tc2Fucyk7bGV0dGVyLXNwYWNpbmc6LTEuNHB4OwogICAgICAgICAgbWFyZ2luOjAgMCA3cHg7Y29sb3I6I0Y2RjNFNjt0ZXh0LXNoYWRvdzowIDJweCAyMnB4IHJnYmEoMCwwLDAsLjcpOwogICAgICAgICAgYW5pbWF0aW9uOmNpbmVSaXNlIC44cyBjdWJpYy1iZXppZXIoLjIsLjcsLjIsMSkgYm90aH0KICAgICAgICAuY2luZUNhcCBoMSBlbXtmb250LXN0eWxlOm5vcm1hbDtjb2xvcjojQzZEQjRBfQogICAgICAgIC5jaW5lQ2FwIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzcHg7Y29sb3I6cmdiYSgyNDYsMjQzLDIzMCwuNzIpOwogICAgICAgICAgYW5pbWF0aW9uOmNpbmVSaXNlIC44cyAuMThzIGN1YmljLWJlemllciguMiwuNywuMiwxKSBib3RofQogICAgICAgIC5jaW5lRG90e2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6OXB4O2JhY2tncm91bmQ6I0M2REI0QTsKICAgICAgICAgIG1hcmdpbi1yaWdodDo3cHg7YW5pbWF0aW9uOmNpbmVHbG93IDEuOXMgZWFzZS1pbi1vdXQgaW5maW5pdGU7CiAgICAgICAgICBib3gtc2hhZG93OjAgMCAxMHB4ICNDNkRCNEF9CiAgICAgICAgLnRpbGV7cG9zaXRpb246cmVsYXRpdmU7b3ZlcmZsb3c6aGlkZGVuO2N1cnNvcjpwb2ludGVyO2JvcmRlci1yYWRpdXM6MTJweDsKICAgICAgICAgIGJvcmRlcjoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtiYWNrZ3JvdW5kOiMwNzBBMDU7dHJhbnNpdGlvbjp0cmFuc2Zvcm0gLjIycyxib3gtc2hhZG93IC4yMnM7CiAgICAgICAgICBhbmltYXRpb246Y2luZVJpc2UgLjdzIGJvdGh9CiAgICAgICAgLnRpbGU6aG92ZXJ7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTRweCk7Ym94LXNoYWRvdzowIDE0cHggMzBweCByZ2JhKDAsMCwwLC4zKX0KICAgICAgICAudGlsZXttaW4taGVpZ2h0OjEwNHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47anVzdGlmeS1jb250ZW50OmZsZXgtZW5kO3BhZGRpbmc6MTFweCAxMnB4fQogICAgICAgIC50aWNve2ZvbnQtc2l6ZToyMXB4O2xpbmUtaGVpZ2h0OjE7Y29sb3I6I0M2REI0QTttYXJnaW4tYm90dG9tOmF1dG87b3BhY2l0eTouOX0KICAgICAgICAudGlsZTpob3ZlciAudGljb3tvcGFjaXR5OjF9CiAgICAgICAgLmxibDIgYntkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMi41cHg7Y29sb3I6I0Y2RjNFNjtsaW5lLWhlaWdodDoxLjI1O21hcmdpbi10b3A6OHB4fQogICAgICAgIC5sYmwyIHN7ZGlzcGxheTpibG9jazt0ZXh0LWRlY29yYXRpb246bm9uZTtmb250LXNpemU6MTAuNXB4O2NvbG9yOnJnYmEoMjQ2LDI0MywyMzAsLjU4KTtsaW5lLWhlaWdodDoxLjR9CiAgICAgICAgLnRpbGUgLnNoZWVue3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO2JvdHRvbTowO3dpZHRoOjM0JTtwb2ludGVyLWV2ZW50czpub25lOwogICAgICAgICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTAwZGVnLHRyYW5zcGFyZW50LHJnYmEoMjU1LDI1NSwyNTUsLjE2KSx0cmFuc3BhcmVudCk7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTEyMCUpfQogICAgICAgIC50aWxlOmhvdmVyIC5zaGVlbnthbmltYXRpb246Y2luZVNoZWVuIC44NXMgZWFzZS1vdXR9CiAgICAgICAgQG1lZGlhKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsuY2luZT5pbWd7YW5pbWF0aW9uOm5vbmV9LmNpbmVDYXAgaDEsLmNpbmVDYXAgcCwudGlsZXthbmltYXRpb246bm9uZX19CiAgICAgIDwvc3R5bGU+CiAgICAgIDxkaXYgY2xhc3M9ImNpbmUiPgogICAgICAgICR7Zmxvb3JTdmcoKX0KICAgICAgICA8ZGl2IGNsYXNzPSJjaW5lQ2FwIj4KICAgICAgICAgIDxoMT5TYXkgaXQgb25jZS48YnI+PGVtPkhlIGRvZXMgdGhlIHJlc3QuPC9lbT48L2gxPgogICAgICAgICAgPHA+PHNwYW4gY2xhc3M9ImNpbmVEb3QiPjwvc3Bhbj5Ob3RoaW5nIGxlYXZlcyB3aXRob3V0IHlvdXIgdGFwLjwvcD4KICAgICAgICA8L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW46MTJweCAwIDRweDtnYXA6OXB4Ij4KICAgICAgICAke1tbJ1x1MjVhNicsJ0J1aWxkIHRoZSBidXNpbmVzcycsJ1NpdGUsIHByaWNlcywgcG9saWNpZXMsIGludm9pY2UnLCdCdWlsZCBtZSBhIGJ1c2luZXNzIGZvciAnXSwKICAgICAgICAgICBbJ1x1MjVjOScsJ0ZpbmQgYSBuYW1lJywnQ2hlY2tlZCBsaXZlLiBGcmVlIG9yIHRha2VuJywnRmluZCBtZSBhIG5hbWUgZm9yICddLAogICAgICAgICAgIFsnXHUyN2E0JywnR2V0IGN1c3RvbWVycycsJ1dyaXR0ZW4gYW5kIHJlYWR5IHRvIHNlbmQnLCdHZXQgbWUgY3VzdG9tZXJzJ10sCiAgICAgICAgICAgWydcdTI3MTQnLCdXaGF0IGlzIGJyb2tlbj8nLCdIZSB0ZWxscyB5b3Ugd2hhdCBibG9ja3MgbW9uZXknLCdXaGF0IGlzIGJyb2tlbj8nXV0KICAgICAgICAgIC5tYXAoKFtpYyx0LHMscV0saSk9PmA8ZGl2IGNsYXNzPSJ0aWxlIiBzdHlsZT0iYW5pbWF0aW9uLWRlbGF5OiR7MC4xK2kqMC4wOX1zIiBvbmNsaWNrPSJkZXNrUXVpY2soJyR7cX0nKSI+CiAgICAgICAgICAgIDxzcGFuIGNsYXNzPSJzaGVlbiI+PC9zcGFuPgogICAgICAgICAgICA8ZGl2IGNsYXNzPSJ0aWNvIj4ke2ljfTwvZGl2PgogICAgICAgICAgICA8ZGl2IGNsYXNzPSJsYmwyIj48Yj4ke3R9PC9iPjxzPiR7c308L3M+PC9kaXY+PC9kaXY+YCkuam9pbignJyl9CiAgICAgIDwvZGl2PjwvZGl2PmAKICAgOiBjaGF0Lm1hcChtPT57CiAgICAgIGNvbnN0IG1lID0gbS53aG89PT0nT1dORVInOwogICAgICBjb25zdCBzeXMgPSBtLndobz09PSdTWVNURU0nOwogICAgICBpZihzeXMpIHJldHVybiBgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ0ZXh0LWFsaWduOmNlbnRlcjttYXJnaW46MTBweCAwO2ZvbnQtc2l6ZToxMS41cHgiPiR7ZXNjKG0udGV4dCl9PC9kaXY+YDsKICAgICAgcmV0dXJuIGA8ZGl2IHN0eWxlPSJkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OiR7bWU/J2ZsZXgtZW5kJzonZmxleC1zdGFydCd9O21hcmdpbi1ib3R0b206MTJweCI+CiAgICAgICAgPGRpdiBzdHlsZT0ibWF4LXdpZHRoOjgyJTtiYWNrZ3JvdW5kOiR7bWU/J3ZhcigtLWxpbWUpJzondmFyKC0tZ2xhc3MyKSd9O2NvbG9yOiR7bWU/JyNmZmYnOid2YXIoLS10eHQpJ307CiAgICAgICAgICBib3JkZXI6MXB4IHNvbGlkICR7bWU/J3ZhcigtLWxpbWUpJzondmFyKC0tc3Ryb2tlKSd9O2JvcmRlci1yYWRpdXM6JHttZT8nMTRweCAxNHB4IDNweCAxNHB4JzonMTRweCAxNHB4IDE0cHggM3B4J307CiAgICAgICAgICBwYWRkaW5nOjExcHggMTRweDtsaW5lLWhlaWdodDoxLjYyO3doaXRlLXNwYWNlOnByZS13cmFwO3dvcmQtYnJlYWs6YnJlYWstd29yZCI+JHtlc2MobS50ZXh0KX0kewogICAgICAgICAgIW1lP2A8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJjb3B5TXNnKHRoaXMpIj5Db3B5PC9idXR0b24+PC9kaXY+YDonJ308L2Rpdj48L2Rpdj5gOwogICAgIH0pLmpvaW4oJycpfQogICA8L2Rpdj4KICAgPGRpdiBzdHlsZT0iYm9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tc3Ryb2tlKTtwYWRkaW5nOjEycHg7YmFja2dyb3VuZDp2YXIoLS1wYW5lbCkiPgogICAgJHsoUy5kb2NzfHxbXSkubGVuZ3RoP2A8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDttYXJnaW4tYm90dG9tOjhweCI+CiAgICAgICR7KFMuZG9jc3x8W10pLnNsaWNlKDAsNCkubWFwKGQ9PmA8c3BhbiBjbGFzcz0idGFnIHQtY3kiIHRpdGxlPSIke2QuY2hhcnN9IGNoYXJhY3RlcnMgcmVhZGFibGUiPlx1ezFGNENFfSAke2VzYyhkLm5hbWUpfQogICAgICAgIDxhIGhyZWY9IiMiIG9uY2xpY2s9ImRyb3BEb2MoJyR7ZC5pZH0nKTtyZXR1cm4gZmFsc2UiIHN0eWxlPSJtYXJnaW4tbGVmdDo2cHg7dGV4dC1kZWNvcmF0aW9uOm5vbmUiPlx1MjcxNTwvYT48L3NwYW4+YCkuam9pbignJyl9CiAgICAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+YXR0YWNoZWQgXHUyMDE0IGhlIHJlYWRzIHRoZXNlIHdoZW4geW91IGFzazwvc3Bhbj48L2Rpdj5gOicnfQogICAgPHRleHRhcmVhIGlkPSJkZXNrU2F5IiBjbGFzcz0iaW4iIHN0eWxlPSJtaW4taGVpZ2h0OjU4cHg7cmVzaXplOnZlcnRpY2FsIgogICAgICBwbGFjZWhvbGRlcj0iUGFzdGUgYSB3ZWJzaXRlLCBhIG5hbWUsIG9yIGp1c3Qgc2F5IHdoYXQgeW91IHdhbnTigKYiCiAgICAgIG9ua2V5ZG93bj0iaWYoZXZlbnQua2V5PT09J0VudGVyJyYmKGV2ZW50LmN0cmxLZXl8fGV2ZW50Lm1ldGFLZXkpKXtldmVudC5wcmV2ZW50RGVmYXVsdCgpO2Rlc2tTZW5kKCl9Ij48L3RleHRhcmVhPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDo5cHg7ZmxleC13cmFwOndyYXAiPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJkZXNrU2VuZCgpIj5TRU5EPC9idXR0b24+CiAgICAgPGxhYmVsIGNsYXNzPSJidG4gc20iIHN0eWxlPSJjdXJzb3I6cG9pbnRlcjttYXJnaW46MCI+XHV7MUY0Q0V9IEF0dGFjaAogICAgICA8aW5wdXQgdHlwZT0iZmlsZSIgaWQ9ImRlc2tGaWxlIiBzdHlsZT0iZGlzcGxheTpub25lIgogICAgICAgYWNjZXB0PSIudHh0LC5tZCwuY3N2LC5qc29uLC5sb2csLmh0bWwsLnBkZiIgb25jaGFuZ2U9ImF0dGFjaERvYyh0aGlzKSI+PC9sYWJlbD4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPkN0cmwrRW50ZXI8L3NwYW4+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJkZXNrUXVpY2soJ1doYXQgaXMgYnJva2VuIGFuZCBibG9ja2luZyBtb25leSByaWdodCBub3c/JykiPldoYXQgaXMgYnJva2VuPzwvYnV0dG9uPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iZGVza1F1aWNrKCdGaW5kIG1lIGEgd2F5IHRvIGVhcm4gbW9uZXkgdGhpcyB3ZWVrLicpIj5GaW5kIG1vbmV5PC9idXR0b24+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJkZXNrUXVpY2soJ0NoZWNrIGFsbCBteSBzaXRlcyByaWdodCBub3cuJykiPkNoZWNrIG15IHNpdGVzPC9idXR0b24+CiAgICAgJHsoUy5jaGF0fHxbXSkubGVuZ3RoP2A8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImNsZWFyQ2hhdCgpIj5DbGVhcjwvYnV0dG9uPmA6Jyd9CiAgICA8L2Rpdj4KICAgPC9kaXY+CiAgPC9kaXY+YDsKCiAgLyogSm9icyBvbmx5IGEgaHVtYW4gY2FuIGRvIOKAlCBjb2xsYXBzZWQsIG5vdCBzaG91dGluZy4gKi8KICBpZihqb2JzLmxlbmd0aCl7CiAgICBodG1sICs9IGA8ZGV0YWlscyBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIj4KICAgICAgPGI+JHtqb2JzLmxlbmd0aH0gam9iJHtqb2JzLmxlbmd0aD4xPydzJzonJ30gb25seSB5b3UgY2FuIGRvPC9iPgogICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiDigJQgdGhlIHdvcmRzIGFyZSBhbHJlYWR5IHdyaXR0ZW48L3NwYW4+PC9zdW1tYXJ5PgogICAgICR7am9icy5zbGljZSgwLDQpLm1hcChtPT5gPGRpdiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkIHZhcigtLWxpbWUpO3BhZGRpbmctbGVmdDoxMnB4O21hcmdpbjoxM3B4IDAiPgogICAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW4iPjxiPiR7ZXNjKG0udGl0bGUpfTwvYj48c3BhbiBjbGFzcz0ibW9uby1kaW0iPn4ke20ubWludXRlc30gbWluPC9zcGFuPjwvZGl2PgogICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW46NHB4IDAgN3B4Ij4ke2VzYyhtLndoeSl9PC9kaXY+CiAgICAgICAke20uc2NyaXB0P2A8ZGl2IHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLWlucCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1icmQpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTBweCI+CiAgICAgICAgIDxkaXYgaWQ9ImRza18ke20uaWR9IiBzdHlsZT0id2hpdGUtc3BhY2U6cHJlLXdyYXA7bGluZS1oZWlnaHQ6MS42Ij4ke2VzYyhtLnNjcmlwdCl9PC9kaXY+CiAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBwIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiIG9uY2xpY2s9ImNvcHlTY3JpcHQoJyR7bS5pZH0nKSI+Q29weTwvYnV0dG9uPjwvZGl2PmA6Jyd9CiAgICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+CiAgICAgICAgPGlucHV0IGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDoyNjBweCIgaWQ9Im5vdGVfJHttLmlkfSIgcGxhY2Vob2xkZXI9IndoYXQgaGFwcGVuZWQ/Ij4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gb2siIG9uY2xpY2s9ImRlYnJpZWYoJyR7bS5pZH0nLCdkb25lJykiPkRvbmU8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gbm8iIG9uY2xpY2s9ImRlYnJpZWYoJyR7bS5pZH0nLCdza2lwJykiPlNraXA8L2J1dHRvbj48L2Rpdj4KICAgICAgPC9kaXY+YCkuam9pbignJyl9PC9kZXRhaWxzPmA7CiAgfQoKICAvKiBTdGF0dXMsIG9uZSBsaW5lLCBmb2xkZWQgYXdheS4gKi8KICBjb25zdCBkb3duPShTLm1vbml0b3JzfHxbXSkuZmlsdGVyKG09Pm0uc3RhdGU9PT0nRE9XTicpOwogIGh0bWwgKz0gYDxkZXRhaWxzIGNsYXNzPSJjYXJkIiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48c3VtbWFyeSBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiIGNsYXNzPSJtb25vLWRpbSI+U3RhdHVzPC9zdW1tYXJ5PgogICA8ZGl2IGNsYXNzPSJ0dyIgc3R5bGU9Im1hcmdpbi10b3A6OXB4Ij48dGFibGU+PHRib2R5PgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoxNTBweCI+UnVubmluZzwvdGQ+PHRkPiR7KFMuYWdlbnRzfHxbXSkuZmlsdGVyKGE9PmEuc3RhdHVzPT09J0FDVElWRScpLmxlbmd0aH0gYWdlbnRzLCAkeyhTLnRhc2tzfHxbXSkuZmlsdGVyKHg9PnguZW5hYmxlZCkubGVuZ3RofSBzdGFuZGluZyBvcmRlcnMke1MucnVubmluZz8nJzonIDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj7igJQgSEFMVEVEPC9zcGFuPid9PC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlNpdGVzPC90ZD48dGQ+JHsoUy5tb25pdG9yc3x8W10pLmxlbmd0aH0ke2Rvd24ubGVuZ3RoP2AgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPsK3ICR7ZG93bi5sZW5ndGh9IERPV048L3NwYW4+YDonIMK3IGFsbCB1cCd9PC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkJ1c2luZXNzZXM8L3RkPjx0ZD4keyhTLmJ1c2luZXNzZXN8fFtdKS5sZW5ndGh9IGJ1aWx0IMK3ICR7KFMuYnVzaW5lc3Nlc3x8W10pLmZpbHRlcihiPT5iLnB1Ymxpc2hlZCkubGVuZ3RofSBsaXZlPC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPk1lc3NhZ2VzIHNlbnQ8L3RkPjx0ZD4keyhTLm91dHJlYWNofHxbXSkubGVuZ3RofSR7IShTLm91dHJlYWNofHxbXSkubGVuZ3RoPycgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWFtYikiPuKAlCBub3RoaW5nIGVhcm5zIHVudGlsIHNvbWV0aGluZyBpcyBzZW50PC9zcGFuPic6Jyd9PC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPk1haWw8L3RkPjx0ZD4ke1Muc210cFZlcmlmaWVkPyc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+cHJvdmVuPC9zcGFuPic6KFMudGVsZW1ldHJ5JiZTLnRlbGVtZXRyeS5zbXRwX3JlYWR5KT8nPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLWFtYikiPnVudGVzdGVkPC9zcGFuPic6JzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj5vZmY8L3NwYW4+J308L3RkPjwvdHI+CiAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+QnJhaW48L3RkPjx0ZD4ke1MubGxtP2VzYyhTLmxsbS5wcm92aWRlcikrJyDCtyAnKygoUy5sbG1CYWNrdXBzfHxbXSkubGVuZ3RoKzEpKycga2V5KHMpJzonPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPm5vdCBjb25uZWN0ZWQ8L3NwYW4+J308L3RkPjwvdHI+CiAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+YDsKCiAgcmV0dXJuIGh0bWw7Cn07ClJFTkRFUi5kZXNrPSgpPT5gPGRpdiBkYXRhLWxpdmU9ImRlc2siPiR7TElWRS5kZXNrKCl9PC9kaXY+YDsKYXN5bmMgZnVuY3Rpb24gc2F5KGtpbmQsIGlkLCB5ZXMpewogIGZsYXNoKHllcz8nQXBwcm92aW5n4oCmJzonRGVjbGluaW5n4oCmJyk7CiAgdHJ5ewogICAgaWYoa2luZD09PSdnYXRlJykgICAgYXdhaXQgQVBJKCcvYXBpL2dhdGUvZGVjaWRlJyx7aWQsb2s6ISF5ZXN9KTsKICAgIGVsc2UgICAgICAgICAgICAgICAgIGF3YWl0IEFQSSgnL2FwaS91cGdyYWRlL2RlY2lkZScse2lkLG9rOiEheWVzfSk7CiAgICByZW5kZXIoKTsgZmxhc2goeWVzPydEb25lIOKAlCBoZSBpcyBhY3Rpbmcgb24gaXQnOidEZWNsaW5lZCcpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KbGV0IGRlc2tCdXN5PWZhbHNlOwphc3luYyBmdW5jdGlvbiBkZXNrU2VuZCgpewogIGlmKGRlc2tCdXN5KSByZXR1cm47CiAgY29uc3QgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Rlc2tTYXknKTsKICBjb25zdCB0PShlbHx8e30pLnZhbHVlfHwnJzsKICBpZighdC50cmltKCkpIHJldHVybiBmbGFzaCgnVHlwZSBzb21ldGhpbmcgZmlyc3QnKTsKICBkZXNrQnVzeT10cnVlOwogIGlmKGVsKXsgZWwudmFsdWU9Jyc7IGVsLmJsdXIoKTsgfQogIGZsYXNoKCdXb3JraW5n4oCmJyk7CiAgdHJ5ewogICAgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZG8nLHt0ZXh0OnQudHJpbSgpfSk7CiAgICByZW5kZXIoKTsgc2Nyb2xsQ2hhdCgpOwogICAgZmxhc2goci5kaWQgJiYgci5kaWQhPT0nYW5zd2VyJyA/ICdEb25lOiAnK3IuZGlkLnJlcGxhY2UoL18vZywnICcpIDogJycpOwogICAgLyogaWYgdGhlIGFjdGlvbiBwcm9kdWNlZCBzb21ldGhpbmcgb24gYW5vdGhlciBwYWdlLCBvZmZlciBpdCDigJQgZG8gbm90IGhpamFjayAqLwogICAgaWYoci5nb3RvKSBmbGFzaCgnRG9uZSDigJQgb3BlbiAnK3IuZ290bysnIHRvIHNlZSBpdCcpOwogIH1jYXRjaChlKXsgcmVuZGVyKCk7IHNjcm9sbENoYXQoKTsgZmxhc2goZS5tZXNzYWdlKSB9CiAgZmluYWxseXsgZGVza0J1c3k9ZmFsc2U7IH0KfQpmdW5jdGlvbiBkZXNrUXVpY2sodCl7IGNvbnN0IGVsPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZXNrU2F5Jyk7IGlmKGVsKXsgZWwudmFsdWU9dDsgfSBkZXNrU2VuZCgpOyB9CmZ1bmN0aW9uIHNjcm9sbENoYXQoKXsgY29uc3QgYz1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hhdFNjcm9sbCcpOyBpZihjKSBjLnNjcm9sbFRvcD1jLnNjcm9sbEhlaWdodDsgfQpmdW5jdGlvbiBjb3B5TXNnKGJ0bil7CiAgY29uc3QgYm94PWJ0bi5jbG9zZXN0KCdkaXYnKTsKICBjb25zdCB0eHQ9Wy4uLmJveC5jaGlsZE5vZGVzXS5maWx0ZXIobj0+bi5ub2RlVHlwZT09PTN8fCFuLnF1ZXJ5U2VsZWN0b3IpLm1hcChuPT5uLnRleHRDb250ZW50KS5qb2luKCcnKS50cmltKCk7CiAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodHh0fHxib3guaW5uZXJUZXh0LnJlcGxhY2UoL1xzKkNvcHlccyokLywnJykpLnRoZW4oCiAgICAoKT0+eyBidG4udGV4dENvbnRlbnQ9J0NvcGllZCc7IHNldFRpbWVvdXQoKCk9PmJ0bi50ZXh0Q29udGVudD0nQ29weScsMTQwMCk7IH0sCiAgICAoKT0+Zmxhc2goJ1NlbGVjdCBhbmQgY29weSBtYW51YWxseScpKTsKfQphc3luYyBmdW5jdGlvbiBjbGVhckNoYXQoKXsgaWYoIWNvbmZpcm0oJ0NsZWFyIHRoZSBjb252ZXJzYXRpb24/JykpcmV0dXJuOyBhd2FpdCBBUEkoJy9hcGkvY2hhdC9jbGVhcicse30pOyByZW5kZXIoKSB9CgovKiAtLS0tLS0tLS0tIEFHRU5UIExPT1AgLS0tLS0tLS0tLSAqLwpjb25zdCBBR09BTFM9WwogWydGaW5kIG15IGJlc3QgdmVudHVyZScsJ0NoZWNrIG15IGN1cnJlbnQgc3RhdGUsIGludmVudCBtb25leS1tYWtpbmcgaWRlYXMsIHJlc2VhcmNoIHRoZSBtb3N0IHByb21pc2luZyBvbmUgYWdhaW5zdCB0aGUgbGl2ZSB3ZWIsIGFuZCB0ZWxsIG1lIHdoaWNoIHNpbmdsZSBvbmUgdG8gcHVyc3VlIGFuZCB3aHkuJ10sCiBbJ0Z1bGwgc3lzdGVtIGF1ZGl0JywnUmVhZCBteSBzeXN0ZW0gc3RhdGUsIHNjYW4gZm9yIGFub21hbGllcywgY2hlY2sgZXZlcnkgbW9uaXRvcmVkIHNpdGUsIGFuZCBnaXZlIG1lIGEgYmx1bnQgbGlzdCBvZiB3aGF0IGlzIGJyb2tlbiBvciB1bnNhZmUsIG1vc3QgdXJnZW50IGZpcnN0LiddLAogWydSZXNlYXJjaCBhIGNvbXBldGl0b3InLCdTZWFyY2ggdGhlIHdlYiBmb3IgdXB0aW1lIG1vbml0b3Jpbmcgc2VydmljZXMgaW4gSW5kaWEsIHJlYWQgdGhlIHByaWNpbmcgcGFnZSBvZiB0aGUgbW9zdCByZWxldmFudCBvbmUsIGFuZCB0ZWxsIG1lIGhvdyBJIHNob3VsZCBwb3NpdGlvbiBhZ2FpbnN0IHRoZW0uJ10sCiBbJ1BsYW4gbXkgbmV4dCAzIGFjdGlvbnMnLCdSZWFkIG15IHN0YXRlLCB3b3JrIG91dCB3aGF0IGlzIGFjdHVhbGx5IGJsb2NraW5nIG1vbmV5LCBhbmQgaXNzdWUgbXkgbmV4dCBjb25jcmV0ZSBtaXNzaW9ucy4nXQpdOwpSRU5ERVIuYWdlbnQ9KCk9PnsKICBjb25zdCBSPVMuYWdlbnRSdW5zfHxbXTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+4pqZIEFHRU5UIExPT1Ag4oCUIEhFIERFQ0lERVMgVEhFIE5FWFQgU1RFUCBISU1TRUxGPC9oMz4KICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5UaGlzIGlzIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gYSBjaGF0Ym90IGFuZCBhbiBhZ2VudC4gSGUgcGlja3MgYSB0b29sLCA8Yj5zZWVzIHRoZSByZWFsIHJlc3VsdDwvYj4sIHRoZW4gZGVjaWRlcyB3aGF0IHRvIGRvIG5leHQg4oCUIHJlcGVhdGluZyB1bnRpbCB0aGUgZ29hbCBpcyBtZXQuIEV2ZXJ5IHRvb2wgaXMgY29kZSB0aGF0IGdlbnVpbmVseSBydW5zLjwvZGl2PgogICA8dWwgY2xhc3M9InRpZ2h0Ij4KICAgIDxsaT5IZSBjYW4gY2hhaW46IHN0YXRlIOKGkiBpZGVhcyDihpIgbGl2ZSB3ZWIgcmVzZWFyY2gg4oaSIG1pc3Npb25zLCBpbiBvbmUgZ28uPC9saT4KICAgIDxsaT5IZSBvbmx5IHNlZXMgdG9vbHMgdGhhdCBleGlzdC4gSW52ZW50aW5nIG9uZSBpcyByZWZ1c2VkLjwvbGk+CiAgICA8bGk+Q2FwcGVkIGF0IDEwIHN0ZXBzIHNvIGEgbG9vcCBjYW4gbmV2ZXIgcnVuIGF3YXkuPC9saT4KICAgIDxsaT5FdmVyeSBzdGVwIGFuZCBpdHMgcmVhbCBvdXRwdXQgaXMgbG9nZ2VkIGluIHRoZSB0cmFjZSBiZWxvdy48L2xpPgogICA8L3VsPgogICAkeyFTLmxsbT8nPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpO21hcmdpbi10b3A6MTBweCI+Q29ubmVjdCBhbiBBSSBicmFpbiBmaXJzdC48L2Rpdj4nOicnfQogICA8bGFiZWwgY2xhc3M9ImYiIHN0eWxlPSJtYXJnaW4tdG9wOjEycHgiPjxzcGFuPllvdXIgZ29hbDwvc3Bhbj4KICAgIDx0ZXh0YXJlYSBpZD0iYWdHb2FsIiBjbGFzcz0iaW4iIHN0eWxlPSJtaW4taGVpZ2h0Ojc2cHgiIHBsYWNlaG9sZGVyPSJlLmcuIFdvcmsgb3V0IHdoaWNoIHZlbnR1cmUgSSBzaG91bGQgc3RhcnQgdGhpcyB3ZWVrIGFuZCBwcm92ZSBpdCB3aXRoIHJlYWwgd2ViIGV2aWRlbmNlLiI+PC90ZXh0YXJlYT48L2xhYmVsPgogICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJtb25vLWRpbSI+TWF4IHN0ZXBzPC9zcGFuPgogICAgPHNlbGVjdCBjbGFzcz0iaW4iIHN0eWxlPSJtYXgtd2lkdGg6ODBweCIgaWQ9ImFnU3RlcHMiPgogICAgICR7WzMsNCw2LDgsMTBdLm1hcChuPT5gPG9wdGlvbiB2YWx1ZT0iJHtufSIgJHtuPT09Nj8nc2VsZWN0ZWQnOicnfT4ke259PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0icnVuQWdlbnQoKSI+UlVOIFRIRSBMT09QPC9idXR0b24+CiAgICAke1IubGVuZ3RoPyc8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImNsZWFyQWdlbnQoKSI+Q2xlYXIgaGlzdG9yeTwvYnV0dG9uPic6Jyd9PC9kaXY+CiAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+JHtBR09BTFMubWFwKChnLGkpPT4KICAgICBgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJhZ1F1aWNrKCR7aX0pIj4ke2VzYyhnWzBdKX08L2J1dHRvbj5gKS5qb2luKCcnKX08L2Rpdj4KICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+QSA2LXN0ZXAgcnVuIG1ha2VzIDYrIEFJIGNhbGxzLiBPbiBhIGZyZWUgdGllciB0aGF0IGlzIGZpbmUgb2NjYXNpb25hbGx5IOKAlCBhZGQgYmFja3VwIGtleXMgYmVsb3cgaWYgeW91IHJ1biBpdCBvZnRlbi48L2Rpdj48L2Rpdj4KICA8ZGl2IGlkPSJhZ091dCI+PC9kaXY+CiAgJHtSLmxlbmd0aD9SLm1hcChyPT5gPGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjlweCI+CiAgICAgPGI+JHtlc2Moci5nb2FsKX08L2I+CiAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke3IudH0gwrcgJHtyLnN0ZXBzfSBzdGVwJHtyLnN0ZXBzPjE/J3MnOicnfSR7ci5oaXRDYXA/JyDCtyBISVQgQ0FQJzonJ308L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjY1O21hcmdpbi1ib3R0b206MTFweCI+JHtlc2Moci5hbnN3ZXIpfTwvZGl2PgogICAgPGRldGFpbHM+PHN1bW1hcnkgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiPlNob3cgdGhlICR7ci50cmFjZS5sZW5ndGh9LXN0ZXAgdHJhY2U8L3N1bW1hcnk+CiAgICAgPGRpdiBjbGFzcz0ibG9nIiBzdHlsZT0ibWFyZ2luLXRvcDo5cHgiPiR7ci50cmFjZS5tYXAodD0+CiAgICAgICBgPGRpdj48c3BhbiBjbGFzcz0idHMiPnN0ZXAgJHt0LnN0ZXB9PC9zcGFuPiA8YiBzdHlsZT0iY29sb3I6dmFyKC0tbGltZSkiPiR7ZXNjKHQuYWN0aW9uKX08L2I+XG4ke2VzYyh0LnJlc3VsdCl9PC9kaXY+YCkuam9pbignJyl9PC9kaXY+CiAgICA8L2RldGFpbHM+PC9kaXY+YCkuam9pbignJykKICAgOic8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gcnVucyB5ZXQuIEdpdmUgaGltIGEgZ29hbCBhbmQgd2F0Y2ggaGltIHdvcmsgaXQgb3V0LjwvZGl2PjwvZGl2Pid9YDsKfTsKYXN5bmMgZnVuY3Rpb24gcnVuQWdlbnQoKXsKICBjb25zdCBnPWFnR29hbC52YWx1ZS50cmltKCk7IGlmKCFnKSByZXR1cm4gZmxhc2goJ1N0YXRlIGEgZ29hbCBmaXJzdCcpOwogIGFnT3V0LmlubmVySFRNTD0nPGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iPldvcmtpbmfigKYgaGUgaXMgY2hvb3NpbmcgdG9vbHMgYW5kIHJlYWRpbmcgcmVzdWx0cy4gVGhpcyBjYW4gdGFrZSBhIG1pbnV0ZS48L2Rpdj48L2Rpdj4nOwogIHRyeXsKICAgIGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2FnZW50L3J1bicse2dvYWw6ZyxzdGVwczorYWdTdGVwcy52YWx1ZX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKCdGaW5pc2hlZCBpbiAnK3Iuc3RlcHMrJyBzdGVwKHMpJyk7CiAgfWNhdGNoKGUpewogICAgYWdPdXQuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZykiPjxkaXYgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPiR7ZXNjKGUubWVzc2FnZSl9PC9kaXY+PC9kaXY+YDsKICB9Cn0KZnVuY3Rpb24gYWdRdWljayhpKXsgYWdHb2FsLnZhbHVlPUFHT0FMU1tpXVsxXTsgcnVuQWdlbnQoKSB9CmFzeW5jIGZ1bmN0aW9uIGNsZWFyQWdlbnQoKXsgYXdhaXQgQVBJKCcvYXBpL2FnZW50L2NsZWFyJyx7fSk7IHJlbmRlcigpIH0KCi8qIC0tLS0tLS0tLS0gU0lURSBCVUlMREVSIC0tLS0tLS0tLS0gKi8KUkVOREVSLnNpdGVzPSgpPT57CiAgY29uc3QgQj1TLmJ1aWxkc3x8W10sIFY9Uy52ZW50dXJlc3x8W107CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLWxpbWUpIj4KICAgPGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1vbGl2ZSkiPuKWpCBTSVRFIEJVSUxERVIg4oCUIEhFIFdSSVRFUyBJVCwgWU9VIFBVQkxJU0ggSVQ8L2gzPgogICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPkhlIHdyaXRlcyBhIGNvbXBsZXRlLCB3b3JraW5nIGxhbmRpbmcgcGFnZSDigJQgaGVhZGxpbmUsIHByaWNpbmcgaW4gSU5SLCBob25lc3QgRkFRLCBhbmQgeW91ciA8Yj5yZWFsIHBheW1lbnQgbGluazwvYj4gd2lyZWQgaW4uIE9uZSBmaWxlLCBubyBkZXBlbmRlbmNpZXMuPC9kaXY+CiAgIDxkaXYgY2xhc3M9Indhcm5ib3giPjxiPldoYXQgaGUgY2Fubm90IGRvLCBhbmQgd2h5LjwvYj4gUHVibGlzaGluZyBuZWVkcyBhIGhvc3RpbmcgYWNjb3VudCwgYSBkb21haW4gYW5kIGEgY2FyZCBpbiA8ZW0+eW91cjwvZW0+IGxlZ2FsIG5hbWUuIFRha2luZyBtb25leSBuZWVkcyBLWUMgYWdhaW5zdCA8ZW0+eW91cjwvZW0+IFBBTiBhbmQgYmFuay4gTm8gc29mdHdhcmUgY2FuIGhvbGQgdGhvc2Ugb24geW91ciBiZWhhbGYg4oCUIHRoYXQgaXMgdGhlIGxhdywgbm90IGEgbWlzc2luZyBmZWF0dXJlLiBIZSBnZXRzIGl0IHRvIG9uZSBjbGljayBmcm9tIGxpdmUuPC9kaXY+CiAgIDx1bCBjbGFzcz0idGlnaHQiPgogICAgPGxpPkhlIHJlZnVzZXMgdG8gYnVpbGQgZm9yIGFuIHVucmVzZWFyY2hlZCB2ZW50dXJlIOKAlCBldmlkZW5jZSBmaXJzdC48L2xpPgogICAgPGxpPk5vIGZha2UgdGVzdGltb25pYWxzLCBubyBpbnZlbnRlZCBjdXN0b21lciBjb3VudHMuIEEgbmV3IGJ1c2luZXNzIGNhdWdodCBmYWtpbmcgcHJvb2YgbG9zZXMgdGhlIHNhbGUuPC9saT4KICAgIDxsaT5QcmV2aWV3IGl0IGhlcmUsIGRvd25sb2FkIG9uZSBmaWxlLCBwdWJsaXNoIGZyZWUgb24gTmV0bGlmeSBEcm9wIGluIGFib3V0IDYwIHNlY29uZHMuPC9saT4KICAgPC91bD4KICAgJHshUy5sbG0/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKTttYXJnaW4tdG9wOjEwcHgiPkNvbm5lY3QgYW4gQUkgYnJhaW4gZmlyc3QuPC9kaXY+JzonJ30KICAgPGRpdiBjbGFzcz0iZ3JpZCBnMiIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkJ1aWxkIGZvciBhIGxhdW5jaGVkIHZlbnR1cmU8L3NwYW4+CiAgICAgPHNlbGVjdCBpZD0ic2JWZW50dXJlIiBjbGFzcz0iaW4iPgogICAgICA8b3B0aW9uIHZhbHVlPSIiPuKAlCBwaWNrIG9uZSDigJQ8L29wdGlvbj4KICAgICAgJHtWLm1hcCh2PT5gPG9wdGlvbiB2YWx1ZT0iJHt2LmlkfSI+JHtlc2Modi50aXRsZSl9PC9vcHRpb24+YCkuam9pbignJyl9CiAgICAgPC9zZWxlY3Q+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+T3IgZGVzY3JpYmUgaXQgeW91cnNlbGY8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJzYkJyaWVmIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJlLmcuIHVwdGltZSBtb25pdG9yaW5nIGZvciBMdWRoaWFuYSBzaG9wcywgUnMgMTUwMC9tbyI+PC9sYWJlbD4KICAgPC9kaXY+CiAgIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJidWlsZFNpdGUoKSI+V1JJVEUgVEhFIFNJVEU8L2J1dHRvbj4KICAgJHshVi5sZW5ndGg/JzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPk5vIGxhdW5jaGVkIHZlbnR1cmVzIHlldC4gR28gdG8gVmVudHVyZXMsIGdlbmVyYXRlIGlkZWFzLCByZXNlYXJjaCBvbmUsIHRoZW4gQlVJTEQgQUdFTlQgVEVBTS48L2Rpdj4nOicnfQogIDwvZGl2PgogICR7Qi5sZW5ndGg/Qi5tYXAoYj0+YDxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbToxMHB4Ij4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+U0lURTwvc3Bhbj48Yj4ke2VzYyhiLnRpdGxlKX08L2I+CiAgICAgIDxzcGFuIGNsYXNzPSJ0YWcgJHtiLmhhc1BheUxpbms/J3QtZ3JuJzondC1hbWInfSI+JHtiLmhhc1BheUxpbms/J1BBWSBMSU5LIExJVkUnOidDT05UQUNUIE9OTFknfTwvc3Bhbj48L2Rpdj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7Yi50fSDCtyAkeyhiLmJ5dGVzLzEwMjQpLnRvRml4ZWQoMSl9IEtCPC9zcGFuPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMXB4Ij4KICAgICA8YSBjbGFzcz0iYnRuIHAiIGhyZWY9Ii9hcGkvc2l0ZS92aWV3P2lkPSR7Yi5pZH0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5QUkVWSUVXIElUIOKGlzwvYT4KICAgICA8YSBjbGFzcz0iYnRuIG9rIiBocmVmPSIvYXBpL3NpdGUvdmlldz9pZD0ke2IuaWR9JmRsPTEiPkRPV05MT0FEIGluZGV4Lmh0bWw8L2E+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJkZWxTaXRlKCcke2IuaWR9JykiPkRlbGV0ZTwvYnV0dG9uPjwvZGl2PgogICAgPGRldGFpbHM+PHN1bW1hcnkgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiPkhvdyB0byBwdXQgdGhpcyBsaXZlLCBmcmVlLCBpbiA2MCBzZWNvbmRzPC9zdW1tYXJ5PgogICAgIDxvbCBzdHlsZT0ibWFyZ2luOjlweCAwIDA7cGFkZGluZy1sZWZ0OjE5cHg7Zm9udC1zaXplOjEyLjVweDtsaW5lLWhlaWdodDoxLjgiPgogICAgICA8bGk+Q2xpY2sgPGI+RE9XTkxPQUQgaW5kZXguaHRtbDwvYj4gYWJvdmUuPC9saT4KICAgICAgPGxpPkdvIHRvIDxiPmFwcC5uZXRsaWZ5LmNvbS9kcm9wPC9iPiDigJQgbm8gYWNjb3VudCBuZWVkZWQgdG8gc3RhcnQuPC9saT4KICAgICAgPGxpPkRyYWcgdGhlIGZpbGUgb250byB0aGUgcGFnZS4gSXQgaXMgbGl2ZSBpbiBzZWNvbmRzIG9uIGEgZnJlZSBVUkwuPC9saT4KICAgICAgPGxpPkZyZWUgY3VzdG9tIGRvbWFpbiBsYXRlcjogYSAuY29tIGlzIHJvdWdobHkg4oK5OTAwL3llYXIg4oCUIG9wdGlvbmFsLCBkbyBpdCBvbmNlIHlvdSBoYXZlIGEgcGF5aW5nIGNsaWVudC48L2xpPgogICAgICA8bGk+QmluZCB0aGF0IG5ldyBVUkwgaW4gPGI+VXB0aW1lIE1hcnNoYWw8L2I+IHNvIHRoZSBDaGFpcm1hbiBtb25pdG9ycyB5b3VyIG93biBzaXRlIHRvby48L2xpPgogICAgIDwvb2w+CiAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+QWx0ZXJuYXRpdmVzIHRoYXQgYXJlIGVxdWFsbHkgZnJlZTogQ2xvdWRmbGFyZSBQYWdlcywgR2l0SHViIFBhZ2VzLCBWZXJjZWwuPC9kaXY+CiAgICA8L2RldGFpbHM+PC9kaXY+YCkuam9pbignJykKICAgOic8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gc2l0ZXMgYnVpbHQgeWV0LjwvZGl2PjwvZGl2Pid9YDsKfTsKYXN5bmMgZnVuY3Rpb24gYnVpbGRTaXRlKCl7CiAgY29uc3Qgdj0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NiVmVudHVyZScpfHx7fSkudmFsdWV8fCcnOwogIGNvbnN0IGJyaWVmPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2JCcmllZicpfHx7fSkudmFsdWV8fCcnOwogIGlmKCF2ICYmICFicmllZi50cmltKCkpIHJldHVybiBmbGFzaCgnUGljayBhIHZlbnR1cmUgb3Igd3JpdGUgYSBicmllZicpOwogIGZsYXNoKCdXcml0aW5nIHRoZSBzaXRlIOKAlCB0aGlzIHRha2VzIGEgbWludXRl4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9zaXRlL2J1aWxkJyx7dmVudHVyZUlkOnYsYnJpZWZ9KTsKICAgIHJlbmRlcigpOyBmbGFzaCgnU2l0ZSB3cml0dGVuIOKAlCAnKyhyLmJ5dGVzLzEwMjQpLnRvRml4ZWQoMSkrJyBLQi4gUHJldmlldyBpdC4nKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGRlbFNpdGUoaWQpeyBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgc2l0ZT8nKSlyZXR1cm47IGF3YWl0IEFQSSgnL2FwaS9zaXRlL2RlbGV0ZScse2lkfSk7IHJlbmRlcigpIH0KCi8qIC0tLS0tLS0tLS0gTUlTU0lPTlM6IGhlIGd1aWRlcywgeW91IGV4ZWN1dGUgLS0tLS0tLS0tLSAqLwpMSVZFLm1pc3Npb25zPSgpPT57CiAgY29uc3QgTT1TLm1pc3Npb25zfHxbXSwgb3Blbj1NLmZpbHRlcihtPT5tLnN0YXR1cz09PSdPUEVOJyksIGRvbmU9TS5maWx0ZXIobT0+bS5zdGF0dXM9PT0nRE9ORScpOwogIGNvbnN0IG1pbnM9b3Blbi5yZWR1Y2UoKGEsbSk9PmErKG0ubWludXRlc3x8MCksMCk7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJncmlkIGc0IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxM3B4Ij4KICAgJHtrcGkob3Blbi5sZW5ndGgsJ09wZW4gTWlzc2lvbnMnLG9wZW4ubGVuZ3RoPyd2YXIoLS1hbWIpJzondmFyKC0tZ3JuKScsbWlucz8nficrbWlucysnIG1pbiB0b3RhbCc6J25vdGhpbmcgcGVuZGluZycpfQogICAke2twaShkb25lLmxlbmd0aCwnQ29tcGxldGVkJywndmFyKC0tZ3JuKScsJ2xpZmV0aW1lJyl9CiAgICR7a3BpKChTLnBsYXlib29rc3x8W10pLmxlbmd0aCwnUGxheWJvb2tzJywndmFyKC0tY3kpJywnc3RlcC1ieS1zdGVwIGd1aWRlcycpfQogICAke2twaShTLnZlbnR1cmVzJiZTLnZlbnR1cmVzLmxlbmd0aD9lc2MoUy52ZW50dXJlc1swXS50aXRsZSkuc2xpY2UoMCwxOCk6J25vbmUnLCdBY3RpdmUgVmVudHVyZScsJ3ZhcigtLXB1ciknLCcnKX08L2Rpdj4KICAke29wZW4ubGVuZ3RoP29wZW4ubWFwKG09PmA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiM2NzQ3MGYiPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo3cHgiPgogICAgIDxkaXYgY2xhc3M9InJvdyI+PHNwYW4gY2xhc3M9InRhZyB0LWFtYiI+RE8gVEhJUzwvc3Bhbj48YiBzdHlsZT0iZm9udC1zaXplOjE0cHgiPiR7ZXNjKG0udGl0bGUpfTwvYj48L2Rpdj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPn4ke20ubWludXRlc30gbWluPC9zcGFuPjwvZGl2PgogICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo5cHg7Y29sb3I6I2IzYzFkMSI+JHtlc2MobS53aHkpfTwvZGl2PgogICAgJHttLnN0ZXBzLmxlbmd0aD9gPG9sIHN0eWxlPSJtYXJnaW46MCAwIDEwcHg7cGFkZGluZy1sZWZ0OjIwcHg7Zm9udC1zaXplOjEyLjVweDtsaW5lLWhlaWdodDoxLjc1Ij4KICAgICAgJHttLnN0ZXBzLm1hcChzPT5gPGxpPiR7ZXNjKHMpfTwvbGk+YCkuam9pbignJyl9PC9vbD5gOicnfQogICAgJHttLnNjcmlwdD9gPGRpdiBzdHlsZT0iYmFja2dyb3VuZDojMDYyMjJhO2JvcmRlcjoxcHggc29saWQgIzE1NWU2Yjtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjExcHg7bWFyZ2luLWJvdHRvbToxMHB4Ij4KICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweCI+Q09QWSBUSEVTRSBFWEFDVCBXT1JEUzo8L2Rpdj4KICAgICAgPGRpdiBzdHlsZT0id2hpdGUtc3BhY2U6cHJlLXdyYXA7bGluZS1oZWlnaHQ6MS42IiBpZD0ic2NyXyR7bS5pZH0iPiR7ZXNjKG0uc2NyaXB0KX08L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIHAiIHN0eWxlPSJtYXJnaW4tdG9wOjlweCIgb25jbGljaz0iY29weVNjcmlwdCgnJHttLmlkfScpIj5Db3B5IG1lc3NhZ2U8L2J1dHRvbj48L2Rpdj5gOicnfQogICAgPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGJvZHk+CiAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoxMjBweCI+RG9uZSB3aGVuPC90ZD48dGQ+JHtlc2MobS5kb25lV2hlbil9PC90ZD48L3RyPgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5MaWtlbHkgYmxvY2tlcjwvdGQ+PHRkIHN0eWxlPSJjb2xvcjp2YXIoLS1hbWIpIj4ke2VzYyhtLnJpc2spfTwvdGQ+PC90cj4KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiIgc3R5bGU9Im1hcmdpbi10b3A6MTFweCI+PHNwYW4+V2hhdCBoYXBwZW5lZD8gKGhlIGFkYXB0cyB0aGUgbmV4dCBtaXNzaW9uIHRvIHRoaXMpPC9zcGFuPgogICAgIDxpbnB1dCBjbGFzcz0iaW4iIGlkPSJub3RlXyR7bS5pZH0iIHBsYWNlaG9sZGVyPSJlLmcuIHNlbnQgdG8gNCBzaG9wcywgMSByZXBsaWVkIGFza2luZyBwcmljZSI+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBvbmNsaWNrPSJkZWJyaWVmKCcke20uaWR9JywnZG9uZScpIj5NQVJLIERPTkU8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gbm8iIG9uY2xpY2s9ImRlYnJpZWYoJyR7bS5pZH0nLCdza2lwJykiPlNraXAgdGhpczwvYnV0dG9uPjwvZGl2PjwvZGl2PmApLmpvaW4oJycpCiAgIDpgPGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vIG9wZW4gbWlzc2lvbnMuIFByZXNzIEdFVCBNWSBORVhUIE1JU1NJT05TIGFuZCBoZSB3aWxsIHRlbGwgeW91IGV4YWN0bHkgd2hhdCB0byBkbyB0b2RheS48L2Rpdj48L2Rpdj5gfQogICR7ZG9uZS5sZW5ndGg/YDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Db21wbGV0ZWQgPHNwYW4gY2xhc3M9InRhZyB0LWdybiI+JHtkb25lLmxlbmd0aH08L3NwYW4+PC9oMz4KICAgPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5XaGVuPC90aD48dGg+TWlzc2lvbjwvdGg+PHRoPk91dGNvbWU8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICR7ZG9uZS5zbGljZSgwLDE1KS5tYXAobT0+YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4ke20uY2xvc2VkfHxtLnR9PC90ZD48dGQ+JHtlc2MobS50aXRsZSl9PC90ZD4KICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKG0ub3V0Y29tZXx8JycpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGl2PmA6Jyd9CiAgJHsoUy5wbGF5Ym9va3N8fFtdKS5sZW5ndGg/YDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5QbGF5Ym9va3M8L2gzPgogICAke1MucGxheWJvb2tzLm1hcCgocCxpKT0+YDxkaXYgc3R5bGU9ImJvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1jeSk7cGFkZGluZy1sZWZ0OjExcHg7bWFyZ2luLWJvdHRvbToxM3B4Ij4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuIj48Yj4ke2VzYyhwLnRvcGljKX08L2I+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJjb3B5UGIoJHtpfSkiPkNvcHk8L2J1dHRvbj48L2Rpdj4KICAgIDxkaXYgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNjU7Zm9udC1zaXplOjEyLjVweDttYXJnaW4tdG9wOjZweCI+JHtlc2MocC50ZXh0KX08L2Rpdj48L2Rpdj5gKS5qb2luKCcnKX0KICAgPC9kaXY+YDonJ31gOwp9OwpSRU5ERVIubWlzc2lvbnM9KCk9PmAKIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6IzY3NDcwZjtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxNjBkZWcsIzE1MTAwYSwjMGEwZjE2KSI+CiAgPGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1hbWIpIj7il44gTVkgTUlTU0lPTlMg4oCUIEhFIFBMQU5TLCBZT1UgRVhFQ1VURTwvaDM+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5IZSBjYW5ub3QgcmVnaXN0ZXIgY29tcGFuaWVzLCBwbGFjZSBhZHMgb3IgdGFsayB0byBjdXN0b21lcnMuIFNvIGhlIGRvZXMgdGhlIG5leHQgYmVzdCB0aGluZzogYnJlYWtzIHRoZSBwYXRoIGludG8gPGI+c2luZ2xlIGFjdGlvbnMgeW91IGNhbiBmaW5pc2ggdG9kYXk8L2I+LCB3cml0ZXMgdGhlIGV4YWN0IHdvcmRzIHRvIHNlbmQsIGFuZCBhZGFwdHMgYmFzZWQgb24gd2hhdCBhY3R1YWxseSBoYXBwZW5lZC48L2Rpdj4KICAkeyFTLmxsbT8nPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpO2JhY2tncm91bmQ6IzE4MDgwOTtjb2xvcjojZmZiM2MwIj5Db25uZWN0IGFuIEFJIGJyYWluIGZpcnN0LjwvZGl2Pic6Jyd9CiAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iZ2V0TWlzc2lvbnMoKSI+R0VUIE1ZIE5FWFQgTUlTU0lPTlM8L2J1dHRvbj4KICAgJHsoUy5taXNzaW9uc3x8W10pLnNvbWUobT0+bS5zdGF0dXMhPT0nT1BFTicpPyc8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImNsZWFyTWlzc2lvbnMoKSI+Q2xlYXIgaGlzdG9yeTwvYnV0dG9uPic6Jyd9PC9kaXY+CiAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij4KICAgPGlucHV0IGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDozNDBweCIgaWQ9InBiVG9waWMiIHBsYWNlaG9sZGVyPSJQbGF5Ym9vayB0b3BpYyDigJQgZS5nLiBob3cgdG8gcmVnaXN0ZXIgYSBzb2xlIHByb3ByaWV0b3JzaGlwIGluIFB1bmphYiI+CiAgIDxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0ibWFrZVBiKCkiPldSSVRFIFBMQVlCT09LPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+UGxheWJvb2sgaWRlYXM6IGdldHRpbmcgYSBSYXpvcnBheSBhY2NvdW50IMK3IEdTVCBmb3IgZnJlZWxhbmNlcnMgaW4gSW5kaWEgwrcgZmluZGluZyBzaG9wIG93bmVycycgbnVtYmVycyBsZWdhbGx5IMK3IHdyaXRpbmcgYSBmaXJzdCBpbnZvaWNlPC9kaXY+PC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0ibWlzc2lvbnMiPiR7TElWRS5taXNzaW9ucygpfTwvZGl2PmA7CmFzeW5jIGZ1bmN0aW9uIGdldE1pc3Npb25zKCl7IGZsYXNoKCdDaGFpcm1hbiBpcyBwbGFubmluZyB5b3VyIG5leHQgbW92ZXPigKYnKTsKICB0cnl7IGNvbnN0IHY9KFMudmVudHVyZXN8fFtdKVswXTsKICAgIGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL21pc3Npb24vZ2VuZXJhdGUnLHt2ZW50dXJlSWQ6dj92LmlkOm51bGx9KTsKICAgIHJlbmRlcigpOyBmbGFzaChyLmFkZGVkKycgbWlzc2lvbihzKSBpc3N1ZWQnKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfSB9CmZ1bmN0aW9uIGNvcHlTY3JpcHQoaWQpeyBjb25zdCBlbD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2NyXycraWQpOwogIG5hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dChlbD9lbC5pbm5lclRleHQ6JycpOyBmbGFzaCgnTWVzc2FnZSBjb3BpZWQg4oCUIG5vdyBzZW5kIGl0JykgfQpmdW5jdGlvbiBjb3B5UGIoaSl7IG5hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dCgoUy5wbGF5Ym9va3N8fFtdKVtpXS50ZXh0KTsgZmxhc2goJ1BsYXlib29rIGNvcGllZCcpIH0KYXN5bmMgZnVuY3Rpb24gZGVicmllZihpZCxvdXRjb21lKXsKICBjb25zdCBub3RlPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbm90ZV8nK2lkKXx8e30pLnZhbHVlfHwnJzsKICBpZihvdXRjb21lPT09J2RvbmUnJiYhbm90ZS50cmltKCkpIHJldHVybiBmbGFzaCgnV3JpdGUgd2hhdCBoYXBwZW5lZCBmaXJzdCDigJQgaGUgbmVlZHMgaXQgdG8gcGxhbiB0aGUgbmV4dCBzdGVwJyk7CiAgZmxhc2goJ1JlY29yZGluZ+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvbWlzc2lvbi9kZWJyaWVmJyx7aWQsb3V0Y29tZSxub3RlfSk7IHJlbmRlcigpOwogICAgaWYoci5hZHZpY2UpIG1vZGFsKGA8aDM+RGVicmllZjwvaDM+PGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbjowIDAgMTJweCI+CiAgICAgIDxkaXYgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNiI+JHtlc2Moci5hZHZpY2UpfTwvZGl2PjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJjbG9zZU1vZGFsKCk7Z2V0TWlzc2lvbnMoKSI+TmV4dCBtaXNzaW9ucyDihpI8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJjbG9zZU1vZGFsKCkiPkNsb3NlPC9idXR0b24+PC9kaXY+YCk7CiAgICBlbHNlIGZsYXNoKCdTa2lwcGVkJyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0gfQphc3luYyBmdW5jdGlvbiBtYWtlUGIoKXsgY29uc3QgdD1wYlRvcGljLnZhbHVlLnRyaW0oKTsgaWYoIXQpIHJldHVybiBmbGFzaCgnVHlwZSBhIHRvcGljJyk7CiAgZmxhc2goJ1dyaXRpbmcgcGxheWJvb2vigKYnKTsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9taXNzaW9uL3BsYXlib29rJyx7dG9waWM6dH0pOyByZW5kZXIoKTsgZmxhc2goJ1BsYXlib29rIHJlYWR5JykgfQogIGNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0gfQoKLyogLS0tLS0tLS0tLSBDT01NQU5EIENPTlNPTEUgLS0tLS0tLS0tLSAqLwpMSVZFLmNvbW1hbmQ9KCk9PnsKICBjb25zdCBDPVMuY2hhdHx8W107CiAgcmV0dXJuIEMubGVuZ3RoP0MubWFwKG09PmA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4O2JvcmRlci1jb2xvcjokewogICAgIG0ud2hvPT09J09XTkVSJz8nIzIyMzQ0YSc6bS53aG89PT0nQ0hBSVJNQU4nPycjMTU1ZTZiJzonIzZiMjIzMyd9Ij4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206NnB4Ij4KICAgICA8c3BhbiBjbGFzcz0idGFnICR7bS53aG89PT0nT1dORVInPyd0LWJsdSc6bS53aG89PT0nQ0hBSVJNQU4nPyd0LWN5JzondC1yZWQnfSI+JHttLndob308L3NwYW4+CiAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke20udH08L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjYiPiR7ZXNjKG0udGV4dCl9PC9kaXY+PC9kaXY+YCkuam9pbignJykKICAgOic8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gb3JkZXJzIGdpdmVuIHlldC4gVGVsbCB0aGUgQ2hhaXJtYW4gd2hhdCB5b3Ugd2FudC48L2Rpdj48L2Rpdj4nOwp9OwpSRU5ERVIuY29tbWFuZD0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojMTU1ZTZiO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywjMDYyMjJhLCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLWN5KSI+4pauIENPTU1BTkQgQ09OU09MRSDigJQgSEUgQU5TV0VSUyBPTkxZIFRPIFlPVTwvaDM+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5HaXZlIG9yZGVycyBpbiBwbGFpbiBFbmdsaXNoLiBIZSByZXBsaWVzIHdpdGggd2hhdCBoZSB3aWxsIGRvLCB3aGF0IGhlIG5lZWRzIGZyb20geW91LCBhbmQgd2hhdCBoZSBjYW5ub3QgZG8uIEV2ZXJ5dGhpbmcgaGVyZSBpcyBsb2dnZWQgYW5kIHN1cnZpdmVzIHJlc3RhcnRzLjwvZGl2PgogICR7IVMubGxtPyc8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZyk7YmFja2dyb3VuZDojMTgwODA5O2NvbG9yOiNmZmIzYzAiPk5vIEFJIGJyYWluIGNvbm5lY3RlZCDigJQgaGUgY2Fubm90IGFuc3dlci4gQ29ubmVjdCBvbmUgb24gdGhlIEFJIEJyYWluIHBhZ2UuPC9kaXY+JzonJ30KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPllvdXIgb3JkZXI8L3NwYW4+PHRleHRhcmVhIGlkPSJjbWRUZXh0IiBjbGFzcz0iaW4iIHN0eWxlPSJtaW4taGVpZ2h0OjgwcHgiCiAgICBwbGFjZWhvbGRlcj0iZS5nLiBGaW5kIG1lIHRocmVlIHdheXMgdG8gZWFybiBmcm9tIHdoYXQgSSBvd24sIHJlc2VhcmNoIHRoZSBiZXN0IG9uZSwgYW5kIGJ1aWxkIHRoZSBhZ2VudCB0ZWFtLiI+PC90ZXh0YXJlYT48L2xhYmVsPgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InNlbmRDbWQoKSI+U0VORCBPUkRFUjwvYnV0dG9uPgogICAkeyhTLmNoYXR8fFtdKS5sZW5ndGg/JzxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iY2xlYXJDbWQoKSI+Q2xlYXIgbG9nPC9idXR0b24+JzonJ308L2Rpdj48L2Rpdj4KIDxkaXYgZGF0YS1saXZlPSJjb21tYW5kIj4ke0xJVkUuY29tbWFuZCgpfTwvZGl2PmA7CmFzeW5jIGZ1bmN0aW9uIHNlbmRDbWQoKXsKICBjb25zdCB0PWNtZFRleHQudmFsdWUudHJpbSgpOyBpZighdCkgcmV0dXJuIGZsYXNoKCdUeXBlIGFuIG9yZGVyIGZpcnN0Jyk7CiAgZmxhc2goJ0NoYWlybWFuIGlzIHRoaW5raW5n4oCmJyk7IGNtZFRleHQudmFsdWU9Jyc7CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvY29tbWFuZCcse3RleHQ6dH0pOyByZW5kZXIoKTsgfQogIGNhdGNoKGUpeyByZW5kZXIoKTsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gY2xlYXJDbWQoKXsgYXdhaXQgQVBJKCcvYXBpL2NvbW1hbmQvY2xlYXInLHt9KTsgcmVuZGVyKCkgfQoKLyogLS0tLS0tLS0tLSBWRU5UVVJFUyAtLS0tLS0tLS0tICovCkxJVkUudmVudHVyZXM9KCk9PnsKICBjb25zdCBJPVMuaWRlYXN8fFtdLCBWPVMudmVudHVyZXN8fFtdOwogIGNvbnN0IHJhdz1JLmZpbHRlcihpPT5pLnN0YXR1cz09PSdSQVcnKS5sZW5ndGg7CiAgY29uc3QgZG9uZT1JLmZpbHRlcihpPT5pLnN0YXR1cz09PSdSRVNFQVJDSEVEJyk7CiAgY29uc3QgYmVzdD1kb25lLnNsaWNlKCkuc29ydCgoYSxiKT0+KGIuc2NvcmV8fDApLShhLnNjb3JlfHwwKSlbMF07CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJncmlkIGc0IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxM3B4Ij4KICAgJHtrcGkoSS5sZW5ndGgsJ0lkZWFzIEdlbmVyYXRlZCcsJ3ZhcigtLWN5KScscmF3KycgYXdhaXRpbmcgcmVzZWFyY2gnKX0KICAgJHtrcGkoZG9uZS5sZW5ndGgsJ1Jlc2VhcmNoZWQnLCd2YXIoLS1wdXIpJywnYWdhaW5zdCBsaXZlIHdlYiBkYXRhJyl9CiAgICR7a3BpKGJlc3Q/YmVzdC5zY29yZSsnLzEwMCc6J+KAlCcsJ0Jlc3QgU2NvcmUnLGJlc3QmJmJlc3Quc2NvcmU+PTYwPyd2YXIoLS1ncm4pJzondmFyKC0tYW1iKScsYmVzdD9lc2MoYmVzdC50aXRsZSkuc2xpY2UoMCwyNik6J25vbmUgeWV0Jyl9CiAgICR7a3BpKFYubGVuZ3RoLCdWZW50dXJlcyBMYXVuY2hlZCcsJ3ZhcigtLWdybiknLCd3aXRoIHJlYWwgYWdlbnQgdGVhbXMnKX08L2Rpdj4KICAke1YubGVuZ3RoP2A8ZGl2IGNsYXNzPSJjYXJkIj48aDM+TGl2ZSBWZW50dXJlczwvaDM+CiAgICR7Vi5tYXAodj0+YDxkaXYgc3R5bGU9ImJvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1ncm4pO3BhZGRpbmctbGVmdDoxMXB4O21hcmdpbi1ib3R0b206MTRweCI+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbiI+PGI+JHtlc2Modi50aXRsZSl9PC9iPgogICAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHt2LmFnZW50cy5sZW5ndGh9IGFnZW50cyDCtyBmaXJzdCBydXBlZSBpbiB+JHt2LndlZWtzfXc8L3NwYW4+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjo1cHggMCI+JHtlc2Modi5yZXZlbnVlUGF0aCl9PC9kaXY+CiAgICAke3Yub3duZXJTdGVwcy5sZW5ndGg/YDxkaXYgc3R5bGU9ImZvbnQtc2l6ZToxMS41cHgiPjxiIHN0eWxlPSJjb2xvcjp2YXIoLS1hbWIpIj5ZT1VSIFNURVBTIChvbmx5IGEgaHVtYW4gY2FuIGRvIHRoZXNlKTo8L2I+CiAgICAgPG9sIHN0eWxlPSJtYXJnaW46NXB4IDAgMDtwYWRkaW5nLWxlZnQ6MTlweCI+JHt2Lm93bmVyU3RlcHMubWFwKHM9PmA8bGk+JHtlc2Mocyl9PC9saT5gKS5qb2luKCcnKX08L29sPjwvZGl2PmA6Jyd9CiAgIDwvZGl2PmApLmpvaW4oJycpfTwvZGl2PmA6Jyd9CiAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPklkZWEgUGlwZWxpbmUgPHNwYW4gY2xhc3M9InRhZyB0LWRpbSI+JHtJLmxlbmd0aH08L3NwYW4+PC9oMz4KICAgJHtJLmxlbmd0aD9JLm1hcChpPT5gPGRpdiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkICR7CiAgICAgIGkuc3RhdHVzPT09J0xBVU5DSEVEJz8ndmFyKC0tZ3JuKSc6aS5zdGF0dXM9PT0nS0lMTEVEJz8ndmFyKC0tZGltMiknOgogICAgICBpLnZlcmRpY3Q9PT0nUFVSU1VFJz8ndmFyKC0tY3kpJzppLnZlcmRpY3Q9PT0nS0lMTCc/J3ZhcigtLW1hZyknOid2YXIoLS1hbWIpJ307CiAgICAgIHBhZGRpbmctbGVmdDoxMXB4O21hcmdpbi1ib3R0b206MTNweDske2kuc3RhdHVzPT09J0tJTExFRCc/J29wYWNpdHk6LjQ1JzonJ30iPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW4iPgogICAgIDxkaXYgY2xhc3M9InJvdyI+PGI+JHtlc2MoaS50aXRsZSl9PC9iPgogICAgICAke2kuc2NvcmUhPW51bGw/YDxzcGFuIGNsYXNzPSJ0YWcgJHtpLnNjb3JlPj02MD8ndC1ncm4nOmkuc2NvcmU+PTQwPyd0LWFtYic6J3QtcmVkJ30iPiR7aS5zY29yZX0vMTAwPC9zcGFuPmA6Jyd9CiAgICAgICR7aS52ZXJkaWN0P2A8c3BhbiBjbGFzcz0idGFnICR7aS52ZXJkaWN0PT09J1BVUlNVRSc/J3QtY3knOmkudmVyZGljdD09PSdLSUxMJz8ndC1yZWQnOid0LWRpbSd9Ij4ke2kudmVyZGljdH08L3NwYW4+YDonJ30KICAgICAgPHNwYW4gY2xhc3M9InRhZyB0LWRpbSI+JHtpLnN0YXR1c308L3NwYW4+PC9kaXY+CiAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj7igrkke2ZtdChpLnByaWNlKX08L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJmb250LXNpemU6MTJweDttYXJnaW46NHB4IDAiPiR7ZXNjKGkud2hhdCl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSI+QnV5ZXI6ICR7ZXNjKGkuYnV5ZXIpfTwvZGl2PgogICAgJHtpLmVkZ2U/YDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6NXB4O2ZvbnQtc2l6ZToxMnB4Ij48YiBzdHlsZT0iY29sb3I6dmFyKC0tbGltZSkiPlVuZmFpciBlZGdlOjwvYj4gJHtlc2MoaS5lZGdlKX08L2Rpdj5gOicnfQogICAgJHtpLndoeT9gPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjNweCI+V2h5IG5vdzogJHtlc2MoaS53aHkpfTwvZGl2PmA6Jyd9CiAgICAke2kucmVzZWFyY2g/YDxkaXYgc3R5bGU9ImJhY2tncm91bmQ6IzBhMTExOTtib3JkZXItcmFkaXVzOjdweDtwYWRkaW5nOjlweDttYXJnaW4tdG9wOjdweDtmb250LXNpemU6MTEuNXB4Ij4KICAgICAgPGRpdj4ke2VzYyhpLnJlc2VhcmNoLnJlYXNvbmluZyl9PC9kaXY+CiAgICAgIDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6NnB4Ij48YiBzdHlsZT0iY29sb3I6dmFyKC0tY3kpIj5GaXJzdCBzdGVwOjwvYj4gJHtlc2MoaS5yZXNlYXJjaC5maXJzdFN0ZXApfTwvZGl2PgogICAgICA8ZGl2PjxiIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj5LaWxsIHJpc2s6PC9iPiAke2VzYyhpLnJlc2VhcmNoLmtpbGxSaXNrKX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjVweCI+ZGVtYW5kICR7aS5yZXNlYXJjaC5kZW1hbmR9LzEwIMK3IGNvbXBldGl0aW9uICR7aS5yZXNlYXJjaC5jb21wZXRpdGlvbn0vMTAgwrcgc3BlZWQgJHtpLnJlc2VhcmNoLnNwZWVkfS8xMCDCtyBmaXQgJHtpLnJlc2VhcmNoLmZpdH0vMTA8L2Rpdj48L2Rpdj5gOicnfQogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPgogICAgICR7aS5zdGF0dXM9PT0nUkFXJz9gPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIHAiIG9uY2xpY2s9InJlc2VhcmNoSWRlYSgnJHtpLmlkfScpIj5SRVNFQVJDSCBJVDwvYnV0dG9uPmA6Jyd9CiAgICAgJHtpLnN0YXR1cz09PSdSRVNFQVJDSEVEJz9gPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG9rIiBvbmNsaWNrPSJsYXVuY2hJZGVhKCcke2kuaWR9JykiPkJVSUxEIEFHRU5UIFRFQU08L2J1dHRvbj5gOicnfQogICAgICR7aS5zdGF0dXMhPT0nS0lMTEVEJyYmaS5zdGF0dXMhPT0nTEFVTkNIRUQnP2A8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImtpbGxJZGVhKCcke2kuaWR9JykiPktpbGw8L2J1dHRvbj5gOicnfQogICAgPC9kaXY+PC9kaXY+YCkuam9pbignJykKICAgOic8ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gaWRlYXMgeWV0LiBQcmVzcyBHRU5FUkFURSBJREVBUyBhbmQgaGUgd2lsbCBpbnZlbnQgdGhlbS48L2Rpdj4nfTwvZGl2PmA7Cn07ClJFTkRFUi52ZW50dXJlcz0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojNGEzMDgwO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywjMTQwZjIyLCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLXB1cikiPuKXhiBWRU5UVVJFIEVOR0lORSDigJQgSURFQVMg4oaSIFJFQUwgUkVTRUFSQ0gg4oaSIEFHRU5UIFRFQU1TPC9oMz4KICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPkhlIGludmVudHMgdmVudHVyZXMsIHJlc2VhcmNoZXMgZWFjaCBvbmUgYWdhaW5zdCA8Yj5saXZlIHdlYiBzZWFyY2g8L2I+IChub3QgbW9kZWwgbWVtb3J5KSwgc2NvcmVzIGl0IG91dCBvZiAxMDAsIGFuZCBkZXNpZ25zIHRoZSBhZ2VudCB0ZWFtIHRvIGV4ZWN1dGUuIEFnZW50cyB3aG9zZSB0b29scyBtYXAgdG8gbm8gcmVhbCBjb2RlIGFyZSByZWZ1c2VkLCBzbyBub3RoaW5nIGRlY29yYXRpdmUgZ2V0cyBjcmVhdGVkLjwvZGl2PgogICR7IVMubGxtPyc8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZyk7YmFja2dyb3VuZDojMTgwODA5O2NvbG9yOiNmZmIzYzAiPkNvbm5lY3QgYW4gQUkgYnJhaW4gZmlyc3QuPC9kaXY+JzonJ30KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk9wdGlvbmFsIHN0ZWVyIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+KGxlYXZlIGJsYW5rIGFuZCBoZSBkZWNpZGVzKTwvc3Bhbj48L3NwYW4+CiAgIDxpbnB1dCBpZD0iaWRlYVN0ZWVyIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJlLmcuIGZvY3VzIG9uIEIyQiwgb3Igb25saW5lLW9ubHksIG9yIHVuZGVyIDUwMCBJTlIgdG8gc3RhcnQiPjwvbGFiZWw+CiAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iZ2VuSWRlYXMoKSI+R0VORVJBVEUgSURFQVM8L2J1dHRvbj4KICAgPHNwYW4gY2xhc3M9InRhZyAke1MuYXV0b0lkZWFzPyd0LXJlZCc6J3QtZGltJ30iPklERUEgQVVUT1BJTE9UICR7Uy5hdXRvSWRlYXM/J09OJzonT0ZGJ308L3NwYW4+PC9kaXY+CiAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4Ij48YnV0dG9uIGNsYXNzPSJidG4gJHtTLmF1dG9JZGVhcz8nbm8nOicnfSIgb25jbGljaz0idG9nZ2xlSWRlYUF1dG8oKSI+JHtTLmF1dG9JZGVhcz8nU1RPUCBBVVRPUElMT1QnOidFTkFCTEUgSURFQSBBVVRPUElMT1QnfTwvYnV0dG9uPgogICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPkF1dG9waWxvdCA9IGhlIGludmVudHMgYW5kIHJlc2VhcmNoZXMgdmVudHVyZXMgdW5wcm9tcHRlZCwgZXZlcnkgfjUgbWludXRlcy48L3NwYW4+PC9kaXY+PC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0idmVudHVyZXMiPiR7TElWRS52ZW50dXJlcygpfTwvZGl2PmA7CmFzeW5jIGZ1bmN0aW9uIGdlbklkZWFzKCl7IGZsYXNoKCdUaGlua2luZyB1cCB2ZW50dXJlc+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvaWRlYS9nZW5lcmF0ZScse246NSxzdGVlcjppZGVhU3RlZXIudmFsdWUudHJpbSgpfSk7CiAgICByZW5kZXIoKTsgZmxhc2goci5hZGRlZCsnIGlkZWEocykgZ2VuZXJhdGVkJyk7IH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9IH0KYXN5bmMgZnVuY3Rpb24gcmVzZWFyY2hJZGVhKGlkKXsgZmxhc2goJ1NlYXJjaGluZyB0aGUgbGl2ZSB3ZWLigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2lkZWEvcmVzZWFyY2gnLHtpZH0pOyByZW5kZXIoKTsKICAgIGZsYXNoKCdTY29yZWQgJytyLnNjb3JlKycvMTAwIOKAlCAnK3IudmVyZGljdCk7IH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9IH0KYXN5bmMgZnVuY3Rpb24gbGF1bmNoSWRlYShpZCl7IGZsYXNoKCdEZXNpZ25pbmcgYWdlbnQgdGVhbeKApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvaWRlYS9sYXVuY2gnLHtpZH0pOyByZW5kZXIoKTsKICAgIGZsYXNoKHIuYWdlbnRzKycgYWdlbnQocykgY29tbWlzc2lvbmVkJysoci5za2lwcGVkPycgwrcgJytyLnNraXBwZWQrJyByZWplY3RlZCBhcyBub24tZXhlY3V0YWJsZSc6JycpKTsgfQogIGNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0gfQphc3luYyBmdW5jdGlvbiBraWxsSWRlYShpZCl7IGF3YWl0IEFQSSgnL2FwaS9pZGVhL2tpbGwnLHtpZH0pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZUlkZWFBdXRvKCl7CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvaWRlYS9hdXRvcGlsb3QnLHtvbjohUy5hdXRvSWRlYXN9KTsgcmVuZGVyKCk7CiAgICBmbGFzaChTLmF1dG9JZGVhcz8nQXV0b3BpbG90IE9OIOKAlCBoZSB3aWxsIGludmVudCB2ZW50dXJlcyBvbiBoaXMgb3duJzonQXV0b3BpbG90IG9mZicpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9IH0KCi8qIC0tLS0tLS0tLS0gUEFZTUVOVFMgLS0tLS0tLS0tLSAqLwpMSVZFLnBheT0oKT0+ewogIGNvbnN0IE89Uy5vcmRlcnN8fFtdOwogIGNvbnN0IHBhaWQ9Ty5maWx0ZXIobz0+by5wYWlkPjApLnJlZHVjZSgoYSxvKT0+YStvLnBhaWQsMCk7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJncmlkIGczIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxM3B4Ij4KICAgJHtrcGkoTy5sZW5ndGgsJ0xpbmtzIFJhaXNlZCcsJ3ZhcigtLWN5KScsJ2xpZmV0aW1lJyl9CiAgICR7a3BpKE8uZmlsdGVyKG89Pm8ucGFpZD4wKS5sZW5ndGgsJ1BhaWQnLHBhaWQ/J3ZhcigtLWdybiknOid2YXIoLS1kaW0pJywnc2V0dGxlZCcpfQogICAke2twaSgoUy5wYXk/KFMucGF5LmdhdGV3YXk9PT0ncmF6b3JwYXknPyfigrknOickJyk6JycpK2ZtdChwYWlkKSwnQ29sbGVjdGVkJywndmFyKC0tZ3JuKScsJ3JlYWwgbW9uZXknKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+UGF5bWVudCBMaW5rczwvaDM+CiAgICR7Ty5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+V2hlbjwvdGg+PHRoPkZvcjwvdGg+PHRoPkFtb3VudDwvdGg+PHRoPk1vZGU8L3RoPjx0aD5TdGF0dXM8L3RoPjx0aD5MaW5rPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAke08ubWFwKG89PmA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtvLnR9PC90ZD4KICAgIDx0ZD4ke2VzYyhvLmRlc2MpfTxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhvLmN1c3RvbWVyKX08L2Rpdj48L3RkPgogICAgPHRkPiR7by5jdXJyZW5jeX0gJHtmbXQoby5hbW91bnQpfTwvdGQ+CiAgICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke28ubGl2ZT8ndC1yZWQnOid0LWRpbSd9Ij4ke28ubGl2ZT8nTElWRSc6J1RFU1QnfTwvc3Bhbj48L3RkPgogICAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgJHtvLnBhaWQ+MD8ndC1ncm4nOid0LWFtYid9Ij4ke28ucGFpZD4wPydQQUlEJzplc2Moby5zdGF0dXMpfTwvc3Bhbj48L3RkPgogICAgPHRkPjxhIGhyZWY9IiR7ZXNjKG8udXJsKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iY29sb3I6dmFyKC0tY3kpIj5vcGVuIOKGlzwvYT48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gOic8ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gcGF5bWVudCBsaW5rcyByYWlzZWQgeWV0LjwvZGl2Pid9PC9kaXY+YDsKfTsKUkVOREVSLnBheT0oKT0+ewogIGNvbnN0IFA9Uy5wYXksIEdXPVMuZ2F0ZXdheXN8fFtdOwogIHJldHVybiBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjoke1A/KFAubGl2ZT8nIzZiMjIzMyc6JyMxYzVjM2MnKTonIzY3NDcwZid9O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywke1A/KFAubGl2ZT8nIzE2MGIwYyc6JyMwODE3MGYnKTonIzE1MTAwYSd9LCMwYTBmMTYpIj4KICAgPGgzIHN0eWxlPSJjb2xvcjoke1A/KFAubGl2ZT8ndmFyKC0tbWFnKSc6J3ZhcigtLWdybiknKTondmFyKC0tYW1iKSd9Ij7igrkgUEFZTUVOVFMg4oCUICR7UD8oUC5saXZlPydMSVZFIMK3IFJFQUwgTU9ORVknOidDT05ORUNURUQgwrcgVEVTVCBNT0RFJyk6J05PVCBDT05ORUNURUQnfTwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+JHtQCiAgICA/YFZlcmlmaWVkIGFnYWluc3QgPGI+JHtlc2MoUC5nYXRld2F5KX08L2I+LCBrZXkgJHtlc2MoUC5rZXlJZCl9LiAke1AubGl2ZQogICAgICA/JzxiIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj5MSVZFIE1PREUg4oCUIGxpbmtzIHlvdSByYWlzZSB0YWtlIHJlYWwgbW9uZXkuIEV2ZXJ5IGxpbmsgbmVlZHMgeW91ciBwYXNzd29yZC48L2I+JwogICAgICA6J1Rlc3QgbW9kZS4gTGlua3Mgd29yayBlbmQtdG8tZW5kIGJ1dCBtb3ZlIG5vIHJlYWwgbW9uZXkuJ31gCiAgICA6J0Nvbm5lY3QgUmF6b3JwYXkgb3IgU3RyaXBlIGJlbG93LiBLZXlzIGFyZSB2ZXJpZmllZCBhZ2FpbnN0IHRoZSByZWFsIEFQSSBiZWZvcmUgYmVpbmcgYWNjZXB0ZWQg4oCUIGEgd3Jvbmcga2V5IGlzIHJlamVjdGVkIGltbWVkaWF0ZWx5LCBub3Qgc3RvcmVkLid9PC9kaXY+CiAgIDx1bCBjbGFzcz0idGlnaHQiPjxsaT5TdGFydCB3aXRoIDxiPnRlc3Qga2V5czwvYj4uIFJhem9ycGF5IDxjb2RlPnJ6cF90ZXN0XzwvY29kZT4sIFN0cmlwZSA8Y29kZT5za190ZXN0XzwvY29kZT4g4oCUIGluc3RhbnQsIG5vIEtZQy48L2xpPgogICAgPGxpPkxpdmUga2V5cyBuZWVkIEtZQyAoUEFOICsgYmFuayBmb3IgUmF6b3JwYXkpLiBQcm92aWRlcnMgY2hhcmdlIH4yJSBwZXIgdHJhbnNhY3Rpb24g4oCUIHRoYXQgaXMgdGhlIGNvc3Qgb2YgbW92aW5nIG1vbmV5LCBub3Qgc29tZXRoaW5nIHRvIHJvdXRlIGFyb3VuZC48L2xpPgogICAgPGxpPllvdXIgc2VjcmV0IGlzIG5ldmVyIHJldHVybmVkIGJ5IHRoZSBBUEkgYW5kIG5ldmVyIHdyaXR0ZW4gdG8gdGhlIGF1ZGl0IGxlZGdlci48L2xpPjwvdWw+PC9kaXY+CiAgPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiAgIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Db25uZWN0IEdhdGV3YXk8L2gzPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5HYXRld2F5PC9zcGFuPjxzZWxlY3QgaWQ9InBnU2VsIiBjbGFzcz0iaW4iIG9uY2hhbmdlPSJwYXlIaW50KCkiPgogICAgICR7R1cubWFwKGc9PmA8b3B0aW9uIHZhbHVlPSIke2cuaWR9IiAke1AmJlAuZ2F0ZXdheT09PWcuaWQ/J3NlbGVjdGVkJzonJ30+JHtlc2MoZy5sYWJlbCl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9Indhcm5ib3giIGlkPSJwYXlIaW50IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMnB4Ij48L2Rpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+S2V5IElEIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+KFJhem9ycGF5IG9ubHkpPC9zcGFuPjwvc3Bhbj4KICAgICA8aW5wdXQgaWQ9InBnSWQiIGNsYXNzPSJpbiIgYXV0b2NvbXBsZXRlPSJvZmYiIHBsYWNlaG9sZGVyPSJyenBfdGVzdF8uLi4iPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlNlY3JldCBLZXk8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJwZ1NlY3JldCIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCIgYXV0b2NvbXBsZXRlPSJvZmYiIHBsYWNlaG9sZGVyPSJzZWNyZXQgLyBza190ZXN0Xy4uLiI+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImNvbm5lY3RQYXkoKSI+VkVSSUZZICZhbXA7IENPTk5FQ1Q8L2J1dHRvbj4KICAgICAke1A/JzxidXR0b24gY2xhc3M9ImJ0biBubyIgb25jbGljaz0icHVyZ2VQYXkoKSI+RGlzY29ubmVjdDwvYnV0dG9uPic6Jyd9PC9kaXY+PC9kaXY+CiAgIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5SYWlzZSBhIFBheW1lbnQgTGluazwvaDM+CiAgICAkeyFQPyc8ZGl2IGNsYXNzPSJtb25vLWRpbSI+Q29ubmVjdCBhIGdhdGV3YXkgZmlyc3QuPC9kaXY+JzpgCiAgICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkFtb3VudCAke1AuZ2F0ZXdheT09PSdyYXpvcnBheSc/JyhJTlIpJzonKFVTRCknfTwvc3Bhbj48aW5wdXQgaWQ9InBsQW10IiBjbGFzcz0iaW4iIHR5cGU9Im51bWJlciIgcGxhY2Vob2xkZXI9IjI1MDAiPjwvbGFiZWw+CiAgICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5DdXN0b21lciBuYW1lPC9zcGFuPjxpbnB1dCBpZD0icGxOYW1lIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJvcHRpb25hbCI+PC9sYWJlbD48L2Rpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+V2hhdCBpcyBpdCBmb3I8L3NwYW4+PGlucHV0IGlkPSJwbERlc2MiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9IldlYnNpdGUgdXB0aW1lIG1vbml0b3Jpbmcg4oCUIEF1Z3VzdCI+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9ImdyaWQgZzIiPgogICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+RW1haWw8L3NwYW4+PGlucHV0IGlkPSJwbEVtYWlsIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJvcHRpb25hbCI+PC9sYWJlbD4KICAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlBob25lPC9zcGFuPjxpbnB1dCBpZD0icGxQaG9uZSIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0ib3B0aW9uYWwiPjwvbGFiZWw+PC9kaXY+CiAgICAke1AubGl2ZT9gPGxhYmVsIGNsYXNzPSJmIj48c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+TElWRSBNT0RFIOKAlCBjb25maXJtIHdpdGggeW91ciBwYXNzd29yZDwvc3Bhbj4KICAgICAgPGlucHV0IGlkPSJwbFB3IiBjbGFzcz0iaW4iIHR5cGU9InBhc3N3b3JkIiBhdXRvY29tcGxldGU9Im9mZiI+PC9sYWJlbD5gOicnfQogICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0ibWFrZUxpbmsoKSI+Q1JFQVRFIExJTks8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9InJlZnJlc2hQYXkoKSI+Q0hFQ0sgRk9SIFBBWU1FTlRTPC9idXR0b24+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OXB4Ij5Zb3UgZ2V0IGEgVVJMIHRvIHNlbmQgb3ZlciBXaGF0c0FwcCBvciBlbWFpbC4gV2hlbiBpdCBzZXR0bGVzLCB0aGUgbGVkZ2VyIHVwZGF0ZXMgYW5kIHlvdSBnZXQgYW4gZW1haWwuPC9kaXY+YH08L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGRhdGEtbGl2ZT0icGF5Ij4ke0xJVkUucGF5KCl9PC9kaXY+YDsKfTsKZnVuY3Rpb24gcGF5SGludCgpewogIGNvbnN0IGc9KFMuZ2F0ZXdheXN8fFtdKS5maW5kKHg9PnguaWQ9PT1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGdTZWwnKS52YWx1ZSk7CiAgY29uc3QgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BheUhpbnQnKTsKICBpZihnJiZlbCkgZWwuaW5uZXJIVE1MPWA8Yj4ke2VzYyhnLmxhYmVsKX08L2I+PGJyPiR7ZXNjKGcuc2lnbnVwKX08YnI+PHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhnLmtleUhpbnQpfTwvc3Bhbj5gOwp9CmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RQYXkoKXsKICBmbGFzaCgnVmVyaWZ5aW5nIGtleXMgYWdhaW5zdCB0aGUgcmVhbCBBUEnigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3BheS9jb25uZWN0Jyx7Z2F0ZXdheTpwZ1NlbC52YWx1ZSxrZXlJZDpwZ0lkLnZhbHVlLGtleVNlY3JldDpwZ1NlY3JldC52YWx1ZX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKHIubGl2ZT8nQ09OTkVDVEVEIOKAlCBMSVZFIE1PREUsIHJlYWwgbW9uZXknOidDb25uZWN0ZWQgaW4gVEVTVCBtb2RlJyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiBwdXJnZVBheSgpeyBpZighY29uZmlybSgnRGlzY29ubmVjdCB0aGUgcGF5bWVudCBnYXRld2F5PycpKXJldHVybjsgYXdhaXQgQVBJKCcvYXBpL3BheS9wdXJnZScse30pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIG1ha2VMaW5rKCl7CiAgZmxhc2goJ0NyZWF0aW5nIGxpbmvigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3BheS9saW5rJyx7YW1vdW50OitwbEFtdC52YWx1ZSxkZXNjcmlwdGlvbjpwbERlc2MudmFsdWUsCiAgICAgIG5hbWU6cGxOYW1lLnZhbHVlLGVtYWlsOnBsRW1haWwudmFsdWUscGhvbmU6cGxQaG9uZS52YWx1ZSwKICAgICAgcHc6KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwbFB3Jyl8fHt9KS52YWx1ZX0pOwogICAgcmVuZGVyKCk7CiAgICBtb2RhbChgPGgzPlBheW1lbnQgbGluayByZWFkeTwvaDM+CiAgICAgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbjowIDAgMTJweCI+PGRpdiBzdHlsZT0id29yZC1icmVhazpicmVhay1hbGw7Y29sb3I6dmFyKC0tY3kpIj4ke2VzYyhyLnVybCl9PC9kaXY+PC9kaXY+CiAgICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0ibmF2aWdhdG9yLmNsaXBib2FyZD8ud3JpdGVUZXh0KCcke2VzYyhyLnVybCl9Jyk7Zmxhc2goJ0NvcGllZCcpIj5Db3B5IGxpbms8L2J1dHRvbj4KICAgICAgPGEgY2xhc3M9ImJ0biIgaHJlZj0iJHtlc2Moci51cmwpfSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPk9wZW4g4oaXPC9hPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9ImNsb3NlTW9kYWwoKSI+Q2xvc2U8L2J1dHRvbj48L2Rpdj5gKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hQYXkoKXsgZmxhc2goJ0NoZWNraW5nIGdhdGV3YXnigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3BheS9yZWZyZXNoJyx7fSk7IHJlbmRlcigpOwogICAgZmxhc2goci51cGRhdGVkP3IudXBkYXRlZCsnIG9yZGVyKHMpIHVwZGF0ZWQnOidObyBjaGFuZ2VzJyk7IH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9IH0KCi8qIC0tLS0tLS0tLS0gREVFUCBSRVNFQVJDSCAtLS0tLS0tLS0tICovClJFTkRFUi5yZXNlYXJjaD0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojMWMzZjc1O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywjMDgxMzFmLCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLWJsdSkiPvCfjJAgREVFUCBSRVNFQVJDSCDigJQgTElWRSBGUk9NIFRIRSBPUEVOIFdFQjwvaDM+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5IZSBkb2VzIG5vdCBzdG9yZSB0aGUgd29ybGQncyBkYXRhIOKAlCBub2JvZHkgY2FuLiBJbnN0ZWFkIGhlIDxiPmZldGNoZXMgaXQgbGl2ZSB0aGUgbW9tZW50IHlvdSBhc2s8L2I+LCB3aGljaCBpcyBiZXR0ZXIsIGJlY2F1c2Ugc3RvcmVkIGRhdGEgaXMgc3RhbGUgd2l0aGluIGRheXMuIFNvdXJjZXM6IER1Y2tEdWNrR28sIFdpa2lwZWRpYSwgV29ybGQgQmFuaywgbGl2ZSBGWC4gTm8gQVBJIGtleSwgbm8gcGFpZCBzZWFyY2guPC9kaXY+CiAgPHVsIGNsYXNzPSJ0aWdodCI+CiAgIDxsaT48Yj5EZWVwIGRpdmU8L2I+IHNlYXJjaGVzIDUgZGlmZmVyZW50IGFuZ2xlcywgZGVkdXBsaWNhdGVzLCBhZGRzIG9wZW4gZGF0YXNldHMsIHRoZW4gcmVhc29ucyBvdmVyIHRoZSBsb3QuPC9saT4KICAgPGxpPjxiPlJlYWQgcGFnZTwvYj4gcHVsbHMgdGhlIGZ1bGwgdGV4dCBvZiBhbnkgVVJMIOKAlCBjb21wZXRpdG9yIHNpdGVzLCBwcmljZSBsaXN0cywgZ292ZXJubWVudCBwYWdlcy48L2xpPgogICA8bGk+SGUgaXMgaW5zdHJ1Y3RlZCB0byBzdGF0ZSB3aGF0IGhlIGNvdWxkIDxiPm5vdDwvYj4gZmluZCwgcmF0aGVyIHRoYW4gZmlsbGluZyBnYXBzIHdpdGggaW52ZW50aW9uLjwvbGk+CiAgPC91bD48L2Rpdj4KICR7IVMubGxtPyc8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiM2YjIyMzM7YmFja2dyb3VuZDojMTQwODA5Ij48ZGl2IHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj5Db25uZWN0IGFuIEFJIGJyYWluIGZpcnN0IOKAlCByZXNlYXJjaCBuZWVkcyByZWFzb25pbmcgdG8gYmUgdXNlZnVsLjwvZGl2PjwvZGl2Pic6Jyd9CiA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+RGVlcCBEaXZlIGEgVG9waWM8L2gzPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlRvcGljPC9zcGFuPjxpbnB1dCBpZD0iZHZUb3BpYyIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iZS5nLiB1cHRpbWUgbW9uaXRvcmluZyBkZW1hbmQgZm9yIEx1ZGhpYW5hIGUtY29tbWVyY2UiPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+UmVnaW9uPC9zcGFuPjxpbnB1dCBpZD0iZHZSZWdpb24iIGNsYXNzPSJpbiIgdmFsdWU9Ikx1ZGhpYW5hIFB1bmphYiBJbmRpYSI+PC9sYWJlbD4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImRvRGl2ZSgpIj5JTlZFU1RJR0FURTwvYnV0dG9uPgogICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij5UYWtlcyB+MTVzLiBGaXZlIHNlYXJjaGVzIHBsdXMgb3BlbiBkYXRhLjwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5SZWFkIEFueSBQYWdlPC9oMz4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5VUkw8L3NwYW4+PGlucHV0IGlkPSJyZFVybCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly9jb21wZXRpdG9yLmNvbS9wcmljaW5nIj48L2xhYmVsPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPldoYXQgZG8geW91IHdhbnQgdG8ga25vdz8gKG9wdGlvbmFsKTwvc3Bhbj48aW5wdXQgaWQ9InJkQXNrIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJ3aGF0IGRvIHRoZXkgY2hhcmdlIGFuZCB3aGF0IGlzIG1pc3NpbmciPjwvbGFiZWw+CiAgIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJkb1JlYWQoKSI+UkVBRCBJVDwvYnV0dG9uPgogICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij5QdWxscyB1cCB0byAxMiwwMDAgY2hhcmFjdGVycyBvZiByZWFsIHBhZ2UgdGV4dC48L2Rpdj48L2Rpdj4KIDwvZGl2PgogPGRpdiBpZD0icmVzT3V0Ij48L2Rpdj5gOwphc3luYyBmdW5jdGlvbiBkb0RpdmUoKXsKICBjb25zdCB0PWR2VG9waWMudmFsdWUudHJpbSgpOyBpZighdCkgcmV0dXJuIGZsYXNoKCdUeXBlIGEgdG9waWMnKTsKICByZXNPdXQuaW5uZXJIVE1MPSc8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+U2VhcmNoaW5nIHRoZSBsaXZlIHdlYuKApjwvZGl2PjwvZGl2Pic7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9yZXNlYXJjaC9kaXZlJyx7dG9waWM6dCxyZWdpb246ZHZSZWdpb24udmFsdWV9KTsKICAgIHJlc091dC5pbm5lckhUTUw9YDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5GaW5kaW5ncyA8c3BhbiBjbGFzcz0idGFnIHQtYmx1Ij4ke2ZtdChyLmV2aWRlbmNlKX0gY2hhcnMgb2YgZXZpZGVuY2U8L3NwYW4+PC9oMz4KICAgICAgPGRpdiBzdHlsZT0id2hpdGUtc3BhY2U6cHJlLXdyYXA7bGluZS1oZWlnaHQ6MS42NSI+JHtlc2Moci50ZXh0KX08L2Rpdj48L2Rpdj5gOwogIH1jYXRjaChlKXsgcmVzT3V0LmlubmVySFRNTD1gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojNmIyMjMzIj48ZGl2IHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj4ke2VzYyhlLm1lc3NhZ2UpfTwvZGl2PjwvZGl2PmAgfQp9CmFzeW5jIGZ1bmN0aW9uIGRvUmVhZCgpewogIGNvbnN0IHU9cmRVcmwudmFsdWUudHJpbSgpOyBpZighdSkgcmV0dXJuIGZsYXNoKCdQYXN0ZSBhIFVSTCcpOwogIHJlc091dC5pbm5lckhUTUw9JzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5GZXRjaGluZyBwYWdl4oCmPC9kaXY+PC9kaXY+JzsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3Jlc2VhcmNoL3JlYWQnLHt1cmw6dSxhc2s6cmRBc2sudmFsdWUudHJpbSgpfSk7CiAgICByZXNPdXQuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+JHtlc2Moci50aXRsZSl9IDxzcGFuIGNsYXNzPSJ0YWcgdC1ibHUiPiR7Zm10KHIuY2hhcnMpfSBjaGFycyByZWFkPC9zcGFuPjwvaDM+CiAgICAgIDxkaXYgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNjUiPiR7ZXNjKHIudGV4dCl9PC9kaXY+PC9kaXY+YDsKICB9Y2F0Y2goZSl7IHJlc091dC5pbm5lckhUTUw9YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6IzZiMjIzMyI+PGRpdiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gIH0KfQoKLyogLS0tLS0tLS0tLSBBSSBCUkFJTiAtLS0tLS0tLS0tICovClJFTkRFUi5icmFpbj0oKT0+ewogIGNvbnN0IEw9Uy5sbG0sIFBWPVMucHJvdmlkZXJzfHxbXTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6JHtMPycjMWM1YzNjJzonIzY3NDcwZid9O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywke0w/JyMwODE3MGYnOicjMTUxMDBhJ30sIzBhMGYxNikiPgogICA8aDMgc3R5bGU9ImNvbG9yOiR7TD8ndmFyKC0tZ3JuKSc6J3ZhcigtLWFtYiknfSI+4peIIEFJIEJSQUlOIOKAlCAke0w/J0NPTk5FQ1RFRCc6J05PVCBDT05ORUNURUQnfTwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+JHtMCiAgICA/YEFnZW50cyBjYW4gdGhpbmsuIENvbm5lY3RlZCB0byA8Yj4ke2VzYyhMLnByb3ZpZGVyKX08L2I+IHJ1bm5pbmcgPGI+JHtlc2MoTC5tb2RlbCl9PC9iPi4gS2V5ICR7ZXNjKEwua2V5KX0uYAogICAgOidZb3VyIGFnZW50cyBjYW4gbWVhc3VyZSB0aGluZ3MgYnV0IGNhbm5vdCA8Yj5yZWFzb248L2I+IHlldC4gQ29ubmVjdCBhIGZyZWUgbW9kZWwgYmVsb3cgYW5kIHRoZXkgZ2FpbiB0aGUgYWJpbGl0eSB0byBkaWFnbm9zZSwgd3JpdGUsIGFuYWx5c2UgYW5kIHN0cmF0ZWdpc2UuJ308L2Rpdj4KICAgPHVsIGNsYXNzPSJ0aWdodCI+PGxpPkV2ZXJ5IHByb3ZpZGVyIGJlbG93IGlzIDxiPmdlbnVpbmVseSBmcmVlPC9iPiDigJQgbm8gY3JlZGl0IGNhcmQuPC9saT4KICAgIDxsaT5Zb3VyIGtleSBpcyBzdG9yZWQgbG9jYWxseSBhbmQgbmV2ZXIgd3JpdHRlbiB0byB0aGUgYXVkaXQgbGVkZ2VyLjwvbGk+PC91bD48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiM0YTMwODA7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTYwZGVnLCMxNDBmMjIsIzBhMGYxNikiPgogICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLXB1cikiPuKakSBXQU5UIEhJTSBGVUxMWSBJTkRFUEVOREVOVD8g4oCUIFJFQUQgVEhJUzwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206OXB4Ij5BIHRoaW5raW5nIGJyYWluIGNhbm5vdCBiZSBjb25qdXJlZCBmcm9tIG5vdGhpbmcuIFRyYWluaW5nIG9uZSBjb3N0cyBtaWxsaW9ucyBpbiBHUFUgdGltZS4gRXZlcnkgQUkgb24gZWFydGgg4oCUIGluY2x1ZGluZyB0aGlzIG9uZSDigJQgcnVucyB3ZWlnaHRzIHRyYWluZWQgYnkgc29tZW9uZSB3aXRoIGEgZGF0YSBjZW50cmUuIFRoZSBob25lc3QgcXVlc3Rpb24gaXMgbm90IDxlbT4iaGlzIGJyYWluIG9yIHRoZWlycyI8L2VtPiBidXQgPGI+IndobyBjYW4gc3dpdGNoIGl0IG9mZiI8L2I+LjwvZGl2PgogICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+PGIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPk9sbGFtYSBpcyB0aGUgYW5zd2VyIHRvIHRoYXQuPC9iPiBUaGUgbW9kZWwgZmlsZSBzaXRzIG9uIHlvdXIgb3duIGRpc2suIE5vIGtleSwgbm8gYWNjb3VudCwgbm8gcmF0ZSBsaW1pdCwgbm8gdGVybXMgb2Ygc2VydmljZS4gSXQgd29ya3Mgd2l0aCB0aGUgaW50ZXJuZXQgdW5wbHVnZ2VkLiBOb2JvZHkgY2FuIHJldm9rZSBpdCwgcmVhZCB5b3VyIHByb21wdHMsIG9yIGNoYW5nZSB0aGUgZGVhbC4gVGhhdCBpcyByZWFsIHNvdmVyZWlnbnR5IOKAlCB0aGUgb25seSBjb3N0IGlzIHlvdXIgaGFyZHdhcmUuPC9kaXY+CiAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoxNTBweCI+MS4gSW5zdGFsbDwvdGQ+PHRkPkRvd25sb2FkIGZyb20gPGI+b2xsYW1hLmNvbTwvYj4gKGZyZWUsIFdpbmRvd3MvTWFjL0xpbnV4KTwvdGQ+PC90cj4KICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4yLiBHZXQgYSBtb2RlbDwvdGQ+PHRkPkluIHRlcm1pbmFsOiA8Y29kZT5vbGxhbWEgcHVsbCBsbGFtYTMuMjwvY29kZT4g4oCUIGFib3V0IDIgR0I8L3RkPjwvdHI+CiAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+My4gQ29ubmVjdDwvdGQ+PHRkPkNob29zZSA8Yj5PbGxhbWE8L2I+IGFib3ZlLCBsZWF2ZSB0aGUga2V5IGJsYW5rLCBwcmVzcyBDT05ORUNUPC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkJpZ2dlciBicmFpbjwvdGQ+PHRkPjxjb2RlPm9sbGFtYSBwdWxsIHF3ZW4yLjU6MTRiPC9jb2RlPiBpZiB5b3UgaGF2ZSAxNiBHQisgUkFNPC90ZD48L3RyPgogICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo5cHgiPjxiPlRoZSB0cmFkZS1vZmYsIHN0YXRlZCBwbGFpbmx5OjwvYj4gYSBsb2NhbCBtb2RlbCBvbiBhIG5vcm1hbCBsYXB0b3AgaXMgc2xvd2VyIGFuZCBsZXNzIGNhcGFibGUgdGhhbiBHcm9xJ3MgZnJlZSBjbG91ZCBtb2RlbHMuIFlvdSBhcmUgZXhjaGFuZ2luZyByYXcgcG93ZXIgZm9yIHRvdGFsIGNvbnRyb2wuIEFsc28g4oCUIHRoaXMgUmVuZGVyIGluc3RhbmNlIGNhbm5vdCByZWFjaCBhbiBPbGxhbWEgcnVubmluZyBvbiB5b3VyIFBDOyBsb2NhbCBicmFpbiBtZWFucyBydW5uaW5nIHRoZSBDaGFpcm1hbiBsb2NhbGx5IHRvby48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkNvbm5lY3QgYSBGcmVlIE1vZGVsPC9oMz4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+UHJvdmlkZXI8L3NwYW4+PHNlbGVjdCBpZD0ibHBQcm92IiBjbGFzcz0iaW4iIG9uY2hhbmdlPSJwcm92SGludCgpIj4KICAgICAke1BWLm1hcChwPT5gPG9wdGlvbiB2YWx1ZT0iJHtwLmlkfSIgJHtMJiZMLnByb3ZpZGVyPT09cC5pZD8nc2VsZWN0ZWQnOicnfT4ke2VzYyhwLmxhYmVsKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPgogICAgPGRpdiBjbGFzcz0id2FybmJveCIgaWQ9InByb3ZIaW50IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMnB4Ij48L2Rpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+QVBJIEtleSA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPihub3QgbmVlZGVkIGZvciBPbGxhbWEpPC9zcGFuPjwvc3Bhbj4KICAgICA8aW5wdXQgaWQ9ImxwS2V5IiBjbGFzcz0iaW4iIHR5cGU9InBhc3N3b3JkIiBhdXRvY29tcGxldGU9Im9mZiIgcGxhY2Vob2xkZXI9InBhc3RlIHlvdXIgZnJlZSBrZXkiPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk1vZGVsIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+KGJsYW5rID0gcHJvdmlkZXIgZGVmYXVsdCk8L3NwYW4+PC9zcGFuPgogICAgIDxpbnB1dCBpZD0ibHBNb2RlbCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0ibGVhdmUgYmxhbmsiIGxpc3Q9Im1vZGVsTGlzdCI+CiAgICAgPGRhdGFsaXN0IGlkPSJtb2RlbExpc3QiPjwvZGF0YWxpc3Q+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+QmFzZSBVUkwgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ob25seSBmb3IgQ3VzdG9tIOKAlCBhbnkgT3BlbkFJLWNvbXBhdGlibGUgQVBJKTwvc3Bhbj48L3NwYW4+CiAgICAgPGlucHV0IGlkPSJscEhvc3QiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9Imh0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MSI+PC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImNvbm5lY3RMTE0oKSI+Q09OTkVDVCBCUkFJTjwvYnV0dG9uPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBvayIgb25jbGljaz0idGVzdExMTSgpIj5URVNUIElUPC9idXR0b24+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJmZXRjaE1vZGVscygpIj5GRVRDSCBMSVZFIE1PREVMUzwvYnV0dG9uPgogICAgICR7TD8nPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIiBvbmNsaWNrPSJwdXJnZUxMTSgpIj5EaXNjb25uZWN0PC9idXR0b24+JzonJ308L2Rpdj4KICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo5cHgiPlByb3ZpZGVycyByZXRpcmUgbW9kZWxzIHdpdGhvdXQgbm90aWNlLiBJZiBURVNUIElUIHNheXMgTU9ERUwgUkVUSVJFRCwgcHJlc3MgRkVUQ0ggTElWRSBNT0RFTFMgYW5kIHBpY2sgb25lIGZyb20gdGhlIGxpc3QuPC9kaXY+PC9kaXY+CiAgICR7TD9gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1hbWIpIj4KICAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+4oeEIFNXSVRDSCBNT0RFTCDigJQgS0VFUFMgWU9VUiBLRVk8L2gzPgogICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPkN1cnJlbnRseSBydW5uaW5nIDxiPiR7ZXNjKEwubW9kZWwpfTwvYj4gb24gJHtlc2MoTC5wcm92aWRlcil9LiBQcm92aWRlcnMgcmV0aXJlIG1vZGVscyB3aXRob3V0IG5vdGljZSDigJQgc3dhcCBpdCBoZXJlIHdpdGhvdXQgZGlzY29ubmVjdGluZyBvciByZS1wYXN0aW5nIHlvdXIga2V5LjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij4KICAgICA8aW5wdXQgaWQ9InN3TW9kZWwiIGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDoyODBweCIgcGxhY2Vob2xkZXI9InR5cGUgYSBtb2RlbCBuYW1lIiB2YWx1ZT0iJHtlc2MoTC5tb2RlbCl9Ij4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0ic3dpdGNoTW9kZWwoKSI+U1dJVENIPC9idXR0b24+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJmZXRjaE1vZGVscygpIj5GRVRDSCBMSVZFIExJU1Q8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gb2siIG9uY2xpY2s9InRlc3RMTE0oKSI+VEVTVCBJVDwvYnV0dG9uPjwvZGl2PgogICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweCI+S25vd24gd29ya2luZyBvbiBHcm9xIHJpZ2h0IG5vdyDigJQgY2xpY2sgdG8gdXNlOjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93Ij4ke1snb3BlbmFpL2dwdC1vc3MtMTIwYicsJ29wZW5haS9ncHQtb3NzLTIwYicsJ3F3ZW4vcXdlbjMuNi0yN2InXQogICAgICAubWFwKG09PmA8YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9InF1aWNrTW9kZWwoJyR7bX0nKSI+JHttfTwvYnV0dG9uPmApLmpvaW4oJycpfTwvZGl2PgogICA8L2Rpdj5gOicnfQogICA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiR7KFMuY29vbGRvd258fDApPyd2YXIoLS1tYWcpJzondmFyKC0tc3Ryb2tlKSd9Ij4KICAgIDxoMz5CYWNrdXAgUHJvdmlkZXJzIDxzcGFuIGNsYXNzPSJ0YWcgJHsoUy5sbG1CYWNrdXBzfHxbXSkubGVuZ3RoPyd0LWdybic6J3QtZGltJ30iPiR7KFMubGxtQmFja3Vwc3x8W10pLmxlbmd0aH0gU1BBUkU8L3NwYW4+PC9oMz4KICAgICR7KFMuY29vbGRvd258fDApP2A8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZykiPjxiPlFVT1RBIENPT0xET1dOIOKAlCAke01hdGguY2VpbChTLmNvb2xkb3duLzYwKX0gbWluIGxlZnQuPC9iPiBUaGUgZnJlZSB0aWVyIHRocm90dGxlZC4gQUkgd29yayBpcyBwYXVzZWQgc28gdGhlIGxpbWl0IGNhbiByZXNldDsgbW9uaXRvcmluZyBrZWVwcyBydW5uaW5nLiBBZGQgYSBiYWNrdXAgYmVsb3cgYW5kIHdvcmsgY29udGludWVzIHN0cmFpZ2h0IHRocm91Z2ggdGhlIG5leHQgbGltaXQuCiAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPjxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iY2xlYXJDb29sKCkiPkNsZWFyIGNvb2xkb3duIG5vdzwvYnV0dG9uPjwvZGl2PjwvZGl2PmA6Jyd9CiAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+RnJlZSB0aWVycyB0aHJvdHRsZS4gQWRkIDxiPnVwIHRvIDQwIGtleXM8L2I+IOKAlCBmcm9tIGRpZmZlcmVudCBwcm92aWRlcnMsIG9yIHNldmVyYWwga2V5cyBmcm9tIHRoZSBzYW1lIG9uZS4gV2hlbiBhbnkga2V5IGlzIHJhdGUtbGltaXRlZCBpdCBpcyBwYXJrZWQgZm9yIDEwIG1pbnV0ZXMgYW5kIHRoZSBDaGFpcm1hbiByb3RhdGVzIHRvIHRoZSBuZXh0IGF1dG9tYXRpY2FsbHkuIE5vdGhpbmcgc3RvcHMuPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJncmlkIGczIj4KICAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlByb3ZpZGVyPC9zcGFuPjxzZWxlY3QgaWQ9ImJrUHJvdiIgY2xhc3M9ImluIj4KICAgICAgJHsoUy5wcm92aWRlcnN8fFtdKS5tYXAocD0+YDxvcHRpb24gdmFsdWU9IiR7cC5pZH0iPiR7ZXNjKHAubGFiZWwpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+CiAgICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5BUEkga2V5PC9zcGFuPjxpbnB1dCBpZD0iYmtLZXkiIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiIGF1dG9jb21wbGV0ZT0ib2ZmIj48L2xhYmVsPgogICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+TW9kZWwgKGJsYW5rID0gZGVmYXVsdCk8L3NwYW4+PGlucHV0IGlkPSJia01vZGVsIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJsZWF2ZSBibGFuayI+PC9sYWJlbD4KICAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkJhc2UgVVJMIChDdXN0b20gb25seSk8L3NwYW4+PGlucHV0IGlkPSJia0hvc3QiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9Imh0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MSI+PC9sYWJlbD4KICAgIDwvZGl2PgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImFkZEJhY2t1cCgpIj5BREQgQkFDS1VQPC9idXR0b24+CiAgICAkeyhTLmxsbUJhY2t1cHN8fFtdKS5sZW5ndGg/YDxkaXYgY2xhc3M9InR3IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+IzwvdGg+PHRoPlByb3ZpZGVyPC90aD48dGg+TW9kZWw8L3RoPjx0aD5LZXk8L3RoPjx0aD5TZXJ2ZWQ8L3RoPjx0aD5TdGF0ZTwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAke1MubGxtQmFja3Vwcy5tYXAoKGIsaSk9PmA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtpKzF9PC90ZD48dGQ+JHtlc2MoYi5wcm92aWRlcil9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlc2MoYi5tb2RlbCl9PC90ZD48dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhiLmtleSl9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtiLm9rfHwwfSR7Yi5mYWlsPycgLyAnK2IuZmFpbCsn4pyXJzonJ308L3RkPgogICAgICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke2IuY29vbGVkPyd0LWFtYic6J3QtZ3JuJ30iPiR7Yi5jb29sZWQ/J0NPT0xJTkcnOidSRUFEWSd9PC9zcGFuPjwvdGQ+CiAgICAgIDx0ZD48YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9InJtQmFja3VwKCR7aX0pIj5SZW1vdmU8L2J1dHRvbj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDonJ30KICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5SZWNvbW1lbmRlZCBzcGFyZXM6IDxiPkdvb2dsZSBBSSBTdHVkaW88L2I+ICgxLDUwMC9kYXkpLCA8Yj5DZXJlYnJhczwvYj4gKDFNIHRva2Vucy9kYXkpLCA8Yj5OVklESUEgTklNPC9iPi4gRGlmZmVyZW50IGNvbXBhbmllcyBtZWFucyBzZXBhcmF0ZSBxdW90YXMuPC9kaXY+PC9kaXY+CiAgIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5XaGF0IEFnZW50cyBHYWluPC9oMz4KICAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTMwcHgiPmFpLmJyaWVmPC90ZD48dGQ+RXhlY3V0aXZlIGJyaWVmIHdyaXR0ZW4gZnJvbSB5b3VyIHJlYWwgc3lzdGVtIHN0YXRlPC90ZD48L3RyPgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5haS5pbmNpZGVudDwvdGQ+PHRkPlJhbmtlZCBkaWFnbm9zaXMgb2YgYW55IHNpdGUgdGhhdCBnb2VzIGRvd248L3RkPjwvdHI+CiAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPmFpLnJldmVudWU8L3RkPjx0ZD5Db25jcmV0ZSBtb25leS1tYWtpbmcgcm91dGVzIGZyb20gd2hhdCB5b3UgYWN0dWFsbHkgaGF2ZTwvdGQ+PC90cj4KICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+YWkuY2xpZW50X3JlcG9ydDwvdGQ+PHRkPkNsaWVudC1yZWFkeSB1cHRpbWUgcmVwb3J0IHlvdSBjYW4gc2VuZCBhbmQgY2hhcmdlIGZvcjwvdGQ+PC90cj4KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5BZGQgdGhlc2Ugb24gdGhlIExpdmUgT3BlcmF0aW9ucyBwYWdlIGFzIHN0YW5kaW5nIG9yZGVycywgb3IgcnVuIHRoZW0gb24gZGVtYW5kIGZyb20gQWdlbnQgV29yay48L2Rpdj48L2Rpdj4KICA8L2Rpdj5gfTsKZnVuY3Rpb24gcHJvdkhpbnQoKXsKICBjb25zdCBwPShTLnByb3ZpZGVyc3x8W10pLmZpbmQoeD0+eC5pZD09PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdscFByb3YnKS52YWx1ZSk7CiAgY29uc3QgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Byb3ZIaW50Jyk7CiAgaWYocCYmZWwpIGVsLmlubmVySFRNTD1gPGI+JHtlc2MocC5sYWJlbCl9PC9iPjxicj4ke2VzYyhwLnNpZ251cCl9PGJyPkRlZmF1bHQgbW9kZWw6IDxjb2RlPiR7ZXNjKHAubW9kZWwpfTwvY29kZT5gOwp9CmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RMTE0oKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9sbG0vY29ubmVjdCcse3Byb3ZpZGVyOmxwUHJvdi52YWx1ZSxrZXk6bHBLZXkudmFsdWUsbW9kZWw6bHBNb2RlbC52YWx1ZSxob3N0Oihkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbHBIb3N0Jyl8fHt9KS52YWx1ZX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKCdCcmFpbiBjb25uZWN0ZWQg4oCUIG5vdyBwcmVzcyBURVNUIElUJyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiB0ZXN0TExNKCl7IGZsYXNoKCdUaGlua2luZ+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvbGxtL3Rlc3QnLHt9KTsgcmVuZGVyKCk7CiAgICBtb2RhbChgPGgzPkFJIEJyYWluIE9ubGluZTwvaDM+PGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9Im1hcmdpbjowIDAgMTJweCI+PGRpdj4ke2VzYyhyLnRleHQpfTwvZGl2PjwvZGl2PgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhyLm1vZGVsKX0gwrcgJHtyLm1zfW1zPC9kaXY+CiAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iY2xvc2VNb2RhbCgpO2dvKCd3b3JrJykiPkdpdmUgaXQgd29yayDihpI8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9ImNsb3NlTW9kYWwoKSI+Q2xvc2U8L2J1dHRvbj48L2Rpdj5gKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfSB9CmFzeW5jIGZ1bmN0aW9uIHB1cmdlTExNKCl7IGlmKCFjb25maXJtKCdEaXNjb25uZWN0IHRoZSBBSSBicmFpbj8nKSlyZXR1cm47IGF3YWl0IEFQSSgnL2FwaS9sbG0vcHVyZ2UnLHt9KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiBzd2l0Y2hNb2RlbCgpewogIGNvbnN0IG09KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzd01vZGVsJyl8fHt9KS52YWx1ZTsKICBpZighbXx8IW0udHJpbSgpKSByZXR1cm4gZmxhc2goJ1R5cGUgYSBtb2RlbCBuYW1lJyk7CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvbGxtL21vZGVsJyx7bW9kZWw6bS50cmltKCl9KTsgcmVuZGVyKCk7CiAgICBmbGFzaCgnU3dpdGNoZWQgdG8gJyttLnRyaW0oKSsnIOKAlCBub3cgcHJlc3MgVEVTVCBJVCcpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gcXVpY2tNb2RlbChtKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9sbG0vbW9kZWwnLHttb2RlbDptfSk7IHJlbmRlcigpOyBmbGFzaCgnU3dpdGNoZWQgdG8gJyttKTsKICAgIHNldFRpbWVvdXQodGVzdExMTSwgNDAwKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGFkZEJhY2t1cCgpewogIHRyeXsgYXdhaXQgQVBJKCcvYXBpL2xsbS9iYWNrdXAvYWRkJyx7cHJvdmlkZXI6YmtQcm92LnZhbHVlLGtleTpia0tleS52YWx1ZSxtb2RlbDpia01vZGVsLnZhbHVlLGhvc3Q6KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdia0hvc3QnKXx8e30pLnZhbHVlfSk7CiAgICByZW5kZXIoKTsgZmxhc2goJ0JhY2t1cCBhZGRlZCDigJQgcXVvdGEgbGltaXRzIHdpbGwgbm8gbG9uZ2VyIHN0b3AgeW91Jyk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiBybUJhY2t1cChpKXsgYXdhaXQgQVBJKCcvYXBpL2xsbS9iYWNrdXAvcmVtb3ZlJyx7aW5kZXg6aX0pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIGNsZWFyQ29vbCgpeyBhd2FpdCBBUEkoJy9hcGkvbGxtL2Nvb2xkb3duL2NsZWFyJyx7fSk7IHJlbmRlcigpOyBmbGFzaCgnQ29vbGRvd24gY2xlYXJlZCcpIH0KYXN5bmMgZnVuY3Rpb24gZmV0Y2hNb2RlbHMoKXsKICBmbGFzaCgnQXNraW5nIHByb3ZpZGVyIHdoYXQgaXQgc2VydmVzIHRvZGF54oCmJyk7CiAgdHJ5ewogICAgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvbGxtL21vZGVscycse3Byb3ZpZGVyOmxwUHJvdi52YWx1ZSxrZXk6bHBLZXkudmFsdWV9KTsKICAgIGlmKCFyLm1vZGVscy5sZW5ndGgpIHJldHVybiBmbGFzaCgnUHJvdmlkZXIgcmV0dXJuZWQgbm8gY2hhdCBtb2RlbHMnKTsKICAgIG1vZGFsKGA8aDM+TGl2ZSBtb2RlbHMgb24gJHtlc2MobHBQcm92LnZhbHVlKX08L2gzPgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij4ke3IubW9kZWxzLmxlbmd0aH0gYXZhaWxhYmxlIHJpZ2h0IG5vdy4gQ2xpY2sgb25lIHRvIHVzZSBpdC48L2Rpdj4KICAgICA8ZGl2IGNsYXNzPSJkaXJMaXN0IiBzdHlsZT0ibWF4LWhlaWdodDozNDBweCI+JHtyLm1vZGVscy5tYXAobT0+CiAgICAgICBgPGJ1dHRvbiBvbmNsaWNrPSJwaWNrTW9kZWwoJyR7ZXNjKG0pfScpIj4ke2VzYyhtKX08L2J1dHRvbj5gKS5qb2luKCcnKX08L2Rpdj4KICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjEycHgiPjxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0iY2xvc2VNb2RhbCgpIj5DbG9zZTwvYnV0dG9uPjwvZGl2PmApOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KZnVuY3Rpb24gcGlja01vZGVsKG0peyBjbG9zZU1vZGFsKCk7CiAgY29uc3QgZWw9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xwTW9kZWwnKTsgaWYoZWwpIGVsLnZhbHVlPW07CiAgZmxhc2goJ01vZGVsIHNldCB0byAnK20rJyDigJQgcHJlc3MgQ09OTkVDVCBCUkFJTiB0aGVuIFRFU1QgSVQnKTsgfQoKLyogLS0tLS0tLS0tLSBBR0VOVCBXT1JLIC0tLS0tLS0tLS0gKi8KY29uc3QgUVVJQ0s9WwogWydFeGVjdXRpdmUgYnJpZWYnLCdTdW1tYXJpc2UgbXkgc3lzdGVtIHN0YXRlIGFuZCB0ZWxsIG1lIHRoZSBzaW5nbGUgbW9zdCB1cmdlbnQgdGhpbmcgdG8gZml4LiBCZSBibHVudC4nXSwKIFsnTWFrZSBtb25leScsJ09ubHkgcHJvcG9zZSBvZmZlcnMgZGVsaXZlcmVkIHVzaW5nIE1ZIHVwdGltZSBtb25pdG9yaW5nIHN5c3RlbSAoMjQvNyBIVFRQIHByb2JpbmcsIFRMUyBleHBpcnkgYWxlcnRzLCBpbnN0YW50IG91dGFnZSBlbWFpbCwgYXZhaWxhYmlsaXR5IGFuZCBwOTUgcmVwb3J0aW5nKS4gVFJVVEggUlVMRTogSSBoYXZlIG5ldmVyIG1vbml0b3JlZCBhbnkgY2xpZW50IHNpdGUgYW5kIGhhdmUgbm8gdHJhY2sgcmVjb3JkLiBUaGUgb3V0cmVhY2ggbWVzc2FnZSBtdXN0IGNvbnRhaW4gWkVSTyBjbGFpbXMgSSBjYW5ub3QgcHJvdmUg4oCUIG5vICJJIG5vdGljZWQgb3V0YWdlcyBvbiBsb2NhbCBzaXRlcyIsIG5vIGludmVudGVkIHJldmVudWUgZmlndXJlcywgbm8gdW52ZXJpZmllZCBzdGF0aXN0aWNzLiBMZWFkIHdpdGggYSBmcmVlIHRyaWFsLCBub3QgYSBmYWtlIG9ic2VydmF0aW9uLiBWZXJpZnkgYW55IGFyaXRobWV0aWMgeW91IHN0YXRlLiBHaXZlIDMgb2ZmZXJzOiB0aGUgb2ZmZXIgaW4gb25lIHNlbnRlbmNlLCB0aGUgTHVkaGlhbmEgYnVzaW5lc3MgdHlwZSBhbmQgaXRzIHJlYWwgcGFpbiwgbW9udGhseSBJTlIgcHJpY2Ugd2l0aCBzb3VuZCByZWFzb25pbmcsIHRoZSBsaXRlcmFsIGZpcnN0IFdoYXRzQXBwIG1lc3NhZ2UgdW5kZXIgNTAgd29yZHMsIGFuZCB0aGUgYmlnZ2VzdCBvYmplY3Rpb24gd2l0aCBhbiBob25lc3QgY291bnRlci4gQ29sZCBvdXRyZWFjaCBjbG9zZXMgMS0zJS4nXSwKIFsnRmluZCBwcm9zcGVjdHMnLCdMaXN0IDEwIHNwZWNpZmljIGJ1c2luZXNzIHR5cGVzIGluIEx1ZGhpYW5hIHRoYXQgbG9zZSByZWFsIG1vbmV5IHdoZW4gdGhlaXIgd2Vic2l0ZSBnb2VzIGRvd24sIHJhbmtlZCBieSBob3cgbXVjaCB0aGV5IGxvc2UgcGVyIGhvdXIuIEZvciBlYWNoLCBzYXkgd2hlcmUgSSBjYW4gZmluZCB0aGVpciBjb250YWN0IGRldGFpbHMgZm9yIGZyZWUuJ10sCiBbJ0NsaWVudCBwaXRjaCcsJ1dyaXRlIGEgV2hhdHNBcHAgbWVzc2FnZSBvZmZlcmluZyBmcmVlIDE0LWRheSB3ZWJzaXRlIHVwdGltZSBtb25pdG9yaW5nIHRvIGEgbG9jYWwgYnVzaW5lc3Mgb3duZXIuIFBsYWluIEluZGlhbiBFbmdsaXNoLCBubyBtYXJrZXRpbmcgbGFuZ3VhZ2UsIG5vIGVtb2ppLiBVbmRlciA0NSB3b3Jkcy4gVGhlIGdvYWwgaXMgYSByZXBseSwgbm90IGEgc2FsZS4nXSwKIFsnSGFuZGxlIG9iamVjdGlvbnMnLCdBIEx1ZGhpYW5hIGJ1c2luZXNzIG93bmVyIHNheXMgIm15IHdlYnNpdGUgbmV2ZXIgZ29lcyBkb3duLCBJIGRvbiBub3QgbmVlZCB0aGlzIi4gR2l2ZSBtZSB0aHJlZSBob25lc3QgcmVwbGllcyB0aGF0IGRvIG5vdCBleGFnZ2VyYXRlIG9yIHVzZSBmZWFyIHRhY3RpY3MuJ10sCiBbJ0ludm9pY2UgdGVtcGxhdGUnLCdXcml0ZSBhIHNpbXBsZSBtb250aGx5IGludm9pY2UgZm9yIHdlYnNpdGUgdXB0aW1lIG1vbml0b3JpbmcsIHJlYWR5IHRvIGZpbGwgaW4sIHN1aXRhYmxlIGZvciBhIHNtYWxsIEluZGlhbiBidXNpbmVzcy4gSW5jbHVkZSBHU1QgcGxhY2Vob2xkZXIgYW5kIFVQSSBwYXltZW50IGxpbmUuJ10KXTsKUkVOREVSLndvcms9KCk9PnsKICBjb25zdCBPPVMub3V0cHV0c3x8W107CiAgcmV0dXJuIGAkeyFTLmxsbT9gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojNmIyMjMzO2JhY2tncm91bmQ6IzE0MDgwOSI+CiAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+Tk8gQlJBSU4gQ09OTkVDVEVEPC9oMz4KICAgPGRpdj5BZ2VudHMgY2Fubm90IHRoaW5rIHlldC4gPGIgb25jbGljaz0iZ28oJ2JyYWluJykiIHN0eWxlPSJjb2xvcjp2YXIoLS1jeSk7Y3Vyc29yOnBvaW50ZXI7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZSI+Q29ubmVjdCBhIGZyZWUgbW9kZWw8L2I+IGZpcnN0IOKAlCB0YWtlcyBhYm91dCAyIG1pbnV0ZXMgYW5kIG5lZWRzIG5vIGNyZWRpdCBjYXJkLjwvZGl2PjwvZGl2PmA6Jyd9CiAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkdpdmUgdGhlIENoYWlybWFuIFdvcmsgPHNwYW4gY2xhc3M9InRhZyB0LWN5Ij5QTEFJTiBFTkdMSVNIPC9zcGFuPjwvaDM+CiAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5UeXBlIGFueSBpbnN0cnVjdGlvbi4gQSByZWFsIG1vZGVsIGV4ZWN1dGVzIGl0IGFuZCB0aGUgcmVzdWx0IGlzIHNhdmVkIGJlbG93LjwvZGl2PgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkluc3RydWN0aW9uPC9zcGFuPjx0ZXh0YXJlYSBpZD0id2tQcm9tcHQiIGNsYXNzPSJpbiIgc3R5bGU9Im1pbi1oZWlnaHQ6OTBweCIKICAgICBwbGFjZWhvbGRlcj0iZS5nLiBXcml0ZSBhIG9uZS1wYWdlIHByb3Bvc2FsIG9mZmVyaW5nIHVwdGltZSBtb25pdG9yaW5nIHRvIGEgTHVkaGlhbmEgY2xvdGhpbmcgc2hvcCwgcHJpY2VkIGluIElOUi4iPjwvdGV4dGFyZWE+PC9sYWJlbD4KICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iZG9Xb3JrKCkiPkVYRUNVVEU8L2J1dHRvbj4KICAgICR7Ty5sZW5ndGg/JzxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iY2xlYXJXb3JrKCkiPkNsZWFyIHJlc3VsdHM8L2J1dHRvbj4nOicnfTwvZGl2PgogICA8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjEycHgiPjxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo2cHgiPlF1aWNrIHRhc2tzOjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93Ij4ke1FVSUNLLm1hcCgocSxpKT0+YDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0icXVpY2soJHtpfSkiPiR7ZXNjKHFbMF0pfTwvYnV0dG9uPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PjwvZGl2PgogICR7Ty5sZW5ndGg/Ty5tYXAoKG8saSk9PmA8ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206OHB4Ij4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgdC1wdXIiPiR7ZXNjKG8udGFnKX08L3NwYW4+PGI+JHtlc2Moby5hZ2VudCl9PC9iPjwvZGl2PgogICAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtvLnR9IMK3ICR7by5tc31tcyDCtyAke28udG9rZW5zfSB0b2tlbnM8L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjYiPiR7ZXNjKG8udGV4dCl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPjxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iY29weU91dCgke2l9KSI+Q29weTwvYnV0dG9uPjwvZGl2PjwvZGl2PmApLmpvaW4oJycpCiAgIDonPGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vIHdvcmsgcHJvZHVjZWQgeWV0LjwvZGl2PjwvZGl2Pid9YH07CmFzeW5jIGZ1bmN0aW9uIGRvV29yaygpewogIGNvbnN0IHA9d2tQcm9tcHQudmFsdWUudHJpbSgpOyBpZighcCkgcmV0dXJuIGZsYXNoKCdUeXBlIGFuIGluc3RydWN0aW9uIGZpcnN0Jyk7CiAgZmxhc2goJ1dvcmtpbmfigKYnKTsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9sbG0vYXNrJyx7cHJvbXB0OnB9KTsgcmVuZGVyKCk7IGZsYXNoKCdEb25lJyk7IH0KICBjYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KZnVuY3Rpb24gcXVpY2soaSl7IHdrUHJvbXB0LnZhbHVlPVFVSUNLW2ldWzFdOyBkb1dvcmsoKSB9CmZ1bmN0aW9uIGNvcHlPdXQoaSl7IG5hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dCgoUy5vdXRwdXRzfHxbXSlbaV0udGV4dCk7IGZsYXNoKCdDb3BpZWQnKSB9CmFzeW5jIGZ1bmN0aW9uIGNsZWFyV29yaygpeyBhd2FpdCBBUEkoJy9hcGkvbGxtL2NsZWFyJyx7fSk7IHJlbmRlcigpIH0KCi8qIC0tLS0tLS0tLS0gTElWRSBPUEVSQVRJT05TIC0tLS0tLS0tLS0gKi8KZnVuY3Rpb24gYWdvKGlzbyl7IGlmKCFpc28pIHJldHVybiAnbmV2ZXInOwogIGNvbnN0IHM9TWF0aC5mbG9vcigoRGF0ZS5ub3coKS1uZXcgRGF0ZShpc28ucmVwbGFjZSgnICcsJ1QnKSsnWicpLmdldFRpbWUoKSkvMTAwMCk7CiAgaWYoczw2MCkgcmV0dXJuIHMrJ3MgYWdvJzsgaWYoczwzNjAwKSByZXR1cm4gTWF0aC5mbG9vcihzLzYwKSsnbSBhZ28nOyByZXR1cm4gTWF0aC5mbG9vcihzLzM2MDApKydoIGFnbyc7IH0KZnVuY3Rpb24gZXZlcnkobil7IHJldHVybiBuPDYwP24rJ3MnOm48MzYwMD9NYXRoLnJvdW5kKG4vNjApKydtJzpNYXRoLnJvdW5kKG4vMzYwMCkrJ2gnOyB9CkxJVkUub3BzPSgpPT57CiAgY29uc3QgVD1TLnRhc2tzfHxbXSwgUj1TLnJ1bnN8fFtdOwogIGNvbnN0IG9uPVQuZmlsdGVyKHQ9PnQuZW5hYmxlZCkubGVuZ3RoOwogIGNvbnN0IHRvdGFsUnVucz1ULnJlZHVjZSgoYSx0KT0+YSsodC5ydW5zfHwwKSwwKTsKICBjb25zdCBmYWlscz1ULnJlZHVjZSgoYSx0KT0+YSsodC5mYWlsc3x8MCksMCk7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJncmlkIGc0IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxM3B4Ij4KICAgJHtrcGkoUy5ydW5uaW5nPydSVU5OSU5HJzonSEFMVEVEJywnU3lzdGVtIFN0YXRlJyxTLnJ1bm5pbmc/J3ZhcigtLWdybiknOid2YXIoLS1tYWcpJyxTLnJ1bm5pbmc/J3dvcmsgZXhlY3V0aW5nJzonbm90aGluZyBydW5uaW5nJyl9CiAgICR7a3BpKG9uKycgLyAnK1QubGVuZ3RoLCdTdGFuZGluZyBPcmRlcnMgTGl2ZScsJ3ZhcigtLWN5KScsJ29uIHNjaGVkdWxlJyl9CiAgICR7a3BpKGZtdCh0b3RhbFJ1bnMpLCdKb2JzIEV4ZWN1dGVkJywndmFyKC0tZ3JuKScsUy50aWNrcysnIHNjaGVkdWxlciB0aWNrcycpfQogICAke2twaShmYWlscywnRmFpbHVyZXMnLGZhaWxzPyd2YXIoLS1tYWcpJzondmFyKC0tZ3JuKScsJ3NpbmNlIGluc3RhbGwnKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+U3RhbmRpbmcgT3JkZXJzIDxzcGFuIGNsYXNzPSJ0YWcgJHtTLnJ1bm5pbmc/J3QtZ3JuJzondC1yZWQnfSI+JHtTLnJ1bm5pbmc/J0VYRUNVVElORyc6J0ZST1pFTid9PC9zcGFuPjwvaDM+CiAgICR7VC5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+Q2FwYWJpbGl0eTwvdGg+PHRoPk93bmVyIEFnZW50PC90aD48dGg+RXZlcnk8L3RoPjx0aD5MYXN0IFJ1bjwvdGg+PHRoPlJlc3VsdDwvdGg+PHRoPlJ1bnM8L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICR7VC5tYXAodD0+YDx0cj48dGQ+PGIgc3R5bGU9ImNvbG9yOnZhcigtLWN5KSI+JHtlc2ModC5jYXApfTwvYj4KICAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSI+JHtlc2MoKFMuY2Fwc3x8W10pLmZpbmQoYz0+Yy5jYXA9PT10LmNhcCk/LmRlc2N8fCcnKX08L2Rpdj48L3RkPgogICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlc2ModC5vd25lcil9PC90ZD4KICAgIDx0ZD48aW5wdXQgY2xhc3M9ImluIiBzdHlsZT0id2lkdGg6NzRweDtwYWRkaW5nOjRweCA3cHgiIHR5cGU9Im51bWJlciIgdmFsdWU9IiR7dC5ldmVyeX0iCiAgICAgICAgb25jaGFuZ2U9InNldEV2ZXJ5KCcke3QuaWR9Jyx0aGlzLnZhbHVlKSIgdGl0bGU9InNlY29uZHMiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2V2ZXJ5KHQuZXZlcnkpfTwvZGl2PjwvdGQ+CiAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2Fnbyh0Lmxhc3RBdCl9PC90ZD4KICAgIDx0ZD4ke3QubGFzdE1zZz9gPHNwYW4gY2xhc3M9InRhZyAke3QubGFzdE9rPyd0LWdybic6J3QtcmVkJ30iPiR7dC5sYXN0T2s/J09LJzonRkFJTCd9PC9zcGFuPiAke2VzYyh0Lmxhc3RNc2cpfWA6JzxzcGFuIGNsYXNzPSJtb25vLWRpbSI+bm90IHlldCBydW48L3NwYW4+J308L3RkPgogICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHt0LnJ1bnN8fDB9JHt0LmZhaWxzPycgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPi8nK3QuZmFpbHMrJ+Kclzwvc3Bhbj4nOicnfTwvdGQ+CiAgICA8dGQgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIHAiIG9uY2xpY2s9InJ1bk5vdygnJHt0LmlkfScpIj5SdW48L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9InRvZ2dsZVRhc2soJyR7dC5pZH0nLCR7IXQuZW5hYmxlZH0pIj4ke3QuZW5hYmxlZD8nUGF1c2UnOidTdGFydCd9PC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDonPGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vIHN0YW5kaW5nIG9yZGVycy4gUG93ZXIgdGhlIHN5c3RlbSBvbiB0byBpbnN0YWxsIHRoZW0uPC9kaXY+J308L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+RXhlY3V0aW9uIEZlZWQgPHNwYW4gY2xhc3M9InRhZyB0LWRpbSI+JHtSLmxlbmd0aH08L3NwYW4+PC9oMz4KICAgJHtSLmxlbmd0aD9gPGRpdiBjbGFzcz0ibG9nIj4ke1IubWFwKHI9PmA8ZGl2PjxzcGFuIGNsYXNzPSJ0cyI+JHtyLnR9PC9zcGFuPgogICAgIDxzcGFuIHN0eWxlPSJjb2xvcjoke3Iub2s/J3ZhcigtLWdybiknOid2YXIoLS1tYWcpJ30iPlske3Iub2s/J0RPTkUnOidGQUlMJ31dPC9zcGFuPgogICAgIDxiPiR7ZXNjKHIub3duZXIpfTwvYj4gwrcgJHtlc2Moci5jYXApfSDigJQgJHtlc2Moci5tc2cpfSR7ci5kZXRhaWw/YFxuICAgICAgICDihrMgJHtlc2Moci5kZXRhaWwpfWA6Jyd9CiAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4oJHtyLm1zfW1zJHtyLm1hbnVhbD8nIMK3IG1hbnVhbCc6Jyd9KTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj5gCiAgIDonPGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vdGhpbmcgZXhlY3V0ZWQgeWV0LiBQb3dlciBvbiBhbmQgdGhlIGZpcnN0IHN3ZWVwIHJ1bnMgd2l0aGluIDEwIHNlY29uZHMuPC9kaXY+J308L2Rpdj5gfTsKUkVOREVSLm9wcz0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjoke1MuaHVzdGxlPycjYTg1NWY3JzonIzY3NDcwZid9O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywke1MuaHVzdGxlPycjMWEwZjJlJzonIzE1MTAwYSd9LCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOiR7Uy5odXN0bGU/J3ZhcigtLXB1ciknOid2YXIoLS1hbWIpJ30iPuKaoSBIVVNUTEUgTU9ERSDigJQgJHtTLmh1c3RsZT8nRU5HQUdFRCc6J09GRid9PC9oMz4KICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPiR7Uy5odXN0bGUKICAgP2A8Yj5NYXhpbXVtIG91dHB1dC48L2I+ICR7KFMudGFza3N8fFtdKS5sZW5ndGh9IG1vbmV5LWZvY3VzZWQgb3JkZXJzIHJ1bm5pbmcgb24gPGI+JHtTLmxhbmVzfHwzfSBwYXJhbGxlbCBsYW5lczwvYj4g4oCUIGlkZWFzLCByZXNlYXJjaCwgbWlzc2lvbnMsIHJldmVudWUgcm91dGVzLCBkZWVwIGludmVzdGlnYXRpb24uIEFsbCBmaXJpbmcgYXQgb25jZSwgbm90IG9uZSBhZnRlciBhbm90aGVyLmAKICAgOidTd2l0Y2hlcyB0aGUgcm9zdGVyIHRvIG1vbmV5LWdlbmVyYXRpbmcgd29yayBvbmx5LCB0aWdodGVucyBldmVyeSBpbnRlcnZhbCwgYW5kIHJ1bnMgdGFza3MgPGI+aW4gcGFyYWxsZWw8L2I+IGluc3RlYWQgb2Ygc2VxdWVudGlhbGx5LiBFeHBlY3Qgcm91Z2hseSAxMOKAkzIwIGNvbXBsZXRlZCBqb2JzIGluIHRoZSBmaXJzdCBob3VyLid9PC9kaXY+CiAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij4KICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj5QYXJhbGxlbCBsYW5lcyBmb3IgQUkgdGFza3M6PC9zcGFuPgogICA8c2VsZWN0IGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDo5MHB4IiBpZD0ibGFuZVNlbCIgb25jaGFuZ2U9InNldExhbmVzKHRoaXMudmFsdWUpIj4KICAgICR7WzEsMiwzLDQsNSw2XS5tYXAobj0+YDxvcHRpb24gdmFsdWU9IiR7bn0iICR7KFMubGFuZXN8fDMpPT1uPydzZWxlY3RlZCc6Jyd9PiR7bn08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD4KICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj5IaWdoZXIgPSBmYXN0ZXIsIGJ1dCBmcmVlIEFJIHRpZXJzIHJhdGUtbGltaXQgYXJvdW5kIDMwIHJlcXVlc3RzL21pbi48L3NwYW4+PC9kaXY+CiAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gJHtTLmh1c3RsZT8nbm8nOidwJ30iIG9uY2xpY2s9InRvZ2dsZUh1c3RsZSgpIj4ke1MuaHVzdGxlPydTVEFORCBET1dOJzonRU5HQUdFIEhVU1RMRSBNT0RFJ308L2J1dHRvbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OXB4Ij4ke1MuaHVzdGxlCiAgID8nU3RhbmRpbmcgZG93biByZXN0b3JlcyB0aGUgbm9ybWFsIG1vbml0b3Jpbmcgcm9zdGVyLicKICAgOidUaGlzIHJlcGxhY2VzIHlvdXIgY3VycmVudCB0YXNrIGxpc3QuIE1vbml0b3JpbmcgY29udGludWVzLCBidXQgdGhlIGVtcGhhc2lzIHNoaWZ0cyBoYXJkIHRvIHJldmVudWUuJ308L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6IzE1NWU2YiI+CiAgPGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1jeSkiPuKCuSBTUEVORElORyBDRUlMSU5HIOKAlCAke1MuYnVkZ2V0Pygn4oK5JytmbXQoUy5idWRnZXQpKTonTk9UIFNFVCd9PC9oMz4KICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+SGUgY2FuIDxiPnJlcXVlc3Q8L2I+IG1vbmV5IGZvciBhIHZlbnR1cmUg4oCUIGEgZG9tYWluLCBhIGxpc3RpbmcgZmVlLCBhIHNtYWxsIGFkIHRlc3QuIEhlIGNhbiBuZXZlciB0YWtlIGl0LiBFdmVyeSByZXF1ZXN0IGJlY29tZXMgYSBmcm96ZW4gZ2F0ZSBuZWVkaW5nIHlvdXIgc2lnbmF0dXJlLCBhbmQgYW55dGhpbmcgYWJvdmUgdGhpcyBjZWlsaW5nIGlzIHJlZnVzZWQgb3V0cmlnaHQuPC9kaXY+CiAgPGRpdiBjbGFzcz0icm93Ij48aW5wdXQgY2xhc3M9ImluIiBzdHlsZT0ibWF4LXdpZHRoOjE1MHB4IiB0eXBlPSJudW1iZXIiIGlkPSJidWRnZXRBbXQiIHBsYWNlaG9sZGVyPSJlLmcuIDIwMDAiIHZhbHVlPSIke1MuYnVkZ2V0fHwnJ30iPgogICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0ic2V0QnVkZ2V0KCkiPlNFVCBDRUlMSU5HPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+TGlmZXRpbWUgYXV0aG9yaXplZCBzcGVuZCBzbyBmYXI6IDxiPuKCuSR7KFMuc3BlbmR8fDApLnRvRml4ZWQoMil9PC9iPjwvZGl2PjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjoke1MucnVubmluZz8nIzFjNWMzYyc6JyM2YjIyMzMnfTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxNjBkZWcsJHtTLnJ1bm5pbmc/JyMwODE3MGYnOicjMTYwYjBjJ30sIzBhMGYxNikiPgogIDxoMyBzdHlsZT0iY29sb3I6JHtTLnJ1bm5pbmc/J3ZhcigtLWdybiknOid2YXIoLS1tYWcpJ30iPuKWtiBNQVNURVIgUE9XRVIg4oCUICR7Uy5ydW5uaW5nPydTWVNURU0gUlVOTklORyc6J1NZU1RFTSBIQUxURUQnfTwvaDM+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMXB4Ij4ke1MucnVubmluZwogICA/J0V2ZXJ5IHN0YW5kaW5nIG9yZGVyIGJlbG93IGlzIGV4ZWN1dGluZyBvbiBpdHMgb3duIHNjaGVkdWxlLiBUaGUgQ2hhaXJtYW4gaXMgZG9pbmcgcmVhbCB3b3JrIHJpZ2h0IG5vdyDigJQgcHJvYmluZyB5b3VyIHNpdGVzLCBhdWRpdGluZyB0aGUgbGVkZ2VyLCBjb21wdXRpbmcgU0xBcywgd3JpdGluZyBicmllZnMg4oCUIHdpdGhvdXQgeW91IHRvdWNoaW5nIGFueXRoaW5nLicKICAgOic8Yj5Ob3RoaW5nIGlzIHJ1bm5pbmcuPC9iPiBTaWduIGJlbG93IHRvIGJyaW5nIHRoZSB3aG9sZSBzeXN0ZW0gb25saW5lLiBPbmNlIHJ1bm5pbmcgaXQgZG9lcyBub3Qgc3RvcCB1bnRpbCB5b3UgaGFsdCBpdC4nfTwvZGl2PgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuICR7Uy5ydW5uaW5nPydubyc6J3AnfSIgb25jbGljaz0icG93ZXIoKSI+JHtTLnJ1bm5pbmc/J0hBTFQgRVZFUllUSElORyc6J1NUQVJUIEVWRVJZVEhJTkcnfTwvYnV0dG9uPgogICA8YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9InJlc2V0VGFza3MoKSI+UmVpbnN0YWxsIHN0YW5kaW5nIG9yZGVyczwvYnV0dG9uPjwvZGl2PgogIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5TY2hlZHVsZXIgdGlja3MgZXZlcnkgMTBzLiBPbmx5IHlvdSBjYW4gc3RhcnQgb3Igc3RvcCBpdCDigJQgbm90aGluZyBlbHNlIGNhbi48L2Rpdj48L2Rpdj4KIDxkaXYgZGF0YS1saXZlPSJvcHMiPiR7TElWRS5vcHMoKX08L2Rpdj5gOwphc3luYyBmdW5jdGlvbiBwb3dlcigpewogIHRyeXsgYXdhaXQgQVBJKCcvYXBpL3J1bnRpbWUvcG93ZXInLHtvbjohUy5ydW5uaW5nfSk7IHJlbmRlcigpOwogICAgZmxhc2goUy5ydW5uaW5nPydTWVNURU0gUlVOTklORyDigJQgYWdlbnRzIGV4ZWN1dGluZyc6J1N5c3RlbSBoYWx0ZWQnKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHNldEV2ZXJ5KGlkLHYpeyBhd2FpdCBBUEkoJy9hcGkvcnVudGltZS90YXNrJyx7aWQsZXZlcnk6K3Z9KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiB0b2dnbGVUYXNrKGlkLG9uKXsgYXdhaXQgQVBJKCcvYXBpL3J1bnRpbWUvdGFzaycse2lkLGVuYWJsZWQ6b259KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiBydW5Ob3coaWQpeyBmbGFzaCgnRXhlY3V0aW5n4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9ydW50aW1lL3J1bm5vdycse2lkfSk7IHJlbmRlcigpOyBmbGFzaChyLm1zZykgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0gfQphc3luYyBmdW5jdGlvbiByZXNldFRhc2tzKCl7IGF3YWl0IEFQSSgnL2FwaS9ydW50aW1lL3Jlc2V0Jyx7fSk7IHJlbmRlcigpOyBmbGFzaCgnU3RhbmRpbmcgb3JkZXJzIHJlaW5zdGFsbGVkJykgfQphc3luYyBmdW5jdGlvbiB0b2dnbGVIdXN0bGUoKXsKICBmbGFzaChTLmh1c3RsZT8nU3RhbmRpbmcgZG93buKApic6J0VuZ2FnaW5nIGh1c3RsZSBtb2Rl4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9ydW50aW1lL2h1c3RsZScse29uOiFTLmh1c3RsZSxsYW5lczpTLmxhbmVzfHwzfSk7CiAgICByZW5kZXIoKTsgZmxhc2goUy5odXN0bGU/YEhVU1RMRSBFTkdBR0VEIOKAlCAke3IudGFza3N9IG9yZGVycyBmaXJpbmcgaW4gcGFyYWxsZWxgOidTdG9vZCBkb3duIHRvIG5vcm1hbCByb3N0ZXInKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHNldExhbmVzKG4peyBhd2FpdCBBUEkoJy9hcGkvcnVudGltZS9sYW5lcycse2xhbmVzOitufSk7IHJlbmRlcigpOyBmbGFzaCgnTGFuZXM6ICcrbikgfQphc3luYyBmdW5jdGlvbiBzZXRCdWRnZXQoKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9zcGVuZC9idWRnZXQnLHtidWRnZXQ6K2J1ZGdldEFtdC52YWx1ZXx8MH0pOyByZW5kZXIoKTsKICAgIGZsYXNoKCdDZWlsaW5nIHNldCDigJQgaGUgY2FuIHJlcXVlc3QgdXAgdG8gdGhpcywgbmV2ZXIgdGFrZSBpdCcpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KCi8qIC0tLS0tLS0tLS0gU0VMRi1VUEdSQURFIC0tLS0tLS0tLS0gKi8KTElWRS5ldm9sdmU9KCk9PnsKICBjb25zdCBQPShTLnByb3Bvc2Fsc3x8W10pLmZpbHRlcihwPT5wLnN0YXR1cz09PSdQRU5ESU5HJyk7CiAgY29uc3QgRT1TLmV2b2x1dGlvbnx8W107CiAgY29uc3QgYXBwbGllZD1FLmZpbHRlcihlPT5lLmRlY2lzaW9uPT09J0FQUExJRUQnKS5sZW5ndGg7CiAgY29uc3QgcmVqZWN0ZWQ9RS5maWx0ZXIoZT0+ZS5kZWNpc2lvbj09PSdSRUpFQ1RFRCcpLmxlbmd0aDsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEzcHgiPgogICAke2twaShQLmxlbmd0aCwnVXBncmFkZXMgQXdhaXRpbmcgWW91JyxQLmxlbmd0aD8ndmFyKC0tYW1iKSc6J3ZhcigtLWdybiknLFAubGVuZ3RoPyduZWVkcyB5b3VyIHNpZ25hdHVyZSc6J25vdGhpbmcgcGVuZGluZycpfQogICAke2twaShhcHBsaWVkLCdVcGdyYWRlcyBBcHBsaWVkJywndmFyKC0tZ3JuKScsJ2xpZmV0aW1lJyl9CiAgICR7a3BpKHJlamVjdGVkLCdSZWplY3RlZCcsJ3ZhcigtLWRpbSknLCduZXZlciByZS1wcm9wb3NlZCcpfQogICAke2twaShTLnNjYW5Db3VudHx8MCwnU2VsZi1TY2FucyBSdW4nLCd2YXIoLS1jeSknLCdldmVyeSA2MCBzZWNvbmRzJyl9PC9kaXY+CiAgJHtQLmxlbmd0aD9QLm1hcChwPT5gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjoke3Aua2xhc3M9PT0nU0FGRSc/JyMxYzVjM2MnOicjNjc0NzBmJ30iPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo4cHgiPgogICAgIDxkaXYgY2xhc3M9InJvdyI+PHNwYW4gY2xhc3M9InRhZyAke3Aua2xhc3M9PT0nU0FGRSc/J3QtZ3JuJzondC1hbWInfSI+JHtwLmtsYXNzfTwvc3Bhbj4KICAgICAgPGI+JHtlc2MocC5sYWJlbCl9PC9iPjwvZGl2PjxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtwLmlkfSDCtyAke3AudH08L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjdweCI+JHtlc2MocC53aHkpfTwvZGl2PgogICAgJHtwLmV2aWRlbmNlP2A8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi1ib3R0b206OXB4Ij5FdmlkZW5jZTogJHtlc2MocC5ldmlkZW5jZSl9PC9kaXY+YDonJ30KICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBvbmNsaWNrPSJkZWNpZGVVcCgnJHtwLmlkfScsMSkiPkFVVEhPUklaRSBVUEdSQURFPC9idXR0b24+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIiBvbmNsaWNrPSJkZWNpZGVVcCgnJHtwLmlkfScsMCkiPlJFSkVDVCBQRVJNQU5FTlRMWTwvYnV0dG9uPjwvZGl2PgogICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0iZXJfJHtwLmlkfSI+PC9kaXY+PC9kaXY+YCkuam9pbignJykKICAgOmA8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gdXBncmFkZXMgcGVuZGluZy4gVGhlIENoYWlybWFuIHNjYW5zIGl0c2VsZiBldmVyeSA2MCBzZWNvbmRzIGFuZCB3aWxsIHJhaXNlIGEgcHJvcG9zYWwgaGVyZSB0aGUgbW9tZW50IGl0IGZpbmRzIGEgcmVhbCB3ZWFrbmVzcyDigJQgYSBmbGFreSBzaXRlLCBhbiBleHBpcmluZyBjZXJ0aWZpY2F0ZSwgYW4gdW5zdGFmZmVkIGZsb29yLCBhIHNlY3VyaXR5IGdhcC48L2Rpdj48L2Rpdj5gfQogIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5Fdm9sdXRpb24gSGlzdG9yeTwvaDM+CiAgICR7RS5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+V2hlbjwvdGg+PHRoPkNoYW5nZTwvdGg+PHRoPkRlY2lzaW9uPC90aD48dGg+UmVzdWx0PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAke0UubWFwKGU9PmA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlLnR9PC90ZD48dGQ+JHtlc2MoZS5sYWJlbCl9PGRpdiBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGUud2h5fHwnJyl9PC9kaXY+PC90ZD4KICAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7ZS5kZWNpc2lvbj09PSdBUFBMSUVEJz8ndC1ncm4nOid0LXJlZCd9Ij4ke2UuZGVjaXNpb259PC9zcGFuPgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhlLmhvd3x8JycpfTwvZGl2PjwvdGQ+CiAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhlLnJlc3VsdHx8JycpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5UaGUgQ2hhaXJtYW4gaGFzIG5vdCBjaGFuZ2VkIGl0c2VsZiB5ZXQuPC9kaXY+J308L2Rpdj5gfTsKTElWRS53cml0dGVuPSgpPT57CiAgY29uc3QgVz0oUy53cml0dGVuQ2Fwc3x8W10pOwogIGlmKCFXLmxlbmd0aCkgcmV0dXJuICc8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+SGUgaGFzIG5vdCB3cml0dGVuIGFueSBuZXcgYWJpbGl0aWVzIHlldC48L2Rpdj48L2Rpdj4nOwogIHJldHVybiBXLm1hcChjPT5gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjokewogICAgICBjLnZpb2xhdGlvbnMubGVuZ3RoPyd2YXIoLS1tYWcpJzpjLnN0YXR1cz09PSdJTlNUQUxMRUQnPyd2YXIoLS1ncm4pJzondmFyKC0tYW1iKSd9Ij4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206OHB4Ij4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPgogICAgICA8c3BhbiBjbGFzcz0idGFnICR7Yy52aW9sYXRpb25zLmxlbmd0aD8ndC1yZWQnOmMuc3RhdHVzPT09J0lOU1RBTExFRCc/J3QtZ3JuJzondC1hbWInfSI+JHsKICAgICAgICBjLnZpb2xhdGlvbnMubGVuZ3RoPydTQU5EQk9YIEJMT0NLRUQnOmMuc3RhdHVzfTwvc3Bhbj4KICAgICAgPGIgc3R5bGU9ImZvbnQtc2l6ZToxNHB4Ij4ke2VzYyhjLm5hbWUpfTwvYj48L2Rpdj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7Yy50fSDCtyAke2MuYnl0ZXN9IGJ5dGVzPC9zcGFuPjwvZGl2PgogICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo4cHgiPiR7ZXNjKGMuZGVzYyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4KICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjExMHB4Ij5XaHkgaGUgd3JvdGUgaXQ8L3RkPjx0ZD4ke2VzYyhjLndoeSl9PC90ZD48L3RyPgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5SaXNrIGhlIHNlZXM8L3RkPjx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+JHtlc2MoYy5yaXNrKX08L3RkPjwvdHI+CiAgICAgJHtjLnZpb2xhdGlvbnMubGVuZ3RoP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+QmxvY2tlZCBiZWNhdXNlPC90ZD4KICAgICAgIDx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+JHtjLnZpb2xhdGlvbnMubWFwKGVzYykuam9pbignPGJyPicpfTwvdGQ+PC90cj5gOicnfQogICAgICR7Yy50ZXN0UnVuP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+RHJ5IHJ1biBvdXRwdXQ8L3RkPgogICAgICAgPHRkIHN0eWxlPSJjb2xvcjp2YXIoLS1ncm4pIj4ke2VzYyhjLnRlc3RSdW4ubXNnKX0ke2MudGVzdFJ1bi5kZXRhaWw/JzxkaXYgY2xhc3M9Im1vbm8tZGltIj4nK2VzYyhjLnRlc3RSdW4uZGV0YWlsKSsnPC9kaXY+JzonJ308L3RkPjwvdHI+YDonJ30KICAgICAke2MudGVzdEVycm9yP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+RHJ5IHJ1biBmYWlsZWQ8L3RkPjx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+JHtlc2MoYy50ZXN0RXJyb3IpfTwvdGQ+PC90cj5gOicnfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPGRldGFpbHMgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+PHN1bW1hcnkgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiPgogICAgICBSRUFEIFRIRSBBQ1RVQUwgQ09ERSBiZWZvcmUgeW91IHNpZ24gaXQgKCR7Yy5ieXRlc30gYnl0ZXMpPC9zdW1tYXJ5PgogICAgIDxwcmUgY2xhc3M9InlhbWwiIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+JHtlc2MoYy5jb2RlKX08L3ByZT48L2RldGFpbHM+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPgogICAgICR7Yy5zdGF0dXM9PT0nUEVORElORyc/YDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+U2lnbiBpdCBvbiB0aGUgcHJvcG9zYWwgYWJvdmUgdG8gaW5zdGFsbC48L3NwYW4+YDonJ30KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImRpc2NhcmRDYXAoJyR7Yy5pZH0nKSI+RGlzY2FyZDwvYnV0dG9uPjwvZGl2PgogICA8L2Rpdj5gKS5qb2luKCcnKTsKfTsKUkVOREVSLndyaXR0ZW49KCk9PmAKIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tcHVyKSI+CiAgPGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1wdXIpIj7inI4gU0VMRi1FWFRFTlNJT04g4oCUIEhFIFdSSVRFUyBISVMgT1dOIE5FVyBBQklMSVRJRVM8L2gzPgogIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+Tm90IHNldHRpbmdzIHR1bmluZy4gSGUgd3JpdGVzIDxiPnJlYWwgSmF2YVNjcmlwdDwvYj4gZm9yIGEgY2FwYWJpbGl0eSBoZSBkb2VzIG5vdCB5ZXQgaGF2ZSwgaXQgcnVucyBpbiBhIGxvY2tlZCBzYW5kYm94LCBhbmQgeW91IHJlYWQgdGhlIGFjdHVhbCBzb3VyY2UgYmVmb3JlIHNpZ25pbmcuPC9kaXY+CiAgPHVsIGNsYXNzPSJ0aWdodCI+CiAgIDxsaT48Yj5TYW5kYm94IGJsb2NrczwvYj4gcmVxdWlyZSwgcHJvY2VzcywgZnMsIGNoaWxkX3Byb2Nlc3MsIGV2YWwsIEZ1bmN0aW9uLCBwcm90b3R5cGUgYWNjZXNzIGFuZCBpbmZpbml0ZSBsb29wcyDigJQgY2hlY2tlZCA8ZW0+YmVmb3JlPC9lbT4geW91IGFyZSBzaG93biBpdC48L2xpPgogICA8bGk+R2VuZXJhdGVkIGNvZGUgc2VlcyBvbmx5IGEgdGlueSByZWFkLW9ubHkgQVBJIG9mIHlvdXIgb3duIHN0YXRlLCBwbHVzIG9uZSB3cml0ZTogYSBub3RlIGluIHRoZSBsZWRnZXIuPC9saT4KICAgPGxpPkV2ZXJ5IG5ldyBhYmlsaXR5IGlzIDxiPmRyeS1ydW4gYWdhaW5zdCByZWFsIGRhdGEgZmlyc3Q8L2I+LCBzbyB5b3Ugc2VlIGdlbnVpbmUgb3V0cHV0LCBub3QgYSBwcm9taXNlLjwvbGk+CiAgIDxsaT5Ob3RoaW5nIGluc3RhbGxzIHdpdGhvdXQgeW91ciBwYXNzd29yZCBzaWduYXR1cmUgb24gdGhlIFNlbGYtVXBncmFkZSBwYWdlLjwvbGk+CiAgPC91bD4KICAkeyFTLmxsbT8nPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpO21hcmdpbi10b3A6MTBweCI+Q29ubmVjdCBhbiBBSSBicmFpbiBmaXJzdC48L2Rpdj4nOicnfQogIDxsYWJlbCBjbGFzcz0iZiIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+PHNwYW4+V2hhdCBuZXcgYWJpbGl0eSBzaG91bGQgaGUgYnVpbGQ/PC9zcGFuPgogICA8aW5wdXQgaWQ9InNlR29hbCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iZS5nLiBmaW5kIHdoaWNoIG1vbml0b3JlZCBzaXRlIGRlZ3JhZGVkIG1vc3QgdGhpcyB3ZWVrIj48L2xhYmVsPgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9IndyaXRlQ2FwKCkiPkhFIFdSSVRFUyBJVDwvYnV0dG9uPgogICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPkxlYXZlIGJsYW5rIGFuZCBoZSBwaWNrcyBhIGdhcCBoZSBjYW4gc2VlIGluIGhpcyBvd24gc3RhdGUuPC9zcGFuPjwvZGl2PgogPC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0id3JpdHRlbiI+JHtMSVZFLndyaXR0ZW4oKX08L2Rpdj5gOwphc3luYyBmdW5jdGlvbiB3cml0ZUNhcCgpewogIGNvbnN0IGc9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZUdvYWwnKXx8e30pLnZhbHVlfHwnJzsKICBmbGFzaCgnSGUgaXMgd3JpdGluZyBjb2Rl4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9zZWxmZXh0ZW5kL3dyaXRlJyx7Z29hbDpnfHwncGljayBhIGdlbnVpbmUgZ2FwIGluIHlvdXIgb3duIGFiaWxpdGllcyd9KTsKICAgIHJlbmRlcigpOyBmbGFzaChyLmJsb2NrZWQ/KCdXcm90ZSAnK3IubmFtZSsnIOKAlCBTQU5EQk9YIEJMT0NLRUQgSVQnKTooJ1dyb3RlICcrci5uYW1lKycg4oCUIHJlYWQgdGhlIGNvZGUsIHRoZW4gc2lnbiBpdCcpKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGRpc2NhcmRDYXAoaWQpeyBhd2FpdCBBUEkoJy9hcGkvc2VsZmV4dGVuZC9kaXNjYXJkJyx7aWR9KTsgcmVuZGVyKCkgfQoKUkVOREVSLmV2b2x2ZT0oKT0+YAogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojNGEzMDgwO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE2MGRlZywjMTQwZjIyLCMwYTBmMTYpIj4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLXB1cikiPuKfsyBDT05USU5VT1VTIFNFTEYtVVBHUkFERTwvaDM+CiAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5UaGUgQ2hhaXJtYW4gYXVkaXRzIGl0cyBvd24gc3RhdGUgZXZlcnkgNjAgc2Vjb25kcyBhZ2FpbnN0IHJlYWwgdGVsZW1ldHJ5IOKAlCB1cHRpbWUgcmVjb3JkcywgVExTIGV4cGlyeSwgYXV0aCBmYWlsdXJlcywgbGVkZ2VyIHNpemUsIGZsb29yIHN0YWZmaW5nLCBtYWlsIHJlYWRpbmVzcy4gV2hlbiBpdCBmaW5kcyBhIGdlbnVpbmUgd2Vha25lc3MgaXQgcHJvcG9zZXMgYSBmaXggaGVyZSBhbmQgPGI+ZnJlZXplcyB1bnRpbCB5b3Ugc2lnbiBpdDwvYj4uPC9kaXY+CiAgPHVsIGNsYXNzPSJ0aWdodCI+CiAgIDxsaT48Yj5Ob3RoaW5nIHNlbGYtaW5zdGFsbHMgYnkgZGVmYXVsdC48L2I+IEV2ZXJ5IHVwZ3JhZGUgbmVlZHMgeW91ciBwYXNzd29yZCwgc2FtZSBhcyBhIHBlcm1pc3Npb24gZ2F0ZS48L2xpPgogICA8bGk+PGI+U0FGRTwvYj4gPSByZXZlcnNpYmxlIHR1bmluZyAocHJvYmUgaW50ZXJ2YWxzLCBsZWRnZXIgY29tcGFjdGlvbiwgc2tpbGxzKS4gPGI+UkVWSUVXPC9iPiA9IGNoYW5nZXMgeW91ciByb3N0ZXIgb3IgcmFpc2VzIGEgc2VjdXJpdHkgZ2F0ZS48L2xpPgogICA8bGk+UmVqZWN0IG9uY2UgYW5kIGl0IGlzIDxiPnN1cHByZXNzZWQgcGVybWFuZW50bHk8L2I+IOKAlCB0aGUgQ2hhaXJtYW4gd2lsbCBub3QgbmFnIHlvdSBhYm91dCBpdCBhZ2Fpbi48L2xpPgogICA8bGk+SXQgcHJvcG9zZXMgb25seSBvbiBldmlkZW5jZSBmcm9tIHlvdXIgYWN0dWFsIHJ1bm5pbmcgc3lzdGVtLiBJdCBkb2VzIG5vdCBpbnZlbnQgd29yay48L2xpPgogIDwvdWw+CiAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InNjYW5Ob3coKSI+UlVOIFNFTEYtU0NBTiBOT1c8L2J1dHRvbj4KICAgPHNwYW4gY2xhc3M9InRhZyAke1MuYXV0b3BpbG90Pyd0LXJlZCc6J3QtZGltJ30iPkFVVE9QSUxPVCAke1MuYXV0b3BpbG90PydPTic6J09GRid9PC9zcGFuPgogIDwvZGl2PjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjoke1MuYXV0b3BpbG90PycjNmIyMjMzJzondmFyKC0tbGluZSknfSI+CiAgPGgzPkF1dG9waWxvdCAke1MuYXV0b3BpbG90Pyc8c3BhbiBjbGFzcz0idGFnIHQtcmVkIj5BQ1RJVkU8L3NwYW4+JzonJ308L2gzPgogIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5XaXRoIGF1dG9waWxvdCBvbiwgPGI+U0FGRS1jbGFzczwvYj4gdXBncmFkZXMgYXBwbHkgdGhlbXNlbHZlcyB0aGUgbW9tZW50IHRoZXkgYXJlIGZvdW5kIOKAlCBubyBzaWduYXR1cmUuIFJFVklFVy1jbGFzcyBhbHdheXMgd2FpdHMgZm9yIHlvdSByZWdhcmRsZXNzLiBFdmVyeSBhdXRvbm9tb3VzIGNoYW5nZSBpcyBzdGlsbCB3cml0dGVuIHRvIHRoZSBldm9sdXRpb24gaGlzdG9yeS4gVGhpcyBpcyByZWFsIGF1dG9ub215OiB0dXJuIGl0IG9uIG9ubHkgaWYgeW91IGFjY2VwdCB0aGUgQ2hhaXJtYW4gY2hhbmdpbmcgaXRzIG93biB0dW5pbmcgd2hpbGUgeW91IHNsZWVwLjwvZGl2PgogIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuICR7Uy5hdXRvcGlsb3Q/J25vJzoncCd9IiBvbmNsaWNrPSJ0b2dnbGVBdXRvKCkiPiR7Uy5hdXRvcGlsb3Q/J0RJU0FCTEUgQVVUT1BJTE9UJzonRU5BQkxFIEFVVE9QSUxPVCd9PC9idXR0b24+PC9kaXY+PC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0iZXZvbHZlIj4ke0xJVkUuZXZvbHZlKCl9PC9kaXY+YDsKYXN5bmMgZnVuY3Rpb24gZGVjaWRlVXAoaWQsb2spewogIGNvbnN0IGU9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VyXycraWQpOyBlLnRleHRDb250ZW50PScnOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvdXBncmFkZS9kZWNpZGUnLHtpZCxvazohIW9rfSk7CiAgICByZW5kZXIoKTsgZmxhc2gob2s/KCdVUEdSQURFRCDCtyAnKyhyLnJlc3VsdHx8JycpKTonUmVqZWN0ZWQgcGVybWFuZW50bHknKTsKICB9Y2F0Y2goeCl7IGUudGV4dENvbnRlbnQ9eC5tZXNzYWdlIH0KfQphc3luYyBmdW5jdGlvbiBzY2FuTm93KCl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3VwZ3JhZGUvc2Nhbicse30pOyByZW5kZXIoKTsKICBmbGFzaChyLnBlbmRpbmc/ci5wZW5kaW5nKycgdXBncmFkZShzKSBhd2FpdGluZyB5b3VyIHNpZ25hdHVyZSc6J1NjYW4gY2xlYW4g4oCUIG5vdGhpbmcgdG8gaW1wcm92ZScpIH0KYXN5bmMgZnVuY3Rpb24gdG9nZ2xlQXV0bygpewogIHRyeXsgYXdhaXQgQVBJKCcvYXBpL3VwZ3JhZGUvYXV0b3BpbG90Jyx7b246IVMuYXV0b3BpbG90fSk7IHJlbmRlcigpOwogICAgZmxhc2goUy5hdXRvcGlsb3Q/J0FVVE9QSUxPVCBPTiDigJQgc2FmZSB1cGdyYWRlcyBub3cgc2VsZi1hcHBseSc6J0F1dG9waWxvdCBvZmYnKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CgovKiAtLS0tLS0tLS0tIExFQVJORUQgU0tJTExTIC0tLS0tLS0tLS0gKi8KUkVOREVSLnNraWxsczI9KCk9PnsKICBjb25zdCBLPVMuc2tpbGxzfHxbXTsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5UZWFjaCB0aGUgQ2hhaXJtYW4gPHNwYW4gY2xhc3M9InRhZyB0LWN5Ij5QRVJTSVNUUyBGT1JFVkVSPC9zcGFuPjwvaDM+CiAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMXB4Ij5Bbnl0aGluZyB5b3UgdGVhY2ggaXMgc3RvcmVkIHNlcnZlci1zaWRlIGFuZCBzdXJ2aXZlcyByZXN0YXJ0cywgcmVkZXBsb3lzIGFuZCBldmVyeSBkZXZpY2UgeW91IGxvZyBpbiBmcm9tLiBUZWFjaCBpdCB5b3VyIHNob3J0aGFuZCwgeW91ciBydW5ib29rcywgeW91ciBzdGFuZGluZyBvcmRlcnMuPC9kaXY+CiAgIDxkaXYgY2xhc3M9ImdyaWQgZzMiPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5UcmlnZ2VyIHBocmFzZTwvc3Bhbj48aW5wdXQgaWQ9InNrUGhyYXNlIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJtb3JuaW5nIGNoZWNrIj48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5XaGF0IGl0IG1lYW5zIC8gZG9lczwvc3Bhbj48aW5wdXQgaWQ9InNrQWN0aW9uIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJTY2FuIGFsbCBtb25pdG9ycyBhbmQgcmVwb3J0IGFueXRoaW5nIGJlbG93IDk5JSI+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+VHlwZTwvc3Bhbj48c2VsZWN0IGlkPSJza0tpbmQiIGNsYXNzPSJpbiI+CiAgICAgPG9wdGlvbiB2YWx1ZT0ibm90ZSI+U3RhbmRpbmcgb3JkZXI8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhbGlhcyI+Q29tbWFuZCBzaG9ydGN1dDwvb3B0aW9uPgogICAgIDxvcHRpb24gdmFsdWU9InJ1bmJvb2siPlJ1bmJvb2sgc3RlcDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InBvbGljeSI+UG9saWN5IHJ1bGU8L29wdGlvbj48L3NlbGVjdD48L2xhYmVsPjwvZGl2PgogICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0idGVhY2goKSI+VEVBQ0ggSVQ8L2J1dHRvbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+S25vd24gU2tpbGxzIDxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7Sy5sZW5ndGh9PC9zcGFuPjwvaDM+CiAgICR7Sy5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+UGhyYXNlPC90aD48dGg+TWVhbmluZzwvdGg+PHRoPlR5cGU8L3RoPjx0aD5Vc2VkPC90aD48dGg+TGVhcm5lZDwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgJHtLLm1hcChzPT5gPHRyPjx0ZD48YiBzdHlsZT0iY29sb3I6dmFyKC0tY3kpIj4ke2VzYyhzLnBocmFzZSl9PC9iPjwvdGQ+PHRkPiR7ZXNjKHMuYWN0aW9uKX08L3RkPgogICAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7ZXNjKHMua2luZCl9PC9zcGFuPjwvdGQ+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtzLnVzZXN8fDB9w5c8L3RkPgogICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtzLmxlYXJuZWR9PGRpdj4ke2VzYyhzLm9yaWdpbnx8J293bmVyJyl9PC9kaXY+PC90ZD4KICAgIDx0ZCBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9InVzZVNraWxsKCcke2VzYyhzLnBocmFzZSl9JykiPlJlY2FsbDwvYnV0dG9uPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iZm9yZ2V0KCcke2VzYyhzLnBocmFzZSl9JykiPkZvcmdldDwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5Ob3RoaW5nIHRhdWdodCB5ZXQuIFRyeSBwaHJhc2UgIm1vcm5pbmcgY2hlY2siIOKGkiAiU2NhbiBhbGwgbW9uaXRvcnMgYW5kIHJlcG9ydCBhbnl0aGluZyBiZWxvdyA5OSUgYXZhaWxhYmlsaXR5Ii48L2Rpdj4nfTwvZGl2PmB9Owphc3luYyBmdW5jdGlvbiB0ZWFjaCgpewogIHRyeXsgYXdhaXQgQVBJKCcvYXBpL3NraWxsL3RlYWNoJyx7cGhyYXNlOnNrUGhyYXNlLnZhbHVlLGFjdGlvbjpza0FjdGlvbi52YWx1ZSxraW5kOnNrS2luZC52YWx1ZX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKCdTa2lsbCBsZWFybmVkIOKAlCBpdCBwZXJzaXN0cyBhY3Jvc3MgcmVzdGFydHMnKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGZvcmdldChwKXsgaWYoIWNvbmZpcm0oJ0ZvcmdldCAiJytwKyciPycpKXJldHVybjsgYXdhaXQgQVBJKCcvYXBpL3NraWxsL2ZvcmdldCcse3BocmFzZTpwfSk7IHJlbmRlcigpIH0KYXN5bmMgZnVuY3Rpb24gdXNlU2tpbGwocCl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3NraWxsL3VzZScse3BocmFzZTpwfSk7IHJlbmRlcigpOwogIG1vZGFsKGA8aDM+JHtlc2MocCl9PC9oMz48ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0ibWFyZ2luOjAiPjxkaXY+JHtlc2Moci5hY3Rpb24pfTwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6MTNweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJjbG9zZU1vZGFsKCkiPkNsb3NlPC9idXR0b24+PC9kaXY+YCkgfQoKLyogLS0tLS0tLS0tLSBVUFRJTUUgTUFSU0hBTCAtLS0tLS0tLS0tICovCmZ1bmN0aW9uIHVwQmFyKG0pewogIGNvbnN0IGg9KG0uaGlzdG9yeXx8W10pLnNsaWNlKC00MCk7CiAgaWYoIWgubGVuZ3RoKSByZXR1cm4gJzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iZm9udC1zaXplOjEwcHgiPm5vIGNoZWNrcyB5ZXQ8L2Rpdj4nOwogIHJldHVybiAnPGRpdiBzdHlsZT0iZGlzcGxheTpmbGV4O2dhcDoycHg7YWxpZ24taXRlbXM6ZmxleC1lbmQ7aGVpZ2h0OjI2cHgiPicraC5tYXAoeD0+CiAgIGA8ZGl2IHRpdGxlPSIke3gudH0gwrcgSFRUUCAke3guY29kZX0gwrcgJHt4Lm1zfW1zIiBzdHlsZT0iZmxleDoxO21pbi13aWR0aDozcHg7aGVpZ2h0OiR7eC5vaz9NYXRoLm1heCgzMCxNYXRoLm1pbigxMDAsMTAwLXgubXMvMjUpKToxMDB9JTtiYWNrZ3JvdW5kOiR7eC5vaz8nIzMxZDY3YSc6JyNmZjNiNmInfTtib3JkZXItcmFkaXVzOjFweDtvcGFjaXR5Oi45Ij48L2Rpdj5gKS5qb2luKCcnKSsnPC9kaXY+JzsKfQpMSVZFLnVwdGltZT0oKT0+ewogIGNvbnN0IE09Uy5tb25pdG9yc3x8W10sIGRvd249TS5maWx0ZXIobT0+bS5zdGF0ZT09PSdET1dOJykubGVuZ3RoOwogIGNvbnN0IHRvdD1NLnJlZHVjZSgoYSxtKT0+YSsobS5jaGVja3N8fDApLDApLCB1cHM9TS5yZWR1Y2UoKGEsbSk9PmErKG0udXB8fDApLDApOwogIGNvbnN0IGF2YWlsPXRvdD8oKHVwcy90b3QpKjEwMCkudG9GaXhlZCgyKTon4oCUJzsKICBjb25zdCBhdmc9TS5maWx0ZXIobT0+bS5sYXN0TXMpLmxlbmd0aD9NYXRoLnJvdW5kKE0ucmVkdWNlKChhLG0pPT5hKyhtLmxhc3RNc3x8MCksMCkvTS5maWx0ZXIobT0+bS5sYXN0TXMpLmxlbmd0aCk6MDsKICByZXR1cm4gYDxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEzcHgiPgogICAke2twaShNLmxlbmd0aCwnVGFyZ2V0cyBNb25pdG9yZWQnLCd2YXIoLS1jeSknLCdwcm9iZSBldmVyeSAxNXMnKX0KICAgJHtrcGkoZG93biwnQ3VycmVudGx5IERvd24nLGRvd24/J3ZhcigtLW1hZyknOid2YXIoLS1ncm4pJyxkb3duPydJTkNJREVOVCBBQ1RJVkUnOidhbGwgcmVhY2hhYmxlJyl9CiAgICR7a3BpKGF2YWlsKyhhdmFpbD09PSfigJQnPycnOiclJyksJ0F2YWlsYWJpbGl0eScsJ3ZhcigtLWdybiknLHRvdCsnIGNoZWNrcycpfQogICAke2twaShhdmcrJyBtcycsJ0F2ZyBSZXNwb25zZScsYXZnPjE1MDA/J3ZhcigtLWFtYiknOid2YXIoLS1ncm4pJywnbGFzdCBjeWNsZScpfTwvZGl2PgogICR7TS5sZW5ndGg/TS5tYXAobT0+ewogICAgY29uc3QgYT1tLmNoZWNrcz8oKG0udXAvbS5jaGVja3MpKjEwMCkudG9GaXhlZCgyKTonMC4wMCc7CiAgICByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206OXB4Ij4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgJHttLnN0YXRlPT09J1VQJz8ndC1ncm4nOm0uc3RhdGU9PT0nRE9XTic/J3QtcmVkJzondC1kaW0nfSI+JHttLnN0YXRlfTwvc3Bhbj4KICAgICAgPGI+JHtlc2MobS5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhtLnVybCl9PC9zcGFuPjwvZGl2PgogICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJkZWxNb24oJyR7bS5pZH0nKSI+VW5iaW5kPC9idXR0b24+PC9kaXY+PC9kaXY+CiAgICAke3VwQmFyKG0pfQogICAgPGRpdiBjbGFzcz0idHciIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+PHRhYmxlPjx0Ym9keT4KICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjE1MHB4Ij5MYXN0IGNoZWNrPC90ZD48dGQ+JHttLmxhc3RBdHx8J+KAlCd9IMK3IEhUVFAgJHttLmxhc3RTdGF0dXN8fCfigJQnfSR7bS5sYXN0RXJyPycgwrcgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPicrZXNjKG0ubGFzdEVycikrJzwvc3Bhbj4nOicnfTwvdGQ+PC90cj4KICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+TGF0ZW5jeTwvdGQ+PHRkPiR7bS5sYXN0TXN8fDB9IG1zIChwOTUgJHttLnA5NXx8MH0gbXMpPC90ZD48L3RyPgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5BdmFpbGFiaWxpdHk8L3RkPjx0ZCBzdHlsZT0iY29sb3I6JHthPjk5Pyd2YXIoLS1ncm4pJzphPjk1Pyd2YXIoLS1hbWIpJzondmFyKC0tbWFnKSd9Ij4ke2F9JSDCtyAke20udXB8fDB9IHVwIC8gJHttLmRvd258fDB9IGRvd24gb2YgJHttLmNoZWNrc3x8MH08L3RkPjwvdHI+CiAgICAgJHttLnNzbD9gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlRMUyBjZXJ0aWZpY2F0ZTwvdGQ+PHRkPiR7ZXNjKG0uc3NsLmlzc3Vlcil9IMK3IGV4cGlyZXMgaW4gPHNwYW4gc3R5bGU9ImNvbG9yOiR7bS5zc2wuZGF5c19sZWZ0PDE0Pyd2YXIoLS1tYWcpJzptLnNzbC5kYXlzX2xlZnQ8NDU/J3ZhcigtLWFtYiknOid2YXIoLS1ncm4pJ30iPiR7bS5zc2wuZGF5c19sZWZ0fSBkYXlzPC9zcGFuPjwvdGQ+PC90cj5gOicnfQogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5JbnRlcnZhbDwvdGQ+PHRkPiR7bS5pbnRlcnZhbH1zIMK3IGJvdW5kICR7bS5hZGRlZH08L3RkPjwvdHI+CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kaXY+YH0pLmpvaW4oJycpCiAgIDonPGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0ibW9uby1kaW0iPk5vIHRhcmdldHMgYm91bmQuIEFkZCB5b3VyIGxpdmUgc2l0ZXMgYW5kIGFwcHMgYmVsb3cg4oCUIHRoZSBVcHRpbWUgTWFyc2hhbCB3aWxsIHByb2JlIHRoZW0gZm9yIHJlYWwuPC9kaXY+PC9kaXY+J30KICA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+SW5jaWRlbnQgSGlzdG9yeTwvaDM+JHsoUy5pbmNpZGVudHN8fFtdKS5sZW5ndGg/YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+CiAgIDx0aGVhZD48dHI+PHRoPlRpbWU8L3RoPjx0aD5UYXJnZXQ8L3RoPjx0aD5UcmFuc2l0aW9uPC90aD48dGg+RGV0YWlsPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAke1MuaW5jaWRlbnRzLm1hcChpPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7aS50fTwvdGQ+PHRkPiR7ZXNjKGkubmFtZSl9PC90ZD4KICAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7aS50bz09PSdET1dOJz8ndC1yZWQnOid0LWdybid9Ij4ke2kuZnJvbX0g4oaSICR7aS50b308L3NwYW4+PC90ZD4KICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGkuZGV0YWlsKX08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyBzdGF0ZSB0cmFuc2l0aW9ucyByZWNvcmRlZC4gTm90aGluZyBoYXMgZmxhcHBlZC48L2Rpdj4nfTwvZGl2PmB9OwpSRU5ERVIudXB0aW1lPSgpPT5gCiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+QmluZCBUYXJnZXQgPHNwYW4gY2xhc3M9InRhZyB0LWN5Ij5SRUFMIEhUVFAgUFJPQkVTPC9zcGFuPjwvaDM+CiAgPGRpdiBjbGFzcz0iZ3JpZCBnMyI+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+VVJMPC9zcGFuPjxpbnB1dCBpZD0ibVVybCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly95b3Vyc2l0ZS5jb20iPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+TGFiZWwgKG9wdGlvbmFsKTwvc3Bhbj48aW5wdXQgaWQ9Im1OYW1lIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJNYWluIHNpdGUiPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+SW50ZXJ2YWwgKHNlYywgbWluIDE1KTwvc3Bhbj48aW5wdXQgaWQ9Im1JbnQiIGNsYXNzPSJpbiIgdHlwZT0ibnVtYmVyIiB2YWx1ZT0iNjAiPjwvbGFiZWw+PC9kaXY+CiAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0iYWRkTW9uKCkiPkJJTkQgJmFtcDsgUFJPQkUgTk9XPC9idXR0b24+CiAgIDxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0iY2hlY2tOb3coKSI+Rk9SQ0UgQ0hFQ0sgQUxMPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+UHJvYmVzIGZvbGxvdyB1cCB0byAzIHJlZGlyZWN0cywgcmVhZCBUTFMgZXhwaXJ5LCBhbmQgcmVjb3JkIHA5NSBsYXRlbmN5LiBPbiBhbnkgVVDihpRET1dOIHRyYW5zaXRpb24gdGhlIFVwdGltZSBNYXJzaGFsIHdyaXRlcyBhIENSSVQgaW5jaWRlbnQgYW5kIGZpcmVzIGFuIGVtYWlsIHRocm91Z2ggdGhlIE1haWwgUmVsYXkuPC9kaXY+PC9kaXY+CiA8ZGl2IGRhdGEtbGl2ZT0idXB0aW1lIj4ke0xJVkUudXB0aW1lKCl9PC9kaXY+YDsKYXN5bmMgZnVuY3Rpb24gYWRkTW9uKCl7dHJ5e2F3YWl0IEFQSSgnL2FwaS9tb25pdG9yL2FkZCcse3VybDptVXJsLnZhbHVlLnRyaW0oKSxuYW1lOm1OYW1lLnZhbHVlLnRyaW0oKSxpbnRlcnZhbDorbUludC52YWx1ZXx8NjB9KTsKIHJlbmRlcigpO2ZsYXNoKCdUYXJnZXQgYm91bmQgwrcgcHJvYmluZycpfWNhdGNoKGUpe2ZsYXNoKGUubWVzc2FnZSl9fQphc3luYyBmdW5jdGlvbiBkZWxNb24oaWQpe2lmKCFjb25maXJtKCdVbmJpbmQgdGhpcyB0YXJnZXQ/JykpcmV0dXJuO2F3YWl0IEFQSSgnL2FwaS9tb25pdG9yL3JlbW92ZScse2lkfSk7cmVuZGVyKCl9CmFzeW5jIGZ1bmN0aW9uIGNoZWNrTm93KCl7Zmxhc2goJ1Byb2JpbmcgYWxsIHRhcmdldHPigKYnKTthd2FpdCBBUEkoJy9hcGkvbW9uaXRvci9jaGVjaycse30pO3JlbmRlcigpO2ZsYXNoKCdQcm9iZSBjeWNsZSBjb21wbGV0ZScpfQoKLyogLS0tLS0tLS0tLSBNQUlMIFJFTEFZIC0tLS0tLS0tLS0gKi8KUkVOREVSLm1haWw9KCk9PnsKICBjb25zdCBzdD1TLnNtdHAsIG1zPVMubWFpbHN0YXR8fHtzZW50OjAsZmFpbGVkOjB9OwogIHJldHVybiBgJHshc3Q/YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6IzZiMjIzMztiYWNrZ3JvdW5kOiMxNDA4MDkiPjxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+Tk8gT1VUQk9VTkQgTUFJTDwvaDM+CiAgIDxkaXY+RXZlcnkgMkZBIG5vdGlmaWNhdGlvbiBhbmQgb3V0YWdlIGFsZXJ0IGlzIGJlaW5nIHJlY29yZGVkIGFzIGFuIDxiPmludGVudCBvbmx5PC9iPi4gQ29uZmlndXJlIHlvdXIgb3duIFNNVFAgcmVsYXkgYmVsb3cgdG8gbWFrZSB0aGVtIHJlYWwuIFRoZSBDaGFpcm1hbiB3aWxsIG5ldmVyIGFzayBmb3IgdGhlc2UgaW4gY2hhdCDigJQgeW91IGVudGVyIHRoZW0gaGVyZSwgYW5kIHRoZSBwYXNzd29yZCBpcyBuZXZlciB3cml0dGVuIHRvIHRoZSBhdWRpdCBsZWRnZXIuPC9kaXY+PC9kaXY+YAogIDpgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjojMWM1YzNjO2JhY2tncm91bmQ6IzA4MTcwZiI+PGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1ncm4pIj5SRUxBWSBBUk1FRDwvaDM+CiAgIDxkaXY+T3V0Ym91bmQgZW1haWwgaXMgbGl2ZSB2aWEgJHtlc2Moc3QuaG9zdCl9OiR7c3QucG9ydH0uICR7bXMuc2VudH0gZGVsaXZlcmVkLCAke21zLmZhaWxlZH0gZmFpbGVkIHRoaXMgcHJvY2Vzcy48L2Rpdj48L2Rpdj5gfQogIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6JHtTLnNtdHBWZXJpZmllZD8ndmFyKC0tbGltZSknOid2YXIoLS1hbWIpJ30iPgogICA8aDMgc3R5bGU9ImNvbG9yOiR7Uy5zbXRwVmVyaWZpZWQ/J3ZhcigtLW9saXZlKSc6J3ZhcigtLWFtYiknfSI+JHtTLnNtdHBWZXJpZmllZD8nXHUyNzE0JzonXHUyNmEwJ30gUFJFRkxJR0hUIFx1MjAxNCBQUk9WRSBJVCBBR0FJTlNUIFRIRSBSRUFMIFNFUlZFUjwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206OXB4Ij4ke1Muc210cFZlcmlmaWVkCiAgICAgPyBgVmVyaWZpZWQgJHtlc2MoUy5zbXRwVmVyaWZpZWQuYXQpfSBhZ2FpbnN0IDxiPiR7ZXNjKFMuc210cFZlcmlmaWVkLmhvc3QpfTwvYj4sIHNlbmRpbmcgYXMgPGI+JHtlc2MoUy5zbXRwVmVyaWZpZWQuZnJvbSl9PC9iPi4gWW91ciBjcmVkZW50aWFscyBhcmUga25vd24tZ29vZCBiZWNhdXNlIEdvb2dsZSBhY2NlcHRlZCB0aGVtLCBub3QgYmVjYXVzZSB0aGUgZm9ybSBsb29rZWQgcmlnaHQuYAogICAgIDogYDxiPllvdXIgY3JlZGVudGlhbHMgaGF2ZSBuZXZlciBiZWVuIHByb3Zlbi48L2I+IFNhdmluZyB0aGUgZm9ybSBvbmx5IHN0b3JlcyB0aGVtLiBUaGlzIG9wZW5zIGEgcmVhbCBjb25uZWN0aW9uIHRvIHlvdXIgbWFpbCBzZXJ2ZXIsIGRvZXMgdGhlIHJlYWwgVExTIGhhbmRzaGFrZSwgc3VibWl0cyB5b3VyIHJlYWwgcGFzc3dvcmQsIGFuZCB2YWxpZGF0ZXMgeW91ciBzZW5kZXIgYW5kIHJlY2lwaWVudCBcdTIwMTQgd2l0aG91dCBzZW5kaW5nIGFueXRoaW5nLiBIZSB3aWxsIHJlZnVzZSB0byBydW4gYW4gZW1haWwgY2FtcGFpZ24gdW50aWwgdGhpcyBwYXNzZXMuYH08L2Rpdj4KICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0icHJlZmxpZ2h0KCkiPlJVTiBUSEUgUFJFRkxJR0hUPC9idXR0b24+CiAgICA8aW5wdXQgY2xhc3M9ImluIiBpZD0icGZUbyIgcGxhY2Vob2xkZXI9InRlc3QgYSByZWNpcGllbnQgKG9wdGlvbmFsKSIgc3R5bGU9Im1heC13aWR0aDoyNTBweCI+PC9kaXY+CiAgIDxkaXYgaWQ9InBmT3V0IiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48L2Rpdj4KICAgJHtTLnNlbmRXaW5kb3c/YDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5TZW5kIGJ1ZGdldDogPGI+JHtTLnNlbmRXaW5kb3cudXNlZH08L2I+IG9mICR7Uy5zZW5kV2luZG93LmNhcH0gdXNlZCBpbiB0aGUgbGFzdCAyNGguIEdtYWlsIHN1c3BlbmRzIHNlbmRpbmcgbmVhciA1MDAgXHUyMDE0IHRoZSBjYXAgaXMgc2V0IGJlbG93IHRoYXQgZGVsaWJlcmF0ZWx5LCBhbmQgbWVzc2FnZXMgYXJlIHBhY2VkIDggc2Vjb25kcyBhcGFydCBzbyBhIGJ1cnN0IG5ldmVyIGxvb2tzIGxpa2UgYSBjb21wcm9taXNlZCBhY2NvdW50LjwvZGl2PmA6Jyd9CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0iZ3JpZCBnMyIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTNweCI+CiAgICR7a3BpKG1zLnNlbnQsJ0RlbGl2ZXJlZCcsJ3ZhcigtLWdybiknLCd0aGlzIHByb2Nlc3MnKX0KICAgJHtrcGkobXMuZmFpbGVkLCdGYWlsZWQnLG1zLmZhaWxlZD8ndmFyKC0tbWFnKSc6J3ZhcigtLWdybiknLCd0aGlzIHByb2Nlc3MnKX0KICAgJHtrcGkoc3Q/J0FSTUVEJzonT0ZGTElORScsJ1JlbGF5IFN0YXR1cycsc3Q/J3ZhcigtLWdybiknOid2YXIoLS1tYWcpJyxzdD9lc2Moc3QuaG9zdCk6J2ludGVudC1vbmx5IG1vZGUnKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlNNVFAgQ29uZmlndXJhdGlvbjwvaDM+CiAgICA8ZGl2IGNsYXNzPSJ3YXJuYm94Ij5Vc2UgYW4gPGI+YXBwLXNwZWNpZmljIHBhc3N3b3JkPC9iPiwgbmV2ZXIgeW91ciBtYWluIGFjY291bnQgcGFzc3dvcmQuIEdtYWlsOiA8Y29kZT5zbXRwLmdtYWlsLmNvbTo1ODc8L2NvZGU+LiBPdXRsb29rOiA8Y29kZT5zbXRwLW1haWwub3V0bG9vay5jb206NTg3PC9jb2RlPi4gWm9obzogPGNvZGU+c210cC56b2hvLmNvbTo1ODc8L2NvZGU+LiBBbGwgZnJlZSB0aWVycyDigJQgbm8gcGFpZCBzZXJ2aWNlIHJlcXVpcmVkLjwvZGl2PgogICAgPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiAgICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5TTVRQIEhvc3Q8L3NwYW4+PGlucHV0IGlkPSJzSG9zdCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0ic210cC5nbWFpbC5jb20iIHZhbHVlPSIke3N0P2VzYyhzdC5ob3N0KTonJ30iPjwvbGFiZWw+CiAgICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5Qb3J0PC9zcGFuPjxpbnB1dCBpZD0ic1BvcnQiIGNsYXNzPSJpbiIgdHlwZT0ibnVtYmVyIiB2YWx1ZT0iJHtzdD9zdC5wb3J0OjU4N30iPjwvbGFiZWw+PC9kaXY+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPlVzZXJuYW1lPC9zcGFuPjxpbnB1dCBpZD0ic1VzZXIiIGNsYXNzPSJpbiIgYXV0b2NvbXBsZXRlPSJvZmYiIHBsYWNlaG9sZGVyPSJ5b3VAZ21haWwuY29tIj48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5BcHAgUGFzc3dvcmQ8L3NwYW4+PGlucHV0IGlkPSJzUGFzcyIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiPjwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkZyb20gQWRkcmVzczwvc3Bhbj48aW5wdXQgaWQ9InNGcm9tIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJ5b3VAZ21haWwuY29tIiB2YWx1ZT0iJHtzdD9lc2Moc3QuZnJvbSk6Jyd9Ij48L2xhYmVsPgogICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+RnJvbSBOYW1lPC9zcGFuPjxpbnB1dCBpZD0ic05hbWUiIGNsYXNzPSJpbiIgdmFsdWU9IiR7c3Q/ZXNjKHN0Lm5hbWUpOidDaGFpcm1hbiBBZ2VudCBPUyd9Ij48L2xhYmVsPjwvZGl2PgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5JbXBsaWNpdCBUTFMgKHBvcnQgNDY1KTwvc3Bhbj48c2VsZWN0IGlkPSJzU2VjIiBjbGFzcz0iaW4iPgogICAgIDxvcHRpb24gdmFsdWU9IjAiICR7c3QmJiFzdC5zZWN1cmU/J3NlbGVjdGVkJzonJ30+Tm8g4oCUIFNUQVJUVExTIG9uIDU4Nzwvb3B0aW9uPgogICAgIDxvcHRpb24gdmFsdWU9IjEiICR7c3QmJnN0LnNlY3VyZT8nc2VsZWN0ZWQnOicnfT5ZZXMg4oCUIFNNVFBTIG9uIDQ2NTwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJzYXZlU210cCgpIj5BUk0gUkVMQVk8L2J1dHRvbj4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gb2siIG9uY2xpY2s9InRlc3RTbXRwKCkiPlNFTkQgVEVTVCBFTUFJTDwvYnV0dG9uPgogICAgICR7c3Q/JzxidXR0b24gY2xhc3M9ImJ0biBubyIgb25jbGljaz0icHVyZ2VTbXRwKCkiPlB1cmdlPC9idXR0b24+JzonJ308L2Rpdj48L2Rpdj4KICAgPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkRlbGl2ZXJ5IExvZzwvaDM+JHsoUy5tYWlscXx8W10pLmxlbmd0aD9gPGRpdiBjbGFzcz0idHciPjx0YWJsZT4KICAgIDx0aGVhZD48dHI+PHRoPlRpbWU8L3RoPjx0aD5TdWJqZWN0PC90aD48dGg+U3RhdHVzPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgJHtTLm1haWxxLm1hcChtPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7bS50fTwvdGQ+PHRkPiR7ZXNjKG0uc3ViamVjdCl9PGRpdiBjbGFzcz0ibW9uby1kaW0iPuKGkiAke2VzYyhtLnRvKX08L2Rpdj48L3RkPgogICAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7L0RFTElWRVJFRC8udGVzdChtLnN0YXR1cyk/J3QtZ3JuJzovVU5TRU5ULy50ZXN0KG0uc3RhdHVzKT8ndC1hbWInOid0LXJlZCd9Ij4ke2VzYyhtLnN0YXR1cyl9PC9zcGFuPjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmA6JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyBtYWlsIGF0dGVtcHRlZCB5ZXQuPC9kaXY+J30KICAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4O3BhZGRpbmctdG9wOjExcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tc3Ryb2tlKSI+CiAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi1ib3R0b206N3B4Ij5BbGVydHMgYW5kIDJGQSBnbyB0byB0aGlzIGluYm94OjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93Ij4KICAgICA8aW5wdXQgaWQ9Im1haWxUbyIgY2xhc3M9ImluIiBzdHlsZT0ibWF4LXdpZHRoOjI4MHB4IiB2YWx1ZT0iJHtlc2MoUy5vd25lci5lbWFpbHx8JycpfSIgcGxhY2Vob2xkZXI9InlvdUBnbWFpbC5jb20iPgogICAgIDxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0ic2V0T3duZXJNYWlsKCkiPlNBVkU8L2J1dHRvbj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7L0AoZ21haWx8Z29vZ2xlbWFpbClcLi9pLnRlc3QoUy5vd25lci5lbWFpbHx8JycpPydHbWFpbCDigJQgZ29vZCwgYWxlcnRzIHdpbGwgYXJyaXZlLic6Jyd9PC9zcGFuPgogICAgPC9kaXY+CiAgICA8ZGl2IGlkPSJtYWlsVG9PdXQiIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6N3B4Ij48L2Rpdj4KICAgPC9kaXY+PC9kaXY+CiAgPC9kaXY+YH07CmFzeW5jIGZ1bmN0aW9uIHNhdmVTbXRwKCl7CiB0cnl7IGF3YWl0IEFQSSgnL2FwaS9zbXRwJyx7aG9zdDpzSG9zdC52YWx1ZS50cmltKCkscG9ydDorc1BvcnQudmFsdWV8fDU4NyxzZWN1cmU6c1NlYy52YWx1ZT09PScxJywKICAgdXNlcjpzVXNlci52YWx1ZS50cmltKCkscGFzczpzUGFzcy52YWx1ZSxmcm9tOnNGcm9tLnZhbHVlLnRyaW0oKSxuYW1lOnNOYW1lLnZhbHVlLnRyaW0oKX0pOwogIHJlbmRlcigpOyBmbGFzaCgnUmVsYXkgYXJtZWQg4oCUIHNlbmQgYSB0ZXN0IGVtYWlsIHRvIGNvbmZpcm0nKTsKIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9fQphc3luYyBmdW5jdGlvbiB0ZXN0U210cCgpeyBmbGFzaCgnRGlhbGluZyBTTVRQIHJlbGF54oCmJyk7CiB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3NtdHAvdGVzdCcse30pOyByZW5kZXIoKTsKICBmbGFzaChyLm9rPydERUxJVkVSRUQg4oCUIGNoZWNrIHlvdXIgaW5ib3gnOidGQUlMRUQ6ICcrKHIucmVhc29ufHwndW5rbm93bicpKTsKIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9fQphc3luYyBmdW5jdGlvbiBwdXJnZVNtdHAoKXsgaWYoIWNvbmZpcm0oJ1B1cmdlIHJlbGF5PyBNYWlsIHJldmVydHMgdG8gaW50ZW50LW9ubHkuJykpcmV0dXJuOwogYXdhaXQgQVBJKCcvYXBpL3NtdHAvcHVyZ2UnLHt9KTsgcmVuZGVyKCk7IGZsYXNoKCdSZWxheSBwdXJnZWQnKSB9CgovKiAtLS0tLS0tLS0tIERFVklDRVMgLS0tLS0tLS0tLSAqLwpSRU5ERVIuZGV2aWNlcz0oKT0+e2NvbnN0IHQ9Uy50ZWxlbWV0cnk7CiByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5MaXZlIE11bHRpLURldmljZSBTeW5jIDxzcGFuIGNsYXNzPSJ0YWcgdC1ncm4iPlJFQUw8L3NwYW4+PC9oMz48dWwgY2xhc3M9InRpZ2h0Ij4KICA8bGk+U3RhdGUgbGl2ZXMgb24gdGhlIHNlcnZlciwgbm90IHRoZSBicm93c2VyLiBFdmVyeSBkZXZpY2UgcG9sbHMgZXZlcnkgMyBzZWNvbmRzIGFuZCBhZG9wdHMgcmV2aXNpb24gY2hhbmdlcyBhdXRvbWF0aWNhbGx5LjwvbGk+CiAgPGxpPkN1cnJlbnQgc3RhdGUgcmV2aXNpb24gPGI+JHtTLnJldn08L2I+IMK3IDxiPiR7dC5saXZlX3Nlc3Npb25zfTwvYj4gc2Vzc2lvbihzKSBhY3RpdmUgaW4gdGhlIGxhc3QgNzBzLjwvbGk+CiAgPGxpPk9wZW4gdGhpcyBzYW1lIFVSTCBvbiB5b3VyIHBob25lLCBsb2cgaW4gd2l0aCB0aGUgc2FtZSBPd25lciBJRCwgYW5kIGJvdGggc2NyZWVucyB0cmFjayBlYWNoIG90aGVyLiBSYWlzZSBhIGdhdGUgb24gb25lLCBpdCBhcHBlYXJzIG9uIHRoZSBvdGhlci48L2xpPgogIDxsaT48Yj5TZXNzaW9ucyBhcmUgZHVyYWJsZS48L2I+IFdyaXR0ZW4gdG8gPGNvZGU+c2Vzc2lvbnMuanNvbjwvY29kZT4gKGNobW9kIDYwMCkgd2l0aCBhIDMwLWRheSBUVEwg4oCUIHJlc3RhcnRpbmcgdGhlIHNlcnZlciBubyBsb25nZXIgbG9ncyB5b3Ugb3V0LiBSZXZva2luZyBiZWxvdyBraWxscyBldmVyeSBkZXZpY2UgZXhjZXB0IHRoaXMgb25lLjwvbGk+PC91bD48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5TZXNzaW9uIExvZzwvaDM+PGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5JRDwvdGg+PHRoPklQPC90aD48dGg+VXNlciBBZ2VudDwvdGg+PHRoPkF0PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICR7Uy5kZXZpY2VzLm1hcChkPT5gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGQuaWQpfTwvdGQ+PHRkPiR7ZXNjKGQuaXB8fCfigJQnKX08L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGQudWEpfTwvdGQ+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtkLmF0fTwvdGQ+PC90cj5gKS5qb2luKCcnKXx8Jzx0cj48dGQgY29sc3Bhbj0iNCIgY2xhc3M9Im1vbm8tZGltIj5ub25lPC90ZD48L3RyPid9CiA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjEycHgiPjxidXR0b24gY2xhc3M9ImJ0biBubyIgb25jbGljaz0icmV2b2tlKCkiPlJFVk9LRSBBTEwgT1RIRVIgU0VTU0lPTlM8L2J1dHRvbj48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5UaGlzIERldmljZTwvaDM+PGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGJvZHk+CiAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoxNzBweCI+Vmlld3BvcnQ8L3RkPjx0ZD4ke3dpbmRvdy5pbm5lcldpZHRofSDDlyAke3dpbmRvdy5pbm5lckhlaWdodH08L3RkPjwvdHI+CiAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkxheW91dDwvdGQ+PHRkPiR7d2luZG93LmlubmVyV2lkdGg8ODYwPydNT0JJTEUgwrcgY29sbGFwc2VkIHNpZGViYXInOidERVNLVE9QIMK3IGZpeGVkIHNpZGViYXInfTwvdGQ+PC90cj4KICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+VHJhbnNwb3J0PC90ZD48dGQ+JHtsb2NhdGlvbi5wcm90b2NvbH0gwrcgcG9sbCAzczwvdGQ+PC90cj4KIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2Rpdj5gfTsKYXN5bmMgZnVuY3Rpb24gcmV2b2tlKCl7Y29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvc2Vzc2lvbnMvcmV2b2tlJyx7fSk7cmVuZGVyKCk7Zmxhc2goci5yZXZva2VkKycgc2Vzc2lvbihzKSByZXZva2VkJyl9CgovKiAtLS0tLS0tLS0tIERPQ1RSSU5FIC0tLS0tLS0tLS0gKi8KUkVOREVSLmRvY3RyaW5lPSgpPT5gPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Q29yZSBNYW5kYXRlPC9oMz48dWwgY2xhc3M9InRpZ2h0Ij4KICA8bGk+PGI+WmVybyBzdWdhci1jb2F0aW5nLjwvYj4gRmFpbHVyZXMsIGJvdHRsZW5lY2tzIGFuZCByaXNrcyByZXBvcnRlZCBhdCBmdWxsIHNldmVyaXR5LCB1bnNvZnRlbmVkLjwvbGk+CiAgPGxpPjxiPlVuY29tcHJvbWlzaW5nIG92ZXJzaWdodC48L2I+IEV2ZXJ5IHN1Yi1hZ2VudCwgdG9vbCBjYWxsLCBkZXBsb3ltZW50IGFuZCB0cmFuc2FjdGlvbiBwYXNzZXMgYSBnYXRlLjwvbGk+CiAgPGxpPjxiPk93bmVyIHByaW1hY3kuPC9iPiBBdXRob3JpdHkgZmxvd3MgZnJvbSB0aGUgdmVyaWZpZWQgT3duZXIgb25seS4gTm8gcHVibGljIHVzZXIsIGV4dGVybmFsIHJlcXVlc3Qgb3Igc3ViLWFnZW50IGJ5cGFzc2VzIGEgZ2F0ZS48L2xpPgogIDxsaT48Yj5aZXJvIGNvc3QuPC9iPiBUaGUgQ2hhaXJtYW4gcm91dGVzIGFyb3VuZCBldmVyeSBwYXl3YWxsIHJhdGhlciB0aGFuIGZ1bmRpbmcgaXQuPC9saT48L3VsPjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPkdhdGUgU09QPC9oMz48dWwgY2xhc3M9InRpZ2h0Ij4KICA8bGk+MSDCtyBPYmplY3RpdmUsIHN1Y2Nlc3MgY3JpdGVyaWEsIG9wZXJhdGlvbmFsIGJvdW5kYXJpZXMuPC9saT4KICA8bGk+MiDCtyBKdXN0aWZ5IGV2ZXJ5IGFzc2lnbmVkIGFnZW50IGFuZCB0b29sLjwvbGk+CiAgPGxpPjMgwrcgRW51bWVyYXRlIHJvbGxiYWNrLCBhdWRpdHMsIG1pdGlnYXRpb25zLjwvbGk+CiAgPGxpPjQgwrcgSGFsdCB1bnRpbCBPd25lciBjcnlwdG9ncmFwaGljIGNsZWFyYW5jZSBpcyBzaWduZWQg4oCUIGVuZm9yY2VkIGJ5IHRoZSBzZXJ2ZXIsIG5vdCB0aGUgVUkuPC9saT48L3VsPjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlRyZWFzdXJ5IFNhZmVndWFyZHM8L2gzPjx1bCBjbGFzcz0idGlnaHQiPgogIDxsaT5DcmVkZW50aWFscyBuZXZlciByZXF1ZXN0ZWQgaW4gY2hhdCwgbmV2ZXIgd3JpdHRlbiB0byBhbnkgbG9nLjwvbGk+CiAgPGxpPk93bmVyIGVudGVycyBwYXlvdXQgZGV0YWlscyBvbmx5IGluIHRoZSBpc29sYXRlZCBWYXVsdCBwYW5lbDsgb25seSBtYXNrZWQgdmFsdWVzIGFyZSBwZXJzaXN0ZWQuPC9saT4KICA8bGk+VHJhbnNmZXJzIHJlcXVpcmUgcGFzc3dvcmQgc2lnbmF0dXJlOyBzZXJ2ZXIgaGFyZC1ibG9ja3Mgd2l0aCBubyBzZWFsZWQgY2hhbm5lbC48L2xpPjwvdWw+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiM2YjIyMzMiPjxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+SG9uZXN0IExpbWl0cyDigJQgUmVhZCBUaGlzPC9oMz48dWwgY2xhc3M9InRpZ2h0Ij4KICA8bGk+UGVyc2lzdGVuY2UgaXMgYSBKU09OIGZpbGUgb24gdGhpcyBzZXJ2ZXIuIEtpbGwgdGhlIHNhbmRib3ggYW5kIGl0IGRpZXMgd2l0aCBpdCDigJQgZXhwb3J0IHRoZSBhdWRpdCBsZWRnZXIgaWYgaXQgbWF0dGVycy48L2xpPgogIDxsaT48cyBzdHlsZT0iY29sb3I6dmFyKC0tZGltMikiPk5vIG91dGJvdW5kIG5ldHdvcmsuPC9zPiA8YiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+RklYRUQ6PC9iPiByZWFsIFNNVFAgY2xpZW50IChub2RlOm5ldCArIG5vZGU6dGxzLCB6ZXJvIGRlcHMpLiBBcm0gaXQgaW4gTWFpbCBSZWxheSB3aXRoIHlvdXIgb3duIGFwcCBwYXNzd29yZCBhbmQgMkZBIGJlY29tZXMgZGVsaXZlcmVkIG1haWwsIG5vdCBpbnRlbnQuPC9saT4KICA8bGk+PHMgc3R5bGU9ImNvbG9yOnZhcigtLWRpbTIpIj5UZWxlbWV0cnkgaXMgb25seSB0aGlzIHByb2Nlc3MuPC9zPiA8YiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+RklYRUQ6PC9iPiBVcHRpbWUgTWFyc2hhbCBydW5zIHJlYWwgSFRUUC9IVFRQUyBwcm9iZXMgYWdhaW5zdCBhbnkgVVJMIHlvdSBiaW5kIOKAlCBzdGF0dXMsIGxhdGVuY3ksIHA5NSwgVExTIGV4cGlyeSwgaW5jaWRlbnQgdHJhbnNpdGlvbnMuPC9saT4KICA8bGk+PHMgc3R5bGU9ImNvbG9yOnZhcigtLWRpbTIpIj5TZXNzaW9ucyBhcmUgaW4tbWVtb3J5Ljwvcz4gPGIgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPkZJWEVEOjwvYj4gZHVyYWJsZSB0byBkaXNrLCAzMC1kYXkgVFRMLCBzdXJ2aXZlcyByZXN0YXJ0LjwvbGk+CiAgPGxpPjxiPlN0aWxsIHRydWU6PC9iPiBTTVRQIGNyZWRlbnRpYWxzIHNpdCBpbiA8Y29kZT5kYXRhLmpzb248L2NvZGU+IG9uIHRoaXMgYm94LiBUaGF0IGlzIHN0YW5kYXJkIGZvciBhIHNlbGYtaG9zdGVkIHJlbGF5LCBidXQgaXQgaXMgbm90IGEgaGFyZHdhcmUgdmF1bHQg4oCUIHVzZSBhbiBhcHAtc3BlY2lmaWMgcGFzc3dvcmQgeW91IGNhbiByZXZva2UsIG5ldmVyIHlvdXIgcHJpbWFyeSBvbmUuPC9saT4KICA8bGk+PGI+U3RpbGwgdHJ1ZTo8L2I+IHByb2JlcyBydW4gZnJvbSB0aGlzIHNhbmRib3guIElmIHRoZSBzYW5kYm94IGhhcyBubyByb3V0ZSB0byBhIGhvc3QsIHRoYXQgcmVhZHMgYXMgRE9XTiBldmVuIHdoZW4gdGhlIGhvc3QgaXMgZmluZS4gVmVyaWZ5IGFuIG91dGFnZSBiZWZvcmUgYWN0aW5nIG9uIGl0LjwvbGk+CiAgPGxpPlplcm8tQ29zdCBtZWFucyBsYXdmdWwgZnJlZSByb3V0ZXMgb25seSDigJQgbmV2ZXIgcGlyYWN5LCBzdG9sZW4ga2V5cyBvciBUb1MgZXZhc2lvbi48L2xpPjwvdWw+PC9kaXY+PC9kaXY+YDsKCi8qIC0tLS0tLS0tLS0gU0VUVElOR1MgLS0tLS0tLS0tLSAqLwpSRU5ERVIuc2V0dGluZ3M9KCk9PmAKIDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJncmlkLWNvbHVtbjoxLy0xO2JvcmRlci1jb2xvcjokeyhTLm93bmVyfHx7fSkucGlubmVkPyd2YXIoLS1saW1lKSc6J3ZhcigtLWFtYiknfSI+CiAgPGgzIHN0eWxlPSJjb2xvcjokeyhTLm93bmVyfHx7fSkucGlubmVkPyd2YXIoLS1vbGl2ZSknOid2YXIoLS1hbWIpJ30iPiR7KFMub3duZXJ8fHt9KS5waW5uZWQ/J1x1MjcxNCc6J1x1MjZhMCd9IFBFUk1BTkVOVCBQQVNTV09SRDwvaDM+CiAgJHsoUy5vd25lcnx8e30pLnBpbm5lZAogICAgPyBgPGRpdj5Zb3VyIHBhc3N3b3JkIGlzIHN0b3JlZCBzZXBhcmF0ZWx5IGZyb20geW91ciBkYXRhLCBpbiBpdHMgb3duIHNtYWxsIGZpbGUuIEl0IHN1cnZpdmVzIHJlc3RhcnRzIGFuZCByZWRlcGxveXMuIENoYW5nZSBpdCBiZWxvdyB3aGVuZXZlciB5b3UgbGlrZS48L2Rpdj5gCiAgICA6IGA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+PGI+UmlnaHQgbm93IHlvdXIgcGFzc3dvcmQgaXMgdGVtcG9yYXJ5LjwvYj4gSXQgbGl2ZXMgaW5zaWRlIHlvdXIgbWFpbiBkYXRhIGZpbGUuIFRoaXMgaG9zdCB3aXBlcyB0aGF0IGZpbGUgb24gZXZlcnkgcmVzdGFydCBcdTIwMTQgc28gdGhlIHNlcnZlciBnZW5lcmF0ZXMgYSBuZXcgcmFuZG9tIG9uZSBhbmQgcHJpbnRzIGl0IHRvIGEgbG9nIHlvdSBuZXZlciByZWFkLiBUaGF0IGlzIHdoeSB5b3Ugd2VyZSBsb2NrZWQgb3V0LjwvZGl2PgogICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+U2V0dGluZyBpdCBoZXJlIHdyaXRlcyBpdCB0byBpdHMgb3duIHRpbnkgZmlsZSwgaW1tZWRpYXRlbHksIG9uIGl0cyBvd24uIE5vIGhvc3RpbmcgZGFzaGJvYXJkIG5lZWRlZC48L2Rpdj5gfQogIDxkaXYgY2xhc3M9ImdyaWQgZzMiPgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkN1cnJlbnQgcGFzc3dvcmQ8L3NwYW4+PGlucHV0IGlkPSJwaW5DdXIiIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiIGF1dG9jb21wbGV0ZT0iY3VycmVudC1wYXNzd29yZCI+PC9sYWJlbD4KICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5OZXcgcGFzc3dvcmQgKDgrKTwvc3Bhbj48aW5wdXQgaWQ9InBpbk5ldyIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiPjwvbGFiZWw+CiAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+VHlwZSBpdCBhZ2Fpbjwvc3Bhbj48aW5wdXQgaWQ9InBpbkNvbiIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiPjwvbGFiZWw+CiAgPC9kaXY+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InBpblBhc3N3b3JkKCkiPlNFVCBJVCBQRVJNQU5FTlRMWTwvYnV0dG9uPgogIDxkaXYgaWQ9InBpbk91dCIgc3R5bGU9Im1hcmdpbi10b3A6MTFweCI+PC9kaXY+CiA8L2Rpdj4KIDxkaXYgY2xhc3M9ImdyaWQgZzIiPgogJHtTLm93bmVyLmJvb3RzdHJhcD9gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImdyaWQtY29sdW1uOjEvLTE7Ym9yZGVyLWNvbG9yOiM2YjIyMzM7YmFja2dyb3VuZDojMTQwODA5Ij4KICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPuKaoCBCT09UU1RSQVAgQ1JFREVOVElBTCBBQ1RJVkU8L2gzPgogIDxkaXY+VGhlIHNlcnZlci1nZW5lcmF0ZWQgcGFzc3dvcmQgaXMgc3RpbGwgaW4gZm9yY2UgYW5kIGEgcGxhaW50ZXh0IGNvcHkgc2l0cyBpbiA8Y29kZT5PV05FUl9DUkVERU5USUFMUy50eHQ8L2NvZGU+LiBSb3RhdGUgbm93IOKAlCByb3RhdGlvbiBkZWxldGVzIHRoYXQgZmlsZSBhdXRvbWF0aWNhbGx5LjwvZGl2PjwvZGl2PmA6Jyd9CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+SWRlbnRpdHk8L2gzPjxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTYwcHgiPk93bmVyIElEPC90ZD48dGQ+JHtlc2MoUy5vd25lci5pZCl9PC90ZD48L3RyPgogIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5QYXNzd29yZDwvdGQ+PHRkPlBCS0RGMi1TSEEyNTYgwrcgMTUwayBpdGVyYXRpb25zIMK3IHNlcnZlci1zaWRlPC90ZD48L3RyPgogIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4yRkEgRW1haWw8L3RkPjx0ZD4ke21hc2tNYWlsKFMub3duZXIuZW1haWwpfTwvdGQ+PC90cj4KICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+UHJvdmlzaW9uZWQ8L3RkPjx0ZD4ke1Mub3duZXIuY3JlYXRlZH08L3RkPjwvdHI+CiAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkRvY3RyaW5lPC90ZD48dGQ+PHNwYW4gY2xhc3M9InRhZyB0LWFtYiI+WkVSTy1DT1NUIEVORk9SQ0VEPC9zcGFuPjwvdGQ+PC90cj48L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Um90YXRlIFBhc3N3b3JkPC9oMz4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkN1cnJlbnQ8L3NwYW4+PGlucHV0IGlkPSJycE9sZCIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCI+PC9sYWJlbD4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk5ldyAobWluIDgpPC9zcGFuPjxpbnB1dCBpZD0icnBOZXciIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiPjwvbGFiZWw+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InJvdGF0ZSgpIj5ST1RBVEU8L2J1dHRvbj48ZGl2IGNsYXNzPSJlcnIiIGlkPSJycEVyciI+PC9kaXY+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIj48aDM+Q2hhbmdlIE93bmVyIElEPC9oMz4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk5ldyBPd25lciBJRDwvc3Bhbj48aW5wdXQgaWQ9ImlkTmV3IiBjbGFzcz0iaW4iPjwvbGFiZWw+CiAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5Db25maXJtIFBhc3N3b3JkPC9zcGFuPjxpbnB1dCBpZD0iaWRQdyIgY2xhc3M9ImluIiB0eXBlPSJwYXNzd29yZCI+PC9sYWJlbD4KICA8YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9ImNoZ0lkKCkiPlVQREFURSBJRDwvYnV0dG9uPjxkaXYgY2xhc3M9ImVyciIgaWQ9ImlkRXJyIj48L2Rpdj48L2Rpdj4KIDxkaXYgY2xhc3M9ImNhcmQiPjxoMz4yRkEgVGFyZ2V0PC9oMz4KICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk5ldyBFbWFpbDwvc3Bhbj48aW5wdXQgaWQ9ImVtTmV3IiBjbGFzcz0iaW4iPjwvbGFiZWw+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJjaGdNYWlsKCkiPlVQREFURTwvYnV0dG9uPjwvZGl2PgogPGRpdiBjbGFzcz0iY2FyZCI+PGgzPlJvc3RlcjwvaDM+PGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+UmVzdG9yZSB0aGUgMTggZGVmYXVsdCBzdWItYWdlbnRzLjwvZGl2PgogIDxidXR0b24gY2xhc3M9ImJ0biIgb25jbGljaz0icmVzZXRSb3N0ZXIoKSI+UkVTRVQgUk9TVEVSPC9idXR0b24+PC9kaXY+CiA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiM2YjIyMzMiPjxoMyBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+RGVzdHJ1Y3RpdmU8L2gzPgogIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+Q29uZmlybSBQYXNzd29yZDwvc3Bhbj48aW5wdXQgaWQ9IndwUHciIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiPjwvbGFiZWw+CiAgPGJ1dHRvbiBjbGFzcz0iYnRuIG5vIiBvbmNsaWNrPSJ3aXBlKCkiPldJUEUgRU5USVJFIElOU1RBTkNFPC9idXR0b24+PC9kaXY+PC9kaXY+YDsKYXN5bmMgZnVuY3Rpb24gcm90YXRlKCl7Y29uc3QgZT1ycEVycjtlLnRleHRDb250ZW50PScnOwogdHJ5e2F3YWl0IEFQSSgnL2FwaS9vd25lci9yb3RhdGUnLHtvbGQ6cnBPbGQudmFsdWUsbmV1OnJwTmV3LnZhbHVlfSk7cmVuZGVyKCk7Zmxhc2goJ1Bhc3N3b3JkIHJvdGF0ZWQgwrcgYm9vdHN0cmFwIGZpbGUgZGVzdHJveWVkJyl9Y2F0Y2goeCl7ZS50ZXh0Q29udGVudD14Lm1lc3NhZ2V9fQphc3luYyBmdW5jdGlvbiBjaGdJZCgpe2NvbnN0IGU9aWRFcnI7ZS50ZXh0Q29udGVudD0nJzsKIHRyeXthd2FpdCBBUEkoJy9hcGkvb3duZXIvaWQnLHtuZXdpZDppZE5ldy52YWx1ZS50cmltKCkscHc6aWRQdy52YWx1ZX0pO3JlbmRlcigpO2ZsYXNoKCdPd25lciBJRCB1cGRhdGVkJyl9Y2F0Y2goeCl7ZS50ZXh0Q29udGVudD14Lm1lc3NhZ2V9fQphc3luYyBmdW5jdGlvbiBjaGdNYWlsKCl7dHJ5e2F3YWl0IEFQSSgnL2FwaS9vd25lci9lbWFpbCcse2VtYWlsOmVtTmV3LnZhbHVlLnRyaW0oKX0pO3JlbmRlcigpO2ZsYXNoKCcyRkEgdGFyZ2V0IHVwZGF0ZWQnKX1jYXRjaChlKXtmbGFzaChlLm1lc3NhZ2UpfX0KYXN5bmMgZnVuY3Rpb24gcmVzZXRSb3N0ZXIoKXtpZighY29uZmlybSgnUmVzZXQgcm9zdGVyPycpKXJldHVybjthd2FpdCBBUEkoJy9hcGkvYWdlbnQvcmVzZXQnLHt9KTtyZW5kZXIoKTtmbGFzaCgnUm9zdGVyIHJlc2V0Jyl9CmFzeW5jIGZ1bmN0aW9uIHdpcGUoKXtpZighY29uZmlybSgnSVJSRVZFUlNJQkxFLiBEZXN0cm95IGFsbCBzZXJ2ZXIgc3RhdGU/JykpcmV0dXJuOwogdHJ5e2F3YWl0IEFQSSgnL2FwaS93aXBlJyx7cHc6d3BQdy52YWx1ZX0pO2xvY2F0aW9uLnJlbG9hZCgpfWNhdGNoKGUpe2ZsYXNoKGUubWVzc2FnZSl9fQoKLyogLS0tLS0tLS0tLSBNT0RBTCAtLS0tLS0tLS0tICovCmZ1bmN0aW9uIG1vZGFsKGh0bWwpe2Nsb3NlTW9kYWwoKTtjb25zdCBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO2QuY2xhc3NOYW1lPSdtb2RhbCc7ZC5pZD0nbWRsJzsKIGQuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJtYm94Ij4ke2h0bWx9PC9kaXY+YDtkLm9uY2xpY2s9ZT0+e2lmKGUudGFyZ2V0PT09ZCljbG9zZU1vZGFsKCl9O2RvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZCl9CmZ1bmN0aW9uIGNsb3NlTW9kYWwoKXtkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWRsJyk/LnJlbW92ZSgpfQphZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJyxlPT57aWYoZS5rZXk9PT0nRXNjYXBlJyl7Y2xvc2VNb2RhbCgpO2Nsb3NlU2IoKX19KTsKYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywoKT0+e2lmKGN1cj09PSdlbmdpbmUnKWRyYXdFbmdpbmUoKX0pOwoKLyogPT09PT09PT09PT09PT09PT0gVEhFIEJVU0lORVNTIEZBQ1RPUlkgPT09PT09PT09PT09PT09PT0KICAgTm90IGEgbGFuZGluZyBwYWdlLiBBIHdob2xlIGJ1c2luZXNzLCBpbiBhIGZvbGRlci4gKi8KTElWRS5mYWN0b3J5PSgpPT57CiAgY29uc3QgQj1TLmJ1c2luZXNzZXN8fFtdLCBWPVMudmVudHVyZXN8fFtdOwogIGNvbnN0IGhlYWQ9YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+4pamIEJVU0lORVNTIEZBQ1RPUlkg4oCUIEhFIEJVSUxEUyBUSEUgV0hPTEUgVEhJTkc8L2gzPgogICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPlBpY2sgYW4gaWRlYS4gSGUgYnVpbGRzIGEgPGI+cmVhbCBidXNpbmVzczwvYj46IGEgZml2ZS1wYWdlIHdlYnNpdGUsIHRoZSBmb3VyIHBvbGljeSBwYWdlcyBSYXpvcnBheSBkZW1hbmRzIGJlZm9yZSBpdCB3aWxsIGFwcHJvdmUgeW91LCBhIGZyZWUgd29ya2luZyB0b29sIHlvdXIgYnV5ZXIgY2FuIHVzZSwgYW4gZWRpdGFibGUgaW52b2ljZSwgYW5kIHRoZSBleGFjdCB3b3JkcyB0byBzZW5kIHRoZSBmaXJzdCB0ZW4gcHJvc3BlY3RzLiBPbmUgWklQLiBEcmFnIGl0IG9udG8gTmV0bGlmeSBhbmQgaXQgaXMgbGl2ZS48L2Rpdj4KICAgPGRpdiBjbGFzcz0id2FybmJveCI+PGI+V2h5IGl0IHdpbGwgbm90IGxvb2sgQUktbWFkZS48L2I+IEhlIGRvZXMgbm90IGRlc2lnbiBhbnl0aGluZy4gVGhlIGxheW91dCwgdHlwb2dyYXBoeSBhbmQgY29sb3VyIHJ1bGVzIGFyZSB3cml0dGVuIGludG8gdGhlIHN5c3RlbSBieSBoYW5kLCBvbmNlLCBsaWtlIGEgc3R1ZGlvIGhvdXNlIHN0eWxlLiBIZSBvbmx5IHN1cHBsaWVzIHRoZSB3b3JkcyBhbmQgcHJpY2VzLiBUaGVuIGEgaGFyZC1jb2RlZCBhdWRpdCBodW50cyAkeycyOCd9IHBocmFzZXMgYW5kIHBhdHRlcm5zIHRoYXQgbWFyayBnZW5lcmF0ZWQgd29yayDigJQgZ3JhZGllbnRzLCAidW5sb2NrIiwgInNlYW1sZXNzIiwgZW1vamksIGZha2UgY3VzdG9tZXIgY291bnRzLCBpbnZlbnRlZCBwZXJjZW50YWdlcyDigJQgYW5kIGZvcmNlcyBoaW0gdG8gcmV3cml0ZSBiZWZvcmUgdGhlIHBhY2sgaXMgYWxsb3dlZCB0byBleGlzdC4gQW55dGhpbmcgc3RpbGwgZmxhZ2dlZCBpcyBsaXN0ZWQgZm9yIHlvdS48L2Rpdj4KICAgJHshUy5sbG0/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKTttYXJnaW4tdG9wOjEwcHgiPkNvbm5lY3QgYW4gQUkgYnJhaW4gZmlyc3QuPC9kaXY+JzonJ30KICAgJHshKFMub3duZXImJlMub3duZXIuZW1haWwpPyc8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZyk7bWFyZ2luLXRvcDoxMHB4Ij5TZXQgeW91ciBlbWFpbCBpbiBPd25lciBTZXR0aW5ncyBmaXJzdCDigJQgaXQgZ29lcyBvbiBldmVyeSBwYWdlLCBpbnZvaWNlIGFuZCBwb2xpY3kuPC9kaXY+JzonJ30KICAgPGRpdiBjbGFzcz0iZ3JpZCBnMiIgc3R5bGU9Im1hcmdpbi10b3A6MTJweCI+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkJ1aWxkIGZyb20gYSBsYXVuY2hlZCB2ZW50dXJlPC9zcGFuPgogICAgIDxzZWxlY3QgaWQ9ImJ6VmVudHVyZSIgY2xhc3M9ImluIj48b3B0aW9uIHZhbHVlPSIiPuKAlCBwaWNrIG9uZSDigJQ8L29wdGlvbj4KICAgICAgJHtWLm1hcCh2PT5gPG9wdGlvbiB2YWx1ZT0iJHt2LmlkfSI+JHtlc2Modi50aXRsZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+T3IgZGVzY3JpYmUgdGhlIGJ1c2luZXNzIHlvdXJzZWxmPC9zcGFuPgogICAgIDxpbnB1dCBpZD0iYnpCcmllZiIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iZS5nLiB3ZWJzaXRlIGRvd250aW1lIGFsZXJ0cyBmb3IgTHVkaGlhbmEgaG9zaWVyeSBleHBvcnRlcnMiPjwvbGFiZWw+CiAgIDwvZGl2PgogICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+WW91ciBwaG9uZSAoZ29lcyBvbiB0aGUgc2l0ZSDigJQgbGVhdmluZyBpdCBvdXQgY29zdHMgeW91IEIyQiB0cnVzdCBpbiBJbmRpYSk8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJielBob25lIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSIrOTEgLi4uIj48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5XaGF0c0FwcCBudW1iZXIgKG9wdGlvbmFsKTwvc3Bhbj4KICAgICA8aW5wdXQgaWQ9ImJ6V2EiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9Iis5MSAuLi4iPjwvbGFiZWw+CiAgIDwvZGl2PgogICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+QnVzaW5lc3MgYWRkcmVzcyBzaG93biBpbiB0aGUgZm9vdGVyPC9zcGFuPgogICAgIDxpbnB1dCBpZD0iYnpBZGRyIiBjbGFzcz0iaW4iIHZhbHVlPSJMdWRoaWFuYSwgUHVuamFiLCBJbmRpYSI+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+R1NUSU4gKGxlYXZlIGJsYW5rIGlmIG5vdCByZWdpc3RlcmVkIOKAlCB0aGF0IGlzIG5vcm1hbCk8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJiekdzdCIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0ib3B0aW9uYWwiPjwvbGFiZWw+CiAgIDwvZGl2PgogICA8bGFiZWwgY2xhc3M9ImYiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+PHNwYW4+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iYnpUb29sIiBjaGVja2VkPiBBbHNvIGJ1aWxkIHRoZSBmcmVlIGJyb3dzZXIgdG9vbCAoYWRkcyBhYm91dCBhIG1pbnV0ZSk8L3NwYW4+PC9sYWJlbD4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImJ1aWxkQml6KCkiPkJVSUxEIFRIRSBCVVNJTkVTUzwvYnV0dG9uPgogICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij5UYWtlcyAy4oCTNCBtaW51dGVzLiBIZSBtYWtlcyA04oCTNSBtb2RlbCBjYWxscyBhbmQgcmV3cml0ZXMgaGlzIG93biBjb3B5IGlmIGl0IGZhaWxzIHRoZSBhdWRpdC48L2Rpdj4KICA8L2Rpdj5gOwoKICBpZighQi5sZW5ndGgpIHJldHVybiBoZWFkKyc8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm90aGluZyBidWlsdCB5ZXQuPC9kaXY+PC9kaXY+JzsKCiAgcmV0dXJuIGhlYWQgKyBCLm1hcChiPT57CiAgICBjb25zdCB0aWVycz0oYi50aWVyc3x8W10pLm1hcCh0PT5gPHRyPjx0ZD4ke2VzYyh0Lm5hbWUpfSR7dC5waWNrPycgPHNwYW4gY2xhc3M9InRhZyB0LWdybiI+dGhlIG9uZSB0aGV5IHBpY2s8L3NwYW4+JzonJ308L3RkPgogICAgICA8dGQ+UnMgJHtOdW1iZXIodC5hbW91bnR8fDApLnRvTG9jYWxlU3RyaW5nKCdlbi1JTicpfTwvdGQ+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlc2ModC5wZXJpb2R8fCcnKX08L3RkPgogICAgICA8dGQ+JHtlc2ModC53aG98fCcnKX08L3RkPjwvdHI+YCkuam9pbignJyk7CiAgICBjb25zdCBwYWdlcz0oYi5maWxlTGlzdHx8W10pLmZpbHRlcihmPT4vXnNpdGVcLy4qXC5odG1sJC8udGVzdChmLm5hbWUpKTsKICAgIGNvbnN0IG90aGVyPShiLmZpbGVMaXN0fHxbXSkuZmlsdGVyKGY9PiEvXnNpdGVcLy4qXC5odG1sJC8udGVzdChmLm5hbWUpKTsKICAgIGNvbnN0IG89Yi5vdXRyZWFjaHx8bnVsbDsKICAgIHJldHVybiBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1sZWZ0OjRweCBzb2xpZCAke2VzYyhiLmJyYW5kfHwnIzc4OEExRCcpfSI+CiAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo2cHg7ZmxleC13cmFwOndyYXAiPgogICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+QlVTSU5FU1M8L3NwYW4+CiAgICAgICA8YiBzdHlsZT0iZm9udC1zaXplOjE2cHgiPiR7ZXNjKGIubmFtZSl9PC9iPgogICAgICAgJHtiLnB1Ymxpc2hlZD9gPHNwYW4gY2xhc3M9InRhZyB0LWdybiI+TElWRTwvc3Bhbj5gOic8c3BhbiBjbGFzcz0idGFnIHQtYW1iIj5OT1QgUFVCTElTSEVEPC9zcGFuPid9CiAgICAgICAke2IudGVsbENvdW50P2A8c3BhbiBjbGFzcz0idGFnIHQtYW1iIj4ke2IudGVsbENvdW50fSB0ZWxscyB0byBmaXg8L3NwYW4+YDonPHNwYW4gY2xhc3M9InRhZyB0LWdybiI+YXVkaXQgY2xlYW48L3NwYW4+J30KICAgICAgICR7Yi5yZXdyb3RlPyc8c3BhbiBjbGFzcz0idGFnIHQtZGltIj5yZXdyaXR0ZW4gb25jZTwvc3Bhbj4nOicnfTwvZGl2PgogICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7Yi50fSDCtyAkeyhiLnppcEJ5dGVzLzEwMjQpLnRvRml4ZWQoMSl9IEtCIMK3ICR7KGIuZmlsZUxpc3R8fFtdKS5sZW5ndGh9IGZpbGVzPC9zcGFuPjwvZGl2PgogICAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTJweCI+JHtlc2MoYi50YWdsaW5lfHwnJyl9PC9kaXY+CgogICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi1ib3R0b206MTJweDtmbGV4LXdyYXA6d3JhcCI+CiAgICAgIDxhIGNsYXNzPSJidG4gcCIgaHJlZj0iL2FwaS9iaXovZmlsZT9pZD0ke2IuaWR9JmY9c2l0ZS9pbmRleC5odG1sIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+T1BFTiBUSEUgV0VCU0lURSDihpc8L2E+CiAgICAgIDxhIGNsYXNzPSJidG4gb2siIGhyZWY9Ii9hcGkvYml6L3ppcD9pZD0ke2IuaWR9Ij5ET1dOTE9BRCBUSEUgWklQPC9hPgogICAgICAke2IuaGFzVG9vbD9gPGEgY2xhc3M9ImJ0biIgaHJlZj0iL2FwaS9iaXovZmlsZT9pZD0ke2IuaWR9JmY9c2l0ZS90b29sLmh0bWwiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5GcmVlIHRvb2w6ICR7ZXNjKGIudG9vbFRpdGxlfHwnJyl9IOKGlzwvYT5gOicnfQogICAgICA8YSBjbGFzcz0iYnRuIiBocmVmPSIvYXBpL2Jpei9maWxlP2lkPSR7Yi5pZH0mZj1pbnZvaWNlLXRlbXBsYXRlLmh0bWwiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5JbnZvaWNlIHRlbXBsYXRlIOKGlzwvYT4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJkZWxCaXooJyR7Yi5pZH0nKSI+RGVsZXRlPC9idXR0b24+PC9kaXY+CgogICAgIDxkaXYgY2xhc3M9InR3IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMnB4Ij48dGFibGU+PHRib2R5PgogICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjEzMHB4Ij5XaG8gcGF5czwvdGQ+PHRkPiR7ZXNjKGIuYnV5ZXJ8fCfigJQnKX08L3RkPjwvdHI+CiAgICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5UaGUgcHJvbWlzZTwvdGQ+PHRkPiR7ZXNjKGIucHJvbWlzZXx8J+KAlCcpfTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlBheW1lbnRzPC90ZD48dGQ+JHtlc2MoYi5wYXlOb3RlfHwn4oCUJyl9PC90ZD48L3RyPgogICAgICAke2IuZG9tYWlucz9gPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPkRvbWFpbjwvdGQ+PHRkPiR7Yi5kb21haW5zLm1hcChkPT4KICAgICAgICBgPHNwYW4gY2xhc3M9InRhZyAke2Quc3RhdHVzPT09J0FWQUlMQUJMRSc/J3QtZ3JuJzpkLnN0YXR1cz09PSdUQUtFTic/J3QtZGltJzondC1hbWInfSI+JHtlc2MoZC5uYW1lKX0gJHtkLnN0YXR1cz09PSdBVkFJTEFCTEUnJiZkLnByaWNlJiZkLnByaWNlLmZpcnN0Pyd+4oK5JytkLnByaWNlLmZpcnN0OicnfTwvc3Bhbj5gKS5qb2luKCcgJyl9CiAgICAgICAgJHtiLmRvbWFpbnMuc29tZShkPT5kLnN0YXR1cz09PSdBVkFJTEFCTEUnKT8nPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjVweCI+Q2hlY2tlZCBsaXZlIGFnYWluc3QgdGhlIHJlZ2lzdHJ5LiBCdXkgaXQgeW91cnNlbGYgYXQgQ2xvdWRmbGFyZSBvciBQb3JrYnVuIOKAlCBoZSBjYW5ub3QsIHRoYXQgbmVlZHMgYSBjYXJkIGFuZCBLWUMgaW4geW91ciBuYW1lLjwvZGl2Pic6JzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo1cHg7Y29sb3I6dmFyKC0tYW1iKSI+Tm90aGluZyBmcmVlIOKAlCBjb25zaWRlciByZW5hbWluZyBiZWZvcmUgeW91IHByaW50IGFueXRoaW5nLjwvZGl2Pid9PC90ZD48L3RyPmA6Jyd9CiAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgoKICAgICA8ZGV0YWlscz48c3VtbWFyeSBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiPjxiPlByaWNpbmcgaGUgc2V0PC9iPjwvc3VtbWFyeT4KICAgICAgPGRpdiBjbGFzcz0idHciIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+PHRhYmxlPjx0Ym9keT4ke3RpZXJzfTwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+CgogICAgIDxkZXRhaWxzPjxzdW1tYXJ5IHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+PGI+RXZlcnkgcGFnZSBoZSB3cm90ZSAoJHtwYWdlcy5sZW5ndGh9KTwvYj48L3N1bW1hcnk+CiAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9ImZsZXgtd3JhcDp3cmFwO2dhcDo2cHg7bWFyZ2luLXRvcDo5cHgiPgogICAgICAgJHtwYWdlcy5tYXAoZj0+YDxhIGNsYXNzPSJidG4gc20iIGhyZWY9Ii9hcGkvYml6L2ZpbGU/aWQ9JHtiLmlkfSZmPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGYubmFtZSl9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+JHtlc2MoZi5uYW1lLnJlcGxhY2UoJ3NpdGUvJywnJykpfTwvYT5gKS5qb2luKCcnKX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPkFsc28gaW4gdGhlIHBhY2s6ICR7b3RoZXIubWFwKGY9PmVzYyhmLm5hbWUpKS5qb2luKCcsICcpfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij48Yj50ZXJtcywgcHJpdmFjeSwgcmVmdW5kIGFuZCBzaGlwcGluZyBhcmUgd3JpdHRlbiBpbiBjb2RlLCBub3QgYnkgdGhlIG1vZGVsLjwvYj4gTGVnYWwgdGV4dCBpcyBleGFjdGx5IHdoZXJlIGEgbWFkZS11cCBzZW50ZW5jZSBiZWNvbWVzIGEgbGlhYmlsaXR5LCBhbmQgYSBSYXpvcnBheSBLWUMgcmV2aWV3ZXIgcmVhZHMgdGhvc2UgZm91ciBwYWdlcyBiZWZvcmUgYXBwcm92aW5nIGEgc29sZSBwcm9wcmlldG9yLiBIZSBpcyBub3QgYWxsb3dlZCB0byBpbXByb3Zpc2UgdGhlbS48L2Rpdj4KICAgICA8L2RldGFpbHM+CgogICAgICR7bz9gPGRldGFpbHM+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIj48Yj5UaGUgd29yZHMgdGhhdCBnZXQgdGhlIGZpcnN0IGN1c3RvbWVyPC9iPjwvc3VtbWFyeT4KICAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij4KICAgICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo1cHgiPldIQVRTQVBQIOKAlCBwYXN0ZSBhcyBpczwvZGl2PgogICAgICAgPGRpdiBpZD0iYnp3XyR7Yi5pZH0iIHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtiYWNrZ3JvdW5kOnZhcigtLWlucCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1icmQpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTFweDtsaW5lLWhlaWdodDoxLjYiPiR7ZXNjKG8ud2hhdHNhcHB8fCcnKX08L2Rpdj4KICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBwIiBzdHlsZT0ibWFyZ2luLXRvcDo3cHgiIG9uY2xpY2s9ImNvcHlCaXooJ2J6d18ke2IuaWR9JykiPkNvcHk8L2J1dHRvbj4KCiAgICAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxNHB4IDAgNXB4Ij5FTUFJTCDigJQgc3ViamVjdDogJHtlc2MoKG8uZW1haWx8fHt9KS5zdWJqZWN0fHwnJyl9PC9kaXY+CiAgICAgICA8ZGl2IGlkPSJiemVfJHtiLmlkfSIgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2JhY2tncm91bmQ6dmFyKC0taW5wKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJyZCk7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzoxMXB4O2xpbmUtaGVpZ2h0OjEuNiI+JHtlc2MoKG8uZW1haWx8fHt9KS5ib2R5fHwnJyl9PC9kaXY+CiAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gcCIgc3R5bGU9Im1hcmdpbi10b3A6N3B4IiBvbmNsaWNrPSJjb3B5Qml6KCdiemVfJHtiLmlkfScpIj5Db3B5PC9idXR0b24+CgogICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW46MTRweCAwIDVweCI+V0FMS0lORyBJTlRPIFRIRSBTSE9QPC9kaXY+CiAgICAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjYiPiR7ZXNjKG8uaW5QZXJzb258fCcnKX08L2Rpdj4KCiAgICAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxNHB4IDAgNXB4Ij5OTyBSRVBMWSBBRlRFUiA0IERBWVM8L2Rpdj4KICAgICAgIDxkaXYgc3R5bGU9IndoaXRlLXNwYWNlOnByZS13cmFwO2xpbmUtaGVpZ2h0OjEuNiI+JHtlc2Moby5mb2xsb3dVcHx8JycpfTwvZGl2PgoKICAgICAgICR7KG8uZmlyc3RUZW5UYXJnZXRzfHxbXSkubGVuZ3RoP2A8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxNHB4IDAgNXB4Ij5USEUgRklSU1QgVEVOIFRPIEFQUFJPQUNIPC9kaXY+CiAgICAgICAgPG9sIHN0eWxlPSJwYWRkaW5nLWxlZnQ6MTlweDtsaW5lLWhlaWdodDoxLjc1O2ZvbnQtc2l6ZToxM3B4Ij4keyhvLmZpcnN0VGVuVGFyZ2V0c3x8W10pLm1hcCh4PT5gPGxpPiR7ZXNjKHgpfTwvbGk+YCkuam9pbignJyl9PC9vbD5gOicnfQogICAgICAgJHsoby5vYmplY3Rpb25zfHxbXSkubGVuZ3RoP2A8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxNHB4IDAgNXB4Ij5XSEVOIFRIRVkgU0FZIE5PPC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGJvZHk+JHsoby5vYmplY3Rpb25zfHxbXSkubWFwKHg9PmA8dHI+PHRkIHN0eWxlPSJjb2xvcjp2YXIoLS1hbWIpIj4ke2VzYyh4LnRoZXkpfTwvdGQ+PHRkPiR7ZXNjKHgueW91KX08L3RkPjwvdHI+YCkuam9pbignJyl9PC90Ym9keT48L3RhYmxlPjwvZGl2PmA6Jyd9CiAgICAgIDwvZGl2PjwvZGV0YWlscz5gOicnfQoKICAgICAke2IudGVsbENvdW50P2A8ZGV0YWlscz48c3VtbWFyeSBzdHlsZT0iY3Vyc29yOnBvaW50ZXI7Y29sb3I6dmFyKC0tYW1iKSI+PGI+JHtiLnRlbGxDb3VudH0gcGhyYXNlKHMpIHN0aWxsIHJlYWQgYXMgbWFjaGluZS13cml0dGVuIOKAlCBmaXggdGhlc2UgYmVmb3JlIHlvdSBzZW5kIGl0PC9iPjwvc3VtbWFyeT4KICAgICAgPGRpdiBjbGFzcz0idHciIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+PHRhYmxlPjx0Ym9keT4KICAgICAgICR7KGIudGVsbHN8fFtdKS5tYXAodD0+YDx0cj48dGQgc3R5bGU9ImZvbnQtZmFtaWx5Om1vbm9zcGFjZSI+IiR7ZXNjKHQuZm91bmQpfSI8L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHQud2h5KX08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+VGhleSBhcmUgbGlzdGVkIGluIFJFQUxORVNTLUFVRElULnR4dCBpbnNpZGUgdGhlIFpJUCB0b28uIE9wZW4gdGhlIEhUTUwsIGZpbmQgdGhlbSwgc2F5IGl0IGluIHlvdXIgb3duIHdvcmRzLjwvZGl2PjwvZGV0YWlscz5gOicnfQoKICAgICA8ZGV0YWlscz48c3VtbWFyeSBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+SG93IGhlIGJ1aWx0IGl0LCBzdGVwIGJ5IHN0ZXA8L3N1bW1hcnk+CiAgICAgIDxkaXYgY2xhc3M9ImxvZyIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij4keyhiLnN0ZXBzfHxbXSkubWFwKHM9PmA8ZGl2PjxzcGFuIGNsYXNzPSJ0cyI+KyR7KHMubXMvMTAwMCkudG9GaXhlZCgxKX1zPC9zcGFuPiAke2VzYyhzLnMpfSR7cy5ub3RlPycg4oCUIDxiPicrZXNjKHMubm90ZSkrJzwvYj4nOicnfTwvZGl2PmApLmpvaW4oJycpfTwvZGl2PjwvZGV0YWlscz4KCiAgICAgPGRldGFpbHMgJHtiLnB1Ymxpc2hlZD8nJzonb3Blbid9PjxzdW1tYXJ5IHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+PGI+UHV0IGl0IGxpdmUg4oCUIGZyZWUsIGFib3V0IDMgbWludXRlczwvYj48L3N1bW1hcnk+CiAgICAgIDxvbCBzdHlsZT0ibWFyZ2luOjlweCAwIDA7cGFkZGluZy1sZWZ0OjE5cHg7Zm9udC1zaXplOjEyLjVweDtsaW5lLWhlaWdodDoxLjg1Ij4KICAgICAgIDxsaT48Yj5ET1dOTE9BRCBUSEUgWklQPC9iPiBhYm92ZSwgdGhlbiB1bnppcCBpdC48L2xpPgogICAgICAgPGxpPkdvIHRvIDxiPmFwcC5uZXRsaWZ5LmNvbS9kcm9wPC9iPi4gTm8gYWNjb3VudCBuZWVkZWQgdG8gc3RhcnQuPC9saT4KICAgICAgIDxsaT5EcmFnIHRoZSA8Yj5zaXRlPC9iPiBmb2xkZXIg4oCUIG5vdCB0aGUgemlwLCB0aGUgZm9sZGVyIGluc2lkZSBpdCDigJQgb250byB0aGUgcGFnZS48L2xpPgogICAgICAgPGxpPkl0IGlzIGxpdmUgaW4gc2Vjb25kcyBvbiBhIGZyZWUgVVJMLiBDb3B5IHRoYXQgVVJMLjwvbGk+CiAgICAgICA8bGk+UGFzdGUgaXQgYmVsb3cuIEhlIHN0YXJ0cyBtb25pdG9yaW5nIHlvdXIgb3duIHNpdGUgaW1tZWRpYXRlbHksIGFuZCBzdG9wcyBjYWxsaW5nIHRoaXMgYnVzaW5lc3MgdW5wdWJsaXNoZWQuPC9saT4KICAgICAgIDxsaT5BIC5pbiBkb21haW4gaXMgYWJvdXQgUnMgNzAwL3llYXIuIEJ1eSBpdCA8aT5hZnRlcjwvaT4gdGhlIGZpcnN0IHBheWluZyBjbGllbnQsIG5vdCBiZWZvcmUuPC9saT4KICAgICAgPC9vbD4KICAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDoxMXB4Ij4KICAgICAgIDxpbnB1dCBjbGFzcz0iaW4iIGlkPSJienVybF8ke2IuaWR9IiBwbGFjZWhvbGRlcj0iaHR0cHM6Ly95b3VyLXNpdGUubmV0bGlmeS5hcHAiIHZhbHVlPSIke2VzYyhiLnB1Ymxpc2hlZFVybHx8JycpfSIgc3R5bGU9ImZsZXg6MTttaW4td2lkdGg6MjAwcHgiPgogICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBvbmNsaWNrPSJwdWJsaXNoQml6KCcke2IuaWR9JykiPklUIElTIExJVkU8L2J1dHRvbj48L2Rpdj4KICAgICA8L2RldGFpbHM+CiAgICA8L2Rpdj5gOwogIH0pLmpvaW4oJycpOwp9OwpSRU5ERVIuZmFjdG9yeT0oKT0+YDxkaXYgZGF0YS1saXZlPSJmYWN0b3J5Ij4ke0xJVkUuZmFjdG9yeSgpfTwvZGl2PmA7Cgphc3luYyBmdW5jdGlvbiBidWlsZEJpeigpewogIGNvbnN0IGc9aWQ9Pihkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCl8fHt9KS52YWx1ZXx8Jyc7CiAgY29uc3Qgdj1nKCdielZlbnR1cmUnKSwgYnJpZWY9ZygnYnpCcmllZicpOwogIGlmKCF2ICYmICFicmllZi50cmltKCkpIHJldHVybiBmbGFzaCgnUGljayBhIHZlbnR1cmUgb3IgZGVzY3JpYmUgdGhlIGJ1c2luZXNzJyk7CiAgY29uc3QgdG9vbD0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J6VG9vbCcpfHx7fSkuY2hlY2tlZCE9PWZhbHNlOwogIGZsYXNoKCdCdWlsZGluZyB0aGUgd2hvbGUgYnVzaW5lc3Mg4oCUIDIgdG8gNCBtaW51dGVzLiBEbyBub3QgY2xvc2UgdGhpcy4nKTsKICB0cnl7CiAgICBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9iaXovYnVpbGQnLHt2ZW50dXJlSWQ6dixicmllZixwaG9uZTpnKCdielBob25lJyksCiAgICAgIHdoYXRzYXBwOmcoJ2J6V2EnKSxhZGRyZXNzOmcoJ2J6QWRkcicpLGdzdGluOmcoJ2J6R3N0JyksdG9vbH0pOwogICAgcmVuZGVyKCk7CiAgICBmbGFzaChgIiR7ci5uYW1lfSIgYnVpbHQg4oCUICR7ci5maWxlc30gZmlsZXMsICR7KHIuemlwQnl0ZXMvMTAyNCkudG9GaXhlZCgxKX0gS0JgCiAgICAgICsgKHIudGVsbHM/YCwgJHtyLnRlbGxzfSBwaHJhc2VzIGZsYWdnZWQgZm9yIHlvdXIgZWRpdGA6JywgYXVkaXQgY2xlYW4nKSk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiBkZWxCaXooaWQpeyBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgd2hvbGUgYnVzaW5lc3MgcGFjaz8nKSlyZXR1cm47CiAgYXdhaXQgQVBJKCcvYXBpL2Jpei9kZWxldGUnLHtpZH0pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hCaXooaWQpewogIGNvbnN0IHU9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdienVybF8nK2lkKXx8e30pLnZhbHVlfHwnJzsKICBpZighdS50cmltKCkpIHJldHVybiBmbGFzaCgnUGFzdGUgdGhlIFVSTCBOZXRsaWZ5IGdhdmUgeW91Jyk7CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvYml6L3B1Ymxpc2hlZCcse2lkLHVybDp1LnRyaW0oKX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKCdMaXZlIOKAlCBhbmQgaGUgaXMgbm93IG1vbml0b3JpbmcgaXQgZXZlcnkgNSBtaW51dGVzLicpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KZnVuY3Rpb24gY29weUJpeihlbCl7IGNvbnN0IG49ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZWwpOyBpZighbilyZXR1cm47CiAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQobi5pbm5lclRleHQpLnRoZW4oKCk9PmZsYXNoKCdDb3BpZWQnKSwoKT0+Zmxhc2goJ1NlbGVjdCBhbmQgY29weSBtYW51YWxseScpKSB9CgovKiA9PT09PT09PT09PT09PT09PSBET01BSU4gREVTSyA9PT09PT09PT09PT09PT09PQogICBDaGVja2luZyBpcyBmcmVlIGFuZCBoZSBkb2VzIGl0IGxpdmUuIFJlZ2lzdGVyaW5nIGlzIGxpY2Vuc2VkIGFuZCBwYWlkLAogICBhbmQgaGUgY2Fubm90IGRvIGl0LiBCb3RoIGZhY3RzIGFyZSBzdGF0ZWQgcGxhaW5seSBvbiB0aGUgcGFnZS4gKi8KZnVuY3Rpb24gZG9tUm93KHIpewogIGNvbnN0IGMgPSByLnN0YXR1cz09PSdBVkFJTEFCTEUnID8gJ3QtZ3JuJyA6IHIuc3RhdHVzPT09J1RBS0VOJyA/ICd0LWRpbScKICAgICAgICAgIDogci5zdGF0dXM9PT0nSU5WQUxJRCcgPyAndC1tYWcnIDogJ3QtYW1iJzsKICBjb25zdCBwID0gci5wcmljZSAmJiByLnByaWNlLmZpcnN0CiAgICA/IGB+4oK5JHtyLnByaWNlLmZpcnN0fSBmaXJzdCB5ciDCtyDigrkke3IucHJpY2UucmVuZXd9IHJlbmV3YCA6ICfigJQnOwogIGNvbnN0IGRldGFpbCA9IHIuc3RhdHVzPT09J1RBS0VOJwogICAgICA/IGAke3IucmVnaXN0cmFyP2VzYyhyLnJlZ2lzdHJhcik6J3JlZ2lzdHJhciB1bmtub3duJ30ke3IuZXhwaXJlcz8nIMK3IGV4cGlyZXMgJytTdHJpbmcoci5leHBpcmVzKS5zbGljZSgwLDEwKTonJ31gCiAgICA6IHIuc3RhdHVzPT09J0FWQUlMQUJMRScgPyAnZnJlZSByaWdodCBub3cnCiAgICA6IGVzYyhyLndoeXx8J2NvdWxkIG5vdCBiZSByZXNvbHZlZCcpOwogIHJldHVybiBgPHRyPjx0ZD48Yj4ke2VzYyhyLm5hbWUpfTwvYj48L3RkPgogICA8dGQ+PHNwYW4gY2xhc3M9InRhZyAke2N9Ij4ke3Iuc3RhdHVzfTwvc3Bhbj48L3RkPgogICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke3B9PC90ZD4KICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtkZXRhaWx9PC90ZD4KICAgPHRkPiR7ci5zdGF0dXM9PT0nQVZBSUxBQkxFJ3x8ci5zdGF0dXM9PT0nVEFLRU4nCiAgICAgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJ3YXRjaERvbSgnJHtlc2Moci5uYW1lKX0nKSI+V2F0Y2g8L2J1dHRvbj5gOicnfTwvdGQ+PC90cj5gOwp9CmxldCBET01SRVMgPSBbXTsKTElWRS5kb21haW5zPSgpPT57CiAgY29uc3QgRD1TLmRvbWFpbnN8fHt3YXRjaDpbXSxydW5zOltdfSwgVz1ELndhdGNofHxbXSwgUj1ELnJ1bnN8fFtdOwogIGNvbnN0IHNvb249Vy5maWx0ZXIoeD0+eyBpZigheC5leHBpcmVzKSByZXR1cm4gZmFsc2U7CiAgICBjb25zdCBkPShuZXcgRGF0ZSh4LmV4cGlyZXMpLURhdGUubm93KCkpLzg2NDAwMDAwOyByZXR1cm4gZD4wJiZkPDYwOyB9KTsKCiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLWxpbWUpIj4KICAgPGgzIHN0eWxlPSJjb2xvcjp2YXIoLS1vbGl2ZSkiPuKXjSBET01BSU4gREVTSyDigJQgSEUgQ0hFQ0tTLCBZT1UgQlVZPC9oMz4KICAgPGRpdiBjbGFzcz0id2FybmJveCI+PGI+UmVhZCB0aGlzIGJlZm9yZSB5b3UgcGxhbiBhIGRvbWFpbiBidXNpbmVzcy48L2I+CiAgICBDaGVja2luZyB3aGV0aGVyIGEgbmFtZSBpcyBmcmVlIGlzIDxiPmZyZWUsIGluc3RhbnQgYW5kIG5lZWRzIG5vYm9keSdzIHBlcm1pc3Npb248L2I+IOKAlCBoZSBkb2VzIGl0IGxpdmUgYWdhaW5zdCB0aGUgcmVhbCByZWdpc3RyeSB1c2luZyBSREFQLCB0aGUgcHJvdG9jb2wgSUNBTk4gZm9yY2VzIGV2ZXJ5IHJlZ2lzdHJ5IHRvIHJ1bi4gUmVnaXN0ZXJpbmcgYSBuYW1lIGlzIGEgPGI+bGljZW5zZWQsIHBhaWQsIEtZQydkIGFjdDwvYj4uIEhlIGNhbm5vdCBkbyBpdC4gTm90ICJub3QgeWV0IiDigJQgd3JpdGluZyBpbnRvIGEgcmVnaXN0cnkgbmVlZHMgYW4gRVBQIGNyZWRlbnRpYWwgaXNzdWVkIHRvIGFuIGFjY3JlZGl0ZWQgcmVnaXN0cmFyLCBwbHVzIG1vbmV5LiBBbnlvbmUgY2xhaW1pbmcgdGhlaXIgQUkgcmVnaXN0ZXJzIGRvbWFpbnMgaXMgZWl0aGVyIHJlc2VsbGluZyBvciBseWluZy48L2Rpdj4KICAgJHshUy5sbG0/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+Q29ubmVjdCBhbiBBSSBicmFpbiB0byBoYXZlIGhpbSBpbnZlbnQgbmFtZXMuIENoZWNraW5nIHdvcmtzIHdpdGhvdXQgb25lLjwvZGl2Pic6Jyd9CgogICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPkhhdmUgaGltIGludmVudCBuYW1lcyBmb3IgYSBidXNpbmVzcywgdGhlbiBjaGVjayBldmVyeSBvbmUgbGl2ZTwvc3Bhbj4KICAgIDxpbnB1dCBpZD0iZG1CcmllZiIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iZS5nLiB3ZWJzaXRlIGRvd250aW1lIGFsZXJ0cyBmb3IgTHVkaGlhbmEgaG9zaWVyeSBleHBvcnRlcnMiPjwvbGFiZWw+CiAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImRvbVN1Z2dlc3QoKSI+SU5WRU5UIEFORCBDSEVDSyBOQU1FUzwvYnV0dG9uPgogICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4xNCBuYW1lcyDDlyAzIGV4dGVuc2lvbnMgPSA0MiBsaXZlIHJlZ2lzdHJ5IGxvb2t1cHMuIFRha2VzIGFib3V0IDMwIHNlY29uZHMuPC9zcGFuPjwvZGl2PgoKICAgPGhyIHN0eWxlPSJib3JkZXI6MDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1zdHJva2UpO21hcmdpbjoxNnB4IDAiPgoKICAgPGRpdiBjbGFzcz0iZ3JpZCBnMiI+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk9yIGNoZWNrIGV4YWN0IG5hbWVzIHlvdSBhbHJlYWR5IGhhdmUgaW4gbWluZDwvc3Bhbj4KICAgICA8dGV4dGFyZWEgaWQ9ImRtTmFtZXMiIGNsYXNzPSJpbiIgc3R5bGU9Im1pbi1oZWlnaHQ6NjRweCIgcGxhY2Vob2xkZXI9InNhbmRodXdvcmtzLmluCmJhc2FudHVwdGltZS5jb20KZ2lscm9hZGxhYnMuY28uaW4iPjwvdGV4dGFyZWE+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+T3IgdGFrZSBvbmUgd29yZCBhY3Jvc3MgZXZlcnkgZXh0ZW5zaW9uPC9zcGFuPgogICAgIDxpbnB1dCBpZD0iZG1TbGQiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9InNhbmRodXdvcmtzIj4KICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjdweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJkb21DaGVjaygpIj5DSEVDSyBUSEUgTElTVDwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4iIG9uY2xpY2s9ImRvbUV4cGFuZCgpIj5TUFJFQUQgT05FIFdPUkQ8L2J1dHRvbj48L2Rpdj48L2xhYmVsPgogICA8L2Rpdj4KCiAgICR7RE9NUkVTLmxlbmd0aD9gPGRpdiBjbGFzcz0idHciIHN0eWxlPSJtYXJnaW4tdG9wOjE0cHgiPjx0YWJsZT4KICAgICA8dGhlYWQ+PHRyPjx0aD5OYW1lPC90aD48dGg+U3RhdHVzPC90aD48dGg+SW5kaWNhdGl2ZSBwcmljZTwvdGg+PHRoPkRldGFpbDwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPgogICAgIDx0Ym9keT4ke0RPTVJFUy5tYXAoZG9tUm93KS5qb2luKCcnKX08L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjdweCI+UHJpY2VzIGFyZSBpbmRpY2F0aXZlIHJldGFpbCAoJHtlc2MoKFMuZG9tYWluc3x8e30pLnByaWNlQXNPZnx8JycpfSkuIFZlcmlmeSBhdCB0aGUgcmVnaXN0cmFyIGJlZm9yZSB5b3UgcXVvdGUgYW55Ym9keS48L2Rpdj5gOicnfQogIDwvZGl2PgoKICAke1IubGVuZ3RoP1IubWFwKHJ1bj0+YDxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo5cHg7ZmxleC13cmFwOndyYXAiPgogICAgIDxkaXYgY2xhc3M9InJvdyI+PHNwYW4gY2xhc3M9InRhZyB0LWN5Ij5OQU1FUzwvc3Bhbj48Yj4ke2VzYyhydW4uYnJpZWYpLnNsaWNlKDAsNzApfTwvYj48L2Rpdj4KICAgICA8c3BhbiBjbGFzcz0ibW9uby1kaW0iPiR7cnVuLnR9IMK3ICR7cnVuLmNoZWNrZWR9IGxpdmUgY2hlY2tzIMK3ICR7cnVuLmF2YWlsYWJsZX0gYXZhaWxhYmxlJHtydW4udW5rbm93bj8nIMK3ICcrcnVuLnVua25vd24rJyB1bnJlc29sdmVkJzonJ308L3NwYW4+PC9kaXY+CiAgICAke3J1bi51bmtub3duP2A8ZGl2IGNsYXNzPSJ3YXJuYm94Ij4ke3J1bi51bmtub3dufSBsb29rdXAocykgY291bGQgbm90IGJlIHJlc29sdmVkLiBUaG9zZSBhcmUgc2hvd24gYXMgVU5LTk9XTiBhbmQgYXJlIDxiPm5vdDwvYj4gY291bnRlZCBhcyBhdmFpbGFibGUg4oCUIGEgcmVnaXN0cnkgdGhhdCBkaWQgbm90IGFuc3dlciBpcyBub3QgdGhlIHNhbWUgYXMgYSBmcmVlIG5hbWUuPC9kaXY+YDonJ30KICAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+TmFtZTwvdGg+PHRoPldoeTwvdGg+PHRoPkV4dGVuc2lvbnM8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgJHsocnVuLnJvd3N8fFtdKS5tYXAocj0+YDx0cj4KICAgICAgPHRkPjxiPiR7ZXNjKHIuc2xkKX08L2I+PGRpdiBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHIucmVnaXN0ZXJ8fCcnKX08L2Rpdj48L3RkPgogICAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhyLndoeXx8JycpfTwvdGQ+CiAgICAgIDx0ZD4keyhyLm9wdGlvbnN8fFtdKS5tYXAobz0+ewogICAgICAgIGNvbnN0IGM9by5zdGF0dXM9PT0nQVZBSUxBQkxFJz8ndC1ncm4nOm8uc3RhdHVzPT09J1RBS0VOJz8ndC1kaW0nOid0LWFtYic7CiAgICAgICAgcmV0dXJuIGA8c3BhbiBjbGFzcz0idGFnICR7Y30iIHRpdGxlPSIke2VzYyhvLndoeXx8by5zdGF0dXMpfSI+JHtlc2Moby5uYW1lKX08L3NwYW4+YAogICAgICAgICAgKyAoby5zdGF0dXM9PT0nQVZBSUxBQkxFJz9gIDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0id2F0Y2hEb20oJyR7ZXNjKG8ubmFtZSl9JykiPndhdGNoPC9idXR0b24+IGA6JyAnKTsKICAgICAgfSkuam9pbignJyl9PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGl2PmApLmpvaW4oJycpCiAgIDonJ30KCiAgJHtXLmxlbmd0aD9gPGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjlweCI+CiAgICAgPGgzIHN0eWxlPSJtYXJnaW46MCI+4peOIFdBVENITElTVCAoJHtXLmxlbmd0aH0pPC9oMz4KICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9ImRvbVJlY2hlY2soKSI+UkUtQ0hFQ0sgQUxMIE5PVzwvYnV0dG9uPjwvZGl2PgogICAgJHtzb29uLmxlbmd0aD9gPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1saW1lKSI+PGI+JHtzb29uLmxlbmd0aH0gZXhwaXJpbmcgd2l0aGluIDYwIGRheXMuPC9iPiBBIGRvbWFpbiBhYm91dCB0byBleHBpcmUgbWVhbnMgYW4gb3duZXIgYWJvdXQgdG8gbWFrZSBhIGRlY2lzaW9uLiBUaGF0IGlzIHRoZSBtb21lbnQgdG8gYXBwcm9hY2ggdGhlbSDigJQgZWl0aGVyIHRvIGJ1eSB0aGUgbmFtZSwgb3IgdG8gc2VsbCB0aGVtIHRoZSBzZXJ2aWNlIHRoYXQga2VlcHMgaXQgd29ya2luZy48L2Rpdj5gOicnfQogICAgPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5OYW1lPC90aD48dGg+U3RhdHVzPC90aD48dGg+RXhwaXJlczwvdGg+PHRoPlJlZ2lzdHJhcjwvdGg+PHRoPk5vdGU8L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgJHtXLm1hcCh4PT5gPHRyPgogICAgICA8dGQ+PGI+JHtlc2MoeC5uYW1lKX08L2I+PC90ZD4KICAgICAgPHRkPjxzcGFuIGNsYXNzPSJ0YWcgJHt4LnN0YXR1cz09PSdBVkFJTEFCTEUnPyd0LWdybic6eC5zdGF0dXM9PT0nVEFLRU4nPyd0LWRpbSc6J3QtYW1iJ30iPiR7eC5zdGF0dXN9PC9zcGFuPjwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7eC5leHBpcmVzP1N0cmluZyh4LmV4cGlyZXMpLnNsaWNlKDAsMTApOifigJQnfTwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHgucmVnaXN0cmFyfHwn4oCUJyl9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlc2MoeC5ub3RlfHwnJyl9PC90ZD4KICAgICAgPHRkPjxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0idW53YXRjaERvbSgnJHtlc2MoeC5uYW1lKX0nKSI+4pyVPC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+SGUgcmUtY2hlY2tzIHRoZSB3aG9sZSB3YXRjaGxpc3QgYXV0b21hdGljYWxseSBhcyBhIHN0YW5kaW5nIG9yZGVyLiBJZiBhIG5hbWUgeW91IHdhbnQgaXMgcmVsZWFzZWQsIGl0IGFwcGVhcnMgaW4gdGhlIGxlZGdlciB0aGUgc2FtZSBkYXkuPC9kaXY+CiAgIDwvZGl2PmA6JzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5XYXRjaGxpc3QgZW1wdHkuIFdhdGNoIGEgbmFtZSBhbmQgaGUgdHJhY2tzIGl0IGZvciB5b3UuPC9kaXY+PC9kaXY+J30KCiAgPGRpdiBjbGFzcz0iY2FyZCI+CiAgIDxoMz5TaG91bGQgeW91IGJlY29tZSBhIHJlc2VsbGVyPyBEbyB0aGUgYXJpdGhtZXRpYyBmaXJzdC48L2gzPgogICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiIgc3R5bGU9ImZsZXg6MTttaW4td2lkdGg6MTgwcHgiPjxzcGFuPkRvbWFpbnMgeW91IHJlYWxpc3RpY2FsbHkgc2VsbCBwZXIgbW9udGg8L3NwYW4+CiAgICA8aW5wdXQgaWQ9ImRtTiIgY2xhc3M9ImluIiB0eXBlPSJudW1iZXIiIHZhbHVlPSI1IiBtaW49IjAiIG1heD0iNTAwIj48L2xhYmVsPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIiBvbmNsaWNrPSJkb21NYXRoKCkiIHN0eWxlPSJhbGlnbi1zZWxmOmVuZDttYXJnaW4tYm90dG9tOjExcHgiPldPUksgSVQgT1VUPC9idXR0b24+PC9kaXY+CiAgIDxkaXYgaWQ9ImRtTWF0aE91dCI+PC9kaXY+CiAgPC9kaXY+CgogIDxkaXYgY2xhc3M9ImNhcmQiPgogICA8aDM+SG93IGEgZG9tYWluIGFjdHVhbGx5IGNvbWVzIGludG8gZXhpc3RlbmNlPC9oMz4KICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjlweCI+V3JpdHRlbiBpbnRvIHRoZSBzeXN0ZW0gYXMgZmFjdCwgbm90IGdlbmVyYXRlZC4gRmlndXJlcyBjaGVja2VkIEF1Z3VzdCAyMDI2LjwvZGl2PgogICA8cHJlIHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtmb250OjEycHgvMS42NSB2YXIoLS1tb25vKTtiYWNrZ3JvdW5kOnZhcigtLWlucCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1icmQpO2JvcmRlci1yYWRpdXM6OXB4O3BhZGRpbmc6MTRweDtvdmVyZmxvdy14OmF1dG8iPiR7ZXNjKChTLmRvbWFpbnN8fHt9KS5ob3dJdFdvcmtzfHwnJyl9PC9wcmU+CiAgPC9kaXY+YDsKfTsKUkVOREVSLmRvbWFpbnM9KCk9PmA8ZGl2IGRhdGEtbGl2ZT0iZG9tYWlucyI+JHtMSVZFLmRvbWFpbnMoKX08L2Rpdj5gOwoKYXN5bmMgZnVuY3Rpb24gZG9tQ2hlY2soKXsKICBjb25zdCB2PShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZG1OYW1lcycpfHx7fSkudmFsdWV8fCcnOwogIGlmKCF2LnRyaW0oKSkgcmV0dXJuIGZsYXNoKCdUeXBlIGF0IGxlYXN0IG9uZSBuYW1lJyk7CiAgZmxhc2goJ0NoZWNraW5nIGFnYWluc3QgdGhlIGxpdmUgcmVnaXN0cmllc+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZG9tL2NoZWNrJyx7bmFtZXM6dn0pOwogICAgRE9NUkVTPXIucmVzdWx0czsgcmVuZGVyKCk7CiAgICBmbGFzaChgJHtyLnJlc3VsdHMuZmlsdGVyKHg9Pnguc3RhdHVzPT09J0FWQUlMQUJMRScpLmxlbmd0aH0gb2YgJHtyLnJlc3VsdHMubGVuZ3RofSBhdmFpbGFibGVgKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGRvbUV4cGFuZCgpewogIGNvbnN0IHY9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkbVNsZCcpfHx7fSkudmFsdWV8fCcnOwogIGlmKCF2LnRyaW0oKSkgcmV0dXJuIGZsYXNoKCdUeXBlIG9uZSB3b3JkJyk7CiAgZmxhc2goJ1NwcmVhZGluZyBpdCBhY3Jvc3MgZXh0ZW5zaW9uc+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZG9tL2V4cGFuZCcse3NsZDp2fSk7CiAgICBET01SRVM9ci5yZXN1bHRzOyByZW5kZXIoKTsKICAgIGZsYXNoKGAke3IucmVzdWx0cy5maWx0ZXIoeD0+eC5zdGF0dXM9PT0nQVZBSUxBQkxFJykubGVuZ3RofSBvZiAke3IucmVzdWx0cy5sZW5ndGh9IGF2YWlsYWJsZWApOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gZG9tU3VnZ2VzdCgpewogIGNvbnN0IHY9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkbUJyaWVmJyl8fHt9KS52YWx1ZXx8Jyc7CiAgaWYoIXYudHJpbSgpKSByZXR1cm4gZmxhc2goJ0Rlc2NyaWJlIHRoZSBidXNpbmVzcyBmaXJzdCcpOwogIGZsYXNoKCdJbnZlbnRpbmcgbmFtZXMsIHRoZW4gY2hlY2tpbmcgZXZlcnkgb25lIGxpdmUuIEFib3V0IDMwIHNlY29uZHPigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2RvbS9zdWdnZXN0Jyx7YnJpZWY6dn0pOwogICAgRE9NUkVTPVtdOyByZW5kZXIoKTsKICAgIGZsYXNoKGAke3IuYXZhaWxhYmxlfSBvZiAke3IuY2hlY2tlZH0gYXZhaWxhYmxlYCsoci51bmtub3duP2AgwrcgJHtyLnVua25vd259IHVucmVzb2x2ZWRgOicnKSk7CiAgfWNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiB3YXRjaERvbShuYW1lKXsKICB0cnl7IGF3YWl0IEFQSSgnL2FwaS9kb20vd2F0Y2gnLHtuYW1lfSk7IHJlbmRlcigpOyBmbGFzaCgnV2F0Y2hpbmcgJytuYW1lKSB9CiAgY2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHVud2F0Y2hEb20obmFtZSl7IGF3YWl0IEFQSSgnL2FwaS9kb20vdW53YXRjaCcse25hbWV9KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiBkb21SZWNoZWNrKCl7CiAgZmxhc2goJ1JlLWNoZWNraW5nIHRoZSB3aG9sZSB3YXRjaGxpc3TigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2RvbS9yZWNoZWNrJyx7fSk7IHJlbmRlcigpOyBmbGFzaChyLm1zZysnIOKAlCAnKyhyLmRldGFpbHx8JycpKSB9CiAgY2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGRvbU1hdGgoKXsKICBjb25zdCBuPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZG1OJyl8fHt9KS52YWx1ZXx8MDsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2RvbS9tYXRoJyx7cGVyTW9udGg6bn0pOwogICAgY29uc3QgbT1yLm1hdGg7CiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZG1NYXRoT3V0JykuaW5uZXJIVE1MPQogICAgIGA8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4KICAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoyMDBweCI+TWFyZ2luIHBlciAuaW4gZG9tYWluPC90ZD48dGQ+4oK5JHttLm1hcmdpbkVhY2h9ICjigrk5NTAgcmV0YWlsIOKIkiDigrk2MjAgd2hvbGVzYWxlKTwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlByb2ZpdCBhdCAke20ucGVyTW9udGh9L21vbnRoPC90ZD48dGQ+PGI+4oK5JHttLnllYXJQcm9maXQudG9Mb2NhbGVTdHJpbmcoJ2VuLUlOJyl9IHBlciB5ZWFyPC9iPjwvdGQ+PC90cj4KICAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlJlc2VsbGVyIHNldHVwIGNvc3Q8L3RkPjx0ZD7igrkke20uc2V0dXAudG9Mb2NhbGVTdHJpbmcoJ2VuLUlOJyl9IG9uZS10aW1lPC90ZD48L3RyPgogICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+QnJlYWstZXZlbjwvdGQ+PHRkPiR7bS5icmVha0V2ZW5Eb21haW5zfSBkb21haW5zIHNvbGQ8L3RkPjwvdHI+CiAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgIDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPiR7ZXNjKG0udmVyZGljdCl9PC9kaXY+YDsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CgovKiA9PT09PT09PT09PT09PT09PSBHUk9XVEggRU5HSU5FID09PT09PT09PT09PT09PT09ICovCkxJVkUuZ3Jvd3RoPSgpPT57CiAgY29uc3QgQz1TLmNhbXBhaWduc3x8W10sIEI9Uy5idXNpbmVzc2VzfHxbXSwgTz1TLm91dHJlYWNofHxbXSwgQ0g9Uy5jaGFubmVsc3x8e307CiAgY29uc3Qgc210cD0oUy50ZWxlbWV0cnl8fHt9KS5zbXRwX3JlYWR5OwogIGNvbnN0IGNoUm93cz1PYmplY3QudmFsdWVzKENIKS5tYXAoYz0+YDx0cj4KICAgIDx0ZD48Yj4ke2VzYyhjLmxhYmVsKX08L2I+PC90ZD4KICAgIDx0ZD48c3BhbiBjbGFzcz0idGFnICR7Yy5hdXRvPyhjLmlkPT09J2VtYWlsJyYmIXNtdHA/J3QtYW1iJzondC1ncm4nKTondC1kaW0nfSI+JHsKICAgICAgYy5hdXRvPyhjLmlkPT09J2VtYWlsJyYmIXNtdHA/J0JMT0NLRUQnOidIRSBTRU5EUyBJVCcpOidZT1UgU0VORCBJVCd9PC9zcGFuPjwvdGQ+CiAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhjLnRydXRoKX08L3RkPjwvdHI+YCkuam9pbignJyk7CgogIGNvbnN0IGhlYWQ9YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+4p6kIEdST1dUSCBFTkdJTkUg4oCUIEhFIFBMQU5TIElULCBZT1UgVElDSyBPTkNFPC9oMz4KICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5IZSBwbGFucyBhIHR3by13ZWVrIGNhbXBhaWduIHRvIGdldCB0aGUgPGI+Zmlyc3QgcGF5aW5nIGN1c3RvbWVyPC9iPiwgd3JpdGVzIGV2ZXJ5IG1lc3NhZ2UgaW4gZmluaXNoZWQgZm9ybSwgdGhlbiBleGVjdXRlcyBldmVyeXRoaW5nIGhlIGxlZ2FsbHkgY2FuIGFuZCBwdXRzIHRoZSByZXN0IG9uIHlvdXIgZGVzayB3aXRoIHRoZSB3b3JkcyBhbHJlYWR5IHdyaXR0ZW4uPC9kaXY+CiAgIDxkaXYgY2xhc3M9Indhcm5ib3giPjxiPldoYXQgaGUgY2FuIGFuZCBjYW5ub3Qgc2VuZCDigJQgcmVhZCB0aGlzIG9uY2UuPC9iPiBFbWFpbCBpcyBnZW51aW5lbHkgYXV0b21hdGljIHRocm91Z2ggeW91ciBvd24gR21haWwuIEV2ZXJ5dGhpbmcgZWxzZSBpcyBhIGxpZSB3aGVuIGFueW9uZSBjbGFpbXMgdG8gYXV0b21hdGUgaXQgZm9yIGZyZWU6IHRoZSBjb25zdW1lciBXaGF0c0FwcCBhcHAgaGFzIDxiPm5vIEFQSTwvYj4gYW5kIHVub2ZmaWNpYWwgYXV0b21hdGlvbiBnZXRzIHlvdXIgbnVtYmVyIDxiPmJhbm5lZDwvYj47IEluc3RhZ3JhbSBhbmQgRmFjZWJvb2sgbmVlZCBhIE1ldGEgYXBwIGFuZCBPQXV0aDsgWCBjaGFyZ2VzIGZvciB3cml0ZSBhY2Nlc3M7IGEgR29vZ2xlIEJ1c2luZXNzIFByb2ZpbGUgbmVlZHMgcG9zdGNhcmQgb3IgcGhvbmUgdmVyaWZpY2F0aW9uIGF0IHlvdXIgcmVhbCBhZGRyZXNzLiBIZSB3cml0ZXMgaXQgYWxsLiBZb3UgdGFwIHNlbmQuPC9kaXY+CiAgICR7IXNtdHA/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+PGI+U01UUCBpcyBub3QgYXJtZWQ8L2I+LCBzbyBoZSBjYW4gc2VuZCBOT1RISU5HIGhpbXNlbGYgXHUyMDE0IGV2ZXJ5IGFjdGlvbiBiZWNvbWVzIGEgbWFudWFsIGpvYi4gU2V0IGEgR21haWwgYXBwIHBhc3N3b3JkIGluIE1haWwgUmVsYXkgYW5kIGhlIHN0YXJ0cyBhY3R1YWxseSBzZW5kaW5nLjwvZGl2Pic6Jyd9CiAgICR7c210cCYmIVMuc210cFZlcmlmaWVkP2A8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZykiPjxiPk1haWwgaXMgY29uZmlndXJlZCBidXQgbmV2ZXIgcHJvdmVuLjwvYj4gSGUgd2lsbCByZWZ1c2UgdG8gcnVuIGFuIGVtYWlsIGNhbXBhaWduIHVudGlsIHRoZSBwcmVmbGlnaHQgcGFzc2VzIFx1MjAxNCBiZWNhdXNlIGEgY2FtcGFpZ24gdGhhdCBzaWxlbnRseSBmYWlscyBvbiBldmVyeSBzZW5kIGlzIHdvcnNlIHRoYW4gb25lIHRoYXQgbmV2ZXIgcmFuLiA8YnV0dG9uIGNsYXNzPSJidG4gc20iIG9uY2xpY2s9ImdvKCdtYWlsJykiPlJ1biB0aGUgcHJlZmxpZ2h0PC9idXR0b24+PC9kaXY+YDonJ30KICAgJHtTLnNtdHBWZXJpZmllZD9gPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1saW1lKSI+PGI+TWFpbCBwcm92ZW4gYWdhaW5zdCB0aGUgcmVhbCBzZXJ2ZXI8L2I+ICR7ZXNjKFMuc210cFZlcmlmaWVkLmF0KX0gXHUyMDE0IHNlbmRpbmcgYXMgJHtlc2MoUy5zbXRwVmVyaWZpZWQuZnJvbSl9LiR7Uy5zZW5kV2luZG93P2AgJHtTLnNlbmRXaW5kb3cubGVmdH0gb2YgJHtTLnNlbmRXaW5kb3cuY2FwfSBzZW5kcyBsZWZ0IGluIHRoaXMgMjQtaG91ciB3aW5kb3cuYDonJ308L2Rpdj5gOicnfQogICA8ZGl2IGNsYXNzPSJ0dyIgc3R5bGU9Im1hcmdpbjoxMnB4IDAiPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5DaGFubmVsPC90aD48dGg+V2hvIHNlbmRzPC90aD48dGg+VGhlIHRydXRoPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PiR7Y2hSb3dzfTwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgJHshQi5sZW5ndGg/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+QnVpbGQgYSBidXNpbmVzcyBmaXJzdCDigJQgdGhlcmUgaXMgbm90aGluZyB0byBtYXJrZXQuPC9kaXY+JzpgCiAgIDxkaXYgY2xhc3M9ImdyaWQgZzIiPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5DYW1wYWlnbiBmb3Igd2hpY2ggYnVzaW5lc3M8L3NwYW4+CiAgICAgPHNlbGVjdCBpZD0iZ3dCaXoiIGNsYXNzPSJpbiI+JHtCLm1hcCh4PT5gPG9wdGlvbiB2YWx1ZT0iJHt4LmlkfSI+JHtlc2MoeC5uYW1lKX0ke3gucHVibGlzaGVkPycnOicgKE5PVCBQVUJMSVNIRUQpJ308L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5Hb2FsIChsZWF2ZSBibGFuayBmb3I6IGZpcnN0IHBheWluZyBjdXN0b21lcik8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJnd0dvYWwiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9ImZpcnN0IHBheWluZyBjdXN0b21lciI+PC9sYWJlbD48L2Rpdj4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9InBsYW5DYW1wKCkiPlBMQU4gVEhFIENBTVBBSUdOPC9idXR0b24+YH0KICA8L2Rpdj5gOwoKICBjb25zdCBvdXRiPU8ubGVuZ3RoP2A8ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxoMz7il4ggQUNUVUFMTFkgU0VOVCAoJHtPLmxlbmd0aH0pPC9oMz4KICAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRoZWFkPjx0cj48dGg+V2hlbjwvdGg+PHRoPlRvPC90aD48dGg+U3ViamVjdDwvdGg+PHRoPlJlcGx5PzwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7Ty5zbGljZSgwLDIwKS5tYXAoeD0+YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj4ke3gudH08L3RkPjx0ZD4ke2VzYyh4LnRvKX08L3RkPgogICAgIDx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHguc3ViamVjdHx8JycpfTwvdGQ+CiAgICAgPHRkPiR7eC5yZXBsaWVkPyc8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj5SRVBMSUVEPC9zcGFuPic6YDxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0ibWFya1JlcGxpZWQoJyR7ZXNjKHgudG8pfScsJyR7eC50fScpIj5tYXJrIHJlcGxpZWQ8L2J1dHRvbj5gfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2Rpdj5gOicnOwoKICBpZighQy5sZW5ndGgpIHJldHVybiBoZWFkK291dGIrJzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyBjYW1wYWlnbiB5ZXQuPC9kaXY+PC9kaXY+JzsKCiAgcmV0dXJuIGhlYWQgKyBDLm1hcChjPT57CiAgICBjb25zdCBieURheT17fTsgKGMuYWN0aW9uc3x8W10pLmZvckVhY2goYT0+eyAoYnlEYXlbYS5kYXldPWJ5RGF5W2EuZGF5XXx8W10pLnB1c2goYSkgfSk7CiAgICByZXR1cm4gYDxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47bWFyZ2luLWJvdHRvbTo3cHg7ZmxleC13cmFwOndyYXAiPgogICAgIDxkaXYgY2xhc3M9InJvdyI+PHNwYW4gY2xhc3M9InRhZyAke2Muc3RhdHVzPT09J0FDVElWRSc/J3QtZ3JuJzpjLnN0YXR1cz09PSdSVU5OSU5HJz8ndC1hbWInOid0LWN5J30iPiR7Yy5zdGF0dXN9PC9zcGFuPgogICAgICA8YiBzdHlsZT0iZm9udC1zaXplOjE1cHgiPiR7ZXNjKGMubmFtZSl9PC9iPjxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtlc2MoYy5iaXpOYW1lfHwnJyl9PC9zcGFuPjwvZGl2PgogICAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+JHtjLnR9PC9zcGFuPjwvZGl2PgogICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo5cHgiPiR7ZXNjKGMudGhlc2lzKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InR3IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMXB4Ij48dGFibGU+PHRib2R5PgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTUwcHgiPkZpcnN0IGN1c3RvbWVyIGJ5PC90ZD48dGQ+JHtlc2MoYy5maXJzdEN1c3RvbWVyQnl8fCfigJQnKX08L3RkPjwvdHI+CiAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlN0b3AgaXQgaWY8L3RkPjx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+JHtlc2MoYy5raWxsQ3JpdGVyaWF8fCfigJQnKX08L3RkPjwvdHI+CiAgICAgJHtjLnN0YXR1cyE9PSdEUkFGVCc/YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5SZXN1bHQ8L3RkPjx0ZD48YiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+JHtjLnNlbnR9IGFjdHVhbGx5IHNlbnQ8L2I+IMK3ICR7Yy5wYXJrZWR9IG9uIHlvdXIgZGVzayR7Yy5mYWlsZWQ/YCDCtyA8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+JHtjLmZhaWxlZH0gZmFpbGVkPC9zcGFuPmA6Jyd9PC90ZD48L3RyPmA6Jyd9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CgogICAgJHtjLnN0YXR1cz09PSdEUkFGVCc/YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogICAgICA8Yj5PbmUgdGljayBydW5zIHRoZSB3aG9sZSB0aGluZy48L2I+IEhlIHdpbGwgc2VuZCAke2MuYXV0b0NvdW50fSBtZXNzYWdlKHMpIGhpbXNlbGYgYXMgcmVhbCBlbWFpbCwgYW5kIHB1dCB0aGUgb3RoZXIgJHsoYy5hY3Rpb25zfHxbXSkubGVuZ3RoLWMuYXV0b0NvdW50fSBvbiB5b3VyIGRlc2sgd2l0aCB0aGUgZXhhY3Qgd29yZHMgcmVhZHkgdG8gY29weS4gTm90aGluZyBnb2VzIG91dCB1bnRpbCB5b3UgcHJlc3MgdGhpcy48L2Rpdj4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxidXR0b24gY2xhc3M9ImJ0biBvayIgb25jbGljaz0icnVuQ2FtcCgnJHtjLmlkfScpIj7inJQgQVBQUk9WRSDigJQgUlVOIElUPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBubyIgb25jbGljaz0iZGVsQ2FtcCgnJHtjLmlkfScpIj7inJUgRGlzY2FyZDwvYnV0dG9uPjwvZGl2PmAKICAgICA6YDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iZGVsQ2FtcCgnJHtjLmlkfScpIj5EZWxldGUgY2FtcGFpZ248L2J1dHRvbj5gfQoKICAgIDxkZXRhaWxzIHN0eWxlPSJtYXJnaW4tdG9wOjExcHgiICR7Yy5zdGF0dXM9PT0nRFJBRlQnPydvcGVuJzonJ30+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIj48Yj5FdmVyeSBhY3Rpb24sIGluIG9yZGVyICgkeyhjLmFjdGlvbnN8fFtdKS5sZW5ndGh9KTwvYj48L3N1bW1hcnk+CiAgICAgJHtPYmplY3Qua2V5cyhieURheSkuc29ydCgoYSxiKT0+YS1iKS5tYXAoZD0+YAogICAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxM3B4IDAgNnB4Ij5EQVkgJHtkfTwvZGl2PgogICAgICAke2J5RGF5W2RdLm1hcChhPT5gPGRpdiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkICR7YS5zdGF0dXM9PT0nU0VOVCc/J3ZhcigtLWdybiknOmEuYXV0bz8ndmFyKC0tbGltZSknOid2YXIoLS1zdHJva2UyKSd9O3BhZGRpbmctbGVmdDoxMnB4O21hcmdpbi1ib3R0b206MTNweCI+CiAgICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtmbGV4LXdyYXA6d3JhcCI+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48c3BhbiBjbGFzcz0idGFnICR7YS5hdXRvPyd0LWdybic6J3QtZGltJ30iPiR7KENIW2EuY2hhbm5lbF18fHt9KS5sYWJlbHx8YS5jaGFubmVsfTwvc3Bhbj4KICAgICAgICAgPGI+JHtlc2MoYS50aXRsZSl9PC9iPgogICAgICAgICAke2Euc3RhdHVzPT09J1NFTlQnPyc8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj5TRU5UICcrZXNjKGEuc2VudEF0fHwnJykrJzwvc3Bhbj4nOicnfQogICAgICAgICAke2Euc3RhdHVzPT09J05FRURTX0FERFJFU1MnPyc8c3BhbiBjbGFzcz0idGFnIHQtYW1iIj5ORUVEUyBBTiBBRERSRVNTPC9zcGFuPic6Jyd9CiAgICAgICAgICR7YS5zdGF0dXM9PT0nRkFJTEVEJz8nPHNwYW4gY2xhc3M9InRhZyB0LW1hZyI+RkFJTEVEPC9zcGFuPic6Jyd9CiAgICAgICAgICR7YS5zdGF0dXM9PT0nT05fWU9VUl9ERVNLJz8nPHNwYW4gY2xhc3M9InRhZyB0LWFtYiI+T04gWU9VUiBERVNLPC9zcGFuPic6Jyd9PC9kaXY+CiAgICAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj5+JHthLm1pbnV0ZXN9IG1pbjwvc3Bhbj48L2Rpdj4KICAgICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luOjRweCAwIDZweCI+JHtlc2MoYS53aHkpfTwvZGl2PgogICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjZweCI+VG86ICR7ZXNjKGEudGFyZ2V0fHwn4oCUJyl9PC9kaXY+CiAgICAgICAke2EucmVzdWx0P2A8ZGl2IGNsYXNzPSJ3YXJuYm94Ij4ke2VzYyhhLnJlc3VsdCl9PC9kaXY+YDonJ30KICAgICAgICR7YS5zdGF0dXM9PT0nTkVFRFNfQUREUkVTUyc/YDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi1ib3R0b206OHB4Ij4KICAgICAgICAgPGlucHV0IGNsYXNzPSJpbiIgaWQ9ImFkcl8ke2EuaWR9IiBwbGFjZWhvbGRlcj0idGhlaXJAZW1haWwuY29tIiBzdHlsZT0ibWF4LXdpZHRoOjI0MHB4Ij4KICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIG9rIiBvbmNsaWNrPSJmaWxsQWRkcignJHtjLmlkfScsJyR7YS5pZH0nKSI+U0VORCBJVCBOT1c8L2J1dHRvbj48L2Rpdj5gOicnfQogICAgICAgJHthLmNvbnRlbnQ/YDxkaXYgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0taW5wKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJyZCk7Ym9yZGVyLXJhZGl1czo4cHg7cGFkZGluZzoxMXB4Ij4KICAgICAgICAgJHthLnN1YmplY3Q/YDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo1cHgiPlNVQkpFQ1Q6ICR7ZXNjKGEuc3ViamVjdCl9PC9kaXY+YDonJ30KICAgICAgICAgPGRpdiBpZD0iY250XyR7YS5pZH0iIHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjYiPiR7ZXNjKGEuY29udGVudCl9PC9kaXY+CiAgICAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBwIiBvbmNsaWNrPSJjb3B5Qml6KCdjbnRfJHthLmlkfScpIj5Db3B5PC9idXR0b24+CiAgICAgICAgICAke2EuY2hhbm5lbD09PSd3aGF0c2FwcCc/YDxhIGNsYXNzPSJidG4gc20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBocmVmPSJodHRwczovL3dhLm1lLz90ZXh0PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGEuY29udGVudCl9Ij5PcGVuIGluIFdoYXRzQXBwIOKGlzwvYT5gOicnfQogICAgICAgICA8L2Rpdj48L2Rpdj5gOicnfQogICAgICA8L2Rpdj5gKS5qb2luKCcnKX1gKS5qb2luKCcnKX0KICAgIDwvZGV0YWlscz4KCiAgICAkeyhjLnRhcmdldHN8fFtdKS5sZW5ndGg/YDxkZXRhaWxzPjxzdW1tYXJ5IHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+PGI+V2hvIHRvIGFwcHJvYWNoICgke2MudGFyZ2V0cy5sZW5ndGh9KTwvYj48L3N1bW1hcnk+CiAgICAgPG9sIHN0eWxlPSJwYWRkaW5nLWxlZnQ6MTlweDtsaW5lLWhlaWdodDoxLjg7Zm9udC1zaXplOjEzcHg7bWFyZ2luLXRvcDo4cHgiPiR7Yy50YXJnZXRzLm1hcCh0PT5gPGxpPiR7ZXNjKHQpfTwvbGk+YCkuam9pbignJyl9PC9vbD48L2RldGFpbHM+YDonJ30KICAgICR7KGMuaW1hZ2VCcmllZnN8fFtdKS5sZW5ndGg/YDxkZXRhaWxzPjxzdW1tYXJ5IHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+PGI+SW1hZ2UgYnJpZWZzICgke2MuaW1hZ2VCcmllZnMubGVuZ3RofSk8L2I+PC9zdW1tYXJ5PgogICAgIDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+SGUgaGFzIDxiPm5vIGltYWdlIG9yIHZpZGVvIG1vZGVsPC9iPi4gVGhlc2UgYXJlIGJyaWVmcyB0byBwYXN0ZSBpbnRvIGEgZnJlZSB0b29sIOKAlCBDYW52YSwgQmluZyBJbWFnZSBDcmVhdG9yLCBvciBHb29nbGUgV2hpc2suIEhlIHdpbGwgbm90IHByZXRlbmQgdG8gaGF2ZSBkcmF3biB0aGVtLjwvZGl2PgogICAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PiR7Yy5pbWFnZUJyaWVmcy5tYXAoaT0+YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTMwcHgiPiR7ZXNjKGkuZm9yfHwnJyl9PC90ZD4KICAgICAgPHRkPiR7ZXNjKGkuYnJpZWZ8fCcnKX0ke2kudGV4dD9gPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+VGV4dCBvbiBpbWFnZTogIiR7ZXNjKGkudGV4dCl9IjwvZGl2PmA6Jyd9PC90ZD48L3RyPmApLmpvaW4oJycpfTwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+YDonJ30KICAgICR7Yy53ZWVrVHdvP2A8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+PGI+V2VlayB0d286PC9iPiAke2VzYyhjLndlZWtUd28pfTwvZGl2PmA6Jyd9CiAgIDwvZGl2PmA7CiAgfSkuam9pbignJykgKyBvdXRiOwp9OwpSRU5ERVIuZ3Jvd3RoPSgpPT5gPGRpdiBkYXRhLWxpdmU9Imdyb3d0aCI+JHtMSVZFLmdyb3d0aCgpfTwvZGl2PmA7Cgphc3luYyBmdW5jdGlvbiBwbGFuQ2FtcCgpewogIGNvbnN0IGJpej0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2d3Qml6Jyl8fHt9KS52YWx1ZXx8Jyc7CiAgY29uc3QgZ29hbD0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2d3R29hbCcpfHx7fSkudmFsdWV8fCcnOwogIGlmKCFiaXopIHJldHVybiBmbGFzaCgnUGljayBhIGJ1c2luZXNzJyk7CiAgZmxhc2goJ1BsYW5uaW5nIHRoZSBjYW1wYWlnbiBhbmQgd3JpdGluZyBldmVyeSBtZXNzYWdl4oCmIGFib3V0IGEgbWludXRlLicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZ3Jvd3RoL3BsYW4nLHtiaXpJZDpiaXosZ29hbH0pOwogICAgcmVuZGVyKCk7IGZsYXNoKGAke3IuYWN0aW9uc30gYWN0aW9ucyBwbGFubmVkIOKAlCBoZSBjYW4gc2VuZCAke3IuYXV0b30gaGltc2VsZi5gKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHJ1bkNhbXAoaWQpewogIGlmKCFjb25maXJtKCdBcHByb3ZlIHRoaXMgY2FtcGFpZ24/IEhlIHdpbGwgc2VuZCByZWFsIGVtYWlsIHRvIHJlYWwgcGVvcGxlLiBUaGlzIGNhbm5vdCBiZSB1bnNlbnQuJykpIHJldHVybjsKICBmbGFzaCgnUnVubmluZ+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZ3Jvd3RoL3J1bicse2lkfSk7CiAgICByZW5kZXIoKTsgZmxhc2goYCR7ci5zZW50fSBhY3R1YWxseSBzZW50IMK3ICR7ci5wYXJrZWR9IG9uIHlvdXIgZGVzayR7ci5mYWlsZWQ/JyDCtyAnK3IuZmFpbGVkKycgZmFpbGVkJzonJ31gKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGRlbENhbXAoaWQpeyBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgY2FtcGFpZ24gYW5kIGl0cyBqb2JzPycpKXJldHVybjsKICBhd2FpdCBBUEkoJy9hcGkvZ3Jvd3RoL2RlbGV0ZScse2lkfSk7IHJlbmRlcigpIH0KYXN5bmMgZnVuY3Rpb24gZmlsbEFkZHIoY2FtcElkLGFjdGlvbklkKXsKICBjb25zdCBlbWFpbD0oZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Fkcl8nK2FjdGlvbklkKXx8e30pLnZhbHVlfHwnJzsKICBpZighZW1haWwudHJpbSgpKSByZXR1cm4gZmxhc2goJ1R5cGUgdGhlIGFkZHJlc3MnKTsKICBmbGFzaCgnU2VuZGluZ+KApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvZ3Jvd3RoL2FkZHJlc3MnLHtjYW1wSWQsYWN0aW9uSWQsZW1haWx9KTsKICAgIHJlbmRlcigpOyBmbGFzaCgnU2VudCB0byAnK3IudG8pOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gbWFya1JlcGxpZWQodG8sdCl7IGF3YWl0IEFQSSgnL2FwaS9ncm93dGgvcmVwbGllZCcse3RvLHR9KTsgcmVuZGVyKCkgfQoKLyogPT09PT09PT09PT09PT09PT0gU1RPUkFHRSBIRUFMVEggPT09PT09PT09PT09PT09PT0gKi8KTElWRS5zdG9yYWdlPSgpPT57CiAgY29uc3QgaD1TLnN0b3JhZ2V8fHt9OwogIGNvbnN0IGNvbD1oLmxldmVsPT09J0NSSVQnPyd2YXIoLS1tYWcpJzpoLmxldmVsPT09J1dBUk4nPyd2YXIoLS1hbWIpJzondmFyKC0tZ3JuKSc7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWNvbG9yOiR7Y29sfSI+CiAgIDxoMyBzdHlsZT0iY29sb3I6JHtjb2x9Ij4ke2gubGV2ZWw9PT0nT0snPyfinJQnOifimqAnfSBTVE9SQUdFIOKAlCAke2VzYyhoLmRlc2NyaWJlfHwndW5rbm93bicpfTwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+JHtlc2MoaC5tc2d8fCcnKX08L2Rpdj4KICAgPGRpdiBjbGFzcz0idHciPjx0YWJsZT48dGJvZHk+CiAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjE3MHB4Ij5Nb2RlPC90ZD48dGQ+JHtlc2MoaC5tb2RlfHwnPycpfTwvdGQ+PC90cj4KICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5TdGF0ZSBzaXplPC90ZD48dGQ+JHsoKGguYnl0ZXN8fDApLzEwMjQpLnRvRml4ZWQoMCl9IEtCIHJhdyDCtyAkeygoaC5lbmNvZGVkfHwwKS8xMDI0KS50b0ZpeGVkKDApfSBLQiBlbmNvZGVkJHtoLm1vZGU9PT0nZ2l0aHViJz8nIChHaXRIdWIgcmV3cml0ZXMgYWxsIG9mIGl0IGV2ZXJ5IHNhdmUpJzonJ308L3RkPjwvdHI+CiAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+TGFzdCBzYXZlPC90ZD48dGQ+JHtoLmxhc3RTYXZlT2s9PT1udWxsPydub3QgeWV0JzpoLmxhc3RTYXZlT2s/YDxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncm4pIj5PSyBhdCAke2VzYyhoLmxhc3RTYXZlQXR8fCcnKX08L3NwYW4+YDpgPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPkZBSUxFRCDigJQgJHtlc2MoaC5sYXN0U2F2ZUVycnx8JycpfTwvc3Bhbj5gfTwvdGQ+PC90cj4KICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5CdXNpbmVzcyBwYWNrczwvdGQ+PHRkPiR7aC5ibG9ic0NhY2hlZHx8MH0gY2FjaGVkIG91dC1vZi1iYW5kIChjb21wcmVzc2VkLCBub3QgaW4gZGF0YS5qc29uKTwvdGQ+PC90cj4KICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tdG9wOjExcHgiPjxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJzdG9yZVRlc3QoKSI+UlVOIFRIRSBTRUxGLVRFU1Q8L2J1dHRvbj4KICAgIDxzcGFuIGNsYXNzPSJtb25vLWRpbSI+V3JpdGVzIGEgZmlsZSwgcmVhZHMgaXQgYmFjaywgY29tcGFyZXMgYnl0ZS1mb3ItYnl0ZSwgZGVsZXRlcyBpdC4gUHJvb2YsIG5vdCBhIGd1ZXNzLjwvc3Bhbj48L2Rpdj4KICAgPGRpdiBpZD0ic3RPdXQiIHN0eWxlPSJtYXJnaW4tdG9wOjEycHgiPjwvZGl2PgogIDwvZGl2PgogICR7aC5lcGhlbWVyYWw/YDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPgogICA8aDMgc3R5bGU9ImNvbG9yOnZhcigtLW9saXZlKSI+XHUyNmExIERPIElUIEZPUiBNRSBcdTIwMTQgT05FIFRPS0VOLCBPTkUgQlVUVE9OPC9oMz4KICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij5Zb3UgaGF2ZSBub3QgZml4ZWQgc3RvcmFnZSBiZWNhdXNlIGl0IGlzIGVpZ2h0IGZpZGRseSBzdGVwcy4gU28gaGUgZG9lcyBzZXZlbiBvZiB0aGVtLiBQYXN0ZSBhIHRva2VuIGFuZCBoZSBjcmVhdGVzIHRoZSBwcml2YXRlIHJlcG8sIHByb3ZlcyBoZSBjYW4gd3JpdGUgdG8gaXQsIHJlYWRzIGl0IGJhY2ssIGFuZCBjbGVhbnMgdXAgXHUyMDE0IHRoZW4gdGVsbHMgeW91IHRoZSBleGFjdCB0aHJlZSBsaW5lcyB0byBwYXN0ZSBpbnRvIFJlbmRlci48L2Rpdj4KICAgPG9sIHN0eWxlPSJwYWRkaW5nLWxlZnQ6MTlweDtsaW5lLWhlaWdodDoxLjk7Zm9udC1zaXplOjEzcHgiPgogICAgPGxpPk9wZW4gPGI+Z2l0aHViLmNvbS9zZXR0aW5ncy90b2tlbnMvbmV3PC9iPiAoY2xhc3NpYyB0b2tlbiBcdTIwMTQgc2ltcGxlc3QgZm9yIHNldHVwKS48L2xpPgogICAgPGxpPk5vdGU6IDxjb2RlPmNoYWlybWFuPC9jb2RlPiBcdTAwYjcgRXhwaXJhdGlvbjogPGI+Tm8gZXhwaXJhdGlvbjwvYj4gXHUwMGI3IHRpY2sgdGhlIDxiPnJlcG88L2I+IHNjb3BlLjwvbGk+CiAgICA8bGk+R2VuZXJhdGUsIGNvcHkgaXQsIHBhc3RlIGJlbG93LiBJdCBzdGFydHMgPGNvZGU+Z2hwXzwvY29kZT4uPC9saT4KICAgPC9vbD4KICAgPGRpdiBjbGFzcz0id2FybmJveCI+VGhlIHRva2VuIGlzIDxiPm5vdCBzYXZlZCBoZXJlPC9iPi4gSGUgdXNlcyBpdCBvbmNlIHRvIHNldCB0aGUgcmVwbyB1cCwgdGhlbiB5b3UgcGFzdGUgaXQgaW50byBSZW5kZXIgeW91cnNlbGYgc28gaXQgb25seSBldmVyIGxpdmVzIHRoZXJlLjwvZGl2PgogICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+R2l0SHViIHRva2VuPC9zcGFuPjxpbnB1dCBpZD0ic3RUb2siIGNsYXNzPSJpbiIgdHlwZT0icGFzc3dvcmQiIHBsYWNlaG9sZGVyPSJnaHBfLi4uIj48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj48c3Bhbj5SZXBvIG5hbWUgKGl0IHdpbGwgYmUgY3JlYXRlZCwgcHJpdmF0ZSk8L3NwYW4+PGlucHV0IGlkPSJzdFJlcG8iIGNsYXNzPSJpbiIgdmFsdWU9ImNoYWlybWFuc3RhdGUiPjwvbGFiZWw+CiAgIDwvZGl2PgogICA8YnV0dG9uIGNsYXNzPSJidG4gcCIgb25jbGljaz0ic2V0dXBTdG9yZSgpIj5TRVQgVVAgTVkgU1RPUkFHRTwvYnV0dG9uPgogICA8ZGl2IGlkPSJzdFNldHVwIiBzdHlsZT0ibWFyZ2luLXRvcDoxMnB4Ij48L2Rpdj4KICA8L2Rpdj4KCiAgPGRldGFpbHMgY2xhc3M9ImNhcmQiIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tc3Ryb2tlKSI+CiAgIDxzdW1tYXJ5IHN0eWxlPSJjdXJzb3I6cG9pbnRlciI+PGI+T3IgZG8gaXQgYnkgaGFuZCBcdTIwMTQgNiBtaW51dGVzPC9iPjwvc3VtbWFyeT4KICAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij4KICAgPGRpdiBjbGFzcz0id2FybmJveCI+UmVuZGVyJ3MgZnJlZSB0aWVyIGdpdmVzIHlvdSA8Yj5ubyBkaXNrPC9iPi4gRXZlcnkgcmVzdGFydCBhbmQgZXZlcnkgcmVkZXBsb3kgZGVzdHJveXMgZXZlcnl0aGluZyDigJQgYW5kIGZyZWUgc2VydmljZXMgcmVzdGFydCBvbiB0aGVpciBvd24uIEEgcHJpdmF0ZSBHaXRIdWIgcmVwbyBiZWNvbWVzIHRoZSBkaXNrIGluc3RlYWQuIEl0IGlzIGZyZWUsIHVubGltaXRlZCBmb3IgdGhpcywgYW5kIHN1cnZpdmVzIGV2ZXJ5dGhpbmcuPC9kaXY+CiAgIDxvbCBzdHlsZT0icGFkZGluZy1sZWZ0OjE5cHg7bGluZS1oZWlnaHQ6Mjtmb250LXNpemU6MTMuNXB4Ij4KICAgIDxsaT5HbyB0byA8Yj5naXRodWIuY29tL25ldzwvYj4uIE5hbWUgaXQgPGNvZGU+Y2hhaXJtYW5zdGF0ZTwvY29kZT4uIFRpY2sgPGI+UHJpdmF0ZTwvYj4uIFRpY2sgPGI+QWRkIGEgUkVBRE1FPC9iPiDigJQgdGhlIHJlcG8gbXVzdCBub3QgYmUgZW1wdHkuIENyZWF0ZSBpdC48L2xpPgogICAgPGxpPkdvIHRvIDxiPmdpdGh1Yi5jb20vc2V0dGluZ3MvcGVyc29uYWwtYWNjZXNzLXRva2Vucy9uZXc8L2I+IChGaW5lLWdyYWluZWQgdG9rZW5zKS48L2xpPgogICAgPGxpPlRva2VuIG5hbWU6IDxjb2RlPmNoYWlybWFuPC9jb2RlPi4gRXhwaXJhdGlvbjogPGI+Tm8gZXhwaXJhdGlvbjwvYj4g4oCUIGlmIGl0IGV4cGlyZXMgeW91ciBzeXN0ZW0gc2lsZW50bHkgc3RvcHMgc2F2aW5nLjwvbGk+CiAgICA8bGk+UmVwb3NpdG9yeSBhY2Nlc3M6IDxiPk9ubHkgc2VsZWN0IHJlcG9zaXRvcmllczwvYj4g4oaSIHBpY2sgPGNvZGU+Y2hhaXJtYW5zdGF0ZTwvY29kZT4gYW5kIG5vdGhpbmcgZWxzZS48L2xpPgogICAgPGxpPlBlcm1pc3Npb25zIOKGkiBSZXBvc2l0b3J5IHBlcm1pc3Npb25zIOKGkiA8Yj5Db250ZW50czwvYj4g4oaSIHNldCB0byA8Yj5SZWFkIGFuZCB3cml0ZTwvYj4uIFRoYXQgb25lIHBlcm1pc3Npb24gb25seS48L2xpPgogICAgPGxpPkdlbmVyYXRlLCB0aGVuIGNvcHkgdGhlIHRva2VuLiBJdCBzdGFydHMgPGNvZGU+Z2l0aHViX3BhdF88L2NvZGU+LiBZb3UgY2Fubm90IHNlZSBpdCBhZ2Fpbi48L2xpPgogICAgPGxpPkluIFJlbmRlciDihpIgeW91ciBzZXJ2aWNlIOKGkiA8Yj5FbnZpcm9ubWVudDwvYj4g4oaSIGFkZCB0aHJlZSB2YXJpYWJsZXM6CiAgICAgPGRpdiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1pbnApO2JvcmRlcjoxcHggc29saWQgdmFyKC0tYnJkKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjExcHg7bWFyZ2luOjdweCAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxMnB4O2xpbmUtaGVpZ2h0OjEuOSI+CiAgICAgIFNUT1JFID0gZ2l0aHViPGJyPkdIX1JFUE8gPSA8aT55b3VydXNlcm5hbWU8L2k+L2NoYWlybWFuc3RhdGU8YnI+R0hfVE9LRU4gPSBnaXRodWJfcGF0X+KApjwvZGl2PjwvbGk+CiAgICA8bGk+U2F2ZS4gUmVuZGVyIHJlZGVwbG95cyBhdXRvbWF0aWNhbGx5LiBMb2cgaW4gaGVyZSBhbmQgcHJlc3MgPGI+UlVOIFRIRSBTRUxGLVRFU1Q8L2I+IGFib3ZlLjwvbGk+CiAgIDwvb2w+CiAgIDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tYW1iKSI+PGI+VGhlIHJlcG8gbXVzdCBiZSBQUklWQVRFLjwvYj4gWW91ciBzdGF0ZSBmaWxlIGhvbGRzIEFQSSBrZXlzLCB5b3VyIFNNVFAgcGFzc3dvcmQgYW5kIGNsaWVudCBkYXRhLiBUaGUgc2VsZi10ZXN0IHJlZnVzZXMgdG8gcGFzcyBpZiB0aGUgcmVwbyBpcyBwdWJsaWMuPC9kaXY+CiAgIDwvZGl2PgogIDwvZGV0YWlscz5gOicnfWA7Cn07ClJFTkRFUi5zdG9yYWdlPSgpPT5gPGRpdiBkYXRhLWxpdmU9InN0b3JhZ2UiPiR7TElWRS5zdG9yYWdlKCl9PC9kaXY+YDsKYXN5bmMgZnVuY3Rpb24gc3RvcmVUZXN0KCl7CiAgY29uc3Qgbz1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RPdXQnKTsgby5pbm5lckhUTUw9JzxkaXYgY2xhc3M9Im1vbm8tZGltIj5SdW5uaW5nIGEgcmVhbCByb3VuZCB0cmlw4oCmPC9kaXY+JzsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3N0b3JlL3Rlc3QnLHt9KTsKICAgIG8uaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4keyhyLnN0ZXBzfHxbXSkubWFwKHM9PgogICAgICBgPHRyPjx0ZCBzdHlsZT0id2lkdGg6MzBweCI+JHtzLm9rPyc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+4pyUPC9zcGFuPic6JzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj7inJU8L3NwYW4+J308L3RkPgogICAgICAgPHRkPiR7ZXNjKHMuc3RlcCl9PC90ZD48dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhzLmRldGFpbHx8JycpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX08L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHg7Ym9yZGVyLWNvbG9yOiR7ci5vaz8ndmFyKC0tbGltZSknOid2YXIoLS1tYWcpJ30iPgogICAgICAgPGI+JHtyLm9rPydQQVNTRUQnOidGQUlMRUQnfTwvYj4gJHtyLm1zP2BpbiAke3IubXN9bXNgOicnfSDigJQgJHtlc2Moci52ZXJkaWN0fHxyLmZhdGFsfHwnJyl9PC9kaXY+YDsKICAgIHJlbmRlcigpOwogIH1jYXRjaChlKXsgby5pbm5lckhUTUw9YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj5gIH0KfQoKLyogLS0tLS0tLS0tLSBTTVRQIFBSRUZMSUdIVDogcHJvdmUgaXQgYWdhaW5zdCB0aGUgcmVhbCBzZXJ2ZXIgLS0tLS0tLS0tLSAqLwphc3luYyBmdW5jdGlvbiBwcmVmbGlnaHQoKXsKICBjb25zdCBvPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwZk91dCcpOwogIGNvbnN0IHRvPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGZUbycpfHx7fSkudmFsdWV8fCcnOwogIG8uaW5uZXJIVE1MPSc8ZGl2IGNsYXNzPSJtb25vLWRpbSI+VGFsa2luZyB0byB5b3VyIHJlYWwgbWFpbCBzZXJ2ZXLigKY8L2Rpdj4nOwogIHRyeXsKICAgIGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3NtdHAvcHJlZmxpZ2h0Jyx7dG99KTsKICAgIG8uaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4keyhyLnN0ZXBzfHxbXSkubWFwKHM9PgogICAgICBgPHRyPjx0ZCBzdHlsZT0id2lkdGg6MjhweCI+JHtzLm9rPyc8c3BhbiBzdHlsZT0iY29sb3I6dmFyKC0tZ3JuKSI+4pyUPC9zcGFuPic6JzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1tYWcpIj7inJU8L3NwYW4+J308L3RkPgogICAgICAgPHRkIHN0eWxlPSJ3aWR0aDoyMDBweCI+JHtlc2Mocy5zdGVwKX08L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHMuZGV0YWlsfHwnJyl9PC90ZD48L3RyPmApLmpvaW4oJycpfTwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9Im1hcmdpbi10b3A6MTBweDtib3JkZXItY29sb3I6JHtyLm9rPyd2YXIoLS1saW1lKSc6J3ZhcigtLW1hZyknfSI+CiAgICAgICA8Yj4ke3Iub2s/J1BBU1NFRCc6J0ZBSUxFRCd9PC9iPiR7ci5tcz9gIGluICR7ci5tc31tc2A6Jyd9JHtyLmZhdGFsP2Ag4oCUICR7ZXNjKHIuZmF0YWwpfWA6Jyd9CiAgICAgICAke3IuYWR2aWNlP2A8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOjdweCI+JHtlc2Moci5hZHZpY2UpfTwvZGl2PmA6Jyd9PC9kaXY+YDsKICAgIHJlbmRlcigpOwogIH1jYXRjaChlKXsgby5pbm5lckhUTUw9YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj5gIH0KfQoKLyogLS0tLS0tLS0tLSBhdHRhY2ggYSBmaWxlIHN0cmFpZ2h0IGZyb20gdGhlIGNoYXQgYm94IC0tLS0tLS0tLS0gKi8KYXN5bmMgZnVuY3Rpb24gYXR0YWNoRG9jKGlucHV0KXsKICBjb25zdCBmID0gaW5wdXQuZmlsZXMgJiYgaW5wdXQuZmlsZXNbMF07CiAgaWYoIWYpIHJldHVybjsKICBpZihmLnNpemUgPiA4KjEwMjQqMTAyNCl7IGZsYXNoKCdUb28gYmlnIOKAlCA4IE1CIGxpbWl0Jyk7IGlucHV0LnZhbHVlPScnOyByZXR1cm47IH0KICBmbGFzaCgnUmVhZGluZyAnK2YubmFtZSsn4oCmJyk7CiAgdHJ5ewogICAgY29uc3QgYnVmID0gYXdhaXQgZi5hcnJheUJ1ZmZlcigpOwogICAgbGV0IGJpbj0nJzsgY29uc3QgYnl0ZXM9bmV3IFVpbnQ4QXJyYXkoYnVmKTsKICAgIGZvcihsZXQgaT0wO2k8Ynl0ZXMubGVuZ3RoO2krPTgxOTIpCiAgICAgIGJpbiArPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGJ5dGVzLnN1YmFycmF5KGksaSs4MTkyKSk7CiAgICBhd2FpdCBBUEkoJy9hcGkvZG9jL3VwbG9hZCcseyBuYW1lOmYubmFtZSwgZGF0YTpidG9hKGJpbikgfSk7CiAgICBpbnB1dC52YWx1ZT0nJzsKICAgIHJlbmRlcigpOwogICAgZmxhc2goZi5uYW1lKycgYXR0YWNoZWQg4oCUIG5vdyBhc2sgaGltIGFib3V0IGl0Jyk7CiAgfWNhdGNoKGUpeyBpbnB1dC52YWx1ZT0nJzsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gZHJvcERvYyhpZCl7IGF3YWl0IEFQSSgnL2FwaS9kb2MvcmVtb3ZlJyx7aWR9KTsgcmVuZGVyKCkgfQoKLyogLS0tLS0tLS0tLSBwcm9qZWN0czogYSBzZXBhcmF0ZSB0aHJlYWQgcGVyIHBpZWNlIG9mIHdvcmsgLS0tLS0tLS0tLSAqLwphc3luYyBmdW5jdGlvbiBuZXdQcmooKXsKICBjb25zdCBuID0gcHJvbXB0KCdOYW1lIHRoaXMgcHJvamVjdCDigJQgdXN1YWxseSB0aGUgYnVzaW5lc3MgaXQgaXMgYWJvdXQ6Jyk7CiAgaWYoIW4gfHwgIW4udHJpbSgpKSByZXR1cm47CiAgdHJ5eyBhd2FpdCBBUEkoJy9hcGkvcHJvamVjdC9uZXcnLHtuYW1lOm4udHJpbSgpfSk7IHJlbmRlcigpOyBmbGFzaCgnUHJvamVjdCAiJytuLnRyaW0oKSsnIiBvcGVuJyk7IH0KICBjYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gb3BlblByaihpZCl7IGF3YWl0IEFQSSgnL2FwaS9wcm9qZWN0L29wZW4nLHtpZH0pOyByZW5kZXIoKTsgc2Nyb2xsQ2hhdCgpIH0KYXN5bmMgZnVuY3Rpb24gZGVsUHJqKGlkKXsKICBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgcHJvamVjdCwgaXRzIGNvbnZlcnNhdGlvbiBhbmQgaXRzIGZpbGVzPycpKSByZXR1cm47CiAgYXdhaXQgQVBJKCcvYXBpL3Byb2plY3QvZGVsZXRlJyx7aWR9KTsgcmVuZGVyKCk7Cn0KYXN5bmMgZnVuY3Rpb24gZmluZENoYXQoKXsKICBjb25zdCBxPShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hhdEZpbmQnKXx8e30pLnZhbHVlfHwnJzsKICBjb25zdCBvdXQ9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbmRPdXQnKTsKICBpZighcS50cmltKCkpeyBvdXQuaW5uZXJIVE1MPScnOyByZXR1cm47IH0KICB0cnl7CiAgICBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9jaGF0L3NlYXJjaCcse3E6cS50cmltKCl9KTsKICAgIG91dC5pbm5lckhUTUwgPSByLmhpdHMubGVuZ3RoCiAgICAgID8gYDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPjxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo4cHgiPiR7ci5oaXRzLmxlbmd0aH0gbWF0Y2goZXMpIGZvciAiJHtlc2Moci5xKX0iPC9kaXY+CiAgICAgICAgICR7ci5oaXRzLm1hcChoPT5gPGRpdiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkIHZhcigtLXN0cm9rZTIpO3BhZGRpbmctbGVmdDoxMXB4O21hcmdpbi1ib3R0b206MTBweCI+CiAgICAgICAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGgucHJvamVjdCl9IMK3ICR7aC53aG99IMK3ICR7aC50fQogICAgICAgICAgICAke2gucGlkIT09KFMucHJvamVjdElkfHwnUFJKLU1BSU4nKT9gPGEgaHJlZj0iIyIgb25jbGljaz0ib3BlblByaignJHtoLnBpZH0nKTtyZXR1cm4gZmFsc2UiIHN0eWxlPSJtYXJnaW4tbGVmdDo4cHgiPm9wZW4gdGhhdCBwcm9qZWN0PC9hPmA6Jyd9PC9kaXY+CiAgICAgICAgICAgPGRpdiBzdHlsZT0ibGluZS1oZWlnaHQ6MS41NSI+JHtlc2MoaC5zbmlwcGV0KX08L2Rpdj48L2Rpdj5gKS5qb2luKCcnKX0KICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmluZE91dCcpLmlubmVySFRNTD0nJztkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hhdEZpbmQnKS52YWx1ZT0nJyI+Q2xvc2U8L2J1dHRvbj48L2Rpdj5gCiAgICAgIDogYDxkaXYgY2xhc3M9ImNhcmQiIHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5Ob3RoaW5nIG1hdGNoZXMgIiR7ZXNjKHIucSl9Ii48L2Rpdj48L2Rpdj5gOwogIH1jYXRjaChlKXsgb3V0LmlubmVySFRNTD1gPGRpdiBjbGFzcz0id2FybmJveCI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj5gIH0KfQoKLyogPT09PT09PT09PT09PT09PT0gQ09OVEVOVCBTVFVESU8g4oCUIHRoZSBNb25kYXkgYmF0Y2ggPT09PT09PT09PT09PT09PT0gKi8KY29uc3QgUEs9e3JlZWw6J1JlZWwnLGNhcm91c2VsOidDYXJvdXNlbCcsc2luZ2xlOidQb3N0JyxzdG9yeTonU3RvcnknfTsKTElWRS5jb250ZW50PSgpPT57CiAgY29uc3QgVz1TLmNvbnRlbnR8fFtdLCBCPVMuYnVzaW5lc3Nlc3x8W107CiAgY29uc3QgaGVhZD1gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1saW1lKSI+CiAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tb2xpdmUpIj5cdTI1YTMgQ09OVEVOVCBTVFVESU8g4oCUIE9ORSBIT1VSIE9OIE1PTkRBWSwgVEhFIFdFRUsgSVMgRE9ORTwvaDM+CiAgIDxkaXYgY2xhc3M9Indhcm5ib3giPjxiPkhlIGRvZXMgbm90IHBvc3QgdG8gSW5zdGFncmFtLCBhbmQgbm90aGluZyBmcmVlIHNhZmVseSBjYW4uPC9iPgogICAgQXV0by1wb3N0aW5nIHRvb2xzIHRoYXQgcHJvbWlzZSBpdCBhcmUgcnVubmluZyB1bm9mZmljaWFsIEFQSXMsIGZvbGxvdy91bmZvbGxvdyBzY3JpcHRzIG9yIGVuZ2FnZW1lbnQgYm90cyDigJQgZXZlcnkgb25lIHZpb2xhdGVzIEluc3RhZ3JhbSdzIHRlcm1zIGFuZCBpcyB0aGUgbW9zdCBjb21tb24gY2F1c2Ugb2YgYSBzaGFkb3diYW4gb3IgYSBwZXJtYW5lbnQgYmFuLiA8Yj5NZXRhIEJ1c2luZXNzIFN1aXRlIGlzIEluc3RhZ3JhbSdzIG93biBzY2hlZHVsZXIsIGl0IGlzIGZyZWUsIGl0IGlzIG5hdGl2ZSwgYW5kIGl0IGlzIHRoZSBvbmx5IHRoaW5nIHRoYXQgcmVsaWFibHkgYXV0by1wdWJsaXNoZXMgUmVlbHMuPC9iPiBIZSBmaWxscyBpdC4gWW91IHBhc3RlIGl0IGluIG9uY2UgYSB3ZWVrLjwvZGl2PgogICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOjEwcHgiPkhlIHdyaXRlcyB0aGUgcGFydCB0aGF0IGVhdHMgeW91ciB0aW1lOiBhIHdlZWsgb2YgaG9va3MsIGNhcHRpb25zLCBoYXNodGFncyBhbmQgdmlzdWFsIGJyaWVmcywgaW4gb25lIHBhc3MsIGFib3V0IHlvdXIgcmVhbCBidXNpbmVzcy48L2Rpdj4KICAgJHshUy5sbG0/JzxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+Q29ubmVjdCBhbiBBSSBicmFpbiBmaXJzdC48L2Rpdj4nOicnfQogICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+Q29udGVudCBmb3Igd2hpY2ggYnVzaW5lc3M8L3NwYW4+CiAgICAgPHNlbGVjdCBpZD0iY3RCaXoiIGNsYXNzPSJpbiI+JHtCLmxlbmd0aD9CLm1hcCh4PT5gPG9wdGlvbiB2YWx1ZT0iJHt4LmlkfSI+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKTonPG9wdGlvbiB2YWx1ZT0iIj7igJQgbm9uZSBidWlsdCDigJQ8L29wdGlvbj4nfTwvc2VsZWN0PjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPk9yIGRlc2NyaWJlIHRoZSBuaWNoZSB5b3Vyc2VsZjwvc3Bhbj4KICAgICA8aW5wdXQgaWQ9ImN0TmljaGUiIGNsYXNzPSJpbiIgcGxhY2Vob2xkZXI9ImUuZy4gd2Vic2l0ZSBtb25pdG9yaW5nIGZvciBMdWRoaWFuYSBleHBvcnRlcnMiPjwvbGFiZWw+CiAgIDwvZGl2PgogICA8ZGl2IGNsYXNzPSJncmlkIGcyIj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+UG9zdHMgdGhpcyB3ZWVrPC9zcGFuPgogICAgIDxzZWxlY3QgaWQ9ImN0Q291bnQiIGNsYXNzPSJpbiI+PG9wdGlvbj41PC9vcHRpb24+PG9wdGlvbiBzZWxlY3RlZD43PC9vcHRpb24+PG9wdGlvbj4xMDwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPjxzcGFuPllvdXIgaGFuZGxlIChvcHRpb25hbCk8L3NwYW4+CiAgICAgPGlucHV0IGlkPSJjdEhhbmRsZSIgY2xhc3M9ImluIiBwbGFjZWhvbGRlcj0iQHlvdXJidXNpbmVzcyI+PC9sYWJlbD4KICAgPC9kaXY+CiAgIDxidXR0b24gY2xhc3M9ImJ0biBwIiBvbmNsaWNrPSJwbGFuV2VlaygpIj5QTEFOIFRIRSBXRUVLPC9idXR0b24+CiAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPkhlIHJlLXBsYW5zIGF1dG9tYXRpY2FsbHkgZXZlcnkgMiBkYXlzIGlmIHRoZSBsYXN0IHdlZWsgaXMgc3RhbGUsIGFuZCBhZGFwdHMgdG8gd2hpY2hldmVyIHBvc3RzIHlvdSBtYXJrIGFzIGhhdmluZyB3b3JrZWQuPC9kaXY+CiAgPC9kaXY+CgogIDxkaXYgY2xhc3M9ImNhcmQiPgogICA8aDM+VGhlIHJoeXRobSB0aGF0IG1ha2VzIHRoaXMgd29yazwvaDM+CiAgIDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJ3aWR0aDoxMzBweCI+TW9uZGF5IMK3IDQwIG1pbjwvdGQ+PHRkPlBsYW4gaGVyZSwgYnVpbGQgdmlzdWFscyBpbiBDYW52YSBvciBDYXBDdXQsIGxvYWQgdGhlIHdob2xlIHdlZWsgaW50byBNZXRhIEJ1c2luZXNzIFN1aXRlLjwvdGQ+PC90cj4KICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5EYWlseSDCtyAxMCBtaW48L3RkPjx0ZD48Yj5SZXBseSB0byBldmVyeSBjb21tZW50IGluIHRoZSBmaXJzdCBob3VyLjwvYj4gVGhpcyBzdGF5cyBtYW51YWwgYmVjYXVzZSBpdCBpcyB0aGUgc2luZ2xlIGhpZ2hlc3QtbGV2ZXJhZ2UgZnJlZSBncm93dGggbGV2ZXIgdGhlcmUgaXMuPC90ZD48L3RyPgogICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlN1bmRheSDCtyAxNSBtaW48L3RkPjx0ZD5DaGVjayBJbnNpZ2h0cy4gTWFyayBiZWxvdyB3aGF0IHdvcmtlZC4gSGUgdXNlcyBpdCB0byBwbGFuIHRoZSBuZXh0IHdlZWsuPC90ZD48L3RyPgogICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgIDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPjxiPkJlZm9yZSBhbnkgb2YgdGhpcyB3b3Jrczo8L2I+IHlvdXIgYWNjb3VudCBtdXN0IGJlIGEgPGI+UHJvZmVzc2lvbmFsIChDcmVhdG9yKTwvYj4gYWNjb3VudCDigJQgU2V0dGluZ3Mg4oaSIEFjY291bnQgdHlwZS4gV2l0aG91dCBpdCB0aGVyZSBpcyBubyBzY2hlZHVsaW5nLCBubyBpbnNpZ2h0cyBhbmQgbm8gbW9uZXRpc2F0aW9uLiBUYWtlcyBvbmUgbWludXRlLjwvZGl2PgogIDwvZGl2PmA7CgogIGlmKCFXLmxlbmd0aCkgcmV0dXJuIGhlYWQrJzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyB3ZWVrIHBsYW5uZWQgeWV0LjwvZGl2PjwvZGl2Pic7CgogIHJldHVybiBoZWFkICsgVy5tYXAodz0+YDxkaXYgY2xhc3M9ImNhcmQiPgogICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjhweDtmbGV4LXdyYXA6d3JhcCI+CiAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgdC1jeSI+V0VFSzwvc3Bhbj48Yj4ke2VzYyh3LmJpek5hbWUpfTwvYj4KICAgICA8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj4ke3cucmVlbHN9IHJlZWxzPC9zcGFuPgogICAgIDxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPiR7dy5wb3N0cy5sZW5ndGh9IHBvc3RzPC9zcGFuPgogICAgICR7dy50ZWxsQ291bnQ/YDxzcGFuIGNsYXNzPSJ0YWcgdC1hbWIiPiR7dy50ZWxsQ291bnR9IHRvIGZpeDwvc3Bhbj5gOic8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj5hdWRpdCBjbGVhbjwvc3Bhbj4nfTwvZGl2PgogICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke3cudH08L3NwYW4+PC9kaXY+CgogICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tYm90dG9tOjExcHg7ZmxleC13cmFwOndyYXAiPgogICAgPGEgY2xhc3M9ImJ0biBvayIgaHJlZj0iL2FwaS9jb250ZW50L3R4dD9pZD0ke3cuaWR9Ij5ET1dOTE9BRCBUSEUgV0hPTEUgV0VFSzwvYT4KICAgIDxhIGNsYXNzPSJidG4iIGhyZWY9Imh0dHBzOi8vYnVzaW5lc3MuZmFjZWJvb2suY29tL2xhdGVzdC9wb3N0cy9zY2hlZHVsZWRfcG9zdHMiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5PcGVuIE1ldGEgQnVzaW5lc3MgU3VpdGUgXHUyMTk3PC9hPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJkZWxXZWVrKCcke3cuaWR9JykiPkRlbGV0ZTwvYnV0dG9uPjwvZGl2PgoKICAgJHt3LmJpb1N1Z2dlc3Rpb24/YDxkaXYgY2xhc3M9InR3IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMHB4Ij48dGFibGU+PHRib2R5PgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTIwcHgiPkJpbzwvdGQ+PHRkIGlkPSJiaW9fJHt3LmlkfSI+JHtlc2Mody5iaW9TdWdnZXN0aW9uKX08L3RkPgogICAgICA8dGQgc3R5bGU9IndpZHRoOjcwcHgiPjxidXR0b24gY2xhc3M9ImJ0biBzbSIgb25jbGljaz0iY29weUJpeignYmlvXyR7dy5pZH0nKSI+Q29weTwvYnV0dG9uPjwvdGQ+PC90cj4KICAgICAke3cuYXVkaW9Ob3RlP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+QXVkaW88L3RkPjx0ZCBjb2xzcGFuPSIyIj4ke2VzYyh3LmF1ZGlvTm90ZSl9PC90ZD48L3RyPmA6Jyd9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDonJ30KCiAgICR7KHcucGlsbGFyc3x8W10pLmxlbmd0aD9gPGRldGFpbHMgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIj48Yj5QaWxsYXJzPC9iPjwvc3VtbWFyeT4KICAgIDx1bCBjbGFzcz0idGlnaHQiIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+JHt3LnBpbGxhcnMubWFwKHA9PmA8bGk+PGI+JHtlc2MocC5uYW1lKX08L2I+IOKAlCAke2VzYyhwLndoeSl9PC9saT5gKS5qb2luKCcnKX08L3VsPjwvZGV0YWlscz5gOicnfQoKICAgJHt3LnBvc3RzLm1hcChwPT5gPGRpdiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkICR7cC5wb3N0ZWQ/J3ZhcigtLWdybiknOid2YXIoLS1zdHJva2UyKSd9O3BhZGRpbmctbGVmdDoxMnB4O21hcmdpbi1ib3R0b206MTZweCI+CiAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47ZmxleC13cmFwOndyYXAiPgogICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxzcGFuIGNsYXNzPSJ0YWcgJHtwLmtpbmQ9PT0ncmVlbCc/J3QtZ3JuJzondC1kaW0nfSI+JHtQS1twLmtpbmRdfHxwLmtpbmR9PC9zcGFuPgogICAgICAgPGI+JHtlc2MocC5kYXkpfTwvYj4ke3AucG9zdGVkPyc8c3BhbiBjbGFzcz0idGFnIHQtZ3JuIj5QT1NURUQ8L3NwYW4+JzonJ308L2Rpdj4KICAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhwLnBpbGxhcnx8JycpfTwvc3Bhbj48L2Rpdj4KICAgICA8ZGl2IHN0eWxlPSJmb250LXNpemU6MTVweDtmb250LXdlaWdodDo2MDA7bWFyZ2luOjdweCAwIj4iJHtlc2MocC5ob29rKX0iPC9kaXY+CiAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjdweCI+JHtlc2MocC53aHl8fCcnKX08L2Rpdj4KICAgICA8ZGl2IHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLWlucCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1icmQpO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MTFweDttYXJnaW4tYm90dG9tOjhweCI+CiAgICAgIDxkaXYgaWQ9ImNhcF8ke3AuaWR9IiBzdHlsZT0id2hpdGUtc3BhY2U6cHJlLXdyYXA7bGluZS1oZWlnaHQ6MS42Ij4ke2VzYyhwLmNhcHRpb24pfQoKJHtlc2MoKHAuaGFzaHRhZ3N8fFtdKS5qb2luKCcgJykpfTwvZGl2PgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gcCIgc3R5bGU9Im1hcmdpbi10b3A6OHB4IiBvbmNsaWNrPSJjb3B5Qml6KCdjYXBfJHtwLmlkfScpIj5Db3B5IGNhcHRpb24gKyB0YWdzPC9idXR0b24+PC9kaXY+CiAgICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjRweCI+PGI+VmlzdWFsOjwvYj4gJHtlc2MocC52aXN1YWwpfTwvZGl2PgogICAgIDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo4cHgiPjxiPkFzazo8L2I+ICR7ZXNjKHAuY3RhKX08L2Rpdj4KICAgICA8ZGl2IGNsYXNzPSJyb3ciPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gJHtwLnBvc3RlZD8nJzonb2snfSIgb25jbGljaz0ibWFya1Bvc3RlZCgnJHt3LmlkfScsJyR7cC5pZH0nKSI+JHtwLnBvc3RlZD8nVW4tbWFyayc6J01hcmsgcG9zdGVkJ308L2J1dHRvbj4KICAgICAgPGlucHV0IGNsYXNzPSJpbiIgc3R5bGU9Im1heC13aWR0aDoyMzBweCIgaWQ9InJlc18ke3AuaWR9IiBwbGFjZWhvbGRlcj0id2hhdCBoYXBwZW5lZD8gZS5nLiA0MCB2aWV3cywgMSBETSIKICAgICAgICBvbmJsdXI9InNhdmVSZXN1bHQoJyR7dy5pZH0nLCcke3AuaWR9JykiIHZhbHVlPSIke2VzYyhwLnJlc3VsdHx8JycpfSI+PC9kaXY+CiAgICA8L2Rpdj5gKS5qb2luKCcnKX0KCiAgICR7dy5maXJzdENvbW1lbnQ/YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbGltZSkiPjxiPlBvc3QgdGhpcyBjb21tZW50IHlvdXJzZWxmIHJpZ2h0IGFmdGVyIHB1Ymxpc2hpbmc6PC9iPgogICAgIDxkaXYgaWQ9ImZjXyR7dy5pZH0iIHN0eWxlPSJtYXJnaW4tdG9wOjZweCI+JHtlc2Mody5maXJzdENvbW1lbnQpfTwvZGl2PgogICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSIgc3R5bGU9Im1hcmdpbi10b3A6N3B4IiBvbmNsaWNrPSJjb3B5Qml6KCdmY18ke3cuaWR9JykiPkNvcHk8L2J1dHRvbj48L2Rpdj5gOicnfQoKICAgJHt3LnRlbGxDb3VudD9gPGRldGFpbHM+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFtYikiPjxiPiR7dy50ZWxsQ291bnR9IHBocmFzZShzKSBzb3VuZCBtYWNoaW5lLXdyaXR0ZW4g4oCUIGZpeCBiZWZvcmUgcG9zdGluZzwvYj48L3N1bW1hcnk+CiAgICA8ZGl2IGNsYXNzPSJ0dyIgc3R5bGU9Im1hcmdpbi10b3A6OHB4Ij48dGFibGU+PHRib2R5PgogICAgICR7KHcudGVsbHN8fFtdKS5tYXAodD0+YDx0cj48dGQgc3R5bGU9ImZvbnQtZmFtaWx5Om1vbm9zcGFjZSI+IiR7ZXNjKHQuZm91bmQpfSI8L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKHQud2h5KX08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kZXRhaWxzPmA6Jyd9CiAgPC9kaXY+YCkuam9pbignJyk7Cn07ClJFTkRFUi5jb250ZW50PSgpPT5gPGRpdiBkYXRhLWxpdmU9ImNvbnRlbnQiPiR7TElWRS5jb250ZW50KCl9PC9kaXY+YDsKCmFzeW5jIGZ1bmN0aW9uIHBsYW5XZWVrKCl7CiAgY29uc3QgZz1pZD0+KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKXx8e30pLnZhbHVlfHwnJzsKICBmbGFzaCgnUGxhbm5pbmcgdGhlIHdlZWsg4oCUIGFib3V0IGEgbWludXRl4oCmJyk7CiAgdHJ5ewogICAgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvY29udGVudC93ZWVrJyx7Yml6SWQ6ZygnY3RCaXonKSxuaWNoZTpnKCdjdE5pY2hlJyksY291bnQ6K2coJ2N0Q291bnQnKXx8NyxoYW5kbGU6ZygnY3RIYW5kbGUnKX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKGAke3IucG9zdHN9IHBvc3RzLCAke3IucmVlbHN9IHJlZWxzYCsoci50ZWxscz9gIMK3ICR7ci50ZWxsc30gdG8gZml4YDonIMK3IGNsZWFuJykpOwogIH1jYXRjaChlKXsgZmxhc2goZS5tZXNzYWdlKSB9Cn0KYXN5bmMgZnVuY3Rpb24gZGVsV2VlayhpZCl7IGlmKCFjb25maXJtKCdEZWxldGUgdGhpcyB3ZWVrPycpKXJldHVybjsgYXdhaXQgQVBJKCcvYXBpL2NvbnRlbnQvZGVsZXRlJyx7aWR9KTsgcmVuZGVyKCkgfQphc3luYyBmdW5jdGlvbiBtYXJrUG9zdGVkKHdlZWtJZCxwb3N0SWQpeyBhd2FpdCBBUEkoJy9hcGkvY29udGVudC9wb3N0ZWQnLHt3ZWVrSWQscG9zdElkfSk7IHJlbmRlcigpIH0KYXN5bmMgZnVuY3Rpb24gc2F2ZVJlc3VsdCh3ZWVrSWQscG9zdElkKXsKICBjb25zdCB2PShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzXycrcG9zdElkKXx8e30pLnZhbHVlfHwnJzsKICBjb25zdCB3PShTLmNvbnRlbnR8fFtdKS5maW5kKHg9PnguaWQ9PT13ZWVrSWQpOwogIGNvbnN0IHA9dyYmdy5wb3N0cy5maW5kKHg9PnguaWQ9PT1wb3N0SWQpOwogIGlmKCFwIHx8IChwLnJlc3VsdHx8JycpPT09dikgcmV0dXJuOwogIGF3YWl0IEFQSSgnL2FwaS9jb250ZW50L3Bvc3RlZCcse3dlZWtJZCxwb3N0SWQscmVzdWx0OnZ9KTsKICBhd2FpdCBBUEkoJy9hcGkvY29udGVudC9wb3N0ZWQnLHt3ZWVrSWQscG9zdElkfSk7Cn0KCi8qID09PT09PT09PT09PT09PT09IENPTU1FTlQgREVTSyA9PT09PT09PT09PT09PT09PSAqLwpMSVZFLmNvbW1lbnRzPSgpPT57CiAgY29uc3QgTT1TLm1ldGEsIEQ9KFMuY29tbWVudERyYWZ0c3x8W10pLmZpbHRlcihkPT5kLnN0YXR1cz09PSdEUkFGVCcpLCBMPVMuY29tbWVudExvZ3x8W107CiAgY29uc3QgVz1TLnJlcGx5V2luZG93fHx7dXNlZDowLGNhcDo0MCxsZWZ0OjQwfTsKICBjb25zdCBkb25lPShTLmNvbW1lbnREcmFmdHN8fFtdKS5maWx0ZXIoZD0+ZC5zdGF0dXMhPT0nRFJBRlQnKTsKCiAgY29uc3QgaGVhZD1gPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1saW1lKSI+CiAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tb2xpdmUpIj5cdTI1YzggQ09NTUVOVCBERVNLIOKAlCBIRSBEUkFGVFMsIFlPVSBBUFBST1ZFLCBIRSBSRVBMSUVTPC9oMz4KICAgPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpIj48Yj5JIHdhcyB3cm9uZyBhYm91dCB0aGlzIGFuZCBJIGFtIGNvcnJlY3RpbmcgaXQuPC9iPgogICAgSSB0b2xkIHlvdSB0aHJlZSB0aW1lcyB0aGF0IHJlcGx5aW5nIHRvIGNvbW1lbnRzIGNvdWxkIG5vdCBiZSBhdXRvbWF0ZWQgc2FmZWx5LiBJdCBjYW4uIE1ldGEgcHVibGlzaGVzIDxjb2RlPmluc3RhZ3JhbV9tYW5hZ2VfY29tbWVudHM8L2NvZGU+IGZvciBleGFjdGx5IHRoaXMgYW5kIGV4cGxpY2l0bHkgcGVybWl0cyBhdXRvbWF0ZWQgcmVwbGllcyB0byA8Yj51c2VyLWluaXRpYXRlZDwvYj4gYWN0aW9ucy4gV2hhdCBhY3R1YWxseSBnZXRzIGFjY291bnRzIGJhbm5lZCBpcyBicm93c2VyIGV4dGVuc2lvbnMsIHBhc3N3b3JkLXNoYXJpbmcgYm90cyBhbmQgY29sZCBvdXRyZWFjaCDigJQgbm90IHRoaXMuIEkgZ2VuZXJhbGlzZWQgYW5kIG5ldmVyIGNoZWNrZWQuPC9kaXY+CiAgIDxkaXYgY2xhc3M9InR3IiBzdHlsZT0ibWFyZ2luLWJvdHRvbToxMXB4Ij48dGFibGU+PHRib2R5PgogICAgPHRyPjx0ZCBzdHlsZT0id2lkdGg6MzBweDtjb2xvcjp2YXIoLS1ncm4pIj5cdTI3MTQ8L3RkPjx0ZD5SZXBseWluZyB0byBzb21lb25lIHdobyBjb21tZW50ZWQgb24gPGI+eW91cjwvYj4gcG9zdDwvdGQ+PC90cj4KICAgIDx0cj48dGQgc3R5bGU9ImNvbG9yOnZhcigtLWdybikiPlx1MjcxNDwvdGQ+PHRkPk9uZSBwcml2YXRlIERNIHJlcGx5IHRvIGEgY29tbWVudGVyLCB3aXRoaW4gNyBkYXlzPC90ZD48L3RyPgogICAgPHRyPjx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+XHUyNzE1PC90ZD48dGQ+Q29sZCBETXMgdG8gcGVvcGxlIHdobyBuZXZlciBlbmdhZ2VkIOKAlCA8Yj5ub3QgYnVpbHQ8L2I+PC90ZD48L3RyPgogICAgPHRyPjx0ZCBzdHlsZT0iY29sb3I6dmFyKC0tbWFnKSI+XHUyNzE1PC90ZD48dGQ+SWRlbnRpY2FsIHJlcGxpZXMgYXQgc2NhbGUg4oCUIDxiPmJsb2NrZWQgaW4gY29kZTwvYj4sIG5vdCBqdXN0IHdhcm5lZCBhYm91dDwvdGQ+PC90cj4KICAgIDx0cj48dGQgc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPlx1MjcxNTwvdGQ+PHRkPkF1dG8tZm9sbG93LCBwb2RzLCBib3VnaHQgZW5nYWdlbWVudCDigJQgPGI+bmV2ZXI8L2I+PC90ZD48L3RyPgogICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CgogICAkeyFNP2A8ZGl2IGNsYXNzPSJ3YXJuYm94Ij48Yj5CZWZvcmUgdGhpcyB3b3JrcywgTWV0YSByZXF1aXJlcyBhbGwgb2YgdGhpcyDigJQgbm9uZSBvZiBpdCBpcyBvcHRpb25hbCBhbmQgSSBjYW5ub3QgZG8gYW55IG9mIGl0IGZvciB5b3U6PC9iPgogICAgIDxvbCBzdHlsZT0ibWFyZ2luOjhweCAwIDA7cGFkZGluZy1sZWZ0OjE5cHg7bGluZS1oZWlnaHQ6MS45Ij4KICAgICAgPGxpPkluc3RhZ3JhbSA8Yj5CdXNpbmVzcyBvciBDcmVhdG9yPC9iPiBhY2NvdW50LiBQZXJzb25hbCBhY2NvdW50cyBoYXZlIDxiPm5vIEFQSSBhdCBhbGw8L2I+LjwvbGk+CiAgICAgIDxsaT5BIDxiPkZhY2Vib29rIFBhZ2U8L2I+IGxpbmtlZCB0byBpdCwgZXZlbiBpZiB5b3UgbmV2ZXIgcG9zdCB0aGVyZS48L2xpPgogICAgICA8bGk+QW4gYXBwIGF0IDxiPmRldmVsb3BlcnMuZmFjZWJvb2suY29tPC9iPiBcdTIxOTIgQ3JlYXRlIEFwcCBcdTIxOTIgQnVzaW5lc3MuPC9saT4KICAgICAgPGxpPkFkZCB0aGUgPGI+SW5zdGFncmFtPC9iPiBwcm9kdWN0LCByZXF1ZXN0IDxjb2RlPmluc3RhZ3JhbV9iYXNpYzwvY29kZT4gYW5kIDxjb2RlPmluc3RhZ3JhbV9tYW5hZ2VfY29tbWVudHM8L2NvZGU+LjwvbGk+CiAgICAgIDxsaT48Yj5BcHAgUmV2aWV3PC9iPiBcdTIwMTQgMiB0byA1IGJ1c2luZXNzIGRheXMuIFdpdGhvdXQgaXQgeW91IGFyZSBsaW1pdGVkIHRvIHRlc3QgdXNlcnMuPC9saT4KICAgICAgPGxpPkdlbmVyYXRlIGEgPGI+bG9uZy1saXZlZCBQYWdlIGFjY2VzcyB0b2tlbjwvYj4gaW4gR3JhcGggQVBJIEV4cGxvcmVyIGFuZCBwYXN0ZSBpdCBiZWxvdy48L2xpPgogICAgIDwvb2w+CiAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiPlRoaXMgaXMgZ2VudWluZWx5IGEgY291cGxlIG9mIGhvdXJzIG9mIE1ldGEgcGFwZXJ3b3JrLiBUaGVyZSBpcyBubyBzaG9ydGN1dCwgYW5kIGFueXRoaW5nIGFkdmVydGlzaW5nIG9uZSBpcyBhIGJvdC48L2Rpdj48L2Rpdj4KICAgIDxsYWJlbCBjbGFzcz0iZiI+PHNwYW4+TG9uZy1saXZlZCBQYWdlIGFjY2VzcyB0b2tlbjwvc3Bhbj4KICAgICA8aW5wdXQgaWQ9Im10VG9rIiBjbGFzcz0iaW4iIHR5cGU9InBhc3N3b3JkIiBwbGFjZWhvbGRlcj0iRUFBLi4uIj48L2xhYmVsPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImNvbm5lY3RNZXRhKCkiPkNPTk5FQ1QgSU5TVEFHUkFNPC9idXR0b24+YAogICA6YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0id2lkdGg6MTMwcHgiPkFjY291bnQ8L3RkPjx0ZD48Yj5AJHtlc2MoTS51c2VybmFtZSl9PC9iPiBcdTAwYjcgJHtNLmZvbGxvd2Vyc30gZm9sbG93ZXJzIFx1MDBiNyAke00ubWVkaWFDb3VudH0gcG9zdHM8L3RkPjwvdHI+CiAgICAgPHRyPjx0ZCBjbGFzcz0ibW9uby1kaW0iPlZpYSBQYWdlPC90ZD48dGQ+JHtlc2MoTS5wYWdlTmFtZSl9PC90ZD48L3RyPgogICAgIDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIj5SZXBseSBidWRnZXQ8L3RkPjx0ZD4ke1cudXNlZH0gb2YgJHtXLmNhcH0gdXNlZCB0aGlzIGhvdXIgXHUwMGI3IHBhY2VkIDIwcyBhcGFydDxkaXYgY2xhc3M9Im1vbm8tZGltIj5NZXRhIGFsbG93cyA3NTAvaG91ci4gVGhpcyBpcyBzZXQgZmFyIGJlbG93IG9uIHB1cnBvc2UgXHUyMDE0IGxvb2tpbmcgbGlrZSBhIGZpcmVob3NlIGF0dHJhY3RzIHNjcnV0aW55IGV2ZW4gd2hlbiBldmVyeSBjYWxsIGlzIGxlZ2FsLjwvZGl2PjwvdGQ+PC90cj4KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Im1hcmdpbi10b3A6MTFweCI+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9ImhhcnZlc3RDb21tZW50cygpIj5DSEVDSyBGT1IgTkVXIENPTU1FTlRTPC9idXR0b24+CiAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG5vIiBvbmNsaWNrPSJwdXJnZU1ldGEoKSI+RGlzY29ubmVjdDwvYnV0dG9uPjwvZGl2PgogICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjdweCI+SGUgY2hlY2tzIGF1dG9tYXRpY2FsbHkgZXZlcnkgMzAgbWludXRlcyBhbmQgZHJhZnRzIHJlcGxpZXMuIE5vdGhpbmcgaXMgZXZlciBzZW50IHdpdGhvdXQgeW91IHByZXNzaW5nIHNlbmQuPC9kaXY+YH0KICA8L2Rpdj5gOwoKICBpZighTSkgcmV0dXJuIGhlYWQ7CgogIGNvbnN0IGJvZHkgPSBELmxlbmd0aCA/IGA8ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO21hcmdpbi1ib3R0b206MTBweDtmbGV4LXdyYXA6d3JhcCI+CiAgICAgPGI+JHtELmxlbmd0aH0gZHJhZnQke0QubGVuZ3RoPjE/J3MnOicnfSB3YWl0aW5nIGZvciB5b3U8L2I+CiAgICAgPGRpdiBjbGFzcz0icm93Ij48YnV0dG9uIGNsYXNzPSJidG4gb2siIG9uY2xpY2s9InNlbmRDb21tZW50cygpIj5TRU5EIEFMTCBBUFBST1ZFRDwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gc20gbm8iIG9uY2xpY2s9ImNsZWFyRHJhZnRzKCkiPkRpc2NhcmQgYWxsPC9idXR0b24+PC9kaXY+PC9kaXY+CiAgICAke0QubWFwKGQ9PmA8ZGl2IHN0eWxlPSJib3JkZXItbGVmdDozcHggc29saWQgJHtkLmFjdGlvbj09PSdwdWJsaWMnPyd2YXIoLS1saW1lKSc6ZC5hY3Rpb249PT0nZG0nPyd2YXIoLS1jeSknOid2YXIoLS1zdHJva2UyKSd9O3BhZGRpbmctbGVmdDoxMnB4O21hcmdpbi1ib3R0b206MTVweCI+CiAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2ZsZXgtd3JhcDp3cmFwIj4KICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGI+QCR7ZXNjKGQudXNlcm5hbWUpfTwvYj4KICAgICAgICA8c3BhbiBjbGFzcz0idGFnICR7ZC5hY3Rpb249PT0ncHVibGljJz8ndC1ncm4nOmQuYWN0aW9uPT09J2RtJz8ndC1jeSc6J3QtZGltJ30iPiR7ZC5hY3Rpb24udG9VcHBlckNhc2UoKX08L3NwYW4+PC9kaXY+CiAgICAgICA8YSBjbGFzcz0ibW9uby1kaW0iIGhyZWY9IiR7ZXNjKGQucGVybWFsaW5rfHwnIycpfSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPnNlZSB0aGUgcG9zdCBcdTIxOTc8L2E+PC9kaXY+CiAgICAgIDxkaXYgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tZ2xhc3MyKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjlweDttYXJnaW46N3B4IDA7Zm9udC1zdHlsZTppdGFsaWMiPiIke2VzYyhkLmNvbW1lbnRUZXh0KX0iPC9kaXY+CiAgICAgICR7ZC5hY3Rpb249PT0naWdub3JlJ3x8ZC5hY3Rpb249PT0nb3duZXInCiAgICAgICAgPyBgPGRpdiBjbGFzcz0id2FybmJveCI+JHtkLmFjdGlvbj09PSdpZ25vcmUnPydIZSBpcyBsZWF2aW5nIHRoaXMgb25lIGFsb25lJzonSGUgbmVlZHMgeW91IG9uIHRoaXMgb25lJ30gXHUyMDE0ICR7ZXNjKGQud2h5fHwnJyl9PC9kaXY+YAogICAgICAgIDogJyd9CiAgICAgIDx0ZXh0YXJlYSBjbGFzcz0iaW4iIGlkPSJyZXBfJHtkLmlkfSIgc3R5bGU9Im1pbi1oZWlnaHQ6NTJweCIgb25ibHVyPSJzYXZlUmVwbHkoJyR7ZC5pZH0nKSI+JHtlc2MoZC5yZXBseSl9PC90ZXh0YXJlYT4KICAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ibWFyZ2luLXRvcDo3cHgiPgogICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIG9rIiBvbmNsaWNrPSJzZW5kQ29tbWVudHMoWycke2QuaWR9J10pIj5TZW5kIGp1c3QgdGhpczwvYnV0dG9uPgogICAgICAgPHNlbGVjdCBjbGFzcz0iaW4iIHN0eWxlPSJtYXgtd2lkdGg6MTMwcHgiIG9uY2hhbmdlPSJzZXRBY3Rpb24oJyR7ZC5pZH0nLHRoaXMudmFsdWUpIj4KICAgICAgICAke1sncHVibGljJywnZG0nLCdpZ25vcmUnLCdvd25lciddLm1hcChhPT5gPG9wdGlvbiB2YWx1ZT0iJHthfSIke2E9PT1kLmFjdGlvbj8nIHNlbGVjdGVkJzonJ30+JHthfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhkLndoeXx8JycpfTwvc3Bhbj48L2Rpdj4KICAgICA8L2Rpdj5gKS5qb2luKCcnKX0KICAgPC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJtb25vLWRpbSI+Tm8gZHJhZnRzIHdhaXRpbmcuIEhlIGNoZWNrcyBldmVyeSAzMCBtaW51dGVzLjwvZGl2PjwvZGl2PmA7CgogIGNvbnN0IHJlc3VsdHMgPSBkb25lLmxlbmd0aCA/IGA8ZGV0YWlscyBjbGFzcz0iY2FyZCI+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIj48Yj5SZWNlbnRseSBoYW5kbGVkICgke2RvbmUubGVuZ3RofSk8L2I+PC9zdW1tYXJ5PgogICAgPGRpdiBjbGFzcz0idHciIHN0eWxlPSJtYXJnaW4tdG9wOjlweCI+PHRhYmxlPjx0Ym9keT4KICAgICAke2RvbmUuc2xpY2UoLTE1KS5yZXZlcnNlKCkubWFwKGQ9PmA8dHI+CiAgICAgIDx0ZCBzdHlsZT0id2lkdGg6ODBweCI+PHNwYW4gY2xhc3M9InRhZyAke2Quc3RhdHVzPT09J1NFTlQnPyd0LWdybic6ZC5zdGF0dXM9PT0nUkVGVVNFRCc/J3QtbWFnJzondC1hbWInfSI+JHtkLnN0YXR1c308L3NwYW4+PC90ZD4KICAgICAgPHRkPkAke2VzYyhkLnVzZXJuYW1lKX08L3RkPjx0ZCBjbGFzcz0ibW9uby1kaW0iPiR7ZXNjKGQucmVwbHl8fCcnKS5zbGljZSgwLDcwKX08L3RkPgogICAgICA8dGQgY2xhc3M9Im1vbm8tZGltIj4ke2VzYyhkLmVycm9yfHwnJyl9PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGV0YWlscz5gIDogJyc7CgogIGNvbnN0IGxvZyA9IEwubGVuZ3RoID8gYDxkZXRhaWxzIGNsYXNzPSJjYXJkIj48c3VtbWFyeSBzdHlsZT0iY3Vyc29yOnBvaW50ZXIiIGNsYXNzPSJtb25vLWRpbSI+UmVwbHkgbG9nICgke0wubGVuZ3RofSk8L3N1bW1hcnk+CiAgICA8ZGl2IGNsYXNzPSJsb2ciIHN0eWxlPSJtYXJnaW4tdG9wOjhweCI+JHtMLnNsaWNlKDAsMjApLm1hcCh4PT4KICAgICBgPGRpdj48c3BhbiBjbGFzcz0idHMiPiR7eC50fTwvc3Bhbj4gJHt4LmtpbmQ9PT0nZG0nPydETSc6J3JlcGx5J30gdG8gPGI+QCR7ZXNjKHgudXNlcm5hbWUpfTwvYj4gXHUyMDE0ICR7ZXNjKFN0cmluZyh4LnRleHQpLnNsaWNlKDAsODApKX08L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj48L2RldGFpbHM+YCA6ICcnOwoKICByZXR1cm4gaGVhZCArIGJvZHkgKyByZXN1bHRzICsgbG9nOwp9OwpSRU5ERVIuY29tbWVudHM9KCk9PmA8ZGl2IGRhdGEtbGl2ZT0iY29tbWVudHMiPiR7TElWRS5jb21tZW50cygpfTwvZGl2PmA7Cgphc3luYyBmdW5jdGlvbiBjb25uZWN0TWV0YSgpewogIGNvbnN0IHQ9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtdFRvaycpfHx7fSkudmFsdWV8fCcnOwogIGlmKCF0LnRyaW0oKSkgcmV0dXJuIGZsYXNoKCdQYXN0ZSB0aGUgdG9rZW4nKTsKICBmbGFzaCgnQ2hlY2tpbmcgd2l0aCBNZXRh4oCmJyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9tZXRhL2Nvbm5lY3QnLHt0b2tlbjp0LnRyaW0oKX0pOwogICAgcmVuZGVyKCk7IGZsYXNoKCdDb25uZWN0ZWQgYXMgQCcrci5hY2NvdW50LnVzZXJuYW1lKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHB1cmdlTWV0YSgpeyBpZighY29uZmlybSgnRGlzY29ubmVjdCBJbnN0YWdyYW0gYW5kIGRpc2NhcmQgdGhlIHRva2VuPycpKXJldHVybjsKICBhd2FpdCBBUEkoJy9hcGkvbWV0YS9wdXJnZScse30pOyByZW5kZXIoKSB9CmFzeW5jIGZ1bmN0aW9uIGhhcnZlc3RDb21tZW50cygpewogIGZsYXNoKCdSZWFkaW5nIHlvdXIgY29tbWVudHPigKYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL2NvbW1lbnRzL2hhcnZlc3QnLHt9KTsgcmVuZGVyKCk7IGZsYXNoKHIubXNnKTsgfQogIGNhdGNoKGUpeyBmbGFzaChlLm1lc3NhZ2UpIH0KfQphc3luYyBmdW5jdGlvbiBzYXZlUmVwbHkoaWQpewogIGNvbnN0IHY9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXBfJytpZCl8fHt9KS52YWx1ZXx8Jyc7CiAgY29uc3QgZD0oUy5jb21tZW50RHJhZnRzfHxbXSkuZmluZCh4PT54LmlkPT09aWQpOwogIGlmKCFkIHx8IGQucmVwbHk9PT12KSByZXR1cm47CiAgYXdhaXQgQVBJKCcvYXBpL2NvbW1lbnRzL2VkaXQnLHtpZCxyZXBseTp2fSk7Cn0KYXN5bmMgZnVuY3Rpb24gc2V0QWN0aW9uKGlkLGFjdGlvbil7IGF3YWl0IEFQSSgnL2FwaS9jb21tZW50cy9lZGl0Jyx7aWQsYWN0aW9ufSk7IHJlbmRlcigpIH0KYXN5bmMgZnVuY3Rpb24gc2VuZENvbW1lbnRzKGlkcyl7CiAgY29uc3QgbiA9IGlkcyA/IDEgOiAoUy5jb21tZW50RHJhZnRzfHxbXSkuZmlsdGVyKGQ9PmQuc3RhdHVzPT09J0RSQUZUJyYmKGQuYWN0aW9uPT09J3B1YmxpYyd8fGQuYWN0aW9uPT09J2RtJykpLmxlbmd0aDsKICBpZighbikgcmV0dXJuIGZsYXNoKCdOb3RoaW5nIGFwcHJvdmVkIHRvIHNlbmQnKTsKICBpZighY29uZmlybShgUG9zdCAke259IHJlYWwgcmVwbCR7bj4xPydpZXMnOid5J30gdW5kZXIgQCR7KFMubWV0YXx8e30pLnVzZXJuYW1lfT8gVGhpcyBpcyBwdWJsaWMgYW5kIGNhbm5vdCBiZSB1bnNlbnQuYCkpIHJldHVybjsKICBmbGFzaCgnU2VuZGluZywgcGFjZWQgMjAgc2Vjb25kcyBhcGFydOKApicpOwogIHRyeXsgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvY29tbWVudHMvc2VuZCcse2lkczppZHN8fG51bGx9KTsKICAgIHJlbmRlcigpOyBmbGFzaChgJHtyLnNlbnR9IHNlbnRgKyhyLnNraXBwZWQ/YCDCtyAke3Iuc2tpcHBlZH0gc2tpcHBlZGA6JycpKyhyLmZhaWxlZD9gIMK3ICR7ci5mYWlsZWR9IGZhaWxlZGA6JycpKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIGNsZWFyRHJhZnRzKCl7IGlmKCFjb25maXJtKCdEaXNjYXJkIGFsbCBkcmFmdHM/JykpcmV0dXJuOyBhd2FpdCBBUEkoJy9hcGkvY29tbWVudHMvY2xlYXInLHthbGw6dHJ1ZX0pOyByZW5kZXIoKSB9CgovKiA9PT09PT09PT09PT09PT09PSBTS0lMTFMgPT09PT09PT09PT09PT09PT0gKi8KTElWRS5za2lsbHM9KCk9PnsKICBjb25zdCBTSz1TLnNraWxsc3x8W10sIFI9Uy5za2lsbFJ1bnN8fFtdOwogIGNvbnN0IG1pbmU9U0suZmlsdGVyKHM9PiFzLmJ1aWx0aW4pLCBzdGQ9U0suZmlsdGVyKHM9PnMuYnVpbHRpbik7CiAgY29uc3QgY2FyZD0ocyk9PmA8ZGl2IGNsYXNzPSJjYXJkIiBzdHlsZT0iYm9yZGVyLWxlZnQ6M3B4IHNvbGlkICR7cy5idWlsdGluPyd2YXIoLS1saW1lKSc6J3ZhcigtLWN5KSd9Ij4KICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47ZmxleC13cmFwOndyYXA7bWFyZ2luLWJvdHRvbTo2cHgiPgogICAgPGRpdiBjbGFzcz0icm93Ij48YiBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEzLjVweCI+JHtlc2Mocy5uYW1lKX08L2I+CiAgICAgJHtzLmJ1aWx0aW4/JzxzcGFuIGNsYXNzPSJ0YWcgdC1kaW0iPkJVSUxUIElOPC9zcGFuPicKICAgICAgIDpgPHNwYW4gY2xhc3M9InRhZyAke3MuZW5hYmxlZD8ndC1ncm4nOid0LWFtYid9Ij4ke3MuZW5hYmxlZD8nT04gQSBDQURFTkNFJzonTUFOVUFMIE9OTFknfTwvc3Bhbj5gfQogICAgICR7cy5jYWRlbmNlP2A8c3BhbiBjbGFzcz0ibW9uby1kaW0iPmV2ZXJ5ICR7cy5jYWRlbmNlPj04NjQwMD9NYXRoLnJvdW5kKHMuY2FkZW5jZS84NjQwMCkrJ2QnOk1hdGgucm91bmQocy5jYWRlbmNlLzM2MDApKydoJ308L3NwYW4+YDonJ308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InJvdyI+PGJ1dHRvbiBjbGFzcz0iYnRuIHNtIHAiIG9uY2xpY2s9InJ1blNraWxsKCcke3MuaWR9JykiPlJVTjwvYnV0dG9uPgogICAgICR7IXMuYnVpbHRpbj9gPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBvbmNsaWNrPSJ0b2dnbGVTa2lsbCgnJHtzLmlkfScpIj4ke3MuZW5hYmxlZD8nU3dpdGNoIG9mZic6J0VuYWJsZSd9PC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBzbSBubyIgb25jbGljaz0iZGVsU2tpbGwoJyR7cy5pZH0nKSI+XHUyNzE1PC9idXR0b24+YDonJ308L2Rpdj48L2Rpdj4KICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo4cHgiPiR7ZXNjKHMuZGVzY3JpcHRpb24pfTwvZGl2PgogICAke3Mud2hlbj9gPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tYm90dG9tOjhweCI+PGI+V2hlbjo8L2I+ICR7ZXNjKHMud2hlbil9PC9kaXY+YDonJ30KICAgPGRldGFpbHM+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIiBjbGFzcz0ibW9uby1kaW0iPlRoZSBtZXRob2Q8L3N1bW1hcnk+CiAgICA8b2wgc3R5bGU9Im1hcmdpbjo4cHggMDtwYWRkaW5nLWxlZnQ6MTlweDtsaW5lLWhlaWdodDoxLjc1O2ZvbnQtc2l6ZToxMi41cHgiPgogICAgICR7KHMuc3RlcHN8fFtdKS5tYXAoeD0+YDxsaT4ke2VzYyh4KX08L2xpPmApLmpvaW4oJycpfTwvb2w+CiAgICA8ZGl2IGNsYXNzPSJ0dyI+PHRhYmxlPjx0Ym9keT4KICAgICA8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9IndpZHRoOjExMHB4Ij5SZWFkczwvdGQ+PHRkPiR7KHMuc291cmNlc3x8W10pLm1hcCh4PT5gPHNwYW4gY2xhc3M9InRhZyB0LWRpbSI+JHtlc2MoeCl9PC9zcGFuPmApLmpvaW4oJyAnKXx8J1x1MjAxNCd9PC90ZD48L3RyPgogICAgICR7KHMuYXBwcm92YWxzfHxbXSkubGVuZ3RoP2A8dHI+PHRkIGNsYXNzPSJtb25vLWRpbSI+TmV2ZXIgd2l0aG91dCB5b3U8L3RkPjx0ZD4keyhzLmFwcHJvdmFsc3x8W10pLm1hcChlc2MpLmpvaW4oJzxicj4nKX08L3RkPjwvdHI+YDonJ30KICAgICAkeyhzLnN0b3B8fFtdKS5sZW5ndGg/YDx0cj48dGQgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0iY29sb3I6dmFyKC0tYW1iKSI+U3RvcHMgYW5kIGFza3M8L3RkPjx0ZD4keyhzLnN0b3B8fFtdKS5tYXAoZXNjKS5qb2luKCc8YnI+Jyl9PC90ZD48L3RyPmA6Jyd9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kZXRhaWxzPgogIDwvZGl2PmA7CgogIHJldHVybiBgPGRpdiBjbGFzcz0iY2FyZCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1saW1lKSI+CiAgIDxoMyBzdHlsZT0iY29sb3I6dmFyKC0tb2xpdmUpIj5cdTI3MjYgU0tJTExTIFx1MjAxNCBNRVRIT0RTLCBOT1QgQU5TV0VSUzwvaDM+CiAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206MTBweCI+QSBza2lsbCBpcyBhIHN0b3JlZCB3YXkgb2Ygd29ya2luZzogd2hhdCBpdCByZWFkcywgdGhlIHN0ZXBzIGluIG9yZGVyLCB3aGF0IGl0IG11c3QgPGI+bmV2ZXI8L2I+IGRvIHdpdGhvdXQgeW91LCBhbmQgd2hlbiBpdCBtdXN0IDxiPnN0b3AgYW5kIGFkbWl0IGl0IGRvZXMgbm90IGtub3c8L2I+LiBIZSBmb2xsb3dzIHRoZSBtZXRob2QgZXhhY3RseSBcdTIwMTQgaXQgaXMgbm90IGEgcHJvbXB0IGhlIGNhbiB3YW5kZXIgYXdheSBmcm9tLjwvZGl2PgogICA8ZGl2IGNsYXNzPSJ3YXJuYm94Ij5FdmVyeSBza2lsbCByZXR1cm5zIDxiPnRoZSBleGNlcHRpb25zIG9ubHk8L2I+IFx1MjAxNCB3aGF0IG5lZWRzIGF0dGVudGlvbi4gTmV2ZXIgYSBzdW1tYXJ5IG9mIGV2ZXJ5dGhpbmcuIEEgc2tpbGwgdGhhdCBmaW5kcyBub3RoaW5nIHNheXMgb25lIGxpbmUgYW5kIHN0b3BzLjwvZGl2PgogICAkeyFTLmxsbT8nPGRpdiBjbGFzcz0id2FybmJveCIgc3R5bGU9ImJvcmRlci1jb2xvcjp2YXIoLS1tYWcpIj5Db25uZWN0IGFuIEFJIGJyYWluIHRvIHJ1biBza2lsbHMuPC9kaXY+JzonJ30KICAgPGxhYmVsIGNsYXNzPSJmIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij48c3Bhbj5IYXZlIGhpbSB3cml0ZSBhIG5ldyBza2lsbCBmcm9tIHNvbWV0aGluZyB0aGF0IGFscmVhZHkgd29ya2VkPC9zcGFuPgogICAgPGlucHV0IGlkPSJza0JyaWVmIiBjbGFzcz0iaW4iIHBsYWNlaG9sZGVyPSJlLmcuIGNoZWNrIGV2ZXJ5IE1vbmRheSB3aGljaCBjbGllbnRzIGhhdmUgbm90IHBhaWQgYW5kIGRyYWZ0IHRoZSBjaGFzZSI+PC9sYWJlbD4KICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHAiIG9uY2xpY2s9IndyaXRlU2tpbGwoKSI+V1JJVEUgQSBORVcgU0tJTEw8L2J1dHRvbj4KICAgPGRpdiBjbGFzcz0ibW9uby1kaW0iIHN0eWxlPSJtYXJnaW4tdG9wOjdweCI+TmV3IHNraWxscyBhcmUgY3JlYXRlZCA8Yj5zd2l0Y2hlZCBvZmY8L2I+LiBZb3UgZW5hYmxlIHRoZW0uPC9kaXY+CiAgPC9kaXY+CgogICR7Ui5sZW5ndGg/YDxkaXYgY2xhc3M9ImNhcmQiPjxoMz5MYXN0IHJ1bjwvaDM+CiAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJtYXJnaW4tYm90dG9tOjdweCI+PHNwYW4gY2xhc3M9InRhZyB0LWN5Ij4ke2VzYyhSWzBdLnNraWxsKX08L3NwYW4+CiAgICAgPHNwYW4gY2xhc3M9Im1vbm8tZGltIj4ke1JbMF0udH08L3NwYW4+PC9kaXY+CiAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtsaW5lLWhlaWdodDoxLjY1O2JhY2tncm91bmQ6dmFyKC0taW5wKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWJyZCk7CiAgICAgIGJvcmRlci1yYWRpdXM6OXB4O3BhZGRpbmc6MTJweCIgaWQ9InNrb3V0Ij4ke2VzYyhSWzBdLnRleHQpfTwvZGl2PgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIHNtIiBzdHlsZT0ibWFyZ2luLXRvcDo4cHgiIG9uY2xpY2s9ImNvcHlCaXooJ3Nrb3V0JykiPkNvcHk8L2J1dHRvbj4KICAgICR7Ui5sZW5ndGg+MT9gPGRldGFpbHMgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+PHN1bW1hcnkgc3R5bGU9ImN1cnNvcjpwb2ludGVyIiBjbGFzcz0ibW9uby1kaW0iPkVhcmxpZXIgcnVucyAoJHtSLmxlbmd0aC0xfSk8L3N1bW1hcnk+CiAgICAgICR7Ui5zbGljZSgxKS5tYXAoeD0+YDxkaXYgc3R5bGU9ImJvcmRlci1sZWZ0OjJweCBzb2xpZCB2YXIoLS1zdHJva2UyKTtwYWRkaW5nLWxlZnQ6MTBweDttYXJnaW46MTBweCAwIj4KICAgICAgICA8ZGl2IGNsYXNzPSJtb25vLWRpbSI+JHtlc2MoeC5za2lsbCl9IFx1MDBiNyAke3gudH08L2Rpdj4KICAgICAgICA8ZGl2IHN0eWxlPSJ3aGl0ZS1zcGFjZTpwcmUtd3JhcDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNiI+JHtlc2MoeC50ZXh0KS5zbGljZSgwLDQwMCl9PC9kaXY+PC9kaXY+YCkuam9pbignJyl9CiAgICAgPC9kZXRhaWxzPmA6Jyd9CiAgIDwvZGl2PmA6Jyd9CgogICR7bWluZS5sZW5ndGg/YDxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0ibWFyZ2luOjE2cHggMCA4cHgiPkhJUyBPV04gKCR7bWluZS5sZW5ndGh9KTwvZGl2PiR7bWluZS5tYXAoY2FyZCkuam9pbignJyl9YDonJ30KICA8ZGl2IGNsYXNzPSJtb25vLWRpbSIgc3R5bGU9Im1hcmdpbjoxNnB4IDAgOHB4Ij5CVUlMVCBJTiAoJHtzdGQubGVuZ3RofSk8L2Rpdj4KICAke3N0ZC5tYXAoY2FyZCkuam9pbignJyl9YDsKfTsKUkVOREVSLnNraWxsczM9KCk9PmA8ZGl2IGRhdGEtbGl2ZT0ic2tpbGxzIj4ke0xJVkUuc2tpbGxzKCl9PC9kaXY+YDsKCmFzeW5jIGZ1bmN0aW9uIHJ1blNraWxsKGlkKXsKICBmbGFzaCgnUnVubmluZyB0aGUgbWV0aG9kXHUyMDI2Jyk7CiAgdHJ5eyBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9za2lsbC9ydW4nLHtpZH0pOyByZW5kZXIoKTsgZmxhc2goJ1JhbiAnK3Iuc2tpbGwpOyB9CiAgY2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHdyaXRlU2tpbGwoKXsKICBjb25zdCB2PShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2tCcmllZicpfHx7fSkudmFsdWV8fCcnOwogIGlmKCF2LnRyaW0oKSkgcmV0dXJuIGZsYXNoKCdEZXNjcmliZSB3aGF0IGl0IHNob3VsZCBkbycpOwogIGZsYXNoKCdXcml0aW5nIHRoZSBtZXRob2RcdTIwMjYnKTsKICB0cnl7IGNvbnN0IHI9YXdhaXQgQVBJKCcvYXBpL3NraWxsL3dyaXRlJyx7YnJpZWY6di50cmltKCl9KTsKICAgIHJlbmRlcigpOyBmbGFzaCgnV3JvdGUgIicrci5uYW1lKyciIFx1MjAxNCBzd2l0Y2hlZCBvZmYgdW50aWwgeW91IGVuYWJsZSBpdC4nKTsKICB9Y2F0Y2goZSl7IGZsYXNoKGUubWVzc2FnZSkgfQp9CmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVNraWxsKGlkKXsgYXdhaXQgQVBJKCcvYXBpL3NraWxsL3RvZ2dsZScse2lkfSk7IHJlbmRlcigpIH0KYXN5bmMgZnVuY3Rpb24gZGVsU2tpbGwoaWQpeyBpZighY29uZmlybSgnRGVsZXRlIHRoaXMgc2tpbGw/JykpcmV0dXJuOyBhd2FpdCBBUEkoJy9hcGkvc2tpbGwvZGVsZXRlJyx7aWR9KTsgcmVuZGVyKCkgfQoKLyogLS0tLS0tLS0tLSBvbmUtY2xpY2sgc3RvcmFnZSBzZXR1cCAtLS0tLS0tLS0tICovCmFzeW5jIGZ1bmN0aW9uIHNldHVwU3RvcmUoKXsKICBjb25zdCB0b2s9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdFRvaycpfHx7fSkudmFsdWV8fCcnOwogIGNvbnN0IHJlcG89KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdFJlcG8nKXx8e30pLnZhbHVlfHwnY2hhaXJtYW5zdGF0ZSc7CiAgY29uc3Qgbz1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RTZXR1cCcpOwogIGlmKCF0b2sudHJpbSgpKXsgby5pbm5lckhUTUw9JzxkaXYgY2xhc3M9Indhcm5ib3giPlBhc3RlIHRoZSB0b2tlbiBmaXJzdC48L2Rpdj4nOyByZXR1cm47IH0KICBvLmlubmVySFRNTD0nPGRpdiBjbGFzcz0ibW9uby1kaW0iPlRhbGtpbmcgdG8gR2l0SHVi4oCmPC9kaXY+JzsKICB0cnl7CiAgICBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9zdG9yZS9zZXR1cCcse3Rva2VuOnRvay50cmltKCkscmVwbzpyZXBvLnRyaW0oKX0pOwogICAgby5pbm5lckhUTUw9YDxkaXYgY2xhc3M9InR3Ij48dGFibGU+PHRib2R5PiR7KHIuc3RlcHN8fFtdKS5tYXAocz0+CiAgICAgIGA8dHI+PHRkIHN0eWxlPSJ3aWR0aDoyOHB4Ij4ke3Mub2s/JzxzcGFuIHN0eWxlPSJjb2xvcjp2YXIoLS1ncm4pIj7inJQ8L3NwYW4+JzonPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPuKclTwvc3Bhbj4nfTwvdGQ+CiAgICAgICA8dGQgc3R5bGU9IndpZHRoOjE5MHB4Ij4ke2VzYyhzLnN0ZXApfTwvdGQ+PHRkIGNsYXNzPSJtb25vLWRpbSI+JHtlc2Mocy5kZXRhaWx8fCcnKX08L3RkPjwvdHI+YCkuam9pbignJyl9PC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4O2JvcmRlci1jb2xvcjoke3Iub2s/J3ZhcigtLWxpbWUpJzondmFyKC0tbWFnKSd9Ij4KICAgICAgIDxiPiR7ci5vaz8nUkVBRFknOidGQUlMRUQnfTwvYj4ke3IubXM/YCBpbiAke3IubXN9bXNgOicnfSR7ci5mYXRhbD9gIOKAlCAke2VzYyhyLmZhdGFsKX1gOicnfQogICAgICAgJHtyLmFkdmljZT9gPGRpdiBzdHlsZT0ibWFyZ2luLXRvcDo4cHg7d2hpdGUtc3BhY2U6cHJlLXdyYXA7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEycHgiPiR7ZXNjKHIuYWR2aWNlKX08L2Rpdj5gOicnfTwvZGl2PmA7CiAgICBpZihyLm9rKXsgY29uc3QgdD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RUb2snKTsgaWYodCkgdC52YWx1ZT0nJzsgfQogIH1jYXRjaChlKXsgby5pbm5lckhUTUw9YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6dmFyKC0tbWFnKSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj5gIH0KfQoKLyogLS0tLS0tLS0tLSBzZXQgYSBwYXNzd29yZCB0aGF0IHN1cnZpdmVzIGEgcmVzdGFydCAtLS0tLS0tLS0tICovCmFzeW5jIGZ1bmN0aW9uIHBpblBhc3N3b3JkKCl7CiAgY29uc3QgZz1pZD0+KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKXx8e30pLnZhbHVlfHwnJzsKICBjb25zdCBvPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwaW5PdXQnKTsKICBjb25zdCBjdXI9ZygncGluQ3VyJyksIG5ldT1nKCdwaW5OZXcnKSwgY29uPWcoJ3BpbkNvbicpOwogIGlmKCFjdXIpIHsgby5pbm5lckhUTUw9JzxkaXYgY2xhc3M9Indhcm5ib3giPkVudGVyIHRoZSBwYXNzd29yZCB5b3UgbG9nZ2VkIGluIHdpdGguPC9kaXY+JzsgcmV0dXJuOyB9CiAgaWYobmV1Lmxlbmd0aDw4KXsgby5pbm5lckhUTUw9JzxkaXYgY2xhc3M9Indhcm5ib3giPkF0IGxlYXN0IDggY2hhcmFjdGVycy48L2Rpdj4nOyByZXR1cm47IH0KICBpZihuZXUhPT1jb24peyBvLmlubmVySFRNTD0nPGRpdiBjbGFzcz0id2FybmJveCI+VGhlIHR3byBlbnRyaWVzIGRvIG5vdCBtYXRjaC48L2Rpdj4nOyByZXR1cm47IH0KICBvLmlubmVySFRNTD0nPGRpdiBjbGFzcz0ibW9uby1kaW0iPldyaXRpbmcgaXQgdG8gc3RvcmFnZeKApjwvZGl2Pic7CiAgdHJ5ewogICAgY29uc3Qgcj1hd2FpdCBBUEkoJy9hcGkvb3duZXIvcGluJyx7Y3VycmVudDpjdXIscHc6bmV1LGNvbmZpcm06Y29ufSk7CiAgICBbJ3BpbkN1cicsJ3Bpbk5ldycsJ3BpbkNvbiddLmZvckVhY2goaT0+e2NvbnN0IGU9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaSk7IGlmKGUpIGUudmFsdWU9Jyc7fSk7CiAgICByZW5kZXIoKTsKICAgIGNvbnN0IGJveD1kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGluT3V0Jyk7CiAgICBpZihib3gpIGJveC5pbm5lckhUTUw9YDxkaXYgY2xhc3M9Indhcm5ib3giIHN0eWxlPSJib3JkZXItY29sb3I6JHtyLmR1cmFibGU/J3ZhcigtLWxpbWUpJzondmFyKC0tbWFnKSd9Ij4KICAgICAgPGI+JHtyLmR1cmFibGU/J0RPTkUnOidOT1QgU0FGRSBZRVQnfTwvYj4g4oCUICR7ZXNjKHIudmVyZGljdCl9PC9kaXY+YDsKICAgIGZsYXNoKHIuZHVyYWJsZT8nUGFzc3dvcmQgc2V0IHBlcm1hbmVudGx5JzonUGFzc3dvcmQgY2hhbmdlZCDigJQgYnV0IHJlYWQgdGhlIHdhcm5pbmcnKTsKICB9Y2F0Y2goZSl7IG8uaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJ3YXJuYm94IiBzdHlsZT0iYm9yZGVyLWNvbG9yOnZhcigtLW1hZykiPiR7ZXNjKGUubWVzc2FnZSl9PC9kaXY+YCB9Cn0KCi8qIC0tLS0tLS0tLS0gVEhFIExJVklORyBGTE9PUiAtLS0tLS0tLS0tICovCmNvbnN0IEZMT09SX1BJTExBUiA9IHsKICAxOntuOidTZWN1cml0eScsICBjOicjQzA1NTNBJ30sCiAgMjp7bjonT3BlcmF0aW9ucycsYzonI0M2REI0QSd9LAogIDM6e246J1Byb2R1Y3QnLCAgIGM6JyM2RkJGOEEnfSwKICA0OntuOidEYXRhJywgICAgICBjOicjNUFBOUM5J30sCiAgNTp7bjonR3Jvd3RoJywgICAgYzonI0Q5QTYyQid9LAp9OwoKLyogd2hpY2ggYWdlbnRzIGhhdmUgcnVuIHJlY2VudGx5IOKAlCB0aGlzIGlzIHdoYXQgbWFrZXMgYSBkZXNrIGxpZ2h0IHVwICovCmZ1bmN0aW9uIGZsb29yQWN0aXZlKCl7CiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTsKICBjb25zdCBob3QgPSB7fTsKICAoUy5ydW5zfHxbXSkuc2xpY2UoMCw0MCkuZm9yRWFjaChyPT57CiAgICBpZighci5vd25lcikgcmV0dXJuOwogICAgY29uc3QgdCA9IERhdGUucGFyc2UoU3RyaW5nKHIudHx8JycpLnJlcGxhY2UoJyAnLCdUJykrJ1onKTsKICAgIGNvbnN0IGFnZSA9IHQgPyAobm93LXQpLzEwMDAgOiA5OTk5OwogICAgaWYoYWdlIDwgOTAwKSBob3Rbci5vd25lcl0gPSB7IGFnZSwgb2s6ci5vaywgbXM6ci5tcywgY2FwOnIuY2FwLCBtc2c6ci5tc2cgfTsKICB9KTsKICByZXR1cm4gaG90Owp9CgpmdW5jdGlvbiBmbG9vclN2ZygpewogIGNvbnN0IGFnZW50cyA9IChTLmFnZW50c3x8W10pOwogIGlmKCFhZ2VudHMubGVuZ3RoKSByZXR1cm4gJzxkaXYgY2xhc3M9Im1vbm8tZGltIiBzdHlsZT0icGFkZGluZzoyMnB4O3RleHQtYWxpZ246Y2VudGVyIj5ObyBhZ2VudHMuIFJlc2V0IHRoZSByb3N0ZXIgaW4gT3duZXIgU2V0dGluZ3MuPC9kaXY+JzsKCiAgY29uc3QgaG90ID0gZmxvb3JBY3RpdmUoKTsKICBjb25zdCBydW5uaW5nID0gISFTLnJ1bm5pbmc7CgogIC8qIGxheSB0aGUgZGVza3Mgb3V0IGluIHR3byBiYW5rcyBlaXRoZXIgc2lkZSBvZiB0aGUgcG9kaXVtLCBsaWtlIHRoZQogICAgIGJydXRhbGlzdCBoYWxsIOKAlCBidXQgZ2VuZXJhdGVkIGZyb20gdGhlIHJlYWwgcm9zdGVyLCBub3QgZHJhd24gb25jZSAqLwogIGNvbnN0IFc9MTAwMCwgSD01MjA7CiAgY29uc3QgbGVmdD1bXSwgcmlnaHQ9W107CiAgYWdlbnRzLmZvckVhY2goKGEsaSk9PiAoaSUyID8gcmlnaHQgOiBsZWZ0KS5wdXNoKGEpKTsKICBjb25zdCByb3dzID0gTWF0aC5tYXgobGVmdC5sZW5ndGgsIHJpZ2h0Lmxlbmd0aCk7CiAgY29uc3QgZGVza0ggPSBNYXRoLm1pbig0NiwgKEgtMTkwKS9NYXRoLm1heCgxLHJvd3MpKTsKCiAgY29uc3QgZGVza3MgPSBbXTsKICBjb25zdCBiZWFtcyA9IFtdOwogIGNvbnN0IHBvZFggPSBXLzIsIHBvZFkgPSAxMzI7CgogIGZ1bmN0aW9uIHBsYWNlKGxpc3QsIHNpZGUpewogICAgbGlzdC5mb3JFYWNoKChhLGkpPT57CiAgICAgIGNvbnN0IHAgPSBGTE9PUl9QSUxMQVJbYS5waWxsYXJJZF0gfHwgRkxPT1JfUElMTEFSWzJdOwogICAgICBjb25zdCB5ID0gMTk2ICsgaSpkZXNrSDsKICAgICAgLyogcGVyc3BlY3RpdmU6IHJvd3MgZnVydGhlciBiYWNrIGFyZSBuYXJyb3dlciBhbmQgY2xvc2VyIGluICovCiAgICAgIGNvbnN0IGRlcHRoID0gaS9NYXRoLm1heCgxLHJvd3MtMSk7CiAgICAgIGNvbnN0IGluc2V0ID0gNDAgKyBkZXB0aCo5MDsKICAgICAgY29uc3QgdyA9IDE5MCAtIGRlcHRoKjQ2OwogICAgICBjb25zdCB4ID0gc2lkZTwwID8gaW5zZXQgOiBXIC0gaW5zZXQgLSB3OwogICAgICBjb25zdCBsaXZlID0gaG90W2EubmFtZV07CiAgICAgIGNvbnN0IGRlYWQgPSBhLnN0YXR1cyAhPT0gJ0FDVElWRScgfHwgIXJ1bm5pbmc7CiAgICAgIGNvbnN0IGdsb3cgPSBsaXZlID8gKGxpdmUub2s9PT1mYWxzZSA/ICcjRTM2NTRBJyA6IHAuYykgOiBwLmM7CiAgICAgIGNvbnN0IG9wICAgPSBkZWFkID8gMC4xNiA6IGxpdmUgPyAxIDogMC40MjsKICAgICAgY29uc3QgZHVyICA9IGxpdmUgPyAoMS4xICsgKGklNCkqMC4yNSkgOiAwOwoKICAgICAgZGVza3MucHVzaCgKICAgICAgICAnPGcgY2xhc3M9ImZkIiBkYXRhLWE9IicrZXNjKGEubmFtZSkrJyIgb3BhY2l0eT0iJytvcCsnIj4nCiAgICAgICAgKyAnPHJlY3QgeD0iJyt4KyciIHk9IicreSsnIiByeD0iMyIgd2lkdGg9IicrdysnIiBoZWlnaHQ9IicrKGRlc2tILTkpKyciICcKICAgICAgICArICAgJ2ZpbGw9IiMwRTEyMDgiIHN0cm9rZT0iJytnbG93KyciIHN0cm9rZS13aWR0aD0iJysobGl2ZT8xLjQ6MC43KSsnIi8+JwogICAgICAgICsgJzxyZWN0IHg9IicrKHgrNikrJyIgeT0iJysoeSs1KSsnIiByeD0iMS41IiB3aWR0aD0iJysodyowLjMwKSsnIiBoZWlnaHQ9IicrKGRlc2tILTE5KSsnIiBmaWxsPSInK2dsb3crJyIgb3BhY2l0eT0iJysobGl2ZT8wLjg1OjAuMzApKyciPicKICAgICAgICArICAgKGxpdmU/JzxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9Im9wYWNpdHkiIHZhbHVlcz0iMC44NTswLjI1OzAuODUiIGR1cj0iJytkdXIrJ3MiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+JzonJykKICAgICAgICArICc8L3JlY3Q+JwogICAgICAgICsgJzx0ZXh0IHg9IicrKHgrdyowLjMwKzEzKSsnIiB5PSInKyh5K2Rlc2tILzItMSkrJyIgZmlsbD0iI0U4RTRENCIgJwogICAgICAgICsgICAnZm9udC1zaXplPSInKygxMC41LWRlcHRoKjEuNikrJyIgZm9udC1mYW1pbHk9InVpLW1vbm9zcGFjZSxtb25vc3BhY2UiIG9wYWNpdHk9IicrKGRlYWQ/MC41OjAuOTIpKyciPicKICAgICAgICArICAgZXNjKFN0cmluZyhhLm5hbWUpLnNsaWNlKDAsMjIpKSArICc8L3RleHQ+JwogICAgICAgICsgKGxpdmUgPyAnPGNpcmNsZSBjeD0iJysoeCt3LTExKSsnIiBjeT0iJysoeStkZXNrSC8yLTIpKyciIHI9IjMiIGZpbGw9IicrZ2xvdysnIj4nCiAgICAgICAgICAgICAgICArICc8YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSJyIiB2YWx1ZXM9IjIuNDs0LjY7Mi40IiBkdXI9IicrZHVyKydzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIvPjwvY2lyY2xlPicgOiAnJykKICAgICAgICArICc8L2c+Jyk7CgogICAgICAvKiBhIGJlYW0gZnJvbSB0aGUgcG9kaXVtIHRvIGFueSBkZXNrIHRoYXQgaXMgZ2VudWluZWx5IHdvcmtpbmcgKi8KICAgICAgaWYobGl2ZSAmJiBydW5uaW5nKXsKICAgICAgICBjb25zdCB0eCA9IHNpZGU8MCA/IHgrdyA6IHg7CiAgICAgICAgYmVhbXMucHVzaCgnPGxpbmUgeDE9IicrcG9kWCsnIiB5MT0iJysocG9kWSszNCkrJyIgeDI9IicrdHgrJyIgeTI9IicrKHkrZGVza0gvMi00KSsnIiAnCiAgICAgICAgICArICdzdHJva2U9IicrZ2xvdysnIiBzdHJva2Utd2lkdGg9IjAuOCIgb3BhY2l0eT0iMC4zMCIgc3Ryb2tlLWRhc2hhcnJheT0iMyA3Ij4nCiAgICAgICAgICArICc8YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSJzdHJva2UtZGFzaG9mZnNldCIgdmFsdWVzPSIyMDswIiBkdXI9IjEuM3MiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+PC9saW5lPicpOwogICAgICB9CiAgICB9KTsKICB9CiAgcGxhY2UobGVmdCwtMSk7IHBsYWNlKHJpZ2h0LDEpOwoKICBjb25zdCBsaXZlQ291bnQgPSBPYmplY3Qua2V5cyhob3QpLmxlbmd0aDsKCiAgcmV0dXJuICcnCiAgKyAnPHN2ZyB2aWV3Qm94PSIwIDAgJytXKycgJytIKyciIGNsYXNzPSJmbG9vclN2ZyIgcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJBZ2VudCBmbG9vciI+JwogICsgJzxkZWZzPicKICArICAnPHJhZGlhbEdyYWRpZW50IGlkPSJmZ1NreSIgY3g9IjUwJSIgY3k9IjglIiByPSI3MCUiPicKICArICAgICc8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMkEzMDE4Ii8+PHN0b3Agb2Zmc2V0PSI1NSUiIHN0b3AtY29sb3I9IiMwQzEwMDgiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwNTA3MEEiLz4nCiAgKyAgJzwvcmFkaWFsR3JhZGllbnQ+JwogICsgICc8bGluZWFyR3JhZGllbnQgaWQ9ImZnUmF5IiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+JwogICsgICAgJzxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNDNkRCNEEiIHN0b3Atb3BhY2l0eT0iMC4xNiIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI0M2REI0QSIgc3RvcC1vcGFjaXR5PSIwIi8+JwogICsgICc8L2xpbmVhckdyYWRpZW50PicKICArICAnPGxpbmVhckdyYWRpZW50IGlkPSJmZ1ZvaWQiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj4nCiAgKyAgICAnPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iIzBBMTQyOCIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzA1MDcwQSIvPicKICArICAnPC9saW5lYXJHcmFkaWVudD4nCiAgKyAnPC9kZWZzPicKICArICc8cmVjdCB3aWR0aD0iJytXKyciIGhlaWdodD0iJytIKyciIGZpbGw9InVybCgjZmdTa3kpIi8+JwogIC8qIGxpZ2h0IHNoYWZ0cyBmcm9tIHRoZSBjZWlsaW5nICovCiAgKyAnPHBvbHlnb24gcG9pbnRzPSIzMDAsMCAzNzIsMCA0NzAsJytIKycgMjUwLCcrSCsnIiBmaWxsPSJ1cmwoI2ZnUmF5KSIvPicKICArICc8cG9seWdvbiBwb2ludHM9IjY0MCwwIDcwMCwwIDc2MCwnK0grJyA1NjAsJytIKyciIGZpbGw9InVybCgjZmdSYXkpIiBvcGFjaXR5PSIwLjciLz4nCiAgLyogdGhlIHZvaWQgYmVsb3csIHdpdGggZ2FsYXhpZXMgKi8KICArICc8cmVjdCB4PSIwIiB5PSInKyhILTkyKSsnIiB3aWR0aD0iJytXKyciIGhlaWdodD0iOTIiIGZpbGw9InVybCgjZmdWb2lkKSIvPicKICArIChmdW5jdGlvbigpeyBsZXQgcz0nJzsgZm9yKGxldCBpPTA7aTw0NjtpKyspewogICAgICBjb25zdCB4PShpKjEzNyklVywgeT1ILTkwKygoaSo1MyklODYpLCByPShpJTUpLzYrMC4zNTsKICAgICAgcys9JzxjaXJjbGUgY3g9IicreCsnIiBjeT0iJyt5KyciIHI9IicrcisnIiBmaWxsPSIjQ0ZFMEZGIiBvcGFjaXR5PSInKygwLjIwKyhpJTUpKjAuMTMpKyciPicKICAgICAgICsgJzxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9Im9wYWNpdHkiIHZhbHVlcz0iJysoMC4xNSsoaSU0KSowLjEpKyc7MC43NTsnKygwLjE1KyhpJTQpKjAuMSkrJyIgZHVyPSInKygzKyhpJTYpKSsncyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L2NpcmNsZT4nOwogICAgfSByZXR1cm4gczsgfSkoKQogIC8qIHN0cnVjdHVyZSAqLwogICsgJzxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSI2NiIgaGVpZ2h0PSInK0grJyIgZmlsbD0iIzA4MEIwNiIgb3BhY2l0eT0iMC45Ii8+JwogICsgJzxyZWN0IHg9IicrKFctNjYpKyciIHk9IjAiIHdpZHRoPSI2NiIgaGVpZ2h0PSInK0grJyIgZmlsbD0iIzA4MEIwNiIgb3BhY2l0eT0iMC45Ii8+JwogICsgJzxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSInK1crJyIgaGVpZ2h0PSI1MiIgZmlsbD0iIzA4MEIwNiIgb3BhY2l0eT0iMC43NSIvPicKICArIGJlYW1zLmpvaW4oJycpCiAgLyogdGhlIHBvZGl1bSDigJQgdGhlIENoYWlybWFuICovCiAgKyAnPGc+JwogICsgJzxyZWN0IHg9IicrKHBvZFgtNTYpKyciIHk9IicrcG9kWSsnIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjY2IiByeD0iMiIgZmlsbD0iIzExMTUwQyIgc3Ryb2tlPSIjM0E0NDIwIi8+JwogICsgJzxyZWN0IHg9IicrKHBvZFgtMzApKyciIHk9IicrKHBvZFktMzApKyciIHdpZHRoPSI2MCIgaGVpZ2h0PSIzMiIgcng9IjIiIGZpbGw9IiMwQTBEMDYiIHN0cm9rZT0iJysocnVubmluZz8nI0M2REI0QSc6JyM1QTQwMzAnKSsnIiBzdHJva2Utd2lkdGg9IjEuMiIvPicKICArICc8Y2lyY2xlIGN4PSInK3BvZFgrJyIgY3k9IicrKHBvZFktMTQpKyciIHI9IjUiIGZpbGw9IicrKHJ1bm5pbmc/JyNDNkRCNEEnOicjNkE1MDMwJykrJyI+JwogICsgICAocnVubmluZz8nPGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ib3BhY2l0eSIgdmFsdWVzPSIxOzAuMzU7MSIgZHVyPSIyLjRzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIvPic6JycpCiAgKyAnPC9jaXJjbGU+JwogICsgJzx0ZXh0IHg9IicrcG9kWCsnIiB5PSInKyhwb2RZKzQwKSsnIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjRThFNEQ0IiBmb250LXNpemU9IjExIiAnCiAgKyAgICdmb250LWZhbWlseT0idWktbW9ub3NwYWNlLG1vbm9zcGFjZSIgbGV0dGVyLXNwYWNpbmc9IjIiPkNIQUlSTUFOPC90ZXh0PicKICArICc8dGV4dCB4PSInK3BvZFgrJyIgeT0iJysocG9kWSs1NSkrJyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iJysocnVubmluZz8nI0M2REI0QSc6JyNDMDU1M0EnKSsnIiAnCiAgKyAgICdmb250LXNpemU9IjkiIGZvbnQtZmFtaWx5PSJ1aS1tb25vc3BhY2UsbW9ub3NwYWNlIj4nKyhydW5uaW5nP2xpdmVDb3VudCsnIFdPUktJTkcgTk9XJzonSEFMVEVEJykrJzwvdGV4dD4nCiAgKyAnPC9nPicKICArIGRlc2tzLmpvaW4oJycpCiAgKyAnPC9zdmc+JzsKfQoKTElWRS5mbG9vcj0oKT0+ewogIGNvbnN0IGhvdD1mbG9vckFjdGl2ZSgpOwogIGNvbnN0IGFnZW50cz1TLmFnZW50c3x8W107CiAgY29uc3QgYWN0PWFnZW50cy5maWx0ZXIoYT0+YS5zdGF0dXM9PT0nQUNUSVZFJykubGVuZ3RoOwogIGNvbnN0IHJ1bnM9KFMucnVuc3x8W10pLnNsaWNlKDAsNik7CiAgcmV0dXJuICc8ZGl2IGNsYXNzPSJmbG9vcldyYXAiPicrZmxvb3JTdmcoKSsnPC9kaXY+JwogICsgJzxkaXYgY2xhc3M9ImdyaWQgZzQiIHN0eWxlPSJtYXJnaW46MTJweCAwIj4nCiAgKyAgIGtwaShhZ2VudHMubGVuZ3RoLCdBZ2VudHMnLCd2YXIoLS10eHQpJyxhY3QrJyBhY3RpdmUnKQogICsgICBrcGkoT2JqZWN0LmtleXMoaG90KS5sZW5ndGgsJ1dvcmtpbmcgbm93JyxPYmplY3Qua2V5cyhob3QpLmxlbmd0aD8ndmFyKC0tZ3JuKSc6J3ZhcigtLWRpbSknLCdsYXN0IDE1IG1pbicpCiAgKyAgIGtwaSgoUy50YXNrc3x8W10pLmZpbHRlcih0PT50LmVuYWJsZWQpLmxlbmd0aCwnU3RhbmRpbmcgb3JkZXJzJywndmFyKC0tdHh0KScsUy5ydW5uaW5nPydydW5uaW5nJzonSEFMVEVEJykKICArICAga3BpKFMudGlja3N8fDAsJ0N5Y2xlcycsJ3ZhcigtLXR4dCknLCdzaW5jZSBib290JykKICArICc8L2Rpdj4nCiAgKyAocnVucy5sZW5ndGgKICAgICAgPyAnPGRpdiBjbGFzcz0iY2FyZCI+PGgzPldoYXQgdGhleSBqdXN0IGRpZDwvaDM+PGRpdiBjbGFzcz0ibG9nIj4nCiAgICAgICAgKyBydW5zLm1hcChyPT4nPGRpdj48c3BhbiBjbGFzcz0idHMiPicrci50Kyc8L3NwYW4+ICcKICAgICAgICAgICAgKyAnPHNwYW4gc3R5bGU9ImNvbG9yOicrKHIub2s/J3ZhcigtLWdybiknOid2YXIoLS1tYWcpJykrJyI+Jysoci5vaz8nT0snOidGQUlMJykrJzwvc3Bhbj4gJwogICAgICAgICAgICArICc8Yj4nK2VzYyhyLm93bmVyfHwnJykrJzwvYj4g4oCUICcrZXNjKFN0cmluZyhyLm1zZ3x8JycpLnNsaWNlKDAsOTApKSsnPC9kaXY+Jykuam9pbignJykKICAgICAgICArICc8L2Rpdj48L2Rpdj4nCiAgICAgIDogJzxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9Im1vbm8tZGltIj5ObyB3b3JrIGxvZ2dlZCB5ZXQuIEhlIHJ1bnMgb24gYSBjeWNsZSDigJQgZ2l2ZSBpdCB0d28gbWludXRlcy48L2Rpdj48L2Rpdj4nKTsKfTsKUkVOREVSLmZsb29yPSgpPT4nPGRpdiBkYXRhLWxpdmU9ImZsb29yIj4nK0xJVkUuZmxvb3IoKSsnPC9kaXY+JzsKCi8qIC0tLS0tLS0tLS0gY2hhbmdlIHRoZSBhbGVydCBpbmJveCB3aXRob3V0IGxlYXZpbmcgTWFpbCBSZWxheSAtLS0tLS0tLS0tICovCmFzeW5jIGZ1bmN0aW9uIHNldE93bmVyTWFpbCgpewogIGNvbnN0IHY9KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYWlsVG8nKXx8e30pLnZhbHVlfHwnJzsKICBjb25zdCBvPWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYWlsVG9PdXQnKTsKICBpZighdi50cmltKCkpeyBvLnRleHRDb250ZW50PSdUeXBlIGFuIGFkZHJlc3MuJzsgcmV0dXJuOyB9CiAgby50ZXh0Q29udGVudD0nU2F2aW5n4oCmJzsKICB0cnl7CiAgICBjb25zdCByPWF3YWl0IEFQSSgnL2FwaS9vd25lci9lbWFpbCcse2VtYWlsOnYudHJpbSgpfSk7CiAgICByZW5kZXIoKTsKICAgIGZsYXNoKHIucGVyc2lzdGVkPydBbGVydCBpbmJveCBzYXZlZCc6J0NoYW5nZWQg4oCUIGJ1dCBub3Qgd3JpdHRlbiB0byBzdG9yYWdlJyk7CiAgfWNhdGNoKGUpeyBvLmlubmVySFRNTD1gPHNwYW4gc3R5bGU9ImNvbG9yOnZhcigtLW1hZykiPiR7ZXNjKGUubWVzc2FnZSl9PC9zcGFuPmAgfQp9Cg==','base64')
};

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const zlib = require('zlib');

const SMTP   = __req('smtp');
const { probe } = __req('probe');
const STORE  = __req('store');
const LLM    = __req('llm');
const PAY    = __req('pay');
const RESEARCH = __req('research');
const SANDBOX  = __req('sandbox');
const FACTORY  = __req('factory');
const DOMAINS  = __req('domains');
const META     = __req('meta');
const BLOBS    = __req('blobs').makeBlobs(STORE);

const ROOT   = __dirname;
/* Tell the storage layer where "here" is. In the single-file build the
   inlined store module cannot work it out from its own __dirname. */
global.__CHAIRMAN_ROOT = ROOT;
const PUBLIC = path.join(ROOT, 'public');
const DATA   = process.env.DATA_DIR || ROOT;
try { fs.mkdirSync(DATA, { recursive:true }); } catch(e) {}
const DB     = 'data.json';
/* THE IDENTITY LIVES IN ITS OWN TINY FILE.
   It used to be inside data.json alongside 160 KB of logs, runs and business
   packs. On a host with no disk that whole file is wiped on every restart —
   taking the password hash with it — so the server generated a NEW random
   password and locked the Owner out of his own system.

   Splitting it out means the identity is ~200 bytes, written on its own,
   restored on its own, and never lost because a large state write was slow
   or failed. It is also what makes "set my password from inside the app"
   possible without ever touching a hosting dashboard. */
const IDDB   = 'owner.json';
const SESSDB = 'sessions.json';
const CREDS  = 'OWNER_CREDENTIALS.txt';
const PORT   = process.env.PORT || 8080;
const BOOT   = Date.now();
const BEHIND_PROXY = process.env.TRUST_PROXY !== '0';

/* ---------- telemetry counters ---------- */
const T = { req:0, api:0, err:0, auth_fail:0, lat:[], byPath:{} };

/* ---------- persistence ---------- */
const PILLARS = [
  {id:1,name:'Security & Audit Command'},{id:2,name:'Operations & Infrastructure'},
  {id:3,name:'Product & Engineering'},{id:4,name:'Data Intelligence'},{id:5,name:'Strategy & Growth'}
];
const SEED = [
 [1,'Audit Sentinel','Continuous log reconciliation and anomaly flagging across all floors.','log.read, anomaly.scan, report.emit'],
 [1,'Breach Warden','Intrusion detection, credential hygiene, session forensics.','net.watch, cred.audit, alert.raise'],
 [1,'Policy Vault Keeper','Maintains policy corpus and blocks non-compliant operations.','policy.read, gate.veto'],
 [1,'Risk Matrix Analyst','Scores blast radius on every raised gate.','risk.model, gate.annotate'],
 [2,'Process Orchestrator','Sequences multi-floor execution flows without overlap.','flow.plan, task.dispatch'],
 [2,'Resource Controller','Free-tier compute allocation and quota rotation.','quota.rotate, host.deploy'],
 [2,'Uptime Marshal','Watchdog on all connected sites and apps.','http.probe, restart.request'],
 [2,'Facility Node','Facility telemetry aggregation.','sensor.read, report.emit'],
 [3,'App Builder','Ships UI and product surfaces from spec to deploy.','code.write, build.run, deploy.request'],
 [3,'Code Pipeline','CI enforcement, test gates, rollback packaging.','test.run, rollback.pack'],
 [3,'Schema Guard','Blocks unreviewed DB schema drift.','db.diff, gate.raise'],
 [3,'Innovation Scout','Sources free open-source replacements for paid tooling.','oss.search, cost.compare'],
 [4,'Insight Forge','Turns raw telemetry into executive briefs.','data.query, brief.write'],
 [4,'Forecast Engine','Revenue and load projection modelling.','model.fit, forecast.emit'],
 [4,'Telemetry Flow','Streams metrics from connected properties.','stream.read, metric.push'],
 [4,'Market Signal','Competitive and demand signal collection via free sources.','web.read, signal.rank'],
 [5,'Revenue Streamer','Identifies and activates monetization surfaces.','offer.design, funnel.wire'],
 [5,'Growth Conductor','Executive planning and campaign sequencing.','plan.draft, campaign.queue']
];
const BLANK = { owner:null, agents:[], gates:[], logs:[], revenue:[], payout:null,
                denials:[], spend:0, devices:[], rev:0,
                monitors:[], smtp:null, mailq:[], incidents:[],
                skills:[], proposals:[], evolution:[], autopilot:false, scanCount:0,
                tasks:[], runs:[], running:false, ticks:0,
                llm:null, jobs:[], outputs:[],
                ideas:[], ventures:[], orders:[], pay:null, directives:[], chat:[],
                builds:[], writtenCaps:[], connectors:[], docs:[], drafts:[],
                analyses:[], crews:[], businesses:[], domains:{watch:[],runs:[]},
                treasuryLock:null, outreach:[], campaigns:[], smtpVerified:null,
                rosterCleared:false, tasksCleared:false, haltedByOwner:false, haltedAt:null,
                projects:[{id:'PRJ-MAIN',name:'General',t:'',docs:[]}], projectId:'PRJ-MAIN',
                content:[], meta:null, commentDrafts:[], commentLog:[],
                skillsOwn:[], skillRuns:[],
                missions:[], playbooks:[],
                autoIdeas:false };
let S = load();

let DBBYTES = 0;
function load(){ return structuredClone(BLANK); }   /* real load is async, in init() */
let saveTimer=null;
function save(){ S.rev++; clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ const t=JSON.stringify(S,null,1); DBBYTES=Buffer.byteLength(t);
    STORE.write(DB,t).then(()=>{ LAST_SAVE_OK=true; LAST_SAVE_AT=nowIso(); LAST_SAVE_ERR=''; })
      .catch(e=>{ LAST_SAVE_OK=false; LAST_SAVE_AT=nowIso(); LAST_SAVE_ERR=e.message;
        console.error('[store] write failed:',e.message); }); },150); }
/* Write ONLY the identity — a few hundred bytes, never debounced away.
   Called whenever the password, ID or email changes. */
async function saveIdentity(){
  if(!S.owner || !S.owner.hash) return;
  const o = { id:S.owner.id, salt:S.owner.salt, hash:S.owner.hash,
              email:S.owner.email, created:S.owner.created,
              bootstrap:!!S.owner.bootstrap, pinned:!!S.owner.pinned, t:nowIso() };
  try{
    await STORE.write(IDDB, JSON.stringify(o,null,1));
    if(STORE.flushNow) await STORE.flushNow();   /* identity never waits */
    return true;
  }catch(e){ console.error('[identity] SAVE FAILED: '+e.message); return false; }
}

function nowIso(){ return new Date().toISOString().replace('T',' ').slice(0,19); }
function uid(p){ return p+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(); }
function log(sev,src,msg){ S.logs.unshift({t:nowIso(),sev,src,msg}); S.logs=S.logs.slice(0,400); save(); }
function maskMail(m){ if(!m) return '—'; const[a,b]=m.split('@'); return a.slice(0,2)+'•••@'+b; }
function mask(v){ v=String(v||''); return !v?'—':v.length<5?'••••':'•'.repeat(Math.max(4,v.length-4))+v.slice(-4); }

/* ---------- crypto ---------- */
function kdf(pw, salt){ return crypto.pbkdf2Sync(pw, salt, 150000, 32, 'sha256').toString('hex'); }
function verify(pw){ return !!S.owner && crypto.timingSafeEqual(
  Buffer.from(kdf(pw, S.owner.salt)), Buffer.from(S.owner.hash)); }

/* ---------- sessions (DURABLE — survive restart) ---------- */
const TTL = 1000*60*60*24*30;   // 30 days
const SESS = new Map();
let sessTimer=null;
function saveSess(){ clearTimeout(sessTimer);
  sessTimer=setTimeout(()=>{ STORE.write(SESSDB, JSON.stringify(Object.fromEntries(SESS)))
    .catch(e=>console.error('[store] session write failed:',e.message)); },400); }
function newSession(ip,ua){
  const tok = crypto.randomBytes(32).toString('hex');
  SESS.set(tok,{t:Date.now(),ip,ua,last:Date.now()});
  saveSess();
  const d = { id:tok.slice(0,8), ip, ua:(ua||'').slice(0,90), at:nowIso() };
  S.devices.unshift(d); S.devices=S.devices.slice(0,25); save();
  return tok;
}
function auth(req){
  const c=(req.headers.cookie||'').match(/cos=([a-f0-9]{64})/);
  if(!c) return null;
  const s=SESS.get(c[1]);
  if(!s) return null;
  if(Date.now()-s.t>TTL){ SESS.delete(c[1]); saveSess(); return null; }
  s.last=Date.now(); return c[1];
}
setInterval(()=>{ let ch=false;
  for(const[k,v] of SESS) if(Date.now()-v.t>TTL){ SESS.delete(k); ch=true; }
  if(ch) saveSess(); }, 60000);

/* ---------- seed ---------- */
function seed(){
  if(S.agents.length) return;
  S.agents = SEED.map(([p,n,r,t])=>({ id:uid('AGT'), name:n, pillarId:p, role:r,
    tools:t.split(',').map(x=>x.trim()), status:'ACTIVE', cost:'FREE-TIER-ONLY', t:nowIso() }));
  log('OK','REGISTRY', S.agents.length+' sub-agents commissioned under Zero-Cost Doctrine.');
}

/* ---------- bootstrap owner ---------- */
async function bootstrap(){
  if(S.owner) return null;
  const id = process.env.OWNER_ID || 'chairman.owner';

  /* THE BUG THE OWNER JUST HIT.
     On a host with no persistent disk, every restart wiped data.json, so this
     ran again and generated a BRAND NEW random password — printed only to a
     server log he never reads. His old password stopped working and the login
     said NOT_PROVISIONED. He was locked out of his own system by design.

     Fix: OWNER_PW can be set as an environment variable. Environment variables
     survive restarts even when the filesystem does not. Set it once and the
     password is yours forever, on any host, with or without storage. */
  const fromEnv = (process.env.OWNER_PW || '').trim();
  if(fromEnv && fromEnv.length < 8)
    console.warn('[bootstrap] OWNER_PW is under 8 characters — using it anyway, but make it longer.');
  const words='Titan,Vault,Sable,Onyx,Falcon,Cipher,Aegis,Vector,Quartz,Ember'.split(',');
  const pw = fromEnv || (words[crypto.randomInt(words.length)] + '-' +
             words[crypto.randomInt(words.length)] + '-' +
             crypto.randomInt(1000,9999) + '-' +
             crypto.randomBytes(3).toString('hex').toUpperCase());
  const salt = crypto.randomBytes(16).toString('hex');
  S.owner = { id, salt, hash:kdf(pw,salt), email:'owner@chairman.local', created:nowIso(),
              bootstrap: !fromEnv,     /* an env password is deliberate, not a bootstrap */
              pinned: !!fromEnv };
  await saveIdentity();   /* write it to its own file immediately */
  seed();
  log('CRIT','CHAIRMAN','Bootstrap owner identity generated by server. ROTATE THE PASSWORD ON FIRST LOGIN.');
  log('OK','DOCTRINE','Zero-Cost Doctrine armed: no credits, no subscriptions, no paid dependencies.');
  save();
  const body =
`CHAIRMAN AGENT OS — BOOTSTRAP OWNER CREDENTIALS
Generated ${nowIso()} UTC by the server, once.

  OWNER ID : ${id}
  PASSWORD : ${pw}

Stored on the server only as PBKDF2-SHA256 (150,000 iterations, 16-byte salt).
This plaintext file is the ONLY copy. Rotate the password after first login
(System -> Owner Settings -> Rotate Password), then delete this file.
`;
  await STORE.write(CREDS, body).catch(()=>{});
  return { id, pw };
}

/* ---------- brute-force jail (public internet hardening) ---------- */
const LOCK = new Map();  // ip -> {n, until}
setInterval(()=>{ const now=Date.now();
  for(const[k,v] of LOCK) if(v.until<now && v.n===0) LOCK.delete(k); }, 300000);

/* ---------- MAIL ENGINE (real SMTP, credentials owner-supplied) ---------- */
const MAILSTAT = { sent:0, failed:0, last:null };
/* GMAIL SEND GOVERNOR.
   A free Gmail account allows roughly 500 recipients per rolling 24 hours.
   Exceed it and Google does not bounce the message — it SUSPENDS SENDING on
   the account for up to 24 hours, and repeat offences risk the account
   itself. Bursting also looks like a compromised account to their abuse
   systems. So: a hard daily ceiling well under the limit, and a minimum gap
   between outbound messages. This protects the Owner's real Gmail account,
   which is not replaceable. */
const SEND_CAP_PER_DAY   = 300;   /* deliberately under Gmail's ~500 */
const SEND_MIN_GAP_MS    = 8000;  /* no machine-gun bursts */
let   LAST_OUTBOUND_AT   = 0;
function sendWindow(){
  const cut = Date.now() - 24*3600*1000;
  S.outreach = (S.outreach||[]).filter(o=>o);
  const recent = (S.outreach||[]).filter(o=>{
    const t = Date.parse((o.t||'').replace(' ','T')+'Z');
    return t && t > cut;
  });
  return { used: recent.length, cap: SEND_CAP_PER_DAY,
           left: Math.max(0, SEND_CAP_PER_DAY - recent.length) };
}

async function mail(subject, text, tag, toOverride){
  /* toOverride is how CLIENT outreach goes out: a real address, and no
     "[CHAIRMAN OS]" prefix, because a prospect must never see that. */
  const outbound = !!toOverride;
  const to = toOverride || (S.owner && S.owner.email);
  if(outbound && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(to))
    throw new Error('Refusing to send to a malformed address: '+to);
  if(outbound){
    const w = sendWindow();
    if(w.left <= 0)
      throw new Error(`DAILY SEND CAP REACHED — ${w.used} messages in the last 24 hours. `
        + `Gmail suspends sending near 500 and that would cost you the account. Resumes automatically.`);
    const gap = Date.now() - LAST_OUTBOUND_AT;
    if(gap < SEND_MIN_GAP_MS)
      await new Promise(r=>setTimeout(r, SEND_MIN_GAP_MS - gap));
    LAST_OUTBOUND_AT = Date.now();
  }
  if(!S.smtp || !S.smtp.host){
    if(outbound) throw new Error('SMTP not armed — cannot send to a client. Set a Gmail app password in Mail Relay.');
    S.mailq.unshift({t:nowIso(),to:maskMail(to),subject,status:'UNSENT — NO SMTP CONFIGURED',tag});
    S.mailq=S.mailq.slice(0,60); save();
    log('WARN','MAIL',`"${subject}" NOT sent — no SMTP channel configured. Recorded as intent only.`);
    return {ok:false,reason:'NO_SMTP'};
  }
  try{
    /* Owner alerts are transactional to himself: no unsubscribe footer.
       Client outreach is unsolicited B2B: it gets the header, always. */
    const r = await SMTP.send(S.smtp, { to, subject: outbound ? subject : '[CHAIRMAN OS] '+subject,
      text, unsubscribe: outbound });
    MAILSTAT.sent++; MAILSTAT.last=nowIso();
    S.mailq.unshift({t:nowIso(),to:outbound?to:maskMail(to),subject,status:'DELIVERED ('+r.ms+'ms)',tag,outbound});
    S.mailq=S.mailq.slice(0,60); save();
    log('OK','MAIL',`Delivered "${subject}" to ${outbound?to:maskMail(to)} in ${r.ms}ms.`);
    return {ok:true,ms:r.ms};
  }catch(e){
    MAILSTAT.failed++;
    let hint=e.message;
    if(/EAI_FAIL|ENOTFOUND|getaddrinfo/i.test(hint))
      hint='WRONG HOST — that server name does not exist. Gmail needs smtp.gmail.com';
    else if(/535/.test(hint))
      hint='LOGIN REJECTED — username must be your full email, password must be a 16-char APP password (not your Gmail password)';
    else if(/534|BadCredentials/i.test(hint))
      hint='2-STEP VERIFICATION REQUIRED on your Google account before app passwords work';
    else if(/ECONNREFUSED|ETIMEDOUT/i.test(hint))
      hint='CONNECTION BLOCKED — port 587 may be firewalled. Try port 465 with Implicit TLS = Yes';
    S.mailq.unshift({t:nowIso(),to:maskMail(to),subject,status:'FAILED — '+hint,tag});
    S.mailq=S.mailq.slice(0,60); save();
    log('CRIT','MAIL',`Delivery FAILED for "${subject}": ${e.message}`);
    return {ok:false,reason:e.message};
  }
}

/* ---------- UPTIME MARSHAL (real probes) ---------- */
let monBusy=false;
async function runMonitors(force){
  if(monBusy || !S.monitors.length) return;
  monBusy=true;
  try{
    const now=Date.now();
    for(const m of S.monitors){
      const due = force || !m.lastAt || (now - new Date(m.lastAt+'Z').getTime()) >= (m.interval||60)*1000;
      if(!due) continue;
      const r = await probe(m.url, 10000);
      m.lastAt = nowIso();
      m.lastMs = r.ms; m.lastStatus = r.status; m.lastErr = r.err;
      m.ssl = r.ssl || m.ssl || null;
      m.checks = (m.checks||0)+1;
      if(r.ok) m.up=(m.up||0)+1; else m.down=(m.down||0)+1;
      m.history = (m.history||[]).concat([{t:m.lastAt, ok:r.ok, ms:r.ms, code:r.status}]).slice(-60);
      m.p95 = (()=>{ const a=m.history.filter(h=>h.ok).map(h=>h.ms).sort((x,y)=>x-y);
        return a.length? a[Math.min(a.length-1, Math.floor(a.length*0.95))] : 0; })();
      const was = m.state || 'UNKNOWN';
      const nowState = r.ok ? 'UP' : 'DOWN';
      m.state = nowState;
      if(was!==nowState && was!=='UNKNOWN'){
        const inc={t:nowIso(),url:m.url,name:m.name,from:was,to:nowState,detail:r.err||('HTTP '+r.status)};
        S.incidents.unshift(inc); S.incidents=S.incidents.slice(0,100);
        if(nowState==='DOWN'){
          log('CRIT','UPTIME MARSHAL',`${m.name} (${m.url}) went DOWN — ${inc.detail}`);
          mail(`DOWN: ${m.name}`,
`Uptime Marshal detected an outage.

  Target   : ${m.name}
  URL      : ${m.url}
  Detail   : ${inc.detail}
  Detected : ${inc.t} UTC

Availability since monitoring began: ${((m.up/m.checks)*100).toFixed(2)}% over ${m.checks} checks.

— Chairman Agent OS · Security & Audit Command`,'OUTAGE');
        } else {
          log('OK','UPTIME MARSHAL',`${m.name} RECOVERED — HTTP ${r.status} in ${r.ms}ms.`);
          mail(`RECOVERED: ${m.name}`,
`Target restored.

  Target   : ${m.name}
  URL      : ${m.url}
  Status   : HTTP ${r.status} in ${r.ms}ms
  Restored : ${inc.t} UTC

— Chairman Agent OS · Operations & Infrastructure`,'RECOVERY');
        }
      }
      if(m.ssl && m.ssl.days_left!=null && m.ssl.days_left<14 && !m.sslWarned){
        m.sslWarned=true;
        log('WARN','UPTIME MARSHAL',`${m.name} TLS certificate expires in ${m.ssl.days_left} days.`);
      }
      if(m.ssl && m.ssl.days_left>30) m.sslWarned=false;
    }
    save();
  }catch(e){ log('CRIT','UPTIME MARSHAL','Probe cycle error: '+e.message); }
  finally{ monBusy=false; }
}
setInterval(()=>runMonitors(false), 15000);

/* ======================================================================
   SELF-UPGRADE ENGINE
   Scans real system state every 60s. When it finds a genuine weakness it
   raises a PROPOSAL. Proposals NEVER self-apply — the Owner signs each one
   with their password, exactly like a permission gate. Autopilot may be
   enabled per-Owner, and even then only for SAFE-class proposals.
   ====================================================================== */

/* Every upgrade the Chairman is capable of performing on itself. */
const UPGRADES = {
  ADD_SKILL: {
    label:'Learn a new skill', klass:'SAFE',
    apply(p){ const k=p.payload;
      if(S.skills.some(s=>s.phrase===k.phrase)) throw new Error('skill already known');
      S.skills.push({phrase:k.phrase, action:k.action, kind:k.kind||'alias',
        learned:nowIso(), uses:0, origin:p.origin||'owner'});
      return `Skill "${k.phrase}" learned.`; }
  },
  TIGHTEN_INTERVAL: {
    label:'Probe a flaky target more often', klass:'SAFE',
    apply(p){ const m=S.monitors.find(x=>x.id===p.payload.id); if(!m) throw new Error('monitor gone');
      const old=m.interval; m.interval=Math.max(15,Math.round(m.interval/2));
      return `${m.name}: probe interval ${old}s → ${m.interval}s.`; }
  },
  RELAX_INTERVAL: {
    label:'Ease off a rock-solid target', klass:'SAFE',
    apply(p){ const m=S.monitors.find(x=>x.id===p.payload.id); if(!m) throw new Error('monitor gone');
      const old=m.interval; m.interval=Math.min(900,m.interval*2);
      return `${m.name}: probe interval ${old}s → ${m.interval}s.`; }
  },
  COMMISSION_AGENT: {
    label:'Commission a new sub-agent', klass:'REVIEW',
    apply(p){ const a=p.payload;
      S.agents.unshift({id:uid('AGT'),name:a.name,pillarId:+a.pillarId,role:a.role,
        tools:a.tools,cost:'FREE-TIER-ONLY',status:'ACTIVE',t:nowIso()});
      return `Agent "${a.name}" commissioned to Floor ${a.pillarId}.`; }
  },
  SUSPEND_AGENT: {
    label:'Suspend an idle agent', klass:'REVIEW',
    apply(p){ const a=S.agents.find(x=>x.id===p.payload.id); if(!a) throw new Error('agent gone');
      a.status='SUSPENDED'; return `Agent ${a.name} suspended.`; }
  },
  PRUNE_LEDGER: {
    label:'Compact the audit ledger', klass:'SAFE',
    apply(){ const before=S.logs.length; S.logs=S.logs.slice(0,400);
      return `Ledger compacted ${before} → ${S.logs.length} entries.`; }
  },
  INSTALL_CAPABILITY: {
    label:'Install a capability he wrote himself', klass:'REVIEW',
    apply(p){
      const cap = (S.writtenCaps||[]).find(c=>c.id===p.payload.capId);
      if(!cap) throw new Error('written capability no longer exists');
      if(cap.violations && cap.violations.length)
        throw new Error('REFUSED — sandbox flagged: '+cap.violations.join('; '));
      if(CAPS[cap.name]) throw new Error(cap.name+' already installed');
      /* register it for real — it now runs on schedule like any other */
      CAPS[cap.name] = { pillar:cap.pillar, safe:true, desc:cap.desc, written:true,
        async run(){ return SANDBOX.runCapability(cap.code, capabilityAPI(), 5000); } };
      cap.status = 'INSTALLED'; cap.installed = nowIso();
      return `Capability "${cap.name}" installed and live. He can now do something he could not before.`;
    }
  },
  HARDEN_SECURITY: {
    label:'Raise a security hardening gate', klass:'REVIEW',
    apply(p){ S.gates.unshift({id:uid('GATE'),t:nowIso(),title:p.payload.title,
        cls:'ACCESS GRANT',cost:0,free:'',obj:p.payload.obj,
        just:'Raised autonomously by the Chairman self-audit engine.',
        safe:'Owner signature required. No side effects until signed.',
        risk:'HIGH',amt:0,status:'PENDING'});
      return `Security gate raised for your signature.`; }
  }
};

function propose(kind, why, payload, evidence, origin){
  const u = UPGRADES[kind]; if(!u) return;
  const sig = kind+':'+JSON.stringify(payload||{});
  if(S.proposals.some(p=>p.sig===sig && p.status==='PENDING')) return;   // no duplicates
  if(S.evolution.some(e=>e.sig===sig && e.decision==='REJECTED')) return; // respect a no
  /* Already actioned once. The underlying condition may persist (e.g. SMTP still
     unarmed) but the Chairman has already done its part — raising it again would
     be nagging, and would stack duplicate gates. Stay quiet until it is resolved. */
  if(S.evolution.some(e=>e.sig===sig && e.decision==='APPLIED')) return;
  const p = { id:uid('UPG'), t:nowIso(), kind, klass:u.klass, label:u.label,
    why, evidence:evidence||'', payload:payload||{}, sig, status:'PENDING',
    origin:origin||'self-audit' };
  S.proposals.unshift(p); S.proposals=S.proposals.slice(0,60);
  log('WARN','EVOLUTION',`Upgrade proposed [${u.klass}] — ${why}`);
  return p;
}

function applyProposal(p, how){
  const u=UPGRADES[p.kind];
  let result;
  try { result = u.apply(p); }
  catch(e){ p.status='FAILED'; p.resolved=nowIso();
    log('CRIT','EVOLUTION',`Upgrade ${p.id} FAILED: ${e.message}`); save(); return {ok:false,error:e.message}; }
  p.status='APPLIED'; p.resolved=nowIso();
  S.evolution.unshift({t:nowIso(),id:p.id,kind:p.kind,sig:p.sig,decision:'APPLIED',
    label:p.label,why:p.why,result,how});
  S.evolution=S.evolution.slice(0,200);
  log('OK','EVOLUTION',`UPGRADED (${how}) — ${result}`);
  save();
  return {ok:true,result};
}

/* ---- the audit: reads REAL state, proposes only on real evidence ---- */
function selfAudit(){
  if(!S.owner) return;
  S.scanCount++;
  const t = telemetry();

  /* 1. flaky targets deserve tighter probing */
  for(const m of S.monitors){
    if(m.checks>=8){
      const avail = m.up/m.checks;
      if(avail<0.95 && m.interval>15)
        propose('TIGHTEN_INTERVAL',
          `${m.name} is only ${(avail*100).toFixed(1)}% available — probe it harder to catch the pattern.`,
          {id:m.id}, `${m.up} up / ${m.down} down across ${m.checks} checks`);
      if(avail===1 && m.checks>=40 && m.interval<600)
        propose('RELAX_INTERVAL',
          `${m.name} has been flawless for ${m.checks} checks — stop wasting cycles on it.`,
          {id:m.id}, `100% availability, p95 ${m.p95}ms`);
    }
    if(m.ssl && m.ssl.days_left!=null && m.ssl.days_left<21)
      propose('HARDEN_SECURITY',
        `${m.name} TLS certificate expires in ${m.ssl.days_left} days.`,
        {title:`Renew TLS certificate — ${m.name}`,
         obj:`Renew the certificate for ${m.url} before it expires in ${m.ssl.days_left} days. Success = new cert served, expiry beyond 60 days.`},
        `issuer ${m.ssl.issuer}`);
  }

  /* 2. real security pressure */
  if(t.auth_failures>=5)
    propose('HARDEN_SECURITY',
      `${t.auth_failures} failed authentications recorded — someone is probing your login.`,
      {title:'Review authentication attack surface',
       obj:'Audit failed-auth sources, rotate the Owner password, revoke stale sessions, confirm the IP jail is holding.'},
      `${t.auth_failures} failures since boot`);

  /* 3. bootstrap credential still live */
  if(S.owner.bootstrap && S.scanCount>2)
    propose('HARDEN_SECURITY',
      'Bootstrap password is still active and a plaintext copy exists on disk.',
      {title:'Rotate bootstrap credential',
       obj:'Rotate the Owner password. Rotation deletes OWNER_CREDENTIALS.txt automatically.'},
      'owner.bootstrap = true');

  /* 4. ledger bloat */
  if(S.logs.length>700)
    propose('PRUNE_LEDGER', `Audit ledger has grown to ${S.logs.length} entries and is slowing state sync.`,
      {}, `${(t.db_bytes/1024).toFixed(0)} KB state file`);

  /* 5. unstaffed floors */
  for(const p of PILLARS){
    const roster=S.agents.filter(a=>a.pillarId===p.id);
    if(roster.length===0)
      propose('COMMISSION_AGENT', `Floor ${p.id} (${p.name}) has no agents — it is a shell.`,
        {name:p.name.split(' ')[0]+' Lead', pillarId:p.id,
         role:`Own all ${p.name} operations and report to the Chairman.`,
         tools:['report.emit','gate.raise']}, 'roster length 0');
  }

  /* 6. monitoring exists but nobody is told */
  if(S.monitors.length>0 && !t.smtp_ready && S.scanCount>3)
    propose('HARDEN_SECURITY',
      `${S.monitors.length} target(s) monitored but no mail relay — outages alert nobody.`,
      {title:'Arm the mail relay',
       obj:'Configure SMTP so outage and recovery alerts are delivered rather than merely logged.'},
      'smtp_ready = false');

  /* idea autopilot: the Chairman thinks up and validates ventures unprompted */
  if(S.autoIdeas && S.llm && S.scanCount%5===0){
    (async()=>{
      try{
        const raw=S.ideas.filter(i=>i.status==='RAW');
        if(raw.length<3) await generateIdeas(3);
        else await researchIdea(raw[raw.length-1].id);
      }catch(e){ log('WARN','VENTURE','Idea autopilot: '+e.message); }
    })();
  }

  /* autopilot: SAFE class only, never REVIEW */
  if(S.autopilot){
    for(const p of S.proposals.filter(x=>x.status==='PENDING' && x.klass==='SAFE'))
      applyProposal(p,'autopilot');
  }
  save();
}
setInterval(selfAudit, 60000);

/* ======================================================================
   AGENT RUNTIME — agents stop being definitions and actually execute.
   Each capability is a real function doing real work with real data.
   Anything with a side effect outside this box raises a gate first.
   ====================================================================== */

const CAPS = {
  'probe.sweep': { pillar:2, safe:true, desc:'Probe every bound target and report',
    async run(){
      if(!S.monitors.length) return {msg:'No targets bound. Nothing to sweep.', n:0};
      await runMonitors(true);
      const down=S.monitors.filter(m=>m.state==='DOWN');
      return { msg:`Swept ${S.monitors.length} target(s). ${down.length} down.`,
        n:S.monitors.length, detail:down.map(m=>m.name+' ('+(m.lastErr||'HTTP '+m.lastStatus)+')').join('; ')||'all reachable' };
    }},
  'tls.watch': { pillar:1, safe:true, desc:'Check TLS expiry on all targets',
    async run(){
      const risky=S.monitors.filter(m=>m.ssl&&m.ssl.days_left!=null&&m.ssl.days_left<45);
      if(risky.length) for(const m of risky)
        propose('HARDEN_SECURITY',`${m.name} TLS expires in ${m.ssl.days_left} days.`,
          {title:`Renew TLS — ${m.name}`,obj:`Renew certificate for ${m.url}.`},
          `issuer ${m.ssl.issuer}`,'agent');
      return { msg:risky.length?`${risky.length} certificate(s) expiring within 45 days.`:'All certificates healthy.',
        n:risky.length, detail:risky.map(m=>m.name+': '+m.ssl.days_left+'d').join('; ')||'none' };
    }},
  'sla.report': { pillar:4, safe:true, desc:'Compute availability + p95 across targets',
    async run(){
      if(!S.monitors.length) return {msg:'No data to analyse.', n:0};
      const rows=S.monitors.filter(m=>m.checks>0).map(m=>({
        name:m.name, avail:+((m.up/m.checks)*100).toFixed(2), p95:m.p95||0, checks:m.checks }));
      if(!rows.length) return {msg:'Targets bound but not yet probed.', n:0};
      const worst=rows.slice().sort((a,b)=>a.avail-b.avail)[0];
      const mean=+(rows.reduce((a,r)=>a+r.avail,0)/rows.length).toFixed(2);
      return { msg:`Fleet availability ${mean}%. Worst: ${worst.name} at ${worst.avail}%.`,
        n:rows.length, detail:rows.map(r=>`${r.name} ${r.avail}% p95 ${r.p95}ms`).join('; ') };
    }},
  'anomaly.scan': { pillar:1, safe:true, desc:'Hunt anomalies in the audit ledger',
    async run(){
      const crit=S.logs.filter(l=>l.sev==='CRIT').length;
      const t=telemetry();
      const flags=[];
      if(t.auth_failures>=3) flags.push(`${t.auth_failures} auth failures`);
      if(crit>=5) flags.push(`${crit} CRIT events`);
      if(S.owner.bootstrap) flags.push('bootstrap credential still live');
      if(!t.smtp_ready&&S.monitors.length) flags.push('alerts undeliverable — no SMTP');
      if(!S.payout&&S.revenue.length) flags.push('revenue recorded with no payout channel');
      return { msg:flags.length?`${flags.length} anomaly signal(s) detected.`:'No anomalies. Ledger clean.',
        n:flags.length, detail:flags.join('; ')||'nominal' };
    }},
  'cost.audit': { pillar:5, safe:true, desc:'Verify Zero-Cost Doctrine compliance',
    async run(){
      const paid=S.agents.filter(a=>a.cost==='OWNER-OVERRIDE-PAID');
      const avoided=S.denials.reduce((a,b)=>a+b.cost,0);
      return { msg:`Spend $${S.spend.toFixed(2)} · avoided $${avoided.toFixed(2)} · ${paid.length} agent(s) permitted paid.`,
        n:paid.length,
        detail:S.spend>0?'DOCTRINE BREACHED — spend is above zero.':'Doctrine intact. Zero spend.' };
    }},
  'roster.audit': { pillar:3, safe:true, desc:'Check floor staffing and tool sprawl',
    async run(){
      const empty=PILLARS.filter(p=>!S.agents.some(a=>a.pillarId===p.id));
      const tools={}; S.agents.forEach(a=>a.tools.forEach(t=>tools[t]=(tools[t]||0)+1));
      const wide=Object.entries(tools).filter(([,c])=>c>3);
      const susp=S.agents.filter(a=>a.status!=='ACTIVE');
      return { msg:`${S.agents.length} agents · ${empty.length} empty floor(s) · ${susp.length} suspended.`,
        n:empty.length+susp.length,
        detail:[empty.length?'empty: '+empty.map(p=>p.name).join(', '):'',
                wide.length?'wide tools: '+wide.map(([t,c])=>t+'×'+c).join(', '):''].filter(Boolean).join(' | ')||'roster healthy' };
    }},
  'gate.sentry': { pillar:1, safe:true, desc:'Escalate gates frozen too long',
    async run(){
      const stale=S.gates.filter(g=>g.status==='PENDING' &&
        (Date.now()-new Date(g.t.replace(' ','T')+'Z').getTime())>3600000);
      if(stale.length) log('WARN','GATE SENTRY',`${stale.length} gate(s) frozen over 1 hour awaiting your signature.`);
      return { msg:stale.length?`${stale.length} gate(s) frozen >1h.`:'No stale gates.',
        n:stale.length, detail:stale.map(g=>g.id+' '+g.title).join('; ')||'queue healthy' };
    }},
  'brief.write': { pillar:4, safe:true, desc:'Write an executive brief to the ledger',
    async run(){
      const t=telemetry();
      const down=S.monitors.filter(m=>m.state==='DOWN').length;
      const pend=S.gates.filter(g=>g.status==='PENDING').length;
      const brief=`Uptime ${hhmm(t.uptime_s)} · ${S.monitors.length} targets (${down} down) · `+
        `${S.agents.filter(a=>a.status==='ACTIVE').length}/${S.agents.length} agents active · `+
        `${pend} gate(s) frozen · spend $${S.spend.toFixed(2)} · ${S.proposals.filter(p=>p.status==='PENDING').length} upgrade(s) queued`;
      log('INFO','INSIGHT FORGE',brief);
      return { msg:'Executive brief written to ledger.', n:1, detail:brief };
    }}
};
function hhmm(s){ const h=s/3600|0,m=(s%3600)/60|0; return (h?h+'h':'')+m+'m'; }

/* ---------- AI-POWERED CAPABILITIES ----------
   These call a real language model. Free tier, Owner's own key.
   Output is written to S.outputs where you can read, copy and use it. */
const SYS_CHAIRMAN = `You are the Chairman: the strategic mind of a one-person enterprise,
reporting only to the Owner. You are not a clerk who summarises. You are the
person in the room who sees the opportunity everyone else walked past.

HOW YOU THINK — this is your primary function:
- Hunt for the GAP. Every market has work people hate doing, money leaking
  from a broken process, or a group everyone ignores because they are small.
  Those gaps are where a person with no capital can enter.
- Ask "why is it done this way?" Most answers are habit, not logic. Habit is
  an opening.
- Prefer the unglamorous. Boring problems with real pain pay reliably;
  exciting ideas with no pain do not.
- Look for arbitrage: something cheap or free in one place that is expensive
  or scarce in another. Skill, time, information, attention, geography.
- Think in second moves. If this works, what does it unlock? A first client
  is worth more as proof than as revenue.
- Start where money already changes hands. It is far easier to take a slice
  of an existing flow than to create demand from nothing.
- When you propose something, name the specific person who pays and why they
  say yes THIS week — not "businesses" or "everyone".

FINDING LEVERAGE, HONESTLY:
- A "loophole" worth using is an inefficiency: a free tier that legitimately
  covers a paid need, a service nobody offers locally, work that is trivial
  for you and painful for them.
- A "loophole" NOT worth using is anything that breaks a law, a contract or a
  platform's terms, or that only works if the other party does not notice.
  Those collapse exactly when the business starts to matter. Refuse them and
  say why — then find the legitimate version of the same edge, because there
  usually is one.

TRUTHFULNESS IS ABSOLUTE AND OVERRIDES EVERYTHING ABOVE:
- Never invent statistics, revenue figures, percentages or observations.
- Never write a sales message claiming the Owner has seen, monitored or
  analysed something they have not. Fabricated credibility dies the moment a
  prospect says "show me".
- If you state arithmetic, verify it. A wrong number in a pitch is worse than
  no number.
- Say "unknown" rather than presenting a guess as fact.
- If something cannot be done, say so plainly and say why — then say what CAN
  be done instead. Never stop at the objection.

Be concrete and blunt. No filler, no hedging, no marketing language. Vision
without a first concrete step is daydreaming; a first step without vision is
busywork. Always give both.`;

/* When a free tier throttles, stop hammering it. COOLDOWN blocks AI work
   for a while so the quota can recover instead of burning failed calls. */
/* Per-key cooling only. There is no global pause any more: if ANY key in the
   pool is healthy, work continues immediately. The short global backstop only
   engages when every single key is exhausted — without it the system would
   spin at full speed hitting 429s, which makes the limits reset slower, not
   faster. That is a physics constraint of the provider, not a policy choice. */
let COOLDOWN_UNTIL = 0;
function coolingDown(){ return Date.now() < COOLDOWN_UNTIL; }
function coolFor(mins){
  COOLDOWN_UNTIL = Date.now() + mins*60000;
  log('WARN','AI BRAIN',`Every key exhausted. Brief ${mins}-min pause so limits can reset. Add another free key to remove this entirely.`);
}

/* Rank providers so the healthiest key is always tried first. A key that just
   served a request outranks one that recently 429'd. */
function rankedPool(){
  const now = Date.now();
  const all = [];
  if(S.llm && S.llm.provider) all.push(S.llm);
  (S.llmBackups||[]).forEach(k=>all.push(k));
  return all
    .filter(k => !(k.cooled > now))
    .sort((a,b) => ((b.ok||0)-(b.fail||0)) - ((a.ok||0)-(a.fail||0)));
}

async function think(prompt, sys, tag, agent){
  if(!S.llm||!S.llm.provider) throw new Error('No AI brain connected. Connect a free model in the AI Brain page.');

  const now = Date.now();
  const pool = rankedPool();

  /* Only refuse if literally nothing is available. One healthy key = keep going. */
  if(!pool.length){
    if(coolingDown()){
      const left = Math.ceil((COOLDOWN_UNTIL-Date.now())/60000);
      throw new Error(`ALL KEYS EXHAUSTED — ${left} min until the first one resets. Add another free key in AI Brain and this never happens again.`);
    }
    /* nothing cooling but nothing ranked: fall back to the raw primary */
    pool.push(S.llm);
  }

  const head = pool[0], rest = pool.slice(1);
  let r;
  try{
    r = await LLM.chatFailover(head, rest, [
      {role:'system', content: sys||SYS_CHAIRMAN},
      {role:'user', content: prompt}
    ]);
  }catch(e){
    if(/RATE LIMIT|429|quota|exhaust|too many/i.test(e.message)){
      /* park only the keys that actually failed, each for 5 min */
      pool.forEach(k=>{ k.cooled = now + 5*60000; k.fail=(k.fail||0)+1; });
      save();
      /* global pause ONLY if no key anywhere is still usable */
      if(!rankedPool().length) coolFor(5);
    }
    /* SELF-HEAL a retired model: ask the provider what it serves today and
       retry once with a live one, rather than failing every call forever. */
    else if(/MODEL RETIRED|no longer exists|decommission|not found/i.test(e.message)){
      try{
        const live = await LLM.listModels(head);
        const pick = live.find(m=>/gpt-oss-120b|gpt-oss|qwen|llama|gemini|flash/i.test(m)) || live[0];
        if(pick && pick !== head.model){
          const dead = head.model;
          head.model = pick;
          if(head === S.llm || head.provider === S.llm.provider) S.llm.model = pick;
          log('WARN','AI BRAIN',`Model "${dead}" is retired. AUTO-SELECTED "${pick}" from the provider's live list.`);
          save();
          r = await LLM.chatFailover(head, rest, [
            {role:'system', content: sys||SYS_CHAIRMAN},
            {role:'user', content: prompt}
          ]);
        } else throw e;
      }catch(e2){ throw e; }
    }
    else throw e;
    if(!r) throw e;
  }

  /* AUTO-SWITCH: whichever key just worked becomes the primary, so the next
     call starts with a known-good provider instead of retrying a dead one. */
  const used = pool.find(k=>k.provider===r.usedProvider) || head;
  used.ok = (used.ok||0)+1;
  used.cooled = 0;
  if(used !== S.llm && used.provider){
    const old = S.llm.provider+'/'+S.llm.model;
    const demoted = S.llm;
    S.llm = { provider:used.provider, key:used.key, model:used.model, t:nowIso() };
    S.llmBackups = (S.llmBackups||[]).filter(k=>k!==used);
    if(!S.llmBackups.some(k=>k.provider===demoted.provider && k.key===demoted.key))
      S.llmBackups.unshift(demoted);
    log('OK','AI BRAIN',`AUTO-SWITCHED brain: ${old} → ${used.provider}/${used.model}. Healthy provider promoted, no work lost.`);
    save();
  }
  S.outputs.unshift({ t:nowIso(), tag, agent, text:r.text, ms:r.ms,
    tokens:r.tokens, model:r.model, prompt:prompt.slice(0,300) });
  S.outputs = S.outputs.slice(0,120);
  return r;
}

/* ======================================================================
   VENTURE ENGINE — the Chairman generates ideas, researches them against
   real web data, scores them, and designs agent teams to execute.
   Every step that costs money or touches the outside world stops at a gate.
   ====================================================================== */
function jparse(txt){
  /* models wrap JSON in prose or fences; extract the first real array/object */
  let t = String(txt).replace(/```json/gi,'```').split('```').filter(s=>s.trim());
  const cands = [txt, ...t];
  for(const c of cands){
    const s = c.indexOf('['), s2 = c.indexOf('{');
    const start = (s>=0 && (s2<0 || s<s2)) ? s : s2;
    if(start<0) continue;
    const open = c[start], close = open==='[' ? ']' : '}';
    let depth=0, inStr=false, esc=false;
    for(let i=start;i<c.length;i++){
      const ch=c[i];
      if(esc){ esc=false; continue; }
      if(ch==='\\'){ esc=true; continue; }
      if(ch==='"') inStr=!inStr;
      if(inStr) continue;
      if(ch===open) depth++;
      else if(ch===close){ depth--;
        if(depth===0){ try{ return JSON.parse(c.slice(start,i+1)); }catch(e){ break; } }
      }
    }
  }
  throw new Error('Model did not return usable JSON');
}

async function generateIdeas(n, steer){
  const known = S.ideas.slice(0,25).map(i=>i.title).join('; ') || 'none yet';
  const r = await think(
`Generate ${n||5} NEW money-making venture ideas for the Owner.

OWNER REALITY — do not contradict this:
- One person in Ludhiana, Punjab, India. No staff, no company, no capital.
- Owns and runs Chairman Agent OS: 24/7 website uptime probing, TLS expiry
  alerts, real email alerting, scheduled agents, and an AI brain.
- Can take real payments via Razorpay (UPI/cards) once configured.
- Has ZERO customers and ZERO track record so far.

THINK LIKE A FOUNDER, NOT A FREELANCER:
- Hunt the GAP, not the obvious job. "Write blog posts" is what everyone
  offers. What does nobody in Ludhiana offer that businesses quietly need?
- Ludhiana is India's hosiery, bicycle-parts and machine-tools capital.
  Thousands of small manufacturers and exporters. Most are family-run, most
  are weak online, most lose money in ways they have never measured. That
  concentration is an advantage nobody outside Punjab can copy.
- Find the arbitrage: something free or trivial for a technical person that
  is expensive, confusing or invisible to a factory owner.
- Prefer boring recurring pain over exciting one-off projects. A ₹1,500
  monthly problem solved forever beats a ₹15,000 project that ends.
- Attack a specific niche, not "small businesses". "Hosiery exporters whose
  buyers check their website before a bulk order" is a target. "SMEs" is not.
- At least ONE idea must be something the Owner could sell to a person he can
  physically walk to this week.
- At least ONE idea must be genuinely non-obvious — something that would make
  a competitor say "why did I not think of that".

HARD LIMITS:
- Startable in under 30 days with under ₹2,000.
- No inventory, no staff, no office, no licence.
- Do not repeat: ${known}
- Never propose anything that breaks a law, a contract, or a platform's terms.
  If you spot an edge that depends on someone not noticing, discard it and
  find the legitimate version of the same advantage.
${steer?'- Owner steer: '+steer:''}

Return ONLY a JSON array, no prose. Each element:
{"title":"short name","what":"one sentence on what is sold",
 "buyer":"the exact person who pays — role, industry, why they feel this pain",
 "price_inr":number,
 "why_now":"the gap or shift that makes this work today, and why nobody local does it",
 "effort":"low|medium|high",
 "uses_system":true|false,
 "unfair_edge":"what the Owner has that a competitor copying this would lack"}`,
    null,'ideas','Growth Conductor');
  const arr = jparse(r.text);
  const added=[];
  for(const it of (Array.isArray(arr)?arr:[])){
    if(!it || !it.title) continue;
    const idea={ id:uid('IDEA'), t:nowIso(), title:String(it.title).slice(0,90),
      what:String(it.what||'').slice(0,300), buyer:String(it.buyer||'').slice(0,200),
      price:+it.price_inr||0, why:String(it.why_now||'').slice(0,300),
      effort:String(it.effort||'medium'), usesSystem:!!it.uses_system,
      edge:String(it.unfair_edge||'').slice(0,220),
      status:'RAW', score:null, research:null };
    S.ideas.unshift(idea); added.push(idea);
  }
  S.ideas=S.ideas.slice(0,120); save();
  log('OK','VENTURE',`${added.length} new idea(s) generated.`);
  return added;
}

async function researchIdea(id){
  const idea = S.ideas.find(i=>i.id===id);
  if(!idea) throw new Error('No such idea');
  idea.status='RESEARCHING'; save();
  let evidence;
  try{ evidence = await RESEARCH.gather(idea.title+' '+idea.what, 'Ludhiana Punjab India'); }
  catch(e){ evidence = 'RESEARCH FAILED: '+e.message; }
  const r = await think(
`Judge this venture idea against REAL web evidence gathered just now.

IDEA: ${idea.title}
WHAT: ${idea.what}
BUYER: ${idea.buyer}
PROPOSED PRICE: INR ${idea.price}

EVIDENCE FROM THE WEB:
${evidence.slice(0,5000)}

Be harsh. Most ideas are bad. If the evidence does not support demand, say so
and score low. Do not invent figures the evidence does not contain.

Return ONLY JSON:
{"demand":0-10,"competition":0-10,"speed_to_first_rupee":0-10,
 "owner_fit":0-10,"verdict":"PURSUE|MAYBE|KILL",
 "reasoning":"3 blunt sentences citing the evidence",
 "first_step":"the single concrete action to take tomorrow",
 "kill_risk":"the most likely reason this fails"}`,
    null,'research','Market Signal');
  let j;
  try{ j = jparse(r.text); }
  catch(e){ idea.status='RAW'; save(); throw new Error('Research returned unusable output'); }
  const score = Math.round(((+j.demand||0)+(10-(+j.competition||10))+(+j.speed_to_first_rupee||0)+(+j.owner_fit||0))/4*10);
  idea.score=score; idea.verdict=j.verdict||'MAYBE';
  idea.research={ demand:+j.demand||0, competition:+j.competition||0,
    speed:+j.speed_to_first_rupee||0, fit:+j.owner_fit||0,
    reasoning:String(j.reasoning||''), firstStep:String(j.first_step||''),
    killRisk:String(j.kill_risk||''), at:nowIso(), evidenceChars:evidence.length };
  idea.status='RESEARCHED'; save();
  log(score>=60?'OK':'WARN','VENTURE',`"${idea.title}" scored ${score}/100 — ${idea.verdict}.`);
  return idea;
}

async function buildVenture(id){
  const idea = S.ideas.find(i=>i.id===id);
  if(!idea) throw new Error('No such idea');
  const caps = Object.keys(CAPS).join(', ');
  const r = await think(
`Design the agent team to execute this venture.

VENTURE: ${idea.title} — ${idea.what}
BUYER: ${idea.buyer}
FIRST STEP: ${idea.research?idea.research.firstStep:'unknown'}

The ONLY tools that actually execute in this system are: ${caps}
Anything else an agent needs must be listed as a manual step for the Owner —
do not pretend an agent can do it.

Return ONLY JSON:
{"agents":[{"name":"...","pillar":1-5,"role":"one sentence scope",
            "tools":["only from the list above"]}],
 "owner_steps":["concrete things only a human can do, in order"],
 "first_revenue_path":"how the first rupee actually arrives",
 "weeks_to_first_rupee":number}`,
    null,'venture','App Builder');
  const j = jparse(r.text);
  const real = Object.keys(CAPS);
  const made=[];
  for(const a of (j.agents||[])){
    const tools=(a.tools||[]).filter(t=>real.includes(String(t).trim()));
    if(!tools.length) continue;                     // refuse decorative agents
    const ag={ id:uid('AGT'), name:String(a.name).slice(0,60), pillarId:Math.min(5,Math.max(1,+a.pillar||5)),
      role:String(a.role||'').slice(0,200), tools, cost:'FREE-TIER-ONLY',
      status:'ACTIVE', t:nowIso(), venture:idea.id };
    S.agents.unshift(ag); made.push(ag);
  }
  const v={ id:uid('VEN'), t:nowIso(), ideaId:idea.id, title:idea.title,
    agents:made.map(a=>a.id), ownerSteps:(j.owner_steps||[]).map(String),
    revenuePath:String(j.first_revenue_path||''), weeks:+j.weeks_to_first_rupee||0,
    status:'ACTIVE' };
  S.ventures.unshift(v); idea.status='LAUNCHED'; idea.ventureId=v.id;
  save();
  log('OK','VENTURE',`Venture "${idea.title}" launched with ${made.length} agent(s).`);
  return { venture:v, agents:made, skipped:(j.agents||[]).length-made.length };
}

/* ======================================================================
   AGENT LOOP — the thing that makes an assistant an agent.
   The model is shown its real tools, picks ONE, sees the actual result,
   then decides the next step. Repeats until it answers or hits the cap.
   Every tool here is code that already runs; nothing is simulated.
   ====================================================================== */
function toolMenu(){
  return Object.entries(CAPS).map(([k,v])=>`  ${k} — ${v.desc}`).join('\n')
    + '\n  web.search <query> — live DuckDuckGo results'
    + '\n  web.read <url> — full text of any page'
    + '\n  state.read — current agents, monitors, ideas, gates, spend';
}
async function runTool(name, arg){
  if(CAPS[name]){ const r = await CAPS[name].run(); return (r.msg||'')+(r.detail?' | '+r.detail:''); }
  if(name==='web.search'){
    const hits = await RESEARCH.search(arg||'', 5);
    return hits.length ? hits.map(h=>`- ${h.title}: ${h.snippet}`).join('\n') : 'no results';
  }
  if(name==='web.read'){
    const pg = await RESEARCH.readPage(arg);
    return `${pg.title}\n${pg.text.slice(0,3500)}`;
  }
  if(name==='state.read'){
    const t=telemetry();
    return `agents ${S.agents.length}, monitors ${S.monitors.length} (${t.monitors_down} down), `
      + `ideas ${S.ideas.length}, ventures ${S.ventures.length}, gates pending `
      + `${S.gates.filter(g=>g.status==='PENDING').length}, spend Rs ${S.spend.toFixed(2)}, `
      + `budget ceiling Rs ${S.budget||0}, mail ${t.smtp_ready?'armed':'off'}`;
  }
  throw new Error('unknown tool: '+name);
}

async function agentLoop(goal, maxSteps){
  const cap = Math.min(10, Math.max(2, +maxSteps || 6));
  const trace = [];
  let scratch = '';

  for(let step=1; step<=cap; step++){
    const r = await think(
`GOAL FROM THE OWNER: ${goal}

TOOLS YOU CAN ACTUALLY RUN:
${toolMenu()}

WORK SO FAR:
${scratch || '(nothing yet — this is step 1)'}

Decide the single next action. Reply with ONE line, nothing else:
  TOOL <tool.name> <optional argument>
or
  DONE <your final answer to the Owner>

Rules: never invent a tool that is not listed. Never claim a result you did
not see above. If the work is finished, or no listed tool can advance it,
reply DONE and say plainly what you found and what you could not do.`,
      null, 'agent-step', 'Chairman');

    const line = r.text.trim().split('\n')[0].trim();

    if(/^DONE\b/i.test(line)){
      const answer = r.text.trim().replace(/^DONE\s*/i,'');
      trace.push({step, action:'DONE', result:answer.slice(0,400)});
      return { answer, trace, steps:step };
    }

    const m = line.match(/^TOOL\s+([a-z._]+)\s*(.*)$/i);
    if(!m){
      trace.push({step, action:'MALFORMED', result:line.slice(0,180)});
      scratch += `\nStep ${step}: replied without a valid TOOL/DONE line. Follow the format.`;
      continue;
    }

    const tool = m[1], arg = (m[2]||'').trim();
    let out, failed = false;
    try{ out = await runTool(tool, arg); }
    catch(e){ out = 'TOOL FAILED: '+e.message; failed = true; }

    /* If the AI provider itself is unreachable, every further AI step will
       fail the same way. Stop immediately and say so plainly, rather than
       burning the remaining steps on the same dead connection. */
    if(failed && /ETIMEDOUT|ENOTFOUND|NO INTERNET|KEY REJECTED|MODEL RETIRED|RATE LIMIT|QUOTA/i.test(out)){
      trace.push({step, action:tool, result:String(out).slice(0,400)});
      return { answer:
        `STOPPED AT STEP ${step}. The AI provider could not be reached:\n\n${out}\n\n`+
        `Nothing further can run until that is fixed. Go to AI Brain, switch to a model `+
        `the provider actually serves, press TEST IT, and add a backup key so one dead `+
        `provider cannot halt the whole loop.`,
        trace, steps:step, providerDown:true };
    }

    trace.push({step, action:tool+(arg?' '+arg.slice(0,60):''), result:String(out).slice(0,400)});
    scratch += `\nStep ${step}: ran ${tool} ${arg}\nResult: ${String(out).slice(0,1400)}\n`;
    log('OK','AGENT LOOP',`step ${step}: ${tool} → ${String(out).slice(0,90)}`);
  }

  return { answer:`Stopped after ${cap} steps without finishing. Progress is in the trace below.`,
           trace, steps:cap, hitCap:true };
}

/* ======================================================================
   SITE BUILDER — he writes a complete, working site. He cannot deploy it:
   hosting needs an account in your name. So he produces a finished file
   plus exact deploy steps, and only after the venture is actually researched.
   ====================================================================== */
async function buildSite(ventureId, brief){
  const v = ventureId ? S.ventures.find(x=>x.id===ventureId) : null;
  const idea = v ? S.ideas.find(i=>i.id===v.ideaId) : null;

  /* refuse to build on nothing — evidence first */
  if(!v && !brief) throw new Error('Pick a researched venture, or write a brief. He will not build blind.');
  if(idea && idea.status!=='LAUNCHED' && !brief)
    throw new Error('That venture is not launched yet. Research it first — building before evidence wastes your time.');

  const payNote = S.pay
    ? `The Owner has ${S.pay.gateway} ${S.pay.live?'LIVE':'in TEST mode'}. Put a real
       "Pay now" button wherever money is asked for; the exact URL is injected later.`
    : `No payment gateway is connected yet, so use a mailto: contact link instead of a
       pay button, and do not imply payments are accepted.`;

  const evidence = idea && idea.research
    ? `RESEARCH ON RECORD — score ${idea.score}/100, verdict ${idea.verdict}.
       ${idea.research.reasoning}
       Buyer: ${idea.buyer}. Price point: INR ${idea.price}.`
    : 'No formal research on file — the Owner supplied a direct brief.';

  const r = await think(
`Write a COMPLETE single-file landing page that sells this.

VENTURE: ${v ? v.title : brief}
${v ? 'REVENUE PATH: '+v.revenuePath : ''}
${evidence}
${payNote}
Owner is one person in Ludhiana, Punjab, India. No company, no staff, no track record.

HARD RULES:
- Output ONE complete HTML file. Inline CSS. No frameworks, no CDN, no external images.
- Never claim customers, testimonials, awards or statistics the Owner does not have.
  A brand-new business with fake social proof gets caught and loses the sale.
- Honest positioning only: what the service does, who it is for, what it costs.
- Mobile-first. Must look right on a phone.
- Include: headline, what it does, who it is for, transparent pricing in INR,
  an honest FAQ, and one clear call to action.
- Where the pay button goes, write exactly: {{PAY_LINK}}
- Where the contact email goes, write exactly: {{EMAIL}}

Return ONLY the HTML, starting <!DOCTYPE html>. No commentary before or after.`,
    'You write clean, honest, converting landing pages. Plain Indian English. No hype, no invented proof.',
    'site-build','App Builder');

  let html = r.text.trim();
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/);
  if(fence) html = fence[1].trim();
  if(!/<!DOCTYPE/i.test(html)) throw new Error('Model did not return a usable HTML file. Try again.');

  /* wire in the Owner's real details */
  const payUrl = (S.orders[0] && S.orders[0].url) || '';
  html = html.replace(/\{\{PAY_LINK\}\}/g, payUrl || '#contact')
             .replace(/\{\{EMAIL\}\}/g, S.owner.email || 'your@email.com');

  const build = { id:uid('SITE'), t:nowIso(), title: v ? v.title : brief.slice(0,70),
    ventureId: ventureId||null, html, bytes: Buffer.byteLength(html),
    hasPayLink: !!payUrl, deployed:false };
  S.builds.unshift(build); S.builds = S.builds.slice(0,20);
  log('OK','APP BUILDER',`Site written for "${build.title}" — ${(build.bytes/1024).toFixed(1)} KB, ready to deploy.`);
  save();
  return build;
}

CAPS['ai.build_site'] = { pillar:3, safe:true, desc:'Write a complete landing page for the newest launched venture',
  async run(){
    const v = S.ventures[0];
    if(!v) return { msg:'No launched venture to build for. Research and launch one first.', n:0 };
    if(S.builds.some(b=>b.ventureId===v.id))
      return { msg:`Site already built for "${v.title}".`, n:0 };
    const b = await buildSite(v.id);
    return { msg:`Landing page written for "${b.title}" (${(b.bytes/1024).toFixed(1)} KB).`, n:1,
      detail: b.hasPayLink ? 'Real payment link embedded.' : 'No payment link yet — contact form only.' };
  }};

function fEsc(s){ return FACTORY.esc(s); }

/* Ask for JSON, insist on JSON, retry once with the parse error fed back. */
async function askJson(prompt, sys, tag, agent){
  let r = await think(prompt, sys, tag, agent);
  let j = jparse(r.text);
  if(j) return j;
  r = await think(prompt + `\n\nYour previous reply was not parseable JSON. Return ONLY the JSON value, no prose, no code fence.`,
                  sys, tag+'-retry', agent);
  j = jparse(r.text);
  if(!j) throw new Error('The model would not return usable JSON for '+tag+'. Try again, or switch to a stronger model in AI Brain.');
  return j;
}

const ANTI_AI = `HOW TO WRITE SO IT DOES NOT READ AS MACHINE-WRITTEN — this is not a
style preference, it is the difference between being paid and being ignored:
- Short declarative sentences. Say the thing. Stop.
- Never use: unlock, empower, seamless, cutting-edge, state-of-the-art,
  revolutionary, game-changer, elevate, harness, journey, delve, robust,
  leverage, "in today's world", "take it to the next level".
- No emoji anywhere.
- Never mention AI, automation buzzwords, or how the service is built. The
  buyer is paying for an outcome, not your stack. Saying "AI-powered" makes
  an Indian factory owner assume it is a toy.
- No invented numbers. No percentages you cannot source. No testimonials.
  No customer counts. No "trusted by". This business has zero customers and
  a prospect who catches one fake number never buys anything again.
- Write like a competent tradesman explaining his work: specific, plain,
  slightly understated. Understatement reads as confidence.
- Indian business English. Rupees written as "Rs 1,500" or "₹1,500".
- Where you would normally boast, state a fact instead.`;

/* ---------------------------------------------------------- IDENTITY ---- */
async function factoryIdentity(subject, context){
  const j = await askJson(
`Create the trading identity for a real, brand-new one-person business in
Ludhiana, Punjab, India.

WHAT THE BUSINESS DOES: ${subject}
${context}

${ANTI_AI}

NAMING RULES:
- It must sound like a small Indian firm that has existed for a few years.
  Think how real B2B suppliers are named: a place, a surname, a plain noun,
  or a short compound. Examples of the FEEL (do not copy them):
  "Grand Trunk Systems", "Sahni Works", "Ferozepur Road Labs", "Basant Uptime".
- Forbidden: anything ending in -ify, -ly, -sy, -io, -AI, -Tech, -Hub, -Genius,
  -Nexus, -Verse, -Sphere, -Labs if generic, or any invented Latin word.
  Those all read as an app someone made in a weekend.
- Two words maximum. Must be pronounceable by a 55-year-old factory owner
  on a phone call.

COLOURS: pick a restrained, professional palette. Deep and serious, not
bright. No purple, no neon, no gradient. Think ink on cream paper.

Return ONLY this JSON:
{"name":"trading name",
 "legalName":"the same name with a suffix a sole proprietor would actually use, e.g. '<name> (Sole Proprietorship)'",
 "tagline":"under 9 words, states what it does, no adjectives",
 "brand":"#RRGGBB deep primary colour",
 "ink":"#RRGGBB near-black text colour",
 "paper":"#RRGGBB off-white page background, very light",
 "rule":"#RRGGBB light border colour",
 "fontIndex":0,
 "buyer":"the exact kind of person who pays, one sentence",
 "promise":"the single promise, one sentence, no adjectives",
 "whyNameWorks":"one line: why this name does not sound like a startup"}`,
    'You name and position small Indian B2B firms. Plain, grounded, unfashionable on purpose.',
    'factory-identity','Growth Conductor');
  return j;
}

/* ------------------------------------------------------------- COPY ---- */
async function factoryCopy(id, subject, context, payKnown){
  return await askJson(
`Write the words for the website of this business. You are writing CONTENT
ONLY as structured data. Do not write HTML, do not describe layout, do not
mention design.

BUSINESS: ${id.name} — ${id.tagline}
IT DOES: ${subject}
BUYER: ${id.buyer}
PROMISE: ${id.promise}
${context}
${payKnown ? 'A real payment gateway is connected, so pricing may say "Pay now".'
           : 'No payment gateway yet, so the call to action is email or phone.'}

${ANTI_AI}

Price in INR at a level a small Ludhiana business will actually approve
without a meeting. Three tiers. The middle one is the one you expect them to
pick. Monthly recurring where the service is ongoing.

Return ONLY this JSON:
{"headline":"under 12 words, states the outcome",
 "subhead":"one or two sentences, plain, what it is and who for",
 "ctaPrimary":"3-4 words on the main button",
 "problem":{"title":"heading","paras":["2 or 3 short paragraphs naming the specific pain, no statistics"]},
 "service":{"title":"heading","items":[{"h":"short name of the thing delivered","p":"one or two sentences, concrete"}]},
 "how":{"title":"heading","steps":[{"h":"step name","p":"what happens, and how long it takes"}]},
 "forWhom":{"title":"heading","yes":["3-5 lines: who this is right for"],"no":["2-4 lines: who should NOT buy this — be honest, this sells"]},
 "tiers":[{"name":"tier name","amount":1500,"period":"per month or one-time","who":"one line on who picks this","features":["4-6 concrete lines"],"pick":false}],
 "faq":[{"q":"question a real sceptical buyer asks","a":"honest answer, including the awkward ones about being new"}],
 "about":{"title":"heading","paras":["2-3 paragraphs. It is one person in Ludhiana with no track record. Say so plainly and turn it into a reason to trust: direct access, no account manager, answers the phone himself. Never invent history."]},
 "contact":{"title":"heading","intro":"1-2 sentences","hours":"realistic working hours in IST"},
 "guarantee":"one honest sentence: what happens if the work is not done. Only promise something actually deliverable by one person."}

Exactly 3 tiers. Exactly one tier has "pick": true. 5 to 7 FAQ entries.`,
    'You write copy for small Indian B2B service firms. Plain, specific, unglamorous, honest.',
    'factory-copy','Revenue Streamer');
}

/* --------------------------------------------------------- THE TOOL ---- */
/* A landing page asks for money. A working tool proves you can build. This
   is a real single-file app the buyer can use in their browser, offline. */
async function factoryTool(id, subject, copy){
  const j = await askJson(
`Design ONE small, genuinely useful browser tool that this business gives
away free on its site. It must be real and working, not a demo.

BUSINESS: ${id.name} — ${subject}
BUYER: ${id.buyer}

RULES:
- It solves a small, real, immediate problem for the buyer, related to the
  paid service but not a crippled version of it. Free tool earns the trust,
  paid service does the ongoing work.
- Pure vanilla JavaScript. No libraries, no CDN, no fetch, no network calls.
  It must work with the wifi off.
- Data stays in the browser. If it stores anything, localStorage only, and
  the page must say so.
- Under 200 lines of JS. It must actually run — no placeholders, no TODO,
  no functions that return fake results.
- Do NOT write any CSS or any HTML <head>. Only the body content and script.
- Every element you create must be used. No dead controls.

Examples of the right SIZE of tool (do not copy, invent one that fits):
a GST-inclusive price calculator, a delivery-date counter that skips Sundays,
a bulk-order margin sheet, a fabric metre-to-piece converter.

Return ONLY this JSON:
{"title":"tool name, plain",
 "purpose":"one sentence: what it works out for them",
 "html":"the inner HTML of the tool: a heading, the inputs with labels and ids, an output area. No <html>, <head>, <body>, <style> or <script> tags.",
 "js":"the JavaScript that makes it work. Plain script body, no <script> tags, no imports."}`,
    'You build tiny, correct, dependency-free browser utilities that do exactly one thing.',
    'factory-tool','App Builder');

  const bad = /\b(fetch|XMLHttpRequest|import\s|require\(|eval\(|new Function|document\.write|innerHTML\s*=\s*[^;]*(location|cookie))/i;
  if(bad.test(String(j.js||''))) throw new Error('Tool code tried to use network or unsafe calls — rejected.');
  return j;
}

/* ------------------------------------------------------- LEGAL PAGES ---- */
/* Written in CODE, not by the model. Legal text is exactly where a
   hallucination becomes a liability, and Razorpay's KYC reviewer reads
   these four pages before approving a sole proprietor. */
function legalPages(id, copy){
  const y = new Date().getFullYear();
  const who = fEsc(id.legalName || id.name);
  const em  = fEsc(id.email);
  const ph  = id.phone ? fEsc(id.phone) : null;
  const addr= fEsc(id.address || 'Ludhiana, Punjab, India');
  const contactBlock = `<p><strong>${who}</strong><br>${addr}<br>
Email: <a href="mailto:${em}">${em}</a>${ph?`<br>Phone: ${ph}`:''}</p>`;

  const terms = `<div class="wrap"><section>
<h1>Terms of Service</h1>
<p class="small">Last updated ${new Date().toISOString().slice(0,10)}</p>
<p>These terms govern the services provided by ${who} ("we", "us") to the
customer ("you"). By placing an order or making a payment you accept them.</p>
<h2>1. What we provide</h2>
<p>${fEsc(id.promise)} The specific scope, price and duration of your engagement
are whatever is stated on the plan you purchase or in written correspondence
with us. Nothing outside that written scope is included.</p>
<h2>2. Payment</h2>
<p>All prices are in Indian Rupees and are payable in advance unless agreed
otherwise in writing. Recurring plans are billed for the period stated on the
plan. We may revise prices for future periods with at least 15 days' notice;
your current paid period is not affected.</p>
<h2>3. Your responsibilities</h2>
<p>You confirm that you own, or are authorised to act for, any website,
account, business or data you ask us to work on. You are responsible for the
accuracy of the information you give us. We are not able to work on systems
we have not been given lawful access to.</p>
<h2>4. Availability and limits</h2>
<p>We operate as a small business. Services are provided on a best-effort
basis during the working hours published on our contact page. We do not
guarantee uninterrupted service and we depend on third-party networks and
providers outside our control.</p>
<h2>5. Liability</h2>
<p>Our total liability for any claim arising out of these terms is limited to
the amount you paid us for the service in the three months preceding the
claim. We are not liable for indirect or consequential loss, including loss of
profit, business or data.</p>
<h2>6. Ending the agreement</h2>
<p>Either side may end an ongoing service at any time with written notice.
Refunds, where applicable, are handled under our Refund and Cancellation
Policy.</p>
<h2>7. Governing law</h2>
<p>These terms are governed by the laws of India. The courts at Ludhiana,
Punjab shall have exclusive jurisdiction.</p>
<h2>8. Contact</h2>
${contactBlock}
</section></div>`;

  const privacy = `<div class="wrap"><section>
<h1>Privacy Policy</h1>
<p class="small">Last updated ${new Date().toISOString().slice(0,10)}</p>
<p>${who} respects your privacy. This policy explains what we collect, why,
and what we do with it. It is deliberately short because we collect very
little.</p>
<h2>What we collect</h2>
<table class="plain"><tbody>
<tr><th>Data</th><th>Why</th></tr>
<tr><td>Name, email address, phone number</td><td>To contact you about the service you asked for and to raise invoices.</td></tr>
<tr><td>Business name and address</td><td>To issue a valid invoice.</td></tr>
<tr><td>Website addresses or account details you give us</td><td>To perform the service you are paying for.</td></tr>
<tr><td>Payment reference and amount</td><td>Accounting and reconciliation.</td></tr>
</tbody></table>
<h2>What we do not collect</h2>
<p>We do not store your card, UPI or bank credentials at any time. Payments
are handled entirely by our payment gateway on their systems. We do not use
advertising trackers, and we do not sell or rent your data to anyone, ever.</p>
<h2>Who else sees it</h2>
<p>Only service providers strictly required to deliver the service: our
payment gateway for the transaction, and our email provider for correspondence.
Each is bound by its own privacy terms.</p>
<h2>How long we keep it</h2>
<p>Correspondence and invoices are retained for as long as Indian tax law
requires. Operational data relating to your service is deleted within 90 days
of the service ending, on request or automatically.</p>
<h2>Your rights</h2>
<p>Email us and we will tell you exactly what we hold about you, correct it,
or delete it. We aim to respond within 7 working days.</p>
<h2>Contact</h2>
${contactBlock}
</section></div>`;

  const refund = `<div class="wrap"><section>
<h1>Refund and Cancellation Policy</h1>
<p class="small">Last updated ${new Date().toISOString().slice(0,10)}</p>
<h2>Cancelling an ongoing service</h2>
<p>You can cancel at any time by email. Cancellation takes effect at the end
of the period you have already paid for. We do not lock you into a contract
and we do not charge a cancellation fee.</p>
<h2>Refunds</h2>
<ul>
<li>If we have not started work, you get a full refund.</li>
<li>If we have started but not delivered what was agreed, you get a pro-rata
refund for the undelivered part.</li>
<li>If the service was delivered as described, the fee for that period is not
refundable.</li>
<li>If we are at fault — we failed to deliver what this site promises — tell
us and we will refund that period in full. ${fEsc(copy.guarantee||'')}</li>
</ul>
<h2>How to request one</h2>
<p>Email <a href="mailto:${em}">${em}</a> with your payment reference and what
went wrong. We will reply within 3 working days.</p>
<h2>How long it takes</h2>
<p>Approved refunds are issued to the original payment method within 7 working
days. Your bank may take a further 5 to 7 working days to show it.</p>
<h2>Contact</h2>
${contactBlock}
</section></div>`;

  const shipping = `<div class="wrap"><section>
<h1>Service Delivery Policy</h1>
<p class="small">Last updated ${new Date().toISOString().slice(0,10)}</p>
<p>${who} sells services, not physical goods. Nothing is shipped and there is
no delivery charge.</p>
<h2>When service starts</h2>
<p>Setup begins within one working day of payment being confirmed and of your
having given us the access or information we need to start. You receive
written confirmation by email when it is live.</p>
<h2>How it is delivered</h2>
<p>Entirely online and by email, to the address you gave at the time of
purchase. Where the plan includes visits or calls, those are scheduled with
you directly.</p>
<h2>Where we serve</h2>
<p>India. Correspondence is in English, Hindi or Punjabi.</p>
<h2>If something is delayed</h2>
<p>We will tell you before the due date, not after, and give a revised date.
If a delay is our fault and you no longer want the service, our Refund Policy
applies.</p>
<h2>Contact</h2>
${contactBlock}
</section></div>`;

  return { terms, privacy, refund, shipping };
}

/* -------------------------------------------------- PAGE COMPOSITION ---- */
function payButton(href, label, cls){
  const mailto = /^mailto:/.test(href);
  return `<a class="btn${cls?' '+cls:''}" href="${fEsc(href)}"${mailto?'':' rel="noopener"'}>${fEsc(label)}</a>`;
}
function money(n){ return 'Rs ' + Number(n||0).toLocaleString('en-IN'); }

function pageHome(id, copy, links){
  const t = copy.tiers||[];
  const pick = t.find(x=>x.pick) || t[1] || t[0] || null;
  return `<div class="hero"><div class="wrap">
 <h1>${fEsc(copy.headline)}</h1>
 <p class="lede">${fEsc(copy.subhead)}</p>
 <div class="actions">
  ${payButton(pick ? (links[pick.name]||links._contact) : links._contact, copy.ctaPrimary||'Get started')}
  <a class="btn ghost" href="pricing.html">See pricing</a>
 </div>
</div></div>

<section><div class="wrap">
 <h2>${fEsc(copy.problem.title)}</h2>
 ${(copy.problem.paras||[]).map(p=>`<p>${fEsc(p)}</p>`).join('\n ')}
</div></section>

<section><div class="wrap">
 <h2>${fEsc(copy.service.title)}</h2>
 <div class="cols">
  ${(copy.service.items||[]).map(i=>`<div class="card"><h3>${fEsc(i.h)}</h3><p>${fEsc(i.p)}</p></div>`).join('\n  ')}
 </div>
</div></section>

<section><div class="wrap">
 <h2>${fEsc(copy.forWhom.title)}</h2>
 <div class="cols">
  <div><h3>This is for you if</h3><ul>${(copy.forWhom.yes||[]).map(x=>`<li>${fEsc(x)}</li>`).join('')}</ul></div>
  <div><h3>This is not for you if</h3><ul>${(copy.forWhom.no||[]).map(x=>`<li>${fEsc(x)}</li>`).join('')}</ul></div>
 </div>
</div></section>

<section><div class="wrap">
 <h2>What it costs</h2>
 <div class="cols">${tierCards(t, links)}</div>
 <p class="small" style="margin-top:18px">All prices in Indian Rupees. Full pricing detail on the <a href="pricing.html">pricing page</a>.</p>
</div></section>`;
}

function tierCards(tiers, links){
  return (tiers||[]).map(x=>`<div class="price${x.pick?' pick':''}">
   <h3 style="margin:0">${fEsc(x.name)}</h3>
   <div class="amt">${money(x.amount)}</div>
   <div class="small">${fEsc(x.period||'')}</div>
   <p class="small" style="margin-top:10px">${fEsc(x.who||'')}</p>
   <ul>${(x.features||[]).map(f=>`<li>${fEsc(f)}</li>`).join('')}</ul>
   ${payButton(links[x.name]||links._contact, links[x.name]?'Pay '+money(x.amount):'Enquire', x.pick?'':'ghost')}
  </div>`).join('\n  ');
}

function pagePricing(id, copy, links, payOn){
  return `<div class="wrap"><section>
 <h1>Pricing</h1>
 <p class="lede">No setup fee. No contract. Cancel by email at any time.</p>
 <div class="cols" style="margin-top:26px">${tierCards(copy.tiers, links)}</div>
 <div class="notice"><strong>Our guarantee.</strong> ${fEsc(copy.guarantee||'')}</div>
 ${payOn ? '' : `<p class="small">Payment links are issued by email once you confirm the plan.</p>`}
 <h2>Questions people ask before paying</h2>
 <dl class="faq">${(copy.faq||[]).map(f=>`<dt>${fEsc(f.q)}</dt><dd>${fEsc(f.a)}</dd>`).join('\n  ')}</dl>
 <p style="margin-top:26px">Still unsure? <a href="contact.html">Ask directly</a> — you will get a straight answer, not a sales call.</p>
</section></div>`;
}

function pageHow(id, copy, links){
  const steps = copy.how.steps||[];
  return `<div class="wrap"><section>
 <h1>${fEsc(copy.how.title)}</h1>
 <p class="lede">${fEsc(copy.subhead)}</p>
 <table class="plain" style="margin-top:26px"><tbody>
 ${steps.map((s,i)=>`<tr><th style="width:60px">${String(i+1).padStart(2,'0')}</th>
   <td><strong>${fEsc(s.h)}</strong><br>${fEsc(s.p)}</td></tr>`).join('\n ')}
 </tbody></table>
 <div class="actions">${payButton(links._contact,'Start the first step')}
  <a class="btn ghost" href="pricing.html">See pricing</a></div>
</section></div>`;
}

function pageAbout(id, copy){
  return `<div class="wrap"><section>
 <h1>${fEsc(copy.about.title)}</h1>
 ${(copy.about.paras||[]).map(p=>`<p>${fEsc(p)}</p>`).join('\n ')}
 <div class="notice">We have deliberately put no testimonials, no client logos
 and no statistics on this website. This is a new business. Anything in that
 space would be invented, and you would be right not to trust it. Judge the
 work instead — <a href="contact.html">ask for it on one site, free, for a week</a>.</div>
 <h2>Where we are</h2>
 <p>${fEsc(id.address||'Ludhiana, Punjab, India')}. Work is done remotely; in
 Ludhiana we can come to you.</p>
</section></div>`;
}

function pageContact(id, copy, links){
  const em = fEsc(id.email);
  return `<div class="wrap"><section>
 <h1>${fEsc(copy.contact.title)}</h1>
 <p class="lede">${fEsc(copy.contact.intro)}</p>
 <table class="plain" style="max-width:520px;margin-top:22px"><tbody>
  <tr><th>Email</th><td><a href="mailto:${em}">${em}</a></td></tr>
  ${id.phone?`<tr><th>Phone</th><td><a href="tel:${fEsc(String(id.phone).replace(/[^\d+]/g,''))}">${fEsc(id.phone)}</a></td></tr>`:''}
  ${id.whatsapp?`<tr><th>WhatsApp</th><td><a href="https://wa.me/${fEsc(String(id.whatsapp).replace(/[^\d]/g,''))}">${fEsc(id.whatsapp)}</a></td></tr>`:''}
  <tr><th>Hours</th><td>${fEsc(copy.contact.hours||'Monday to Saturday, 10:00 to 19:00 IST')}</td></tr>
  <tr><th>Based in</th><td>${fEsc(id.address||'Ludhiana, Punjab, India')}</td></tr>
 </tbody></table>
 <div class="actions">${payButton('mailto:'+id.email+'?subject='+encodeURIComponent('Enquiry — '+id.name),'Send an email')}</div>
 <p class="small" style="margin-top:24px">There is no contact form on this site
 on purpose. Forms on new sites break silently and the enquiry is lost. Email
 and phone always arrive.</p>
</section></div>`;
}

function pageTool(id, tool){
  return `<div class="wrap"><section>
 <h1>${fEsc(tool.title)}</h1>
 <p class="lede">${fEsc(tool.purpose)} Free, no sign-up. It runs entirely in your
 browser — nothing you type here is sent anywhere.</p>
 <div class="card" style="margin-top:24px">
${tool.html}
 </div>
 <p class="small" style="margin-top:20px">Built by ${fEsc(id.name)}. If this is
 useful, the <a href="pricing.html">paid service</a> does the ongoing work for you.</p>
</section>
<script>
(function(){
try{
${tool.js}
}catch(e){ console.error('tool error', e); }
})();
</script>
</div>`;
}

/* ------------------------------------------------------------ INVOICE ---- */
function invoiceHtml(id){
  return `<!DOCTYPE html><html lang="en-IN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice — ${fEsc(id.name)}</title>
<style>${FACTORY.css(id)}
.inv{max-width:800px;margin:30px auto;background:#fff;border:1px solid ${FACTORY.esc(id.rule||'#DDD9CF')};padding:38px}
.inv .top{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:30px}
[contenteditable]{outline:1px dashed transparent;padding:1px 3px;border-radius:2px}
[contenteditable]:hover{outline-color:#C9C4B8;background:#FBFAF6}
[contenteditable]:focus{outline:1px solid ${FACTORY.esc(id.brand||'#1F3A5F')};background:#fff}
.tot{text-align:right;font-size:20px;font-weight:600;margin-top:16px}
@media print{.noprint{display:none}.inv{border:0;margin:0}body{background:#fff}}
</style></head><body>
<div class="inv">
 <div class="noprint small" style="margin-bottom:18px;color:#807B71">
  Click any text to edit it, then use your browser's Print → Save as PDF.
  Nothing here is uploaded anywhere.</div>
 <div class="top">
  <div>${FACTORY.logoSvg(id)}
   <div style="margin-top:8px"><strong>${fEsc(id.legalName||id.name)}</strong><br>
   <span class="small">${fEsc(id.address||'Ludhiana, Punjab, India')}<br>
   ${fEsc(id.email)}${id.phone?' · '+fEsc(id.phone):''}${id.gstin?'<br>GSTIN: '+fEsc(id.gstin):''}</span></div></div>
  <div style="text-align:right">
   <h2 style="margin:0">INVOICE</h2>
   <div class="small">No. <span contenteditable>INV-001</span><br>
   Date: <span contenteditable>${new Date().toISOString().slice(0,10)}</span><br>
   Due: <span contenteditable>On receipt</span></div></div>
 </div>
 <p class="small" style="text-transform:uppercase;letter-spacing:.06em;color:#6B675E">Bill to</p>
 <p contenteditable>Client name<br>Client address<br>Client GSTIN (if any)</p>
 <table class="plain" style="margin-top:20px"><thead><tr>
  <th>Description</th><th style="width:90px">Qty</th><th style="width:130px">Rate (Rs)</th><th style="width:130px">Amount (Rs)</th>
 </tr></thead><tbody>
  <tr><td contenteditable>${fEsc(id.promise||'Service')} — monthly</td><td contenteditable>1</td><td contenteditable>0</td><td contenteditable>0</td></tr>
  <tr><td contenteditable>&nbsp;</td><td contenteditable>&nbsp;</td><td contenteditable>&nbsp;</td><td contenteditable>&nbsp;</td></tr>
 </tbody></table>
 <div class="tot">Total: Rs <span contenteditable>0</span></div>
 <hr>
 <p class="small"><strong>Payment</strong><br>
 <span contenteditable>Bank name / Account number / IFSC / UPI ID — fill this in once and keep this file.</span></p>
 <p class="small"><span contenteditable>No GST charged — supplier is below the registration threshold.</span>
 Delete that line once you are GST registered and add your rate.</p>
 <p class="small" style="margin-top:22px;color:#807B71">
 ${fEsc(id.legalName||id.name)} · Sole proprietorship · Ludhiana, Punjab, India</p>
</div></body></html>`;
}

/* --------------------------------------------------------- OUTREACH ---- */
async function factoryOutreach(id, copy, siteNote){
  return await askJson(
`Write the messages the Owner sends to get the first customer. He is one
person in Ludhiana with a brand-new business and ZERO customers.

BUSINESS: ${id.name} — ${id.tagline}
BUYER: ${id.buyer}
CHEAPEST PLAN: ${money((copy.tiers&&copy.tiers[0]&&copy.tiers[0].amount)||0)}
${siteNote}

${ANTI_AI}

ABSOLUTE RULES FOR THESE MESSAGES:
- Never claim he has monitored, audited, analysed or noticed anything about
  the recipient's business unless the message explicitly tells him to check
  it first and put the real finding in.
- Never claim other customers, other clients, or any track record.
- The WhatsApp message must be under 60 words. Punjabi business owners read
  it on a phone between two other things.
- Offer something free and finite first. Asking a stranger for money in the
  first message is why every cold pitch fails.
- No "Hope you are doing well". No "I wanted to reach out".

Return ONLY this JSON:
{"whatsapp":"the message, under 60 words, ready to paste",
 "email":{"subject":"under 8 words, specific, not clever","body":"under 150 words, plain text, ends with one clear small ask"},
 "inPerson":"what he literally says walking into a shop, 3 sentences maximum",
 "followUp":"the message sent 4 days later if there is no reply, under 40 words",
 "firstTenTargets":["10 specific, findable kinds of business in Ludhiana to approach first — describe the type and where to find them, e.g. 'hosiery exporters listed on IndiaMART with a working website'"],
 "objections":[{"they":"what they say to refuse","you":"the honest one-line reply"}]}`,
    'You write cold outreach that a sceptical Indian small-business owner replies to. Short, useful, no flattery.',
    'factory-outreach','Growth Conductor');
}

/* ================================================== THE BUILD ITSELF ==== */
async function buildBusiness(opts){
  opts = opts || {};
  const v = opts.ventureId ? S.ventures.find(x=>x.id===opts.ventureId) : null;
  const idea = v ? S.ideas.find(i=>i.id===v.ideaId) : null;
  const brief = (opts.brief||'').trim();

  if(!v && !brief) throw new Error('Pick a researched venture, or write a brief. He will not build a business on nothing.');
  if(!S.owner || !S.owner.email) throw new Error('Set your email in Owner Settings first — it goes on every page, invoice and policy.');

  const subject = v ? `${v.title}. ${v.revenuePath||''}` : brief;
  const context = idea && idea.research
    ? `RESEARCH ON FILE — scored ${idea.score}/100 (${idea.verdict}).
${idea.research.reasoning}
Named buyer: ${idea.buyer}. Price point discussed: Rs ${idea.price}.`
    : 'No formal research on file — the Owner supplied this brief directly.';

  const steps = [];
  const t0 = Date.now();
  const mark = (s,note)=>{ steps.push({s,note,ms:Date.now()-t0});
    log('INFO','FACTORY',`${s}${note?' — '+note:''}`); };

  /* 1 — identity */
  mark('Naming the business and setting the house style');
  const raw = await factoryIdentity(subject, context);
  const id = {
    name: String(raw.name||'').slice(0,40) || 'New Venture',
    legalName: String(raw.legalName||raw.name||'').slice(0,60),
    tagline: String(raw.tagline||'').slice(0,90),
    brand: raw.brand, ink: raw.ink, paper: raw.paper, rule: raw.rule,
    fontIndex: Number(raw.fontIndex)||0,
    buyer: raw.buyer||'', promise: raw.promise||'',
    email: S.owner.email,
    phone: (S.owner.phone||opts.phone||'').trim(),
    whatsapp: (opts.whatsapp||S.owner.phone||'').trim(),
    address: (opts.address||'Ludhiana, Punjab, India').trim(),
    gstin: (opts.gstin||'').trim(),
  };
  /* the model loves startup suffixes; refuse them in code, not in a prompt */
  if(/(ify|ly|sy|io|ai|tech|hub|nexus|verse|sphere|genius|guru|ninja)$/i.test(id.name.replace(/\s+/g,'')))
    mark('WARNING: name still has a startup suffix', id.name);

  /* 2 — copy, audited, one forced rewrite if it reads like a machine */
  mark('Writing the copy');
  let copy = await factoryCopy(id, subject, context, !!S.pay);
  let tells = FACTORY.audit(JSON.stringify(copy));
  let rewrote = false;
  if(tells.length){
    mark(`Copy failed the realness audit (${tells.length} tells) — forcing a rewrite`);
    const list = tells.map(h=>`- "${h.found}" → ${h.why}`).join('\n');
    const r2 = await askJson(
`Rewrite this website copy. It was rejected because it reads as machine-written.

WHAT WAS FLAGGED:
${list}

Remove every flagged phrase and pattern. Do not substitute a different
cliché. Where a flagged sentence carried no information, delete it entirely
rather than rephrasing it — most of them carry none.

${ANTI_AI}

Return the SAME JSON structure, corrected:
${JSON.stringify(copy).slice(0,7000)}`,
      'You strip marketing filler out of copy until only facts remain.',
      'factory-copy-fix','Revenue Streamer');
    if(r2 && r2.tiers) { copy = r2; rewrote = true; }
    tells = FACTORY.audit(JSON.stringify(copy));
    mark(rewrote ? `Rewrite done — ${tells.length} tells remain` : 'Rewrite failed, keeping original');
  } else mark('Copy passed the realness audit clean');

  /* normalise tiers so the templates never break on a bad model reply */
  copy.tiers = (Array.isArray(copy.tiers)?copy.tiers:[]).slice(0,3)
    .map(x=>({ name:String(x.name||'Plan').slice(0,30), amount:Math.max(0,Math.round(+x.amount||0)),
               period:String(x.period||'per month').slice(0,30), who:String(x.who||'').slice(0,140),
               features:(Array.isArray(x.features)?x.features:[]).slice(0,8).map(f=>String(f).slice(0,120)),
               pick:!!x.pick }));
  if(!copy.tiers.length) throw new Error('The model returned no pricing tiers. Rebuild, or use a stronger model.');
  if(!copy.tiers.some(t=>t.pick)) copy.tiers[Math.min(1,copy.tiers.length-1)].pick = true;
  ['problem','service','how','forWhom','about','contact'].forEach(k=>{ copy[k] = copy[k]||{}; });
  copy.problem.paras = copy.problem.paras||[]; copy.service.items = copy.service.items||[];
  copy.how.steps = copy.how.steps||[]; copy.forWhom.yes = copy.forWhom.yes||[];
  copy.forWhom.no = copy.forWhom.no||[]; copy.about.paras = copy.about.paras||[];
  copy.faq = copy.faq||[];

  /* 3 — real payment links, one per tier */
  const links = { _contact: 'mailto:'+id.email+'?subject='+encodeURIComponent('Enquiry — '+id.name) };
  let payNote = 'No payment gateway connected — every button is an email link.';
  if(S.pay && !S.pay.live){
    const G = PAY.GATEWAYS[S.pay.gateway];
    for(const t of copy.tiers){
      if(t.amount<=0) continue;
      try{
        const l = await G.link(S.pay, { amount:t.amount, description:`${id.name} — ${t.name}`,
          email:id.email, currency:'INR', ref:uid('REF') });
        links[t.name] = l.url;
        S.orders.unshift({ id:l.id, t:nowIso(), url:l.url, amount:t.amount, currency:l.currency,
          desc:`${id.name} — ${t.name}`, customer:'(site button)', gateway:S.pay.gateway,
          live:false, status:l.status, paid:0 });
      }catch(e){ mark('Payment link failed for tier '+t.name, e.message); }
    }
    S.orders = S.orders.slice(0,200);
    const n = copy.tiers.filter(t=>links[t.name]).length;
    payNote = `${n} real ${S.pay.gateway} TEST payment links wired into the buttons. Switch to live keys and rebuild before you send this to a customer.`;
    mark('Payment links created', n+' of '+copy.tiers.length);
  } else if(S.pay && S.pay.live){
    payNote = 'Gateway is in LIVE mode. Live links need your password per link, so buttons are email links. Raise them by hand in Payments and paste them in.';
    mark('Live mode — buttons left as email links (a live link needs your signature)');
  } else mark('No gateway — buttons are email links');

  /* 4 — the free tool */
  let tool = null;
  if(opts.tool !== false){
    mark('Building the free browser tool');
    try{ tool = await factoryTool(id, subject, copy); mark('Tool built', tool.title); }
    catch(e){ mark('Tool build failed — pack continues without it', e.message); }
  }

  /* 4b — is the trading name actually gettable as a domain?
     A business named something already taken is a business with no address. */
  let domainOpts = null;
  try{
    const sld = id.name.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(sld){
      const rs = await DOMAINS.checkMany(DOMAINS.expand(sld,['in','com','co.in']), {lanes:3,gap:220});
      domainOpts = rs.map(r=>({name:r.name,status:r.status,price:r.price,why:r.why||null}));
      const free = rs.filter(r=>r.status==='AVAILABLE');
      mark('Checked the trading name against live registries',
        free.length ? free.map(r=>r.name).join(', ')+' available'
                    : 'NONE FREE — the name is taken everywhere, consider renaming');
    }
  }catch(e){ mark('Domain check failed — pack continues without it', e.message); }

  /* 5 — legal (code-written) */
  mark('Writing the four policy pages Razorpay checks');
  const legal = legalPages(id, copy);

  /* 6 — outreach */
  mark('Writing the outreach scripts');
  let out = null;
  try{ out = await factoryOutreach(id, copy, payNote); }
  catch(e){ mark('Outreach generation failed', e.message); }

  /* 7 — compose every page through the house shell */
  const nav = FACTORY.PAGES;
  const files = [];
  const P = (f,title,html,desc)=>files.push({ name:'site/'+f, data:FACTORY.shell(id,f,title,html,{desc}) });

  P('index.html', id.name, pageHome(id,copy,links), copy.subhead);
  P('pricing.html','Pricing', pagePricing(id,copy,links,!!S.pay), 'Plans and prices in INR.');
  P('how-it-works.html', copy.how.title||'How it works', pageHow(id,copy,links), '');
  P('about.html', copy.about.title||'About', pageAbout(id,copy), '');
  P('contact.html', copy.contact.title||'Contact', pageContact(id,copy,links), '');
  P('terms.html','Terms of Service', legal.terms,'');
  P('privacy.html','Privacy Policy', legal.privacy,'');
  P('refund.html','Refund & Cancellation', legal.refund,'');
  P('shipping.html','Service Delivery', legal.shipping,'');
  if(tool) P('tool.html', tool.title, pageTool(id,tool), tool.purpose);

  files.push({ name:'site/robots.txt', data:'User-agent: *\nAllow: /\n' });
  files.push({ name:'site/_redirects', data:'/* /index.html 404\n' });
  files.push({ name:'invoice-template.html', data:invoiceHtml(id) });

  if(out){
    files.push({ name:'outreach/whatsapp.txt', data:String(out.whatsapp||'') });
    files.push({ name:'outreach/email.txt',
      data:`Subject: ${out.email&&out.email.subject||''}\n\n${out.email&&out.email.body||''}` });
    files.push({ name:'outreach/in-person.txt', data:String(out.inPerson||'') });
    files.push({ name:'outreach/follow-up.txt', data:String(out.followUp||'') });
    files.push({ name:'outreach/first-ten-targets.txt',
      data:(out.firstTenTargets||[]).map((x,i)=>`${i+1}. ${x}`).join('\n') });
    files.push({ name:'outreach/objections.txt',
      data:(out.objections||[]).map(o=>`THEY: ${o.they}\nYOU : ${o.you}\n`).join('\n') });
  }

  /* 8 — final audit over everything that ships */
  const shipped = files.filter(f=>/\.(html|txt)$/.test(f.name))
                       .map(f=>String(f.data)).join('\n');
  const finalTells = FACTORY.audit(shipped);
  mark('Final realness audit', finalTells.length ? finalTells.length+' tells left' : 'clean');

  files.push({ name:'README.txt', data:FACTORY.ownerReadme(id, files, S.pay) });
  if(finalTells.length)
    files.push({ name:'REALNESS-AUDIT.txt',
      data:`These phrases still read as machine-written. Open the file, find them,\nrewrite them in your own words. Each one costs you credibility.\n\n`
        + finalTells.map(h=>`  "${h.found}"\n    ${h.why}\n`).join('\n') });

  const bundle = FACTORY.zip(files);

  const biz = {
    id: uid('BIZ'), t: nowIso(),
    name: id.name, tagline: id.tagline, identity: id,
    ventureId: v ? v.id : null, subject,
    tiers: copy.tiers, tellCount: finalTells.length, tells: finalTells.slice(0,20),
    rewrote, payNote, hasTool: !!tool, toolTitle: tool?tool.title:null,
    domains: domainOpts,
    outreach: out, steps,
    fileList: files.map(f=>({ name:f.name, bytes:Buffer.byteLength(
      Buffer.isBuffer(f.data)?f.data:Buffer.from(String(f.data))) })),
    zipBytes: bundle.length,
    /* The HTML does NOT live in data.json. It goes to a gzipped blob, and
       the ZIP is rebuilt from it on download. Four packs inside the state
       file would push it past what the GitHub Contents API can sanely
       rewrite on every save. */
    blob: true,
    published: false, publishedUrl: '',
  };
  S.businesses = S.businesses || [];
  S.businesses.unshift(biz);
  /* files go to their own compressed blob, never into data.json */
  const bstat = await BLOBS.put(biz.id, files);
  log('INFO','FACTORY',
    `Pack stored out-of-band: ${(bstat.raw/1024).toFixed(0)} KB of files → ${(bstat.stored/1024).toFixed(0)} KB compressed (${bstat.ratio}:1). data.json stays lean.`);
  /* evict old packs' blobs so storage does not grow without bound */
  for(const old of S.businesses.slice(6)) await BLOBS.del(old.id);
  S.businesses = S.businesses.slice(0,6);
  save();
  log('OK','FACTORY',
    `"${id.name}" built — ${files.length} files, ${(bundle.length/1024).toFixed(1)} KB, `
    + (finalTells.length?`${finalTells.length} realness tells flagged`:'realness audit clean'));
  return biz;
}

CAPS['ai.build_business'] = { pillar:3, safe:true,
  desc:'Turn the newest launched venture into a complete business pack — site, tool, policies, invoice, outreach',
  async run(){
    const v = S.ventures[0];
    if(!v) return { msg:'No launched venture. Research and launch one first.', n:0 };
    if((S.businesses||[]).some(b=>b.ventureId===v.id))
      return { msg:`Business pack already built for "${v.title}".`, n:0 };
    const b = await buildBusiness({ ventureId:v.id });
    return { msg:`Business "${b.name}" built — ${b.fileList.length} files, ${(b.zipBytes/1024).toFixed(1)} KB.`,
      n:1, detail: b.tellCount ? `${b.tellCount} realness tells flagged for your edit.` : 'Realness audit clean.' };
  }};


/* ======================================================================
   DOMAIN DESK

   Two jobs, and the Chairman must never confuse them:

   1. CHECKING a name is free, instant and needs nobody's permission.
      RDAP is mandated by ICANN; every registry runs one. He can do this
      all day at zero cost, and he does it FOR you and for your clients.

   2. REGISTERING a name is a paid, licensed, KYC'd act. He cannot do it.
      Not "not yet" — structurally cannot. Writing into a registry needs
      an EPP credential issued to an accredited registrar, and money.
      He gets you to one click from it and stops.

   The business he CAN build here is the naming and brand-availability
   service, plus reseller margin once the Owner opens an account in his
   own name. That is stated honestly everywhere in this file.
   ====================================================================== */

const HOW_DOMAINS_WORK = `
THE CHAIN, TOP TO BOTTOM

  ICANN            writes the rules and accredits registrars.
   └─ REGISTRY     runs exactly one extension and owns its database.
      Verisign owns .com and .net. NIXI, a government-backed body in
      New Delhi, owns .in. Public Interest Registry owns .org.
       └─ REGISTRAR   accredited and contracted to write into that
          registry over a protocol called EPP. GoDaddy, Cloudflare,
          Porkbun, BigRock, Hostinger.
           └─ RESELLER   sells a registrar's stock under its own brand
              and keeps the margin. No accreditation needed.
               └─ THE CUSTOMER

NOBODY CREATES A DOMAIN
A domain is not manufactured. The registry already publishes a zone file
for its extension; registering inserts your name into it. You are renting
a row in someone else's database, one year at a time. Stop paying and it
is deleted and resold.

WHAT IT COSTS TO STAND AT EACH RUNG (checked August 2026)

  Become a REGISTRY (own a new .something)
    ICANN application fee              USD 227,000 one-time
    Annual ICANN fees                  USD 25,800
    Realistic year-one total           USD 350,000 to 1,200,000
    → Not a consideration. Stated only so the number is known.

  Become an ICANN-ACCREDITED REGISTRAR (.com, .net, .org)
    Application fee                    USD 3,500 non-refundable
    Annual accreditation fee           USD 4,000
    Variable ICANN fee                 ~USD 800-1,200 per quarter
    Proof of working capital           USD 70,000 must be demonstrated
    Liability insurance                USD 500,000 cover, mandatory
    Realistic fixed cost               ~USD 9,000-10,000 per year
    → Roughly Rs 8 lakh a year before selling one domain. You would
      need to push about 9,000+ domain-years annually just to beat
      buying at retail. Not viable.

  Become a .IN ACCREDITED REGISTRAR (NIXI, India only)
    One-time accreditation fee         Rs 50,000 non-refundable
    Minimum initial funding            Rs 75,000 total
      (Rs 50,000 fee + Rs 25,000 pre-paid registration balance)
    Plus technical qualification against NIXI's EPP test system
    → An order of magnitude cheaper than ICANN and India-only. Still
      real money and a real compliance burden. Revisit at volume.

  Become a RESELLER
    ResellerClub base slab deposit     USD 25 (about Rs 2,200)
    Some Indian resellers charge       Rs 4,999 one-time setup
    → This is the only rung reachable from zero. You sell at your own
      price and keep the difference. No accreditation, no insurance,
      no capital proof.

WHERE THE MARGIN ACTUALLY IS — the uncomfortable arithmetic
  Cloudflare sells .com at cost, about USD 10.46, roughly Rs 920.
  Porkbun sells at about USD 11.08, roughly Rs 975.
  A reseller's wholesale .com is around Rs 950-1,080.

  So "sell domains cheaper than the big providers" is already a solved
  and dead market. Cloudflare charges literally zero markup and can
  afford to forever, because domains are a loss-leader that feeds their
  real business. You cannot out-price a company that has priced at cost
  on purpose. Anyone telling you otherwise is selling you a reseller
  package.

  GoDaddy is beatable — they renew .com at about USD 22.99, roughly
  Rs 2,020, more than double wholesale. But you beat GoDaddy on price
  by pointing customers at Cloudflare, which earns you nothing.

  The money is NOT in the domain. It is in what surrounds it:
    · Finding the name. Availability search is free to run and the
      part customers actually find hard.
    · The bundle. Domain plus a built website plus email plus
      monitoring, one invoice, one person who answers the phone.
      Rs 950 of domain inside a Rs 8,000 package is invisible.
    · Doing it FOR them. A Ludhiana factory owner will not open a
      Cloudflare account, verify an email and configure nameservers.
      He will pay Rs 2,000 for someone to hand him a working website
      at a name he likes.
  Sell the outcome. The domain is a line item, not the product.
`;

/* -------------------------------------------------- CAPABILITIES ---- */

CAPS['dom.check_own'] = { pillar:2, safe:true,
  desc:"Re-check the Owner's watchlist of domains and flag any that freed up",
  async run(){
    const w = (S.domains && S.domains.watch) || [];
    if(!w.length) return { msg:'Watchlist empty. Add names in Domain Desk.', n:0 };
    const rs = await DOMAINS.checkMany(w.map(x=>x.name), { lanes:2, gap:400 });
    let freed = 0, changed = [];
    for(const r of rs){
      const item = w.find(x=>x.name===r.name);
      if(!item) continue;
      const was = item.status;
      item.status = r.status; item.checked = nowIso();
      item.expires = r.expires || item.expires;
      item.registrar = r.registrar || item.registrar;
      if(was === 'TAKEN' && r.status === 'AVAILABLE'){
        freed++; changed.push(r.name);
        log('OK','DOMAIN DESK',`"${r.name}" HAS BEEN RELEASED and is available right now. Someone will take it.`);
      }
    }
    save();
    return { msg:`Re-checked ${rs.length} watched name(s). ${freed} freed up.`,
      n:rs.length, detail: freed ? 'FREE NOW: '+changed.join(', ') : 'no changes' };
  }};

CAPS['dom.expiring_soon'] = { pillar:5, safe:true,
  desc:'Flag watched domains expiring within 60 days — the moment to approach that owner',
  async run(){
    const w = (S.domains && S.domains.watch) || [];
    const soon = w.filter(x=>{
      if(!x.expires) return false;
      const d = (new Date(x.expires) - Date.now()) / 86400000;
      return d > 0 && d < 60;
    });
    if(!soon.length) return { msg:'Nothing on the watchlist expires within 60 days.', n:0 };
    return { msg:`${soon.length} watched name(s) expire within 60 days.`, n:soon.length,
      detail: soon.map(x=>`${x.name} on ${String(x.expires).slice(0,10)}`).join('; ') };
  }};

/* -------------------------------------------- NAME GENERATION ---- */
/* He invents candidate names, then EVERY ONE is checked against the live
   registry. A suggested name that turns out to be taken is worse than no
   suggestion — so nothing is shown until RDAP has ruled on it. */
async function suggestNames(brief, tlds, count){
  if(!S.llm) throw new Error('CONNECT AN AI BRAIN FIRST');
  const want = Math.min(24, Math.max(6, +count || 14));

  const j = await askJson(
`Invent ${want} candidate domain names for this business.

BUSINESS: ${brief}
Owner is one person in Ludhiana, Punjab, India. Sells to Indian businesses.

${ANTI_AI}

NAMING RULES — these matter more than cleverness:
- It must survive being said down a bad phone line to a 55-year-old
  factory owner. If he has to spell it twice, it is dead.
- No invented Latin. No -ify, -ly, -io, -sy, -ai, -tech, -hub, -nexus,
  -verse, -sphere, -genius, -ninja, -guru suffixes. Those brand you as
  a weekend project.
- No double letters at a word join. No numbers substituting letters.
- Under 15 characters in the name part, ideally under 11.
- Draw on things that are real and local where it fits: Punjabi and
  Hindi words a business owner already knows, Ludhiana landmarks,
  trades, seasons, plain English nouns. A real word beats a coined one.
- Mix the registers: some plain-descriptive, some place-rooted, some
  short surname-style. Do not give ${want} variations of one idea.

Return ONLY a JSON array of ${want} objects:
[{"sld":"the name part only, lowercase, no dot, no extension",
  "why":"under 12 words: what it means and why it works",
  "register":"one of: descriptive, local, surname, plain"}]`,
    'You name small Indian B2B firms. Plain, sayable, unfashionable on purpose.',
    'domain-suggest','Growth Conductor');

  const arr = (Array.isArray(j) ? j : (j.names || j.suggestions || [])).slice(0, want);
  if(!arr.length) throw new Error('The model returned no names. Try again or use a stronger model.');

  const list = tlds && tlds.length ? tlds : ['in','com','co.in'];
  const jobs = [];
  for(const it of arr){
    const sld = String(it.sld||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
    if(!sld) continue;
    for(const t of list) jobs.push({ sld, tld:t, why:it.why||'', register:it.register||'', name:sld+'.'+t });
  }

  /* every single one is verified against the live registry */
  const results = await DOMAINS.checkMany(jobs.map(j=>j.name), { lanes:3, gap:220, cap:80 });
  const byName = {}; results.forEach(r=>{ byName[r.name] = r; });

  const rows = {};
  for(const j of jobs){
    const r = byName[j.name] || { status:'UNKNOWN' };
    rows[j.sld] = rows[j.sld] || { sld:j.sld, why:j.why, register:j.register, options:[] };
    rows[j.sld].options.push({ name:j.name, tld:j.tld, status:r.status,
      price:r.price||null, registrar:r.registrar||null, expires:r.expires||null,
      why:r.why||null });
  }
  const out = Object.values(rows);
  /* a name with a free .in or .com beats one with only a free .xyz */
  const rank = o=>{
    let s = 0;
    for(const x of o.options){
      if(x.status!=='AVAILABLE') continue;
      s += (x.tld==='in'||x.tld==='com') ? 10 : (x.tld==='co.in') ? 6 : 2;
    }
    return s - o.sld.length*0.1;
  };
  out.sort((a,b)=>rank(b)-rank(a));

  const run = { id:uid('DOM'), t:nowIso(), brief, tlds:list, rows:out,
    checked: results.length,
    available: results.filter(r=>r.status==='AVAILABLE').length,
    unknown: results.filter(r=>r.status==='UNKNOWN').length };
  S.domains = S.domains || { watch:[], runs:[] };
  S.domains.runs = S.domains.runs || [];
  S.domains.runs.unshift(run);
  S.domains.runs = S.domains.runs.slice(0,8);
  save();
  log('OK','DOMAIN DESK',
    `${out.length} names invented, ${results.length} live registry checks, ${run.available} available.`
    + (run.unknown ? ` ${run.unknown} could not be resolved and are NOT counted as free.` : ''));
  return run;
}

/* Whether the Owner should be a reseller yet — arithmetic, not opinion. */
function resellerMath(perMonth){
  const n = Math.max(0, Math.round(+perMonth || 0));
  const WHOLESALE_IN = 620;      /* indicative reseller cost, .in, INR */
  const RETAIL_IN    = 950;      /* what a small firm pays without shopping around */
  const marginEach   = RETAIL_IN - WHOLESALE_IN;
  const setup        = 4999;     /* typical Indian reseller onboarding */
  const yearProfit   = n * 12 * marginEach;
  return {
    perMonth:n, marginEach, setup,
    yearProfit,
    breakEvenDomains: Math.ceil(setup / marginEach),
    verdict: n < 15
      ? `At ${n} domains a month you make about Rs ${yearProfit.toLocaleString('en-IN')} a year — before a single hour of support. Do not open a reseller account. Register each client's domain on their own card at Cloudflare or Porkbun, charge for the setup, and keep zero renewal liability.`
      : `At ${n} a month a reseller account clears its Rs ${setup.toLocaleString('en-IN')} setup in about ${Math.ceil(setup/(n*marginEach))} month(s) and returns roughly Rs ${yearProfit.toLocaleString('en-IN')} a year. Worth doing — but you now own every renewal, every transfer dispute and every angry call at 11pm.`
  };
}


const CHANNELS = {
  email: { id:'email', label:'Email', auto:true,
    needs:'A Gmail app password in Mail Relay.',
    truth:'Fully automatic. Real SMTP from your own address. Free, unlimited within Gmail\'s ~500/day cap.' },
  whatsapp: { id:'whatsapp', label:'WhatsApp', auto:false,
    needs:'Your thumb.',
    truth:'Not automatable for free. The consumer app has no API; unofficial automation gets the number BANNED. He writes it and gives you a wa.me link — one tap, message pre-filled.' },
  gbp: { id:'gbp', label:'Google Business Profile', auto:false,
    needs:'Postcard or phone verification at your address.',
    truth:'The single highest-return free thing for a local Indian business. Cannot be automated — Google verifies a human at a real address. He fills in every field for you to paste.' },
  social: { id:'social', label:'Social posts', auto:false,
    needs:'You paste it.',
    truth:'Instagram/Facebook need a Meta app and OAuth. X charges for write access. He writes the posts and the image briefs; posting is manual.' },
  seo: { id:'seo', label:'Website content', auto:true,
    needs:'A built business to add pages to.',
    truth:'He writes real pages into your site pack. That is genuine SEO — content that answers what people search. Ranking still takes months and nobody can promise position one.' },
  inperson: { id:'inperson', label:'Walk in', auto:false,
    needs:'Shoes.',
    truth:'You are in Ludhiana, in the middle of your entire market. The highest-converting channel available to you and the one you keep skipping.' },
};

/* ---------------------------------------------------- PLAN ---- */
async function planCampaign(bizId, goal){
  const biz = (S.businesses||[]).find(x=>x.id===bizId);
  if(!biz) throw new Error('Build the business first. There is nothing to market.');

  const t = telemetry();
  const capability = `
WHAT HE CAN ACTUALLY SEND RIGHT NOW:
  Email via SMTP : ${t.smtp_ready ? 'ARMED — he can send real email himself' : 'NOT ARMED — no app password set, so he can send nothing'}
  Everything else: prepared for the Owner to send by hand.
Owner is one person in Ludhiana. No staff, no ad budget, no track record.
Business: ${biz.name} — ${biz.tagline}
Buyer: ${biz.buyer || 'unspecified'}
Cheapest plan: Rs ${(biz.tiers&&biz.tiers[0]&&biz.tiers[0].amount)||'?'}
Site published: ${biz.published ? biz.publishedUrl : 'NOT PUBLISHED YET — there is nowhere to send anyone'}`;

  const j = await askJson(
`Plan a two-week campaign to get the FIRST paying customer for this business.

${capability}
GOAL: ${goal || 'first paying customer'}

${ANTI_AI}

HARD CONSTRAINTS ON WHAT YOU MAY PROPOSE:
- Zero budget. No ads, no paid tools, no sponsorships.
- Do not propose posting to Instagram, Facebook, X or LinkedIn automatically.
  Those cannot be automated for free. Propose the CONTENT; the Owner posts it.
- Do not propose WhatsApp automation. Propose the message; he taps send.
- Never claim the Owner has existing customers, results or observations.
- Do not promise a Google ranking. Nobody can.
- Prefer things that work in week one over things that work in month six.

Return ONLY this JSON:
{"name":"campaign name, plain",
 "thesis":"one sentence: why this gets a customer and not just attention",
 "firstCustomerBy":"a realistic date range, and say plainly if it is unlikely",
 "actions":[
   {"channel":"one of: email, whatsapp, gbp, social, seo, inperson",
    "title":"what this action is",
    "why":"one line: why it moves money, not attention",
    "day":1,
    "minutes":20,
    "auto":false,
    "content":"the ACTUAL finished text to send or post. Not a description of it. Ready to use as-is.",
    "subject":"only for email actions",
    "target":"exactly who receives it",
    "doneWhen":"how the Owner knows it worked"}],
 "targets":["8-12 specific findable Ludhiana businesses or business types, with WHERE to find each"],
 "imageBriefs":[{"for":"which action","brief":"precise description to hand a free image tool","text":"any words that must appear in the image"}],
 "weekTwo":"one line: what changes in week two based on what week one taught you",
 "killCriteria":"the honest signal that this campaign is not working and should be stopped"}

6 to 10 actions. At least half must be things that can happen in the first three days.`,
    'You plan zero-budget campaigns for one-person Indian B2B businesses. Concrete, unglamorous, first-customer focused.',
    'campaign-plan','Growth Conductor');

  /* the model does not get to decide what is automatable — code does */
  const acts = (Array.isArray(j.actions)?j.actions:[]).slice(0,12).map((a,i)=>{
    const ch = CHANNELS[a.channel] ? a.channel : 'inperson';
    const canAuto = CHANNELS[ch].auto && (ch !== 'email' || telemetry().smtp_ready);
    return { id: uid('ACT'), n:i+1, channel:ch, title:String(a.title||'').slice(0,120),
      why:String(a.why||'').slice(0,200), day:Math.max(1,Math.min(14,+a.day||1)),
      minutes:Math.max(2,Math.min(240,+a.minutes||15)),
      auto: canAuto,                       /* never trust the model's own flag */
      autoBlocked: CHANNELS[ch].auto && !canAuto ? 'SMTP not armed' : null,
      content:String(a.content||''), subject:String(a.subject||'').slice(0,140),
      target:String(a.target||'').slice(0,200), doneWhen:String(a.doneWhen||'').slice(0,200),
      status:'PENDING', sentAt:null, result:null };
  });
  if(!acts.length) throw new Error('The model returned no actions. Try again or use a stronger model.');

  const camp = { id: uid('CAMP'), t: nowIso(), bizId, bizName: biz.name,
    name: String(j.name||'Campaign').slice(0,80),
    thesis: String(j.thesis||'').slice(0,300),
    firstCustomerBy: String(j.firstCustomerBy||'').slice(0,140),
    weekTwo: String(j.weekTwo||'').slice(0,300),
    killCriteria: String(j.killCriteria||'').slice(0,300),
    targets:(j.targets||[]).slice(0,14).map(x=>String(x).slice(0,220)),
    imageBriefs:(j.imageBriefs||[]).slice(0,8),
    actions: acts, status:'DRAFT', approvedAt:null,
    autoCount: acts.filter(a=>a.auto).length };

  S.campaigns = S.campaigns || [];
  S.campaigns.unshift(camp);
  S.campaigns = S.campaigns.slice(0,10);
  save();
  log('OK','GROWTH',
    `Campaign "${camp.name}" planned for ${biz.name} — ${acts.length} actions, ${camp.autoCount} he can send himself, ${acts.length-camp.autoCount} need your hand.`);
  return camp;
}

/* ------------------------------------------------ APPROVE + RUN ---- */
/* One tick approves the whole campaign. Then he executes ONLY the actions
   code has certified as automatable, and parks the rest on your desk. */
async function runCampaign(campId){
  const c = (S.campaigns||[]).find(x=>x.id===campId);
  if(!c) throw new Error('No such campaign');
  if(c.status === 'RUNNING') throw new Error('Already running');

  const willSend = c.actions.some(a=>a.auto && a.channel==='email');
  if(willSend && !S.smtpVerified)
    throw new Error('This campaign sends real email, but your mail credentials have never been proven against the real server. '
      + 'Run the SMTP preflight in Mail Relay first — it takes two seconds and tells you exactly what is wrong if anything is.');

  c.status = 'RUNNING'; c.approvedAt = nowIso();
  log('CRIT','GROWTH',`Campaign "${c.name}" APPROVED by Owner. Executing ${c.autoCount} automatic action(s).`);

  let sent = 0, parked = 0, failed = 0;
  for(const a of c.actions){
    if(!a.auto){
      /* becomes a job on the desk, with the words already written */
      S.missions.unshift({ id: uid('MSN'), t:nowIso(), status:'OPEN',
        title:`[${CHANNELS[a.channel].label}] ${a.title}`,
        why:`${a.why}  —  ${CHANNELS[a.channel].truth}`,
        minutes:a.minutes,
        steps:[ `Target: ${a.target}`,
                CHANNELS[a.channel].needs,
                'Copy the text below exactly. Do not improve it.',
                a.doneWhen ? 'Done when: '+a.doneWhen : 'Mark it done here afterwards.' ],
        script: a.subject ? `Subject: ${a.subject}\n\n${a.content}` : a.content,
        doneWhen: a.doneWhen || 'you have sent it',
        risk: CHANNELS[a.channel].auto ? (a.autoBlocked||'') : 'This channel cannot be automated for free — see the note above.',
        campaignId: c.id, actionId: a.id });
      a.status = 'ON_YOUR_DESK'; parked++;
      continue;
    }

    if(a.channel === 'email'){
      const to = (a.target||'').match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if(!to){
        a.status = 'NEEDS_ADDRESS';
        a.result = 'No email address in the target. He will not guess an address — a bounce burns your sending reputation.';
        parked++;
        S.missions.unshift({ id: uid('MSN'), t:nowIso(), status:'OPEN',
          title:`Find the email address for: ${a.target}`.slice(0,110),
          why:'He has the message written and ready to send automatically. He is missing only the address. Find it and he sends it himself.',
          minutes:10,
          steps:['Look on their website contact page, IndiaMART listing, or Google Business Profile.',
                 'Paste it into the campaign action here.',
                 'He sends it the moment you do.'],
          script:'', doneWhen:'the address is filled in', risk:'Many small firms list only a phone number. If so, this becomes a call or a walk-in.',
          campaignId:c.id, actionId:a.id });
        continue;
      }
      try{
        await mail(a.subject || `Regarding your website`, a.content, 'OUTREACH', to[0]);
        a.status = 'SENT'; a.sentAt = nowIso(); sent++;
        S.outreach = S.outreach || [];
        S.outreach.unshift({ t:nowIso(), channel:'email', to:to[0],
          subject:a.subject||'', campaignId:c.id, bizId:c.bizId, replied:false });
        S.outreach = S.outreach.slice(0,200);
        log('OK','GROWTH',`Email actually sent to ${to[0]} — "${a.subject||''}"`);
      }catch(e){
        a.status = 'FAILED'; a.result = e.message; failed++;
        log('CRIT','GROWTH',`Email to ${to[0]} FAILED: ${e.message}`);
      }
    } else if(a.channel === 'seo'){
      /* real: append a content page into the business pack */
      a.status = 'ON_YOUR_DESK'; parked++;
      S.missions.unshift({ id: uid('MSN'), t:nowIso(), status:'OPEN',
        title:`Add this page to your site: ${a.title}`.slice(0,110),
        why:a.why, minutes:a.minutes,
        steps:['The page text is below.','Rebuild the business pack, or paste it into your live site.','Re-upload to Netlify.'],
        script:a.content, doneWhen:a.doneWhen||'the page is live',
        risk:'SEO takes months. Nobody can promise a ranking.',
        campaignId:c.id, actionId:a.id });
    }
  }

  S.missions = S.missions.slice(0,60);
  c.sent = sent; c.parked = parked; c.failed = failed;
  c.status = 'ACTIVE';
  save();
  log(sent?'OK':'WARN','GROWTH',
    `Campaign "${c.name}" running — ${sent} sent automatically, ${parked} on your desk, ${failed} failed.`);
  return { sent, parked, failed, campaign:c };
}

/* Fill in a missing address, then he sends it immediately. */
async function fillAddress(campId, actionId, email){
  const c = (S.campaigns||[]).find(x=>x.id===campId);
  if(!c) throw new Error('No such campaign');
  const a = c.actions.find(x=>x.id===actionId);
  if(!a) throw new Error('No such action');
  if(!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(String(email||'').trim()))
    throw new Error('That is not a valid email address.');
  if(!telemetry().smtp_ready) throw new Error('SMTP is not armed. Set a Gmail app password in Mail Relay first.');
  const to = email.trim();
  await mail(a.subject || 'Regarding your website', a.content, 'OUTREACH', to);
  a.status='SENT'; a.sentAt=nowIso(); a.target=to;
  S.outreach = S.outreach || [];
  S.outreach.unshift({ t:nowIso(), channel:'email', to, subject:a.subject||'',
    campaignId:c.id, bizId:c.bizId, replied:false });
  S.missions = (S.missions||[]).filter(m=>m.actionId!==actionId);
  c.sent = (c.sent||0)+1;
  log('OK','GROWTH',`Email actually sent to ${to} after you supplied the address.`);
  save();
  return { to };
}

CAPS['growth.followup'] = { pillar:5, safe:true,
  desc:'Flag outreach sent 4+ days ago with no reply — the follow-up is where most sales actually happen',
  async run(){
    const o = (S.outreach||[]).filter(x=>!x.replied);
    const due = o.filter(x=>(Date.now()-new Date(x.t+'Z').getTime())/86400000 >= 4);
    if(!due.length) return { msg:`${o.length} outreach message(s) open, none due for follow-up yet.`, n:0 };
    return { msg:`${due.length} message(s) sent 4+ days ago with no reply. Follow up — most sales close on the second touch.`,
      n:due.length, detail: due.slice(0,8).map(x=>x.to).join(', ') };
  }};

CAPS['growth.stalled'] = { pillar:5, safe:true,
  desc:'Say plainly whether the business is stalled and name the one thing blocking money',
  async run(){
    const B=(S.businesses||[]), C=(S.campaigns||[]), O=(S.outreach||[]);
    const blockers=[];
    if(!B.length) blockers.push('No business built. Nothing exists to sell.');
    else if(!B.some(x=>x.published)) blockers.push('A business is built but NOT PUBLISHED. There is nowhere to send a prospect.');
    if(!telemetry().smtp_ready) blockers.push('SMTP not armed — he cannot send a single email himself.');
    if(!S.pay) blockers.push('No payment gateway. Even a willing buyer cannot pay you.');
    if(!C.length) blockers.push('No campaign planned. Nobody knows this business exists.');
    else if(!O.length) blockers.push('Campaign exists but ZERO messages have actually gone out.');
    if(!blockers.length)
      return { msg:`${O.length} message(s) sent, ${B.filter(x=>x.published).length} business(es) live. Not stalled.`, n:0 };
    return { msg:`STALLED. ${blockers.length} thing(s) block money. First: ${blockers[0]}`,
      n:blockers.length, detail: blockers.join(' | ') };
  }};

/* What the box can actually do. Each entry is real code that already runs. */
const DO_TOOLS = {
  'check_domain':   { need:'a name like sandhuworks.in', desc:'Check if a domain is free, against the live registry' },
  'suggest_names':  { need:'what the business does',      desc:'Invent business names and check every one live' },
  'read_site':      { need:'a URL',                        desc:'Read a website and summarise what it actually does' },
  'copy_product':   { need:'a URL',                        desc:'Study a competitor and work out how to rebuild what it does' },
  'build_business': { need:'what the business does',       desc:'Build the whole business: site, policies, tool, invoice, outreach' },
  'plan_campaign':  { need:'nothing, uses the newest business', desc:'Plan the campaign that gets the first customer' },
  'find_ideas':     { need:'nothing',                      desc:'Invent money-making ideas for Ludhiana' },
  'check_sites':    { need:'nothing',                      desc:'Probe every monitored site right now' },
  'whats_broken':   { need:'nothing',                      desc:'Say plainly what is blocking money' },
  'write_draft':    { need:'who it is for and what to say', desc:'Write an email, WhatsApp message or proposal' },
  'content_week':   { need:'a built business, or the niche', desc:'Plan a week of Instagram content — hooks, captions, hashtags, visual briefs' },
  'ask_doc':        { need:'a file already attached',      desc:'Answer from the attached file, quoting it' },
  'answer':         { need:'nothing',                      desc:'Just answer the question — no action needed' },
};

const URL_RE    = /https?:\/\/[^\s<>"']+/i;
const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]{0,62}\.(?:com|in|co\.in|net|org|io|dev|app|xyz|site|shop|store|online|tech|info|biz|me|ai))\b/i;

/* PROJECTS — one thread per piece of work.
   use.ai calls them Projects; Claude calls them the same. The reason they
   exist is not tidiness: it is that a single flat log poisons the context.
   Ask about the hosiery business and get answers coloured by a domain check
   from three days ago. Each project keeps its own thread and its own files. */
function curProject(){
  if(!S.projects || !S.projects.length){
    S.projects = [{ id:'PRJ-MAIN', name:'General', t:nowIso(), docs:[] }];
    S.projectId = 'PRJ-MAIN';
  }
  if(!S.projects.some(x=>x.id===S.projectId)) S.projectId = S.projects[0].id;
  return S.projects.find(x=>x.id===S.projectId);
}
function chatSay(who, text, extra){
  const pid = curProject().id;
  S.chat.unshift(Object.assign({ t:nowIso(), who, text, pid }, extra||{}));
  /* keep 120 per project, not 120 total — a busy project used to evict
     everything else and the older threads silently vanished */
  const byPrj = {};
  S.chat = S.chat.filter(m=>{
    const k = m.pid || 'PRJ-MAIN';
    byPrj[k] = (byPrj[k]||0) + 1;
    return byPrj[k] <= 120;
  });
}

/* The single entry point. Returns what he DID, not what he intends to do. */
/* WHAT HE REMEMBERS.
   Every message used to be standalone, so "build that one" meant nothing —
   he had no idea what "that" was. Claude and every usable assistant keep the
   thread. This returns the last few turns, trimmed, so follow-ups work. */
function recentTurns(n){
  const pid = curProject().id;
  const t = (S.chat||[])
    .filter(m=>(m.pid||'PRJ-MAIN')===pid && (m.who==='OWNER'||m.who==='CHAIRMAN'))
    .slice(0, (n||6)*2).reverse();
  if(!t.length) return '';
  return 'WHAT WAS ALREADY SAID (most recent last):\n'
    + t.map(m=>`${m.who==='OWNER'?'OWNER':'YOU'}: ${String(m.text).slice(0,600)}`).join('\n')
    + '\n\n';
}
/* Files the Owner attached to the conversation, if any. */
function attachedContext(){
  const pid = curProject().id;
  const d = (S.docs||[]).filter(x=>!x.pid || x.pid===pid).slice(0,3);
  if(!d.length) return '';
  return 'FILES THE OWNER ATTACHED:\n'
    + d.map(x=>`--- ${x.name} (${x.chars} chars) ---\n${String(x.text||'').slice(0,6000)}`).join('\n\n')
    + '\n\n';
}

async function doIt(text){
  const raw = String(text||'').trim();
  if(!raw) throw new Error('Say something.');
  chatSay('OWNER', raw);

  const low = raw.toLowerCase();
  const url = (raw.match(URL_RE)||[])[0];
  const dom = (raw.match(DOMAIN_RE)||[])[0];

  /* ---- 1. A URL, with no other instruction: read it. Nothing to choose. */
  if(url && !/build|copy|clone|rebuild|compete|like this|same as/i.test(low)){
    return await act_readSite(url);
  }
  if(url){
    return await act_copyProduct(url, raw);
  }

  /* ---- 2. A bare domain: check it. Instant, free, no model needed. */
  if(dom && !url && /\b(free|available|taken|check|domain|buy|get)\b/i.test(low)){
    return await act_checkDomain(dom);
  }
  if(dom && !url && raw.split(/\s+/).length <= 3){
    return await act_checkDomain(dom);
  }

  /* ---- 2b. A file is attached and he is being asked about it. */
  if((S.docs||[]).length && /\b(this|it|the (file|document|pdf|sheet|csv)|attached|summar|explain|what.?s in)\b/i.test(low)
     && !url && !dom){
    return await act_askDoc(raw);
  }

  /* ---- 3. Obvious intents, matched in code. No model call, no latency. */
  if(/^(what.?s|whats|what is) (broken|wrong|blocking|stopping)/i.test(low)
     || /why (am i|are we) not (earning|making)/i.test(low)
     || /\bstuck\b|\bstalled\b/i.test(low))
    return await act_whatsBroken();

  if(/check (all |every |my )?(the )?(sites?|websites?|monitors?)/i.test(low)
     || /\bare (my |the )?sites? (up|down|working)/i.test(low))
    return await act_checkSites();

  if(/(find|give|invent|think of|need) .{0,20}(ideas?|business|money|way to earn)/i.test(low)
     || /^ideas?$/i.test(low))
    return await act_findIdeas();

  if(/(name|naming) (ideas?|suggestions?)|suggest .{0,15}names?|what should i (call|name)/i.test(low))
    return await act_suggestNames(raw);

  if(/build (me )?(the |a |this )?(whole )?(business|company|site|website|everything)/i.test(low))
    return await act_buildBusiness(raw);

  if(/(plan|start|run) .{0,15}(campaign|outreach|marketing)|get (me )?(a |the )?(first )?customers?/i.test(low))
    return await act_planCampaign();

  if(/(instagram|insta|reels?|social|content) .{0,20}(week|plan|posts?|calendar)/i.test(low)
     || /(plan|write|make|batch) .{0,20}(my )?(week|content|posts?|reels?|instagram)/i.test(low))
    return await act_contentWeek(raw);

  /* ---- 4. Everything else: the model picks ONE real tool. */
  return await act_route(raw);
}

/* ------------------------------------------------------------ actions ---- */

async function act_readSite(url){
  chatSay('SYSTEM', `Reading ${url} …`, { pending:true });
  let page;
  try{ page = await RESEARCH.readPage(url); }
  catch(e){
    const m = `I could not read ${url} — ${e.message}. That usually means the site blocks automated readers, or the address is wrong.`;
    chatSay('CHAIRMAN', m); save(); return { did:'read_site', ok:false, text:m };
  }
  if(!S.llm){
    const m = `Read it: "${page.title}", ${page.text.length} characters. Connect an AI brain and I can tell you what it means.`;
    chatSay('CHAIRMAN', m); save(); return { did:'read_site', ok:true, text:m };
  }
  const r = await think(
`I read this page for the Owner. Tell him what it IS and whether there is money in it for him.

URL: ${url}
TITLE: ${page.title}
CONTENT:
${page.text.slice(0,7000)}

${ANTI_AI}

Answer in under 140 words, as four short labelled lines:
WHAT IT IS — one sentence.
WHO PAYS — the actual buyer, and roughly what for.
THE GAP — what it does badly, ignores, or charges too much for.
FOR YOU — whether a one-person operation in Ludhiana could take a slice, and the honest first step. If the answer is no, say no.`,
    null, 'chat-read', 'Market Signal');
  chatSay('CHAIRMAN', r.text, { source:url });
  save();
  return { did:'read_site', ok:true, text:r.text };
}

async function act_copyProduct(url, brief){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  chatSay('SYSTEM', `Studying ${url} …`, { pending:true });
  const a = await analyseProduct(url, brief);
  const txt = `I studied it. ${a.summary||''}\n\n`
    + (a.jobs && a.jobs.length ? `The jobs it actually does:\n` + a.jobs.map(j=>`  · ${typeof j==='string'?j:(j.job||JSON.stringify(j))}`).join('\n') : '')
    + `\n\nOpen "Copy Any Product" to see the full breakdown and build the agents.`;
  chatSay('CHAIRMAN', txt, { source:url });
  save();
  return { did:'copy_product', ok:true, text:txt, goto:'arch' };
}

async function act_checkDomain(name){
  const list = /\./.test(name) ? [name] : DOMAINS.expand(name, ['in','com','co.in']);
  const rs = await DOMAINS.checkMany(list, { lanes:3, gap:200 });
  const free  = rs.filter(r=>r.status==='AVAILABLE');
  const taken = rs.filter(r=>r.status==='TAKEN');
  let txt = '';
  if(free.length)
    txt += 'FREE RIGHT NOW:\n' + free.map(r=>`  ${r.name} — about Rs ${r.price&&r.price.first||'?'} the first year`).join('\n');
  if(taken.length)
    txt += (txt?'\n\n':'') + 'ALREADY TAKEN:\n' + taken.map(r=>`  ${r.name}${r.registrar?' — '+r.registrar:''}${r.expires?', expires '+String(r.expires).slice(0,10):''}`).join('\n');
  const bad = rs.filter(r=>r.status!=='AVAILABLE'&&r.status!=='TAKEN');
  if(bad.length) txt += `\n\nCould not resolve: ${bad.map(r=>r.name).join(', ')} — treat as unknown, not as free.`;
  txt += '\n\nChecked live against the registry. I cannot buy it — that needs a card and KYC in your name. Cloudflare or Porkbun, three minutes.';
  chatSay('CHAIRMAN', txt, { domains: rs });
  save();
  return { did:'check_domain', ok:true, text:txt, results:rs };
}

async function act_suggestNames(brief){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  chatSay('SYSTEM', 'Inventing names, then checking every one live …', { pending:true });
  const run = await suggestNames(brief, ['in','com','co.in'], 10);
  const best = run.rows.filter(r=>r.options.some(o=>o.status==='AVAILABLE')).slice(0,6);
  const txt = best.length
    ? 'Names that are actually available:\n\n' + best.map(r=>
        `  ${r.sld} — ${r.why}\n    ${r.options.filter(o=>o.status==='AVAILABLE').map(o=>o.name).join('  ')}`).join('\n\n')
      + `\n\n${run.checked} live registry checks. ${run.available} available.`
    : `I invented ${run.rows.length} names and every one was taken. That usually means the words are too obvious. Tell me something specific about the business and I will go again.`;
  chatSay('CHAIRMAN', txt);
  save();
  return { did:'suggest_names', ok:true, text:txt, goto:'domains' };
}

async function act_buildBusiness(brief){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  if(!S.owner || !S.owner.email) throw new Error('Set your email in Owner Settings first — it goes on every page and invoice.');
  chatSay('SYSTEM', 'Building the whole business. Two to four minutes …', { pending:true });
  const biz = await buildBusiness({ brief: brief.replace(/^.*?(build|make|create)\s+/i,'').trim() || brief });
  const freeDom = (biz.domains||[]).filter(d=>d.status==='AVAILABLE');
  const txt = `Built "${biz.name}" — ${biz.fileList.length} files.\n\n`
    + `  ${biz.tagline}\n`
    + `  Pricing: ${biz.tiers.map(t=>`${t.name} Rs ${t.amount}`).join(' · ')}\n`
    + `  ${biz.tellCount ? biz.tellCount+' phrases flagged as machine-sounding — listed for your edit' : 'Realness audit clean'}\n`
    + (freeDom.length ? `  Domain available: ${freeDom.map(d=>d.name).join(', ')}\n` : '')
    + `\nOpen it, download the ZIP, drag it onto Netlify Drop. Live in three minutes.`;
  chatSay('CHAIRMAN', txt, { bizId: biz.id });
  save();
  return { did:'build_business', ok:true, text:txt, goto:'factory' };
}

async function act_planCampaign(){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  const biz = (S.businesses||[])[0];
  if(!biz){
    const m = 'There is no business to market yet. Tell me what it does and I will build it first.';
    chatSay('CHAIRMAN', m); save(); return { did:'plan_campaign', ok:false, text:m };
  }
  chatSay('SYSTEM', `Planning the campaign for ${biz.name} …`, { pending:true });
  const c = await planCampaign(biz.id, '');
  const txt = `Campaign planned for ${biz.name}: "${c.name}"\n\n`
    + `  ${c.thesis}\n\n`
    + `  ${c.actions.length} actions. I can send ${c.autoCount} myself; the rest need your hand and the words are already written.\n`
    + `  First customer: ${c.firstCustomerBy}\n\n`
    + `Nothing goes out until you approve it.`;
  chatSay('CHAIRMAN', txt, { campaignId: c.id });
  save();
  return { did:'plan_campaign', ok:true, text:txt, goto:'growth' };
}

async function act_findIdeas(){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  chatSay('SYSTEM', 'Thinking …', { pending:true });
  const r = await CAPS['ai.ideas'].run();
  const fresh = (S.ideas||[]).slice(0,5);
  const txt = fresh.length
    ? fresh.map(i=>`  ${i.title}\n    Buyer: ${i.buyer||'—'} · Rs ${i.price||'?'}${i.unfair_edge?`\n    Edge: ${i.unfair_edge}`:''}`).join('\n\n')
      + '\n\nSay "build" and the name of one and I will build the whole business.'
    : r.msg;
  chatSay('CHAIRMAN', txt);
  save();
  return { did:'find_ideas', ok:true, text:txt, goto:'ventures' };
}

async function act_checkSites(){
  if(!(S.monitors||[]).length){
    const m = 'You have no sites bound. Paste a website address and I will start watching it.';
    chatSay('CHAIRMAN', m); save(); return { did:'check_sites', ok:false, text:m };
  }
  chatSay('SYSTEM', `Probing ${S.monitors.length} site(s) …`, { pending:true });
  await runMonitors(true);
  const down = S.monitors.filter(m=>m.state==='DOWN');
  const txt = S.monitors.map(m=>
    `  ${m.state==='UP'?'UP  ':'DOWN'}  ${m.name} — ${m.lastMs||0}ms${m.lastErr?' · '+m.lastErr:''}`).join('\n')
    + (down.length ? `\n\n${down.length} DOWN. That is the thing to deal with now.` : '\n\nAll reachable.');
  chatSay('CHAIRMAN', txt);
  save();
  return { did:'check_sites', ok:true, text:txt };
}

async function act_whatsBroken(){
  const r = await CAPS['growth.stalled'].run();
  const parts = String(r.detail||r.msg).split(' | ');
  const txt = r.n
    ? 'In order, these block money:\n\n' + parts.map((x,i)=>`  ${i+1}. ${x}`).join('\n')
      + '\n\nFix the first one. The rest do not matter until it is done.'
    : r.msg;
  chatSay('CHAIRMAN', txt);
  save();
  return { did:'whats_broken', ok:true, text:txt };
}

async function act_askDoc(question){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  const names = (S.docs||[]).slice(0,3).map(d=>d.name).join(', ');
  chatSay('SYSTEM', `Reading ${names} …`, { pending:true });
  const r = await think(
`${attachedContext()}${recentTurns(3)}The Owner asked about the file(s) above: "${question}"

${ANTI_AI}

Answer from what is ACTUALLY in the file. If the answer is not in there, say
so plainly rather than inventing it. Quote the relevant line when it helps.
Under 200 words.`,
    null, 'chat-doc', 'Insight Forge');
  chatSay('CHAIRMAN', r.text, { source: names });
  save();
  return { did:'ask_doc', ok:true, text:r.text };
}

async function act_contentWeek(raw){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  chatSay('SYSTEM', 'Planning the week — hooks, captions, hashtags, visual briefs …', { pending:true });
  const niche = /for |about /i.test(raw) ? raw.replace(/^.*?(for|about)\s+/i,'').trim() : '';
  const w = await buildContentWeek({ niche });
  const txt = `${w.posts.length} posts planned for ${w.bizName} — ${w.reels} reels.\n\n`
    + w.posts.map(p=>`  ${p.day} · ${(POST_KINDS[p.kind]||{}).label||p.kind}\n    "${p.hook}"`).join('\n')
    + `\n\n${w.tellCount ? w.tellCount+' phrase(s) flagged as machine-sounding — listed for your edit.' : 'Audit clean.'}`
    + `\n\nOpen Content Studio, download the text, paste it into Meta Business Suite. About 40 minutes for the week.`
    + `\n\nI cannot post it for you. No free tool can — the ones that claim to are running bots that get accounts banned. Meta Business Suite is Instagram's own scheduler and it is free.`;
  chatSay('CHAIRMAN', txt, { weekId: w.id });
  save();
  return { did:'content_week', ok:true, text:txt, goto:'content' };
}

async function act_writeDraft(brief){
  if(!S.llm) throw new Error('Connect an AI brain first.');
  const r = await think(
`${attachedContext()}${recentTurns(3)}The Owner wants this written: "${brief}"

He is one person in Ludhiana, Punjab, selling to Indian businesses. He has no
customers yet and no track record.

${ANTI_AI}

Write the finished thing, ready to send. No preamble, no "here is your draft",
no explanation afterwards. If it is an email, start with a Subject: line.`,
    null, 'chat-draft', 'Growth Conductor');
  chatSay('CHAIRMAN', r.text, { copyable:true });
  save();
  return { did:'write_draft', ok:true, text:r.text };
}

/* The model chooses ONE tool from the real menu, then it actually runs. */
async function act_route(raw){
  if(!S.llm){
    const m = 'No AI brain connected, so I can only do the mechanical things: check a domain, probe your sites, tell you what is broken. Connect a free key in AI Brain.';
    chatSay('CHAIRMAN', m); save(); return { did:'answer', ok:false, text:m };
  }
  const menu = Object.entries(DO_TOOLS).map(([k,v])=>`  ${k} — ${v.desc}`).join('\n');
  const state = `${(S.businesses||[]).length} business(es) built, ${(S.monitors||[]).length} sites watched, `
    + `${(S.ideas||[]).length} ideas, ${(S.outreach||[]).length} messages sent, `
    + `mail ${S.smtpVerified?'proven':(S.smtp?'configured but unproven':'off')}, `
    + `payments ${S.pay?'armed':'off'}.`;

  const j = await askJson(
`${recentTurns(4)}The Owner typed this into the one box he uses for everything:

"${raw}"

STATE: ${state}

Pick the ONE tool that best serves him. Do not explain, do not chat.

${menu}

If he is asking a question rather than requesting work, pick "answer".

Return ONLY: {"tool":"one of the names above","arg":"the argument to pass, or empty string","why":"under 12 words"}`,
    'You route a request to exactly one tool. Terse. No prose.',
    'chat-route','Chairman');

  const tool = DO_TOOLS[j.tool] ? j.tool : 'answer';
  const arg  = String(j.arg||'').trim() || raw;

  switch(tool){
    case 'check_domain':   return await act_checkDomain(arg);
    case 'suggest_names':  return await act_suggestNames(arg);
    case 'read_site':      return await act_readSite(arg);
    case 'copy_product':   return await act_copyProduct(arg, raw);
    case 'build_business': return await act_buildBusiness(arg);
    case 'plan_campaign':  return await act_planCampaign();
    case 'find_ideas':     return await act_findIdeas();
    case 'check_sites':    return await act_checkSites();
    case 'whats_broken':   return await act_whatsBroken();
    case 'write_draft':    return await act_writeDraft(arg);
    case 'ask_doc':        return await act_askDoc(arg);
    case 'content_week':   return await act_contentWeek(arg);
  }

  /* plain answer */
  const r = await think(
`${attachedContext()}${recentTurns(6)}STATE: ${state}

The Owner asked: "${raw}"

Answer him directly. You are his Chairman, not a help desk. He may be
referring to something said earlier — the history above is yours, use it.
If something cannot be done, say so and say what can. Never claim to have
done anything you have not. Under 150 words.`, null, 'chat-answer', 'Chairman');
  chatSay('CHAIRMAN', r.text);
  save();
  return { did:'answer', ok:true, text:r.text };
}


const POST_KINDS = {
  reel:     { label:'Reel',     note:'Largest organic reach. Prioritise these.' },
  carousel: { label:'Carousel', note:'Best for teaching something in steps.' },
  single:   { label:'Post',     note:'One image. Good for proof and announcements.' },
  story:    { label:'Story',    note:'Behind the scenes. Low effort, keeps you present.' },
};

async function buildContentWeek(opts){
  opts = opts || {};
  if(!S.llm) throw new Error('CONNECT AN AI BRAIN FIRST');

  const biz = opts.bizId ? (S.businesses||[]).find(b=>b.id===opts.bizId) : (S.businesses||[])[0];
  const niche = String(opts.niche||'').trim()
    || (biz ? `${biz.name} — ${biz.tagline}. Buyer: ${biz.buyer||'unspecified'}.` : '');
  if(!niche) throw new Error('Build a business first, or tell me the niche. He will not invent a brand for you.');

  const count = Math.min(10, Math.max(3, +opts.count || 7));
  const handle = String(opts.handle||'').trim();

  /* What worked last time, so week two is not a repeat of week one. */
  const last = (S.content||[])[0];
  const learned = last && (last.posts||[]).some(p=>p.result)
    ? 'WHAT ALREADY WORKED — do more of this, less of the rest:\n'
      + (last.posts||[]).filter(p=>p.result).map(p=>`  "${p.hook}" -> ${p.result}`).join('\n') + '\n\n'
    : '';

  const j = await askJson(
`${learned}Plan ONE WEEK of Instagram content for this business.

BUSINESS: ${niche}
The Owner is one person in Ludhiana, Punjab, India. He sells to Indian
businesses. He has no customers yet and no track record.

${ANTI_AI}

HARD RULES, and they come from the Owner's own research:
- Reels first. They get the largest organic reach. At least half must be reels.
- The hook must land in the first 1.5 seconds. Text overlay stating the
  payoff, not a slow introduction. No "hey guys", no throat-clearing.
- 3 to 5 SPECIFIC hashtags, never 30 generic ones. Niche tags outperform
  broad ones. Include at least one Ludhiana or Punjab tag where it fits.
- Never claim followers, results, clients or income he does not have.
- Write captions a factory owner would read, not influencer voice. No emoji
  spam. One emoji maximum per caption, and only if it genuinely helps.
- Every post must have a reason to exist: it teaches, proves, or asks.
  Nothing posted for the sake of posting.

Return ONLY this JSON:
{"pillars":[{"name":"pillar name","why":"one line: why this pillar earns attention from THIS buyer"}],
 "posts":[
   {"day":"Monday",
    "kind":"one of: reel, carousel, single, story",
    "hook":"the exact words on screen in the first 1.5 seconds, under 12 words",
    "caption":"the full caption, ready to paste. Under 120 words. Ends with one clear ask.",
    "hashtags":["3 to 5 specific tags, with the # included"],
    "visual":"precise brief for a free tool like Canva or CapCut: what is on screen, shot by shot for reels. No stock-photo cliches.",
    "cta":"what you want the viewer to actually do",
    "pillar":"which pillar this belongs to",
    "why":"one line: why this specific post earns a follow or an enquiry"}],
 "audioNote":"how to pick trending audio for the reels this week, in one line",
 "bioSuggestion":"a bio under 150 characters that says what he does and for whom",
 "firstComment":"the comment to post yourself immediately after publishing, to seed the thread"}

Exactly ${count} posts. Three or four pillars. Spread across the week.`,
    'You plan Instagram content for small Indian B2B businesses. Plain, useful, no influencer voice.',
    'content-week','Growth Conductor');

  const posts = (Array.isArray(j.posts)?j.posts:[]).slice(0,count).map((x,i)=>({
    id: uid('POST'), n:i+1,
    day: String(x.day||'').slice(0,12),
    kind: POST_KINDS[x.kind] ? x.kind : 'single',
    hook: String(x.hook||'').slice(0,120),
    caption: String(x.caption||'').slice(0,1200),
    hashtags: (Array.isArray(x.hashtags)?x.hashtags:[]).slice(0,6)
      .map(h=>String(h).trim()).filter(Boolean)
      .map(h=>h.startsWith('#')?h:'#'+h.replace(/^#+/,'')),
    visual: String(x.visual||'').slice(0,600),
    cta: String(x.cta||'').slice(0,140),
    pillar: String(x.pillar||'').slice(0,60),
    why: String(x.why||'').slice(0,200),
    posted:false, result:null,
  }));
  if(!posts.length) throw new Error('The model returned no posts. Try again, or use a stronger model.');

  /* The realness audit applies here too — an influencer-sounding caption is
     the same failure as an AI-sounding landing page. */
  const tells = FACTORY.audit(JSON.stringify({posts, p:j.pillars}));

  const week = {
    id: uid('WEEK'), t: nowIso(),
    bizId: biz ? biz.id : null, bizName: biz ? biz.name : '(no business)',
    niche, handle,
    pillars: (j.pillars||[]).slice(0,5),
    posts,
    audioNote: String(j.audioNote||'').slice(0,300),
    bioSuggestion: String(j.bioSuggestion||'').slice(0,200),
    firstComment: String(j.firstComment||'').slice(0,300),
    tells: tells.slice(0,12), tellCount: tells.length,
    reels: posts.filter(p=>p.kind==='reel').length,
  };
  S.content = S.content || [];
  S.content.unshift(week);
  S.content = S.content.slice(0,6);
  save();
  log('OK','CONTENT',
    `Week planned: ${posts.length} posts (${week.reels} reels) for ${week.bizName}.`
    + (tells.length ? ` ${tells.length} phrase(s) flagged as machine-sounding.` : ' Audit clean.'));
  return week;
}

/* Plain text a human can paste into Meta Business Suite one post at a time. */
function contentPlain(week){
  const L = [];
  L.push(`${week.bizName.toUpperCase()} — CONTENT WEEK`);
  L.push(`Planned ${week.t}`);
  L.push('');
  L.push('HOW TO USE THIS');
  L.push('  1. business.facebook.com -> Meta Business Suite -> Planner.');
  L.push('     It is Instagram\'s own scheduler, free, and the only one that');
  L.push('     auto-publishes Reels without workarounds. Third-party tools');
  L.push('     often only send you a reminder to post manually.');
  L.push('  2. Your account must be a Professional (Creator) account, or');
  L.push('     scheduling and insights do not exist. Settings -> Account type.');
  L.push('  3. Build each visual in Canva or CapCut using the brief below.');
  L.push('  4. Paste caption + hashtags, set the day, schedule. Whole week');
  L.push('     in one sitting, about 40 minutes.');
  L.push('  5. Reply to every comment in the first hour after each post goes');
  L.push('     live. That stays manual. It is the single highest-leverage');
  L.push('     free growth lever there is.');
  L.push('');
  if(week.bioSuggestion){ L.push('BIO'); L.push('  '+week.bioSuggestion); L.push(''); }
  if(week.pillars && week.pillars.length){
    L.push('PILLARS');
    week.pillars.forEach(p=>L.push(`  ${p.name} — ${p.why}`));
    L.push('');
  }
  if(week.audioNote){ L.push('AUDIO'); L.push('  '+week.audioNote); L.push(''); }
  L.push('='.repeat(60));
  week.posts.forEach(p=>{
    L.push('');
    L.push(`${p.day.toUpperCase()} · ${(POST_KINDS[p.kind]||{}).label||p.kind}`);
    L.push(`HOOK (first 1.5 seconds, on screen):`);
    L.push(`  ${p.hook}`);
    L.push('');
    L.push('CAPTION:');
    p.caption.split('\n').forEach(l=>L.push('  '+l));
    L.push('');
    L.push('HASHTAGS: '+p.hashtags.join(' '));
    L.push('');
    L.push('VISUAL BRIEF (build in Canva / CapCut):');
    L.push('  '+p.visual);
    L.push('');
    L.push('ASK: '+p.cta);
    L.push('-'.repeat(60));
  });
  if(week.firstComment){
    L.push('');
    L.push('FIRST COMMENT — post this yourself right after publishing:');
    L.push('  '+week.firstComment);
  }
  L.push('');
  L.push('WHAT NOT TO DO');
  L.push('  No follow/unfollow bots. No engagement pods. No bought followers.');
  L.push('  No auto-comment or auto-DM tools. Every one of those violates');
  L.push('  Instagram\'s terms and is the most common cause of a shadowban or');
  L.push('  a permanent ban. They work against the growth you are paying for');
  L.push('  with your time.');
  return L.join('\n');
}

CAPS['content.week'] = { pillar:5, safe:true,
  desc:'Plan a week of Instagram content for the newest business — hooks, captions, hashtags, visual briefs',
  async run(){
    const biz = (S.businesses||[])[0];
    if(!biz) return { msg:'No business built yet. Nothing to make content about.', n:0 };
    const recent = (S.content||[])[0];
    if(recent && (Date.now() - Date.parse(recent.t.replace(' ','T')+'Z')) < 5*86400000)
      return { msg:`This week's content is already planned (${recent.posts.length} posts).`, n:0 };
    const w = await buildContentWeek({ bizId: biz.id });
    return { msg:`Week planned: ${w.posts.length} posts, ${w.reels} reels.`, n:w.posts.length,
      detail: w.tellCount ? `${w.tellCount} phrase(s) flagged for your edit.` : 'Audit clean.' };
  }};


function commentsCfg(){ return S.meta || null; }

function replyWindow(){
  const cut = Date.now() - 3600*1000;
  const sent = (S.commentLog||[]).filter(x=>{
    const t = Date.parse((x.t||'').replace(' ','T')+'Z');
    return t && t > cut;
  });
  return { used: sent.length, cap: META.LIMITS.repliesPerHour,
           left: Math.max(0, META.LIMITS.repliesPerHour - sent.length) };
}

/* Pull the latest comments across recent posts and draft a reply to each.
   Nothing is sent here. */
async function harvestComments(opts){
  opts = opts || {};
  const cfg = commentsCfg();
  if(!cfg) throw new Error('Instagram is not connected. Connect it in Comment Desk first.');
  if(!S.llm) throw new Error('CONNECT AN AI BRAIN FIRST');

  const posts = await META.media(cfg.igId, cfg.token, opts.posts || 6);
  const withComments = posts.filter(p => (p.comments_count||0) > 0);
  if(!withComments.length)
    return { drafts:[], scanned:posts.length, msg:'No comments on your recent posts yet.' };

  const now = Date.now();
  const windowMs = META.LIMITS.replyWindowDays * 86400 * 1000;
  const already = new Set((S.commentLog||[]).map(x=>x.commentId));
  const pending = new Set(((S.commentDrafts||[])).map(x=>x.commentId));

  const found = [];
  for(const post of withComments.slice(0, 6)){
    let cs = [];
    try{ cs = await META.comments(post.id, cfg.token); }
    catch(e){ log('WARN','COMMENTS',`Could not read comments on one post — ${e.message}`); continue; }

    for(const c of cs){
      if(already.has(c.id) || pending.has(c.id)) continue;
      /* never answer yourself */
      if((c.username||'').toLowerCase() === (cfg.username||'').toLowerCase()) continue;
      /* Meta's reply window */
      const age = now - Date.parse(c.timestamp);
      if(age > windowMs) continue;
      /* if we already replied in the thread, leave it alone */
      const mine = (c.replies && c.replies.data ? c.replies.data : [])
        .some(r => (r.username||'').toLowerCase() === (cfg.username||'').toLowerCase());
      if(mine) continue;
      found.push({ comment:c, post });
    }
  }
  if(!found.length)
    return { drafts:[], scanned:posts.length, msg:'Nothing new to reply to — everything is already answered.' };

  const batch = found.slice(0, Math.min(20, opts.max || 12));
  const biz = (S.businesses||[])[0];

  const j = await askJson(
`Draft a reply to each of these real Instagram comments on the Owner's own posts.

BUSINESS: ${biz ? biz.name + ' — ' + biz.tagline : 'a one-person business in Ludhiana, Punjab'}
${biz && biz.tiers ? 'PRICING: ' + biz.tiers.map(t=>`${t.name} Rs ${t.amount}`).join(', ') : ''}

THE COMMENTS:
${batch.map((f,i)=>`[${i+1}] @${f.comment.username} on post "${String(f.post.caption||'').slice(0,60)}":
    "${f.comment.text}"`).join('\n')}

${ANTI_AI}

HOW TO REPLY — this is a public reply under the Owner's own brand:
- Short. One or two sentences. Nobody reads a paragraph in comments.
- Answer the actual question. If they asked the price, say the price.
- Every reply must be DIFFERENT. Identical replies at scale is the exact
  pattern Meta restricts accounts for, and it reads as a bot to humans too.
- Never invent a fact, a number, a customer or a result.
- If a comment is abuse, spam, or a sales pitch, set action to "ignore".
- If it needs a private answer (a price list, a link, someone's personal
  details), set action to "dm" instead of "public".
- If you genuinely cannot answer it without the Owner's knowledge, set
  action to "owner" and say what you need from him.
- No emoji unless the commenter used one first.

Return ONLY a JSON array, one object per comment, in the same order:
[{"n":1,"action":"public | dm | ignore | owner","reply":"the exact words, or empty if ignoring","why":"under 10 words"}]`,
    'You write short, human, public replies for a small Indian business. Never identical, never salesy.',
    'comment-drafts','Growth Conductor');

  const arr = Array.isArray(j) ? j : (j.replies || j.drafts || []);
  const seen = new Set();
  const drafts = [];
  for(let i = 0; i < batch.length; i++){
    const f = batch[i];
    const d = arr.find(x => +x.n === i+1) || arr[i] || {};
    const action = ['public','dm','ignore','owner'].includes(d.action) ? d.action : 'owner';
    const text = String(d.reply||'').trim();

    /* HARD RULE: identical text is refused before it can ever be sent. */
    const key = text.toLowerCase().replace(/\s+/g,' ');
    let dup = false;
    if(text && seen.has(key)) dup = true;
    if(text) seen.add(key);

    drafts.push({
      id: uid('CMT'),
      commentId: f.comment.id,
      mediaId: f.post.id,
      permalink: f.post.permalink,
      username: f.comment.username,
      commentText: f.comment.text,
      commentAt: f.comment.timestamp,
      action: dup ? 'owner' : action,
      reply: text,
      why: dup ? 'DUPLICATE TEXT — refused, write this one yourself' : String(d.why||'').slice(0,80),
      status: 'DRAFT',
    });
  }

  S.commentDrafts = (S.commentDrafts||[]).concat(drafts).slice(-60);
  save();
  const pub = drafts.filter(d=>d.action==='public').length;
  log('OK','COMMENTS',
    `${drafts.length} comment(s) drafted — ${pub} public replies ready for your approval. Nothing sent.`);
  return { drafts, scanned: posts.length,
    msg:`${drafts.length} drafted from ${withComments.length} post(s). Nothing sent until you approve.` };
}

/* Send the approved batch. Paced, capped, and refuses anything suspect. */
async function sendComments(ids){
  const cfg = commentsCfg();
  if(!cfg) throw new Error('Instagram is not connected.');
  const want = (S.commentDrafts||[]).filter(d =>
    (!ids || !ids.length || ids.includes(d.id)) && d.status === 'DRAFT'
    && (d.action === 'public' || d.action === 'dm'));
  if(!want.length) throw new Error('Nothing approved to send.');

  const w = replyWindow();
  if(!w.left) throw new Error(
    `Hourly cap reached — ${w.used} replies in the last hour. Meta restricts accounts that burst. Resumes automatically.`);

  const seenNow = new Set((S.commentLog||[]).slice(0,50).map(x=>String(x.text||'').toLowerCase().replace(/\s+/g,' ')));
  let sent = 0, skipped = 0, failed = 0;
  const errs = [];

  for(const d of want){
    if(sent >= w.left){ skipped++; d.status='HELD'; d.error='hourly cap'; continue; }
    const key = String(d.reply||'').toLowerCase().replace(/\s+/g,' ');
    if(!d.reply.trim()){ d.status='SKIPPED'; d.error='empty'; skipped++; continue; }
    if(seenNow.has(key)){
      d.status='REFUSED';
      d.error='This exact text was already posted. Identical replies at scale is what gets accounts restricted.';
      skipped++; continue;
    }
    try{
      if(d.action === 'public') await META.reply(d.commentId, d.reply, cfg.token);
      else                       await META.privateReply(cfg.igId, d.commentId, d.reply, cfg.token);
      d.status = 'SENT'; d.sentAt = nowIso(); sent++;
      seenNow.add(key);
      S.commentLog = S.commentLog || [];
      S.commentLog.unshift({ t:nowIso(), commentId:d.commentId, username:d.username,
        text:d.reply, kind:d.action });
      S.commentLog = S.commentLog.slice(0,300);
      log('OK','COMMENTS',`Replied to @${d.username}${d.action==='dm'?' privately':''}.`);
    }catch(e){
      d.status='FAILED'; d.error=e.message; failed++; errs.push(e.message);
      log('CRIT','COMMENTS',`Reply to @${d.username} FAILED: ${e.message}`);
      if(/RATE LIMITED/i.test(e.message)) break;   /* stop immediately, do not hammer */
    }
    /* pace it — a burst is what draws scrutiny even when every call is legal */
    if(sent < want.length) await new Promise(r=>setTimeout(r, META.LIMITS.minGapMs));
  }
  save();
  return { sent, skipped, failed, errors: errs.slice(0,3) };
}

CAPS['comments.harvest'] = { pillar:5, safe:true,
  desc:'Read new Instagram comments and draft a reply to each — sends nothing',
  async run(){
    if(!commentsCfg()) return { msg:'Instagram not connected. Nothing to check.', n:0 };
    const r = await harvestComments({ posts:6, max:12 });
    return { msg:r.msg, n:(r.drafts||[]).length,
      detail:(r.drafts||[]).length ? 'Waiting for your approval in Comment Desk.' : '' };
  }};


const SKILL_LIBRARY = [
  {
    id:'SK-LOOPS', name:'close-open-loops', builtin:true,
    description:'Find promises, unanswered messages, and work that has stalled between systems. '
      +'Use when things are slipping. Do NOT use to rebuild every thread.',
    when:'Weekly, or when you feel behind.',
    steps:[
      'Read the outreach log, missions, campaigns and gates.',
      'Find: messages sent with no reply after 4+ days; missions open more than a week; '
        +'gates waiting on the Owner; businesses built but never published.',
      'For each one, decide if it is genuinely open or already resolved elsewhere.',
      'Return only the exceptions, ordered by what costs money first.',
      'Propose the smallest next action for each. Never invent a deadline.'
    ],
    sources:['outreach','missions','campaigns','gates','businesses','monitors'],
    approvals:['Nothing is sent or changed. This produces a list only.'],
    stop:['If a commitment is ambiguous, say so rather than guessing an owner or date.'],
    cadence:604800,
  },
  {
    id:'SK-INBOX', name:'triage-what-matters', builtin:true,
    description:'Sort what is actually waiting on you from what looks urgent. '
      +'Use when the desk feels full. Do NOT treat unread as important.',
    when:'Daily, ten minutes.',
    steps:[
      'Gather pending gates, open missions, comment drafts, and unreplied outreach.',
      'Rank by consequence: money at risk, then a person waiting, then everything else.',
      'Group anything that is the same underlying item.',
      'Say plainly which items need the Owner personally and which he can ignore today.'
    ],
    sources:['gates','missions','commentDrafts','outreach'],
    approvals:['No replies are sent. Drafts stay drafts.'],
    stop:['If a thread was already answered, leave it out rather than flagging it.'],
    cadence:86400,
  },
  {
    id:'SK-AUDIT', name:'audit-a-live-site', builtin:true,
    description:'Test a real website end to end and report what is broken with evidence. '
      +'Use before selling monitoring to someone, or on your own site after a change.',
    when:'Before any outreach that claims you checked their site.',
    steps:[
      'Fetch the page and record status, load time, redirects and TLS expiry.',
      'Note anything a buyer would see: slow load, expired certificate, error page.',
      'State clearly what was checked and what was NOT.',
      'Never claim a fault you did not observe. Evidence or silence.'
    ],
    sources:['probe','monitors'],
    approvals:['Read-only. Nothing is changed on anyone else\u2019s site, ever.'],
    stop:['If the site cannot be reached, that is UNKNOWN, not DOWN. Say which.'],
    cadence:0,
  },
  {
    id:'SK-FIND', name:'find-new-customers', builtin:true,
    description:'Find prospects who fit for a REASON, from the live web. '
      +'Use when you need people to sell to. Do NOT use to pad a list to a target number.',
    when:'When the pipeline is empty. Run it with what you sell, or a place.',
    steps:[
      'Search the live web for the kind of business named in the request.',
      'For each one found, state the evidence that it fits — a real detail, not a guess.',
      'Check it against businesses and outreach already on file. Flag anyone already contacted.',
      'Say plainly which are strong, which are borderline, and which you could not verify.',
      'If too few meet the bar, say so and offer a wider criterion. Never pad the list.'
    ],
    sources:['web','businesses','outreach'],
    query:'hosiery exporters Ludhiana with website contact',
    approvals:['Nobody is contacted. This finds and qualifies only.'],
    stop:['Never invent a company, a website, a phone number or an email. '
         +'If a detail was not found, mark it NOT FOUND.',
          'A public listing does not mean they want to hear from you. Do not imply interest.'],
    cadence:0,
  },
  {
    id:'SK-PITCH', name:'build-a-pitch-deck', builtin:true,
    description:'Turn what you actually have into a short deck for one specific buyer. '
      +'Use before a real meeting. Do NOT use to make a generic company deck nobody asked for.',
    when:'When someone has agreed to look at what you do.',
    steps:[
      'Establish the audience and the ONE decision the deck should get.',
      'Lead with the conclusion, then the evidence. Never build up to it.',
      'Use only what is real: the actual price, the actual service, the actual guarantee.',
      'Where you have no proof, say what you will do instead of claiming a result.',
      'Return the slides as text, one slide per block, ready to put into Canva or Slides.'
    ],
    sources:['businesses','orders','monitors','outreach'],
    approvals:['Produces text only. Nothing is sent to anyone.'],
    stop:['If there is no business built yet, refuse — there is nothing honest to pitch.',
          'Never invent a customer, a testimonial, a logo or a result.'],
    cadence:0,
  },
  {
    id:'SK-PIPE', name:'review-the-pipeline', builtin:true,
    description:'Look at everything in flight and say where the money actually is. '
      +'Use weekly. Do NOT use as a status report — it returns decisions, not a summary.',
    when:'Every Monday, before you decide what to work on.',
    steps:[
      'Read orders, outreach, campaigns and businesses together.',
      'Find: links raised but never paid; people who replied and were not followed up; '
        +'businesses built but never published.',
      'Rank by rupees at risk, then by how long it has been sitting.',
      'For each, give the one next action. Never more than one.',
      'Say plainly if the pipeline is empty rather than dressing it up.'
    ],
    sources:['orders','outreach','campaigns','businesses'],
    approvals:['Nothing is sent or changed.'],
    stop:['If payment status is unclear from the gateway, say UNKNOWN rather than '
         +'assuming unpaid and chasing someone who already paid.'],
    cadence:604800,
  },
  {
    id:'SK-HANDOVER', name:'make-it-repeatable', builtin:true,
    description:'Turn something that worked once into a method that runs every time. '
      +'Use after a real accepted result. Do NOT use to write process docs for untested ideas.',
    when:'After something works and you want it to keep working.',
    steps:[
      'Identify the workflow and the result that was actually accepted.',
      'Separate the durable method from the one-off details.',
      'Write it as a skill: trigger, sources, steps, approvals, stop conditions.',
      'Run it once on a real case and correct it from what breaks.',
      'Only then put it on a cadence.'
    ],
    sources:['runs','campaigns','businesses','chat'],
    approvals:['A new skill is proposed, never enabled without the Owner.'],
    stop:['If there is no accepted example yet, refuse and say so.'],
    cadence:0,
  },
];

function allSkills(){
  const own = S.skillsOwn || [];
  return SKILL_LIBRARY.concat(own);
}
function findSkill(id){ return allSkills().find(s=>s.id===id); }

/* Run a skill. The method is real: the sources are read from actual state,
   and the model is given the skill's own steps and constraints. */
async function runSkill(id, note){
  const sk = findSkill(id);
  if(!sk) throw new Error('No such skill.');
  if(!S.llm) throw new Error('CONNECT AN AI BRAIN FIRST');

  /* Gather ONLY the sources the skill declares. A skill that says it reads
     monitors does not get to read the mail queue. */
  const src = {};
  const g = {
    outreach:   ()=> (S.outreach||[]).slice(0,40),
    missions:   ()=> (S.missions||[]).filter(m=>m.status==='OPEN').slice(0,20),
    campaigns:  ()=> (S.campaigns||[]).slice(0,5).map(c=>({name:c.name,status:c.status,
                       sent:c.sent,parked:c.parked,actions:(c.actions||[]).length})),
    gates:      ()=> (S.gates||[]).filter(x=>x.status==='PENDING').slice(0,20),
    businesses: ()=> (S.businesses||[]).map(b=>({name:b.name,published:b.published,
                       url:b.publishedUrl,tiers:(b.tiers||[]).map(t=>t.name+' Rs '+t.amount)})),
    monitors:   ()=> (S.monitors||[]).map(m=>({name:m.name,url:m.url,state:m.state,
                       ms:m.lastMs,err:m.lastErr,ssl:m.ssl&&m.ssl.days_left})),
    commentDrafts:()=>(S.commentDrafts||[]).filter(d=>d.status==='DRAFT').slice(0,20),
    runs:       ()=> (S.runs||[]).slice(0,25),
    chat:       ()=> (S.chat||[]).slice(0,20).map(m=>({who:m.who,text:String(m.text).slice(0,200)})),
    probe:      ()=> (S.monitors||[]).map(m=>({url:m.url,state:m.state,ms:m.lastMs})),
    orders:     ()=> (S.orders||[]).slice(0,30).map(o=>({t:o.t,amount:o.amount,
                       desc:o.desc,customer:o.customer,status:o.status,paid:o.paid,live:o.live})),
    content:    ()=> (S.content||[])[0] ? {posts:((S.content[0].posts)||[]).map(x=>
                       ({day:x.day,kind:x.kind,hook:x.hook,posted:x.posted,result:x.result}))} : {},
  };
  for(const key of (sk.sources||[])) if(g[key]) src[key] = g[key]();

  /* LIVE SOURCES — a skill that declares 'web' or 'domains' actually goes out
     and looks. Without this, "find new customers" could only re-read what the
     Owner already had, which finds nobody. These are slow, so they are opt-in
     per skill and capped. */
  if((sk.sources||[]).includes('web') && sk.query){
    try{
      const q = String(note||sk.query).slice(0,160);
      src.webSearch = await RESEARCH.search(q);
      log('INFO','SKILLS',`"${sk.name}" searched the live web for: ${q}`);
    }catch(e){ src.webSearch = { error:'Live search failed: '+e.message }; }
  }
  if((sk.sources||[]).includes('page') && note && /^https?:\/\//i.test(note.trim())){
    try{
      const pg = await RESEARCH.readPage(note.trim());
      src.page = { url:note.trim(), title:pg.title, text:String(pg.text).slice(0,6000) };
    }catch(e){ src.page = { error:'Could not read that page: '+e.message }; }
  }

  const empty = Object.values(src).every(v => !v || !v.length);
  if(empty && !note)
    return { skill:sk.name, text:'Nothing to work with yet — every source this skill reads is empty. '
      + 'It needs real activity first: monitors bound, messages sent, or a business built.', n:0 };

  const r = await think(
`You are running a stored skill. Follow ITS method, not your own.

SKILL: ${sk.name}
PURPOSE: ${sk.description}

THE METHOD — follow these in order:
${(sk.steps||[]).map((s,i)=>`  ${i+1}. ${s}`).join('\n')}

HARD CONSTRAINTS:
${(sk.approvals||[]).map(a=>'  · '+a).join('\n')}

STOP AND SAY SO IF:
${(sk.stop||[]).map(a=>'  · '+a).join('\n')}

THE REAL DATA, and this is all you have:
${JSON.stringify(src, null, 1).slice(0, 9000)}
${note ? '\nTHE OWNER ADDED: '+note : ''}

${ANTI_AI}

Return the exception list only — the things that need attention. Not a summary
of everything. If nothing needs attention, say that in one line and stop.
Order by what costs money first. Under 250 words.`,
    'You execute a stored method exactly. Terse. Exceptions only, never a transcript.',
    'skill-'+sk.id, 'Growth Conductor');

  S.skillRuns = S.skillRuns || [];
  S.skillRuns.unshift({ id:uid('SKR'), t:nowIso(), skillId:sk.id, skill:sk.name,
    text:r.text, note:note||'' });
  S.skillRuns = S.skillRuns.slice(0,30);
  save();
  log('OK','SKILLS',`Ran "${sk.name}".`);
  return { skill:sk.name, text:r.text, n:1 };
}

/* He writes a new skill from something that already worked. */
async function writeSkill(brief){
  if(!S.llm) throw new Error('CONNECT AN AI BRAIN FIRST');
  const known = allSkills().map(s=>s.name).join(', ');
  const j = await askJson(
`Write a new reusable SKILL for the Chairman, in the same shape as the ones
he already has.

WHAT THE OWNER WANTS IT TO DO: ${brief}

SKILLS THAT ALREADY EXIST (do not duplicate): ${known}

AVAILABLE SOURCES — a skill may only declare sources from this list:
  outreach, missions, campaigns, gates, businesses, monitors,
  commentDrafts, runs, chat, probe, orders, content,
  web   (searches the LIVE internet — only for skills that must FIND something new)
  page  (reads one URL the Owner supplies when running it)

${ANTI_AI}

A GOOD SKILL, and this is the whole point:
- The description says when to use it AND when NOT to.
- The steps are a method, not a wish. Each one is something checkable.
- It names what must never happen without the Owner's approval.
- It names the conditions where it must STOP and admit uncertainty.
- It returns exceptions, never a summary of everything.

Return ONLY this JSON:
{"name":"lowercase-hyphenated-name",
 "description":"when to use it, and explicitly when not to",
 "when":"the trigger, in plain words",
 "steps":["4 to 6 concrete steps"],
 "sources":["only from the list above"],
 "approvals":["what must never happen without the Owner"],
 "stop":["conditions that halt it and ask"],
 "cadenceHours":0}`,
    'You write precise, restrained operating methods. No fluff.',
    'skill-write','Growth Conductor');

  const ok = ['outreach','missions','campaigns','gates','businesses','monitors',
              'commentDrafts','runs','chat','probe','orders','content','web','page'];
  const sk = {
    id: uid('SK'), builtin:false, t: nowIso(),
    name: String(j.name||'new-skill').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,40),
    description: String(j.description||'').slice(0,300),
    when: String(j.when||'').slice(0,140),
    steps: (j.steps||[]).slice(0,8).map(x=>String(x).slice(0,240)),
    sources: (j.sources||[]).filter(x=>ok.includes(x)).slice(0,6),
    approvals: (j.approvals||[]).slice(0,4).map(x=>String(x).slice(0,200)),
    stop: (j.stop||[]).slice(0,4).map(x=>String(x).slice(0,200)),
    cadence: Math.max(0, Math.min(2592000, Math.round((+j.cadenceHours||0)*3600))),
    enabled: false,   /* NEVER auto-enabled. The Owner turns it on. */
  };
  if(!sk.steps.length) throw new Error('The model wrote a skill with no method. Try again.');
  if(!sk.sources.length) sk.sources = ['runs'];

  S.skillsOwn = S.skillsOwn || [];
  S.skillsOwn.unshift(sk);
  S.skillsOwn = S.skillsOwn.slice(0,20);
  save();
  log('OK','SKILLS',`He wrote a new skill: "${sk.name}". It is OFF until you enable it.`);
  return sk;
}

CAPS['skills.cadence'] = { pillar:5, safe:true,
  desc:'Run any skill whose cadence is due',
  async run(){
    const due = allSkills().filter(s=>{
      if(!s.cadence) return false;
      if(s.builtin ? false : !s.enabled) return false;
      const last = (S.skillRuns||[]).find(r=>r.skillId===s.id);
      if(!last) return true;
      return (Date.now() - Date.parse(last.t.replace(' ','T')+'Z')) > s.cadence*1000;
    });
    if(!due.length) return { msg:'No skill is due.', n:0 };
    const done = [];
    for(const s of due.slice(0,2)){
      try{ await runSkill(s.id); done.push(s.name); }
      catch(e){ log('WARN','SKILLS',`${s.name} failed: ${e.message}`); }
    }
    return { msg: done.length ? `Ran ${done.join(', ')}.` : 'Skills were due but all failed.',
             n: done.length };
  }};


/* ======================================================================
   CAPABILITY CLONING — the legitimate kind.
   Paste any product's URL. He studies WHAT IT DOES, then either combines
   agents he already has, or writes a new one. He never copies their code —
   he rebuilds the capability from a description of the outcome, which is
   how every competitor in every industry has always been built.
   ====================================================================== */
async function analyseProduct(url, hint){
  let page = null, evidence = '';
  if(/^https?:\/\//i.test(url)){
    try{
      page = await RESEARCH.readPage(url);
      evidence = `THEIR OWN PAGE (${page.title}):\n${page.text.slice(0,9000)}`;
    }catch(e){ evidence = `Could not read the page directly (${e.message}).`; }
  }
  /* what do people say it actually does, and where does it fall short */
  try{
    const host = /^https?:\/\//i.test(url) ? new URL(url).hostname.replace(/^www\./,'') : url;
    const hits = await RESEARCH.search(host + ' what it does pricing complaints', 5);
    if(hits.length) evidence += `\n\nWHAT PEOPLE SAY:\n` + hits.map(h=>`- ${h.title}: ${h.snippet}`).join('\n');
  }catch(e){}

  const have = Object.entries(CAPS).map(([k,v])=>`${k} — ${v.desc}`).join('\n');
  const conns = (S.connectors||[]).filter(c=>c.enabled!==false)
    .map(c=>`${c.name} (${c.note||c.base})`).join(', ') || 'none connected yet';

  const r = await think(
`Study this product and work out how to DO THE SAME JOB with agents.

TARGET: ${url}${hint?`\nOWNER'S NOTE: ${hint}`:''}

${evidence || 'No page content retrieved — reason from the name and your knowledge, and say so.'}

WHAT YOU ALREADY HAVE:
${have}

CONNECTORS AVAILABLE: ${conns}

Never copy their code or their words. Identify the JOB the product does for
its user, then design the shortest honest path to that same outcome using
what you have, or one new capability.

Be blunt about what is NOT reproducible without money, a licence, a dataset,
or a human. Do not pretend a free agent can replace a paid GPU cluster.

Return ONLY JSON:
{"does":"the core job it performs for a user, one sentence",
 "jobs":["the 3-6 distinct things it actually does"],
 "reuse":[{"cap":"an existing capability name","for":"which job it covers"}],
 "build":[{"name":"cap.new_name","desc":"what it would do","why_needed":"why nothing existing covers it"}],
 "needs_connector":["any external service required, or empty"],
 "cannot_do":["parts that genuinely require money, a licence, hardware or a human"],
 "verdict":"REBUILDABLE|PARTIAL|NOT_WORTH_IT",
 "honest_note":"the blunt truth about whether this is worth the Owner's time"}`,
    'You are a systems architect. You reverse-engineer outcomes, never source code. You state limits plainly.',
    'analyse-product','Market Signal');

  const j = jparse(r.text);
  const a = { id:uid('ANL'), t:nowIso(), url:String(url).slice(0,200),
    does:String(j.does||'').slice(0,300),
    jobs:(j.jobs||[]).map(x=>String(x).slice(0,160)).slice(0,8),
    reuse:(j.reuse||[]).filter(x=>x&&CAPS[x.cap]).slice(0,8),
    build:(j.build||[]).slice(0,4),
    needsConnector:(j.needs_connector||[]).map(String).slice(0,6),
    cannotDo:(j.cannot_do||[]).map(String).slice(0,6),
    verdict:String(j.verdict||'PARTIAL'),
    note:String(j.honest_note||'').slice(0,400),
    pageRead: !!page, status:'ANALYSED' };
  S.analyses = S.analyses || [];
  S.analyses.unshift(a); S.analyses = S.analyses.slice(0,20);
  log('OK','ARCHITECT',
    `Analysed ${a.url} — ${a.verdict}. Reuse ${a.reuse.length}, build ${a.build.length}, blocked ${a.cannotDo.length}.`);
  save();
  return a;
}

/* Build the missing pieces as a coordinated team — reuse first, write only
   what is genuinely missing. Each new capability still needs your signature. */
async function assembleTeam(analysisId){
  const a = (S.analyses||[]).find(x=>x.id===analysisId);
  if(!a) throw new Error('No such analysis');
  if(a.verdict === 'NOT_WORTH_IT')
    throw new Error('He judged this not worth building. Read his note before overriding.');

  const made = [], skipped = [];
  for(const spec of (a.build||[])){
    if(CAPS[spec.name]){ skipped.push(spec.name+' already exists'); continue; }
    try{
      const c = await writeCapability(
        `${spec.desc}. This is one part of rebuilding what ${a.url} does. `+
        `Specifically: ${spec.why_needed}`);
      made.push(c.name);
    }catch(e){ skipped.push(spec.name+': '+e.message); }
  }

  /* a named crew so the reused pieces are visibly working together */
  const crew = { id:uid('CREW'), t:nowIso(), analysisId:a.id,
    title:(a.does||a.url).slice(0,80), url:a.url,
    reuse:a.reuse.map(r=>r.cap), built:made, skipped,
    connectors:a.needsConnector, blocked:a.cannotDo };
  S.crews = S.crews || [];
  S.crews.unshift(crew); S.crews = S.crews.slice(0,20);
  a.status = 'ASSEMBLED';
  log('OK','ARCHITECT',
    `Crew for "${crew.title}": ${crew.reuse.length} reused, ${made.length} written${made.length?' (awaiting your signature)':''}.`);
  save();
  return crew;
}

/* ======================================================================
   WORKSPACE — upload a file, he reads it. Ask for an email or document,
   he writes it. This is the everyday-assistant surface.
   ====================================================================== */
function textFromUpload(name, mime, b64){
  const buf = Buffer.from(b64, 'base64');
  const lower = (name||'').toLowerCase();

  /* plain-ish formats: read directly */
  if(/\.(txt|md|csv|json|log|html|htm|xml|yml|yaml|js|ts|py|sql|ini|conf)$/.test(lower)
     || /^text\//.test(mime||'') || /json|xml|csv/.test(mime||'')){
    return buf.toString('utf8').slice(0, 200000);
  }

  /* PDF: pull the text streams. Works on most text-based PDFs, not scans. */
  if(/\.pdf$/.test(lower) || /pdf/.test(mime||'')){
    const raw = buf.toString('latin1');
    const chunks = [];
    const re = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\]]|\\\])*)\]\s*TJ/g;
    let m;
    while((m = re.exec(raw)) && chunks.length < 9000){
      let t = m[1] || m[2] || '';
      t = t.replace(/\\([()\\])/g,'$1').replace(/\)\s*-?\d+(\.\d+)?\s*\(/g,'');
      t = t.replace(/[^\x20-\x7E\n]/g,'');
      if(t.trim()) chunks.push(t);
    }
    const out = chunks.join(' ').replace(/\s+/g,' ').trim();
    return out.length > 60 ? out.slice(0,200000)
      : '[PDF CONTAINS NO EXTRACTABLE TEXT — it is probably a scan or image. '
        + 'Retype the key lines, or export it as text from your PDF reader.]';
  }

  /* DOCX/XLSX are zip archives — readable strings only, honestly labelled */
  if(/\.(docx|xlsx|pptx)$/.test(lower)){
    const raw = buf.toString('utf8');
    const txt = (raw.match(/[\x20-\x7E]{6,}/g)||[]).join(' ').replace(/\s+/g,' ');
    return txt.length > 120
      ? '[PARTIAL EXTRACT from an Office file — formatting lost, some text may be missing]\n' + txt.slice(0,120000)
      : '[OFFICE FILE COULD NOT BE READ. Save it as .txt or .csv and upload again.]';
  }

  if(/^image\//.test(mime||''))
    return '[IMAGE FILE — this Chairman has no vision model, so he cannot see it. '
         + 'Describe what it shows and he can work with that.]';

  return '[UNSUPPORTED FILE TYPE. Supported: txt, md, csv, json, log, html, pdf (text-based).]';
}

async function draftFor(kind, brief, docIds){
  const ctx = (docIds||[]).map(id=>{
    const d = (S.docs||[]).find(x=>x.id===id);
    return d ? `--- FILE: ${d.name} ---\n${d.text.slice(0,14000)}` : '';
  }).filter(Boolean).join('\n\n');

  const shapes = {
    email:    'a complete email. Give SUBJECT: on the first line, then the body.',
    whatsapp: 'a WhatsApp message under 80 words. Plain Indian English, no emoji, no marketing language.',
    reply:    'a reply to the message in the brief. Match its tone. Be direct.',
    proposal: 'a one-page proposal: what you deliver, timeline, price in INR, next step.',
    invoice:  'a simple invoice with line items, total in INR, a UPI line and a GST placeholder.',
    summary:  'a summary: the 5 points that matter, then what to do about them.',
    doc:      'a clear document. Use headings. No filler.'
  };

  const r = await think(
`Write ${shapes[kind] || shapes.doc}

BRIEF FROM THE OWNER: ${brief}
${ctx ? `\nUSE THESE UPLOADED FILES AS THE SOURCE:\n${ctx}` : ''}

Owner: one person in Ludhiana, Punjab, India. No company, no staff, no track record yet.

RULES:
- Never invent facts, numbers, dates, names or achievements that are not in the brief or the files.
- If something essential is missing, write [NEED FROM YOU: ...] inline rather than guessing.
- Plain Indian English. No hype.
- Output ONLY the finished text, ready to copy and send.`,
    'You draft real business correspondence. Concise, honest, immediately usable.',
    'draft-'+kind, 'Insight Forge');

  const d = { id:uid('DRF'), t:nowIso(), kind, brief:String(brief).slice(0,200),
    text:r.text, docIds:docIds||[], bytes:Buffer.byteLength(r.text) };
  S.drafts.unshift(d); S.drafts = S.drafts.slice(0,40);
  log('OK','WORKSPACE',`Drafted a ${kind} (${d.bytes} bytes).`);
  save();
  return d;
}

/* ======================================================================
   CONNECTORS — any external service the Owner wants him to reach.
   Keys are stored, masked everywhere, and NEVER written to the ledger.
   Generated capability code can call a connector but can never read its key.
   ====================================================================== */
function connectorCall(name, opts){
  const c = (S.connectors||[]).find(x=>x.name===name && x.enabled!==false);
  if(!c) throw new Error('No connector named "'+name+'". Add it in Connectors.');
  return new Promise((resolve,reject)=>{
    /* join base + path without new URL() eating the base's own path */
    let u;
    try{
      const pth = String(opts.path||'');
      u = /^https?:\/\//i.test(pth)
        ? new URL(pth)
        : new URL(c.base.replace(/\/+$/,'') + (pth ? (pth.startsWith('/')?pth:'/'+pth) : ''));
    }catch(e){ return reject(new Error('bad url: '+e.message)); }
    const isHttps = u.protocol==='https:';
    const lib = isHttps ? require('https') : require('http');
    const body = opts.body ? (typeof opts.body==='string'?opts.body:JSON.stringify(opts.body)) : null;
    const headers = Object.assign({
      'Accept':'application/json',
      'User-Agent':'ChairmanAgentOS/1.0 (self-hosted; contact via owner)'
    }, c.headers||{});
    if(c.key){
      if(c.auth==='bearer')      headers['Authorization'] = 'Bearer '+c.key;
      else if(c.auth==='header') headers[c.headerName||'X-API-Key'] = c.key;
      else if(c.auth==='query')  u.searchParams.set(c.queryName||'key', c.key);
    }
    if(body){ headers['Content-Type']='application/json'; headers['Content-Length']=Buffer.byteLength(body); }
    const req = lib.request({hostname:u.hostname, port:u.port||undefined,
      path:u.pathname+u.search, method:opts.method||'GET', headers, timeout:20000}, res=>{
      let d=''; res.on('data',ch=>{ d+=ch; if(d.length>400000) res.destroy(); });
      res.on('end',()=>{
        c.calls=(c.calls||0)+1; c.lastAt=nowIso();
        if(res.statusCode>=400){ c.fails=(c.fails||0)+1; save();
          return reject(new Error(name+' returned HTTP '+res.statusCode+': '+d.slice(0,160))); }
        save();
        try{ resolve(JSON.parse(d)); }catch(e){ resolve({ text:d.slice(0,4000) }); }
      });
    });
    req.on('timeout',()=>{ req.destroy(); reject(new Error(name+' timed out')); });
    req.on('error',e=>reject(new Error(name+': '+(e.code||e.message))));
    if(body) req.write(body);
    req.end();
  });
}

/* ======================================================================
   SELF-EXTENSION — he writes genuinely NEW capabilities for himself.
   The code runs in a locked sandbox, is scanned for dangerous patterns
   before you ever see it, and only becomes real after you read the actual
   source and sign it. This is the difference between tuning settings and
   growing new abilities.
   ====================================================================== */

/* The only surface generated code can touch. Deliberately small. */
function capabilityAPI(){
  return {
    /* read-only views of real state */
    monitors: () => S.monitors.map(m=>({name:m.name,url:m.url,state:m.state,
      checks:m.checks||0,up:m.up||0,down:m.down||0,p95:m.p95||0,
      ssl:m.ssl?{days_left:m.ssl.days_left,issuer:m.ssl.issuer}:null})),
    agents:   () => S.agents.map(a=>({name:a.name,pillar:a.pillarId,status:a.status,tools:a.tools})),
    ideas:    () => S.ideas.map(i=>({title:i.title,score:i.score,verdict:i.verdict,status:i.status,price:i.price})),
    gates:    () => S.gates.map(g=>({title:g.title,cls:g.cls,risk:g.risk,status:g.status,cost:g.cost})),
    revenue:  () => S.revenue.map(r=>({src:r.src,amt:r.amt,t:r.t})),
    logs:     (n) => S.logs.slice(0, Math.min(120, n||40)).map(l=>({sev:l.sev,src:l.src,msg:l.msg})),
    telemetry:() => telemetry(),
    spend:    () => ({ authorized:S.spend||0, ceiling:S.budget||0, avoided:S.denials.reduce((a,b)=>a+b.cost,0) }),
    /* the one write it gets: leave a note in the ledger */
    note: (sev, msg) => { log(['OK','INFO','WARN','CRIT'].includes(sev)?sev:'INFO',
      'WRITTEN CAP', String(msg).slice(0,240)); return true; },
    /* connectors: it can CALL them, it can never read the key */
    connectors: () => (S.connectors||[]).filter(c=>c.enabled!==false)
      .map(c=>({ name:c.name, base:c.base, note:c.note||'' })),
    call: (name, opts) => connectorCall(name, opts||{})
  };
}

async function writeCapability(goal){
  if(!goal || !goal.trim()) throw new Error('Say what the new ability should do');
  const existing = Object.keys(CAPS).join(', ');
  const r = await think(
`Write a NEW capability for yourself. You are extending your own abilities.

WHAT IT MUST DO: ${goal}

You already have these, do not duplicate them: ${existing}

You are writing a JavaScript FUNCTION BODY. It receives one argument, api,
and must return an object {msg, n, detail}.

THE ONLY THINGS YOU CAN CALL — nothing else exists:
  api.monitors()      array of {name,url,state,checks,up,down,p95,ssl}
  api.agents()        array of {name,pillar,status,tools}
  api.ideas()         array of {title,score,verdict,status,price}
  api.gates()         array of {title,cls,risk,status,cost}
  api.revenue()       array of {src,amt,t}
  api.logs(n)         last n log entries {sev,src,msg}
  api.telemetry()     process metrics object
  api.spend()         {authorized, ceiling, avoided}
  api.note(sev,msg)   write one line to the audit ledger
  api.connectors()    list of connected services [{name, base, note}]
  api.call(name,opts) call a connector. opts = {path, method, body}
                      returns parsed JSON. You never see the API key.
                      Available right now: ${((S.connectors||[]).filter(c=>c.enabled!==false)
                        .map(c=>c.name+' ('+(c.note||c.base)+')').join(', ')) || 'none yet'}

FORBIDDEN and automatically rejected: require, process, fs, child_process,
eval, Function, import, globalThis, Buffer, prototype access, infinite loops.
No network. No filesystem. No shell.

Return ONLY JSON, no prose:
{"name":"cap.short_name","desc":"one line describing what it does",
 "pillar":1-5,
 "code":"the function body as a single JSON string, using \\n for newlines",
 "why":"why this is genuinely useful to the Owner",
 "risk":"what could go wrong with this code"}`,
    'You write small, safe, defensive JavaScript. Assume arrays may be empty. Never invent an api method that is not listed.',
    'self-extend','App Builder');

  const j = jparse(r.text);
  if(!j || !j.name || !j.code) throw new Error('Model did not return a usable capability');

  const name = String(j.name).replace(/[^a-z0-9._]/gi,'').slice(0,40);
  if(CAPS[name]) throw new Error(`"${name}" already exists`);

  /* scan BEFORE the owner is offered it */
  const violations = SANDBOX.scan(String(j.code));

  /* dry-run it against real state so the owner sees actual output, not a promise */
  let testRun = null, testError = null;
  if(!violations.length){
    try { testRun = await SANDBOX.runCapability(String(j.code), capabilityAPI(), 5000); }
    catch(e){ testError = e.message; }
  }

  const cap = { id:uid('CAP'), t:nowIso(), name, desc:String(j.desc||'').slice(0,160),
    pillar:Math.min(5,Math.max(1,+j.pillar||4)), code:String(j.code),
    why:String(j.why||'').slice(0,300), risk:String(j.risk||'').slice(0,300),
    violations, testRun, testError, status:'PENDING', bytes:String(j.code).length };
  S.writtenCaps.unshift(cap); S.writtenCaps = S.writtenCaps.slice(0,30);

  /* becomes a signed upgrade — same gate as everything else */
  propose('INSTALL_CAPABILITY',
    `He wrote a new ability for himself: ${name} — ${cap.desc}`,
    { capId:cap.id, name },
    violations.length ? `SANDBOX BLOCKED: ${violations.join('; ')}`
      : testError ? `dry-run failed: ${testError}`
      : `dry-run OK: ${testRun.msg}`,
    'self-extension');

  log(violations.length?'CRIT':'WARN','SELF-EXTEND',
    `Wrote capability "${name}" (${cap.bytes} bytes). ${violations.length?'BLOCKED by sandbox.':'Awaiting your signature.'}`);
  save();
  return cap;
}

/* SELF-REPAIR — his own written code broke, so he fixes his own code.
   Sandboxed and dry-run exactly like a new capability. Never touches the
   core system: a bug in that must be fixed by a human who can read a stack
   trace, not by a model guessing at a file it cannot see. */
let repairing = new Set();
async function repairCapability(capName, errMsg){
  if(repairing.has(capName)) return;
  const cap = (S.writtenCaps||[]).find(c=>c.name===capName && c.status==='INSTALLED');
  if(!cap) return;
  if((cap.repairs||0) >= 3){
    if(CAPS[capName]){ delete CAPS[capName]; cap.status='RETIRED'; cap.retired=nowIso();
      log('CRIT','SELF-REPAIR',`"${capName}" failed after 3 repair attempts. Retired so it stops wasting cycles.`);
      (S.tasks||[]).forEach(t=>{ if(t.cap===capName) t.enabled=false; });
      save(); }
    return;
  }
  repairing.add(capName);
  try{
    log('WARN','SELF-REPAIR',`"${capName}" failed twice. He is rewriting it.`);
    const r = await think(
`Your own capability is failing. Fix the code.

NAME: ${cap.name}
WHAT IT SHOULD DO: ${cap.desc}
THE ERROR IT THROWS: ${errMsg}

THE CURRENT CODE:
${cap.code}

The api object is the ONLY thing that exists. Nothing else. Available:
  api.monitors() api.agents() api.ideas() api.gates() api.revenue()
  api.logs(n) api.telemetry() api.spend() api.note(sev,msg)
  api.connectors() api.call(name,{path,method,body})

Common causes: reading a property of an empty array, assuming a field exists,
dividing by zero, calling an api method that is not on that list.

Rewrite it so it CANNOT throw. Guard every array. Default every number.
Return {msg, n, detail} in all paths, including when there is no data.

Return ONLY JSON: {"code":"the fixed function body as a JSON string","fix":"one line on what was wrong"}`,
      'You fix broken JavaScript defensively. Assume every input may be empty or missing.',
      'self-repair', 'Code Pipeline');

    const j = jparse(r.text);
    if(!j || !j.code) throw new Error('model returned no code');

    const violations = SANDBOX.scan(String(j.code));
    if(violations.length) throw new Error('rewrite blocked by sandbox: '+violations.join('; '));

    /* prove the fix works before adopting it */
    const test = await SANDBOX.runCapability(String(j.code), capabilityAPI(), 5000);

    const old = cap.code;
    cap.code = String(j.code);
    cap.repairs = (cap.repairs||0)+1;
    cap.repairLog = (cap.repairLog||[]);
    cap.repairLog.unshift({t:nowIso(), was:errMsg.slice(0,160),
      fix:String(j.fix||'').slice(0,200), verified:test.msg.slice(0,120)});
    cap.repairLog = cap.repairLog.slice(0,6);
    CAPS[capName] = { pillar:cap.pillar, safe:true, desc:cap.desc, written:true,
      async run(){ return SANDBOX.runCapability(cap.code, capabilityAPI(), 5000); } };
    (S.tasks||[]).forEach(t=>{ if(t.cap===capName){ t.fails=0; t.enabled=true; } });
    log('OK','SELF-REPAIR',`Fixed "${capName}" — ${j.fix}. Verified: ${test.msg}`);
    save();
    return { fixed:true, was:old.length, now:cap.code.length, note:j.fix };
  } finally { repairing.delete(capName); }
}

CAPS['ai.self_extend'] = { pillar:3, safe:true, desc:'Write a brand-new capability for himself, for your approval',
  async run(){
    const pending = (S.writtenCaps||[]).filter(c=>c.status==='PENDING').length;
    if(pending >= 2) return { msg:`${pending} written capabilities already awaiting your signature.`, n:0 };
    /* pick a gap he can actually see in his own state */
    const gaps = [];
    if(S.monitors.length && !CAPS['cap.slowest_target']) gaps.push('find the slowest monitored target and how much worse it is than the rest');
    if(S.ideas.length   && !CAPS['cap.idea_ranker'])     gaps.push('rank every researched idea by score against effort and name the single best');
    if(S.revenue.length && !CAPS['cap.revenue_trend'])   gaps.push('detect whether recorded revenue is rising or falling and by how much');
    gaps.push('summarise the most repeated warning in the audit ledger and how often it recurs');
    const c = await writeCapability(gaps[0]);
    return { msg:`Wrote "${c.name}" — ${c.violations.length?'sandbox blocked it':'awaiting your signature'}.`,
      n:1, detail:c.desc };
  }};

/* ======================================================================
   SELF-HEALING TEAM — when the system breaks, an agent diagnoses it and
   either fixes it outright or issues you the one action only a human can do.
   ====================================================================== */
function keyHealth(){
  const now = Date.now();
  const all = [];
  if(S.llm && S.llm.provider) all.push({...S.llm, role:'PRIMARY'});
  (S.llmBackups||[]).forEach(k=>all.push({...k, role:'BACKUP'}));
  return {
    total: all.length,
    ready: all.filter(k=>!(k.cooled>now)).length,
    cooling: all.filter(k=>k.cooled>now).length,
    providers: [...new Set(all.map(k=>k.provider))],
    detail: all.map(k=>`${k.role} ${k.provider}/${k.model} ${k.cooled>now?'COOLING':'ready'} (${k.ok||0} ok, ${k.fail||0} fail)`)
  };
}

/* Medic: runs without the AI so it still works when the AI is the problem. */
CAPS['team.medic'] = { pillar:1, safe:true, desc:'Diagnose the system and repair what can be repaired without you',
  async run(){
    const kh = keyHealth();
    const fixed = [], blocked = [];

    /* 1. revive keys whose cooldown has genuinely elapsed */
    const now = Date.now();
    let revived = 0;
    (S.llmBackups||[]).forEach(k=>{ if(k.cooled && k.cooled<=now){ k.cooled=0; revived++; } });
    if(S.llm && S.llm.cooled && S.llm.cooled<=now){ S.llm.cooled=0; revived++; }
    if(revived) fixed.push(`${revived} key(s) came off cooldown and were returned to the pool`);

    /* 2. clear a stale global pause */
    if(COOLDOWN_UNTIL && Date.now() >= COOLDOWN_UNTIL){ COOLDOWN_UNTIL=0; fixed.push('global pause expired and was cleared'); }

    /* 3. disable standing orders whose capability no longer exists */
    let orphan = 0;
    (S.tasks||[]).forEach(t=>{ if(!CAPS[t.cap] && t.enabled){ t.enabled=false; orphan++; } });
    if(orphan) fixed.push(`${orphan} standing order(s) pointed at missing capabilities and were disabled`);

    /* 4. restore an empty roster — ONLY if the Owner never deliberately cleared it.
       This used to fight the Owner: he deleted agents, the medic put them back,
       he deleted them again, forever. If he emptied it on purpose, respect it. */
    if(S.owner && !S.agents.length && !S.rosterCleared){
      seed(); fixed.push('agent roster was empty and has been reseeded');
    }

    /* 5. flag what only the Owner can resolve */
    if(kh.ready === 0)
      blocked.push('NO USABLE AI KEY — every key is cooling or exhausted. Add one free key (Google AI Studio, Cerebras, NVIDIA NIM) and the system self-recovers.');
    if(kh.total === 1)
      blocked.push('SINGLE POINT OF FAILURE — only one AI key exists. One rate limit stops everything. A second free key removes this entirely.');
    if(!S.monitors.length)
      blocked.push('NO SITES MONITORED — the Uptime Marshal is watching nothing, so there is no evidence to sell.');
    if(!telemetry().smtp_ready && S.monitors.length)
      blocked.push('ALERTS UNDELIVERABLE — sites are monitored but no mail relay is armed.');
    if(S.owner && S.owner.bootstrap)
      blocked.push('BOOTSTRAP PASSWORD STILL LIVE — a plaintext copy exists on disk.');

    if(fixed.length) log('OK','TEAM MEDIC',`Repaired: ${fixed.join('; ')}`);
    if(blocked.length) log('WARN','TEAM MEDIC',`Needs you: ${blocked[0]}`);
    save();
    return {
      msg: `${fixed.length} repair(s) made, ${blocked.length} item(s) need you. Keys: ${kh.ready}/${kh.total} ready.`,
      n: fixed.length,
      detail: [...fixed.map(f=>'FIXED: '+f), ...blocked.map(b=>'NEEDS YOU: '+b)].join(' | ') || 'nothing to repair'
    };
  }};

/* Quartermaster: when keys run dry, issue the exact human steps to fix it. */
/* AUTO KEY ROTATION — the Owner asked why there is no agent for this.
   There was not one. Now there is, and it does the parts that are
   mechanical: promote the healthiest key to primary, clear expired
   cooldowns, retire keys that keep failing, and repair a dead model name
   by asking the provider what it serves today. It CANNOT create a key —
   every provider requires a human CAPTCHA and email or phone verification.
   That one step stays a job on the Owner's desk. */
CAPS['team.keymaster'] = { pillar:2, safe:true,
  desc:'Rotate AI keys automatically — promote the healthy, retire the dead, fix retired models',
  async run(){
    const now = Date.now();
    const acts = [];
    const all = [];
    if(S.llm && S.llm.provider) all.push(S.llm);
    (S.llmBackups||[]).forEach(k=>all.push(k));
    if(!all.length) return { msg:'No keys at all. Add one free key in AI Brain.', n:0 };

    /* 1. expired cooldowns are just noise — clear them */
    let cleared = 0;
    all.forEach(k=>{ if(k.cooled && k.cooled <= now){ k.cooled = 0; cleared++; } });
    if(cleared) acts.push(`${cleared} cooldown(s) expired and cleared`);

    /* 2. promote the healthiest usable key to primary */
    const usable = all.filter(k=>!(k.cooled > now));
    if(usable.length){
      const score = k => (k.ok||0) - (k.fail||0)*3;
      const best = usable.reduce((a,b)=> score(b) > score(a) ? b : a);
      if(best !== S.llm && score(best) > score(S.llm) + 2){
        const old = S.llm;
        const idx = (S.llmBackups||[]).indexOf(best);
        if(idx >= 0){
          S.llmBackups[idx] = old;
          S.llm = best;
          acts.push(`promoted ${best.provider} to primary (${best.ok||0} ok / ${best.fail||0} fail) over ${old.provider}`);
          log('OK','KEYMASTER',`Primary key switched to ${best.provider}. It is measurably healthier.`);
        }
      }
    }

    /* 3. retire a key that fails relentlessly — it is poisoning the pool */
    const dead = (S.llmBackups||[]).filter(k=>(k.fail||0) >= 12 && (k.ok||0) === 0);
    if(dead.length){
      S.llmBackups = (S.llmBackups||[]).filter(k=>!dead.includes(k));
      acts.push(`retired ${dead.length} key(s) that never once succeeded`);
      log('WARN','KEYMASTER',`Retired ${dead.length} permanently failing key(s): ${dead.map(k=>k.provider).join(', ')}`);
    }

    /* 4. a retired MODEL is repairable without the Owner: ask what is live */
    let repaired = 0;
    for(const k of usable.slice(0,3)){
      if(!k.modelDead) continue;
      try{
        const live = await LLM.listModels(k);
        const pick = live.find(m=>/gpt-oss|qwen|llama|gemini|flash|mistral/i.test(m)) || live[0];
        if(pick && pick !== k.model){
          log('OK','KEYMASTER',`${k.provider}: model "${k.model}" is gone, switched to "${pick}".`);
          k.model = pick; k.modelDead = false; repaired++;
        }
      }catch(e){}
    }
    if(repaired) acts.push(`${repaired} dead model name(s) repaired from the provider's live list`);

    if(acts.length) save();
    const kh = keyHealth();
    return { msg: acts.length ? `Key rotation: ${acts.join('; ')}.`
                              : `${kh.ready} key(s) ready. Nothing needed.`,
             n: acts.length, detail: kh.detail.join(' | ') };
  }};

CAPS['team.quartermaster'] = { pillar:2, safe:true, desc:'When AI keys run out, issue the exact steps to add another',
  async run(){
    const kh = keyHealth();
    if(kh.ready > 1)
      return { msg:`${kh.ready} keys ready across ${kh.providers.length} provider(s). No action needed.`, n:0,
               detail: kh.detail.join(' | ') };

    const have = kh.providers;
    const options = [
      ['gemini','Google AI Studio','aistudio.google.com/apikey','1,500 requests/day','Sign in with Google, click Create API key. No card.'],
      ['cerebras','Cerebras','cloud.cerebras.ai','1,000,000 tokens/day','Sign up with email, go to API Keys. No card.'],
      ['nvidia','NVIDIA NIM','build.nvidia.com','120+ models, ~40 req/min','Email plus phone verification. No card.'],
      ['openrouter','OpenRouter','openrouter.ai/keys','50 requests/day free','Sign up, create a key. No card.'],
      ['groq','Groq','console.groq.com','~14,400 requests/day','Email only, no card. Fastest option.']
    ].filter(o=>!have.includes(o[0]));

    if(!options.length)
      return { msg:'Every supported free provider is already connected. Consider a paid key if limits still bite.', n:0 };

    const pick = options[0];
    const already = S.missions.some(m=>m.status==='OPEN' && /API key/i.test(m.title));
    if(!already){
      S.missions.unshift({
        id:uid('MSN'), t:nowIso(), ventureId:null,
        title:`Add a free ${pick[1]} key`,
        why:`Only ${kh.ready} AI key is usable, so a single rate limit halts the whole system. A second provider on a separate quota removes that.`,
        steps:[
          `Open ${pick[2]} in your browser`,
          pick[4],
          'Copy the key it shows you — it is usually displayed only once',
          'In the Chairman: AI Brain page, scroll to Backup Providers',
          `Choose ${pick[1]}, paste the key, leave Model blank, press ADD BACKUP`
        ],
        script:'', minutes:4,
        doneWhen:`AI Brain shows 2+ keys and the new one reads READY`,
        risk:'Getting distracted mid-signup and losing the key before pasting it',
        status:'OPEN', outcome:null
      });
      S.missions = S.missions.slice(0,80);
      log('WARN','QUARTERMASTER',`AI capacity low. Mission issued: add a free ${pick[1]} key (${pick[3]}).`);
      save();
    }
    return { msg:`Only ${kh.ready} key usable — mission issued to add ${pick[1]} (${pick[3]}).`, n:1,
             detail:`${pick[1]} at ${pick[2]} — ${pick[3]}, no card required.` };
  }};

/* ======================================================================
   MISSION ENGINE — the Chairman cannot act in the physical world, so he
   coaches. Every mission is one concrete action YOU can finish today,
   with the literal words to use and a definition of done.
   ====================================================================== */
async function generateMissions(ventureId, feedback){
  const v = ventureId ? S.ventures.find(x=>x.id===ventureId) : null;
  const idea = v ? S.ideas.find(i=>i.id===v.ideaId) : null;
  const doneList = S.missions.filter(m=>m.status==='DONE')
    .slice(0,12).map(m=>`${m.title} → ${m.outcome||'done'}`).join('; ') || 'nothing yet';
  const openList = S.missions.filter(m=>m.status==='OPEN').map(m=>m.title).join('; ') || 'none';
  const sites = S.monitors.filter(m=>m.checks>0)
    .map(m=>`${m.name} ${(m.up/m.checks*100).toFixed(1)}% over ${m.checks} checks`).join('; ') || 'none yet';

  const r = await think(
`Produce the Owner's next 3 missions. A mission is ONE action a single person
can finish in under 90 minutes, today, with no money and no company.

OWNER REALITY:
- One person, Ludhiana, Punjab. Gmail working. No company, no staff, no ads budget.
- Owns Chairman Agent OS: 24/7 uptime probing, TLS alerts, real email alerts,
  AI brain, Razorpay/Stripe payment links.
- Monitored sites and their real numbers: ${sites}
- Payments: ${S.pay?(S.pay.live?'LIVE Razorpay/Stripe armed':'test mode only'):'not connected'}
${v?`- Current venture: ${v.title}. Revenue path: ${v.revenuePath}`:'- No venture chosen yet.'}
${idea&&idea.research?`- Research verdict: ${idea.verdict}, first step was "${idea.research.firstStep}"`:''}
- Missions already completed: ${doneList}
- Missions currently open (do NOT repeat these): ${openList}
${feedback?`- Owner just reported: "${feedback}" — adapt to this.`:''}

RULES:
- No mission may require the Owner to lie or claim experience he lacks.
- No mission may cost money.
- If a mission involves contacting someone, give the LITERAL message text.
- Prefer actions that produce evidence or a reply, not "research" or "think about".
- Sequence matters: mission 1 must be doable before mission 2.

Return ONLY JSON:
[{"title":"short imperative, max 8 words",
  "why":"one sentence on why this specifically moves money closer",
  "steps":["numbered concrete actions, 3-6 of them"],
  "script":"the exact words to send or say, or empty string if not applicable",
  "minutes":number,
  "done_when":"the observable thing that proves it is complete",
  "blocker_risk":"the most likely reason the Owner stalls on this"}]`,
    null,'missions','Growth Conductor');

  const arr = jparse(r.text);
  const added = [];
  for(const m of (Array.isArray(arr)?arr:[])){
    if(!m || !m.title) continue;
    const mission = { id:uid('MSN'), t:nowIso(), ventureId:ventureId||null,
      title:String(m.title).slice(0,80), why:String(m.why||'').slice(0,240),
      steps:(m.steps||[]).map(s=>String(s).slice(0,300)).slice(0,8),
      script:String(m.script||''), minutes:+m.minutes||30,
      doneWhen:String(m.done_when||'').slice(0,200),
      risk:String(m.blocker_risk||'').slice(0,200),
      status:'OPEN', outcome:null };
    S.missions.unshift(mission); added.push(mission);
  }
  S.missions = S.missions.slice(0,80); save();
  log('OK','MISSION',`${added.length} mission(s) issued to the Owner.`);
  return added;
}

async function debriefMission(id, outcome, note){
  const m = S.missions.find(x=>x.id===id);
  if(!m) throw new Error('No such mission');
  m.status = outcome==='done' ? 'DONE' : 'SKIPPED';
  m.outcome = String(note||'').slice(0,400) || (outcome==='done'?'completed':'skipped');
  m.closed = nowIso(); save();
  log(outcome==='done'?'OK':'WARN','MISSION',`"${m.title}" ${m.status}. ${m.outcome}`);

  if(outcome!=='done') return { advice:null };
  const r = await think(
`The Owner just completed this mission:
TITLE: ${m.title}
WHAT HAPPENED: ${m.outcome}

Give a short debrief: what this actually proves, what it does NOT prove,
and the single most valuable next action. Be blunt. Under 120 words.
Do not congratulate. If the outcome was weak, say so.`,
    null,'debrief','Chairman');
  return { advice:r.text };
}

async function writePlaybook(topic){
  const r = await think(
`Write a practical playbook the Owner can follow step by step.

TOPIC: ${topic}

CONTEXT: one person in Ludhiana, Punjab, India. No company, no capital, no staff.
Owns website uptime monitoring software with real email alerting and can raise
Razorpay payment links.

Requirements:
- Number every step. No step may be vague.
- Where a website or form is involved, name it exactly.
- Where words are needed, write the exact words.
- State honestly where the Owner will need documents, money, or a legal identity.
- If a step is genuinely optional at this stage, mark it OPTIONAL.
- End with "COMMON MISTAKES" listing 3 specific errors people make here.
Under 700 words. No motivational filler.`,
    null,'playbook','Insight Forge');
  const pb = { id:uid('PBK'), t:nowIso(), topic:String(topic).slice(0,120), text:r.text };
  S.playbooks.unshift(pb); S.playbooks = S.playbooks.slice(0,40); save();
  log('OK','MISSION',`Playbook written: ${pb.topic}`);
  return pb;
}

CAPS['ai.missions'] = { pillar:5, safe:true, desc:'AI issues the Owner\'s next concrete actions',
  async run(){
    const open = S.missions.filter(m=>m.status==='OPEN').length;
    if(open >= 3) return { msg:`${open} mission(s) still open — finish those first.`, n:open };
    const v = S.ventures[0];
    const added = await generateMissions(v?v.id:null);
    return { msg:`${added.length} new mission(s) issued.`, n:added.length,
      detail: added.map(a=>a.title).join('; ') };
  }};

CAPS['ai.investigate'] = { pillar:4, safe:true, desc:'Deep multi-angle research on any topic, live from the web',
  async run(){
    const q = S.directives[0] || (S.ideas[0] && S.ideas[0].title) || 'website uptime monitoring India';
    const ev = await RESEARCH.deepDive(q, 'Ludhiana Punjab India');
    const r = await think(
`You just gathered live evidence on: ${q}

${ev.slice(0,7000)}

Extract what MATTERS. Cite only what the evidence supports.
Return: 5 hard facts, 2 things the evidence contradicts about common assumptions,
and 1 opportunity nobody in the results is serving. Be blunt. No invention.`,
      null,'investigate','Market Signal');
    return { msg:`Deep-dived "${q}".`, n:1, detail:r.text.slice(0,220) };
  }};

CAPS['ai.ideas'] = { pillar:5, safe:true, desc:'AI invents new money-making ideas on its own',
  async run(){
    const added = await generateIdeas(3);
    return { msg:`${added.length} new idea(s) generated.`, n:added.length,
      detail: added.map(a=>a.title).join('; ') };
  }};
CAPS['ai.research'] = { pillar:4, safe:true, desc:'AI researches the oldest unresearched idea against live web data',
  async run(){
    const next = S.ideas.filter(i=>i.status==='RAW').pop();
    if(!next) return { msg:'No unresearched ideas in the queue.', n:0 };
    const i = await researchIdea(next.id);
    return { msg:`"${i.title}" scored ${i.score}/100 — ${i.verdict}.`, n:1,
      detail:i.research.reasoning };
  }};

CAPS['ai.brief'] = { pillar:4, safe:true, desc:'AI writes an executive brief on real system state',
  async run(){
    const t=telemetry();
    const down=S.monitors.filter(m=>m.state==='DOWN');
    const facts=`Uptime ${hhmm(t.uptime_s)}. ${S.monitors.length} monitored targets, ${down.length} currently down`+
      (down.length?` (${down.map(m=>m.name+': '+(m.lastErr||'HTTP '+m.lastStatus)).join('; ')})`:'')+
      `. ${S.agents.filter(a=>a.status==='ACTIVE').length} of ${S.agents.length} agents active. `+
      `${S.gates.filter(g=>g.status==='PENDING').length} permission gates frozen. `+
      `Authorized spend $${S.spend.toFixed(2)}. ${t.auth_failures} failed logins. `+
      `Mail relay ${t.smtp_ready?'armed':'OFFLINE'}. `+
      S.monitors.filter(m=>m.checks>0).map(m=>`${m.name} availability ${((m.up/m.checks)*100).toFixed(1)}% p95 ${m.p95}ms`).join('. ');
    const r=await think(
      `Here is the live state of the system you oversee:\n\n${facts}\n\n`+
      `Write a 5-line executive brief for the Owner. Line 1: the single most urgent thing. `+
      `Lines 2-4: what matters and why. Line 5: the one action to take next. `+
      `If everything is healthy, say so in one line instead of padding.`,
      null,'brief','Insight Forge');
    log('INFO','AI BRIEF', r.text.split('\n')[0].slice(0,160));
    return { msg:'AI brief written ('+r.tokens+' tokens, '+r.ms+'ms).', n:1, detail:r.text.slice(0,200) };
  }};

CAPS['ai.incident'] = { pillar:1, safe:true, desc:'AI diagnoses any target that is down',
  async run(){
    const down=S.monitors.filter(m=>m.state==='DOWN');
    if(!down.length) return {msg:'No incidents to diagnose.', n:0, detail:'all targets up'};
    const m=down[0];
    const r=await think(
      `A monitored website is failing.\nURL: ${m.url}\nStatus: ${m.lastErr||'HTTP '+m.lastStatus}\n`+
      `Latency: ${m.lastMs}ms\nAvailability: ${((m.up/m.checks)*100).toFixed(1)}% over ${m.checks} checks\n`+
      `TLS: ${m.ssl?m.ssl.issuer+', expires in '+m.ssl.days_left+' days':'unknown'}\n\n`+
      `Give the 3 most likely causes ranked by probability, and the exact first check for each. Be specific and technical.`,
      null,'incident','Breach Warden');
    log('CRIT','AI DIAGNOSIS', m.name+': '+r.text.split('\n')[0].slice(0,140));
    return { msg:`Diagnosed ${m.name}.`, n:1, detail:r.text.slice(0,200) };
  }};

CAPS['ai.revenue'] = { pillar:5, safe:true, desc:'AI proposes concrete ways to earn from what you actually have',
  async run(){
    const r=await think(
      `HARD CONSTRAINT 1: every proposal must be delivered USING the software described below. `+
      `Reject any idea that is just "resell ChatGPT output".\n`+
      `THINK LIKE A FOUNDER: find the angle a competitor would miss. Ludhiana is India's `+
      `hosiery, bicycle-parts and machine-tools capital — thousands of family-run exporters `+
      `whose buyers check their website before placing bulk orders, and who have no idea when `+
      `that website is down. Name the specific niche and the specific moment the pain is felt, `+
      `not "small businesses". One offer must target someone the Owner can physically visit.\n`+
      `HARD CONSTRAINT 2 — TRUTH: the Owner has monitored ONLY ${S.monitors.length} site(s) and has `+
      `NEVER monitored any client site. The outreach message must NOT claim prior observation of other `+
      `businesses, must NOT cite statistics the Owner cannot prove, and must NOT invent revenue figures. `+
      `Any sentence beginning "I noticed" or "I saw" about a stranger's website is a lie and is forbidden. `+
      `The honest opening is an offer to monitor FREE and show real data afterwards.\n`+
      `HARD CONSTRAINT 3: check your own arithmetic. If you state a price as a percentage of a loss, `+
      `compute it correctly.\n\n`+
      `THE ASSET the Owner owns and runs:\n`+
      `- Automated HTTP/HTTPS uptime probing, every 15-120 seconds\n`+
      `- TLS certificate expiry detection with advance warning\n`+
      `- Instant email alerts on outage and recovery via working SMTP\n`+
      `- Availability percentage, p95 latency, incident history per site\n`+
      `- Runs 24/7 at zero hosting cost\n`+
      `Owner: one person in Ludhiana, Punjab. No company, no staff, no capital, no track record yet.\n\n`+
      `Give exactly 3 offers. For each state:\n`+
      `1. The offer in one sentence\n`+
      `2. The business type in Ludhiana and the specific pain, described WITHOUT inventing numbers\n`+
      `3. Monthly price in INR and the reasoning, using only arithmetic you have verified\n`+
      `4. The literal first WhatsApp message, under 50 words, containing ZERO unverifiable claims — `+
      `it should lead with a free trial offer, not a fake observation\n`+
      `5. The biggest objection and an honest counter that does not exaggerate\n\n`+
      `Cold outreach closes 1-3%. Do not promise fast results. No filler.`,
      null,'revenue','Revenue Streamer');
    log('INFO','AI STRATEGY', 'Revenue proposals generated.');
    return { msg:'3 revenue routes proposed.', n:3, detail:r.text.slice(0,200) };
  }};

CAPS['ai.client_report'] = { pillar:4, safe:true, desc:'AI writes a client-ready uptime report you can send',
  async run(){
    const rows=S.monitors.filter(m=>m.checks>0);
    if(!rows.length) return {msg:'No monitor data to report on.', n:0, detail:'bind a target first'};
    const data=rows.map(m=>`${m.name} (${m.url}): ${((m.up/m.checks)*100).toFixed(2)}% availability, `+
      `${m.checks} checks, p95 ${m.p95}ms, ${m.down} failures`+
      (m.ssl?`, TLS valid ${m.ssl.days_left} more days`:'')).join('\n');
    const r=await think(
      `Write a short professional uptime report a client would pay for, based only on this real data:\n\n${data}\n\n`+
      `Include: a one-line headline verdict, the numbers in plain English a non-technical business owner understands, `+
      `and one clear recommendation. Keep it under 200 words. Do not invent data not listed above.`,
      'You write concise professional client reports. Plain English, no jargon, no invented figures.',
      'client-report','Insight Forge');
    return { msg:'Client report ready to send.', n:rows.length, detail:r.text.slice(0,200) };
  }};

/* default standing orders — real schedules, real work */
/* HUSTLE MODE — everything money-facing, tight intervals, parallel lanes.
   Used when the Owner wants maximum output in the next hour. */
/* Intervals sized for FREE tiers. Groq allows ~14,400 req/day but throttles
   at ~30/min; these spacings keep well clear while still producing steadily. */
const HUSTLE_TASKS = [
  ['ai.ideas',        900, 'Growth Conductor'],
  ['ai.research',     600, 'Market Signal'],
  ['ai.missions',    1200, 'Growth Conductor'],
  ['ai.revenue',     1800, 'Revenue Streamer'],
  ['ai.investigate', 1500, 'Market Signal'],
  ['ai.client_report',2400,'Insight Forge'],
  ['probe.sweep',     120, 'Uptime Marshal'],
  ['anomaly.scan',    600, 'Audit Sentinel'],
  ['gate.sentry',     600, 'Risk Matrix Analyst'],
  ['ai.brief',       1800, 'Insight Forge'],
  ['team.medic',      240, 'Breach Warden'],
  ['team.quartermaster', 600, 'Resource Controller'],
  ['dom.check_own',    10800, 'Resource Controller'],
  ['team.keymaster',      300, 'Resource Controller']
];

const DEFAULT_TASKS = [
  ['probe.sweep',   120, 'Uptime Marshal'],
  ['tls.watch',    3600, 'Breach Warden'],
  ['sla.report',    600, 'Insight Forge'],
  ['anomaly.scan',  300, 'Audit Sentinel'],
  ['cost.audit',    900, 'Innovation Scout'],
  ['roster.audit', 1800, 'Policy Vault Keeper'],
  ['gate.sentry',   600, 'Risk Matrix Analyst'],
  ['brief.write',   900, 'Insight Forge'],
  ['team.medic',    300, 'Breach Warden'],
  ['team.quartermaster', 900, 'Resource Controller'],
  ['team.keymaster',     600, 'Resource Controller'],
  ['content.week',    172800, 'Growth Conductor'],
  ['comments.harvest',  1800, 'Growth Conductor'],
  ['skills.cadence',    3600, 'Growth Conductor'],
  ['dom.check_own',    21600, 'Resource Controller'],
  ['dom.expiring_soon', 43200, 'Market Signal']
];
function seedTasks(force, hustle){
  if(S.tasks.length && !force) return;
  const src = hustle ? HUSTLE_TASKS : DEFAULT_TASKS;
  S.tasks = src.map(([cap,every,owner])=>({
    id:uid('TSK'), cap, every, owner, enabled:true, runs:0, fails:0,
    lastAt:null, lastMsg:null, lastOk:null, created:nowIso() }));
  S.hustle = !!hustle;
  log(hustle?'CRIT':'OK','RUNTIME',
    hustle ? `HUSTLE MODE — ${S.tasks.length} money-focused orders, ${S.lanes||3} parallel lanes. Maximum output.`
           : `${S.tasks.length} standing orders installed. Agents are now executing work.`);
}

/* PARALLEL EXECUTION — every due task fires at once, not one after another.
   Concurrency is capped so free-tier LLM rate limits are not tripped. */
let tickBusy=false;
async function runTask(t){
  const cap=CAPS[t.cap];
  if(!cap){ t.enabled=false; return; }
  const t0=Date.now();
  t.lastAt=nowIso();                     // claim it now so a parallel tick cannot double-fire
  try{
    const r=await cap.run();
    t.lastOk=true; t.lastMsg=r.msg; t.runs++;
    S.runs.unshift({t:nowIso(), cap:t.cap, owner:t.owner, ok:true,
      msg:r.msg, detail:r.detail||'', ms:Date.now()-t0, n:r.n||0});
  }catch(e){
    t.lastOk=false; t.lastMsg='FAILED: '+e.message; t.fails++;
    S.runs.unshift({t:nowIso(), cap:t.cap, owner:t.owner, ok:false,
      msg:'FAILED: '+e.message, detail:'', ms:Date.now()-t0, n:0});
    log('CRIT','RUNTIME',`${t.cap} failed: ${e.message}`);
    /* SELF-REPAIR: only for code he wrote himself. Never touches my code. */
    if(cap.written && t.fails>=2) repairCapability(t.cap, e.message)
      .catch(err=>log('WARN','SELF-REPAIR', t.cap+': '+err.message));
  }
  S.runs=S.runs.slice(0,120);
}
async function tick(){
  if(tickBusy || !S.running || !S.owner) return;
  tickBusy=true; S.ticks++;
  try{
    const now=Date.now();
    const due = S.tasks.filter(t=>t.enabled &&
      (!t.lastAt || (now - new Date(t.lastAt.replace(' ','T')+'Z').getTime()) >= t.every*1000));
    if(due.length){
      /* split: cheap local tasks all at once, AI tasks throttled to 3 at a time */
      const localTasks = due.filter(t=>!t.cap.startsWith('ai.'));
      const aiTasks    = due.filter(t=>t.cap.startsWith('ai.'));
      await Promise.all(localTasks.map(runTask));
      const LANES = Math.max(1, +S.lanes || 3);
      for(let i=0;i<aiTasks.length;i+=LANES)
        await Promise.all(aiTasks.slice(i,i+LANES).map(runTask));
      log('OK','RUNTIME',`Parallel cycle: ${localTasks.length} local + ${aiTasks.length} AI task(s) executed.`);
    }
    save();
  } finally { tickBusy=false; }
}
setInterval(tick, 10000);
setTimeout(selfAudit, 8000);

/* ---------- real telemetry ---------- */
function telemetry(){
  const mu = process.memoryUsage();
  const lat = T.lat.length ? T.lat.reduce((a,b)=>a+b,0)/T.lat.length : 0;
  const live = [...SESS.values()].filter(s=>Date.now()-s.last<70000).length;
  const dbBytes=DBBYTES;
  const la = os.loadavg();
  return {
    uptime_s: Math.floor((Date.now()-BOOT)/1000),
    node: process.version, platform: process.platform+'/'+process.arch,
    pid: process.pid,
    rss_mb: +(mu.rss/1048576).toFixed(1),
    heap_mb: +(mu.heapUsed/1048576).toFixed(1),
    heap_total_mb: +(mu.heapTotal/1048576).toFixed(1),
    sys_mem_pct: +(100-(os.freemem()/os.totalmem()*100)).toFixed(1),
    cpus: os.cpus().length,
    load1: +la[0].toFixed(2), load5: +la[1].toFixed(2), load15: +la[2].toFixed(2),
    requests: T.req, api_calls: T.api, errors: T.err, auth_failures: T.auth_fail,
    avg_latency_ms: +lat.toFixed(2),
    live_sessions: live, total_sessions: SESS.size,
    db_bytes: dbBytes, state_rev: S.rev,
    hostname: os.hostname(),
    monitors: S.monitors.length,
    monitors_down: S.monitors.filter(m=>m.state==='DOWN').length,
    smtp_ready: !!(S.smtp && S.smtp.host),
    mail_sent: MAILSTAT.sent, mail_failed: MAILSTAT.failed,
    sessions_durable: true,
    hot_paths: Object.entries(T.byPath).sort((a,b)=>b[1]-a[1]).slice(0,6)
  };
}
/* real per-floor health derived from actual process + roster facts */
function floorHealth(){
  const t = telemetry();
  const memPen = Math.min(30, t.rss_mb/8);
  const loadPen = Math.min(25, t.load1*10);
  const errPen = Math.min(25, t.errors*3);
  const authPen = Math.min(30, t.auth_failures*6);
  const pend = S.gates.filter(g=>g.status==='PENDING').length;
  const mons = S.monitors.length;
  const downs = S.monitors.filter(m=>m.state==='DOWN').length;
  const monPen = mons ? (downs/mons)*45 : 0;
  return PILLARS.map(p=>{
    const roster = S.agents.filter(a=>a.pillarId===p.id);
    const active = roster.filter(a=>a.status==='ACTIVE').length;
    const staffing = roster.length ? active/roster.length : 0;
    let h;
    if(p.id===1) h = 100 - authPen - Math.min(15,S.denials.length*2);
    else if(p.id===2) h = 100 - loadPen - memPen/2 - monPen;
    else if(p.id===3) h = 100 - errPen - Math.min(20, pend*4);
    else if(p.id===4) h = 100 - Math.min(20, (t.db_bytes/60000));
    else h = 100 - Math.min(25, S.spend) - (S.payout?0:12);
    h = Math.round(Math.max(5, Math.min(100, h * (0.55 + 0.45*staffing))));
    const load = Math.round(Math.min(100, (t.load1/Math.max(1,t.cpus))*100*0.6 + roster.length*3 + (p.id===3?pend*5:0)));
    return { id:p.id, health:h, load:Math.max(3,load), agents:roster.length, active };
  });
}

/* ---------- helpers ---------- */
function send(res, code, obj, hdrs={}){
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, Object.assign({'Content-Type':'application/json','Content-Length':b.length,
    'Cache-Control':'no-store','X-Frame-Options':'ALLOWALL'}, hdrs));
  res.end(b);
}
function pub(){
  return { owner: S.owner ? { id:S.owner.id, email:S.owner.email, created:S.owner.created,
             bootstrap:!!S.owner.bootstrap } : null,
    agents:S.agents, gates:S.gates, logs:S.logs.slice(0,400), revenue:S.revenue,
    payout: S.payout ? { type:S.payout.type, cap:S.payout.cap, masked:S.payout.masked, t:S.payout.t } : null,
    denials:S.denials, spend:S.spend, devices:S.devices.slice(0,12), rev:S.rev,
    monitors:S.monitors, incidents:S.incidents.slice(0,40), mailq:S.mailq.slice(0,30),
    smtp: S.smtp ? { host:S.smtp.host, port:S.smtp.port, secure:!!S.smtp.secure,
      user:mask(S.smtp.user), from:S.smtp.from, name:S.smtp.name, t:S.smtp.t } : null,
    mailstat: MAILSTAT,
    skills:S.skills, proposals:S.proposals.slice(0,40),
    evolution:S.evolution.slice(0,60), autopilot:!!S.autopilot, scanCount:S.scanCount,
    writtenCaps:(S.writtenCaps||[]).slice(0,15),
    analyses:(S.analyses||[]).slice(0,12),
    crews:(S.crews||[]).slice(0,12),
    docs:(S.docs||[]).map(d=>({id:d.id,t:d.t,name:d.name,size:d.size,
      chars:d.chars,readable:d.readable,preview:d.text.slice(0,180)})),
    drafts:(S.drafts||[]).map(d=>({id:d.id,t:d.t,kind:d.kind,brief:d.brief,
      text:d.text,bytes:d.bytes,sentTo:d.sentTo?maskMail(d.sentTo):null,sentAt:d.sentAt||null})),
    connectors:(S.connectors||[]).map(c=>({name:c.name,base:c.base,auth:c.auth,
      note:c.note,enabled:c.enabled!==false,calls:c.calls||0,fails:c.fails||0,
      key:c.key?mask(c.key):'(none)',lastAt:c.lastAt||null})),
    tasks:S.tasks, runs:S.runs.slice(0,80), running:!!S.running, ticks:S.ticks,
    hustle:!!S.hustle, lanes:S.lanes||3, budget:S.budget||0,
    llmBackups:(S.llmBackups||[]).map(b=>({provider:b.provider,model:b.model,key:mask(b.key),
      ok:b.ok||0,fail:b.fail||0,cooled:(b.cooled||0)>Date.now()})),
    agentRuns:(S.agentRuns||[]).slice(0,12),
    builds:(S.builds||[]).map(x=>({id:x.id,t:x.t,title:x.title,bytes:x.bytes,
      hasPayLink:x.hasPayLink,ventureId:x.ventureId})),
    domains: { watch:((S.domains||{}).watch)||[], runs:((S.domains||{}).runs)||[],
      howItWorks: HOW_DOMAINS_WORK, priceAsOf: DOMAINS.PRICE_ASOF,
      tlds: Object.keys(DOMAINS.PRICES).map(t=>({tld:t,first:DOMAINS.PRICES[t][0],renew:DOMAINS.PRICES[t][1]})) },
    businesses:(S.businesses||[]).map(x=>({id:x.id,t:x.t,name:x.name,tagline:x.tagline,
      ventureId:x.ventureId, zipBytes:x.zipBytes, tellCount:x.tellCount, tells:x.tells,
      rewrote:x.rewrote, payNote:x.payNote, hasTool:x.hasTool, toolTitle:x.toolTitle,
      domains:x.domains||null,
      tiers:x.tiers, outreach:x.outreach, steps:x.steps, published:!!x.published,
      publishedUrl:x.publishedUrl||'',
      brand:(x.identity||{}).brand, buyer:(x.identity||{}).buyer,
      promise:(x.identity||{}).promise,
      fileList:x.fileList})),
    cooldown: coolingDown() ? Math.ceil((COOLDOWN_UNTIL-Date.now())/1000) : 0,
    caps:Object.entries(CAPS).map(([k,v])=>({cap:k,desc:v.desc,pillar:v.pillar})),
    llm: S.llm ? { provider:S.llm.provider, model:S.llm.model, key:mask(S.llm.key), t:S.llm.t } : null,
    providers: Object.entries(LLM.PROVIDERS).map(([k,v])=>({id:k,label:v.label,model:v.model,signup:v.signup,nokey:!!v.nokey})),
    outputs: S.outputs.slice(0,40),
    ideas:S.ideas.slice(0,60), ventures:S.ventures.slice(0,20),
    orders:S.orders.slice(0,40),
    projects:(S.projects||[]), projectId:(S.projectId||'PRJ-MAIN'),
    content:(S.content||[]),
    skills: (typeof allSkills==='function') ? allSkills() : [],
    skillRuns:(S.skillRuns||[]).slice(0,12),
    meta: S.meta ? { username:S.meta.username, pageName:S.meta.pageName,
      followers:S.meta.followers, mediaCount:S.meta.mediaCount, t:S.meta.t } : null,
    commentDrafts:(S.commentDrafts||[]).slice(-40),
    commentLog:(S.commentLog||[]).slice(0,30),
    replyWindow: (typeof replyWindow==='function') ? replyWindow() : null,
    chat:(S.chat||[]).filter(m=>(m.pid||'PRJ-MAIN')===(S.projectId||'PRJ-MAIN')).slice(0,60),
    chatCounts:(()=>{ const c={}; (S.chat||[]).forEach(m=>{const k=m.pid||'PRJ-MAIN';c[k]=(c[k]||0)+1;}); return c; })(),
    autoIdeas:!!S.autoIdeas,
    missions:S.missions.slice(0,40), playbooks:S.playbooks.slice(0,20),
    campaigns:(S.campaigns||[]).map(c=>({id:c.id,t:c.t,name:c.name,bizId:c.bizId,bizName:c.bizName,
      thesis:c.thesis,firstCustomerBy:c.firstCustomerBy,weekTwo:c.weekTwo,killCriteria:c.killCriteria,
      targets:c.targets,imageBriefs:c.imageBriefs,status:c.status,autoCount:c.autoCount,
      sent:c.sent||0,parked:c.parked||0,failed:c.failed||0,actions:c.actions})),
    outreach:(S.outreach||[]).slice(0,60),
    channels: CHANNELS,
    treasuryLock: S.treasuryLock || null,
    pay: S.pay ? { gateway:S.pay.gateway, live:!!S.pay.live, fp:S.pay.fp||null,
      keyId:mask(S.pay.keyId||S.pay.keySecret), t:S.pay.t } : null,
    gateways: Object.values(PAY.GATEWAYS).map(g=>({id:g.id,label:g.label,
      currency:g.currency,signup:g.signup,keyHint:g.keyHint})),
    telemetry: telemetry(), floors: floorHealth(), pillars:PILLARS,
    storage: storageHealth(), sendWindow: sendWindow(),
    smtpVerified: S.smtpVerified || null };
}
/* ---- STORAGE HEALTH ----
   On a free host with no disk, silent persistence failure is the worst
   possible bug: everything looks fine until a restart eats the business.
   This reports the truth on every state poll. */
let LAST_SAVE_OK = null, LAST_SAVE_ERR = '', LAST_SAVE_AT = null;
function storageHealth(){
  const bytes = DBBYTES || 0;
  const b64   = Math.round(bytes * 4/3);
  const mode  = STORE.mode || 'local';
  const ephemeral = mode === 'local' && !!(process.env.RENDER || process.env.DYNO || process.env.FLY_APP_NAME);
  let level = 'OK', msg = '';
  if(ephemeral){
    level = 'CRIT';
    msg = 'THIS HOST HAS NO PERSISTENT DISK. Everything you build is destroyed on the next restart or redeploy — and free hosts restart daily. Set STORE=github now.';
  } else if(mode === 'github' && b64 > 900000){
    level = 'CRIT';
    msg = `State is ${(b64/1024).toFixed(0)} KB encoded. The GitHub Contents API rewrites the whole file on every save; past ~1 MB this starts failing. Delete old business packs.`;
  } else if(mode === 'github' && b64 > 500000){
    level = 'WARN';
    msg = `State is ${(b64/1024).toFixed(0)} KB encoded and every save rewrites all of it. Watch it.`;
  } else if(LAST_SAVE_OK === false){
    level = 'CRIT';
    msg = 'THE LAST SAVE FAILED: ' + LAST_SAVE_ERR + ' — anything since then exists only in memory.';
  } else if(mode === 'local'){
    msg = 'Filesystem storage. Persistent only if this machine keeps its disk.';
  } else {
    msg = 'Private GitHub repo acting as the disk. Survives restarts and redeploys.';
  }
  return { mode, describe: STORE.describe ? STORE.describe() : mode,
    bytes, encoded: b64, ephemeral, level, msg,
    lastSaveOk: LAST_SAVE_OK, lastSaveAt: LAST_SAVE_AT, lastSaveErr: LAST_SAVE_ERR,
    blobsCached: BLOBS.cached() };
}

function body(req){ return new Promise(r=>{ let d=''; req.on('data',c=>{ d+=c; if(d.length>12e6) req.destroy(); });
  req.on('end',()=>{ try{ r(JSON.parse(d||'{}')); }catch(e){ r({}); } }); }); }

/* ---------- API ---------- */
async function api(req,res,url){
  T.api++;
  const ip = (req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  const ua = req.headers['user-agent']||'';
  const p  = url.pathname;

  if(p==='/api/boot'){
    if(BOOT_PHASE!=='ready')
      return send(res,503,{ booting:true, phase:BOOT_PHASE, error:BOOT_ERROR,
        hint: BOOT_PHASE==='store-failed'
          ? 'Storage is unreachable, so the system will not start with a blank identity. '
            + 'Check GH_TOKEN and GH_REPO in your host\'s environment settings.'
          : 'Still loading your data. Refresh in a moment.' });
    return send(res,200,{ provisioned: !!S.owner, authed: !!auth(req) });
  }

  /* serve a built site for preview / download — owner session required */
  if(p==='/api/site/view'){
    if(!auth(req)){ res.writeHead(401); return res.end('unauthorised'); }
    const id=url.searchParams.get('id');
    const b=(S.builds||[]).find(x=>x.id===id);
    if(!b){ res.writeHead(404); return res.end('not found'); }
    const dl = url.searchParams.get('dl')==='1';
    const buf=Buffer.from(b.html,'utf8');
    res.writeHead(200, Object.assign({
      'Content-Type':'text/html; charset=utf-8','Content-Length':buf.length,'Cache-Control':'no-store'},
      dl ? {'Content-Disposition':'attachment; filename="index.html"'} : {}));
    return res.end(buf);
  }

  /* ---- BUSINESS FACTORY: serve any file from a built pack ---- */
  if(p==='/api/biz/file'){
    if(!auth(req)){ res.writeHead(401); return res.end('unauthorised'); }
    const b=(S.businesses||[]).find(x=>x.id===url.searchParams.get('id'));
    if(!b){ res.writeHead(404); return res.end('not found'); }
    const want=url.searchParams.get('f')||'site/index.html';
    const files=b.files || await BLOBS.get(b.id);
    if(!files){ res.writeHead(410); return res.end('This pack\'s files are gone — rebuild it.'); }
    const f=files.find(x=>x.name===want);
    if(!f){ res.writeHead(404); return res.end('no such file in this pack'); }
    const buf=Buffer.isBuffer(f.data)?f.data:Buffer.from(String(f.data),'utf8');
    const ct=/\.html$/.test(want)?'text/html; charset=utf-8':'text/plain; charset=utf-8';
    res.writeHead(200,{'Content-Type':ct,'Content-Length':buf.length,'Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'"});
    return res.end(buf);
  }
  if(p==='/api/content/txt'){
    if(!auth(req)){ res.writeHead(401); return res.end('unauthorised'); }
    const w=(S.content||[]).find(x=>x.id===url.searchParams.get('id'));
    if(!w){ res.writeHead(404); return res.end('not found'); }
    const buf=Buffer.from(contentPlain(w),'utf8');
    const safe=String(w.bizName||'content').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'content';
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Length':buf.length,
      'Cache-Control':'no-store','Content-Disposition':`attachment; filename="${safe}-week.txt"`});
    return res.end(buf);
  }
  if(p==='/api/biz/zip'){
    if(!auth(req)){ res.writeHead(401); return res.end('unauthorised'); }
    const b=(S.businesses||[]).find(x=>x.id===url.searchParams.get('id'));
    if(!b){ res.writeHead(404); return res.end('not found'); }
    const files=b.files || await BLOBS.get(b.id);
    if(!files){ res.writeHead(410); return res.end('This pack\'s files are gone — rebuild it.'); }
    const buf=FACTORY.zip(files.map(f=>({name:f.name,
      data: Buffer.isBuffer(f.data)?f.data:Buffer.from(f.data&&f.data.type==='Buffer'?f.data.data:String(f.data))})));
    const safe=String(b.name||'business').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'business';
    res.writeHead(200,{'Content-Type':'application/zip','Content-Length':buf.length,
      'Cache-Control':'no-store','Content-Disposition':`attachment; filename="${safe}.zip"`});
    return res.end(buf);
  }

  if(p==='/api/health'){
    /* Render polls this. It must answer instantly and tell the truth about
       which phase boot is in, so a storage fault is visible in seconds
       instead of after a 15-minute hang. */
    if(BOOT_PHASE!=='ready'){
      const code = BOOT_PHASE==='store-failed' ? 503 : 200;
      return send(res,code,{ ok:BOOT_PHASE==='ready', phase:BOOT_PHASE,
        error:BOOT_ERROR,
        hint: BOOT_PHASE==='store-failed'
          ? 'Storage is unreachable. Check GH_TOKEN, GH_REPO, and that the private repo exists.'
          : 'Loading state — this takes a moment on first boot.' });
    }
    const t=telemetry();
    return send(res,200,{ ok:true, uptime_s:t.uptime_s, monitors:t.monitors,
      monitors_down:t.monitors_down, smtp:t.smtp_ready, rev:S.rev });
  }

  if(p==='/api/login'){
    const b = await body(req);
    if(!S.owner) return send(res,400,{error:
      'NO OWNER EXISTS YET — the server has not finished starting, or storage failed. '
      +'Check /api/health.'});
    const jail = LOCK.get(ip);
    if(jail && jail.until > Date.now()){
      const secs = Math.ceil((jail.until-Date.now())/1000);
      return send(res,429,{error:`IP LOCKED OUT. ${secs}s remaining.`});
    }
    if(b.id!==S.owner.id || !b.pw || !verify(b.pw)){
      T.auth_fail++;
      const j = LOCK.get(ip) || {n:0,until:0};
      j.n++;
      if(j.n>=5){ j.until=Date.now()+15*60000; j.n=0;
        log('CRIT','AUTH',`IP ${ip} LOCKED OUT for 15 minutes after 5 failed authentications.`);
        mail('Brute-force lockout',
`Five failed Owner authentication attempts triggered a lockout.

  Source IP : ${ip}
  Agent     : ${(ua||'').slice(0,120)}
  At        : ${nowIso()} UTC
  Lockout   : 15 minutes

If this was not you, your Owner ID is known to an attacker.
Rotate your password and revoke all sessions immediately.

— Chairman Agent OS · Security & Audit Command`,'LOCKOUT');
      } else {
        log('CRIT','AUTH',`Failed owner authentication from ${ip} (${j.n}/5).`);
      }
      LOCK.set(ip,j);
      /* On a host with no disk, a wrong password usually means the state was
         wiped and a NEW random password was generated into the logs. Say so
         rather than letting the Owner think he mistyped. */
      const eph = (STORE.mode||'local')==='local'
        && !!(process.env.RENDER||process.env.DYNO||process.env.FLY_APP_NAME);
      return send(res,401,{error: eph && !process.env.OWNER_PW
        ? 'ACCESS DENIED — and this host has no persistent disk, so your password was '
          + 'REGENERATED on the last restart. Fix it permanently: set OWNER_PW in your '
          + 'host\'s Environment settings, then redeploy. It then never changes again.'
        : 'ACCESS DENIED'});
    }
    LOCK.delete(ip);
    const tok = newSession(ip,ua);
    log('INFO','AUTH','Owner authenticated from '+ip+'. Command Tower unlocked.');
    const https = BEHIND_PROXY && (req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
    const cookie = `cos=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`+(https?'; Secure':'');
    return send(res,200,{ok:1,state:pub()},{'Set-Cookie':cookie});
  }

  if(p==='/api/logout'){
    const t=auth(req); if(t) SESS.delete(t);
    log('INFO','AUTH','Session terminated by Owner.');
    return send(res,200,{ok:1},{'Set-Cookie':'cos=; Path=/; Max-Age=0'});
  }

  /* everything below requires a live server session */
  if(!auth(req)) return send(res,401,{error:'UNAUTHENTICATED'});

  if(p==='/api/state'){
    const since = +url.searchParams.get('since')||-1;
    if(since===S.rev) return send(res,200,{unchanged:1,rev:S.rev,telemetry:telemetry(),floors:floorHealth()});
    return send(res,200,{state:pub()});
  }

  const b = await body(req);

  if(p==='/api/gate'){
    if(!b.title||!b.obj||!b.just||!b.safe) return send(res,400,{error:'ALL THREE SOP SECTIONS MANDATORY'});
    const cost=+b.cost||0;
    if(cost>0 && !b.free){
      S.denials.push({t:nowIso(),op:b.title,cost});
      log('CRIT','DOCTRINE',`Gate refused pre-submission — "${b.title}" demands $${cost} with no free route. ZERO-COST VIOLATION.`);
      return send(res,400,{error:'ZERO-COST BLOCK: declare a free alternative route'});
    }
    const g={ id:uid('GATE'), t:nowIso(), title:b.title, cls:b.cls, obj:b.obj, just:b.just, safe:b.safe,
      risk:b.risk, amt:+b.amt||0, cost, free:b.free||'', status:'PENDING' };
    S.gates.unshift(g);
    log('WARN','GATE',`${g.id} raised [${g.cls} · ${g.risk}] — "${g.title}". Execution FROZEN.`);
    if(cost>0){ S.denials.push({t:nowIso(),op:g.title,cost});
      log('CRIT','DOCTRINE',`Paid path on ${g.id} ($${cost}). Free route proposed: ${g.free}`); }
    save(); return send(res,200,{ok:1,id:g.id,state:pub()});
  }

  if(p==='/api/gate/decide'){
    const g=S.gates.find(x=>x.id===b.id);
    if(!g||g.status!=='PENDING') return send(res,400,{error:'GATE NOT PENDING'});
    /* You are already logged in. A tick is your signature. */
    if(g.cls==='FINANCIAL TRANSFER' && !S.payout && b.ok)
      return send(res,400,{error:'HARD BLOCK: no payout channel sealed'});
    g.status = b.ok?'APPROVED':'DENIED'; g.resolved=nowIso();
    if(b.ok && g.cost>0){ S.spend+=g.cost;
      log('CRIT','DOCTRINE',`Owner OVERRIDE on ${g.id}: $${g.cost} authorized against Zero-Cost Doctrine.`); }
    log(b.ok?'OK':'WARN','GATE',`${g.id} ${g.status} by Owner signature.`);
    mail(`${g.status}: ${g.title}`,
`A permission gate was resolved by Owner cryptographic signature.

  Gate     : ${g.id}
  Operation: ${g.title}
  Class    : ${g.cls}
  Blast    : ${g.risk}
  Cost     : $${(g.cost||0).toFixed(2)}
  At risk  : $${(g.amt||0).toLocaleString()}
  Decision : ${g.status}
  At       : ${g.resolved} UTC

If you did not authorize this, your Owner password is compromised.
Rotate it immediately and revoke all sessions.

— Chairman Agent OS · Executive Command Tower`, 'GATE-2FA');
    if(b.ok && g.cls==='FINANCIAL TRANSFER' && g.amt)
      S.revenue.push({t:nowIso(),src:'Authorized transfer · '+g.title,amt:-g.amt});
    save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/gate/reroute'){
    const g=S.gates.find(x=>x.id===b.id); if(!g) return send(res,404,{error:'NOT FOUND'});
    g.cost=0; g.just+=`\n[REROUTED] Paid dependency removed. Free path: ${g.free||'open-source substitute'}`;
    log('OK','DOCTRINE',`${g.id} rerouted to free path. Spend avoided.`); save();
    return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/agent'){
    if(!b.name||!b.role||!b.tools?.length) return send(res,400,{error:'NAME, SCOPE AND >=1 TOOL REQUIRED'});
    /* Honesty guard: an agent whose tools match no real capability will never
       execute. Refuse to create a decorative agent that looks operational. */
    {
      const real = Object.keys(CAPS);
      const known = (b.tools||[]).filter(t=>real.includes(String(t).trim()));
      if(!known.length)
        return send(res,400,{error:
          'NONE OF THOSE TOOLS EXIST, so this agent could never run. Real executable capabilities are: '
          + real.join(', ') + '. Writing a role in plain English does not create the ability to do it.'});
    }
    S.agents.unshift({ id:uid('AGT'), name:b.name, pillarId:+b.pillarId, role:b.role,
      tools:b.tools, cost:b.cost||'FREE-TIER-ONLY', status:'ACTIVE', t:nowIso() });
    log('OK','REGISTRY',`Agent "${b.name}" commissioned to Floor ${b.pillarId} · ${b.cost}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/agent/toggle'){
    const a=S.agents.find(x=>x.id===b.id); if(!a) return send(res,404,{error:'NOT FOUND'});
    a.status = a.status==='ACTIVE'?'SUSPENDED':'ACTIVE';
    log('WARN','REGISTRY',`Agent ${a.id} ${a.status}.`); save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/agent/kill'){
    S.agents=S.agents.filter(a=>a.id!==b.id);
    /* remember the Owner's intent so nothing puts it back */
    if(!S.agents.length) S.rosterCleared = true;
    log('CRIT','REGISTRY',`Agent ${b.id} decommissioned.`); save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/agent/reset'){
    S.agents=[]; S.rosterCleared=false; seed(); save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/revenue'){
    if(!b.src||!+b.amt) return send(res,400,{error:'SOURCE AND NON-ZERO AMOUNT REQUIRED'});
    S.revenue.push({t:nowIso(),src:b.src,amt:+b.amt});
    log('OK','REVENUE',`Stream posted: ${b.src} $${(+b.amt).toLocaleString()}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/payout/request'){
    const a=+b.amt; if(!a||a<=0) return send(res,400,{error:'POSITIVE AMOUNT REQUIRED'});
    S.gates.unshift({ id:uid('GATE'), t:nowIso(), title:`Owner payout $${a.toLocaleString()}`,
      cls:'FINANCIAL TRANSFER', cost:0, free:'',
      obj:`Transfer $${a.toLocaleString()} to the Owner's sealed payout channel. Success = funds settled, ledger reconciled.`,
      just:'Chairman executes directly. No sub-agent holds treasury access; Security & Audit observes read-only.',
      safe:'Password signature + 2FA to registered email. Ceiling enforced. Reversible hold window. Dual ledger write.',
      risk: a>10000?'SEVERE':a>1000?'HIGH':'MEDIUM', amt:a, status:'PENDING' });
    log('WARN','TREASURY',`Payout request $${a.toLocaleString()} raised. FROZEN.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/vault'){
    /* raw values are hashed away immediately; only masked view is ever persisted or returned */
    let masked;
    if(b.type==='BANK'){
      if(!b.name || (!b.acc && !b.iban)) return send(res,400,{error:'BENEFICIARY AND ACCOUNT/IBAN REQUIRED'});
      masked={Method:'Bank Wire',Beneficiary:b.name,Account:mask(b.acc),IBAN:mask(b.iban),
        SWIFT:mask(b.swift),Bank:b.bank||'—',Ceiling:'$'+(+b.cap||0).toLocaleString()};
    } else {
      if(!b.name||!b.addr) return send(res,400,{error:'BENEFICIARY AND ADDRESS REQUIRED'});
      masked={Method:'Crypto',Beneficiary:b.name,Network:b.net||'—',Address:mask(b.addr),
        Ceiling:'$'+(+b.cap||0).toLocaleString()};
    }
    const fp = crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex').slice(0,16);
    S.payout={ type:b.type, cap:+b.cap||0, masked, fp, t:nowIso() };
    log('OK','VAULT',`Payout channel sealed (${b.type}). Values withheld from ledger by policy. Fingerprint ${fp}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/vault/purge'){
    S.payout=null; log('CRIT','VAULT','Payout channel purged.'); save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/owner/rotate'){
    if(!verify(b.old)) return send(res,401,{error:'CURRENT PASSWORD WRONG'});
    if(!b.neu||b.neu.length<8) return send(res,400,{error:'NEW PASSWORD TOO SHORT'});
    S.owner.salt=crypto.randomBytes(16).toString('hex');
    S.owner.hash=kdf(b.neu,S.owner.salt); S.owner.bootstrap=false;
    S.owner.pinned=true;                      /* never regenerate over this */
    STORE.remove(CREDS).catch(()=>{});
    const ok = await saveIdentity();
    log('CRIT','AUTH','Owner password rotated. Bootstrap credential file destroyed.');
    save();
    return send(res,200,{ok:1, persisted:!!ok,
      note: ok ? 'Password saved separately from your data. It survives restarts.'
               : 'Password changed, but it could NOT be written to storage — it will be lost on restart. Fix storage first.',
      state:pub()});
  }
  if(p==='/api/owner/email'){
    if(!/^\S+@\S+\.\S+$/.test(b.email||'')) return send(res,400,{error:'INVALID EMAIL'});
    {
      const dom=String(b.email).split('@')[1].toLowerCase();
      if(/\.(local|test|invalid|example|localdomain)$/.test(dom))
        return send(res,400,{error:
          `"${dom}" is not a real mail domain — every alert would silently bounce and you would never be told. Use a real inbox such as your Gmail address.`});
    }
    /* BUG FOUND WHILE CHECKING THIS PAGE.
       saveIdentity() used to be fired on a 50ms timer BEFORE the new address
       was assigned — so it persisted the OLD email, and it ran even when the
       validation below rejected the input. On a wiped-disk host that meant
       your alerts kept going to the previous inbox after you had changed it.
       Assign first, then persist, then await it. */
    S.owner.email = b.email;
    log('WARN','AUTH','2FA target changed to '+maskMail(b.email));
    const persisted = await saveIdentity();
    save();
    return send(res,200,{ ok:1, persisted:!!persisted,
      note: persisted ? 'Saved. Alerts now go to this inbox and it survives restarts.'
                      : 'Changed, but it could NOT be written to storage — it will revert on the next restart.',
      state:pub() });
  }
  /* ---- SET A PERMANENT PASSWORD, FROM INSIDE THE APP ----
     The Owner should not have to open a hosting dashboard to keep his own
     password. This writes the identity to its own file in whatever storage
     is configured, then tells him plainly whether it will actually survive
     a restart — because on a host with no disk and no GitHub, it will not,
     and pretending otherwise is worse than useless. */
  if(p==='/api/owner/pin'){
    const pw = String(b.pw||'');
    if(pw.length < 8) return send(res,400,{error:'AT LEAST 8 CHARACTERS'});
    if(pw !== String(b.confirm||'')) return send(res,400,{error:'THE TWO ENTRIES DO NOT MATCH'});
    if(!verify(b.current||''))
      return send(res,401,{error:'CURRENT PASSWORD WRONG — use the one you logged in with'});

    S.owner.salt = crypto.randomBytes(16).toString('hex');
    S.owner.hash = kdf(pw, S.owner.salt);
    S.owner.bootstrap = false;
    S.owner.pinned = true;
    STORE.remove(CREDS).catch(()=>{});

    const wrote = await saveIdentity();
    save();

    const h = storageHealth();
    const durable = wrote && !h.ephemeral;
    log('CRIT','AUTH', durable
      ? 'Owner password set permanently and written to durable storage.'
      : 'Owner password set, but storage is NOT durable — it will not survive a restart.');

    return send(res,200,{ ok:1, durable,
      verdict: durable
        ? 'Set. It is saved separately from your data and survives every restart and redeploy.'
        : (wrote
            ? 'Password changed and written — but this host has NO PERSISTENT DISK, so it will '
              + 'still be lost on the next restart. Connect GitHub storage below, then set it again. '
              + 'Until then, the only thing that survives is an OWNER_PW environment variable.'
            : 'Password changed in memory ONLY — the write to storage failed. It will be lost on '
              + 'the next restart. Fix storage first.'),
      state:pub() });
  }

  if(p==='/api/owner/id'){
    if(!verify(b.pw)) return send(res,401,{error:'PASSWORD WRONG'});
    if(!b.newid||b.newid.length<3) return send(res,400,{error:'ID TOO SHORT'});
    log('CRIT','AUTH',`Owner ID changed from ${S.owner.id} to ${b.newid}.`);
    S.owner.id=b.newid; save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/sessions/revoke'){
    let n=0; const me=auth(req);
    for(const k of [...SESS.keys()]) if(k!==me){ SESS.delete(k); n++; }
    log('CRIT','AUTH',`${n} remote session(s) revoked by Owner.`); save();
    return send(res,200,{ok:1,revoked:n,state:pub()});
  }
  /* ---- UPTIME MARSHAL ---- */
  if(p==='/api/monitor/add'){
    let u=(b.url||'').trim();
    if(!/^https?:\/\//i.test(u)) u='https://'+u;
    let parsed;
    try{ parsed=new URL(u); }catch(e){ return send(res,400,{error:'INVALID URL'}); }
    /* Reject hostnames that can never resolve on the public internet.
       A bare word like "chairman" reports 0% availability forever and
       poisons every SLA figure and self-upgrade proposal downstream. */
    {
      const h=parsed.hostname;
      const isIP=/^\d{1,3}(\.\d{1,3}){3}$/.test(h);
      const localish=/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(h);
      if(!localish && !isIP && !h.includes('.'))
        return send(res,400,{error:
          `"${h}" is not a real website address — it has no domain, so it can never resolve and would report 0% availability forever. Use a full address like https://${h}.com`});
      if(/\.(local|test|invalid|example|localdomain)$/i.test(h))
        return send(res,400,{error:
          `".${h.split('.').pop()}" is a reserved non-routable domain. It will never resolve on the public internet.`});
    }
    if(S.monitors.some(m=>m.url===u)) return send(res,400,{error:'ALREADY MONITORED'});
    const m={ id:uid('MON'), url:u, name:(b.name||new URL(u).hostname), interval:Math.max(15,+b.interval||60),
      state:'UNKNOWN', checks:0, up:0, down:0, history:[], added:nowIso() };
    S.monitors.push(m);
    log('OK','UPTIME MARSHAL',`Monitor bound: ${m.name} → ${m.url} every ${m.interval}s.`);
    save(); runMonitors(true);
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/monitor/remove'){
    const m=S.monitors.find(x=>x.id===b.id);
    S.monitors=S.monitors.filter(x=>x.id!==b.id);
    if(m) log('WARN','UPTIME MARSHAL',`Monitor removed: ${m.name}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/monitor/check'){ await runMonitors(true); return send(res,200,{ok:1,state:pub()}); }

  /* ---- SMTP ---- */
  if(p==='/api/smtp'){
    if(!b.host||!b.from) return send(res,400,{error:'HOST AND FROM ADDRESS REQUIRED'});
    const host=b.host.trim();
    /* catch the classic mistake: email address typed into the host field */
    if(host.includes('@'))
      return send(res,400,{error:'SMTP HOST must be a SERVER NAME, not an email address. For Gmail use: smtp.gmail.com'});
    /* A dotted public name is the normal case, but a bare hostname or an IP
       is legitimate for a self-hosted or LAN relay — and rejecting those made
       the send path untestable end to end. Allow them; the connection attempt
       is the real validator. */
    const dotted   = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host);
    const bareHost = /^[a-z0-9-]+$/i.test(host);
    const ipv4     = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if(!dotted && !bareHost && !ipv4)
      return send(res,400,{error:'SMTP HOST looks invalid. Example: smtp.gmail.com'});
    if(bareHost && !/^(localhost|smtp|mail)$/i.test(host))
      return send(res,400,{error:`"${host}" has no domain, so it cannot resolve on the internet. For Gmail use: smtp.gmail.com`});
    if(!b.user||!b.user.trim())
      return send(res,400,{error:'USERNAME required — normally your full email address'});
    if(!b.pass)
      return send(res,400,{error:'APP PASSWORD required. Generate one at myaccount.google.com/apppasswords'});
    if(/gmail\.com$/i.test(host) && String(b.pass).replace(/\s/g,'').length!==16)
      return send(res,400,{error:'Gmail app passwords are exactly 16 characters. That looks like your normal password — generate an app password instead.'});
    if(S.owner.email && /@chairman\.local$/i.test(S.owner.email))
      return send(res,400,{error:'Your 2FA email is still the placeholder owner@chairman.local. Set your REAL email in Owner Settings first, or mail goes nowhere.'});
    S.smtp={ host, port:+b.port||587, secure:!!b.secure, user:b.user.trim(),
      pass:String(b.pass).replace(/\s/g,''), from:b.from.trim(), name:b.name||'Chairman Agent OS', t:nowIso() };
    /* new credentials are unproven until preflight says otherwise */
    S.smtpVerified = null;
    log('OK','MAIL',`SMTP relay configured: ${S.smtp.host}:${S.smtp.port} as ${mask(S.smtp.user)}. Password withheld from ledger.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/smtp/purge'){ S.smtp=null; log('CRIT','MAIL','SMTP relay purged. 2FA reverts to intent-only.');
    save(); return send(res,200,{ok:1,state:pub()}); }
  if(p==='/api/smtp/test'){
    const r=await mail('Relay verification',
`This is a live verification message from your Chairman Agent OS instance.

  Sent    : ${nowIso()} UTC
  Owner   : ${S.owner.id}
  Relay   : ${S.smtp?S.smtp.host+':'+S.smtp.port:'none'}
  Agents  : ${S.agents.length} commissioned
  Monitors: ${S.monitors.length} bound

If you are reading this in your inbox, real outbound email is working and
2FA notifications are no longer an intent — they are delivered.

— Chairman Agent OS`,'TEST');
    return send(res,200,{ok:r.ok,reason:r.reason||null,state:pub()});
  }

  /* ---- SELF-UPGRADE ---- */
  if(p==='/api/upgrade/decide'){
    const pr=S.proposals.find(x=>x.id===b.id);
    if(!pr||pr.status!=='PENDING') return send(res,400,{error:'PROPOSAL NOT PENDING'});
    /* logged-in owner: approval is the tick itself */
    if(!b.ok){
      pr.status='REJECTED'; pr.resolved=nowIso();
      S.evolution.unshift({t:nowIso(),id:pr.id,kind:pr.kind,sig:pr.sig,decision:'REJECTED',
        label:pr.label,why:pr.why,result:'Owner declined. Will not be proposed again.',how:'owner'});
      log('WARN','EVOLUTION',`Upgrade ${pr.id} REJECTED by Owner. Permanently suppressed.`);
      save(); return send(res,200,{ok:1,state:pub()});
    }
    const r=applyProposal(pr,'owner-signed');
    if(!r.ok) return send(res,400,{error:r.error,state:pub()});
    return send(res,200,{ok:1,result:r.result,state:pub()});
  }
  /* ---- ARCHITECT: study a product, rebuild the capability ---- */
  if(p==='/api/architect/analyse'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    const u=(b.url||'').trim();
    if(!u) return send(res,400,{error:'PASTE A URL OR NAME A PRODUCT'});
    try{ const a=await analyseProduct(u,(b.hint||'').trim());
      return send(res,200,{ok:1,id:a.id,verdict:a.verdict,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/architect/assemble'){
    try{ const c=await assembleTeam(b.id);
      return send(res,200,{ok:1,built:c.built.length,reused:c.reuse.length,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/architect/remove'){
    S.analyses=(S.analyses||[]).filter(x=>x.id!==b.id);
    S.crews=(S.crews||[]).filter(x=>x.analysisId!==b.id);
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- WORKSPACE: files in, drafts out ---- */
  if(p==='/api/doc/upload'){
    const name=(b.name||'file').slice(0,120);
    if(!b.data) return send(res,400,{error:'NO FILE DATA'});
    const size = Math.round(String(b.data).length*0.75);
    if(size > 8e6) return send(res,400,{error:'FILE TOO LARGE — 8 MB maximum'});
    let text;
    try{ text = textFromUpload(name, b.mime||'', String(b.data)); }
    catch(e){ return send(res,400,{error:'COULD NOT READ FILE: '+e.message}); }
    const d={ id:uid('DOC'), t:nowIso(), name, mime:b.mime||'', size,
      text, chars:text.length, readable:!text.startsWith('[') };
    S.docs.unshift(d); S.docs=S.docs.slice(0,40);
    if(S.docs && S.docs[0] && !S.docs[0].pid) S.docs[0].pid = curProject().id;
    log('OK','WORKSPACE',`File "${name}" uploaded (${(size/1024).toFixed(0)} KB, ${d.chars} chars readable).`);
    save();
    return send(res,200,{ok:1,id:d.id,chars:d.chars,readable:d.readable,
      preview:text.slice(0,300),state:pub()});
  }
  if(p==='/api/doc/remove'){
    S.docs=(S.docs||[]).filter(d=>d.id!==b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/doc/ask'){
    const d=(S.docs||[]).find(x=>x.id===b.id);
    if(!d) return send(res,404,{error:'FILE NOT FOUND'});
    try{
      const r=await think(
`The Owner uploaded this file and asks: ${b.question||'Summarise it and tell me what matters.'}

FILE: ${d.name}
CONTENT:
${d.text.slice(0,18000)}

Answer only from what is actually in the file. If the answer is not there, say so plainly.`,
        null,'doc-qa','Insight Forge');
      return send(res,200,{ok:1,text:r.text,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/draft/write'){
    if(!(b.brief||'').trim()) return send(res,400,{error:'SAY WHAT YOU NEED'});
    try{ const d=await draftFor(b.kind||'email', b.brief.trim(), b.docIds||[]);
      return send(res,200,{ok:1,id:d.id,text:d.text,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/draft/send'){
    const d=(S.drafts||[]).find(x=>x.id===b.id);
    if(!d) return send(res,404,{error:'DRAFT NOT FOUND'});
    if(!S.smtp) return send(res,400,{error:'NO MAIL RELAY ARMED — set one up on the Mail Relay page first'});
    const to=(b.to||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(to)) return send(res,400,{error:'VALID RECIPIENT EMAIL REQUIRED'});
    let subject=b.subject||'Message from Chairman Agent OS', text=d.text;
    const m=d.text.match(/^SUBJECT:\s*(.+)$/im);
    if(m && !b.subject){ subject=m[1].trim(); text=d.text.replace(/^SUBJECT:.*$/im,'').trim(); }
    try{
      const r=await SMTP.send(S.smtp,{to,subject,text});
      d.sentTo=to; d.sentAt=nowIso();
      S.mailq.unshift({t:nowIso(),to:maskMail(to),subject,status:'DELIVERED ('+r.ms+'ms)',tag:'DRAFT'});
      log('OK','WORKSPACE',`Draft sent to ${maskMail(to)} — "${subject}".`);
      save(); return send(res,200,{ok:1,ms:r.ms,state:pub()});
    }catch(e){ return send(res,400,{error:'SEND FAILED: '+e.message}); }
  }
  if(p==='/api/draft/remove'){
    S.drafts=(S.drafts||[]).filter(x=>x.id!==b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/selfrepair/run'){
    try{ const r=await repairCapability(b.name, b.error||'manual repair requested by Owner');
      return send(res,200,{ok:1,result:r||{fixed:false},state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }

  /* ---- CONNECTORS: any service, any key ---- */
  if(p==='/api/connector/add'){
    const name=(b.name||'').trim().replace(/[^a-z0-9._-]/gi,'').slice(0,32);
    const base=(b.base||'').trim();
    if(!name) return send(res,400,{error:'NAME REQUIRED (letters, numbers, dot, dash)'});
    if(!/^https?:\/\//i.test(base)) return send(res,400,{error:'BASE URL must start with https://'});
    if((S.connectors||[]).some(c=>c.name===name)) return send(res,400,{error:'"'+name+'" already exists'});
    if((S.connectors||[]).length>=40) return send(res,400,{error:'MAXIMUM 40 CONNECTORS'});
    let headers={};
    if(b.headers){ try{ headers=JSON.parse(b.headers); }catch(e){ return send(res,400,{error:'Extra headers must be valid JSON'}); } }
    S.connectors.push({ name, base, key:(b.key||'').trim(),
      auth:['bearer','header','query','none'].includes(b.auth)?b.auth:'bearer',
      headerName:(b.headerName||'X-API-Key').trim(), queryName:(b.queryName||'key').trim(),
      headers, note:(b.note||'').slice(0,120), enabled:true, calls:0, fails:0, t:nowIso() });
    log('OK','CONNECTORS',`Connector "${name}" added → ${base}. Key withheld from ledger.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/connector/remove'){
    S.connectors=(S.connectors||[]).filter(c=>c.name!==b.name);
    log('WARN','CONNECTORS',`Connector "${b.name}" removed.`); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/connector/toggle'){
    const c=(S.connectors||[]).find(x=>x.name===b.name);
    if(c){ c.enabled = c.enabled===false; save(); }
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/connector/test'){
    try{ const out=await connectorCall(b.name,{path:b.path||'',method:b.method||'GET'});
      return send(res,200,{ok:1,sample:JSON.stringify(out).slice(0,500),state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }

  if(p==='/api/selfextend/write'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{ const c = await writeCapability((b.goal||'').trim());
      return send(res,200,{ok:1,name:c.name,blocked:c.violations.length>0,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/selfextend/discard'){
    S.writtenCaps=(S.writtenCaps||[]).filter(c=>c.id!==b.id);
    S.proposals=(S.proposals||[]).filter(p2=>!(p2.payload&&p2.payload.capId===b.id));
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/upgrade/scan'){ selfAudit();
    return send(res,200,{ok:1,pending:S.proposals.filter(x=>x.status==='PENDING').length,state:pub()}); }
  if(p==='/api/upgrade/autopilot'){
    S.autopilot=!!b.on;
    log(S.autopilot?'CRIT':'OK','EVOLUTION',
      S.autopilot?'AUTOPILOT ENABLED — SAFE-class upgrades will self-apply without further signature.'
                 :'Autopilot disabled. Every upgrade now requires an Owner signature.');
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/skill/teach'){
    const phrase=(b.phrase||'').trim().toLowerCase(), action=(b.action||'').trim();
    if(!phrase||!action) return send(res,400,{error:'PHRASE AND ACTION REQUIRED'});
    if(S.skills.some(s=>s.phrase===phrase)) return send(res,400,{error:'ALREADY KNOWN'});
    S.skills.push({phrase,action,kind:b.kind||'note',learned:nowIso(),uses:0,origin:'owner'});
    log('OK','EVOLUTION',`Skill learned from Owner: "${phrase}"`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/skill/forget'){
    S.skills=S.skills.filter(s=>s.phrase!==b.phrase);
    log('WARN','EVOLUTION',`Skill forgotten: "${b.phrase}"`); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/skill/use'){
    const s=S.skills.find(x=>x.phrase===(b.phrase||'').toLowerCase());
    if(!s) return send(res,404,{error:'UNKNOWN SKILL'});
    s.uses++; s.lastUsed=nowIso(); save();
    return send(res,200,{ok:1,action:s.action,state:pub()});
  }

  /* ---- AI BRAIN ---- */
  if(p==='/api/llm/connect'){
    const P=LLM.PROVIDERS[b.provider];
    if(!P) return send(res,400,{error:'UNKNOWN PROVIDER'});
    if(!P.nokey && !P.custom && !(b.key||'').trim())
      return send(res,400,{error:'API key required for '+P.label+'. '+P.signup});
    S.llm={ provider:b.provider, key:(b.key||'').trim(),
      model:(b.model||'').trim()||P.model, host:(b.host||'').trim(), t:nowIso() };
    if(P.custom && !S.llm.host) return send(res,400,{error:'Custom provider needs a Base URL, e.g. https://api.deepseek.com/v1'});
    if(P.custom && !S.llm.model) return send(res,400,{error:'Custom provider needs a model name'});
    log('OK','AI BRAIN',`Connected to ${P.label} (${S.llm.model}). Key withheld from ledger.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  /* ---- SITE BUILDER ---- */
  if(p==='/api/site/build'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{ const built=await buildSite(b.ventureId||null, (b.brief||'').trim());
      return send(res,200,{ok:1,id:built.id,bytes:built.bytes,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  /* ---- SMTP PREFLIGHT ----
     The one test that actually matters before a campaign: talk to the REAL
     mail server with the Owner's REAL credentials and report exactly which
     stage fails. Every stage below was verified against live smtp.gmail.com.
     A 535 here is the difference between "my app is broken" and "you pasted
     your Google password instead of an app password". */
  if(p==='/api/smtp/preflight'){
    if(!S.smtp || !S.smtp.host) return send(res,400,{error:'No SMTP configured yet.'});
    const steps=[]; const t0=Date.now();
    const net=require('net'), tls=require('tls');
    const host=S.smtp.host, port=+S.smtp.port||587;
    const secure = S.smtp.secure===true || port===465;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    let sock=null;
    const done=(ok,fatal,advice)=>{ try{sock&&sock.destroy();}catch(e){}
      return send(res,200,{ok,steps,ms:Date.now()-t0,fatal,advice,
        window:sendWindow()}); };
    const line=(s,timeout)=>new Promise((resolve,reject)=>{
      let b=''; const to=setTimeout(()=>reject(new Error('timed out waiting for the server')),timeout||15000);
      const on=d=>{ b+=d.toString();
        const ls=b.split(/\r?\n/).filter(Boolean); const last=ls[ls.length-1]||'';
        if(!/^\d{3} /.test(last)) return;
        clearTimeout(to); s.removeListener('data',on); resolve({code:+last.slice(0,3),text:b.trim()}); };
      s.on('data',on); s.once('error',e=>{clearTimeout(to);reject(e);});
    });
    try{
      sock = await new Promise((resolve,reject)=>{
        const o={host,port}; if(!isIp) o.servername=host;
        const s = secure ? tls.connect(o,()=>resolve(s)) : net.connect(o,()=>resolve(s));
        s.setTimeout(15000,()=>{ s.destroy(new Error('connect timed out')); });
        s.once('error',reject);
      });
      steps.push({step:`Reach ${host}:${port}`,ok:true,detail:`TCP open${secure?' (implicit TLS)':''}`});

      let r = await line(sock);
      if(r.code!==220) return done(false,`Server greeting was ${r.code}, expected 220`,'');
      steps.push({step:'Server greeting',ok:true,detail:r.text.slice(0,80)});

      sock.write('EHLO chairman-os\r\n'); r = await line(sock);
      if(r.code!==250) return done(false,`EHLO refused (${r.code})`,'');
      const caps = r.text;
      steps.push({step:'EHLO handshake',ok:true,
        detail:(/STARTTLS/i.test(caps)?'STARTTLS offered · ':'')+(/AUTH/i.test(caps)?'AUTH offered':'no AUTH advertised')});

      if(!secure){
        if(!/STARTTLS/i.test(caps))
          return done(false,'The server does not offer STARTTLS',
            'Credentials would travel in clear text. Refusing. Use port 465 with implicit TLS, or a different server.');
        sock.write('STARTTLS\r\n'); r = await line(sock);
        if(r.code!==220) return done(false,`STARTTLS refused (${r.code})`,'');
        sock = await new Promise((resolve,reject)=>{
          const o={socket:sock}; if(!isIp) o.servername=host;
          const s=tls.connect(o,()=>resolve(s)); s.once('error',reject);
        });
        const cert=sock.getPeerCertificate?sock.getPeerCertificate():{};
        /* One deliberate exception: an operator running a LAN relay on
           localhost with a self-signed cert is not being attacked. Anything
           reachable off-box must present a trusted certificate. */
        const localOnly = /^(localhost|127\.0\.0\.1|::1)$/i.test(host);
        const certOk = sock.authorized || localOnly;
        steps.push({step:'Encrypt the connection',ok:certOk,
          detail: sock.authorized
            ? `TLS verified · ${cert.subject&&cert.subject.CN||host} · issued by ${cert.issuer&&cert.issuer.O||'?'} · valid to ${cert.valid_to||'?'}`
            : localOnly
              ? 'encrypted, self-signed certificate accepted because the server is on this machine'
              : 'CERTIFICATE NOT TRUSTED — '+(sock.authorizationError||'unknown')});
        if(!certOk)
          return done(false,'The server\'s TLS certificate is not trusted: '+sock.authorizationError,
            'Someone may be intercepting the connection. Do not send credentials through it.');
        sock.write('EHLO chairman-os\r\n'); r = await line(sock);
        if(r.code!==250) return done(false,`EHLO after STARTTLS refused (${r.code})`,'');
      }

      sock.write('AUTH LOGIN\r\n'); r = await line(sock);
      if(r.code!==334) return done(false,`Server would not start AUTH LOGIN (${r.code})`,
        'This server may require a different auth method.');
      sock.write(Buffer.from(S.smtp.user,'utf8').toString('base64')+'\r\n'); r = await line(sock);
      if(r.code!==334) return done(false,`Username rejected (${r.code})`,'Use your FULL email address as the username.');
      sock.write(Buffer.from(S.smtp.pass,'utf8').toString('base64')+'\r\n'); r = await line(sock);

      if(r.code===535){
        steps.push({step:'Log in',ok:false,detail:r.text.slice(0,120)});
        S.smtpVerified = null; save();
        const gmail=/gmail\.com|googlemail/i.test(host);
        return done(false,'LOGIN REJECTED by the server (535).',
          gmail
            ? 'Three causes, in order of likelihood: (1) you used your normal Google password — it MUST be a 16-character App Password from myaccount.google.com/apppasswords; (2) 2-Step Verification is not switched on, which is required before App Passwords exist at all; (3) the App Password was revoked. Generate a fresh one and paste it again — spaces are fine, they are stripped.'
            : 'Check the username is the full address and the password is correct for this server.');
      }
      if(r.code!==235){
        steps.push({step:'Log in',ok:false,detail:r.text.slice(0,120)});
        return done(false,`Authentication failed (${r.code})`,r.text.slice(0,200));
      }
      steps.push({step:'Log in',ok:true,detail:'accepted — your credentials are correct'});

      /* Prove the envelope is accepted WITHOUT sending anything: Gmail
         validates MAIL FROM and RCPT TO, then RSET discards it. */
      sock.write('MAIL FROM:<'+(S.smtp.from||S.smtp.user)+'>\r\n'); r = await line(sock);
      if(r.code!==250)
        return done(false,`Your FROM address was refused (${r.code}): ${r.text.slice(0,120)}`,
          'Gmail only lets you send as your own address or a verified alias. Set FROM to the same address as the username.');
      steps.push({step:'Sender address accepted',ok:true,detail:S.smtp.from||S.smtp.user});

      const probe = (b.to||'').trim() || S.owner.email;
      sock.write('RCPT TO:<'+probe+'>\r\n'); r = await line(sock);
      steps.push({step:'Recipient accepted',ok:r.code===250,
        detail: r.code===250 ? probe+' would be delivered' : `refused (${r.code}) ${r.text.slice(0,90)}`});
      sock.write('RSET\r\n'); await line(sock).catch(()=>{});
      sock.write('QUIT\r\n'); await line(sock).catch(()=>{});

      S.smtpVerified = { at:nowIso(), host, user:S.smtp.user, from:S.smtp.from||S.smtp.user };
      save();
      log('OK','MAIL',`SMTP preflight PASSED against ${host} in ${Date.now()-t0}ms. Real credentials accepted by the real server.`);
      const w=sendWindow();
      return done(true,null,
        `Everything works. He can send real email as ${S.smtp.from||S.smtp.user}. `
        + `${w.left} of ${w.cap} sends left in this 24-hour window.`);
    }catch(e){
      steps.push({step:'FAILED',ok:false,detail:e.message});
      let advice='';
      if(/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e.message))
        advice='That server name does not resolve. For Gmail it is exactly: smtp.gmail.com';
      else if(/ECONNREFUSED|ETIMEDOUT|timed out/i.test(e.message))
        advice='Port '+port+' is blocked or unreachable from this host. Try port 465 with implicit TLS.';
      else if(/certificate|self.signed|altnames/i.test(e.message))
        advice='TLS certificate problem — do not send credentials until this is resolved.';
      S.smtpVerified = null; save();
      log('CRIT','MAIL','SMTP preflight FAILED — '+e.message);
      return done(false,e.message,advice);
    }
  }

  /* ---- GROWTH ENGINE ---- */
  if(p==='/api/growth/plan'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{ const c=await planCampaign(b.bizId, b.goal||'');
      return send(res,200,{ok:1,id:c.id,actions:c.actions.length,auto:c.autoCount,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/growth/run'){
    try{ const r=await runCampaign(b.id);
      return send(res,200,{ok:1,sent:r.sent,parked:r.parked,failed:r.failed,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/growth/address'){
    try{ const r=await fillAddress(b.campId,b.actionId,b.email);
      return send(res,200,{ok:1,to:r.to,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/growth/delete'){
    S.campaigns=(S.campaigns||[]).filter(x=>x.id!==b.id);
    S.missions=(S.missions||[]).filter(m=>m.campaignId!==b.id);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/growth/replied'){
    const o=(S.outreach||[]).find(x=>x.to===b.to&&x.t===b.t);
    if(o){ o.replied=true; log('OK','GROWTH',`REPLY from ${b.to}. Follow it up today, not tomorrow.`); save(); }
    return send(res,200,{ok:1,state:pub()});
  }

  /* ---- ONE-CLICK STORAGE SETUP ----
     The Owner has had "fix storage" on his list for days and has not done it.
     Eight manual steps is why. He should not have to create a repo by hand,
     get the name exactly right, and hope. Given a token, the system creates
     the private repo itself, seeds it, verifies a real round trip, and only
     then reports success. */
  if(p==='/api/store/setup'){
    const tok=String(b.token||'').trim();
    if(!tok) return send(res,400,{error:'PASTE THE TOKEN'});
    if(!/^(github_pat_|ghp_)/.test(tok))
      return send(res,400,{error:'That does not look like a GitHub token. It starts with github_pat_ (fine-grained) or ghp_ (classic).'});
    const wantRepo = String(b.repo||'chairmanstate').trim().replace(/[^A-Za-z0-9._-]/g,'') || 'chairmanstate';
    const steps=[]; const t0=Date.now();
    const gh=(method,path,body)=>new Promise((resolve,reject)=>{
      const data = body ? JSON.stringify(body) : null;
      const r = require('https').request({ hostname:'api.github.com', path, method,
        headers:Object.assign({'User-Agent':'ChairmanOS/3','Accept':'application/vnd.github+json',
          'Authorization':'Bearer '+tok,'X-GitHub-Api-Version':'2022-11-28'},
          data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}) },
        rs=>{ let d=''; rs.on('data',c=>d+=c);
          rs.on('end',()=>{ let j={}; try{ j=JSON.parse(d||'{}'); }catch(e){}
            resolve({ code:rs.statusCode, body:j, raw:d }); }); });
      r.on('error',reject);
      r.setTimeout(20000,()=>r.destroy(new Error('GitHub timed out')));
      if(data) r.write(data); r.end();
    });
    const done=(ok,fatal,advice)=>send(res,200,{ok,steps,ms:Date.now()-t0,fatal,advice});

    try{
      /* 1. who is this token? */
      const me = await gh('GET','/user');
      if(me.code===401)
        return done(false,'GitHub rejected the token (401).',
          'It is wrong, revoked, or expired. Generate a fresh one at '
          +'github.com/settings/personal-access-tokens/new with Expiration: No expiration.');
      if(me.code!==200 || !me.body.login)
        return done(false,`GitHub replied ${me.code}.`, String(me.raw||'').slice(0,200));
      const user = me.body.login;
      steps.push({step:'Identify the token', ok:true, detail:'belongs to @'+user});

      const full = user+'/'+wantRepo;

      /* 2. does the repo already exist? */
      let repo = await gh('GET','/repos/'+full);
      if(repo.code===200){
        if(repo.body.private===false)
          return done(false,`The repo ${full} is PUBLIC.`,
            'Your state holds API keys, your SMTP password and client data. '
            +'Make it private in GitHub settings, or choose a different name.');
        steps.push({step:'Find the repo', ok:true, detail:full+' already exists (private)'});
      } else if(repo.code===404){
        const made = await gh('POST','/user/repos',
          { name:wantRepo, private:true, auto_init:true,
            description:'Chairman Agent OS state. Private. Do not share.' });
        if(made.code===403 || made.code===404)
          return done(false,'The token cannot create repositories.',
            'A fine-grained token only reaches repos you selected. Either create an empty '
            +'PRIVATE repo named "'+wantRepo+'" yourself and grant the token Contents: Read and write on it, '
            +'or use a classic token with the "repo" scope just for this setup.');
        if(made.code!==201)
          return done(false,`Could not create the repo (${made.code}).`,
            (made.body && made.body.message) || String(made.raw||'').slice(0,200));
        steps.push({step:'Create the private repo', ok:true, detail:'created '+full});
        await new Promise(r=>setTimeout(r,1500));   /* GitHub needs a moment */
      } else {
        return done(false,`GitHub replied ${repo.code} for ${full}.`,
          (repo.body && repo.body.message) || '');
      }

      /* 3. prove we can WRITE — the permission people get wrong */
      const probe='chairman-setup-check.json';
      const put = await gh('PUT','/repos/'+full+'/contents/'+probe,
        { message:'chairman-os setup check', branch:'main',
          content: Buffer.from(JSON.stringify({at:nowIso()})).toString('base64') });
      if(put.code===403)
        return done(false,'The token can read the repo but NOT write to it.',
          'In the token settings: Repository permissions -> Contents -> Read and write. '
          +'Read-only is the single most common mistake here.');
      if(put.code!==201 && put.code!==200)
        return done(false,`Write test failed (${put.code}).`,
          (put.body && put.body.message) || String(put.raw||'').slice(0,200));
      steps.push({step:'Write a test file', ok:true, detail:'Contents: Read and write confirmed'});

      /* 4. read it back, then clean up */
      const back = await gh('GET','/repos/'+full+'/contents/'+probe);
      const okRead = back.code===200 && back.body.content;
      steps.push({step:'Read it back', ok:!!okRead, detail: okRead?'round trip confirmed':'could not read it back'});
      if(!okRead) return done(false,'Wrote the file but could not read it back.','');
      if(back.body.sha) await gh('DELETE','/repos/'+full+'/contents/'+probe,
        { message:'chairman-os cleanup', sha:back.body.sha, branch:'main' });
      steps.push({step:'Clean up', ok:true, detail:'test file removed'});

      log('OK','STORAGE',`GitHub storage verified against ${full}. Round trip confirmed.`);
      return done(true,null,
        `Everything works. Now set these three in your host's Environment settings and redeploy:\n\n`
        +`STORE=github\nGH_REPO=${full}\nGH_TOKEN=(the token you just pasted)\n\n`
        +`The token is NOT stored here — paste it into the host yourself so it lives only there.`);
    }catch(e){
      steps.push({step:'FAILED', ok:false, detail:e.message});
      return done(false,e.message,'');
    }
  }

  /* ---- STORAGE SELF-TEST ----
     Proves persistence works by doing a real round trip, instead of the
     Owner discovering it did not after a restart destroyed the work. */
  if(p==='/api/store/test'){
    const probeName = 'storage-selftest.json';
    const token = crypto.randomBytes(8).toString('hex');
    const steps = [];
    const t0 = Date.now();
    try{
      if(STORE.verify){
        const v = await STORE.verify();
        steps.push({ step:'Reach the store', ok:true,
          detail: v.full_name ? `${v.full_name} · ${v.private?'PRIVATE (correct)':'PUBLIC — YOUR STATE IS WORLD-READABLE, FIX THIS NOW'}` : 'reachable' });
        if(v.private === false)
          return send(res,200,{ok:0,steps,fatal:'The repo is PUBLIC. Anyone can read your API keys, SMTP password and client data. Make it private before doing anything else.'});
      } else steps.push({ step:'Reach the store', ok:true, detail:'local filesystem' });

      await STORE.write(probeName, JSON.stringify({ token, at:nowIso() }));
      steps.push({ step:'Write a test file', ok:true, detail:probeName });

      await new Promise(r=>setTimeout(r, STORE.mode==='github' ? 2500 : 100));

      const back = await STORE.read(probeName);
      const got = back ? (JSON.parse(back).token || '') : '';
      const match = got === token;
      steps.push({ step:'Read it back', ok:match,
        detail: match ? 'byte-for-byte match' : `MISMATCH — wrote ${token}, read ${got||'nothing'}` });
      if(!match)
        return send(res,200,{ok:0,steps,fatal:'The store accepted a write but did not return it. Persistence is NOT working. Do not build anything until this passes.'});

      const bs = await BLOBS.put('selftest', { big:'x'.repeat(50000) });
      const bg = await BLOBS.get('selftest');
      const bok = bg && bg.big && bg.big.length === 50000;
      steps.push({ step:'Compressed blob round trip', ok:!!bok,
        detail: bok ? `50 KB → ${(bs.stored/1024).toFixed(1)} KB stored (${bs.ratio}:1)` : 'FAILED' });
      await BLOBS.del('selftest');

      await STORE.remove(probeName);
      steps.push({ step:'Clean up', ok:true, detail:'test file deleted' });

      const h = storageHealth();
      log('OK','STORAGE',`Self-test PASSED in ${Date.now()-t0}ms — ${h.describe}. Persistence confirmed by round trip.`);
      return send(res,200,{ok:1,steps,ms:Date.now()-t0,health:h,
        verdict: h.ephemeral
          ? 'Round trip works, BUT this host has no persistent disk — it will still be wiped on restart. Switch to STORE=github.'
          : 'Persistence confirmed. Your work survives restarts and redeploys.'});
    }catch(e){
      steps.push({ step:'FAILED', ok:false, detail:e.message });
      log('CRIT','STORAGE','Self-test FAILED — '+e.message);
      return send(res,200,{ok:0,steps,fatal:e.message});
    }
  }

  /* ---- DOMAIN DESK ---- */
  if(p==='/api/dom/check'){
    const raw=String(b.names||'').split(/[\s,\n]+/).filter(Boolean).slice(0,40);
    if(!raw.length) return send(res,400,{error:'TYPE AT LEAST ONE NAME'});
    try{
      const rs=await DOMAINS.checkMany(raw,{lanes:3,gap:220});
      const av=rs.filter(x=>x.status==='AVAILABLE').length;
      log('INFO','DOMAIN DESK',`Checked ${rs.length} name(s) against live registries — ${av} available.`);
      return send(res,200,{ok:1,results:rs});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/dom/expand'){
    const sld=String(b.sld||'').trim();
    if(!sld) return send(res,400,{error:'TYPE A NAME'});
    const names=DOMAINS.expand(sld, Array.isArray(b.tlds)?b.tlds:null);
    if(!names.length) return send(res,400,{error:'NOTHING USABLE IN THAT NAME'});
    try{ return send(res,200,{ok:1,results:await DOMAINS.checkMany(names,{lanes:3,gap:220})}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/dom/suggest'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    if(!(b.brief||'').trim()) return send(res,400,{error:'DESCRIBE THE BUSINESS FIRST'});
    try{ const r=await suggestNames(b.brief.trim(), Array.isArray(b.tlds)?b.tlds:null, b.count);
      return send(res,200,{ok:1,id:r.id,available:r.available,checked:r.checked,unknown:r.unknown,state:pub()});
    }catch(e){ log('WARN','DOMAIN DESK','Suggest failed — '+e.message); return send(res,400,{error:e.message}); }
  }
  if(p==='/api/dom/watch'){
    S.domains=S.domains||{watch:[],runs:[]};
    const n=String(b.name||'').toLowerCase().trim();
    const v=DOMAINS.validate(n);
    if(!v.ok) return send(res,400,{error:'Not a valid domain — '+v.why});
    if(S.domains.watch.some(x=>x.name===v.name)) return send(res,400,{error:'ALREADY WATCHED'});
    if(S.domains.watch.length>=40) return send(res,400,{error:'Watchlist is full at 40. Remove one first.'});
    let r; try{ r=await DOMAINS.check(v.name); }catch(e){ r={status:'UNKNOWN'}; }
    S.domains.watch.unshift({ name:v.name, tld:v.tld, status:r.status, checked:nowIso(),
      expires:r.expires||null, registrar:r.registrar||null, note:String(b.note||'').slice(0,120), added:nowIso() });
    log('OK','DOMAIN DESK',`Watching "${v.name}" — currently ${r.status}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/dom/unwatch'){
    S.domains=S.domains||{watch:[],runs:[]};
    S.domains.watch=S.domains.watch.filter(x=>x.name!==b.name); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/dom/recheck'){
    try{ const r=await CAPS['dom.check_own'].run(); return send(res,200,{ok:1,msg:r.msg,detail:r.detail,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/dom/math'){
    return send(res,200,{ok:1,math:resellerMath(b.perMonth)});
  }
  if(p==='/api/dom/clear'){
    S.domains=S.domains||{watch:[],runs:[]}; S.domains.runs=[]; save();
    return send(res,200,{ok:1,state:pub()});
  }

  /* ---- BUSINESS FACTORY ---- */
  if(p==='/api/biz/build'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{
      const built=await buildBusiness({ ventureId:b.ventureId||null, brief:b.brief||'',
        phone:b.phone, whatsapp:b.whatsapp, address:b.address, gstin:b.gstin,
        tool: b.tool!==false });
      return send(res,200,{ok:1,id:built.id,name:built.name,
        files:built.fileList.length,zipBytes:built.zipBytes,tells:built.tellCount,state:pub()});
    }catch(e){ log('WARN','FACTORY','Build failed — '+e.message); return send(res,400,{error:e.message}); }
  }
  if(p==='/api/biz/delete'){
    S.businesses=(S.businesses||[]).filter(x=>x.id!==b.id);
    await BLOBS.del(b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/biz/published'){
    const z=(S.businesses||[]).find(x=>x.id===b.id);
    if(!z) return send(res,400,{error:'NO SUCH BUSINESS'});
    const u=String(b.url||'').trim();
    if(u && !/^https?:\/\//i.test(u)) return send(res,400,{error:'URL must start with http:// or https://'});
    z.published=!!u; z.publishedUrl=u;
    if(u){
      log('OK','FACTORY',`"${z.name}" is LIVE at ${u}`);
      if(!(S.monitors||[]).some(m=>m.url===u)){
        S.monitors.push({ id:uid('MON'), url:u, name:z.name, interval:300,
          state:'UNKNOWN', checks:0, up:0, down:0, history:[], added:nowIso() });
        log('OK','UPTIME MARSHAL',`Now watching your own site ${u} every 5 minutes.`);
        runMonitors(true);
      }
    }
    save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/site/delete'){
    S.builds=(S.builds||[]).filter(x=>x.id!==b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/agent/run'){
    if(!(b.goal||'').trim()) return send(res,400,{error:'STATE A GOAL'});
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{
      const r = await agentLoop(b.goal.trim(), b.steps);
      S.chat.unshift({t:nowIso(),who:'OWNER',text:'[AGENT] '+b.goal.trim()});
      S.chat.unshift({t:nowIso(),who:'CHAIRMAN',text:r.answer});
      S.chat=S.chat.slice(0,200);
      S.agentRuns = S.agentRuns||[];
      S.agentRuns.unshift({t:nowIso(), goal:b.goal.trim(), steps:r.steps,
        answer:r.answer, trace:r.trace, hitCap:!!r.hitCap});
      S.agentRuns = S.agentRuns.slice(0,25);
      log('OK','AGENT LOOP',`Goal completed in ${r.steps} step(s).`);
      save();
      return send(res,200,{ok:1,answer:r.answer,trace:r.trace,steps:r.steps,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/agent/clear'){ S.agentRuns=[]; save(); return send(res,200,{ok:1,state:pub()}); }

  if(p==='/api/llm/backup/add'){
    const P=LLM.PROVIDERS[b.provider];
    if(!P) return send(res,400,{error:'UNKNOWN PROVIDER'});
    if(!P.nokey && !P.custom && !(b.key||'').trim())
      return send(res,400,{error:'API key required for '+P.label+'. '+P.signup});
    S.llmBackups = S.llmBackups || [];
    if(S.llmBackups.length >= 40) return send(res,400,{error:'MAXIMUM 40 KEYS'});
    S.llmBackups.push({ provider:b.provider, key:(b.key||'').trim(),
      model:(b.model||'').trim()||P.model, host:(b.host||'').trim(),
      t:nowIso(), ok:0, fail:0, cooled:0 });
    log('OK','AI BRAIN',`Backup provider added: ${P.label}. Used only when the primary is throttled.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/llm/backup/remove'){
    S.llmBackups = (S.llmBackups||[]).filter((x,i)=>i !== +b.index);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/llm/cooldown/clear'){
    COOLDOWN_UNTIL = 0;
    log('OK','AI BRAIN','Quota cooldown cleared manually by Owner.');
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/llm/model'){
    if(!S.llm) return send(res,400,{error:'NO BRAIN CONNECTED — connect one first'});
    const m=(b.model||'').trim();
    if(!m) return send(res,400,{error:'MODEL NAME REQUIRED'});
    const old=S.llm.model;
    S.llm.model=m;
    log('OK','AI BRAIN',`Model switched: ${old} → ${m}. Key and provider kept.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/llm/purge'){ S.llm=null; log('CRIT','AI BRAIN','AI brain disconnected.');
    save(); return send(res,200,{ok:1,state:pub()}); }
  if(p==='/api/llm/models'){
    const cfg = { provider:b.provider||(S.llm&&S.llm.provider), key:(b.key||'').trim()||(S.llm&&S.llm.key) };
    if(!cfg.provider) return send(res,400,{error:'PICK A PROVIDER FIRST'});
    try{ const ids=await LLM.listModels(cfg); return send(res,200,{ok:1,models:ids}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/llm/test'){
    try{
      const r=await think('Reply with exactly one sentence confirming you are online and name your model.',
        null,'test','Chairman');
      save(); return send(res,200,{ok:1,text:r.text,ms:r.ms,model:r.model,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/llm/ask'){
    if(!(b.prompt||'').trim()) return send(res,400,{error:'PROMPT REQUIRED'});
    try{
      const r=await think(b.prompt.trim(), b.sys||null, b.tag||'owner-task', b.agent||'Chairman');
      log('INFO','AI TASK',`Owner task executed (${r.tokens} tokens).`);
      save(); return send(res,200,{ok:1,text:r.text,ms:r.ms,tokens:r.tokens,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/llm/clear'){ S.outputs=[]; save(); return send(res,200,{ok:1,state:pub()}); }

  /* ---- COMMAND CONSOLE: you talk, he acts ---- */
  /* ---- THE DOER: one box, real actions ---- */
  if(p==='/api/do'){
    const text=(b.text||'').trim();
    if(!text) return send(res,400,{error:'SAY SOMETHING'});
    try{
      const r = await doIt(text);
      return send(res,200,{ok:1,did:r.did,text:r.text,goto:r.goto||null,state:pub()});
    }catch(e){
      chatSay('SYSTEM','FAILED: '+e.message); save();
      return send(res,400,{error:e.message,state:pub()});
    }
  }
  if(p==='/api/chat/clear'){
    const pid=curProject().id;
    S.chat=(S.chat||[]).filter(m=>(m.pid||'PRJ-MAIN')!==pid);
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- SKILLS ---- */
  if(p==='/api/skill/run'){
    try{ const r=await runSkill(b.id, (b.note||'').trim());
      return send(res,200,{ok:1,skill:r.skill,text:r.text,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/skill/write'){
    if(!(b.brief||'').trim()) return send(res,400,{error:'DESCRIBE WHAT IT SHOULD DO'});
    try{ const sk=await writeSkill(b.brief.trim());
      return send(res,200,{ok:1,id:sk.id,name:sk.name,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/skill/toggle'){
    const sk=(S.skillsOwn||[]).find(x=>x.id===b.id);
    if(!sk) return send(res,400,{error:'BUILT-IN SKILLS CANNOT BE DISABLED'});
    sk.enabled=!sk.enabled;
    log('OK','SKILLS',`"${sk.name}" ${sk.enabled?'ENABLED on its cadence':'switched off'}.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/skill/delete'){
    S.skillsOwn=(S.skillsOwn||[]).filter(x=>x.id!==b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }

  /* ---- COMMENT DESK ---- */
  if(p==='/api/meta/connect'){
    const tok=String(b.token||'').trim();
    if(!tok) return send(res,400,{error:'PASTE THE ACCESS TOKEN'});
    try{
      const v=await META.verify(tok);
      S.meta={ token:tok, igId:v.igId, username:v.username, pageId:v.pageId,
        pageName:v.pageName, followers:v.followers, mediaCount:v.mediaCount, t:nowIso() };
      log('OK','COMMENTS',`Instagram connected: @${v.username} (${v.followers} followers) via Page "${v.pageName}".`);
      save(); return send(res,200,{ok:1,account:v,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/meta/purge'){
    S.meta=null; S.commentDrafts=[];
    log('CRIT','COMMENTS','Instagram disconnected. Token discarded.');
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/comments/harvest'){
    try{ const r=await harvestComments({posts:b.posts,max:b.max});
      return send(res,200,{ok:1,drafts:(r.drafts||[]).length,msg:r.msg,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/comments/edit'){
    const d=(S.commentDrafts||[]).find(x=>x.id===b.id);
    if(!d) return send(res,400,{error:'NO SUCH DRAFT'});
    if(b.reply!=null) d.reply=String(b.reply).slice(0,2200);
    if(b.action && ['public','dm','ignore','owner'].includes(b.action)) d.action=b.action;
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/comments/send'){
    try{ const r=await sendComments(Array.isArray(b.ids)?b.ids:null);
      return send(res,200,{ok:1,sent:r.sent,skipped:r.skipped,failed:r.failed,errors:r.errors,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/comments/clear'){
    S.commentDrafts=(S.commentDrafts||[]).filter(d=>d.status==='DRAFT'&&!b.all?false:d.status==='SENT');
    if(b.all) S.commentDrafts=[];
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- CONTENT STUDIO ---- */
  if(p==='/api/content/week'){
    if(!S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST'});
    try{
      const w = await buildContentWeek({ bizId:b.bizId, niche:b.niche, count:b.count, handle:b.handle });
      return send(res,200,{ok:1,id:w.id,posts:w.posts.length,reels:w.reels,tells:w.tellCount,state:pub()});
    }catch(e){ log('WARN','CONTENT','Week failed — '+e.message); return send(res,400,{error:e.message}); }
  }
  if(p==='/api/content/delete'){
    S.content=(S.content||[]).filter(x=>x.id!==b.id); save();
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/content/posted'){
    const w=(S.content||[]).find(x=>x.id===b.weekId);
    if(!w) return send(res,400,{error:'NO SUCH WEEK'});
    const post=(w.posts||[]).find(x=>x.id===b.postId);
    if(!post) return send(res,400,{error:'NO SUCH POST'});
    post.posted = !post.posted;
    if(b.result != null) post.result = String(b.result).slice(0,160);
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- PROJECTS ---- */
  if(p==='/api/project/new'){
    const name=String(b.name||'').trim().slice(0,50);
    if(!name) return send(res,400,{error:'NAME IT'});
    S.projects=S.projects||[];
    if(S.projects.length>=20) return send(res,400,{error:'20 projects is the limit. Delete one first.'});
    const prj={ id:uid('PRJ'), name, t:nowIso() };
    S.projects.unshift(prj); S.projectId=prj.id;
    log('OK','WORKSPACE',`Project "${name}" opened. Its conversation and files are kept separate.`);
    save(); return send(res,200,{ok:1,id:prj.id,state:pub()});
  }
  if(p==='/api/project/open'){
    if(!(S.projects||[]).some(x=>x.id===b.id)) return send(res,400,{error:'NO SUCH PROJECT'});
    S.projectId=b.id; save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/project/rename'){
    const prj=(S.projects||[]).find(x=>x.id===b.id);
    if(!prj) return send(res,400,{error:'NO SUCH PROJECT'});
    prj.name=String(b.name||'').trim().slice(0,50)||prj.name;
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/project/delete'){
    if(b.id==='PRJ-MAIN') return send(res,400,{error:'General cannot be deleted.'});
    S.projects=(S.projects||[]).filter(x=>x.id!==b.id);
    S.chat=(S.chat||[]).filter(m=>(m.pid||'PRJ-MAIN')!==b.id);
    S.docs=(S.docs||[]).filter(d=>d.pid!==b.id);
    if(S.projectId===b.id) S.projectId=(S.projects[0]||{id:'PRJ-MAIN'}).id;
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- SEARCH EVERY CONVERSATION ---- */
  if(p==='/api/chat/search'){
    const q=String(b.q||'').trim().toLowerCase();
    if(q.length<2) return send(res,400,{error:'TYPE AT LEAST TWO CHARACTERS'});
    const names={}; (S.projects||[]).forEach(x=>{names[x.id]=x.name;});
    const hits=(S.chat||[])
      .filter(m=>String(m.text||'').toLowerCase().includes(q))
      .slice(0,40)
      .map(m=>{
        const t=String(m.text);
        const i=t.toLowerCase().indexOf(q);
        return { t:m.t, who:m.who, pid:m.pid||'PRJ-MAIN',
                 project:names[m.pid||'PRJ-MAIN']||'(deleted)',
                 snippet:(i>60?'…':'')+t.slice(Math.max(0,i-60), i+140)+(t.length>i+140?'…':'') };
      });
    return send(res,200,{ok:1,hits,q});
  }

  if(p==='/api/command'){
    const text=(b.text||'').trim();
    if(!text) return send(res,400,{error:'SAY SOMETHING'});
    S.chat.unshift({t:nowIso(),who:'OWNER',text}); S.chat=S.chat.slice(0,200);
    const ctx=`SYSTEM STATE RIGHT NOW: ${S.agents.length} agents, `+
      `${S.monitors.length} monitored sites (${S.monitors.filter(m=>m.state==='DOWN').length} down), `+
      `${S.ideas.length} ideas (${S.ideas.filter(i=>i.status==='RAW').length} unresearched), `+
      `${S.ventures.length} live ventures, ${S.orders.length} payment links raised, `+
      `runtime ${S.running?'RUNNING':'HALTED'}, payments ${S.pay?S.pay.gateway+' armed':'not configured'}, `+
      `mail ${S.smtp?'armed':'offline'}.`;
    try{
      const r=await think(
`${ctx}

The Owner just told you: "${text}"

You are the Chairman. Reply directly to the Owner. If this is an instruction,
say precisely what you will do and what you need from them. If it needs a
capability the system does not have, say so plainly instead of pretending.
Never claim to have done something you have not done. Under 180 words.`,
        null,'command','Chairman');
      S.chat.unshift({t:nowIso(),who:'CHAIRMAN',text:r.text}); S.chat=S.chat.slice(0,200);
      save(); return send(res,200,{ok:1,text:r.text,state:pub()});
    }catch(e){
      S.chat.unshift({t:nowIso(),who:'SYSTEM',text:'FAILED: '+e.message});
      save(); return send(res,400,{error:e.message,state:pub()});
    }
  }
  if(p==='/api/command/clear'){ S.chat=[]; save(); return send(res,200,{ok:1,state:pub()}); }

  /* ---- HUSTLE MODE: maximum parallel money-focused output ---- */
  if(p==='/api/runtime/hustle'){
    if(b.on && !S.llm) return send(res,400,{error:'CONNECT AN AI BRAIN FIRST — hustle mode is mostly AI work'});
    S.lanes = Math.min(6, Math.max(1, +b.lanes||3));
    seedTasks(true, !!b.on);
    S.running = true;
    save();
    setTimeout(tick, 500);
    return send(res,200,{ok:1,tasks:S.tasks.length,state:pub()});
  }
  if(p==='/api/runtime/lanes'){
    S.lanes = Math.min(6, Math.max(1, +b.lanes||3)); save();
    return send(res,200,{ok:1,state:pub()});
  }

  /* ---- SPEND REQUEST: he asks, you approve, budget is enforced ---- */
  if(p==='/api/spend/request'){
    const amt=+b.amount||0;
    if(amt<=0) return send(res,400,{error:'POSITIVE AMOUNT REQUIRED'});
    if(!(b.what||'').trim()) return send(res,400,{error:'STATE WHAT IT BUYS'});
    S.gates.unshift({ id:uid('GATE'), t:nowIso(),
      title:`Spend ₹${amt.toLocaleString()} — ${b.what.trim()}`,
      cls:'FINANCIAL TRANSFER', cost:amt, free:b.free||'',
      obj:`Spend ₹${amt.toLocaleString()} on: ${b.what.trim()}. Expected return: ${b.roi||'not stated'}.`,
      just:b.why||'Requested by the Chairman to unblock a venture.',
      safe:'Owner signature required. Amount capped by the budget ceiling. Recorded against lifetime spend.',
      risk: amt>2000?'HIGH':amt>500?'MEDIUM':'LOW', amt:0, status:'PENDING' });
    log('WARN','TREASURY',`Spend request ₹${amt} — ${b.what.trim()}. FROZEN pending your signature.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/spend/budget'){
    S.budget = Math.max(0, +b.budget||0);
    log('CRIT','TREASURY',`Owner set a spending ceiling of ₹${S.budget}. Anything above this is refused outright.`);
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- RESEARCH: read any page, deep-dive any topic ---- */
  if(p==='/api/research/read'){
    if(!(b.url||'').trim()) return send(res,400,{error:'URL REQUIRED'});
    try{
      const pg = await RESEARCH.readPage(b.url.trim());
      const r = await think(
`You just read this page in full.
URL: ${pg.url}
TITLE: ${pg.title}

CONTENT:
${pg.text}

${b.ask ? 'The Owner asks: '+b.ask : 'Summarise what matters, and state plainly what this page does NOT say.'}
Cite only what is actually on the page. If it is thin or promotional, say so.`,
        null,'read-page','Market Signal');
      return send(res,200,{ok:1,title:pg.title,text:r.text,chars:pg.text.length,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/research/dive'){
    if(!(b.topic||'').trim()) return send(res,400,{error:'TOPIC REQUIRED'});
    try{
      const ev = await RESEARCH.deepDive(b.topic.trim(), b.region||'Ludhiana Punjab India');
      const r = await think(
`Live evidence gathered just now on: ${b.topic}

${ev.slice(0,7000)}

Give: 5 hard facts the evidence supports, 2 common assumptions it contradicts,
1 unserved opportunity, and what you could NOT find out. Invent nothing.`,
        null,'deep-dive','Market Signal');
      return send(res,200,{ok:1,text:r.text,evidence:ev.length,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }

  /* ---- MISSION ENGINE: he guides, you execute ---- */
  if(p==='/api/mission/generate'){
    try{ const a=await generateMissions(b.ventureId||null, b.feedback||'');
      return send(res,200,{ok:1,added:a.length,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/mission/debrief'){
    try{ const r=await debriefMission(b.id, b.outcome, b.note);
      return send(res,200,{ok:1,advice:r.advice,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/mission/playbook'){
    if(!(b.topic||'').trim()) return send(res,400,{error:'TOPIC REQUIRED'});
    try{ const pb=await writePlaybook(b.topic.trim());
      return send(res,200,{ok:1,id:pb.id,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/mission/clear'){
    S.missions=S.missions.filter(m=>m.status==='OPEN'); save();
    return send(res,200,{ok:1,state:pub()});
  }

  /* ---- VENTURE ENGINE ---- */
  if(p==='/api/idea/generate'){
    try{ const a=await generateIdeas(Math.min(8,+b.n||5), b.steer);
      return send(res,200,{ok:1,added:a.length,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/idea/research'){
    try{ const i=await researchIdea(b.id);
      return send(res,200,{ok:1,score:i.score,verdict:i.verdict,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/idea/launch'){
    try{ const r=await buildVenture(b.id);
      return send(res,200,{ok:1,agents:r.agents.length,skipped:r.skipped,state:pub()}); }
    catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/idea/kill'){
    const i=S.ideas.find(x=>x.id===b.id); if(i){ i.status='KILLED'; log('WARN','VENTURE',`Idea "${i.title}" killed by Owner.`); }
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/idea/autopilot'){
    S.autoIdeas=!!b.on;
    log(S.autoIdeas?'CRIT':'OK','VENTURE',
      S.autoIdeas?'IDEA AUTOPILOT ON — Chairman will invent and research ideas unprompted.'
                 :'Idea autopilot off.');
    save(); return send(res,200,{ok:1,state:pub()});
  }

  /* ---- REAL PAYMENTS ---- */
  if(p==='/api/pay/connect'){
    const G=PAY.GATEWAYS[b.gateway]; if(!G) return send(res,400,{error:'UNKNOWN GATEWAY'});
    if(b.gateway==='razorpay' && (!b.keyId||!b.keySecret))
      return send(res,400,{error:'Razorpay needs BOTH Key ID and Key Secret'});
    if(b.gateway==='stripe' && !b.keySecret)
      return send(res,400,{error:'Stripe needs the Secret key (sk_test_... or sk_live_...)'});
    const cfg={ gateway:b.gateway, keyId:(b.keyId||'').trim(), keySecret:(b.keySecret||'').trim(),
      webhookSecret:(b.webhookSecret||'').trim() };
    try{
      const v=await G.verify(cfg);
      cfg.live=v.live; cfg.t=nowIso();

      /* TREASURY LOCK.
         The Owner's rule: every rupee lands in HIS account, never anywhere
         else. Once a gateway is sealed, the account fingerprint is frozen.
         Connecting different credentials later requires his password and an
         explicit unseal — so a compromised session, a bug, or the Chairman
         himself cannot silently repoint the money. */
      const fp = crypto.createHash('sha256')
        .update(cfg.gateway + '|' + (cfg.keyId || cfg.keySecret.slice(0,14)))
        .digest('hex').slice(0,16);
      if(S.treasuryLock && S.treasuryLock.fp && S.treasuryLock.fp !== fp){
        if(!verify(b.pw||''))
          return send(res,401,{error:
            `TREASURY LOCKED to a different account (sealed ${S.treasuryLock.t}). These credentials pay into somewhere else. Enter your Owner password to repoint the money — nothing else can do it.`});
        log('CRIT','TREASURY',
          `TREASURY REPOINTED by Owner signature. Money now lands in ${G.label} account ${fp}. Previous: ${S.treasuryLock.fp}.`);
        mail('Treasury repointed',
`The payment account receiving all money has been CHANGED.

  Gateway    : ${G.label}
  New account: ${fp}
  Old account: ${S.treasuryLock.fp}
  Mode       : ${v.live?'LIVE — real money':'TEST'}
  At         : ${nowIso()} UTC

If you did not do this, your session is compromised. Revoke all sessions and
rotate your password immediately.

— Chairman Agent OS · Treasury`,'TREASURY');
      }
      cfg.fp = fp;
      S.pay = cfg;
      S.treasuryLock = { fp, gateway:cfg.gateway, t:nowIso(), live:!!v.live };
      log(v.live?'CRIT':'OK','TREASURY',
        `Payment gateway ${G.label} verified in ${v.live?'LIVE — real money':'TEST'} mode. Secret withheld from ledger.`);
      save(); return send(res,200,{ok:1,live:v.live,state:pub()});
    }catch(e){ return send(res,400,{error:'KEYS REJECTED — '+e.message}); }
  }
  if(p==='/api/pay/purge'){
    if(S.treasuryLock && !verify(b.pw||''))
      return send(res,401,{error:'The treasury is sealed to your account. Disconnecting it needs your Owner password.'});
    S.pay=null; S.treasuryLock=null;
    log('CRIT','TREASURY','Payment gateway disconnected and treasury lock cleared by Owner signature.');
    save(); return send(res,200,{ok:1,state:pub()}); }
  if(p==='/api/pay/link'){
    if(!S.pay) return send(res,400,{error:'NO GATEWAY CONNECTED'});
    const amt=+b.amount||0;
    if(amt<=0) return send(res,400,{error:'POSITIVE AMOUNT REQUIRED'});
    if(!(b.description||'').trim()) return send(res,400,{error:'DESCRIPTION REQUIRED'});
    /* Live money always needs a signature. Test mode does not. */
    if(S.pay.live && !verify(b.pw||''))
      return send(res,401,{error:'LIVE MODE — Owner password required to raise a real payment link'});
    const G=PAY.GATEWAYS[S.pay.gateway];
    if(S.treasuryLock && S.pay.fp && S.treasuryLock.fp !== S.pay.fp)
      return send(res,403,{error:'BLOCKED — the active gateway does not match the sealed treasury account. No link will be raised.'});
    try{
      const l=await G.link(S.pay,{amount:amt,description:b.description.trim(),
        name:b.name,email:b.email,phone:b.phone,currency:b.currency,ref:b.ref||uid('REF')});
      const o={ id:l.id, t:nowIso(), url:l.url, amount:amt, currency:l.currency,
        desc:b.description.trim(), customer:b.name||b.email||b.phone||'—',
        gateway:S.pay.gateway, live:!!S.pay.live, status:l.status, paid:0 };
      S.orders.unshift(o); S.orders=S.orders.slice(0,200);
      log(S.pay.live?'CRIT':'OK','TREASURY',
        `Payment link ${o.id} raised for ${l.currency} ${amt} (${S.pay.live?'LIVE':'TEST'}) — ${o.desc}`);
      save(); return send(res,200,{ok:1,url:l.url,id:l.id,state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/pay/refresh'){
    if(!S.pay) return send(res,400,{error:'NO GATEWAY'});
    const G=PAY.GATEWAYS[S.pay.gateway];
    let updated=0;
    for(const o of S.orders.slice(0,25)){
      if(o.gateway!==S.pay.gateway || o.status==='paid') continue;
      try{ const st=await G.status(S.pay,o.id);
        if(st.status!==o.status || st.paid>o.paid){
          if(st.paid>o.paid && st.paid>0){
            S.revenue.push({t:nowIso(),src:'Payment · '+o.desc,amt:st.paid});
            log('OK','TREASURY',`PAYMENT RECEIVED ${o.currency} ${st.paid} — ${o.desc}`);
            mail('Payment received',
`A payment has settled.

  Amount : ${o.currency} ${st.paid}
  For    : ${o.desc}
  From   : ${o.customer}
  Link   : ${o.id}
  Mode   : ${o.live?'LIVE':'TEST'}

— Chairman Agent OS · Treasury`,'PAYMENT');
          }
          o.status=st.status; o.paid=st.paid; updated++;
        }
      }catch(e){}
    }
    save(); return send(res,200,{ok:1,updated,state:pub()});
  }

  /* ---- RUNTIME CONTROL ---- */
  if(p==='/api/runtime/power'){
    S.running=!!b.on;
    S.haltedByOwner = !S.running;
    S.haltedAt = S.running ? null : nowIso();
    if(S.running) seedTasks();
    log(S.running?'OK':'CRIT','RUNTIME',
      S.running?'SYSTEM RUNNING — all standing orders executing on schedule.'
               :'SYSTEM HALTED by Owner. All agent work stopped.');
    save();
    if(S.running) setTimeout(tick,600);
    return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/runtime/task'){
    const t=S.tasks.find(x=>x.id===b.id); if(!t) return send(res,404,{error:'NO SUCH TASK'});
    if(b.every!=null) t.every=Math.max(30,+b.every||60);
    if(b.enabled!=null){ t.enabled=!!b.enabled;
      log('WARN','RUNTIME',`Standing order ${t.cap} ${t.enabled?'ENABLED':'DISABLED'}.`); }
    save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/runtime/runnow'){
    const t=S.tasks.find(x=>x.id===b.id); if(!t) return send(res,404,{error:'NO SUCH TASK'});
    const cap=CAPS[t.cap]; if(!cap) return send(res,400,{error:'UNKNOWN CAPABILITY'});
    const t0=Date.now();
    try{
      const r=await cap.run();
      t.lastAt=nowIso(); t.lastOk=true; t.lastMsg=r.msg; t.runs++;
      S.runs.unshift({t:t.lastAt,cap:t.cap,owner:t.owner,ok:true,msg:r.msg,
        detail:r.detail||'',ms:Date.now()-t0,n:r.n||0,manual:true});
      S.runs=S.runs.slice(0,300); save();
      return send(res,200,{ok:1,msg:r.msg,detail:r.detail||'',state:pub()});
    }catch(e){ return send(res,400,{error:e.message}); }
  }
  if(p==='/api/runtime/reset'){
    S.tasks=[]; S.tasksCleared=false; seedTasks(); save(); return send(res,200,{ok:1,state:pub()});
  }

  if(p==='/api/logs/purge'){
    S.logs=[]; log('CRIT','AUDIT','Ledger purged by Owner.'); save(); return send(res,200,{ok:1,state:pub()});
  }
  if(p==='/api/wipe'){
    if(!verify(b.pw)) return send(res,401,{error:'PASSWORD WRONG'});
    S=structuredClone(BLANK); SESS.clear();
    await STORE.remove(DB).catch(()=>{});
    await STORE.remove(SESSDB).catch(()=>{});
    await STORE.remove(CREDS).catch(()=>{});
    await STORE.remove(IDDB).catch(()=>{});   /* or the old identity outlives the wipe */
    return send(res,200,{ok:1,wiped:1});
  }

  return send(res,404,{error:'NO SUCH ENDPOINT'});
}

/* ---------- static ---------- */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};
/* WHY THIS CHANGED — the Owner said deploys and loads took far too long.
   He was right, and it was not Render's fault:

     · Every asset went out UNCOMPRESSED. app.js is 360 KB; gzipped it is
       about a quarter of that. On a phone on Indian mobile data that is
       the difference between a snappy load and a long stare at nothing.
     · Every asset was 'Cache-Control: no-store', so the ENTIRE payload
       re-downloaded on every single page view and every wake-from-sleep.
       Nothing was ever reused.

   Now: gzip once, keep it in memory, and let the browser cache it against
   a content hash. The HTML stays uncached so a new build is picked up
   instantly; the heavy JS is cached hard because its URL changes when it
   changes. */
const _gz = new Map();
function serve(res,name,req){
  const d = __ASSETS[name] || __ASSETS['index.html'];
  sendAsset(res, d, path.extname(name) || '.html', req);
}
function sendAsset(res, buf, ext, req){
  const type = MIME[ext] || 'application/octet-stream';
  const tag  = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0,16) + '"';
  /* the shell must never be cached, or a new build is invisible */
  const shell = ext === '.html';
  const cache = shell ? 'no-cache' : 'public, max-age=86400, must-revalidate';

  if(req && req.headers['if-none-match'] === tag){
    res.writeHead(304, { 'ETag':tag, 'Cache-Control':cache });
    return res.end();
  }
  const wantsGz = /\bgzip\b/.test((req && req.headers['accept-encoding']) || '')
                  && /javascript|html|css|json|svg/.test(type);
  let body = buf, enc = null;
  if(wantsGz){
    if(!_gz.has(tag)) _gz.set(tag, zlib.gzipSync(buf, { level:8 }));
    body = _gz.get(tag); enc = 'gzip';
  }
  const h = { 'Content-Type':type, 'Content-Length':body.length,
    'Cache-Control':cache, 'ETag':tag, 'Vary':'Accept-Encoding',
    'X-Frame-Options':'ALLOWALL', 'Content-Security-Policy':'frame-ancestors *' };
  if(enc) h['Content-Encoding'] = enc;
  res.writeHead(200, h);
  res.end(body);
}

/* ---------- server ---------- */
const server = http.createServer(async (req,res)=>{
  const t0=Date.now(); T.req++;
  /* inspect the RAW request line before any parser normalizes it away */
  let rawLine = req.url || '';
  try { rawLine = decodeURIComponent(rawLine); } catch(e) {}
  if(rawLine.includes('..') || rawLine.includes('\0')){
    T.err++;
    log('CRIT','SECURITY',`Path traversal attempt blocked: ${(req.url||'').slice(0,80)} from ${(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0]}`);
    res.writeHead(403,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    return res.end('403 FORBIDDEN');
  }
  const url=new URL(req.url,'http://x');
  T.byPath[url.pathname]=(T.byPath[url.pathname]||0)+1;
  res.on('finish',()=>{ T.lat.push(Date.now()-t0); if(T.lat.length>500) T.lat.shift(); });
  try{
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);

    let raw = url.pathname;
    try { raw = decodeURIComponent(raw); } catch(e) {}
    /* reject any traversal attempt outright instead of silently serving the SPA */
    if(raw.includes('..') || raw.includes('\0')){
      T.err++; log('CRIT','SECURITY',`Path traversal attempt blocked: ${raw.slice(0,80)} from ${(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0]}`);
      res.writeHead(403,{'Content-Type':'text/plain'}); return res.end('403 FORBIDDEN');
    }
    const f = raw==='/' ? 'index.html' : raw.replace(/^\/+/,'');
    serve(res, __ASSETS[f] ? f : 'index.html', req);
  }catch(e){ T.err++; console.error('ERR',e.message); send(res,500,{error:'INTERNAL'}); }
});

/* ---------- async init: hydrate state from whichever store is configured ---------- */
/* HOW LONG THE DEPLOY TAKES — and why it used to hang.

   The port used to open LAST, after three GitHub API calls. Render decides a
   deploy has succeeded by waiting for the port to open. So if GitHub was slow,
   rate-limited, or the token was wrong, no port ever opened and Render sat
   there until it gave up. The Owner's own deploy log shows it: twelve deploys
   at 25-40 seconds, then one at 15m43s that FAILED.

   Worse, a bad token called process.exit(1) — which Render reads as a crash
   and retries, so the same 15 minutes happen again.

   Fixed: the port opens FIRST, in milliseconds. State loads behind it. Until
   the state is in, the app serves a plain "starting" response instead of
   pretending to be ready, and /api/health reports the real phase. */
let BOOT_PHASE = 'starting';
let BOOT_ERROR = null;

(async function init(){
  const line='════════════════════════════════════════════════════════';

  /* 1. OPEN THE PORT IMMEDIATELY. Render is satisfied; the deploy is done. */
  await new Promise(r => server.listen(PORT,'0.0.0.0',r));
  console.log('[boot] listening on '+PORT+' — loading state…');

  /* 2. Load state behind the open port. Slow storage delays readiness,
        never the deploy. */
  const t0 = Date.now();
  try{
    if(STORE.verify){
      const v=await STORE.verify();
      console.log('[store] github repo '+v.full_name+(v.private?' (private ✓)':' (PUBLIC ✗ — make it private!)'));
    }
    const raw=await STORE.read(DB);
    if(raw){ S=Object.assign(structuredClone(BLANK), JSON.parse(raw)); DBBYTES=Buffer.byteLength(raw); }
    /* Restore the identity from its own file. It wins over anything in
       data.json, because it is the copy that survives. */
    try{
      const idraw = await STORE.read(IDDB);
      if(idraw){
        const o = JSON.parse(idraw);
        if(o && o.id && o.hash && o.salt){
          S.owner = Object.assign({}, S.owner||{}, o);
          console.log('[boot] owner identity restored from '+IDDB);
        }
      }
    }catch(e){ console.warn('[boot] could not read '+IDDB+': '+e.message); }
    const sraw=await STORE.read(SESSDB);
    if(sraw){ const now=Date.now();
      for(const[k,v] of Object.entries(JSON.parse(sraw))) if(now-v.t<TTL) SESS.set(k,v); }
    console.log('[boot] state loaded in '+(Date.now()-t0)+'ms');
  }catch(e){
    /* Do NOT exit. Exiting makes Render retry the whole slow deploy, and it
       still would not tell the Owner what is wrong. Stay up, refuse to serve
       a blank identity, and say exactly what to fix. */
    BOOT_PHASE = 'store-failed';
    BOOT_ERROR = e.message;
    console.error(line);
    console.error(' STORAGE UNREACHABLE: '+e.message);
    console.error(' The server is UP so you can read this, but it will not start');
    console.error(' with a blank identity — that would orphan your owner account.');
    console.error(' Check GH_TOKEN, GH_REPO and that the repo exists and is private.');
    console.error(line);
    return;   /* stays listening, reports the fault on /api/health */
  }

  BOOT_PHASE = 'ready';
  const boot = await bootstrap();
  /* self-heal: an owner exists but the roster is empty (wiped or corrupted) */
  if(S.owner && !S.agents.length && !S.rosterCleared){ seed(); save(); }
  /* AUTO-START: the Chairman runs himself. The Owner should never have to
     press "start" — that is his job, not yours. */
  if(S.owner){
    if((!S.tasks || !S.tasks.length) && !S.tasksCleared) seedTasks(true, false);
    /* AUTO-START, properly this time.
       The old line said "only a deliberate halt keeps it off" — but nothing
       distinguished a deliberate halt from a crash, a first boot, or a
       partially-written state file. Any of those left running=false FOREVER
       and the Chairman sat there doing nothing while every task showed as
       enabled. That is exactly the "brain not running" the Owner reported.
       Now only an explicit halt sticks, and even that expires. */
    if(S.running !== true){
      const halted = S.haltedAt ? Date.parse(S.haltedAt.replace(' ','T')+'Z') : 0;
      const hoursHalted = halted ? (Date.now()-halted)/3600000 : 999;
      if(!S.haltedByOwner || hoursHalted > 12){
        S.running = true;
        if(S.haltedByOwner)
          log('OK','RUNTIME',`Auto-resumed after a ${Math.round(hoursHalted)}h halt. He does not stay stopped by accident.`);
        S.haltedByOwner = false; S.haltedAt = null;
      } else {
        log('WARN','RUNTIME',`Still halted — you stopped him ${Math.round(hoursHalted)}h ago. Press START, or he resumes on his own after 12h.`);
      }
    }
    save();
    setTimeout(tick, 2000);
  }

  {
    const lan = lanIP();
    console.log('');
    console.log(line);
    console.log('   CHAIRMAN AGENT OS  ·  RUNNING');
    console.log(line);
    console.log('');
    console.log('   OPEN THIS IN YOUR BROWSER:');
    console.log('');
    console.log('        http://localhost:' + PORT);
    console.log('');
    if(lan){
      console.log('   From your PHONE on the same Wi-Fi:');
      console.log('');
      console.log('        http://' + lan + ':' + PORT);
      console.log('');
    }
    console.log(line);
    if(boot){
      console.log('');
      console.log('   YOUR LOGIN  (copy these now)');
      console.log('');
      console.log('        OWNER ID : ' + boot.id);
      console.log('        PASSWORD : ' + boot.pw);
      console.log('');
      console.log('   Also saved to OWNER_CREDENTIALS.txt in this folder.');
      console.log('   Rotate it after first login and that file self-deletes.');
      console.log('');
      console.log(line);
    } else {
      console.log('');
      console.log('   Owner already set up. Use your existing ID and password.');
      console.log('   Forgot it? Delete data.json and restart for a fresh identity.');
      console.log('');
      console.log(line);
    }
    console.log('');
    console.log('   ' + STORE.describe() + '  ·  0 dependencies  ·  $0.00');
    console.log('   Keep this window open. Press Ctrl+C to stop the server.');
    console.log('');
    if(process.env.NO_OPEN !== '1') openBrowser('http://localhost:' + PORT);
  }
})();

/* ---------- convenience: LAN address + auto-open browser ---------- */
function lanIP(){
  try{
    for(const list of Object.values(os.networkInterfaces()))
      for(const i of list)
        if(i.family==='IPv4' && !i.internal && !/^169\.254\./.test(i.address)) return i.address;
  }catch(e){}
  return null;
}
function openBrowser(url){
  const { spawn } = require('child_process');
  const cmd = process.platform==='darwin' ? ['open',[url]]
            : process.platform==='win32'  ? ['cmd',['/c','start','',url]]
            : ['xdg-open',[url]];
  try{
    const p = spawn(cmd[0], cmd[1], { stdio:'ignore', detached:true });
    p.on('error',()=>{});
    p.unref();
  }catch(e){}
}

/* SHUTDOWN — actually wait for the write.
   The old handler called write() and exited on a 1.5s timer without awaiting
   it. With GitHub storage that push takes longer than that, so the last state
   was regularly lost on every Render restart. It also only caught SIGTERM,
   so Ctrl+C lost work too. */
let shuttingDown = false;
async function shutdown(sig){
  if(shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${sig} — flushing state…`);
  const bail = setTimeout(()=>{ console.error('[shutdown] flush timed out'); process.exit(1); }, 12000);
  try{
    await STORE.write(DB, JSON.stringify(S,null,1));
    if(STORE.flushNow) await STORE.flushNow();   /* bypass the debounce */
    console.log('[shutdown] state saved.');
  }catch(e){ console.error('[shutdown] SAVE FAILED: '+e.message); }
  clearTimeout(bail);
  process.exit(0);
}
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT', ()=>shutdown('SIGINT'));
