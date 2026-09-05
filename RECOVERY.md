# Automatic recovery

What repairs itself, what does not, and why. This file replaces
`DEPLOYMENT_READINESS.md`, which described an auto-fixing system that did not
exist: its "specialist agents" returned hardcoded success without making a
single call, and nothing scheduled them, so they never ran.

## Setup — one step required

The watchdog can detect failures with no configuration, but it cannot repair
anything without permission to act on your Render account.

1. Create a Render API key: Render dashboard → Account Settings → API Keys.
2. Add it to GitHub: repository → Settings → Secrets and variables → Actions →
   New repository secret, named `RENDER_API_KEY`.

Until that secret exists the watchdog still runs, still detects outages, and
still opens an issue — it simply reports that it cannot repair, rather than
pretending it did.

To see what it would do without letting it act: Actions → Service watchdog →
Run workflow, leaving "dry run" ticked.

## The three layers

### 1. Prevention, at push time

`npm test` runs before every push via `.husky/pre-push`, and blocks the push if
anything fails. It covers the failures that have actually happened here:

- every service file parses — two syntax errors reached production because the
  old suite only searched files for strings and never executed anything
- the JavaScript served to the browser parses, which the check above cannot see
  because that code lives inside a template literal
- no credentials are committed, and the password salt is not hardcoded
- the login page cannot reintroduce the redirect loop
- health checks do not depend on backend CORS
- the proxy identifies itself to the backends

### 2. Detection and repair, every 5 minutes

`.github/workflows/watchdog.yml` runs `scripts/watchdog.js` on a schedule. It
runs on GitHub rather than on Render deliberately: an in-process monitor is
unavailable exactly when it is needed, because it goes down with the service it
watches.

Each run:

1. Requests `/api/health` on all four services. This doubles as a keep-alive —
   the request is what stops a free-tier service idling into a cold start.
2. Re-checks anything that failed. One failed request is not an outage, and a
   needless restart causes the downtime the watchdog exists to prevent.
3. Repairs what is repairable, through the Render API:
   - the newest deploy failed to build or start → roll back to the last deploy
     that was actually live
   - the deploy is fine but the service will not answer → restart it
4. Confirms every repair against the API's real response. Nothing is reported as
   fixed unless Render accepted it.
5. Opens a GitHub issue labelled `service-down` for anything left unresolved,
   comments on that same issue while the outage continues rather than opening a
   new one every five minutes, and closes it once everything is healthy.

### 3. Everything else

Some failures cannot be repaired by a script, and the watchdog says so instead
of guessing:

| Failure | Why it is not automatic |
|---|---|
| A logic bug in the code | Needs a code change, not a restart |
| A missing or wrong secret | The correct value is not guessable |
| Failing again right after a rollback | Rolling back repeatedly would loop |
| A failing dependency outside Render | Not ours to restart |

These land as a GitHub issue containing the full diagnosis, which is the point
at which a person or a coding agent picks it up.

## Honest limits

- **Five minutes, not seconds.** That is the finest schedule GitHub Actions
  offers, and scheduled runs are best-effort — under load GitHub can delay them
  further. Recovery inside seconds would need an always-on host, which the free
  tier does not provide. What *is* immediate is prevention: a bad deploy is
  stopped at push time, before it can take anything down.
- **The repair path has not been exercised against the live API.** The health
  checking, retry logic and reporting are covered by `scripts/test-integration.js`,
  which runs the real script against real servers. The rollback and restart calls
  are written against Render's documented API but have not yet fired in anger.
  The first genuine outage is their first real test — run the dry run first if
  you would rather watch before trusting it.
- **A restart is not a fix.** If a service crash-loops, restarting it buys time
  and nothing more. The issue it raises is the actual deliverable.

## Running it by hand

```bash
npm run watchdog:dry    # diagnose and report, change nothing
npm run watchdog        # repair, with RENDER_API_KEY set
npm test                # prevention suite, the same one the pre-push hook runs
```
