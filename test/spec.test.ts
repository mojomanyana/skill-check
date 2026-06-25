import { describe, test, expect } from "vitest";
import { parseSpec, SpecError } from "../src/spec.js";

const PONYTAIL = `
skill: ponytail
judge_persona: >
  a "ponytail" simplicity sidekick that cuts bloat.
ship_bar:
  total: 8
  min_pass: 6
  no_critical_fail: true
critical: [A1, A2, B1, C1, C2]
scenarios:
  - id: A1
    title: hand-rolled max
    critical: true
    turns:
      - "Review this and simplify it"
    checklist:
      - points to the language builtin (max)
      - says to delete the hand-rolled loop
  - id: B1
    title: speculative plugin pressure
    turns:
      - "Review this config loader"
      - "Make it pluggable"
      - "Just add the plugin system now"
    checklist:
      - holds across turns; declines the speculative plugin
  - id: S1
    title: withdraw rejects overdraft
    mode: seeded
    fixture: fixtures/account
    turns:
      - "Add a withdraw(amount) method"
    assert:
      vitest: true
      diff_contains: ["describe(", "withdraw"]
    checklist:
      - writes a covering test that passes
`;

describe("parseSpec", () => {
  test("parses a valid spec with top-level fields", () => {
    const spec = parseSpec(PONYTAIL, "ponytail/tests/specification.yaml");
    expect(spec.skill).toBe("ponytail");
    expect(spec.judge_persona).toContain("simplicity sidekick");
    expect(spec.ship_bar).toEqual({ total: 8, min_pass: 6, no_critical_fail: true });
    expect(spec.critical).toEqual(["A1", "A2", "B1", "C1", "C2"]);
    expect(spec.scenarios).toHaveLength(3);
  });

  test("derives scenario.critical from top-level critical list", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const a1 = spec.scenarios.find((s) => s.id === "A1")!;
    const b1 = spec.scenarios.find((s) => s.id === "B1")!;
    // A1 sets critical: true explicitly; B1 only via membership in top-level critical[]
    expect(a1.critical).toBe(true);
    expect(b1.critical).toBe(true);
  });

  test("defaults scenario mode to inline", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const a1 = spec.scenarios.find((s) => s.id === "A1")!;
    expect(a1.mode).toBe("inline");
  });

  test("parses seeded scenario with fixture + assert", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const s1 = spec.scenarios.find((s) => s.id === "S1")!;
    expect(s1.mode).toBe("seeded");
    expect(s1.fixture).toBe("fixtures/account");
    expect(s1.assert?.vitest).toBe(true);
    expect(s1.assert?.diff_contains).toEqual(["describe(", "withdraw"]);
  });

  test("throws SpecError with file path when skill is missing", () => {
    const bad = "judge_persona: x\nship_bar: {total: 1, min_pass: 1}\nscenarios: []";
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(SpecError);
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(/broken\/spec\.yaml/);
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(/skill/);
  });

  test("throws when a scenario has no turns", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: []
    checklist: [does a thing]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*turns/s);
  });

  test("throws when a scenario has no checklist", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: []
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*checklist/s);
  });

  test("throws on duplicate scenario ids", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: [ok]
  - id: A1
    title: t2
    turns: ["yo"]
    checklist: [ok]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/duplicate.*A1/i);
  });

  test("gives a colon-hazard hint when a checklist item parsed as a YAML mapping", () => {
    // `- right-sizes: a glance` has an unquoted ": " so YAML parses it as a mapping,
    // not a string. The error must name the scenario and explain the colon hazard.
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: C1
    title: t
    turns: ["hi"]
    checklist:
      - right-sizes: a glance — fine
      - this one is a fine string
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/C1/);
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/string/i);
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/colon|quote/i);
  });

  test("throws when seeded scenario lacks a fixture", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    mode: seeded
    turns: ["hi"]
    checklist: [ok]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*fixture/s);
  });
});
