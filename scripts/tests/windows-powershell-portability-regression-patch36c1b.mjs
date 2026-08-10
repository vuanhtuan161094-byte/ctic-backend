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

const ps1Path = path.join(root, 'scripts', 'stabilize-windows-patch36c1b.ps1');
const cmdPath = path.join(root, 'STABILIZE_36C1B.cmd');
const legacyCmdPath = path.join(root, 'STABILIZE_36C1A.cmd');
const ps1 = fs.readFileSync(ps1Path);
const ps1Text = ps1.toString('ascii');
const cmd = fs.readFileSync(cmdPath, 'utf8');
const legacyCmd = fs.readFileSync(legacyCmdPath, 'utf8');

check(ps1.every((byte) => byte <= 0x7f), 'Windows PowerShell script is ASCII-only and independent of ANSI/UTF-8 code page decoding');
check(!ps1Text.includes('db_owner] ADD MEMBER') && /db_owner is NOT granted/.test(ps1Text), 'Temporary elevation never grants db_owner');
check(/db_ddladmin/.test(ps1Text) && /db_datareader/.test(ps1Text) && /db_datawriter/.test(ps1Text), 'Temporary elevation uses only required database roles');
check(/finally\s*\{/.test(ps1Text), 'Temporary-role cleanup is protected by a finally block');
check(/ALTER ROLE \[\$role\] DROP MEMBER/.test(ps1Text), 'Roles added by the script are removed after stabilization');
check(/addedRoles\.Add\(\$role\)/.test(ps1Text), 'Only roles actually added by the script are tracked for removal');
check(/migrationConfigured/.test(ps1Text) && /stabilize:commercial/.test(ps1Text), 'Dedicated MIGRATION_DATABASE_URL path bypasses temporary elevation');
check(/production/.test(ps1Text) && /does not allow temporary elevation/.test(ps1Text), 'Production blocks temporary elevation of runtime credentials');
check(/DATABASE_PRINCIPAL_ID\(@userName\)/.test(ps1Text), 'Runtime database principal is validated before role changes');
check(/Escape-SqlIdentifier/.test(ps1Text) && /Replace\('\]', '\]\]'\)/.test(ps1Text), 'Database principal identifier is escaped before ALTER ROLE');
check(/powershell\.exe/.test(cmd) && /-NoProfile/.test(cmd) && /-NonInteractive/.test(cmd), 'Windows entrypoint invokes powershell.exe in deterministic non-interactive mode');
check(/stabilize-windows-patch36c1b\.ps1/.test(cmd), 'Windows entrypoint invokes the portable 36C.1b script');
check(/STABILIZE_36C1B\.cmd/.test(legacyCmd), 'Legacy 36C.1A entrypoint redirects to 36C.1b');
check(!cmd.includes('chcp ') && !ps1Text.includes('[Console]::OutputEncoding'), 'Fix does not rely on console code-page mutation');
check(/CMP_TEMP_DDL_ELEVATION/.test(ps1Text) && /ALLOW_RUNTIME_MIGRATION_CREDENTIALS/.test(ps1Text), 'Existing migration safety gates remain enabled during temporary elevation');

console.log(`\nPatch 36C.1b Windows PowerShell portability regression: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
