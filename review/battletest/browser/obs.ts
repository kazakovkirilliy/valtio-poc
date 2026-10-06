import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "obs");

/** Records what a scenario observed in an app, one JSON file per (scenario, app): compare.mjs groups them. */
export const record = (scenario: string, app: string, value: unknown) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${scenario}__${app}.json`), JSON.stringify(value, null, 1));
  console.log(`OBS ${scenario} ${app} ${JSON.stringify(value)}`);
};
