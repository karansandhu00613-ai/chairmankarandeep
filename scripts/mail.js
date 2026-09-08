#!/usr/bin/env node
/**
 * Reading and sending email, over IMAP and SMTP, with no dependencies.
 *
 * Node ships TLS, and IMAP and SMTP are line protocols, so a mail client is a
 * few hundred lines rather than a package tree. That matters here for three
 * reasons: this repo has zero npm dependencies on purpose, every dependency is
 * another thing that can fail a free-tier build, and a mail library is a lot of
 * surface area to trust with a mailbox password.
 *
 * Configuration is environment only:
 *   MAIL_USER      the address to sign in as
 *   MAIL_PASS      an app password, never the account password
 *   MAIL_FROM      optional; defaults to MAIL_USER
 *   IMAP_HOST      default imap.gmail.com
 *   IMAP_PORT      default 993
 *   SMTP_HOST      default smtp.gmail.com
 *   SMTP_PORT      default 465, implicit TLS
 *
 * Reading uses EXAMINE, not SELECT, so opening the mailbox cannot mark anything
 * as read. Nothing in this file deletes, moves or flags a message. The only
 * thing it can change in the outside world is send(), and the dashboard puts
 * that behind the approval gate.
 */

const tls = require('tls');

const TIMEOUT = Number(process.env.MAIL_TIMEOUT_MS || 30000);

function config() {
  return {
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
    imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
    imapPort: Number(process.env.IMAP_PORT || 993),
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    // Tests point at a local server with a self-signed certificate. Never set
    // this against a real mailbox: it disables certificate checking.
    insecure: !!process.env.MAIL_INSECURE
  };
}

/** What is missing before mail can work at all. */
function missing() {
  const c = config();
  const out = [];
  if (!c.user) out.push('MAIL_USER');
  if (!c.pass) out.push('MAIL_PASS');
  return out;
}

function configured() { return missing().length === 0; }

/* ------------------------------------------------------------------ *
 * A TLS line-protocol connection, shared by IMAP and SMTP.
 * ------------------------------------------------------------------ */

function connect(host, port, insecure) {
  return new Promise((resolve, reject) => {
    let settled = false;
    // SNI carries a hostname, never an address; sending an IP is a protocol
    // violation Node warns about, and the tests connect to 127.0.0.1.
    const isAddress = /^[\d.]+$|:/.test(host);
    const socket = tls.connect(
      Object.assign(
        { host, port, rejectUnauthorized: !insecure },
        isAddress ? {} : { servername: host }),
      () => { settled = true; resolve(wrap(socket)); });

    socket.setTimeout(TIMEOUT);
    socket.on('timeout', () => {
      socket.destroy();
      if (!settled) { settled = true; reject(new Error('Timed out connecting to ' + host)); }
    });
    socket.on('error', e => {
      if (!settled) { settled = true; reject(new Error(host + ': ' + e.message)); }
    });
  });
}

/**
 * Wrap a socket so a caller can send a line and wait for the response that
 * ends it. `isDone` decides when the server has finished answering.
 */
function wrap(socket) {
  let buffer = '';
  let waiter = null;

  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    buffer += chunk;
    if (waiter && waiter.isDone(buffer)) {
      const done = waiter;
      waiter = null;
      const text = buffer;
      buffer = '';
      done.resolve(text);
    }
  });

  const fail = e => {
    if (waiter) { const w = waiter; waiter = null; w.reject(e); }
  };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('The mail server closed the connection')));

  return {
    socket,
    /** Wait for whatever the server says next, without sending anything. */
    expect(isDone) {
      return new Promise((resolve, reject) => {
        if (isDone(buffer)) {
          const text = buffer;
          buffer = '';
          return resolve(text);
        }
        waiter = { isDone, resolve, reject };
      });
    },
    send(line, isDone) {
      const answer = this.expect(isDone);
      socket.write(line + '\r\n');
      return answer;
    },
    close() { try { socket.end(); } catch (e) { /* already gone */ } }
  };
}

/* ------------------------------------------------------------------ *
 * IMAP: read unread messages, changing nothing.
 * ------------------------------------------------------------------ */

/** A tagged IMAP command is finished when its own tag comes back. */
function taggedDone(tag) {
  return text => new RegExp('^' + tag + ' (OK|NO|BAD)\\b', 'm').test(text);
}

function imapFailed(tag, text) {
  const m = text.match(new RegExp('^' + tag + ' (NO|BAD) (.*)$', 'm'));
  return m ? m[2].trim() : null;
}

