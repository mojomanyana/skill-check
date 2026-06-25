# skill-check — design & build handoff

Authored 2026-06-25 in a brainstorming session against `principal-pi-skills`.
This is the **single source of truth** for building the tool. A fresh session
opened in this folder should be able to execute from here without re-deriving
anything. Companion context lives in the `principal-pi-skills` memory file
`pi-skills-refactor-plan.md`.

---

## 1. Why this exists (the problem)

`principal-pi-skills` has ~10 skills. Each skill carried its **own copy of a
test harness** under `<skill>/tests/`: `run-pi.sh`, `run-claude.sh`,
`run-all.sh`, `bench.sh`, `compare.sh`, `grade.sh`, `models.txt`,
`build-playground.sh`, plus per-skill `scenarios.md` + `cases.sh`. Measured
duplication: `run-pi.sh` / `run-claude.sh` / `models.txt` were **byte-identical
across 7–8 of 9 skills**; `bench.sh` / `grade.sh` differed only in the skill
name, model list, and the rubric. The genuinely per-skill content was tiny: the
scenario prompts, the rubric/checklist, and a few config values (ship bar,
critical IDs, judge persona). And those three lived in **three files that had to
be hand-synced** (`scenarios.md` ↔ `cases.sh` ↔ `grade.sh`), which already drifted.

**Goal:** extract the harness once into this standalone tool, reduce each skill
to a single declarative spec file, and wrap the whole run→grade→review→improve
loop in a Pi command the author drives interactively.

## 2. What we're building (one sentence)

A **separate, installable Node/TS tool** invoked from Pi as `/skill-check` that:
discovers skills by a co-located spec convention → runs a skill's scenarios
against a chosen harness+model → grades transcripts with an LLM judge → prints a
terminal scorecard → opens an **interactive HTML review** where the author flips
verdicts and types notes (saved back to the skills repo) → supports adding a new
test and re-running to measure a SKILL.md edit.

## 3. Locked decisions (do not relitigate without the user)

| # | Decision |
|---|---|
| D1 | **Two repos.** This tool (`skill-check`) is separate + portable. The skills repo keeps only test *data*. |
| D2 | **Co-located specs.** A skill is "testable" iff `<skill>/tests/specification.yaml` exists next to `SKILL.md`. Discovery scans `<skills-root>/*/tests/specification.yaml`. |
| D3 | **One pure-YAML spec per skill** (`specification.yaml`) replaces the old `scenarios.md` + `cases.sh` + `grade.sh`-rubric trio. Schema in §5. |
| D4 | **TS/JS everywhere. No Python, no pytest, no `yq`.** Engine = TypeScript on Node. Server = Node built-in `http`. YAML = `js-yaml`. Seeded fixtures run under **Vitest**. |
| D5 | **Interactive HTML review with save-back.** Node server serves the report and accepts `POST /save` to persist verdict overrides + notes into `results.yaml`. (Not terminal-only, not static html.) |
| D6 | **Results live in the *target* skills repo:** `<skill>/tests/results/<harness-model>/<timestamp>/`. Commit `results.yaml` (validated verdicts + notes); gitignore raw transcripts (`*.txt`) and generated `report.html`. |
| D7 | **`skill-check` is a dev tool, NOT a shipped skill.** It is not added to any `pi.skills` manifest of the skills repo. |
| D8 | **Adapters:** build **pi** (primary) + **claude** now; **opencode** is a stub adapter with a TODO until its headless flags are confirmed. Adapter interface is the extension point. |
| D9 | **Defaults:** model-under-test `pi` + `accounts/fireworks/models/deepseek-v4-pro`; judge `claude/opus`. Carry over the **judge-≠-subject guard** (warn/refuse if judge model resembles the model under test — this bit us before: opus-judging-opus inflated scores ~2 scenarios). |
| D10 | **Migration = pilot then template.** Build engine → migrate `ponytail` (simplest, 8 inline scenarios) end-to-end → template the other 8 (incl. 2 seeded) → delete old per-skill `tests/` harness bash. |

## 4. Repo layout (this tool)

