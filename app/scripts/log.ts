// Console output shared by the demo scripts.
import { explorerTx } from "../lib/near";

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

export const step = (title: string) => console.log(`\n[${elapsed()}] ${title}`);
export const info = (line: string) => console.log(`   ${line}`);
export const tx = (label: string, hash?: string) => console.log(`   ${label}${hash ? `  ${explorerTx(hash)}` : ""}`);

export function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

export const done = (message: string) => console.log(`\n[${elapsed()}] ${message}`);
