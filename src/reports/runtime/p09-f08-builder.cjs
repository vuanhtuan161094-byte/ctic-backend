'use strict';

// F.08 audit note: a plain OOXML document compiled from the fields of the
// owner-provided F.08-P.09 form. Reuses an existing valid DOCX ZIP shell only;
// it does not reuse the unrelated form's visible contents or headers.
const { readZipEntries, writeZipEntries } = require('./ooxml-template-engine.cjs');
const escape = (input) => String(input ?? '').replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const text = (value, bold = false) =>
    `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escape(value)}</w:t></w:r></w:p>`;
const cell = (value, header = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${text(value, header)}</w:tc>`;
const tableRow = (values, header = false) =>
    `<w:tr>${values.map((v) => cell(v, header)).join('')}</w:tr>`;
function renderAuditNotesDocx({ baseTemplatePath, outputPath, data }) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const header = tableRow(['Điều khoản / Clause', 'Nội dung / Contents', 'Phát hiện / Findings'], true);
    const grid = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map((k)=>`<w:${k} w:val="single" w:sz="4"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="4700"/><w:gridCol w:w="2850"/></w:tblGrid>${header}${rows.map((r) => tableRow([r.clause, r.content, r.finding])).join('')}</w:tbl>`;
    const documentXml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
        text('F.08-P.09 — GHI CHÉP ĐÁNH GIÁ / AUDIT NOTES', true),
        text(`Mã khách hàng / Client Code: ${data.customer_code}`),
        text(`Tên khách hàng / Auditee: ${data.organization_name}`),
        text(`Địa điểm đánh giá / Audit site: ${data.audit_location}`),
        text(`Chuyên gia đánh giá / Auditor: ${data.auditor_name}`),
        text(`Ngày đánh giá / Audit date: ${data.audit_date}`),
        grid,
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1100" w:right="850" w:bottom="1100" w:left="850"/></w:sectPr>',
        '</w:body></w:document>',
    ].join('');
    const entries = readZipEntries(baseTemplatePath).map((entry) => entry.name === 'word/document.xml'
        ? { ...entry, data: Buffer.from(documentXml, 'utf8') } : entry);
    writeZipEntries(entries, outputPath);
    return outputPath;
}
module.exports = { renderAuditNotesDocx };
