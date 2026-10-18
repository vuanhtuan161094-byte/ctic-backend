# CMP — NEXT CHAT HANDOFF / LAUNCHER RECOVERY
**Ngày cập nhật:** 2026-10-18 (Asia/Bangkok / Việt Nam)  
**Trạng thái:** HANDOFF READY — Windows launcher **BLOCKED / NOT VERIFIED PASS**  
**Mục tiêu người dùng ngay lúc này:** mở được CMP trên máy Windows để **xem UI/UX frontend đã sửa**. Không yêu cầu họ chạy hàng loạt QA.

> Đây là tài liệu bàn giao thực thi. Đọc tài liệu này và HEAD thực tế của GitHub **trước khi sửa**, không coi các đoạn chat trước là mã nguồn authority.

## 0. 2026-10-18 follow-up — launcher hardening committed, Windows smoke PENDING

- Feature backend source checkpoint before this docs commit: `edf59ab230c7dd6d33a5497683f97d368438e82e`. Source commit series: `fdeb793c`, `ddc58465`, `edf59ab2`.
- Frontend remains `2b26d6d277bd8d15a6074034ad63ec83410c466e` at latest read; confirm live HEAD before any new work.
- Replaced nested CMD blocks/delayed expansion with temporary-directory staging and environment-based Unicode backend path; kept fast-forward-only synchronization and local WIP protections.
- Scoped PID state per normalized backend checkout path and saved Unicode-safe JSON. Previous global state is intentionally not trusted for termination.
- TCP owner discovery now fails closed on API errors; stale listener termination requires an identifiable `node.exe` command line within this CMP checkout.
- Loopback HTTP probes bypass system proxy, accept only 2xx, and require repeated successful frontend probes instead of treating a listening TCP port as proof of UI readiness.
- Static review confirmed the prior `${Label}:` parser fix and required branches/commands still exist. **No Windows PowerShell 5.1 parser execution, no CMD->PowerShell path smoke, no browser/runtime or double-run evidence was available in this GitHub connector execution.** Therefore launcher Windows status stays **PENDING / NOT VERIFIED PASS**.
- Owner machine needs one-time launcher update: `git -C "E:\\0. Lập trình\\CMP\\backend" pull --ff-only origin feature/ux-fix-batch01` (never reset/clean). Then double-click `CMP_ONE_CLICK.cmd`. The launcher fetches the frontend branch after checks. If blocked by local WIP, preserve it and diagnose instead of forcing the pull.
- Safety fallback for UI preview remains two terminals running `npm run start:dev` in backend and `npm run dev` in frontend after SQL readiness and safe branch sync; see section 7.

## 1. Tổng quan dự án và repository

- Sản phẩm: **CMP — Certification Management Platform**, hệ thống quản lý chứng nhận.
- Backend: https://github.com/vuanhtuan161094-byte/ctic-backend
- Frontend: https://github.com/vuanhtuan161094-byte/ctic-frontend
- Branch cả hai: **feature/ux-fix-batch01**; **main chưa merge**, không tự merge.
- HEAD backend xác minh trước khi tạo tài liệu: **6e81afb5d9a0a7a45c96dea824924b51992e0a81**. Sau khi commit tài liệu này, HEAD backend sẽ tiến thêm đúng một docs-only commit: **phải fetch HEAD live**, không ép pin SHA cũ.
- HEAD frontend xác minh: **2b26d6d277bd8d15a6074034ad63ec83410c466e**; có thể thay đổi nếu Codex khác vẫn đang làm.
- Máy Windows của người dùng:
  - Backend: **E:\0. Lập trình\CMP\backend**
  - Frontend: **E:\0. Lập trình\CMP\frontend**
  - Khởi động một lần bấm: **E:\0. Lập trình\CMP\backend\CMP_ONE_CLICK.cmd**
  - Backend dev: http://127.0.0.1:3000 ; health: http://127.0.0.1:3000/health
  - Frontend dev: http://127.0.0.1:5173/
- Stack: NestJS 11 + TypeScript + Prisma 7 + SQL Server; React 19 + Vite 8 + Ant Design 6.
- Product direction: triển khai **P.09 — chứng nhận hệ thống quản lý** trước; **P.08 — chuyên gia/năng lực** đã có phần lớn module; P.10/P.11/P.13 chưa mở rộng nghiệp vụ theo checkpoint hiện hành. SRS cũ có phạm vi rộng hơn; không coi là authorization mở thêm module.
- One organization = one installation, database/storage/branding riêng; không hardcode thương hiệu CTIC vào UI.

