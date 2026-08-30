import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const library = read('src/document-control/document-library.service.ts');
const v2Controller = read('src/document-control/document-control-v2.controller.ts');
const control = read('src/document-control/document-control.service.ts');
const controlController = read('src/document-control/document-control.controller.ts');

const checks = [
  ['Tài liệu nền có endpoint riêng ADMIN-only', /library-versions\/:id\/import-effective/.test(v2Controller) && /@Roles\('ADMIN'\)/.test(v2Controller)],
  ['Tài liệu nền chỉ cho revision đầu tiên', /version\.revision_no !== 1/.test(library)],
  ['Tài liệu nền không được dùng khi đã có nhiều revision', /versionCount !== 1/.test(library)],
  ['Tài liệu nền có audit riêng', /DOCUMENT_LIBRARY_BASELINE_IMPORTED/.test(library)],
  ['Mẫu nền có endpoint riêng ADMIN-only', /template-versions\/:id\/import-effective/.test(controlController) && /@Roles\('ADMIN'\)/.test(controlController)],
  ['Mẫu nền chỉ cho revision đầu tiên', /importExistingTemplateEffective/.test(control) && /version\.revision_no !== 1/.test(control)],
  ['Mẫu nền bắt buộc validation đạt', /Biểu mẫu chưa đạt kiểm tra trường dữ liệu/.test(control)],
  ['Mẫu nền có audit riêng', /CONTROLLED_TEMPLATE_BASELINE_IMPORTED/.test(control)],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) failed += 1;
}
console.log(`\nDOCUMENT CONTROL STEP 5C REGRESSION: ${failed ? 'FAIL' : 'PASS'} (${checks.length - failed} pass, ${failed} fail)`);
process.exit(failed ? 1 : 0);
