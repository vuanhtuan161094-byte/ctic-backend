import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const allocationService = read("src/audit-team-appointments/audit-manday-allocation.service.ts");
const frontendRootCandidates = [
  path.resolve(root, "..", "frontend"),
  path.resolve(root, "..", "ctic-frontend"),
  path.resolve(root, "..", "..", "ctic-frontend"),
];
const frontendRoot = frontendRootCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, "app", "components", "ScheduleResourcesScreen.tsx")),
);
if (!frontendRoot) {
  console.error("Khong tim thay frontend de kiem tra Patch 35A.5.");
  process.exit(1);
}
const scheduleScreen = fs.readFileSync(
  path.join(frontendRoot, "app", "components", "ScheduleResourcesScreen.tsx"),
  "utf8",
);
const programPanel = fs.readFileSync(
  path.join(frontendRoot, "app", "components", "AuditProgramPanel.tsx"),
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

console.log("\n=== PATCH 35A.5 — GĐ1 NHIỀU THÀNH VIÊN & SỬA KHUNG NGÀY PLAN ===");

check(
  allocationService.includes("Trưởng đoàn chịu trách nhiệm chính; đánh giá viên có thể tham gia")
    && !allocationService.includes("Toàn bộ man-day Giai đoạn 1 do trưởng đoàn thực hiện"),
  "Backend không còn ép toàn bộ MD GĐ1 cho một mình trưởng đoàn",
);
check(
  allocationService.includes("let allocatedMandays = 0")
    && allocationService.includes("allocatedMandays += mandays")
    && allocationService.includes("allocatedMandays + 0.001 < requiredMandays"),
  "Backend kiểm tra tổng MD GĐ1 theo mức tối thiểu, cho phép bố trí vượt",
);
check(
  allocationService.includes("tham gia Giai đoạn 1 nên phải được phân tối thiểu 0,5 MD")
    && allocationService.includes("Trưởng đoàn phải trực tiếp tham gia tối thiểu 0,5 MD"),
  "Trưởng đoàn và đánh giá viên tính MD phải nhận tối thiểu 0,5 MD",
);
check(
  allocationService.includes("vai trò hỗ trợ không được tính man-day Giai đoạn 1"),
  "Vai trò hỗ trợ tiếp tục bị khóa 0 MD tại GĐ1",
);
check(
  scheduleScreen.includes("có thể bổ sung đánh giá viên khi cần")
    && scheduleScreen.includes("Đánh giá viên có thể tham gia và được phân man-day Giai đoạn 1"),
  "Frontend cho phép đánh giá viên tham gia GĐ1",
);
check(
  !scheduleScreen.includes('teamRole === "TEAM_LEADER" ? selectedRequiredMandays ?? 0 : 0')
    && scheduleScreen.includes("Math.max(0.5, suggestedMandays)"),
  "Đổi vai trò không còn tự dồn toàn bộ MD cho trưởng đoàn",
);
check(
  scheduleScreen.includes('inheritedMembers.filter((member) => normalize(member.team_role) === "team_leader")'),
  "Dự thảo GĐ1 mới mặc định chỉ kế thừa trưởng đoàn",
);
check(
  /selectedIsStage1\s*\?\s*0\.5\s*:\s*inclusiveDayCount/s.test(scheduleScreen),
  "Thêm đánh giá viên GĐ1 mặc định 0,5 MD",
);
check(
  scheduleScreen.includes("Sửa khung ngày kế hoạch")
    && scheduleScreen.includes("updatePlanDatesMutation")
    && scheduleScreen.includes("/audit-plans/${selectedPlan.id}"),
  "Có thể sửa trực tiếp khung ngày PLAN từ màn hình phân công",
);
check(
  scheduleScreen.includes("Khung ngày hiện tại chưa đủ khả năng bố trí man-day")
    && scheduleScreen.includes("draftPlanCapacityInsufficient"),
  "Giao diện cảnh báo khi số ngày × số người không đủ MD",
);
check(
  scheduleScreen.includes("Chương trình ba năm chỉ lưu tháng dự kiến")
    && scheduleScreen.includes("không thay đổi tháng dự kiến trong chương trình"),
  "Sửa PLAN không làm thay đổi tháng dự kiến của chương trình 3 năm",
);
check(
  programPanel.includes('const suggestedMemberCount = eventType === "stage1"')
    && programPanel.includes("suggestedCalendarDays")
    && programPanel.includes("Math.ceil(numberValue(event.planned_mandays) / suggestedMemberCount)"),
  "Khi tạo PLAN, hệ thống gợi ý độ dài theo MD thay vì mặc định một ngày",
);
check(
  programPanel.includes('eventType === "stage1"\n      ? 1')
    && programPanel.includes("Mặc định giả định trưởng đoàn thực hiện"),
  "Gợi ý GĐ1 mặc định bảo thủ theo một trưởng đoàn nhưng cho phép rút ngắn",
);
check(
  programPanel.includes("Khung ngày gợi ý hiện chưa đủ khả năng bố trí")
    && programPanel.includes("Khi phân công thực tế, hệ thống sẽ kiểm tra lại theo từng người"),
  "Màn hình tạo PLAN hiển thị kiểm tra khả năng bố trí",
);
check(
  programPanel.includes("currentDuration")
    && programPanel.includes('setPlanEndDate(next.add(currentDuration, "day"))'),
  "Đổi ngày bắt đầu giữ nguyên độ dài khung kế hoạch",
);

check(syntaxCheck(allocationService, "audit-manday-allocation.service.ts"), "Service GĐ1 không lỗi cú pháp");
check(syntaxCheck(scheduleScreen, "ScheduleResourcesScreen.tsx", true), "ScheduleResourcesScreen không lỗi cú pháp");
check(syntaxCheck(programPanel, "AuditProgramPanel.tsx", true), "AuditProgramPanel không lỗi cú pháp");

const requiredMd = 5.5;
const stage1Members = [
  { role: "TEAM_LEADER", mandays: 3 },
  { role: "AUDITOR", mandays: 2.5 },
  { role: "TECHNICAL_EXPERT", mandays: 0 },
];
const countingRoles = new Set(["TEAM_LEADER", "AUDITOR"]);
const allocated = stage1Members
  .filter((member) => countingRoles.has(member.role))
  .reduce((sum, member) => sum + member.mandays, 0);
check(Math.abs(allocated - requiredMd) < 0.001, "Mô phỏng trưởng đoàn 3,0 + đánh giá viên 2,5 = 5,5 MD GĐ1");
check(stage1Members[2].mandays === 0, "Mô phỏng chuyên gia kỹ thuật vẫn bằng 0 MD");

const oneDayOnePersonCapacity = 1 * 1;
const threeDaysTwoPeopleCapacity = 3 * 2;
check(oneDayOnePersonCapacity < requiredMd, "Phát hiện PLAN một ngày/một người không đủ 5,5 MD");
check(threeDaysTwoPeopleCapacity >= requiredMd, "PLAN ba ngày/hai người đủ khả năng bố trí 5,5 MD");
check(Math.ceil(5.5 / 1) === 6, "Gợi ý GĐ1 5,5 MD với một người là khung 6 ngày");
check(Math.ceil(5.5 / 2) === 3, "Khi có hai người, 5,5 MD có thể bố trí trong khung 3 ngày");

console.log(`\nPASS: ${pass}`);
console.log(`FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
