import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(path.join(root, 'typescript'));
}
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..', '..');
const projectRoot = path.resolve(backendRoot, '..');
const frontendRoot = path.join(projectRoot, 'ctic-frontend');
let pass = 0, fail = 0;
function check(ok, label, detail='') { if (ok) { pass++; console.log(`✓ ${label}`); } else { fail++; console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`); } }
function read(rel, root=backendRoot){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function syntax(rel, root=backendRoot, jsx=false){ const full=path.join(root,rel); const out=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})}}); return (out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error); }

console.log('=== PATCH 35E — TÁCH KHÔNG GIAN TỪNG BIỂU MẪU ===');
const detail=read('app/components/CertificationProjectDetailScreen.tsx',frontendRoot);
const modal=read('app/components/AuditDocumentCenterModal.tsx',frontendRoot);
const css=read('app/globals.css',frontendRoot);
const service=read('src/certification-projects/certification-projects.service.ts');
const commonItemsSource=service.slice(service.indexOf('const commonItems'),service.indexOf('const typeOfPlan'));
const initialDossierSource=service.slice(service.indexOf('const createInitialDossier'),service.indexOf('const createSingleAuditDossier'));
const cycleDossierSource=service.slice(service.indexOf('const createSingleAuditDossier'),service.indexOf('const initialDossier'));
const documentKeys=(source)=>[...source.matchAll(/document_key:\s*'([^']+)'/g)].map((match)=>match[1]);
const expectedInitialKeys=[
 'audit_team_assignment','audit_program','stage1_audit_plan','stage1_audit_report',
 'stage2_audit_plan','audit_checklist','opening_closing_attendance','stage2_audit_report',
 'nc_cap','technical_review_report','certification_decision','audit_result_notification',
 'certificate','audit_log',
];
for(const [rel,root,jsx] of [
 ['app/components/CertificationProjectDetailScreen.tsx',frontendRoot,true],
 ['app/components/AuditDocumentCenterModal.tsx',frontendRoot,true],
 ['src/certification-projects/certification-projects.service.ts',backendRoot,false],
]){
 const d=syntax(rel,root,jsx); check(d.length===0,`${rel} không lỗi cú pháp`,d.map(x=>x.messageText).join('; '));
}
check(detail.includes('dossierAuditDocumentDefinitions'),'Có danh mục ánh xạ thành phần hồ sơ sang biểu mẫu');
for(const token of ['audit_program_f03','audit_team_assignment_f04','audit_plan_f05','audit_checklist_f06','audit_attendance_f07','audit_log_f15','audit_monitoring_f17']){
 check(detail.includes(token),`Đã ánh xạ ${token}`);
}
check(detail.includes('dossier-form-stage-list'),'Thành phần hồ sơ được chia theo giai đoạn');
check(
 detail.includes('initialWorkflowStageDefinitions')
 && detail.includes('surveillanceWorkflowStageDefinitions')
 && detail.includes('selectedWorkflowStageDefinitions.map'),
 'Giao diện dựng từng nhóm quy trình riêng theo đúng loại chu kỳ',
);
check(detail.includes('Mã biểu'),'Bảng có cột mã biểu');
check(detail.includes('Phiên bản hiện hành'),'Bảng có cột phiên bản hiện hành');
check(detail.includes('Mở biểu'),'Mỗi biểu có nút mở riêng');
check(detail.includes('dossierDocumentSummaryQuery'),'Giao diện tải lịch sử phiên bản theo PLAN');
check(
 detail.includes('dossierFilesForItem')
   && detail.includes('const aliases: Record<string, string[]>')
   && detail.includes('const acceptedTypes = aliases[key] ?? [key]'),
 'Giao diện đối chiếu đúng tài liệu với từng dòng hồ sơ',
);
check(detail.includes('AuditDocumentCenterModal'),'Thành phần hồ sơ mở workspace biểu mẫu');
check(modal.includes('focus?: AuditDocumentFocus'),'Modal hỗ trợ chế độ tập trung một biểu');
check(modal.includes('visibleDocuments'),'Modal chỉ hiển thị tài liệu của biểu đang chọn');
check(modal.includes('showSchedule'),'F.05 chỉ hiển thị lịch trình liên quan');
check(modal.includes('showAttendance'),'F.07 chỉ hiển thị danh sách tham dự liên quan');
check(modal.includes('showChecklists'),'F.06 chỉ hiển thị checklist liên quan');
check(modal.includes('Không gian biểu mẫu riêng'),'Có thông báo rõ đang làm việc trên một biểu riêng');
check(modal.includes('onChanged?.()'),'Sinh/lưu tài liệu cập nhật lại dashboard hồ sơ');
check(css.includes('.dossier-form-stage-list'),'Có CSS cho danh sách nhóm biểu mẫu');
check(css.includes('.dossier-form-stage-card'),'Có CSS cho thẻ từng giai đoạn');
check(
 documentKeys(commonItemsSource).filter((key)=>key==='audit_monitoring').length===1
   && commonItemsSource.includes("entity_type: 'certification_project'")
   && commonItemsSource.includes('entity_id: project.id'),
 'F.17 tồn tại đúng một lần trong hồ sơ dùng chung/xuyên chu kỳ và giữ ownership cấp project',
);
check(service.includes("['audit_checklist', 'audit_checklist_f06_qms', 'audit_checklist_f06_ems', 'audit_checklist_f06_ohsms']"),'Backend nhận đúng checklist đã sinh');
check(service.includes("['opening_closing_attendance', 'attendance_list', 'audit_attendance_f07']"),'Backend nhận đúng F.07 đã sinh');
check(service.includes('teamMemberIds'),'Backend đưa thành viên đoàn vào phạm vi tìm F.15');
check(service.includes("storage_type: 'system_record'"),'Biểu mẫu sinh tự động không còn bị coi là tệp tải lên');
check(
 JSON.stringify(documentKeys(initialDossierSource))===JSON.stringify(expectedInitialKeys),
 'Hồ sơ chứng nhận lần đầu có đúng 14 thành phần theo thứ tự workflow hiện hành',
);
check(!initialDossierSource.includes("document_key: 'audit_monitoring'"),'F.17 không nằm trong mảng hồ sơ lần đầu');
check(!cycleDossierSource.includes("document_key: 'audit_monitoring'"),'F.17 không bị nhân bản trong GS1/GS2/TCC hoặc hồ sơ theo kỳ khác');
check(
 initialDossierSource.includes("document_key: 'nc_cap'")
   && initialDossierSource.includes("? 'not_applicable'"),
 'NC/CAP not_applicable vẫn là một dòng nhìn thấy trong 14 thành phần',
);
check(
 service.includes("item.status === 'completed' || item.status === 'not_applicable'")
   && service.includes('total_items: totalItems')
   && service.includes('pending_items: pendingItems'),
 'Backend tính tổng theo dòng nhìn thấy và coi not_applicable là trạng thái thỏa mãn',
);
check(
 detail.includes('dataSource={commonDossierItems}')
   && detail.includes('Hồ sơ dùng chung / xuyên chu kỳ'),
 'Frontend hiển thị F.17 qua khu vực hồ sơ dùng chung hiện có',
);
check(
 detail.includes('["completed", "not_applicable"].includes(normalize(item.status))'),
 'Frontend fallback/progress coi not_applicable là đã thỏa mãn nhưng vẫn giữ dòng hiển thị',
);
console.log(`\nPASS: ${pass}`); console.log(`FAIL: ${fail}`); if(fail) process.exit(1);
