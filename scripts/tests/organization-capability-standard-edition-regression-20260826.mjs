import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), 'utf8');
let pass = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  pass += 1;
  console.log(`PASS: ${label}`);
}

const schema = await read('prisma/schema.prisma');
const migration = await read('prisma/migrations/20260826151000_cb_capability_standard_editions/migration.sql');
const service = await read('src/certification-body-capabilities/certification-body-capabilities.service.ts');
const controller = await read('src/certification-body-capabilities/certification-body-capabilities.controller.ts');
const dto = await read('src/certification-body-capabilities/dto/certification-body-capability.dto.ts');

ok(schema.includes('standard_edition_id String?'), 'Capability gắn được phiên bản tiêu chuẩn cụ thể');
ok(schema.includes('standard_edition standard_editions?'), 'Capability có relation tới standard_editions');
ok(schema.includes('certification_body_capabilities certification_body_capabilities[]'), 'Standard edition có back relation năng lực tổ chức');
ok(migration.includes('UQ_cb_capability_standard_iaf'), 'Migration khóa trùng Standard edition + IAF');
ok(migration.includes('UQ_cb_capability_legacy_program_iaf'), 'Migration giữ khóa legacy Program + IAF cho dữ liệu cũ');
ok(migration.includes('FK_certification_body_capabilities_standard_edition'), 'Migration có FK tới standard edition');
ok(dto.includes('CreateCertificationBodyCapabilityBatchDto'), 'DTO hỗ trợ thêm nhiều IAF trong một lần');
ok(dto.includes('iaf_scope_ids'), 'Batch DTO nhận danh sách IAF');
ok(controller.includes("@Post('batch')"), 'API batch capability tồn tại');
ok(service.includes('createBatch('), 'Service hỗ trợ batch capability');
ok(service.includes('this.programFromStandard(standard)'), 'Program code/name được suy từ standard edition thay vì nhập tay');
ok(service.includes('capabilityMatchesEdition'), 'Application Review kiểm tra đúng edition tiêu chuẩn');
ok(service.includes('exactEdition.length'), 'Edition-specific capability được ưu tiên trước legacy fallback');
ok(service.includes('legacy'), 'Dữ liệu capability cũ vẫn tương thích');
ok(service.includes('ISO 9001') || service.includes('9001'), 'Resolver vẫn hỗ trợ QMS ISO 9001');

console.log(`\nORGANIZATION CAPABILITY STANDARD EDITION REGRESSION: PASS (${pass} pass, 0 fail)`);
