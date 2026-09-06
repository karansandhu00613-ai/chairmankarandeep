#!/usr/bin/env node
/**
 * Sub-agents, and the business scout that uses them.
 *
 * A sub-agent here is one bounded call to the provider chain with its own brief
 * and its own evidence. There is no pretence of anything more: they are not
 * separate processes and they do not run continuously. What is real is that
 * each one has a distinct job, gets only the evidence it should have, and its
 * output is attributed to it and shown while the run is in progress.
 *
 * Two rules carry the weight:
 *
 *   Evidence in, citations out. The analyst is given numbered posts that were
 *   actually fetched, and must cite [n]. The server maps every [n] back to the
 *   real URL and DROPS any index it did not supply, so a citation that appears
 *   in the output is one it really has. A model cannot invent a source here,
 *   only fail to cite one.
 *
 *   Nothing acts. Every sub-agent researches, drafts or plans. The output of a
 *   whole run is a proposal in the approval queue, never a built thing. Setting
 *   anything up is a separate decision Karan makes.
 */

const crypto = require('crypto');
const llm = require('./llm');
const web = require('./web');

const SHARED = [
  'You are a sub-agent reporting to the Chairman, who reports to Karan Sandhu.',
  'You never speak to Karan directly and you never take an external action.',
  'Be brief, concrete and serious. No filler, no flattery, no emoji.',
  'Never invent a company, a person, a number, a price or a source.',
  'If the evidence does not support a claim, say the evidence does not support it.',
  'Distinguish what the evidence shows from what you infer, and label inference.'
].join(' ');

const SPECIALISTS = {
  'scout-analyst': {
    label: 'Scout analyst',
    brief: 'Reads public complaints and finds the recurring, evidenced problems.',
    system: SHARED + '\n\n'
      + 'You are given numbered posts from public forums. Find the problems people '
      + 'are actually having, not product ideas you like. Rank by how often the '
      + 'problem recurs, how much it appears to cost the person, and whether they '
      + 'sound like they would pay to be rid of it.\n\n'
      + 'For each problem give: a one-line statement of the problem; who has it; '
      + 'what it currently costs them in time or money according to the posts; and '
      + 'the citations. Cite ONLY by the bracketed number of a post you were given, '
      + 'like [3]. Never cite a number you were not given and never invent a source. '
      + 'A problem you cannot cite does not belong in the list.\n\n'
      + 'Return at most five problems. If the posts do not support five, return fewer '
      + 'and say the evidence was thin.'
  },

  'market-check': {
    label: 'Market check',
    brief: 'Says who already solves this and whether there is room.',
    system: SHARED + '\n\n'
      + 'You are given one problem. Say who already solves it, as far as you know, '
      + 'and be explicit that your knowledge has a cutoff and needs verifying. '
      + 'Say what those solutions appear to cost and where they leave a gap. '
      + 'Then give a straight verdict: crowded, contested, or open, and why. '
      + 'If your honest answer is that this is already well served and not worth '
      + 'entering, say exactly that. A negative verdict is a useful answer.'
  },

  'build-plan': {
    label: 'Build plan',
    brief: 'The smallest thing that could test the problem, and what it takes.',
    system: SHARED + '\n\n'
      + 'You are given one problem. Design the smallest thing that would test '
      + 'whether people will pay to have it solved. Not the full product: the test.\n\n'
      + 'Give: what it does; what it deliberately does not do; the stack, preferring '
      + 'free and open tools and naming the free tier limits; a realistic build time '
      + 'for one person; and the single riskiest assumption it would prove or kill. '
      + 'If it cannot be built for nothing, say what it costs and why.'
  },

  monetisation: {
    label: 'Monetisation',
    brief: 'How it earns, and what would have to be true for that to work.',
    system: SHARED + '\n\n'
      + 'You are given one problem and a build plan. Say how it would charge, at '
      + 'what price, and why someone with this problem would pay that. Give the '
      + 'arithmetic: customers needed for a first meaningful amount of revenue. '
      + 'State plainly what would have to be true for the pricing to hold, and what '
      + 'would make it fail. Do not forecast revenue as if it were a plan. Nobody '
      + 'can promise revenue; you are saying what the model would be if it works.'
  },

  reviewer: {
    label: 'Reviewer',
    brief: 'Argues against the proposal before it reaches Karan.',
    system: SHARED + '\n\n'
      + 'You are given a complete proposal. Your job is to attack it, not to '
      + 'improve it. Name the weakest claim, the assumption most likely to be '
      + 'wrong, and anything asserted without evidence. If the proposal is not '
      + 'worth Karan\'s time, say so in the first line. End with one of exactly '
      + 'these verdicts on its own line: WORTH A TEST, or NOT WORTH IT, or '
      + 'NEEDS MORE EVIDENCE.'
  }
};

