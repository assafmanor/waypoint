import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// No dotenv dependency in this package; .env only has simple KEY=VALUE lines.
const envPath = resolve(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, '') ?? '';
    }
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    // `nest start`/`nest build` emit compiled specs into dist/ — exclude it so a
    // stale build doesn't get picked up alongside the TS source.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
