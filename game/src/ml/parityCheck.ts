// CLI helper for ml/parity_test.py: reads a JSON array of feature vectors
// from argv[2], runs each through predictMove(), writes the results as a
// JSON array to stdout. Not part of the shipped game bundle -- invoked
// directly via `npx tsx` from the Python side of the parity test.
import { readFileSync } from "node:fs";
import { predictMove } from "./inference";

const fixturesPath = process.argv[2];
if (!fixturesPath) {
  console.error("usage: tsx parityCheck.ts <fixtures.json>");
  process.exit(1);
}

const fixtures: number[][] = JSON.parse(readFileSync(fixturesPath, "utf-8"));
const results = fixtures.map((features) => predictMove(features));
process.stdout.write(JSON.stringify(results));
