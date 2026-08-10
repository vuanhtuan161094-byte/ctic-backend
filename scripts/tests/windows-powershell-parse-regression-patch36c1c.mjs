import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    pass += 1;
    console.log(`PASS: ${message}`);
  } else {
    fail += 1;
    console.error(`FAIL: ${message}`);
  }
}

const ps1Path = path.join(root, 'scripts', 'stabilize-windows-patch36c1c.ps1');
const ps1 = fs.readFileSync(ps1Path);
const text = ps1.toString('ascii');
const cmd = fs.readFileSync(path.join(root, 'STABILIZE_36C1C.cmd'), 'utf8');
const oldB = fs.readFileSync(path.join(root, 'STABILIZE_36C1B.cmd'), 'utf8');
const oldA = fs.readFileSync(path.join(root, 'STABILIZE_36C1A.cmd'), 'utf8');

check(ps1.every((byte) => byte <= 0x7f), 'PowerShell stabilization script remains ASCII-only for Windows PowerShell 5.1');
check(!text.includes('$role:'), 'No ambiguous PowerShell variable interpolation of $role followed by colon');
check(/WARNING: Could not remove temporary role \{0\}: \{1\}/.test(text), 'Cleanup warning uses format operator instead of ambiguous interpolation');
check(/-f \$role, \$_\.Exception\.Message/.test(text), 'Cleanup warning formats role and exception explicitly');
check(/finally\s*\{/.test(text), 'Temporary SQL role cleanup remains protected by finally');
check(!text.includes('db_owner] ADD MEMBER') && /db_owner is NOT granted/.test(text), 'No db_owner temporary elevation');
check(/db_ddladmin/.test(text) && /db_datareader/.test(text) && /db_datawriter/.test(text), 'Only limited migration roles are used');
check(/ALTER ROLE \[\$role\] DROP MEMBER/.test(text), 'Temporary roles are still removed after stabilization');
check(/stabilize:commercial/.test(text), 'Commercial stabilization workflow is preserved');
check(/db:runtime-permissions/.test(text), 'Runtime permission verification is preserved');
check(/stabilize-windows-patch36c1c\.ps1/.test(cmd), '36C.1c CMD invokes the corrected PowerShell script');
check(/stabilize-windows-patch36c1b\.ps1/.test(oldB), '36C.1B entrypoint remains backward-compatible while using corrected script');
check(/STABILIZE_36C1B\.cmd/.test(oldA), '36C.1A entrypoint remains backward-compatible through 36C.1b');
check(/-NoProfile/.test(cmd) && /-NonInteractive/.test(cmd), 'PowerShell is started deterministically without user profile');

// Catch the exact class of parser bug that escaped 36C.1b.
const ambiguousInsideDoubleQuotes = [...text.matchAll(/"[^"\r\n]*\$([A-Za-z_][A-Za-z0-9_]*):[^"\r\n]*"/g)]
  .filter((m) => !['env', 'global', 'script', 'local', 'private'].includes(m[1].toLowerCase()));
check(ambiguousInsideDoubleQuotes.length === 0, 'No ordinary $variable: sequence exists inside double-quoted PowerShell strings');

console.log(`\nPatch 36C.1c PowerShell parse regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
