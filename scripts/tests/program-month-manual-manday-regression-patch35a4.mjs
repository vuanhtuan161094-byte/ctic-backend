import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
const appointmentService = read("src/audit-team-appointments/audit-team-appointments.service.ts");
const allocationService = read("src/audit-team-appointments/audit-manday-allocation.service.ts");
const allocationEngine = read("src/audit-team-appointments/integrated-manday-allocation.engine.ts");
const frontendRootCandidates = [
  path.resolve(root, "..", "frontend"),
  path.resolve(root, "..", "ctic-frontend"),
  path.resolve(root, "..", "..", "ctic-frontend"),
];
const frontendRoot = frontendRootCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "app", "components", "AuditProgramPanel.tsx")),
);
if (!frontendRoot) {
  console.error("Khong tim thay frontend de kiem tra Patch 35A.4.");
  process.exit(1);
}
const programPanel = fs.readFileSync(
  path.join(frontendRoot, "app", "components", "AuditProgramPanel.tsx"),
  "utf8",
);
const projectsScreen = fs.readFileSync(
  path.join(frontendRoot, "app", "components", "CertificationProjectsScreen.tsx"),
  "utf8",
);

let pass = 0;
let fail = 0;
const check = (condition, label) => {
  if (condition) {
    pass += 1;
    console.log(`✓ ${label}`);
  } else {
    fail += 1;
    console.error(`✗ ${label}`);
  }
};

const syntaxCheck = (source, fileName, jsx = false) => {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      experimentalDecorators: true,
    },
    fileName,
    reportDiagnostics: true,
  });
  return !(result.diagnostics ?? []).some(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
};

console.log("\n=== PATCH 35A.4 — CHƯƠNG TRÌNH THEO THÁNG & TÍNH MD THEO NÚT ===");

check(
  packageJson.scripts?.prebuild?.includes("prisma generate")
    && packageJson.scripts?.prebuild?.includes("verify-prisma-client-patch35a4"),
  "npm run build tự tạo và kiểm tra Prisma Client mới",
);
check(
  packageJson.scripts?.["prestart:dev"]?.includes("prisma generate")
    && packageJson.scripts?.["prestart:dev"]?.includes("verify-prisma-client-patch35a4"),
  "start:dev tự tạo và kiểm tra Prisma Client trước khi biên dịch",
);
check(
  fs.existsSync(path.join(root, "scripts", "verify-prisma-client-patch35a4.cjs")),
  "Có script phát hiện Prisma Client cũ",
);
check(
  fs.existsSync(path.join(root, "scripts", "apply-patch35a4.cmd")),
  "Có script cài đặt và sửa Prisma Client trên Windows",
);
check(
  /audit_event:\s*\{\s*select:\s*\{\s*event_type:\s*true,\s*planned_mandays:\s*true/s.test(appointmentService),
  "Kế hoạch lấy cả event_type và planned_mandays để nhận diện Stage 1",
);
check(
  /new Map<string, number>\(\s*appointment\.program_manday_requirements/s.test(allocationService)
    && /new Map<string, number>\(\s*\(dto\?\.program_weights/s.test(allocationService),
  "Map trọng số chương trình có kiểu number rõ ràng",
);
check(
  /countsTowardAuditMandays/.test(allocationEngine)
    && /TECHNICAL_EXPERT/.test(allocationEngine)
    && /OBSERVER/.test(allocationEngine)
    && /TRAINEE/.test(allocationEngine),
  "Chuyên gia kỹ thuật, quan sát viên và tập sự không tính man-day",
);

check(
  !projectsScreen.includes("mandayDebounceTimerRef")
    && !projectsScreen.includes("mandayRequestSignatureRef"),
  "Không còn tự gọi API tính man-day theo debounce",
);
check(
  projectsScreen.includes("const calculateMandaysNow = async")
    && projectsScreen.includes("Tính đề xuất")
    && projectsScreen.includes("Tính lại đề xuất"),
  "Man-day chỉ được tính khi bấm nút",
);
check(
  projectsScreen.includes("setMandayCalculationDirty(true)")
    && projectsScreen.includes("Dữ liệu đầu vào đã thay đổi"),
  "Thay đổi dữ liệu đánh dấu kết quả cũ cần tính lại",
);
check(
  projectsScreen.includes("sampled_site_reduction_percent: 0"),
  "Không tự áp dụng giảm 50% cho địa điểm lấy mẫu",
);
check(
  !/if\s*\(\s*mandaySuggestion[\s\S]{0,300}wizardForm\.setFieldsValue\(\{\s*base_mandays/s.test(projectsScreen),
  "Kết quả đề xuất không tự ghi đè biểu mẫu trước khi bấm Áp dụng",
);

check(
  programPanel.includes('picker="month"')
    && programPanel.includes('planning_precision: "MONTH"')
    && programPanel.includes('planned_month: event.planned_month.format("YYYY-MM")'),
  "Chương trình 3 năm lưu tháng dự kiến thay vì khóa ngày",
);
check(
  programPanel.includes('planned_start_date: event.planned_month.startOf("month")')
    && programPanel.includes('planned_end_date: event.planned_month.endOf("month")'),
  "Ngày trong DB chỉ là biên tháng để tương thích dữ liệu cũ",
);
check(
  programPanel.includes("Chưa khóa ngày cụ thể")
    && programPanel.includes('planning_precision: "MONTH"'),
  "Giao diện và payload giữ kế hoạch ở độ chính xác theo tháng",
);
check(
  programPanel.includes("const openPlanEditor")
    && programPanel.includes("const createPlanFromEvent = async ()")
    && programPanel.includes("planned_start_date: planStartDate.format")
    && programPanel.includes("exact_dates_selected_manually: true"),
  "Tạo kế hoạch mở bước chọn ngày cụ thể riêng",
);
check(
  !programPanel.includes("planned_start_date: event.planned_start_date"),
  "Kế hoạch không còn sao chép cứng ngày từ chương trình",
);
check(
  programPanel.includes('previousPlanDate.add(1, "year")'),
  "Kỳ từ năm sau lấy kế hoạch năm trước làm gợi ý ngày",
);
check(
  programPanel.includes("Hệ thống vẫn cho phép lưu vì chương trình chỉ là dự kiến"),
  "Cho phép ngày kế hoạch nằm ngoài tháng dự kiến với cảnh báo",
);

check(syntaxCheck(appointmentService, "audit-team-appointments.service.ts"), "Service chỉ định đoàn không lỗi cú pháp");
check(syntaxCheck(allocationService, "audit-manday-allocation.service.ts"), "Service phân bổ man-day không lỗi cú pháp");
check(syntaxCheck(programPanel, "AuditProgramPanel.tsx", true), "AuditProgramPanel không lỗi cú pháp");
check(syntaxCheck(projectsScreen, "CertificationProjectsScreen.tsx", true), "CertificationProjectsScreen không lỗi cú pháp");

const month = "2027-10";
const start = new Date(`${month}-01T00:00:00Z`);
const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
check(
  start.toISOString().slice(0, 10) === "2027-10-01"
    && end.toISOString().slice(0, 10) === "2027-10-31",
  "Mô phỏng lưu tháng 10/2027 thành biên tháng đúng",
);
const previousPlanDate = new Date("2027-10-14T00:00:00Z");
const nextYearSuggestion = new Date(previousPlanDate);
nextYearSuggestion.setUTCFullYear(nextYearSuggestion.getUTCFullYear() + 1);
check(
  nextYearSuggestion.toISOString().slice(0, 10) === "2028-10-14",
  "Mô phỏng kỳ năm sau giữ ngày/tháng kế hoạch năm trước",
);

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
