#!/usr/bin/env node
/**
 * Tests for scripts/mail.js.
 *
 * These stand up real TLS servers on localhost that speak real IMAP and SMTP,
 * and point the mail client at them. Parsing a wire protocol is exactly the
 * kind of code that passes a unit test on hand-written strings and then falls
 * over on the first real server, so the fakes answer in the awkward shapes a
 * real server uses: multi-line SMTP greetings, IMAP literals, untagged lines
 * mixed in with tagged ones.
 *
 * They also record what they were asked. That is how the promise "reading your
 * mail cannot change your mail" gets proven rather than asserted: the test
 * checks the client sent EXAMINE and BODY.PEEK, and never STORE, DELETE,
 * EXPUNGE or a plain SELECT.
 */

const tls = require('tls');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0;
let fail = 0;

function check(name, condition, detail) {
  if (condition) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function equal(name, actual, expected) {
  check(name, actual === expected, 'got ' + JSON.stringify(actual)
    + ', wanted ' + JSON.stringify(expected));
}

/* ------------------------------------------------------------------ *
 * A throwaway certificate, generated into the temp directory, never
 * committed. It exists for the length of this run.
 * ------------------------------------------------------------------ */

function selfSigned() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailtest-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=localhost'
  ], { stdio: 'ignore' });
  return {
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

/**
 * A line-driven fake server. `respond` is called with each complete line and
 * whatever it returns is written back. Every line is recorded.
 */
function server(creds, greeting, respond) {
  const lines = [];
  const s = tls.createServer({ key: creds.key, cert: creds.cert }, socket => {
    let buffer = '';
    let raw = false; // SMTP DATA mode: collect until a lone dot.
    socket.setEncoding('utf8');
    socket.write(greeting);
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        lines.push(line);
        if (raw) {
          if (line === '.') { raw = false; socket.write('250 2.0.0 queued\r\n'); }
          continue;
        }
        const answer = respond(line, lines);
        if (answer === 'DATA-MODE') { raw = true; socket.write('354 go ahead\r\n'); }
        else if (answer) socket.write(answer);
      }
    });
  });
  return new Promise(resolve => {
    s.listen(0, '127.0.0.1', () => resolve({
      port: s.address().port,
      lines,
      close: () => new Promise(done => s.close(done))
    }));
  });
}

/* ------------------------------------------------------------------ *
 * Fake IMAP.
 * ------------------------------------------------------------------ */

function literal(text) { return '{' + Buffer.byteLength(text) + '}\r\n' + text; }

function fakeImap(creds, options) {
  const opts = options || {};
  const headers = seq =>
    'From: Sender ' + seq + ' <sender' + seq + '@example.com>\r\n'
    + 'To: karan@example.com\r\n'
    + 'Subject: Message number ' + seq + '\r\n'
    + 'Date: Mon, 07 Sep 2026 10:0' + seq + ':00 +0000\r\n'
    + 'Message-ID: <m' + seq + '@example.com>\r\n\r\n';

  return server(creds, '* OK fake IMAP ready\r\n', line => {
    const tag = line.split(' ')[0];
    const command = (line.split(' ')[1] || '').toUpperCase();

    if (command === 'LOGIN') {
      if (opts.rejectLogin) return tag + ' NO [AUTHENTICATIONFAILED] Invalid credentials\r\n';
      return tag + ' OK LOGIN completed\r\n';
    }
    if (command === 'EXAMINE') {
      return '* 42 EXISTS\r\n* OK [READ-ONLY] Examine completed\r\n'
        + tag + ' OK [READ-ONLY] EXAMINE completed\r\n';
    }
    if (command === 'SEARCH') {
      const ids = opts.ids === undefined ? '3 7 9' : opts.ids;
      return '* SEARCH' + (ids ? ' ' + ids : '') + '\r\n' + tag + ' OK SEARCH completed\r\n';
    }
    if (command === 'FETCH') {
      // Answer out of order on purpose: the client must sort, not assume.
      const order = opts.fetchOrder || [7, 3, 9];
      let out = '';
      order.forEach(seq => {
        out += '* ' + seq + ' FETCH (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)] '
          + literal(headers(seq))
          + ' BODY[TEXT]<0> '
          + literal('Body of message ' + seq + '.\r\nSecond line.\r\n')
          + ')\r\n';
      });
      return out + tag + ' OK FETCH completed\r\n';
    }
    if (command === 'LOGOUT') return '* BYE\r\n' + tag + ' OK LOGOUT completed\r\n';
    return tag + ' BAD unknown command\r\n';
  });
}

/* ------------------------------------------------------------------ *
 * Fake SMTP.
 * ------------------------------------------------------------------ */

