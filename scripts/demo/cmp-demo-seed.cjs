#!/usr/bin/env node
'use strict';

// Kept as a compatibility entry point. CMP V3 requires customer creation through
// the authorized UI/API workflow; direct Prisma seeding is intentionally removed.
const { main } = require('./cmp-workflow-runner.cjs');

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    process.stderr.write('[CMP DEMO] --apply is disabled. Use the verified CMP UI/API workflow runner.\n');
    process.exitCode = 2;
  } else {
    void main(args);
  }
}

module.exports = { main };
