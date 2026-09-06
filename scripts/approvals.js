#!/usr/bin/env node
/**
 * The approval gate.
 *
 * Nothing that leaves this machine happens without Karan saying yes to that
 * specific action. This is the one place that enforces it: a caller does not
 * perform an external action and then report it, it registers the action here
 * and waits. The work is only run inside approve().
 *
 * Design rules that make this a gate rather than a formality:
 *
 *   - Default deny. An item that is never approved is never run, and expires.
 *   - One approval, one action. approve() runs an item once and marks it spent,
 *     so a repeated call cannot replay it.
 *   - No blanket approvals. There is deliberately no "approve all" and no
 *     standing permission: each item is its own decision.
 *   - The summary shown is the action that runs. The runner is attached at
 *     registration, so what he approves is what executes.
 *
 * State lives in memory. On Render's free tier the container is wiped on every
 * restart, so a pending item does not survive one. That is acceptable because
 * the failure mode is safe: a lost approval means the action does not happen.
 * Nothing is ever lost in the direction of acting without a yes.
 */

const crypto = require('crypto');

const TTL = Number(process.env.APPROVAL_TTL_MS || 60 * 60 * 1000);
const MAX_ITEMS = 200;

const items = new Map();

function now() { return Date.now(); }

function expired(item) {
  return item.status === 'pending' && now() - item.createdAt > TTL;
}

function view(item) {
  return {
    id: item.id,
    kind: item.kind,
    summary: item.summary,
    detail: item.detail,
    status: expired(item) ? 'expired' : item.status,
    createdAt: item.createdAt,
    decidedAt: item.decidedAt,
    error: item.error,
    result: item.result
  };
}

/**
 * Register an action that needs a yes.
 *
 * @param {string} kind    machine label, e.g. 'web.read'
 * @param {string} summary one plain sentence naming exactly what will happen
 * @param {object} detail  the parameters, shown to him alongside the summary
 * @param {function} run   performs the action; called only after approval
 */
function request(kind, summary, detail, run) {
  if (typeof run !== 'function') throw new Error('An approval needs something to run');
  // Drop the oldest decided items rather than growing without bound.
  if (items.size >= MAX_ITEMS) {
    for (const [id, it] of items) {
      if (it.status !== 'pending') { items.delete(id); break; }
    }
  }
  const id = crypto.randomBytes(8).toString('hex');
  items.set(id, {
    id, kind, summary, detail, run,
    status: 'pending',
    createdAt: now()
  });
  return view(items.get(id));
}

function get(id) {
  const item = items.get(id);
  return item ? view(item) : null;
}

/** Everything still awaiting a decision, oldest first. */
function pending() {
  return [...items.values()].filter(i => i.status === 'pending' && !expired(i)).map(view);
}

/** Recent history, newest first, so he can see what he approved and what it did. */
function history(limit) {
  return [...items.values()]
    .filter(i => i.status !== 'pending' || expired(i))
    .sort((a, b) => (b.decidedAt || b.createdAt) - (a.decidedAt || a.createdAt))
    .slice(0, limit || 20)
    .map(view);
}

async function approve(id) {
  const item = items.get(id);
  if (!item) return { ok: false, error: 'No such approval: ' + id };
  if (expired(item)) {
    item.status = 'expired';
    return { ok: false, error: 'That approval expired. Ask again if it is still wanted.' };
  }
  if (item.status !== 'pending') {
    return { ok: false, error: 'Already ' + item.status + '. An approval is spent once used.' };
  }

  // Marked before running, so a second call cannot run the same action twice.
  item.status = 'running';
  item.decidedAt = now();
  try {
    item.result = await item.run();
    item.status = 'done';
    return { ok: true, item: view(item) };
  } catch (e) {
    item.status = 'failed';
    item.error = e.message;
    return { ok: false, error: e.message, item: view(item) };
  }
}

function deny(id, reason) {
  const item = items.get(id);
  if (!item) return { ok: false, error: 'No such approval: ' + id };
  if (item.status !== 'pending') {
    return { ok: false, error: 'Already ' + item.status + '.' };
  }
  item.status = 'denied';
  item.decidedAt = now();
  item.error = reason || 'Denied.';
  return { ok: true, item: view(item) };
}

/** Test seam. Nothing in the server calls this. */
function _reset() { items.clear(); }

module.exports = { request, approve, deny, get, pending, history, _reset, TTL };