function fakeSmtp(creds, options) {
  const opts = options || {};
  let step = 0;
  return server(creds, '220 fake SMTP ready\r\n', line => {
    const upper = line.toUpperCase();
    // A multi-line greeting, because that is what a real server sends and a
    // naive "wait for one line" client hangs on it.
    if (upper.startsWith('EHLO')) {
      return '250-fake greets you\r\n250-SIZE 35882577\r\n250-8BITMIME\r\n250 AUTH LOGIN PLAIN\r\n';
    }
    if (upper === 'AUTH LOGIN') { step = 1; return '334 VXNlcm5hbWU6\r\n'; }
    if (step === 1) { step = 2; return '334 UGFzc3dvcmQ6\r\n'; }
    if (step === 2) {
      step = 3;
      if (opts.rejectAuth) return '535 5.7.8 Username and Password not accepted\r\n';
      return '235 2.7.0 Accepted\r\n';
    }
    if (upper.startsWith('MAIL FROM')) return '250 2.1.0 Ok\r\n';
    if (upper.startsWith('RCPT TO')) {
      if (opts.rejectRecipient) return '550 5.1.1 No such user here\r\n';
      return '250 2.1.5 Ok\r\n';
    }
    if (upper === 'DATA') return 'DATA-MODE';
    if (upper === 'QUIT') return '221 2.0.0 Bye\r\n';
    return '500 5.5.1 unknown\r\n';
  });
}

/* ------------------------------------------------------------------ *
 * Tests.
 * ------------------------------------------------------------------ */

function withEnv(values, run) {
  const saved = {};
  Object.keys(values).forEach(k => { saved[k] = process.env[k]; process.env[k] = values[k]; });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      Object.keys(saved).forEach(k => {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      });
    });
}