## 2. Ý định ưu tiên và cách làm việc của Product Owner

1. **Ưu tiên tuyệt đối: để người dùng mở và xem UI/UX hôm nay.** Nếu launcher chưa hoạt động, sửa launcher trước; đừng tự chuyển sang UAT dài.
2. Người dùng muốn làm nhanh, **Codex tự chủ sửa và push**, không xin phê duyệt cho thay đổi kỹ thuật thông thường.
3. **Không làm việc thừa**: kiểm tra targeted, chỉ chạy full gate ở checkpoint cần thiết; không chạy cloud CI chỉ vì workflow chưa được cấp runner.
4. **Không reset/clean/stash, không force push, không ghi đè tracked WIP, không xóa untracked/backup/uploads/save/DB.**
5. Repo GitHub là authority. Nếu máy có WIP, báo rõ và xử lý theo nguyên tắc bảo tồn; không “khắc phục” bằng destructive commands.
6. Không tự merge main, không schema migration, không thay man-day, certificate authority, approval, RBAC hoặc status workflow vì sửa launcher/UI.
7. Trả lời ngắn: vấn đề → nguyên nhân đã kiểm chứng → sửa → Windows test → commit/HEAD → người dùng chỉ cần nhấp đúp.
8. Nếu không có Windows runner, **không được tuyên bố launcher PASS**. Có thể làm static audit nhưng phải gắn PENDING.

## 3. Kết quả UI/UX đã có

Frontend đã có nhiều batch responsive/compact tối ưu các khu vực:
- Dashboard quản lý, resource load, tài liệu, hồ sơ chuyên gia, năng lực, đối chiếu, đào tạo/giám sát, độc lập.
- Customer Portal: dashboard, đơn đăng ký, hồ sơ tổ chức, tài liệu, yêu cầu, khiếu nại, lịch; NC/CAP, chứng chỉ và kết quả.
- Audit assignment, Audit Workspace, technical review, certificate issuance, quản trị tài khoản.
- Hai lỗi phát hiện qua browser đã sửa theo Codex: **5 thẻ KPI mobile bị co khoảng 50px** và **nút gửi CAP dưới đáy viewport 1366×768**; dùng adaptive KPI grid và modal body scroll riêng, footer actions nhìn thấy.
- Các commit cuối: 036dbb817b (NC/CAP), 49574bc9c8 (customer certificate/results), 2b26d6d277 (admin accounts).
- Codex báo: frontend local full gate **480/480 PASS**, lint/typecheck/build PASS; Playwright targeted PASS ở **390×844 / 1366×768 / 1440×900**; trước đó expert-focused **24/24 PASS**. Đây là **bằng chứng do Codex báo cáo**, không phải kiểm thử mới chạy trong lần bàn giao này.
- Cảnh báo Ant Design List trên Dashboard ở dev còn mở, chưa thấy lỗi runtime liên quan trong các màn hình đã kiểm tra.
- **Chưa FULL UAT**, chưa nghiệm thu trực quan toàn phần bởi Product Owner.
- GitHub frontend Actions ở HEAD 2b26d6d... hiển thị failure nhưng job có **0 bước thực thi** (2026-10-18). Không suy diễn thành build/test fail.
- Người dùng cần mở phần mềm để tự đánh giá chất lượng desktop, khoảng trống, mật độ thông tin. **Đừng tiếp tục sửa UI không có feedback khi launcher còn lỗi.**

## 4. Lỗi Windows launcher — timeline và bằng chứng

### A. Lỗi ban đầu (trước 18/10)
- Launcher cũ thông báo: backend port 3000 và frontend HTTP 5173 ready, sau đó **[FAIL] Frontend stopped responding after startup: The operation has timed out.**
- Logs trước đó cho thấy Nest và Vite có thể vẫn còn chạy. Giả thuyết false negative HTTP probe; **chưa xác nhận runtime cho bản launcher mới**.
- Backend 51beddc5: thêm **CMP_ONE_CLICK.cmd** và **scripts/cmp-one-click.ps1**, git sync & process/port/HTTP probes.
- Backend 1074cba7: sửa delayed expansion trong CMD.

### B. Lỗi 1 được người dùng cung cấp 18/10
PowerShell parser ở file %TEMP%\CMP_ONE_CLICK_...ps1, dòng 122:

~~~text
Variable reference is not valid. ':' was not followed by a valid variable name character.
FullyQualifiedErrorId : InvalidVariableReferenceWithDrive
~~~

