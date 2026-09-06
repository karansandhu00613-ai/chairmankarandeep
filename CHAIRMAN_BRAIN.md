# Giving the Chairman a brain

The dashboard's chat box answers in the dashboard process itself. It no longer
forwards to the Karan service, because that service sleeps on the free tier and
the first message after any quiet spell always failed — which is what made the
chat look broken.

Until a provider key is set, the chat box says so and disables Send rather than
spinning. It never invents an answer.

## Set the keys

Set one and the chat works. Set more than one and it fails over automatically
when the first one's limit is spent.

Render dashboard → `karan-dashboard` → Environment → Environment Variables:

| Variable | Where to get it | Cost |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | free tier |
| `GROQ_API_KEY` | console.groq.com → API Keys | free tier |
| `OPENAI_API_KEY` | platform.openai.com → API keys | paid per message |

Type them straight into Render. Do not put them in a file in this repository —
it is public, and a committed key is a leaked key.

Optional, only if you need them:

| Variable | Default | What it does |
|---|---|---|
| `LLM_ORDER` | `gemini,groq,openai` | Who is asked first |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model names change; override without a code change |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Same |
| `OPENAI_MODEL` | **none** | Required with `OPENAI_API_KEY`. See below. |
| `LLM_TIMEOUT_MS` | `45000` | How long to wait for one provider |

## Using OpenAI

`OPENAI_MODEL` has no default on purpose. OpenAI's line-up changes, and a model
id guessed in code would fail with a confusing 404 instead of saying plainly
that nothing was chosen. Put in the exact id your account has access to, copied
from platform.openai.com. If the id is wrong, OpenAI's own error message is
shown to you rather than being swallowed.

Some newer OpenAI models are served only by the Responses API and refuse the
chat endpoint. The chain notices that refusal and retries on the right endpoint
by itself, so a model released after this code was written still works without
a code change.

**OpenAI is asked last by default, because it charges per message.** The two
free tiers are tried first, and it answers only when both are spent or absent.
That is the free-first rule holding. If you want OpenAI answering first, that is
your call to make deliberately:

```
LLM_ORDER=openai,gemini,groq
```

Set that and every message costs money, including the second call the Chairman
makes after you approve a web fetch, and every sub-agent in a scout run. A
single scout run is roughly six calls.

## What failover actually does

`scripts/llm.js` asks the first configured provider. It moves to the next only
when moving on can help:

- **429, 403, 500, 502, 503, 529** — a spent free tier, a rate limit or an
  outage. Try the next provider.
- **A 200 carrying no text** — that provider failing. Try the next one.
- **400 and other rejections** — the request itself is wrong, and it would be
  rejected identically everywhere. Stop, and report why.

Every reply names the provider that served it. When a provider was skipped, the
chat says which one and why. When every provider fails, you get each provider's
own reason, so a spent quota is never confused with a wrong key.

`scripts/test-llm.js` proves this against local servers standing in for the real
APIs — the chain opens real sockets and decides for itself. `scripts/test-chat.js`
proves the same path end to end through the running dashboard, including login.
Both run under `npm test`.

## What the Chairman is told

`scripts/chairman-prompt.js` holds the standing orders sent with every message:
strict and brief, never state an unverified thing as fact, never claim to have
checked what it could not check, free options first, and your approval before
anything external happens. When something needs your approval it ends with a
single line beginning `NEEDS APPROVAL:`.

That file is the whole instruction, in plain text. Read it and change it if the
tone is wrong — it is the one place that decides how the Chairman talks to you.

## Going online, under your approval

He cannot reach the web himself. He can ask, and you decide.

When a question turns on something he cannot know — a current price, a live API,
anything after his training cutoff — he says so and ends with one request line.
The dashboard turns that into a card in the chat with two buttons:

| He asks | What runs if you approve |
|---|---|
| `SEARCH:` | One DuckDuckGo query, results only |
| `READ:` | One page fetched and reduced to text |
| `FORUMS:` | Hacker News and Reddit searched for that subject |

All three are free, need no key and no account, and are read-only.

The rules that make this a gate and not a formality:

- **Default deny.** An unapproved card never runs. Leave it and it expires.
- **One approval, one action.** Approving runs it once and marks it spent, so
  the same approval cannot be replayed.
- **No approve-all.** There is deliberately no blanket permission and no
  standing consent. Each request is its own decision.
- **What you see is what runs.** The action is attached to the card when it is
  created, so the sentence you read is the thing that executes.
- **Denying means nothing happened.** Not a cancelled fetch — no fetch.

He never presents a page he has not been given. When you approve, he answers
from what actually came back and the sources are printed under the reply. When
the fetch fails he says it failed rather than filling the gap.

A URL he suggests is treated as untrusted input, because it is. The web layer
refuses anything that is not plain http or https, and refuses loopback, private
and link-local addresses, so the chat cannot be turned into a way to reach the
container's own network.

## The business scout

The Scout tab reads public complaints and puts sub-agents on the ones that
recur. Give it a subject, press Run, and watch the steps.

1. **gather** — Hacker News and Reddit are searched. Busiest threads first, on
   the reasoning that more comments means more people share the problem.
2. **scout-analyst** — ranks the recurring, evidenced problems. It is given only
   the posts that were actually fetched, numbered, and must cite `[n]`.
3. **idea-N** — three sub-agents per candidate. Market check, build plan and
   monetisation. The first two run at the same time.
4. **reviewer** — argues against the finished proposal before you ever see it,
   and returns one of `WORTH A TEST`, `NOT WORTH IT`, `NEEDS MORE EVIDENCE`.

Only a proposal the reviewer did not reject reaches your approval queue. A
rejected one is shown in the output and goes no further.

**The citation mechanism is the part worth trusting.** Every `[n]` in the
analysis is mapped back to a post that was really fetched. Any number the model
made up is deleted from the text and counted in the notes, so a citation you can
see is a source that exists. A model cannot invent a source here. It can only
fail to cite one.

**The scout proposes. It never sets anything up.** Approving a venture means the
build plan is ready to execute; nothing has been created, registered, bought or
published. That is a separate decision, and a separate piece of work.

## Honest limits

- The chat has **no memory between messages**. Each message is sent on its own.
  Conversation history needs somewhere durable to live, which on Render's free
  tier means `STORE=github` or a real host, not the container disk.
- The **approval queue lives in memory**. A restart loses anything pending. That
  failure is safe in the only direction that matters: a lost approval means the
  action does not happen. Nothing is ever lost towards acting without a yes.
- **Sub-agents are not processes.** Each is one bounded call with its own brief
  and its own evidence. They do not run continuously and they do not run while
  the service is asleep.
- **Reddit and DuckDuckGo rate limit by address.** On a shared free-tier host
  they sometimes refuse. That is reported as a refusal, never as "nothing
  found" — those mean opposite things.
- **A verdict is not a market.** The reviewer saying WORTH A TEST means the
  proposal survived being argued against. Whether it earns depends on the
  market, not on the code.
