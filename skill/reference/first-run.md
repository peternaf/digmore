# First run — the two gates

Read this only when `preflight.mjs` reports `NO_KEY`, or ends with `Could not confirm these are raised`, or when the user supplies or declines a key at any later point. It is not part of a configured run.

Two gates, in this order. **Each stops and waits for an answer.**

Say nothing else in the same message — no explanation of what digmore does, no command menu, no research, no "meanwhile I'll start on…". A message that asks a question and then keeps talking is not a question: the user reads to the end, finds the next thing to do, and answers nothing. That is the failure this file exists to prevent.

## Gate 1 — `NO_KEY`

Relay what preflight printed, **in full and verbatim**: the degraded notice, the two options, and the whole waitlist offer — every bullet of what a key gets them — ending on `Join by emailing waitlist@digmore.ai.`

**That line is the last thing in the message.** Nothing after it.

The bullets are the substance of the gate. Someone deciding whether to hand over an email needs to see what it buys, and the joining address has to be where their eye stops. Do not summarise the offer, reorder it, or cut it to "you'll get more sources" — it is written copy, and `preflight.mjs` prints it verbatim from the README for that reason.

Then wait. Two answers:

| The user says | Run |
|---|---|
| gives you an API key | `node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/config.mjs" set-key <value>` |
| says they don't want one | `node "${CLAUDE_PLUGIN_ROOT}/skills/digmore/scripts/config.mjs" decline` |

State both, every time. Declining has to be offered rather than guessed at — a user with no intention of joining the waitlist otherwise meets the same offer on every run with no way to stop it, and `decline` is what ends that.

After `set-key`, run `preflight.mjs` again. That is what proves the key works; a rejected key is worth knowing now rather than at the first Reddit call.

**This gate holds in `--auto` too** — the one place auto mode prompts, overriding `../brain/modes.md`. Auto exists so a run does not stop to ask what it could decide for itself. This is not that: which sources the user is entitled to reach cannot be inferred from anything on disk, and guessing it wrong returns a report quietly missing two sources they believed they had. It is reached only when there is no key and no recorded decision, so `READY` and `DECLINED` never see it — once configured, an unattended run still never prompts.

## Gate 2 — harness ceilings not raised

Preflight ends with a `HARNESS LIMITS` block. If it says `Could not confirm these are raised`, show the `env` snippet it printed and say what each ceiling costs:

- **`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`** — 200 by default. A deep run can want several hundred, and one that hits the ceiling stops mid-research and has to continue in a new session.
- **`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`** — 20 by default. Extract dispatches one sub-agent per branch, 25 or more at once; past the limit they fail rather than queue, so the run is throttled into batches and the search is narrower.

Then wait. Two answers, both of which continue:

- **Raise them** — they add the lines to `~/.claude/settings.json` themselves and start a new session for it to take effect. The plugin never edits that file.
- **Go ahead as-is** — proceed, and record in the run's Issues that the run went out under stock ceilings.

Ask once per run, after Gate 1, and never for a ceiling already raised. If preflight reports both as raised, this gate does not exist.
