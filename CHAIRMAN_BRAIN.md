# Giving the Chairman a brain

The dashboard's chat box answers in the dashboard process itself. It no longer
forwards to the Karan service, because that service sleeps on the free tier and
the first message after any quiet spell always failed — which is what made the
chat look broken.

Until a provider key is set, the chat box says so and disables Send rather than
spinning. It never invents an answer.

## Set the keys

Both providers have a free tier. Set one and the chat works; set both and it
fails over automatically when the first one's daily limit is spent.

Render dashboard → `karan-dashboard` → Environment → Environment Variables:

| Variable | Where to get it | Needed |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | one of the two |
| `GROQ_API_KEY` | console.groq.com → API Keys | one of the two |

Type them straight into Render. Do not put them in a file in this repository —
it is public, and a committed key is a leaked key.

Optional, only if you need them:

| Variable | Default | What it does |
|---|---|---|
| `LLM_ORDER` | `gemini,groq` | Who is asked first |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model names change; override without a code change |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Same |
| `LLM_TIMEOUT_MS` | `45000` | How long to wait for one provider |

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

## Honest limits

- The chat has **no memory between messages**. Each message is sent on its own.
  Conversation history needs somewhere durable to live, which on Render's free
  tier means `STORE=github` or a real host, not the container disk.
- It has **no browser and no search** in this turn. The standing orders tell it
  to say a live fact needs checking rather than guessing, but that is a rule it
  follows, not a capability it has. Real verification needs tools it does not
  have yet.
- It **cannot act** — it drafts and plans. Nothing it says causes an external
  action on its own.