/** One bounded call. Never throws; a failed sub-agent is reported as failed. */
async function runAgent(name, task) {
  const spec = SPECIALISTS[name];
  if (!spec) return { agent: name, ok: false, error: 'No such sub-agent: ' + name };
  const started = Date.now();
  const out = await llm.ask(task, spec.system);
  return {
    agent: name,
    label: spec.label,
    ok: out.ok,
    text: out.ok ? out.text : undefined,
    error: out.ok ? undefined : out.error,
    provider: out.provider,
    ms: Date.now() - started
  };
}

/**
 * Rewrite [n] citations to the real sources, and drop any the model invented.
 *
 * This is the mechanism that stops a fabricated source reaching Karan: a
 * citation survives only if the evidence item it points at was actually
 * fetched. Anything else is removed and counted.
 */
function resolveCitations(text, evidence) {
  const used = new Set();
  const invented = [];
  const clean = String(text || '').replace(/\[(\d+)\]/g, (whole, n) => {
    const i = Number(n) - 1;
    if (i >= 0 && i < evidence.length) { used.add(i); return whole; }
    invented.push(Number(n));
    return '';
  }).replace(/ {2,}/g, ' ').replace(/ ([.,;:])/g, '$1');

  return {
    text: clean.trim(),
    citations: [...used].sort((a, b) => a - b).map(i => ({
      n: i + 1,
      title: evidence[i].title,
      url: evidence[i].url,
      source: evidence[i].source
    })),
    invented
  };
}

/** Fetch the public posts a run will reason over. Read-only, no key, no account. */
async function gather(queries) {
  const jobs = [];
  queries.forEach(q => { jobs.push(web.hn(q, 12)); jobs.push(web.reddit(q, 12)); });
  const settled = await Promise.all(jobs);

  const evidence = [];
  const failures = [];
  const seen = new Set();
  settled.forEach(r => {
    if (!r.ok) { failures.push(r.source + ' for "' + r.query + '": ' + r.error); return; }
    r.results.forEach(item => {
      if (seen.has(item.url)) return;
      seen.add(item.url);
      evidence.push({
        source: r.source,
        query: r.query,
        title: item.title,
        url: item.url,
        points: item.points,
        comments: item.comments,
        text: item.text || ''
      });
    });
  });

  // Busiest first: a thread with more comments is a problem more people share.
  evidence.sort((a, b) => (b.comments || 0) - (a.comments || 0));
  return { evidence, failures };
}

function evidenceBlock(evidence) {
  return evidence.map((e, i) =>
    '[' + (i + 1) + '] (' + e.source + ', ' + (e.comments || 0) + ' comments) '
    + e.title + (e.text ? '\n    ' + e.text.replace(/\s+/g, ' ').slice(0, 300) : '')
  ).join('\n');
}

// Runs in memory so the page can watch one happen. A restart loses the record,
// which is why the outcome is put in the approval queue rather than left here.
const runs = new Map();

function getRun(id) { return runs.get(id) || null; }
function listRuns() {
  return [...runs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10)
    .map(r => ({ id: r.id, status: r.status, startedAt: r.startedAt, queries: r.queries }));
}

function step(run, name, status, detail) {
  const existing = run.steps.find(s => s.name === name);
  if (existing) { existing.status = status; existing.detail = detail; existing.at = Date.now(); }
  else run.steps.push({ name, status, detail, at: Date.now() });
  return run;
}

/**
 * The scout: public evidence, then sub-agents on each candidate, then a
 * proposal that waits for Karan. It never sets anything up.
 *
 * @param {string[]} queries what to search public forums for
 * @param {object} opts      { onProposal } called with each finished proposal so
 *                           the caller can put it in the approval queue
 */
