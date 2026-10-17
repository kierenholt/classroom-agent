#!/usr/bin/env node

/**
 * Sequential Test Runner
 * Usage: node scripts/run_tests.js <test-name-or-file> local 1
 */

import { spawn } from 'child_process';
import path from 'path';

const args = process.argv.slice(2);
const testFilter = args[0] || '';
const environment = args[1] || 'local';
const workers = args[2] || '1';

console.log(`[Test Runner] Running tests sequentially`);
console.log(`[Test Runner] Filter: "${testFilter}" | Environment: ${environment} | Workers: ${workers}`);

const playwrightArgs = [
  'test',
  testFilter,
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