- Nguyên nhân đã xác định: chuỗi double-quoted với **$Label:** là cú pháp nội suy sai PowerShell.
- Commit **1327623c7691c9415206732c50e79bde93547c5b** sửa thành dạng biến có ranh giới rõ.
- Đã rà các mẫu biến theo regex trên file PS, không thấy mẫu tương tự; **chưa có parser test bằng Windows PowerShell**.

### C. Lỗi 2 được người dùng cung cấp sau khi pull
File tạm %TEMP%\CMP_ONE_CLICK_...ps1 báo:

~~~text
Exception calling "GetFullPath" with "1" argument(s): "Illegal characters in path."
CategoryInfo : MethodInvocationException
~~~

- Xảy ra khi tính backend path đầu file PS, **trước Git sync và khởi động server**.
- Chẩn đoán trước đây cho rằng truyền tham số CMD có trailing backslash + quotes làm hỏng đường dẫn. **Đây là giả thuyết, chưa có dump giá trị BackendPath / argv để chứng minh chính xác.**
- Backend commit **6e81afb5d9a0a7a45c96dea824924b51992e0a81** thay cơ chế truyền đường dẫn:
  - CMD đặt biến môi trường **CMP_BACKEND_PATH** lấy từ %~dp0.
  - CMD gọi temp script qua tham số path của PowerShell script, không truyền BackendPath trong argv.
  - PS đọc default **BackendPath** từ biến môi trường **CMP_BACKEND_PATH** và kiểm tra rỗng.
- Đã kiểm tra HEAD GitHub / nội dung file sau push; **không có Windows run kết quả sau commit này**.
- **KHÔNG** coi vấn đề đã đóng, không tiếp tục vá dựa trên suy đoán.

## 5. Kiến trúc launcher mới cần kiểm tra một lần cho đủ

Files:
1. backend/CMP_ONE_CLICK.cmd (file người dùng nhấp đúp).
2. backend/scripts/cmp-one-click.ps1 (~500 dòng).

Luồng dự kiến:
1. CMD tự copy CMD + PS1 sang %TEMP%, rồi chạy temp CMD để tránh file lock khi git pull cập nhật chính launcher.
2. PS1 lấy BackendPath, suy ra thư mục frontend là sibling.
3. Kiểm tra git.exe / npm.cmd, package.json, branch feature/ux-fix-batch01 và origin chính xác.
4. Từ chối tracked/staged WIP; để nguyên untracked.
5. git fetch origin branch; đo ahead/behind; chỉ merge --ff-only khi không có local commit ahead.
6. Stop process CMP cũ dựa trên state file %TEMP%\CMP-launcher-state.json và pid + startTime; bảo vệ process khác trên ports.
7. Start backend: npm run db:recover:local rồi npm run start:dev.
8. Đợi GET http://127.0.0.1:3000/health (deadline 180s).
9. Start frontend: npm run dev -- --host 127.0.0.1 --port 5173 --strictPort.
10. Đợi GET http://127.0.0.1:5173/ (deadline 60s); additional stability probes.
11. Khi sẵn sàng mở browser và in **CMP READY**.
12. Logs: %TEMP%\CMP-YYYYMMDD-HHMMSS-PID\backend.stdout.log / backend.stderr.log / frontend.stdout.log / frontend.stderr.log.

**Điểm có rủi ro cần audit chủ động, không đợi người dùng phát hiện:**
- CMD special characters, dấu ngoặc, code page Unicode trong path E:\0. Lập trình\..., dấu \ cuối đường dẫn.
- CMD expansion, nested call, escape/quoting /d /s /c, process handle/HasExited và PowerShell parameter binding.
- PowerShell 5.1 parse errors, Unicode path, .NET HttpClient initialization.
- Git branch/remote/ahead/behind và repo local WIP; không silent overwrite.
- Get-NetTCPConnection có thể trả lỗi bị nuốt; nhận diện port owner qua Win32_Process CommandLine không phải lúc nào có path repo.
- Nguy cơ kill sai PID/process: phải ưu tiên fail-closed, không kill process không xác nhận là CMP.
- Trạng thái SQL Server: thiếu DB/service phải báo rõ, không chạy migration/repair/destructive data action ngoài phạm vi.
- Liveness vs readiness: response 4xx ở frontend không mặc nhiên là app hoạt động bình thường; nên kiểm tra HTTP thành công + browser login thật.
- HTTP probe chậm/transient timeout; không false fail và cũng không false PASS nếu browser không dùng được.
- Hai script phải cùng version; tránh temp copy cũ/tải nhầm branch.
- Temp cleanup chỉ xóa files do launcher tạo, không xóa log hoặc untracked.
- CMD phải giữ cửa sổ lỗi để người dùng thấy thông báo; success không đòi user gõ lệnh.
- GitHub Actions gần đây backend HEAD 6e81afb5d... cũng failure job **0 bước chạy**; không phải parser test.