/**
 * Pull the literal that follows `{n}` at a position, which is how IMAP returns
 * anything that might contain a newline. Returns the text and where it ended.
 */
function readLiteral(text, from) {
  const open = text.indexOf('{', from);
  if (open === -1) return null;
  const close = text.indexOf('}', open);
  if (close === -1) return null;
  const length = Number(text.slice(open + 1, close));
  if (!Number.isFinite(length)) return null;
  // The literal begins after the CRLF that follows the brace.
  let start = close + 1;
  while (start < text.length && (text[start] === '\r' || text[start] === '\n')) start++;
  return { value: text.slice(start, start + length), end: start + length };
}

/**
 * The bare address out of a From/To value. `MAIL_FROM` is often written as
 * "Karan Sandhu <karan@example.com>", which belongs in the From header but
 * would be rejected in the SMTP envelope, where only the address goes.
 */
function addressOnly(value) {
  const clean = headerSafe(value);
  const angled = clean.match(/<([^<>]+)>/);
  return (angled ? angled[1] : clean).trim();
}

/** An envelope address must be one token with an @ in it and no brackets. */
function validAddress(value) {
  return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(value);
}

/**
 * One header's value, with folding undone.
 *
 * A long header is wrapped across lines with leading whitespace, so the value
 * runs until a line that starts with something other than a space or tab, or
 * until the end of the block. That end has to be written as `(?![\s\S])`: `$`
 * would match before every newline under the `m` flag this needs for `^`, and
 * the value would be cut off at the first fold.
 */
function headerValue(headers, name) {
  const m = headers.match(
    new RegExp('^' + name + ':[ \\t]*([\\s\\S]*?)(?=\\r?\\n[^ \\t]|(?![\\s\\S]))', 'im'));
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}

/**
 * The most recent unread messages, newest first.
 *
 * Opens the mailbox with EXAMINE and fetches with BODY.PEEK, so nothing is
 * marked as read. Reading his inbox must not change it.
 */
