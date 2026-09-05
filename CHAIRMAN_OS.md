# Chairman Agent OS

`chairman.js` is the full system — business factory, domain desk, growth engine,
missions, skills, agents, self-repair, roughly 130 endpoints. One file, no npm
dependencies, its own interface and its own login.

`chairman-enhanced.js` is the small earlier service that has been deployed until
now. It stays in the repo so nothing breaks mid-switch, but it is not the system
you built.

## Switching the Render service over

Render's API cannot change a start command, so the first step is manual.

**1. Change the start command.** Render dashboard → `chairman-service` →
Settings → Start Command:

```
node chairman.js
```

**2. Set the login.** Same service → Environment → Environment Variables:

| Variable | Value |
|---|---|
| `OWNER_ID` | the owner id you want |
| `OWNER_PW` | your password, typed straight into Render |

Without these it invents a bootstrap password at startup and writes it to a file
on disk. Render wipes that disk, so it would invent a different one on every
restart and you could never log in twice with the same credentials.

**3. Make the data survive.** This is the step that matters most. Everything
that has gone wrong in this project traces back to Render's disk being wiped on
every redeploy and every idle spin-down. The system already solves this: its own
notes describe `STORE=github` as "a private GitHub repo acts as the disk."

- Create a **private** repository to hold state, for example `karan-state`.
- Create a fine-grained personal access token with **Contents: read and write**,
  scoped to that one repository only.
- Add to the service's environment:

| Variable | Value |
|---|---|
| `STORE` | `github` |
| `GH_TOKEN` | the fine-grained token |
| `GH_REPO` | `your-username/karan-state` |
| `GH_BRANCH` | `main` |

The repository must be private. It will hold your ideas, ventures, drafts,
credentials hashes and chat history.

Leave `STORE` unset and it falls back to the local disk, which on Render means
losing everything on the next restart.

**4. Reach it.** The dashboard's Chairman OS tab opens it in a new tab. It has
its own login, separate from the dashboard's.

## What was deliberately not committed

The `data.json` you attached is not in this repository and should not be. It
contains an LLM API key and your owner credential hash, and this repository is
public. Its runtime files — `data.json`, `owner.json`, `sessions.json`,
`OWNER_CREDENTIALS.txt` — are gitignored.

That file held two chat messages, no ideas and no ventures, so nothing of
substance is lost by starting clean. Configure the LLM key through the system's
own interface once it is running, never by committing it.

## Render free tier, honestly

This system was written for a host that stays up — the `chairman-os.service`
unit you have targets a VPS or Oracle Cloud Always-Free. On Render's free tier:

- The service sleeps after about 15 minutes idle and takes up to a minute to
  wake. The watchdog's health pings reduce how often that happens.
- Long-running agent work is cut short when the service sleeps.
- Without `STORE=github`, all state is lost on every restart.

With `STORE=github` set, the free tier is workable for using the system. If you
want the agents and missions running continuously, a small always-on host is the
right home, and the systemd unit is already written for it.