async function main() {
  const creds = selfSigned();
  const mail = require('./mail.js');

  console.log('\nPure parsing');

  const lit = mail.readLiteral('BODY[TEXT] {5}\r\nhello rest', 0);
  equal('a literal reads exactly the declared number of bytes', lit.value, 'hello');
  equal('and reports where it ended', 'BODY[TEXT] {5}\r\nhello rest'.slice(lit.end), ' rest');

  equal('a header folded across lines is joined',
    mail.headerValue('Subject: one\r\n  two three\r\nFrom: a@b.c\r\n', 'Subject'),
    'one two three');
  equal('a missing header is empty, not undefined',
    mail.headerValue('From: a@b.c\r\n', 'Subject'), '');

  equal('a newline in a header value is stripped, so headers cannot be injected',
    mail.headerSafe('Hello\r\nBcc: attacker@example.com'),
    'Hello Bcc: attacker@example.com');
  equal('a plain ASCII subject is left alone', mail.encodeHeader('Invoice 42'), 'Invoice 42');
  equal('a non-ASCII subject is base64 encoded so it is not mojibake',
    mail.encodeHeader('Café'), '=?UTF-8?B?' + Buffer.from('Café', 'utf8').toString('base64') + '?=');
  equal('a lone dot line in a body is escaped, so it cannot end the message early',
    mail.asBody('one\n.\ntwo'), 'one\r\n..\r\ntwo');

  equal('a display name is stripped for the envelope',
    mail.addressOnly('Karan Sandhu <karan@example.com>'), 'karan@example.com');
  equal('a bare address is left alone', mail.addressOnly('karan@example.com'), 'karan@example.com');
  check('an address with a space in it is refused', !mail.validAddress('a b@example.com'));
  check('an address with no @ is refused', !mail.validAddress('karan'));
  check('an ordinary address is accepted', mail.validAddress('karan@example.com'));

  console.log('\nReading, against a real IMAP conversation');

  const imap = await fakeImap(creds);
  const read = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password',
    IMAP_HOST: '127.0.0.1', IMAP_PORT: String(imap.port), MAIL_INSECURE: '1'
  }, () => mail.unread(10));

  check('unread() succeeds', read.ok, read.error);
  equal('every unread message is returned', (read.messages || []).length, 3);
  equal('the count of unread messages is reported', read.unreadTotal, 3);
  equal('messages come back newest first even when the server answers out of order',
    (read.messages || []).map(m => m.seq).join(','), '9,7,3');
  equal('the sender is parsed', (read.messages[0] || {}).from,
    'Sender 9 <sender9@example.com>');
  equal('the subject is parsed', (read.messages[0] || {}).subject, 'Message number 9');
  equal('the message id is parsed, so a reply can thread',
    (read.messages[0] || {}).messageId, '<m9@example.com>');
  check('the body preview is present',
    (read.messages[0] || {}).preview.indexOf('Body of message 9.') === 0,
    JSON.stringify((read.messages[0] || {}).preview));

  const sent = imap.lines.join('\n');
  check('the mailbox is opened read-only with EXAMINE', /EXAMINE INBOX/.test(sent));
  check('SELECT is never used, because it would clear the recent flag',
    !/\bSELECT\b/.test(sent), sent);
  check('the body is fetched with BODY.PEEK, so nothing is marked read',
    /BODY\.PEEK/.test(sent));
  check('no raw BODY[ fetch is issued, which would mark messages read',
    !/BODY\[/.test(sent), sent);
  check('nothing tries to change a flag', !/\bSTORE\b/.test(sent), sent);
  check('nothing tries to delete or expunge',
    !/\bEXPUNGE\b/.test(sent) && !/\bDELETE\b/.test(sent), sent);
  check('the fetch is bounded, not the whole mailbox', /FETCH 9,7,3 |FETCH [\d,]+ /.test(sent));
  await imap.close();

  console.log('\nReading, when things go wrong');

  const empty = await fakeImap(creds, { ids: '' });
  const none = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password',
    IMAP_HOST: '127.0.0.1', IMAP_PORT: String(empty.port), MAIL_INSECURE: '1'
  }, () => mail.unread(10));
  check('an empty inbox is a success with no messages, not an error', none.ok, none.error);
  equal('and no messages', (none.messages || []).length, 0);
  check('an empty inbox does not send a FETCH at all',
    !/FETCH/.test(empty.lines.join('\n')));
  await empty.close();

  const refused = await fakeImap(creds, { rejectLogin: true });
  const denied = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'wrong',
    IMAP_HOST: '127.0.0.1', IMAP_PORT: String(refused.port), MAIL_INSECURE: '1'
  }, () => mail.unread(10));
  check('a rejected sign-in fails rather than pretending', !denied.ok);
  check('and says the fix is an app password, which is the actual Gmail cause',
    /app password/i.test(denied.error || ''), denied.error);
  await refused.close();

  const unconfigured = await withEnv({ MAIL_USER: '', MAIL_PASS: '' }, () => mail.unread(10));
  check('with no configuration it names the variables to set',
    !unconfigured.ok && /MAIL_USER/.test(unconfigured.error) && /MAIL_PASS/.test(unconfigured.error),
    unconfigured.error);

  console.log('\nSending, against a real SMTP conversation');

  const smtp = await fakeSmtp(creds);
  const out = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password',
    MAIL_FROM: 'Karan Sandhu <karan@example.com>',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_INSECURE: '1'
  }, () => mail.send({
    to: 'Someone <someone@example.com>',
    subject: 'Café meeting',
    body: 'Hello.\n.\nGoodbye.',
    inReplyTo: '<m9@example.com>'
  }));

  check('send() succeeds', out.ok, out.error);
  equal('and reports the recipient it actually used', out.to, 'someone@example.com');

  const talk = smtp.lines.join('\n');
  check('a multi-line EHLO reply does not hang the client', /MAIL FROM/.test(talk));
  equal('the envelope sender is the bare address, not the display form',
    (talk.match(/^MAIL FROM:<(.*)>$/m) || [])[1], 'karan@example.com');
  equal('the envelope recipient is the bare address too',
    (talk.match(/^RCPT TO:<(.*)>$/m) || [])[1], 'someone@example.com');
  check('the From header keeps the display name',
    /^From: Karan Sandhu <karan@example\.com>$/m.test(talk), talk);
  check('a non-ASCII subject goes out encoded', /^Subject: =\?UTF-8\?B\?/m.test(talk));
  check('a reply carries In-Reply-To so it threads',
    /^In-Reply-To: <m9@example\.com>$/m.test(talk));
  check('and References, which is what most clients actually thread on',
    /^References: <m9@example\.com>$/m.test(talk));
  check('the lone dot in the body was escaped and did not end the message early',
    /^\.\.$/m.test(talk) && /^Goodbye\.$/m.test(talk), talk);
  check('the password is sent base64 as AUTH LOGIN requires',
    talk.indexOf(Buffer.from('app-password').toString('base64')) !== -1);
  check('the session is closed with QUIT', /^QUIT$/m.test(talk));
  await smtp.close();

  console.log('\nSending, when things go wrong');

  const badAuth = await fakeSmtp(creds, { rejectAuth: true });
  const authFailed = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'wrong',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(badAuth.port), MAIL_INSECURE: '1'
  }, () => mail.send({ to: 'someone@example.com', subject: 'x', body: 'y' }));
  check('a rejected password fails the send', !authFailed.ok);
  check('and reports what the server said', /535|not accepted/i.test(authFailed.error || ''),
    authFailed.error);
  check('nothing is sent after a failed sign-in',
    !/^DATA$/m.test(badAuth.lines.join('\n')), badAuth.lines.join('\n'));
  await badAuth.close();

  const badRcpt = await fakeSmtp(creds, { rejectRecipient: true });
  const rcptFailed = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(badRcpt.port), MAIL_INSECURE: '1'
  }, () => mail.send({ to: 'nobody@example.com', subject: 'x', body: 'y' }));
  check('a rejected recipient fails the send', !rcptFailed.ok);
  check('and no message body is transmitted',
    !/^DATA$/m.test(badRcpt.lines.join('\n')));
  await badRcpt.close();

  const noRecipient = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password'
  }, () => mail.send({ to: '', subject: 'x', body: 'y' }));
  check('an empty recipient is refused before any connection is made', !noRecipient.ok);

  const injected = await withEnv({
    MAIL_USER: 'karan@example.com', MAIL_PASS: 'app-password'
  }, () => mail.send({ to: 'a@b.c\r\nRCPT TO:<victim@example.com>', subject: 'x', body: 'y' }));
  check('a recipient carrying a second RCPT line is refused, not smuggled through',
    !injected.ok, JSON.stringify(injected));

  creds.cleanup();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
