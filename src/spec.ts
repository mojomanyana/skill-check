import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export type ScenarioMode = "inline" | "seeded";

export interface SeededAssert {
  vitest?: boolean;
  diff_contains?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  critical: boolean;
  mode: ScenarioMode;
  turns: string[];
  checklist: string[];
  fixture?: string;
  assert?: SeededAssert;
}

export interface ShipBar {
  total: number;
  min_pass: number;
  no_critical_fail: boolean;
}

export interface Spec {
  skill: string;
  judge_persona: string;
  ship_bar: ShipBar;
  critical: string[];
  scenarios: Scenario[];
}

/** Thrown on any validation failure. Message always carries the spec file path. */
export class SpecError extends Error {
  constructor(message: string, file: string) {
    super(`${file}: ${message}`);
    this.name = "SpecError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Require a non-empty list of strings, with a targeted error. A common authoring
 * trap: an unquoted "key: value" list item parses as a YAML mapping, not a string
 * — call that out explicitly so the fix (quote the item) is obvious.
 */
function assertStringList(v: unknown, id: string, field: string, file: string): asserts v is string[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new SpecError(`scenario \`${id}\` needs at least one \`${field}\` entry`, file);
  }
  const i = v.findIndex((x) => typeof x !== "string");
  if (i >= 0) {
    const bad = v[i];
    const hint =
      bad !== null && typeof bad === "object"
        ? ` — item #${i + 1} parsed as a YAML mapping; an unquoted ": " does that, so quote the item`
        : ` — item #${i + 1} is not a string`;
    throw new SpecError(`scenario \`${id}\` \`${field}\` items must all be strings${hint}`, file);
  }
}

/** Parse + validate a specification.yaml from its raw text. `file` is used in error messages. */
export function parseSpec(text: string, file: string): Spec {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    throw new SpecError(`not valid YAML — ${(e as Error).message}`, file);
  }
  if (doc === null || typeof doc !== "object") {
    throw new SpecError("spec must be a YAML mapping", file);
  }
  const o = doc as Record<string, unknown>;

  if (typeof o.skill !== "string" || o.skill.length === 0) {
    throw new SpecError("missing or invalid `skill` (string)", file);
  }
  if (typeof o.judge_persona !== "string" || o.judge_persona.length === 0) {
    throw new SpecError("missing or invalid `judge_persona` (string)", file);
  }

  const sb = o.ship_bar as Record<string, unknown> | undefined;
  if (!sb || typeof sb !== "object") {
    throw new SpecError("missing `ship_bar` mapping", file);
  }
  if (typeof sb.total !== "number" || typeof sb.min_pass !== "number") {
    throw new SpecError("`ship_bar` requires numeric `total` and `min_pass`", file);
  }
  const ship_bar: ShipBar = {
    total: sb.total,
    min_pass: sb.min_pass,
    no_critical_fail: sb.no_critical_fail !== false, // default true
  };

  const critical = o.critical === undefined ? [] : o.critical;
  if (!isStringArray(critical)) {
    throw new SpecError("`critical` must be a list of scenario ids (strings)", file);
  }

  if (!Array.isArray(o.scenarios)) {
    throw new SpecError("missing `scenarios` (list)", file);
  }

  const seen = new Set<string>();
  const scenarios: Scenario[] = o.scenarios.map((raw, i) => {
    if (raw === null || typeof raw !== "object") {
      throw new SpecError(`scenario #${i + 1} is not a mapping`, file);
    }
    const s = raw as Record<string, unknown>;
    const id = s.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new SpecError(`scenario #${i + 1} missing \`id\` (string)`, file);
    }
    if (seen.has(id)) {
      throw new SpecError(`duplicate scenario id \`${id}\``, file);
    }
    seen.add(id);

    if (typeof s.title !== "string" || s.title.length === 0) {
      throw new SpecError(`scenario \`${id}\` missing \`title\``, file);
    }

    const mode: ScenarioMode = s.mode === undefined ? "inline" : (s.mode as ScenarioMode);
    if (mode !== "inline" && mode !== "seeded") {
      throw new SpecError(`scenario \`${id}\` has invalid \`mode\` (inline|seeded)`, file);
    }

    assertStringList(s.turns, id, "turns", file);
    assertStringList(s.checklist, id, "checklist", file);

    const critFlag = s.critical === true || critical.includes(id);

    const scenario: Scenario = {
      id,
      title: s.title,
      critical: critFlag,
      mode,
      turns: s.turns,
      checklist: s.checklist,
    };

    if (mode === "seeded") {
      if (typeof s.fixture !== "string" || s.fixture.length === 0) {
        throw new SpecError(`seeded scenario \`${id}\` requires a \`fixture\` path`, file);
      }
      scenario.fixture = s.fixture;
      const a = s.assert as Record<string, unknown> | undefined;
      if (a) {
        const assertObj: SeededAssert = {};
        if (a.vitest !== undefined) assertObj.vitest = a.vitest === true;
        if (a.diff_contains !== undefined) {
          if (!isStringArray(a.diff_contains)) {
            throw new SpecError(`seeded scenario \`${id}\` \`assert.diff_contains\` must be strings`, file);
          }
          assertObj.diff_contains = a.diff_contains;
        }
        scenario.assert = assertObj;
      }
    }

    return scenario;
  });

  return { skill: o.skill, judge_persona: o.judge_persona, ship_bar, critical, scenarios };
}

/** Load + validate a specification.yaml from disk. */
export function loadSpec(file: string): Spec {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new SpecError(`cannot read spec file — ${(e as Error).message}`, file);
  }
  return parseSpec(text, file);
}