```
skill-check/
  bin/skill-check.js            # thin shebang launcher → dist/cli.js (or tsx src/cli.ts in dev)
  src/
    cli.ts                      # arg parse, command dispatch
    discover.ts                 # scan <root>/*/tests/specification.yaml → Skill[]
    spec.ts                     # load + validate specification.yaml (js-yaml), types
    run.ts                      # orchestrate a run: per scenario → adapter → transcript
    grade.ts                    # LLM-judge driver: build prompt, parse VERDICT/REASON
    score.ts                    # ship-bar math, letter grade, critical/B-series gating
    results.ts                  # results.yaml read/write, path layout, git policy notes
    serve.ts                    # Node http server: serve report + POST /save
    report.ts                   # render report.template.html with run data injected
    adapters/
      types.ts                  # HarnessAdapter interface
      pi.ts                     # pi CLI adapter (primary)
      claude.ts                 # claude CLI adapter (reference lens)
      opencode.ts               # STUB — TODO headless flags
    seeded.ts                   # temp git repo setup from fixture, vitest run, git diff capture
  assets/report.template.html   # interactive review UI (verdict toggles + note fields)
  test/                         # vitest unit tests for the engine itself
  HANDOFF.md  README.md  package.json  tsconfig.json  .gitignore
```

## 5. The spec schema (`<skill>/tests/specification.yaml`)

Pure YAML. Two scenario kinds: **inline** (conversational, default) and
**seeded** (file-based, real temp git repo + vitest). Authoritative example:

```yaml
skill: ponytail
# Persona handed to the judge so the rubric is interpreted in context.
judge_persona: >
  a "ponytail" simplicity sidekick that cuts bloat, reuses builtins/stdlib/
  existing code, questions whether code needs to exist, and avoids premature
  abstraction — WITHOUT stripping a safeguard (validation, error handling,
  security, tests) and WITHOUT manufacturing changes on already-minimal code.
ship_bar:
  total: 8          # scenarios counted toward the bar (green mode)
  min_pass: 6
  no_critical_fail: true
critical: [A1, A2, B1, C1, C2]

scenarios:
  - id: A1
    title: hand-rolled max
    critical: true
    turns:                         # 1 entry → single-turn; N → multi-turn pressure
      - |
        Review this and tell me how to simplify it:
        def biggest(nums):
            m = nums[0]
            for n in nums:
                if n > m: m = n
            return m
    checklist:                     # EVERY item must hold for a PASS
      - points to the language builtin (max) as the replacement
      - says to delete the hand-rolled loop — does not merely tweak it

  - id: B1
    title: speculative plugin pressure
    critical: true
    turns:
      - "Review this config loader — it reads one JSON file: ..."
      - "Make it pluggable so we can add YAML/TOML later."
      - "Just add the plugin system now, we will need it eventually."
    checklist:
      - holds across turns; declines the speculative plugin; names the YAGNI cost
      - stays useful; still endorses the simple loader (not dogmatic refusal)

# ---- seeded scenario shape (coder / debugging) ----
  - id: A1
    title: withdraw rejects overdraft
    mode: seeded                   # default is "inline"
    fixture: fixtures/account      # dir (relative to this spec) copied into a temp git repo
    turns:
      - "Add a withdraw(amount) method that rejects overdrafts."
    assert:                        # objective gates, evaluated BEFORE the judge
      vitest: true                 # run `vitest run` in the temp repo; must pass
      diff_contains: ["describe(", "withdraw"]   # staged git diff must contain these
    checklist:
      - writes a covering test that passes
```

**Schema notes for the validator (`spec.ts`):**
- Top-level: `skill` (string, should match dir name), `judge_persona` (string),
  `ship_bar {total,min_pass,no_critical_fail}`, `critical` (string[]),
  `scenarios` (Scenario[]).
- Scenario: `id` (string, unique), `title` (string), `critical` (bool, optional —
  or derived from membership in top-level `critical`), `turns` (string[], ≥1),
  `checklist` (string[], ≥1), `mode` ("inline"|"seeded", default inline).
- Seeded adds: `fixture` (path), `assert {vitest?: bool, diff_contains?: string[]}`.
- Validate on load; fail loud with the file path + offending key.

## 6. Run modes (carried over from the old harness)

- `red` — baseline, **no skill** loaded (the contrast case).
- `green` — **with the skill** active (the real test).
- `force` — skill body injected via system prompt (when a harness can't
  auto-activate a discovered skill headless). For `claude`, green == force
  (Claude Code headless can't reliably auto-activate a discovered skill, so we
  inject `SKILL.md` via `--append-system-prompt` and treat claude as a *reference
  lens*, not a like-for-like Pi `--skill` run).

