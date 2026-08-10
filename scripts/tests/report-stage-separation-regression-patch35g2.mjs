import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..', '..');
const parent = path.dirname(backendRoot);

function findFrontendRoot() {
  const candidates = [
    process.env.CTIC_FRONTEND_DIR,
    path.join(parent, 'frontend'),
    path.join(parent, 'ctic-frontend'),
    path.resolve(process.cwd(), '..', 'ctic-frontend'),
  ].filter(Boolean);
  try {
    for (const name of fs.readdirSync(parent)) {
      if (/frontend/i.test(name)) candidates.push(path.join(parent, name));
    }
  } catch {}
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx')));
}

const frontendRoot = findFrontendRoot();
const reportsService = path.join(backendRoot, 'src', 'reports', 'reports.service.ts');
const reportDocs = path.join(backendRoot, 'src', 'reports', 'report-documents.service.ts');
const auditPlans = path.join(backendRoot, 'src', 'audit-plans', 'audit-plans.service.ts');
const certificationProjects = path.join(backendRoot, 'src', 'certification-projects', 'certification-projects.service.ts');
const reportWorkspace = frontendRoot ? path.join(frontendRoot, 'app', 'components', 'AuditExecutionWorkspaceModal.tsx') : '';
const projectDetail = frontendRoot ? path.join(frontendRoot, 'app', 'components', 'CertificationProjectDetailScreen.tsx') : '';
const enginePath = path.join(backendRoot, 'src', 'reports', 'runtime', 'ooxml-template-engine.cjs');
const stage1Template = path.join(backendRoot, 'src', 'reports', 'templates', 'F.09-P.09-01.audit-report-stage-1.template.docx');
const stage2Template = path.join(backendRoot, 'src', 'reports', 'templates', 'F.09-P.09-02.audit-report-stage-2.template.docx');

