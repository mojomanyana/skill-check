# skill-check

A portable, Pi-driven **test / optimize loop for agent skills**. Point it at any
repo of skills that follow the spec convention; it runs each skill's scenarios
against a harness (Pi / Claude / opencode) and model of your choice, grades the
transcripts with an LLM judge, and opens an interactive review UI where you flip
verdicts and add notes that persist back to the skills repo.

> **Status: design + scaffold only.** No engine code is written yet.
> **Start here → [`HANDOFF.md`](./HANDOFF.md)** — the complete design, decisions,
> spec schema, and build order. Implement from that.

## Quick shape

```
skill-check --skills ../principal-pi-skills          # run all skills
skill-check --skills ../principal-pi-skills ponytail # one skill
```

- **Discovery:** scans `<skills-root>/*/tests/specification.yaml`.
- **Stack:** TypeScript + Node (no Python). Server = Node `http`. YAML = `js-yaml`.
  Seeded fixtures run under **Vitest**.
- **Results** land in the *target* skills repo at `<skill>/tests/results/…`
  (verdicts + notes committed; raw transcripts + report html gitignored).

## Dev

```
npm install
npm run dev -- --skills ../principal-pi-skills   # tsx, no build
npm test                                         # vitest (engine unit tests)
```