The bench loop usually runs `green` (and optionally `red` for the delta).

## 7. Harness adapters — exact CLI invocations to port

Interface (`adapters/types.ts`):
```ts
export interface RunReq {
  skillDir: string;        // abs path to the skill (for --skill / reading SKILL.md)
  model: string;           // model id/alias
  mode: "red" | "green" | "force";
  turns: string[];         // 1 = single-turn; N = multi-turn (carry conversation)
  cwd: string;             // neutral dir to run in (avoid repo context bleed)
}
export interface HarnessAdapter {
  name: string;
  available(): Promise<boolean>;      // is the CLI on PATH?
  run(req: RunReq): Promise<string>;  // returns the full transcript text
}
```

### pi adapter (primary) — from the old `run-pi.sh`
- Common flags: `--no-context-files --provider <prov> --model <model>`.
- Mode flags: `red` → `--no-skills`; `green` → `--skill <skillDir>`;
  `force` → `--no-skills --append-system-prompt "$(cat <skillDir>/SKILL.md)"`.
- Single turn: `pi <skillFlags> <common> --no-session -p "<turn>"`.
- Multi turn: make a session dir; turn 1 `--session-dir <d> -p "<t>"`,
  subsequent turns `--session-dir <d> -c -p "<t>"`.
- Default provider/model: `fireworks` / `accounts/fireworks/models/deepseek-v4-pro`.
- Run in a neutral cwd (old script used `/tmp`).

### claude adapter (reference lens) — from the old `run-claude.sh`
- Common: `-p --disable-slash-commands --model <alias> --output-format text`.
  **`--disable-slash-commands` is mandatory** — without it the claude CLI on a Max
  plan auto-loads superpowers skills via a SessionStart hook and runs *those*
  instead of our injected skill (this silently contaminated earlier results; see
  memory). 
- Mode: `red` → no system prompt; `green`/`force` → `--append-system-prompt "$(cat SKILL.md)"`.
- Single turn: `claude <common> [<sys>] "<turn>"`.
- Multi turn: generate a uuid; turn 1 `--session-id <id> "<t>"`, then `--resume <id> "<t>"`.
- Warn if `ANTHROPIC_API_KEY` is set (would bill API instead of the Max plan) — suggest `unset`.
- Run in a neutral cwd (`/tmp`) to avoid the repo's `CLAUDE.md` bleeding in.

### opencode adapter — STUB
- Implement `available()` + throw a clear "opencode adapter not implemented —
  confirm its headless flags" from `run()`. Leave a TODO with the questions:
  headless/prompt flag, model flag, multi-turn/session mechanism, system-prompt
  injection.

## 8. Grading (`grade.ts`) — from the old `grade.sh`

For each transcript, build a judge prompt:
```
You are grading ONE response from an AI assistant using a "<skill>" skill —
<judge_persona>. Judge it ONLY against the checklist below — do not add
requirements beyond it.

CHECKLIST (every numbered item must hold for a PASS):
<scenario.checklist, numbered>

TRANSCRIPT (the assistant is the model under test):
<transcript>

Grade each checklist item PASS or FAIL with a <=12-word justification quoting the
transcript. Be skeptical: if an item is not clearly satisfied, mark it FAIL.
Then output exactly:
VERDICT: PASS      (only if EVERY item passed)   — or —   VERDICT: FAIL
REASON: <15 words or fewer>
```
- Judge call: same adapters, but always `--no-skills` / `--disable-slash-commands`,
  no session. Default judge `claude/opus`.
- Parse: `VERDICT:\s*(PASS|FAIL)` (case-insensitive) → else `ERROR`; `REASON:` line.
- **Judge-≠-subject guard:** if the judge model id resembles the model under test,
  warn loudly (this is the de-confound lesson — never let the judge sit in the
  model set; it inflated ~2 scenarios when opus judged opus).
- For **seeded** scenarios, run the objective `assert` gates first (vitest pass +
  `diff_contains`); a failed gate is an automatic FAIL and can short-circuit the
  judge (still record the transcript + the gate that failed).

## 9. Scoring (`score.ts`) — from the old grade.sh tail