## 6. Chỉ thị cho Codex/chat mới — THỰC HIỆN NGAY

### Phase 0: đọc bằng chứng và thu thập state (read-only)
- Đọc file bàn giao này, backend/AI_context.md, backend/CMP_ONE_CLICK.cmd, backend/scripts/cmp-one-click.ps1, backend/package.json, frontend/package.json và HEAD mới nhất của hai repos.
- Nếu Codex chạy ngay trên Windows của người dùng, kiểm tra local path / Git status / Git origin và xác nhận không có WIP tracked trước pull.
- Giữ nguyên untracked. Không xóa file theo suy đoán.
- Xem logs lỗi mới nhất trong %TEMP%, tránh đọc/đăng công khai secrets của .env.

### Phase 1: test parser và tham số ngay trên Windows
- Chạy **Windows PowerShell 5.1 parser** cho PS1 bằng [System.Management.Automation.Language.Parser]::ParseFile với token/error references. Parse phải 0 error **trước khi** start.
- Kiểm tra CMD -> temp CMD -> PS1: in dạng safe/sanitized đường dẫn nhận được, xác định chính xác lỗi nếu có.
- Có thể chạy test harness riêng kiểm tra quoting/spaces/Unicode/trailing slash. Không đụng DB trong bước này.
- Rà toàn bộ PS1, đặc biệt **GetFullPath, Start-CmpProcess, Invoke-GitCapture, Get-ListenerPids, Wait-HttpReady**.
- Sửa **một batch launcher tổng thể** với regression nhỏ cho parser/argument passing, không sửa từng triệu chứng không test.

### Phase 2: Windows end-to-end smoke
- Chạy launcher từ backend path trên Windows như người dùng thực sự nhấp đúp; bảo vệ WIP.
- Xác nhận Git sync backend/frontend an toàn (branch/head/remote).
- Backend/health 200/2xx; frontend root HTTP 2xx; browser truy cập được frontend.
- Mở login và một màn hình production của CMP; nếu có quyền, kiểm tra navigation UI; tuyệt đối không ghi dữ liệu nghiệp vụ thật chỉ để smoke.
- Chạy launcher **lần thứ hai** để kiểm tra restart/port ownership, không kill process ngoài CMP.
- Giữ logs đủ để điều tra lỗi nếu fail.
- Nếu không có Windows runner, chỉ được báo **static PASS / Windows runtime PENDING**; dùng Codex Desktop/Windows runtime để hoàn tất.

### Phase 3: chỉ sau khi Windows PASS
- Commit/push sửa launcher lên backend feature branch; không merge.
- Nếu có thay đổi UI, chỉ targeted QA; không mở rộng khi mục tiêu là xem UI.
- Báo người dùng lệnh đồng bộ tối thiểu và đúng **một file để nhấp đúp**, URL http://127.0.0.1:5173/.
- Nếu launcher tự đồng bộ nhưng chính launcher ở local chưa update, hướng dẫn **một lần**:
  
  ~~~powershell
  git -C "E:\0. Lập trình\CMP\backend" pull --ff-only origin feature/ux-fix-batch01
  ~~~
  
  Không dùng git reset --hard/clean -fd.

### Done criteria — bắt buộc
- Parser 0 errors.
- CMD -> PS1 backend path chính xác, có spaces/Unicode/trailing slash.
- Bật backend + frontend từ **một lần nhấp đúp**, mở UI.
- Tái chạy launcher lần thứ hai không lỗi hoặc can thiệp process khác.
- No data loss/no WIP overwrite.
- Windows runtime evidence PASS, commit HEAD mới (nếu có).
- User chỉ phải kiểm tra UI tối đa vài phút, không cài lại cả hệ thống.

## 7. Nếu launcher vẫn chặn việc xem UI: workaround có kiểm soát

Chỉ khi cần mở UI ngay: từ 2 terminal riêng chạy server trực tiếp, **sau khi xác nhận local code đã sync và SQL Server sẵn sàng**.

Terminal backend:
~~~powershell
cd "E:\0. Lập trình\CMP\backend"
npm run start:dev
~~~

Terminal frontend:
~~~powershell
cd "E:\0. Lập trình\CMP\frontend"
npm run dev
~~~

