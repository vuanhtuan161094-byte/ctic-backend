'use strict';
// F.16 bilingual original-field register: dynamically rendered with a signature
// area. The generated copy is a controlled working form, never an executed signature.
const { readZipEntries, writeZipEntries } = require('./ooxml-template-engine.cjs');
const escapeXml = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const p = (s, bold = false) => '<w:p><w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') +
    '<w:t xml:space="preserve">' + escapeXml(s) + '</w:t></w:r></w:p>';
const row = (cells, bold = false) => '<w:tr>' +
    (bold ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : '') +
    cells.map((v) => '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' +
        '<w:tcMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/>' +
        '<w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>' +
        p(v, bold) + '</w:tc>').join('') + '</w:tr>';
const tablePr = '<w:tblPr><w:tblW w:w="9400" w:type="dxa"/>' +
    '<w:tblBorders>' + ['top','left','bottom','right','insideH','insideV']
        .map((edge) => '<w:' + edge + ' w:val="single" w:sz="5" w:color="7F8FA0"/>')
        .join('') + '</w:tblBorders></w:tblPr>';
function renderF16({ baseTemplatePath, outputPath, data }) {
    if (!data || !Array.isArray(data.organizations) || !data.organizations.length) throw Error('F16 requires recognized organizations');
    const header = row(['TT/No.', 'Tổ chức / Organizations', 'Nội dung thừa nhận / Content recognition'], true);
    const bodyRows = data.organizations.map((v, i) => row([i + 1, v.name, v.recognition_scope])).join('');
    const grid = '<w:tbl>' + tablePr +
        '<w:tblGrid><w:gridCol w:w="800"/><w:gridCol w:w="3600"/><w:gridCol w:w="5000"/></w:tblGrid>' +
        header + bodyRows + '</w:tbl>';
    const sign = '<w:tbl>' + tablePr +
        row(['', 'Người lập / Prepared by', 'Người duyệt / Approved by'], true) +
        row(['Ký tên / Signature', 'CHỜ KÝ / SIGNATURE REQUIRED', 'CHỜ KÝ / SIGNATURE REQUIRED']) +
        row(['Họ tên / Full name', data.preparer_name ?? '', data.approver_name ?? '']) +
        row(['Ngày / Date', data.prepared_date ?? '', data.approved_date ?? '']) + '</w:tbl>';
    const content = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
        p('F.16 — DANH SÁCH TỔ CHỨC ĐƯỢC THỪA NHẬN / LIST OF RECOGNIZED ORGANIZATIONS', true),
        p('Phiên bản / Revision: ' + data.revision_no + '   |   Trạng thái / Status: APPROVED - UNSIGNED COPY'),
        grid, p('Số lượng tổ chức / Total: ' + data.organizations.length), sign,
        p('Không có chữ ký trong bản xuất tự động. Bản chính thức phải được người có thẩm quyền ký và lưu phiên bản SHA-256.', true),
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1100" w:right="850" w:bottom="1100" w:left="850"/></w:sectPr>',
        '</w:body></w:document>',
    ].join('');
    const entries = readZipEntries(baseTemplatePath).map(e => e.name === 'word/document.xml'
        ? { ...e, data: Buffer.from(content, 'utf8') } : e);
    writeZipEntries(entries, outputPath);
    return outputPath;
}
module.exports = { renderF16 };
