'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const directory = __dirname;
const startVbs = fs.readFileSync(path.join(directory, 'cmp-demo-desktop-start.vbs'), 'utf16le');
const accountVbs = fs.readFileSync(path.join(directory, 'cmp-demo-account-picker.vbs'), 'utf16le');
const accountPicker = fs.readFileSync(path.join(directory, 'cmp-demo-account-picker.ps1'), 'utf8');
const installer = fs.readFileSync(path.join(directory, 'install-cmp-demo-desktop-shortcuts.ps1'), 'utf8');

test('desktop launcher starts only the read-only runtime entrypoint without a terminal pause', () => {
  assert.match(startVbs, /cmp-demo-launcher\.cjs/);
  assert.match(startVbs, /--runtime-only/);
  assert.match(startVbs, /--validate-only/);
  assert.match(startVbs, /shell\.Run\(command, HIDE_WINDOW, WAIT_FOR_EXIT\)/);
  assert.match(fs.readFileSync(path.join(directory, 'cmp-demo-launcher.cjs'), 'utf8'), /startBrowser\(frontendUrl\)/);
  assert.doesNotMatch(startVbs, /cmp-workflow-runner|Gate A|--apply|migration|seed|pause/i);
});

test('desktop account picker reads protected credentials and only copies passwords on a user click', () => {
  assert.match(accountPicker, /LOCALAPPDATA.*CMP\\DEMO\\credentials\.json/);
  assert.match(accountPicker, /cmp-demo-credentials\/v1/);
  assert.match(accountPicker, /internalAccounts/);
  assert.match(accountPicker, /portalAccounts/);
  assert.match(accountPicker, /Clipboard\]::SetText/);
  assert.match(accountPicker, /Add_Click/);
  assert.doesNotMatch(accountPicker, /WriteAllText|WriteAllBytes|Set-Content|Out-File|reset-password|demo-bootstrap-admin/i);
  assert.doesNotMatch(accountPicker, /PasswordBox|PasswordChar|UseSystemPasswordChar|Text\s*=\s*\$.*Password/i);
  assert.match(accountVbs, /-NoProfile -STA -WindowStyle Hidden -File/);
  assert.match(accountVbs, /--validate-only/);
  assert.doesNotMatch(accountVbs, /ExecutionPolicy\s+Bypass|credentials\.json|password/i);
});

test('shortcut installer verifies both entries and refuses to overwrite existing desktop files', () => {
  assert.match(installer, /CMP DEMO\.lnk/);
  assert.match(installer, /CMP - Tài khoản DEMO\.lnk/);
  assert.match(installer, /Test-Path -LiteralPath \$destination/);
  assert.match(installer, /không ghi đè/i);
  assert.match(installer, /wscript\.exe/);
  assert.match(installer, /GetShortPathName/);
  assert.match(installer, /RepairKnownPartialShortcut/);
  assert.match(installer, /File\]::Move\(\$staging, \$plan\.Destination\)/);
  assert.match(installer, /CreateShortcut\(\$plan\.Destination\)/);
  assert.match(installer, /CreateShortcut\(\(Get-ShortPath \$plan\.Destination\)\)/);
});