async function unread(limit) {
  const c = config();
  if (!configured()) {
    return { ok: false, error: 'Mail is not configured. Set ' + missing().join(' and ') + '.' };
  }

  let conn;
  try {
    conn = await connect(c.imapHost, c.imapPort, c.insecure);
    await conn.expect(t => /^\* OK/m.test(t));

    const login = await conn.send(
      'a1 LOGIN "' + c.user.replace(/"/g, '\\"') + '" "' + c.pass.replace(/"/g, '\\"') + '"',
      taggedDone('a1'));
    const loginError = imapFailed('a1', login);
    if (loginError) {
      return {
        ok: false,
        error: 'The mail server rejected the sign-in: ' + loginError
          + '. For Gmail this must be an app password, not the account password.'
      };
    }

    const examine = await conn.send('a2 EXAMINE INBOX', taggedDone('a2'));
    const examineError = imapFailed('a2', examine);
    if (examineError) return { ok: false, error: 'Could not open the inbox: ' + examineError };

    const search = await conn.send('a3 SEARCH UNSEEN', taggedDone('a3'));
    const searchError = imapFailed('a3', search);
    if (searchError) return { ok: false, error: 'Could not search the inbox: ' + searchError };

    const line = (search.match(/^\* SEARCH([^\r\n]*)/m) || [])[1] || '';
    const ids = line.trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (!ids.length) return { ok: true, messages: [], checked: c.user };

    // Newest first, and never more than asked for: a long-unread mailbox
    // should not pull thousands of messages into a free-tier container.
    const wanted = ids.slice(-(limit || 10)).reverse();

    const fetch = await conn.send(
      'a4 FETCH ' + wanted.join(',')
        + ' (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)] BODY.PEEK[TEXT]<0.1500>)',
      taggedDone('a4'));
    const fetchError = imapFailed('a4', fetch);
    if (fetchError) return { ok: false, error: 'Could not read the messages: ' + fetchError };

    const messages = [];
    const blocks = fetch.split(/^\* (\d+) FETCH /m);
    // split() gives [before, id, body, id, body, ...]
    for (let i = 1; i < blocks.length; i += 2) {
      const seq = Number(blocks[i]);
      const body = blocks[i + 1] || '';

      const headerAt = body.search(/BODY\[HEADER\.FIELDS/i);
      const header = headerAt === -1 ? null : readLiteral(body, headerAt);
      const textAt = body.search(/BODY\[TEXT\]/i);
      const text = textAt === -1 ? null : readLiteral(body, textAt);
      if (!header) continue;

      messages.push({
        seq,
        from: headerValue(header.value, 'From'),
        to: headerValue(header.value, 'To'),
        subject: headerValue(header.value, 'Subject') || '(no subject)',
        date: headerValue(header.value, 'Date'),
        messageId: headerValue(header.value, 'Message-ID'),
        preview: (text ? text.value : '').replace(/\s+/g, ' ').trim().slice(0, 1000)
      });
    }

    // A server may answer a FETCH in any order it likes, so sort rather than
    // trusting the order the numbers went out in.
    messages.sort((a, b) => b.seq - a.seq);

    await conn.send('a5 LOGOUT', t => /^a5 (OK|NO|BAD)\b/m.test(t)).catch(() => {});
    return { ok: true, messages, checked: c.user, unreadTotal: ids.length };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (conn) conn.close();
  }
}

/* ------------------------------------------------------------------ *
 * SMTP: send one message.
 * ------------------------------------------------------------------ */

function smtpDone(text) { return /^\d{3} [^\r\n]*\r?\n$|\r?\n\d{3} [^\r\n]*\r?\n$/.test(text); }

function smtpCode(text) {
  const lines = text.trim().split(/\r?\n/);
  const last = lines[lines.length - 1] || '';
  return Number(last.slice(0, 3));
}

/** RFC 5322 wants CRLF line endings, and a lone dot line must be escaped. */
function asBody(text) {
  return String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

/** Header values must not carry a newline, or a sender could inject headers. */
function headerSafe(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value) {
  const clean = headerSafe(value);
  // Anything outside ASCII needs encoding, or the subject arrives as mojibake.
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(clean)) return clean;
  return '=?UTF-8?B?' + Buffer.from(clean, 'utf8').toString('base64') + '?=';
}

/**
 * Send one message. This is the only thing in this file that changes anything
 * outside the process, and the dashboard only calls it from inside an approved
 * item in the approval queue.
 */
async function send(message) {
  const c = config();
  if (!configured()) {
    return { ok: false, error: 'Mail is not configured. Set ' + missing().join(' and ') + '.' };
  }
  const to = addressOnly(message.to);
  if (!validAddress(to)) {
    return { ok: false, error: 'That is not a usable recipient address: ' + (to || '(empty)') };
  }
  const envelopeFrom = addressOnly(c.from);
  if (!validAddress(envelopeFrom)) {
    return { ok: false, error: 'MAIL_FROM is not a usable address: ' + (envelopeFrom || '(empty)') };
  }

  let conn;
  const say = async (line, expected) => {
    const reply = await conn.send(line, smtpDone);
    const code = smtpCode(reply);
    if (expected.indexOf(code) === -1) {
      throw new Error('The mail server answered ' + reply.trim().split(/\r?\n/).pop());
    }
    return reply;
  };

  try {
    conn = await connect(c.smtpHost, c.smtpPort, c.insecure);
    await conn.expect(smtpDone);

    await say('EHLO karan-dashboard', [250]);
    await say('AUTH LOGIN', [334]);
    await say(Buffer.from(c.user).toString('base64'), [334]);
    await say(Buffer.from(c.pass).toString('base64'), [235]);
    await say('MAIL FROM:<' + envelopeFrom + '>', [250]);
    await say('RCPT TO:<' + to + '>', [250, 251]);
    await say('DATA', [354]);

    const headers = [
      'From: ' + headerSafe(c.from),
      'To: ' + to,
      'Subject: ' + encodeHeader(message.subject || '(no subject)'),
      'Date: ' + new Date().toUTCString(),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8'
    ];
    if (message.inReplyTo) {
      headers.push('In-Reply-To: ' + headerSafe(message.inReplyTo));
      headers.push('References: ' + headerSafe(message.inReplyTo));
    }

    const reply = await conn.send(
      headers.join('\r\n') + '\r\n\r\n' + asBody(message.body || '') + '\r\n.',
      smtpDone);
    if (smtpCode(reply) !== 250) {
      throw new Error('The message was refused: ' + reply.trim());
    }

    await conn.send('QUIT', smtpDone).catch(() => {});
    return { ok: true, to, subject: headerSafe(message.subject || '(no subject)') };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (conn) conn.close();
  }
}

module.exports = {
  unread, send, configured, missing, config,
  // Exported for testing the parts that are easy to get subtly wrong.
  readLiteral, headerValue, headerSafe, encodeHeader, asBody, addressOnly, validAddress
};
