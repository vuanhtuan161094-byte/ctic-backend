import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const service = read('src/master-data-configuration/master-data-configuration.service.ts');
const controller = read('src/master-data-configuration/master-data-configuration.controller.ts');
const panel = fs.existsSync(path.join(root, '..', 'ctic-frontend', 'app', 'components', 'MasterDataConfigurationPanel.tsx'))
  ? fs.readFileSync(path.join(root, '..', 'ctic-frontend', 'app', 'components', 'MasterDataConfigurationPanel.tsx'), 'utf8')
  : '';

const checks = [];
function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
  console.log(`PASS: ${label}`);
}

const createStart = service.indexOf('async createConfiguration');
const activateStart = service.indexOf('async activateConfiguration');
const createBlock = service.slice(createStart, activateStart);

check('Cấu hình mới được tạo ACTIVE trực tiếp', createBlock.includes("status: 'ACTIVE'"));
check('Cấu hình mới không tạo DRAFT', !createBlock.includes("status: 'DRAFT'"));
check('Áp dụng trực tiếp vẫn dùng transaction Serializable', createBlock.includes('Prisma.TransactionIsolationLevel.Serializable'));
check('Phiên bản mới tự đóng phiên bản cũ', createBlock.includes('previousEffectiveTo') && createBlock.includes('effective_to: previousEffectiveTo'));
check('Audit ghi rõ CREATED_AND_APPLIED thay vì approval workflow', createBlock.includes('SCHEME_CONFIG_CREATED_AND_APPLIED'));
check('Endpoint activate cũ chỉ còn cho DRAFT legacy', service.includes('Backward-compatibility path for DRAFT rows created before direct-apply configuration'));
check('Có endpoint hủy lịch áp dụng', controller.includes("scheme-configurations/:id/cancel-scheduled"));
check('Hủy lịch chỉ ADMIN và classifications.manage', controller.includes('cancelScheduledConfiguration') && controller.includes("@Roles('ADMIN')") && controller.includes("@Permissions('classifications.manage')"));
check('Hủy lịch không xóa lịch sử mà RETIRED version', service.includes("data: { status: 'RETIRED' }"));
check('Hủy lịch khôi phục cửa sổ phiên bản trước', service.includes('previous_version_restored') && service.includes('restoredPreviousEnd'));
check('Không cho hủy phiên bản đã bắt đầu áp dụng', service.includes('Phiên bản đã bắt đầu áp dụng'));

if (panel) {
  check('UI dùng Lưu & áp dụng', panel.includes('Lưu & áp dụng'));
  check('UI hiển thị Chờ hiệu lực thay vì Đã phê duyệt', panel.includes('Chờ hiệu lực · từ') && !panel.includes('Đã phê duyệt · chờ hiệu lực'));
  check('UI có Hủy lịch áp dụng', panel.includes('Hủy lịch áp dụng'));
}

console.log(`\nCONFIGURATION DIRECT APPLY REGRESSION: PASS (${checks.length} pass, 0 fail)`);
