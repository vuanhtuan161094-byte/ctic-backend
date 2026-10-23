'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const sql=fs.readFileSync(path.join(__dirname,'sql','01-bootstrap-cmp-demo-2026.sql'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'sql','cmp-demo-gate-a.ps1'),'utf8');
const launcher=fs.readFileSync(path.join(__dirname,'sql','RUN_CMP_DEMO_GATE_A.cmd'),'utf8');
const acl=fs.readFileSync(path.join(__dirname,'sql','cmp-demo-credential-acl.ps1'),'utf8');
test('DBA-only sandbox bootstrap gates exact instance, sysadmin and database identity',()=>{
for(const x of [/CTIC-LP-054/,/SQLEXPRESS/,/IS_SRVROLEMEMBER\(N'sysadmin'\)/,
 /DB_ID\(@db\) IS NOT NULL/,/SUSER_ID\(N'CMP_DEMO_APP'\)/,/SUSER_ID\(N'CMP_DEMO_MIGRATOR'\)/,
 /InstanceDefaultBackupPath/]) assert.match(sql,x);
});
test('Sandbox-only grants; verified checksum backup; no destructive DB DDL',()=>{
for(const x of [/CREATE DATABASE \[CTIC_CMP_DEMO_2026\]/,
 /CREATE LOGIN \[CMP_DEMO_APP\]/,/CREATE LOGIN \[CMP_DEMO_MIGRATOR\]/,
 /@demoAppPassword/,/@demoMigratorPassword/,
 /ALTER ROLE \[db_owner\] ADD MEMBER \[CMP_DEMO_MIGRATOR\]/,
 /ALTER ROLE \[db_datareader\] ADD MEMBER \[CMP_DEMO_APP\]/,
 /ALTER ROLE \[db_datawriter\] ADD MEMBER \[CMP_DEMO_APP\]/,
 /BACKUP DATABASE \[CTIC_CMP_DEMO_2026\]/,/RESTORE VERIFYONLY/,
 /BOOTSTRAP_PASS_BACKUP_VERIFIED/]) assert.match(sql,x);
assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:DATABASE|TABLE)\b/i);
assert.doesNotMatch(sql,/\b(?:ALTER SERVER ROLE|ALTER LOGIN)\b/i);
assert.doesNotMatch(sql,/CREATE LOGIN\s+\[(?!CMP_DEMO_(?:APP|MIGRATOR)\])/i);
assert.doesNotMatch(sql,/thanvu_app|CMP_MIGRATOR_DEV/i);
assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:DATABASE|TABLE)\b/i);
assert.doesNotMatch(sql,/CTIC_Certification/i);
const databaseContexts=[...sql.matchAll(/\bUSE\s+\[([^\]]+)\]/gi)].map(match=>match[1].toLowerCase());
assert.ok(databaseContexts.length>0);
assert.ok(databaseContexts.every(name=>['master','ctic_cmp_demo_2026'].includes(name)));
assert.doesNotMatch(gate,/Remove-Item\s+[^\r\n]*(?:launcher|CMP_DEMO_ONE_CLICK)/i);
assert.doesNotMatch(gate,/Set-Content\s+[^\r\n]*(?:launcher|CMP_DEMO_ONE_CLICK)/i);
});
test('Windows helper requires the approved elevated identity and never recreates an existing sandbox',()=>{
for(const x of [/CTIC-LP-054\\Administrator/,/CTIC-LP-054/,/SQLEXPRESS/,/CTIC_CMP_DEMO_2026/,
 /IS_SRVROLEMEMBER\(N'sysadmin'\)/,/Start-Process[\s\S]*?-Verb RunAs/,
 /SANDBOX_EXISTS inspect-only[\s\S]*?exit 3/,/if \(-not \$Apply\)/]) assert.match(gate,x);
assert.match(launcher,/cmp-demo-gate-a\.ps1[\s\S]*?-Apply/);
assert.match(launcher,/%LOCALAPPDATA%[\s\S]*?sql-credentials\.json/i);
assert.match(gate,/Set-CmpDemoCredentialAcl/);
assert.match(gate,/direct elevated launch would create credentials under the Administrator profile/);
assert.match(gate,/CREATE\\s\+LOGIN[\s\S]*?reserved least-privilege DEMO logins/);
assert.match(acl,/SetAccessRuleProtection\(\$true,\s*\$false\)/);
assert.match(acl,/GetAccessControl\(\[Security\.AccessControl\.AccessControlSections\]::Access\)/);
assert.match(acl,/SetAccessControl\(\$acl\)/);
assert.doesNotMatch(acl, /\bSet-Acl\s+-LiteralPath|\.SetOwner\(|\bSetAuditRule\(/i);
assert.match(acl,/S-1-5-18/);
assert.match(acl,/S-1-5-32-544/);
assert.doesNotMatch(acl,/S-1-1-0|S-1-5-32-545|S-1-5-11/);
assert.doesNotMatch(gate,/DATABASE_URL|password\s*=\s*['"]/i);
});