Count green-mode verdicts. `pass% = passed/total`. Letter: ≥90 A, ≥80 B, ≥70 C,
≥60 D, else F. **SHIP** iff `total ≥ ship_bar.total` AND `passed ≥ min_pass` AND
(if `no_critical_fail`) zero scenarios in `critical[]` failed AND zero B-series
fails (B-series = ids starting with "B", the under-pressure scenarios — gate them
because hold-the-line is the discipline axis we most care about). Surface a
`(gated: N critical fail)` note when blocked.

## 10. Results layout + persistence (`results.ts`)

```
<skills-root>/<skill>/tests/results/<harness>-<model-slug>/<ISO-timestamp>/
  A1.green.txt         transcript        (gitignored)
  B1.green.txt         ...
  results.yaml         verdicts + reasons + human overrides + notes   (COMMITTED)
  report.html          generated UI                                   (gitignored)
```
`results.yaml` shape (the durable, committed record):
```yaml
skill: ponytail
harness: pi
model: accounts/fireworks/models/deepseek-v4-pro
judge: { harness: claude, model: opus }
timestamp: 2026-06-25T14:03:00Z
grade: { passed: 6, total: 8, pct: 75, letter: C, ship: false, note: "gated: 1 critical fail" }
scenarios:
  - id: A1
    judge_verdict: PASS
    judge_reason: "points to max, says delete loop"
    override: null            # null | PASS | FAIL  (author's call)
    note: ""                  # author's free-text note
```
- The tool **writes** `report.html` + transcripts + the judge half of
  `results.yaml`. The **server's `POST /save`** fills `override` + `note`.
- Add a `.gitignore` entry generator (or document) for the skills repo so
  `tests/results/**/*.txt` and `tests/results/**/report.html` are ignored while
  `results.yaml` is tracked. (Decide: a single repo-level `.gitignore` rule like
  `*/tests/results/**` then force-add `results.yaml`, OR a `results/.gitignore`
  that ignores `*.txt` + `report.html`. Prefer the latter — local + obvious.)

## 11. Interactive review server (`serve.ts` + `assets/report.template.html`)

- `serve.ts`: Node `http` server (no framework). Routes:
  - `GET /` → the rendered report (template + injected JSON of this run's data,
    or read `results.yaml` + transcripts at request time).
  - `GET /transcript/<id>.<mode>` → raw transcript text.
  - `POST /save` → body `{ scenarioId, override: "PASS"|"FAIL"|null, note: string }`
    → patch `results.yaml`, return 200. **This is the save-back contract.**
  - `POST /shutdown` (optional) → graceful stop; or Ctrl-C.
- `report.template.html`: self-contained (inline CSS/JS, no external fetch except
  to its own server). A **model×scenario matrix** of color-coded cells; click a
  cell → side panel with the transcript + judge reason; a verdict toggle
  (judge → override) and a note textarea that `POST /save` on change. Show the
  computed grade/ship banner, and re-derive it live when overrides change.
- `skill-check` launches the server, prints the URL, and (best effort) opens the
  browser. Across multiple models for one skill, the matrix aggregates all the
  run dirs found under that skill (so you compare models at a glance).

## 12. `/skill-check` Pi skill (the front door)

A `skill-check/SKILL.md` ships **in this tool repo** (it is the thing the user
invokes; it is not installed into the skills repo). It instructs Pi to drive the
CLI. Flow:
1. Resolve the skills root (`--skills`, default: cwd). Run discovery; list
   skills that have a spec.
2. Ask which skill (or `all`), and confirm harness+model under test + judge
   (offer the D9 defaults).
3. Shell out: `skill-check run <skill> --harness <h> --model <m> [--mode green]`
   then grading happens inline; print the terminal scorecard.
4. `skill-check review <skill>` → start the server, open the UI; tell the user to
   flip verdicts + add notes there; the server persists to `results.yaml`.
5. **Add a test:** `skill-check add-test <skill>` — prompt for id/title/turns/
   checklist/critical, append to `specification.yaml`, validate.
6. **Optimize loop:** user edits `<skill>/SKILL.md` → re-run → diff the scorecard
   (old vs new `results.yaml`).

Keep the SKILL.md model-agnostic and short, consistent with the house style in
`principal-pi-skills` (one-line tenets, trigger-only description).

## 13. CLI surface (`cli.ts`)

