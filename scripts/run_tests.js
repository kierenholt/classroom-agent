#!/usr/bin/env node

/**
 * Sequential Test Runner
 * Usage: npm test -- <test-name-or-file> local 1
 */

import { spawn } from 'child_process';
import path from 'path';

const args = process.argv.slice(2);
const testFilter = args[0] || '';
const environment = args[1] || 'local';
const workers = args[2] || '1';

console.log(`[Test Runner] Running tests sequentially`);
console.log(`[Test Runner] Filter: "${testFilter}" | Environment: ${environment} | Workers: ${workers}`);

const fs = await import('fs');
const isFileFilter =
  !testFilter ||
  testFilter.includes('/') ||
  testFilter.endsWith('.ts') ||
  testFilter.endsWith('.js') ||
  fs.existsSync(path.resolve(process.cwd(), testFilter)) ||
  fs.existsSync(path.resolve(process.cwd(), 'tests/e2e', `${testFilter}.spec.ts`));

const playwrightArgs = [
  'test',
  ...(testFilter ? (isFileFilter ? [testFilter] : ['-g', testFilter]) : []),
  '--workers', workers,
  '--reporter', 'list',
];

const runner = spawn('npx', ['playwright', ...playwrightArgs], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    TEST_ENV: environment,
  },
});

runner.on('close', (code) => {
  if (code !== 0) {
    console.error(`[Test Runner] Tests failed with exit code ${code}`);
    process.exit(code || 1);
  }
  console.log('[Test Runner] All tests completed successfully.');
});
