'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const sql=fs.readFileSync(path.join(__dirname,'sql','01-bootstrap-cmp-demo-2026.sql'),'utf8');
test('DBA-only sandbox bootstrap gates exact instance, sysadmin and database identity',()=>{
for(const x of [/CTIC-LP-054/,/SQLEXPRESS/,/IS_SRVROLEMEMBER\(N'sysadmin'\)/,
 /DB_ID\(@db\) IS NOT NULL/,/SUSER_ID\(N'thanvu_app'\)/,/SUSER_ID\(N'CMP_MIGRATOR_DEV'\)/,
 /InstanceDefaultBackupPath/]) assert.match(sql,x);
});
test('Sandbox-only grants; verified checksum backup; no destructive DB DDL',()=>{
for(const x of [/CREATE DATABASE \[CTIC_CMP_DEMO_2026\]/,
 /ALTER ROLE \[db_owner\] ADD MEMBER \[CMP_MIGRATOR_DEV\]/,
 /ALTER ROLE \[db_datareader\] ADD MEMBER \[thanvu_app\]/,
 /ALTER ROLE \[db_datawriter\] ADD MEMBER \[thanvu_app\]/,
 /BACKUP DATABASE \[CTIC_CMP_DEMO_2026\]/,/RESTORE VERIFYONLY/,
 /BOOTSTRAP_PASS_BACKUP_VERIFIED/]) assert.match(sql,x);
assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:DATABASE|TABLE)\b/i);
assert.doesNotMatch(sql,/\b(?:ALTER SERVER ROLE|CREATE LOGIN|ALTER LOGIN)\b/i);
});