let pass = 0;
let fail = 0;
function check(condition, label, detail = '') {
  if (condition) { pass += 1; console.log(`✓ ${label}`); }
  else { fail += 1; console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function hasAll(text, items) { return items.every((item) => text.includes(item)); }

check(Boolean(frontendRoot), 'Tìm thấy frontend để kiểm tra');
for (const file of [reportsService, reportDocs, auditPlans, certificationProjects, reportWorkspace, projectDetail, stage1Template, stage2Template]) {
  check(Boolean(file) && fs.existsSync(file), `Có ${path.basename(file || 'missing')}`);
}

const reportsText = read(reportsService);
const docsText = read(reportDocs);
const planText = read(auditPlans);
const projectText = read(certificationProjects);
const workspaceText = read(reportWorkspace);
const projectDetailText = read(projectDetail);

check(projectText.includes("document_key: 'stage2_audit_report'"), 'Hồ sơ lần đầu dùng khóa riêng stage2_audit_report');
check(!projectDetailText.includes('if (key.includes("stage2")) return stage2 ?? candidates[0] ?? null;'), 'Không fallback báo cáo GĐ2 sang PLAN bất kỳ');
check(projectDetailText.includes('if (key.includes("stage2")) return stage2 ?? null;'), 'Báo cáo GĐ2 khóa đúng PLAN GĐ2');
check(projectDetailText.includes('Chưa có Kế hoạch đánh giá Giai đoạn 2'), 'Thiếu PLAN GĐ2 báo hướng dẫn rõ');

check(hasAll(reportsText, ['reportStageForPlan', 'stage1AuditContentDefaults', 'stage1_report', 'stage2_report']), 'Backend có schema riêng cho GĐ1 và GĐ2');
check((reportsText.match(/'Hồ sơ pháp lý của Tổ chức'/g) ?? []).length >= 1, 'GĐ1 có nội dung Hồ sơ pháp lý');
check((reportsText.match(/'Mức độ kiểm soát được thiết lập/g) ?? []).length >= 1, 'GĐ1 có đủ nhóm mức độ kiểm soát');
check(reportsText.includes("? 'stage1_completed'"), 'Nộp GĐ1 không chuyển thẳng sang thẩm xét kỹ thuật');
check(planText.includes("'stage1_completed'"), 'Hoàn thành PLAN chấp nhận báo cáo GĐ1 đã nộp');
check(reportsText.includes('Báo cáo Giai đoạn 1 còn thiếu ghi chép/nhận xét'), 'Backend kiểm tra đủ nội dung F.09-P.09-01');
check(reportsText.includes('Phải nhập kiến nghị của đoàn đánh giá theo F.09-P.09-02'), 'Backend kiểm tra đúng kiến nghị F.09-P.09-02');

check(hasAll(workspaceText, ['F.09-P.09-01 · Báo cáo đánh giá Giai đoạn 1', '4. Nội dung đánh giá / Audit content', '5. Kết luận / Conclusion']), 'Frontend GĐ1 có biểu nhập riêng đúng các mục của F.09-01');
check(hasAll(workspaceText, ['F.09-P.09-02 · Báo cáo đánh giá chứng nhận', '4. Kết quả phát hiện đánh giá / Finding results', '5. Kiến nghị của đoàn đánh giá / Audit Team Recommendation', '6. Kiến nghị của khách hàng / Client Recommendation']), 'Frontend GĐ2 có biểu nhập riêng đúng các mục của F.09-02');
check(workspaceText.includes('Không dùng lại biểu nhập liệu của Giai đoạn 1'), 'Giao diện giải thích rõ GĐ2 tách biệt GĐ1');
check(workspaceText.includes('Ghi nhận phát hiện'), 'GĐ2 có thao tác ghi nhận phát hiện ngay trong báo cáo');
check(workspaceText.includes('stage1_readiness_result'), 'GĐ1 có kết quả sẵn sàng GĐ2');
check(!workspaceText.includes('name="execution_summary"'), 'Không còn biểu generic tóm tắt dùng chung cho cả hai giai đoạn');
check(!workspaceText.includes('name="effectiveness_summary"'), 'Không còn ép trường hiệu lực hệ thống vào F.09 GĐ1/GĐ2');

const engine = require(enginePath);
const stage1Tokens = engine.listTemplateTokens(stage1Template);
const stage2Tokens = engine.listTemplateTokens(stage2Template);
check(stage1Tokens.includes('#stage1_items'), 'Template GĐ1 lặp đúng các dòng nội dung đánh giá');
check(stage1Tokens.includes('conclusion'), 'Template GĐ1 có kết luận');
check(!stage1Tokens.includes('recommendation_label'), 'Template GĐ1 không chèn kiến nghị chứng nhận của GĐ2');
check(stage2Tokens.includes('#findings'), 'Template GĐ2 lặp bảng phát hiện');
check(stage2Tokens.includes('audit_team_recommendation'), 'Template GĐ2 có kiến nghị đoàn đánh giá đúng mục 5');
check(stage2Tokens.includes('client_recommendation'), 'Template GĐ2 có kiến nghị khách hàng đúng mục 6');
check(!stage2Tokens.includes('execution_summary'), 'Template GĐ2 không còn nhét biểu generic vào mục kiến nghị');
check(!stage2Tokens.includes('effectiveness_summary'), 'Template GĐ2 không còn trường hiệu lực không có trong form mẫu');

const fixture = {
  customer_code: 'C0218',
  organization_name_vi: 'CÔNG TY TNHH CHÍNH XÁC MINSEN (VIỆT NAM)',
  organization_name_en: 'MINSEN (VIETNAM) PRECISION CO., LTD',
  organization_address: 'Số 8 VSIP II-A, đường số 15, Việt Nam',
  contact_name: 'ĐỖ THỊ THUỶ TIÊN', contact_position: 'Nhân viên nhân sự', contact_phone: '0334598526', contact_email: '—',
  audit_location: 'Số 8 VSIP II-A', certification_scope: 'Gia công cơ khí chính xác linh kiện ngũ kim.',
  audit_objectives: 'Xác định sự phù hợp.', audit_type_label: 'Đánh giá chứng nhận lần đầu - Giai đoạn 1', standard_name: 'ISO 9001:2015', audit_criteria: 'ISO 9001:2015', audit_dates: '23/05/2026', audit_mandays: '0,5 man-day', audit_language: 'Tiếng Việt',
  audit_team: [{team:{no:1,full_name:'Lâm Hoàng Phúc',code:'A.CTIC.10',role:'Trưởng đoàn',contact:'0938288415'}}],
  client_representatives: [{representative:{no:1,full_name:'WU HONG JUN',position:'Tổng giám đốc'}}],
  auditee_representative_name:'WU HONG JUN', auditee_representative_position:'Tổng giám đốc', team_leader_name:'Lâm Hoàng Phúc', team_leader_role:'Trưởng đoàn',
  stage1_items: Array.from({length:11},(_,i)=>({item:{no:i+1,topic:`Nội dung GĐ1 ${i+1}`,note:`Ghi chép ${i+1}`,comment:'Phù hợp'}})),
  conclusion:'Tổ chức đã sẵn sàng cho đánh giá Giai đoạn 2.',
  findings:[{finding:{no:1,content:'Phát hiện NC mẫu',clause:'8.6',grade:'Minor NC',code:'NC01'}}],
  audit_team_recommendation:'Kiến nghị cấp chứng nhận sau khi hoàn thành hành động khắc phục.',
  client_recommendation:'Không có ý kiến bổ sung.',
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch35g2-'));
try {
  const s1 = path.join(tmp, 'stage1.docx');
  const s2 = path.join(tmp, 'stage2.docx');
  engine.renderDocxTemplate({templatePath:stage1Template, outputPath:s1, data:fixture});
  engine.renderDocxTemplate({templatePath:stage2Template, outputPath:s2, data:{...fixture,audit_type_label:'Đánh giá chứng nhận lần đầu - Giai đoạn 2'}});
  check(fs.statSync(s1).size > 20000, 'Sinh được F.09-P.09-01 thực tế');
  check(fs.statSync(s2).size > 20000, 'Sinh được F.09-P.09-02 thực tế');
  const xml1 = engine.readZipEntries(s1).find(e=>e.name==='word/document.xml')?.data.toString('utf8') ?? '';
  const xml2 = engine.readZipEntries(s2).find(e=>e.name==='word/document.xml')?.data.toString('utf8') ?? '';
  check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(xml1), 'F.09-01 không còn placeholder');
  check(!/{{\s*[#/A-Za-z0-9_.]+\s*}}/.test(xml2), 'F.09-02 không còn placeholder');
  check(hasAll(xml1,['Nội dung GĐ1 1','Nội dung GĐ1 11','Tổ chức đã sẵn sàng']), 'F.09-01 điền đúng nội dung và kết luận GĐ1');
  check(hasAll(xml2,['NC01','Kiến nghị cấp chứng nhận','Không có ý kiến bổ sung']), 'F.09-02 điền đúng phát hiện và kiến nghị');
  check(!xml2.includes('Nội dung GĐ1 1'), 'F.09-02 không lẫn dữ liệu GĐ1');
} catch (error) {
  check(false, 'Render hai mẫu F.09', error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}

console.log('');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
if (fail) process.exit(1);
