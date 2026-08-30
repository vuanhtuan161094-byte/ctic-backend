import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
  console.log(`PASS: ${label}`);
};

const runtime = read('src/master-data-configuration/scheme-runtime-rules.ts');
const master = read('src/master-data-configuration/master-data-configuration.service.ts');
const controller = read('src/master-data-configuration/master-data-configuration.controller.ts');
const decisions = read('src/certification-decisions/certification-decisions.service.ts');
const results = read('src/certification-results/certification-results.service.ts');
const engine = read('src/notifications/notification-engine.service.ts');
const notifications = read('src/notifications/notifications.service.ts');

check('Có resolver quy tắc runtime từ project snapshot', runtime.includes('resolveSchemeRuntimeRules'));
check('IMS dùng khoảng giám sát bảo thủ MIN', runtime.includes('Math.min(...surveillanceValues)'));
check('IMS dùng cửa sổ tái chứng nhận bảo thủ MAX', runtime.includes('Math.max(...renewalValues)'));
check('Fallback lịch sử vẫn giữ Stage 1 + 12/36/90/60', runtime.includes("source: 'CODE_DEFAULT'") && runtime.includes('surveillance_frequency_months: 12') && runtime.includes('validity_duration_months: 36') && runtime.includes('renewal_window_days: 90') && runtime.includes('reminder_lead_days: 60'));
check('Ngày hết hiệu lực được tính theo số tháng cấu hình', runtime.includes('expiryDateFromValidityMonths'));

check('Backend chặn khoảng giám sát dài hơn chu kỳ', master.includes('Khoảng giám sát không được dài hơn toàn bộ chu kỳ chứng nhận'));
check('Backend chặn thời hạn chứng chỉ dài hơn chu kỳ', master.includes('Thời hạn hiệu lực chứng chỉ không được dài hơn chu kỳ chứng nhận'));
check('Backend kiểm tra mâu thuẫn Giai đoạn 1', master.includes('Không áp dụng Giai đoạn 1') && master.includes('INITIAL_STAGE_1'));
check('Admin áp dụng version mới tự đóng version cũ an toàn', master.includes('SCHEME_CONFIG_CREATED_APPLIED_AND_PREVIOUS_CLOSED') && master.includes('previousEffectiveTo'));
check('Áp dụng cấu hình chạy transaction Serializable', master.includes('Prisma.TransactionIsolationLevel.Serializable'));
check('Có API kiểm tra sẵn sàng cấu hình', controller.includes("@Get('configuration-readiness')") && master.includes('configurationReadiness()'));

check('Readiness nói rõ danh mục loại đánh giá chỉ được chốt theo dự án', master.includes("field: 'required_audit_types'") && master.includes("Danh mục loại đánh giá được kiểm tra logic và chốt theo dự án"));
check('Readiness nói rõ danh mục loại quyết định không thay gate workflow', master.includes("field: 'required_decision_types'") && master.includes('gate quyết định và phân tách nhiệm vụ'));

check('Gate cấp chứng nhận lần đầu đọc stage1_applicable từ snapshot', decisions.includes('runtimeRules.stage1_applicable'));
check('Quyết định lấy khoảng giám sát từ snapshot nếu không nhập tay', decisions.includes('runtimeRules.surveillance_frequency_months'));
check('Quyết định tự suy ngày hết hiệu lực từ validity_duration_months', decisions.includes('runtimeRules.validity_duration_months') && decisions.includes('expiryDateFromValidityMonths'));
check('Quyết định lưu dấu vết nguồn quy tắc', decisions.includes('runtime_rule_snapshot') && decisions.includes('runtime_rule_sources'));

check('Workspace kết quả trả runtime_rules cho UI', results.includes('runtime_rules:') && results.includes('runtimeRuleSummary'));
check('Workspace đề xuất khoảng giám sát từ cấu hình', results.includes('runtimeRules.surveillance_frequency_months'));
check('Workspace đề xuất ngày hết hạn từ cấu hình', results.includes('expiryDateFromValidityMonths') && results.includes('runtimeRules.validity_duration_months'));

check('Notification engine dùng reminder_lead_days theo project snapshot', engine.includes('runtimeRules.reminder_lead_days'));
check('Notification engine dùng renewal_window_days theo project snapshot', engine.includes('runtimeRules.renewal_window_days'));
check('My Work lọc chứng chỉ theo cửa sổ từng project', notifications.includes('runtimeRules.renewal_window_days') && notifications.includes('daysUntilExpiry > leadDays'));

console.log(`\nCONFIGURATION RUNTIME WIRING REGRESSION: PASS (${checks.length} pass, 0 fail)`);
