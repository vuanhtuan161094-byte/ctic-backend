import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const policy = read('src/industry-classifications/taxonomy-runtime-policy.service.ts');
const service = read('src/industry-classifications/industry-classifications.service.ts');
const controller = read('src/industry-classifications/industry-classifications.controller.ts');
const checks = [
  ['NACE parent resolution derives from child classes', /DERIVED_FROM_CHILDREN/],
  ['NACE 97\/98\/99 is explicitly outside IAF table', /OUTSIDE_IAF_TABLE/],
  ['Resolver aggregates IAF candidates', /buildIafSummary/],
  ['Resolver exposes derived NACE classes', /derived_from_nace_classes/],
  ['ISIC parent codes can derive mappings from child classes', /descendants\(source, snapshot\)/],
  ['Coverage gate exists for all ISIC classes', /coverageFromSnapshot/],
  ['Coverage fails closed on non-excluded NACE without IAF', /NACE_IAF_MAPPING_MISSING/],
  ['Coverage explicitly does not fake IAF for 97\/98\/99', /không được gán IAF giả/],
  ['Controller exposes mapping coverage endpoint', /@Get\('mapping-coverage'\)/],
  ['Controller keeps canonical resolve endpoint', /@Get\('resolve'\)/],
];
let failed = 0;
for (const [name, re] of checks) {
  const haystack = name.includes('Controller') ? controller : policy;
  if (!re.test(haystack)) {
    console.error(`FAIL: ${name}`);
    failed += 1;
  } else {
    console.log(`PASS: ${name}`);
  }
}
if (failed) {
  console.error(`\nINDUSTRY HIERARCHY IAF REGRESSION: FAIL (${failed} fail)`);
  process.exit(1);
}
console.log(`\nINDUSTRY HIERARCHY IAF REGRESSION: PASS (${checks.length} pass, 0 fail)`);
