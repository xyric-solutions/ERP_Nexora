/**
 * Chart palette gates.
 *
 * The dashboard chart colours were previously brand and STATUS tokens
 * (`--nx-success`, `--nx-warning`, `--nx-danger`) plus a few un-validated
 * hard-coded hexes, and the slot assigner cycled, so an eighth series reused
 * slot 1. They are now a cool categorical palette computed in OKLCH and
 * checked with the dataviz validator.
 *
 * These values are PINNED. Changing one means re-running the validator:
 *   node scripts/validate_palette.js "<seven hexes>" --mode light  --surface "#ffffff"
 *   node scripts/validate_palette.js "<seven hexes>" --mode dark   --surface "#0b1524"
 *
 * Recorded results for the pinned set:
 *   light - lightness PASS, chroma PASS, CVD deutan dE 17.8 (target 8),
 *           normal-vision dE 18.3 (floor 15), contrast all >= 3:1
 *   dark  - CVD deutan dE 12.8, normal-vision dE 15.3, contrast all >= 3:1
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));

/** Strip comments so documentation never satisfies a source check. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function cssSource() {
  const names = (await readdir(appDir)).filter((n) => n.endsWith(".css"));
  const parts = await Promise.all(names.map(async (n) => ({ name: n, source: await readFile(appDir + n, "utf8") })));
  return parts;
}

const LIGHT = ["#4f8fbf", "#713c87", "#03a1b5", "#5d4496", "#019696", "#4b4a9c", "#6487d9"];
const DARK = ["#0d9de5", "#1d67bb", "#708cef", "#954ea5", "#09aa9d", "#7455b8", "#0098a4"];

test("the chart palette is exactly the validated cool set", async () => {
  const tokens = await readFile(appDir + "tokens.css", "utf8");
  const lower = tokens.toLowerCase();

  for (let i = 1; i <= 7; i += 1) {
    assert.ok(tokens.includes(`--nx-series-${i}:`), `--nx-series-${i} must be defined`);
  }
  for (const hex of [...LIGHT, ...DARK]) {
    assert.ok(lower.includes(hex), `validated palette value ${hex} is missing - was the palette changed without re-validating?`);
  }

  const slots = [...tokens.matchAll(/--nx-series-[1-7]:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
  assert.equal(slots.length, 14, "seven slots each for light and dark");

  // Cool only: no slot may be red-dominant.
  for (const hex of slots) {
    const r = parseInt(hex.slice(1, 3), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assert.ok(r <= b + 8, `series colour ${hex} is warm; this palette is cool-only`);
  }

  // The ordinal ramp exists for ordered stages (funnels, tiers).
  for (let i = 1; i <= 5; i += 1) {
    assert.ok(tokens.includes(`--nx-ordinal-${i}:`), `--nx-ordinal-${i} must be defined`);
  }
  // Status tones are reserved and separate.
  for (const token of ["--nx-status-good", "--nx-status-warn", "--nx-status-risk", "--nx-status-bad"]) {
    assert.ok(tokens.includes(token + ":"), `${token} must be defined`);
  }
});

test("a status colour is never used as a series colour", async () => {
  const files = await cssSource();
  const all = files.map((f) => code(f.source)).join("\n");

  // This is the exact defect that made the dashboards look wrong: the chart
  // aliases pointed at status tokens, so "series 3" was the success green.
  assert.doesNotMatch(
    all,
    /--nx-viz-[a-z0-9]+:\s*var\(--nx-(?:success|warning|danger)\)/,
    "a status token must never back a series colour",
  );

  // And the un-validated hard-coded chart hexes are gone.
  for (const dead of ["#8b5cf6", "#7c3aed", "#d8932b", "#35a9d8", "#a1adbc"]) {
    assert.ok(!all.includes(dead), `un-validated chart hex ${dead} must be gone`);
  }

  // Nothing may reference the deleted viz slots.
  assert.doesNotMatch(all, /--nx-viz-[0-9]/, "the old --nx-viz-N slots were replaced by --nx-series-N");
});

test("series slots are assigned in fixed order and never cycled", async () => {
  const charts = code(await readFile(appDir + "role-dashboard-charts.tsx", "utf8"));

  // Fixed order is the colour-blind-safety mechanism.
  const order = /toneOrder: readonly ChartCategoricalTone\[\] = \[([^\]]*)\]/.exec(charts);
  assert.ok(order, "the categorical order must be declared");
  const names = [...order[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["blue", "plum", "cyan", "violet", "teal", "indigo", "sky"]);

  // Cycling reused slot 1 for an eighth series, making two series identical.
  assert.doesNotMatch(charts, /toneOrder\[index % toneOrder\.length\]/, "slots must never be cycled");
  assert.match(charts, /index < toneOrder\.length/, "overflow must be handled explicitly");
  assert.match(charts, /"other"/, "overflow folds into one neutral tone");

  // Each tone resolves to the right channel.
  const map = /chartToneColor: Record<ChartTone, string> = \{([\s\S]*?)\n\};/.exec(charts);
  assert.ok(map, "the tone map must exist");
  const entries = [...map[1].matchAll(/(\w+):\s*"([^"]+)"/g)];
  assert.ok(entries.length >= 11, `expected the full tone map, found ${entries.length}`);
  for (const [, tone, value] of entries) {
    if (["good", "warn", "risk", "bad"].includes(tone)) {
      assert.match(value, /var\(--nx-status-/, `status tone "${tone}" must use a status token`);
    } else if (tone === "other") {
      assert.match(value, /var\(--nx-text-subtle\)/, 'the "other" tone must be neutral');
    } else {
      assert.match(value, /var\(--nx-series-[1-7]\)/, `categorical tone "${tone}" must use a series token`);
    }
  }
});

test("ordered stages use the ordinal ramp, not categorical identity", async () => {
  const charts = code(await readFile(appDir + "role-dashboard-charts.tsx", "utf8"));
  // Funnel stages are ordinal: swapping them would change the meaning, so the
  // colour has to carry the order.
  assert.match(charts, /ordinalAt\(index, stages\.length\)/, "funnel stages must take the ordinal ramp");
  assert.match(charts, /ordinalRamp/, "the ordinal ramp must be declared");
});

test("scatter carries one slot, because all-pairs separation caps the count", async () => {
  const charts = code(await readFile(appDir + "role-dashboard-charts.tsx", "utf8"));
  const scatter = charts.slice(charts.indexOf("export function ScatterChart"));
  const circle = scatter.slice(scatter.indexOf("<circle"), scatter.indexOf("</circle>"));

  // Any two scatter marks can sit side by side, so every pair would have to be
  // separable. No cool seven-slot palette clears that floor, and the rule is
  // to cut the series count rather than re-step the palette.
  assert.doesNotMatch(circle, /chartToneColor\[point\.tone\]/, "scatter must not colour by category");
  assert.match(circle, /var\(--nx-series-1\)/, "scatter marks take the single default slot");
});

test("the drill engine shares the same palette and does not cycle either", async () => {
  const visuals = code(await readFile(appDir + "drill/visuals.tsx", "utf8"));
  assert.match(visuals, /var\(--nx-series-1\)/, "drill visuals must use the shared palette");
  assert.doesNotMatch(visuals, /--nx-viz-[0-9]/, "drill visuals must not use the deleted viz slots");
  assert.doesNotMatch(visuals, /TONES\[index % TONES\.length\]/, "drill slots must never be cycled");
  assert.match(visuals, /OVERFLOW_TONE/, "drill overflow folds into one neutral tone");
});