function scout(queries, opts) {
  const options = opts || {};
  const run = {
    id: crypto.randomBytes(6).toString('hex'),
    queries,
    status: 'running',
    startedAt: Date.now(),
    steps: [],
    evidence: [],
    proposals: [],
    notes: []
  };
  runs.set(run.id, run);
  if (runs.size > 10) runs.delete([...runs.keys()][0]);

  run.done = (async () => {
    try {
      step(run, 'gather', 'running', 'Reading Hacker News and Reddit');
      const found = await gather(queries);
      run.evidence = found.evidence;
      found.failures.forEach(f => run.notes.push(f));

      if (!found.evidence.length) {
        step(run, 'gather', 'failed', 'No posts were retrieved');
        run.status = 'failed';
        run.error = 'Nothing was retrieved, so there is nothing to reason about. '
          + (found.failures.length ? found.failures.join('; ') : 'The sources returned no posts.');
        return run;
      }
      step(run, 'gather', 'done',
        found.evidence.length + ' posts from ' + queries.length + ' queries');

      // The analyst sees only what was actually fetched.
      const top = found.evidence.slice(0, 45);
      step(run, 'scout-analyst', 'running', 'Ranking the recurring problems');
      const analysis = await runAgent('scout-analyst',
        'Public posts:\n\n' + evidenceBlock(top)
        + '\n\nFind the recurring, evidenced problems. Cite only the numbers above.');

      if (!analysis.ok) {
        step(run, 'scout-analyst', 'failed', analysis.error);
        run.status = 'failed';
        run.error = analysis.error;
        return run;
      }
      const resolved = resolveCitations(analysis.text, top);
      run.analysis = resolved.text;
      run.citations = resolved.citations;
      if (resolved.invented.length) {
        run.notes.push('Dropped ' + resolved.invented.length
          + ' citation(s) pointing at posts that were never fetched.');
      }
      step(run, 'scout-analyst', 'done',
        resolved.citations.length + ' posts cited, via ' + analysis.provider);

      // Split the analysis into candidates. Whatever the shape of the reply, a
      // numbered or dashed list is what the brief asks for.
      const candidates = resolved.text
        .split(/\n(?=\s*(?:\d+[.)]|[-*•])\s)/)
        .map(s => s.trim())
        .filter(s => s.length > 60)
        .slice(0, options.maxIdeas || 2);

      if (!candidates.length) {
        run.status = 'done';
        run.notes.push('The analysis did not separate into distinct problems, '
          + 'so no proposal was built. The analysis itself is above.');
        return run;
      }

      for (let i = 0; i < candidates.length; i++) {
        const problem = candidates[i];
        const tag = 'idea-' + (i + 1);

        step(run, tag, 'running', 'Three sub-agents working');
        // Market check and build plan are independent, so they run together.
        const [market, build] = await Promise.all([
          runAgent('market-check', 'The problem:\n\n' + problem),
          runAgent('build-plan', 'The problem:\n\n' + problem)
        ]);

        const money = build.ok
          ? await runAgent('monetisation',
              'The problem:\n\n' + problem + '\n\nThe build plan:\n\n' + build.text)
          : { agent: 'monetisation', ok: false, error: 'Skipped: no build plan to price.' };

        const proposal = {
          id: tag,
          problem,
          market,
          build,
          money,
          agents: [market, build, money].map(a => ({
            agent: a.agent, label: a.label, ok: a.ok, ms: a.ms, error: a.error
          }))
        };

        // Argued against before he ever sees it.
        if (market.ok && build.ok) {
          const review = await runAgent('reviewer',
            'Problem:\n' + problem
            + '\n\nMarket:\n' + market.text
            + '\n\nBuild:\n' + build.text
            + '\n\nMoney:\n' + (money.ok ? money.text : '(none)'));
          proposal.review = review;
          const verdict = review.ok
            && (review.text.match(/\b(WORTH A TEST|NOT WORTH IT|NEEDS MORE EVIDENCE)\b/) || [])[1];
          proposal.verdict = verdict || 'NO VERDICT';
        } else {
          proposal.verdict = 'INCOMPLETE';
        }

        run.proposals.push(proposal);
        step(run, tag, 'done', proposal.verdict);

        // Only a proposal the reviewer did not reject is worth his attention.
        if (options.onProposal && proposal.verdict === 'WORTH A TEST') {
          options.onProposal(proposal, run);
        }
      }

      run.status = 'done';
      return run;
    } catch (e) {
      run.status = 'failed';
      run.error = e.message;
      return run;
    } finally {
      run.finishedAt = Date.now();
    }
  })();

  return run;
}

module.exports = {
  SPECIALISTS, runAgent, resolveCitations, gather, scout, getRun, listRuns, evidenceBlock
};