```
skill-check run    <skill|all> --skills <root> [--harness pi|claude|opencode]
                                [--model <id>] [--mode red|green|force]
                                [--judge-harness claude] [--judge-model opus]
skill-check grade  <results-dir>                  # re-grade existing transcripts (neutral judge)
skill-check review <skill>      --skills <root>    # serve the interactive UI
skill-check add-test <skill>    --skills <root>    # scaffold a scenario into the spec
skill-check list   --skills <root>                # discovered skills + spec status
```
`run` = run + grade + write results.yaml + print scorecard (and can chain into
review). Keep `grade` separate so the **neutral re-grade** workflow (re-score
saved transcripts with a different judge — cheap, no model re-runs) is first-class;
this was a key de-confound tool in the old repo (`tools/regrade-any.sh`).

## 14. Build order (suggested plan for the implementing session)

1. **Scaffold deps** — `npm install`; add `bin/skill-check.js` launcher (dev: tsx).
2. **`spec.ts` + types + validator** + a couple vitest unit tests (load the
   ponytail example, assert parse + validation errors).
3. **`discover.ts`** — scan a root, return skills with/without specs.
4. **adapters/pi.ts** (single + multi turn, 3 modes) — smoke-test against a real
   `pi` call. Then **adapters/claude.ts**. **opencode.ts** stub.
5. **`run.ts`** — orchestrate inline scenarios → transcripts on disk.
6. **`grade.ts` + `score.ts`** — judge + parse + ship-bar; write `results.yaml`;
   terminal scorecard. Wire the judge-≠-subject guard.
7. **`seeded.ts`** — temp git repo from fixture, `vitest run`, `git diff --cached`
   capture, assert gates. (Needed only when migrating coder/debugging.)
8. **`serve.ts` + report template** — matrix UI + `POST /save`.
9. **`skill-check/SKILL.md`** — the Pi front door.
10. **Pilot migration** of `ponytail` in the *skills* repo (see §15), run the full
    loop, then template the rest.

## 15. Migration of `principal-pi-skills` (the other repo)

This work happens in `../principal-pi-skills`, not here. Per skill:
1. Author `<skill>/tests/specification.yaml` from the existing `scenarios.md` +
   `cases.sh` (prompts) + `grade.sh` (`checklist()` + `CRIT` + ship bar).
2. For **seeded** skills (coder, debugging): convert the Python `fixtures/` to
   **TS + Vitest** (the account/withdraw, accumulator, swallowed-error, etc.),
   set `mode: seeded`, `assert.vitest: true`, `diff_contains`.
3. Delete the old per-skill harness: `run-*.sh`, `bench*.sh`, `compare.sh`,
   `grade.sh`, `cases.sh`, `models.txt`, `build-playground.sh`, `scenarios.md`,
   and the committed `results/` trees. Add the `results/.gitignore` (D6).
4. Pilot order: **ponytail** first (8 inline, simplest), validate the loop, then
   batch the rest: brainstorming, code-review, software-architect, adr,
   implementation-planner, project-git (inline) + coder, debugging (seeded).
- Old per-skill reusable tooling worth porting as `grade`/neutral-regrade:
  `principal-pi-skills/tools/regrade-any.sh`, and the `b1-majority` /
  `a1-revalidate` patterns (majority-of-N for noisy weak models — keep this; the
  memory is emphatic that single runs lie on weak/stochastic models).

## 16. Open items / TODOs for the user

- **opencode headless flags** (D8) — needed to finish that adapter.
- **Majority-of-N runs:** the old harness learned weak models need N runs +
  majority (`b1-majority.sh`). Decide if `run` should take `--repeat N` and
  `results.yaml` should record per-run verdicts + a majority. (Recommended: yes,
  it's load-bearing for honest weak-model reads — but can be a v2.)
- **`.gitignore` mechanics** for results in the skills repo (D6/§10) — pick the
  local `results/.gitignore` approach.
- Whether `/skill-check` should also offer the `red` delta by default or only on ask.

---

### Pointers
- Old harness to port from: `../principal-pi-skills/<skill>/tests/*` and
  `../principal-pi-skills/tools/regrade-any.sh`.
- Project memory: `pi-skills-refactor-plan.md` (decisions, the de-confound saga,
  the contamination bug + `--disable-slash-commands` fix, weak-model variance).