Mở http://127.0.0.1:5173/. Đây là workaround, **không được báo launcher PASS**. Nếu backend lỗi kết nối SQL, chẩn đoán service / db:preflight trước; không migrate/reset DB tùy tiện.

## 8. Roadmap sau khi người dùng xem UI

**Không tự nhảy đến roadmap này cho tới khi launcher và UI preview sử dụng được.**

1. Product Owner nhìn desktop 1366×768, zoom 100%, chọn màn hình còn thưa/kém chuyên nghiệp; chỉ sửa có căn cứ.
2. Chốt UI/UX final audit (không refactor lan man).
3. P.08: close live recommendation UAT còn treo vì chưa có valid audit project/plan (không bypass workflow). Lịch sử: UAT-02..07,09 đã PASS theo checkpoint trước; UAT-08 chưa có live proof.
4. P.09: backend & frontend regression; 16 nhóm Master UAT trên SQL test; P09 real SQL repeatability 2/2; SoD, CAP, decision, certificate version/QR.
5. Production: verify backup database + uploads, restore drill isolated, env/TLS/RBAC, smoke, rollback plan.
6. Quyết định release/merge sau evidence, không tự merge main.

## 9. Tệp authority / hồ sơ cần đọc

- Backend: **AI_context.md** (có ghi chú current handoff, phần dưới mang tính lịch sử).
- Backend: **README.md**, **SRS_TONG_HOP_PHASE1.md** (SRS lịch sử, đối chiếu với phạm vi hiện hành).
- Backend: **docs/uat/MASTER_UAT_PLAN.md**, **docs/uat/RC1_RELEASE_GATE.md**.
- Backend: **docs/production/PRODUCTION_CHECKLIST.md**, **docs/production/DEPLOYMENT.md**.
- Frontend: **docs/ux/UX-V1_CONFIGURATION_VISUAL_DIRECTION.md** (Fix 2 đã PASS theo frontend doc, có điểm lệch với AI_context lịch sử).
- Frontend: **e2e/README.md**, **package.json**, **e2e/playwright.config.mjs**.
- Source procedures do user upload: P.08 Personnel, P.09 Management System Certification, P.10 Product Certification, P.11 Sampling, P.13 Verification/Validation ở dạng RAR trong dự án; **chưa đối chiếu chi tiết nội dung RAR trong lần bàn giao này**. Không suy diễn đáp ứng ISO/procedure chỉ từ tên file.

## 10. Các kết luận quan trọng, tránh lặp sai sót

- **KHÔNG** phải do chat gần hết context mà PowerShell lỗi; parser và path handling thực sự có lỗi; nguyên nhân sâu của lỗi GetFullPath vẫn chưa được chứng minh bằng log biến đầu vào.
- Hai commit 1327623... và 6e81afb... chỉ là **codefix + kiểm tra nội dung GitHub**, **không phải Windows runtime PASS**.
- Không bắt user lặp nhiều vòng lỗi khi có máy Windows/CDP runner để test trước.
- User không muốn báo cáo dài, thủ tục QA nặng, redesign không cần thiết.
- Không tuyên bố cloud Actions failure với 0 bước là code fail.
- Mục tiêu của chat mới: **đưa người dùng vào được giao diện CMP nhanh nhất, bảo vệ dữ liệu và local WIP**.

## 11. Prompt ngắn để mở chat mới

> CMP — TIẾP QUẢN KHẨN CẤP LAUNCHER WINDOWS VÀ MỞ UI. Đọc backend/docs/handoffs/CMP_NEXT_CHAT_HANDOFF_2026-10-18.md từ GitHub HEAD mới nhất, cùng AI_context.md, CMP_ONE_CLICK.cmd, scripts/cmp-one-click.ps1, frontend HEAD. Tôi vừa gặp hai lỗi launcher: PowerShell InvalidVariableReferenceWithDrive ở dòng 122 (đã sửa trong 1327623) và GetFullPath “Illegal characters in path” (sửa cơ chế truyền path trong 6e81afb nhưng Windows chưa test). Tôi cần mở UI CMP ngay, không muốn thử sai nhiều lần. Bạn tự chủ audit toàn bộ launcher, dùng Windows PowerShell parser và chạy smoke thật trên Windows trước khi báo PASS, sửa một lượt các vấn đề có căn cứ, commit/push feature branch, bảo vệ WIP/DB; không full UAT/CI/cloud/merge. Nếu không có Windows runner, phân biệt static/PENDING và cung cấp workaround mở UI bằng hai terminal. Chỉ kết thúc khi nêu chính xác trạng thái và thao tác tối thiểu để tôi xem frontend HEAD mới nhất.
