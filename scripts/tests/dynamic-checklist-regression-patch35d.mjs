import fs from 'node:fs';
import os from 'node:os';
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
const engine = require(path.join(backendRoot, 'src', 'reports', 'runtime', 'ooxml-template-engine.cjs'));
let pass = 0, fail = 0;
function check(ok, label, detail='') { if (ok) { pass++; console.log(`✓ ${label}`); } else { fail++; console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`); } }
function read(rel, root=backendRoot){ return fs.readFileSync(path.join(root,rel),'utf8'); }
function syntax(rel, root=backendRoot, jsx=false){ const full=path.join(root,rel); const out=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})}}); return (out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error); }

console.log('=== PATCH 35D — F.06 CHECKLIST ĐỘNG THEO TIÊU CHUẨN ===');
const service=read('src/audit-documents/audit-documents.service.ts');
const controller=read('src/audit-documents/audit-documents.controller.ts');
const dto=read('src/audit-documents/dto/save-audit-document-data.dto.ts');
const libs=read('src/audit-documents/checklist-libraries.ts');
const modal=read('app/components/AuditDocumentCenterModal.tsx',frontendRoot);
for(const f of ['src/audit-documents/audit-documents.service.ts','src/audit-documents/audit-documents.controller.ts','src/audit-documents/dto/save-audit-document-data.dto.ts','src/audit-documents/checklist-libraries.ts']){
  const d=syntax(f); check(d.length===0,`${f} không lỗi cú pháp TypeScript`,d.map(x=>x.messageText).join('; '));
}
const fd=syntax('app/components/AuditDocumentCenterModal.tsx',frontendRoot,true); check(fd.length===0,'AuditDocumentCenterModal không lỗi cú pháp TSX',fd.map(x=>x.messageText).join('; '));
check(controller.includes("'audit_checklist_f06'"),'API hỗ trợ sinh F.06');
check(controller.includes("@Query('programKey')"),'API nhận programKey cho từng tiêu chuẩn');
check(service.includes('buildChecklistDocuments'),'Backend dựng F.06 riêng từng chương trình');
check(service.includes('normalizeChecklistPrograms'),'Backend nạp và khôi phục dữ liệu checklist đã lưu');
check(service.includes('checklistTemplateSlots'),'Backend ánh xạ đúng bốn cột C/OFI/Min/Maj');
check(service.includes("row.result === 'CONFORMITY' ? 'X'"),'Chỉ đánh dấu cột phù hợp khi kết quả CONFORMITY');
check(service.includes("row.result === 'OFI' ? 'X'"),'Chỉ đánh dấu cột OFI khi kết quả OFI');
check(service.includes("row.result === 'MINOR_NC' ? 'X'"),'Chỉ đánh dấu cột NC nhẹ khi kết quả MINOR_NC');
check(service.includes("row.result === 'MAJOR_NC' ? 'X'"),'Chỉ đánh dấu cột NC nặng khi kết quả MAJOR_NC');
check(dto.includes('class AuditChecklistProgramDto') && dto.includes('class AuditChecklistRowDto'),'DTO có cấu trúc checklist theo chương trình');
check(dto.includes("'NOT_EVALUATED'") && dto.includes("'MAJOR_NC'"),'DTO khóa đúng các trạng thái checklist');
check(service.includes('documentData.checklists'),'Checklist lưu trong form_data, không cần migration');
check(service.includes('audit_checklist_f06_qms') && service.includes('audit_checklist_f06_ems') && service.includes('audit_checklist_f06_ohsms'),'Lịch sử F.06 tách riêng QMS/EMS/OHSMS');
check(service.includes('hasChecklistDocument'),'F.17 nhận biết F.06 đã sinh theo từng hệ thống');
check(service.includes('600_000'),'Backend cho phép PDF checklist dài xử lý tối đa 10 phút');
check(modal.includes('Bảng kiểm đánh giá F.06-P.09'),'Frontend có không gian nhập F.06');
check(modal.includes('Chưa đánh giá') && modal.includes('NC nặng'),'Frontend có đầy đủ trạng thái đánh giá');
check(modal.includes('programKey: document.program_key'),'Frontend xuất đúng checklist của từng tiêu chuẩn');
check(modal.includes('documentType === "audit_checklist_f06" ? 600_000'),'Frontend không timeout sớm khi xuất PDF checklist dài');
check(modal.includes('source_label'),'Frontend phân biệt mẫu gốc và thư viện khởi tạo');
for(const [token,minRows] of [['ISO9001:2015',89],['ISO14001:2015',34],['ISO45001:2018',42]]){
  check(libs.includes(`"program_key": "${token}"`),`Có thư viện ${token}`);
  const count=(libs.match(new RegExp(`"row_id": "${token.replace(':','-')}[^\"]+"`,'g'))??[]).length;
  check(count>=minRows,`${token} có đủ dòng checklist`,String(count));
}
const templates=[
 ['F.06-P.09.checklist-iso9001.template.docx',89],
 ['F.06-P.09.checklist-iso14001.template.docx',34],
 ['F.06-P.09.checklist-iso45001.template.docx',42],
];
const templateDir=path.join(backendRoot,'src','reports','templates');
for(const [file,count] of templates){
 const full=path.join(templateDir,file); check(fs.existsSync(full),`Có mẫu ${file}`);
 const tokens=engine.listTemplateTokens(full); check(tokens.includes('checklist_standard_code')&&tokens.includes('organization_name_vi')&&tokens.includes('auditor_name'),`${file} có đủ trường thông tin chung`);
 check(tokens.includes('row_001_clause')&&tokens.includes(`row_${String(count).padStart(3,'0')}_description`),`${file} có đủ placeholder từ dòng 1 đến ${count}`);
 const entries=engine.readZipEntries(full); const xml=entries.filter(e=>e.name.endsWith('.xml')).map(e=>e.data.toString('utf8')).join('\n');
 check(/F\.06-P\.09/.test(xml),`${file} giữ mã biểu mẫu F.06-P.09`);
 check(/cticlab\.com|CTIC VIETNAM/i.test(xml),`${file} giữ đúng header form gốc người dùng đã duyệt`);
 check(entries.some(e=>/^word\/media\//.test(e.name)),`${file} giữ logo/hình ảnh form gốc`);
 const data={checklist_standard_code:file.includes('9001')?'ISO 9001:2015':file.includes('14001')?'ISO 14001:2015':'ISO 45001:2018',customer_code:'C001',organization_name_vi:'CÔNG TY TNHH MẪU',audit_date:'06/08/2026',auditor_name:'NGUYỄN VĂN A',prepared_by:'NGUYỄN VĂN A'};
 for(let i=1;i<=count;i++){const k=String(i).padStart(3,'0'); data[`row_${k}_clause`]=i===1?'4':'4.1';data[`row_${k}_content`]=i===1?'Bối cảnh của tổ chức':'Nội dung kiểm tra';data[`row_${k}_c`]=i===1?'':'X';data[`row_${k}_ofi`]='';data[`row_${k}_minor`]='';data[`row_${k}_major`]='';data[`row_${k}_description`]='Bằng chứng';}
 const temp=path.join(os.tmpdir(),`patch35d-${path.basename(file)}`); engine.renderDocxTemplate({templatePath:full,outputPath:temp,data});
 check(fs.existsSync(temp)&&fs.statSync(temp).size>30000,`${file} sinh được DOCX thực tế`);
 const rendered=engine.readZipEntries(temp).filter(e=>e.name.endsWith('.xml')).map(e=>e.data.toString('utf8')).join('\n'); check(!/{{[^}]+}}/.test(rendered),`${file} không còn placeholder sau sinh`); fs.rmSync(temp,{force:true});
}
console.log(`\nPASS: ${pass}`); console.log(`FAIL: ${fail}`); if(fail) process.exit(1);
