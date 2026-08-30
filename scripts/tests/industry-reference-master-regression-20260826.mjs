import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
function check(name, ok) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  checks.push(name);
  console.log(`PASS: ${name}`);
}

const service = read('src/master-data-configuration/master-data-configuration.service.ts');
const dto = read('src/master-data-configuration/dto/master-data-configuration.dto.ts');
const industryService = read('src/industry-classifications/industry-classifications.service.ts');
const industryController = read('src/industry-classifications/industry-classifications.controller.ts');
const loader = read('scripts/load-official-industry-reference-20260826.cjs');

check('Import Center hỗ trợ ISIC_NACE_MAPPING', service.includes('ISIC_NACE_MAPPING') && dto.includes('ISIC_NACE_MAPPING'));
check('ISIC_NACE_MAPPING có validation tham chiếu ISIC và NACE', service.includes("classification_type === 'ISIC'") && service.includes("classification_type === 'NACE'") && service.includes('ISIC–NACE mapping đã tồn tại'));
check('ISIC_NACE_MAPPING commit tạo industry_code_mappings DRAFT', service.includes("job.entity_type === 'ISIC_NACE_MAPPING'") && service.includes("mapping_status: 'DRAFT'"));
check('Có API summary cho dữ liệu phân loại ngành', industryController.includes("@Get('summary')") && industryService.includes('async getSummary()'));
check('Summary đếm ISIC Rev.4 và NACE Rev.2', industryService.includes("revision: 'ISIC_REV_4'") && industryService.includes("revision: 'NACE_REV_2'"));
check('Loader lấy ISIC Rev.4 từ UNSD', loader.includes('unstats.un.org') && loader.includes('ISIC_Rev_4_english_structure'));
check('Loader lấy correspondence ISIC Rev.4 -> NACE Rev.2 từ UNSD', loader.includes('ISIC4_NACE2'));
check('Loader ưu tiên NACE Rev.2 từ Eurostat', loader.includes('ec.europa.eu/eurostat/api/dissemination'));
check('Loader có fallback EEA/Eionet cho NACE', loader.includes('dd.eionet.europa.eu/vocabulary/eurostat/nace_r2/csv'));
check('Loader khóa DEV localhost CTIC_Certification', loader.includes("db !== 'CTIC_Certification'") && loader.includes('DEV loader only accepts localhost'));
check('Loader xác nhận đủ NACE 21/88/272/615 = 996', loader.includes('counts[1] !== 21') && loader.includes('counts[4] !== 615') && loader.includes('values.length !== 996'));
check('Loader nạp đủ 39 IAF scopes', loader.includes('IAF_SCOPES') && loader.includes("[39, 'Dịch vụ xã hội khác'"));
check('Loader tạo mapping QMS, EMS, OHSMS', loader.includes("['QMS', 'EMS', 'OHSMS']"));
check('OHSMS xử lý ngoại lệ NACE 20.13 theo IAF MD22', loader.includes("code === '20.13'") && loader.includes('radioactive-material scope'));
check('Sanity check ISIC 2220 -> 4 NACE plastic classes', loader.includes("['22.21', '22.22', '22.23', '22.29']"));
check('Sanity check NACE 22.29 -> IAF14 cho ba hệ thống', loader.includes("naceByCode.get('22.29')") && loader.includes("iafByCode.get('14')"));

console.log(`\nINDUSTRY REFERENCE MASTER REGRESSION: PASS (${checks.length} pass, 0 fail)`);
