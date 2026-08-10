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
check(detail.includes('workflowStageDefinitions.map'),'Giao diện dựng từng nhóm quy trình riêng');
check(detail.includes('Mã biểu'),'Bảng có cột mã biểu');
check(detail.includes('Phiên bản hiện hành'),'Bảng có cột phiên bản hiện hành');
check(detail.includes('Mở biểu'),'Mỗi biểu có nút mở riêng');
check(detail.includes('dossierDocumentSummaryQuery'),'Giao diện tải lịch sử phiên bản theo PLAN');
check(detail.includes('documentCardsForDossierItem'),'Giao diện đối chiếu đúng tài liệu với từng dòng hồ sơ');
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
check(service.includes("document_key: 'audit_monitoring'"),'Backend bổ sung F.17 vào thành phần hồ sơ');
check(service.includes("['audit_checklist', 'audit_checklist_f06_qms', 'audit_checklist_f06_ems', 'audit_checklist_f06_ohsms']"),'Backend nhận đúng checklist đã sinh');
check(service.includes("['opening_closing_attendance', 'attendance_list', 'audit_attendance_f07']"),'Backend nhận đúng F.07 đã sinh');
check(service.includes('teamMemberIds'),'Backend đưa thành viên đoàn vào phạm vi tìm F.15');
check(service.includes("storage_type: 'system_record'"),'Biểu mẫu sinh tự động không còn bị coi là tệp tải lên');
check((service.match(/document_key: 'audit_monitoring'/g)??[]).length>=2,'F.17 có trong hồ sơ lần đầu và giám sát');
console.log(`\nPASS: ${pass}`); console.log(`FAIL: ${fail}`); if(fail) process.exit(1);
