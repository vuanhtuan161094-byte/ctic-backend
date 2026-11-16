'use strict';
// Preserve every original legal clause and signature table from a controlled
// source template. Only prepend a contract-specific, unsigned cover sheet.
const { readZipEntries, writeZipEntries } = require('./ooxml-template-engine.cjs');
const escapeXml = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const para = (label, value) => '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' +
  escapeXml(label + ': ') + '</w:t></w:r><w:r><w:t xml:space="preserve">' +
  escapeXml(value ?? '') + '</w:t></w:r></w:p>';
const LABELS = Object.freeze({
  vi: ['THÔNG TIN THỎA THUẬN (BẢN CHƯA KÝ)', 'Khách hàng', 'Người đại diện', 'Chức vụ', 'Địa chỉ', 'Ngày ký dự kiến'],
  vi_en: ['AGREEMENT COVER (UNSIGNED) / THÔNG TIN THỎA THUẬN', 'Client / Khách hàng', 'Representative / Người đại diện', 'Position / Chức vụ', 'Address / Địa chỉ', 'Proposed date / Ngày dự kiến'],
  vi_cn: ['协议封面（未签署）/ THÔNG TIN THỎA THUẬN', '客户 / Khách hàng', '代表 / Người đại diện', '职务 / Chức vụ', '地址 / Địa chỉ', '拟签署日期 / Ngày dự kiến'],
});
function renderAgreementLanguage({templatePath, outputPath, language, data}) {
  if (!Object.hasOwn(LABELS, language)) throw Error('Unsupported F18 language');
  const values = [data.company, data.representative, data.position, data.address, data.proposed_date];
  if (!data.agreement_number || !data.company || !data.representative) throw Error('Incomplete F18 signatory fields');
  const entries = readZipEntries(templatePath);
  const body = entries.find(e => e.name === 'word/document.xml');
  if (!body) throw Error('Missing original legal document');
  const xml = body.data.toString('utf8');
  if (!/<w:body(?:\s|>)/.test(xml)) throw Error('Missing OOXML body');
  const labels = LABELS[language];
  const cover = para('', labels[0]) +
    para('F.18', data.agreement_number) +
    values.map((v,i)=>para(labels[i+1], v)).join('') +
    para('SOURCE', 'Original legal clauses and signature blocks follow unmodified; no signature is generated.') +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  // The source body and all original signature tables are preserved byte-for-byte
  // after the inserted cover. Only the cover text is personalized.
  body.data = Buffer.from(xml.replace(/<w:body(\s[^>]*)?>/, m => m + cover), 'utf8');
  writeZipEntries(entries, outputPath);
  return outputPath;
}
module.exports = { renderAgreementLanguage, LABELS };
