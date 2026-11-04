// Write the JSON Schema of a model contract next to the contracts, so other tooling can validate contract files.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { modelContractJsonSchema } from "../dist/index.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "model-contract.schema.json"), JSON.stringify(modelContractJsonSchema(), null, 2) + "\n");
console.log("wrote schema/model-contract.schema.json");
