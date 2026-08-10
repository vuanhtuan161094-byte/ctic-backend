export type TechnicalReviewCriterionResult = 'yes' | 'no' | 'not_applicable' | 'pending';

export const PRELIMINARY_REVIEW_CRITERIA = [
    {
        key: 'preliminary_1',
        label: "Có đầy đủ tài liệu, hồ sơ theo yêu cầu khi xem xét đề nghị chứng nhận không?/ Are there sufficient documents as required when the certification body reviews the application for certification?",
    },
    {
        key: 'preliminary_2',
        label: "Tiêu chuẩn đánh giá, tiêu chuẩn chứng chứng nhận có đúng đối tượng, có phù hợp với lĩnh vực hoạt động/ sản phẩm của tổ chức không?/Audit criteria and certification standard is applicable with the scope of organization or not?",
    },
    {
        key: 'preliminary_3',
        label: "Hoạch định thời lượng đánh giá có tuân thủ quy định không?/ Is audit time determination in compliance with regulations?",
    },
    {
        key: 'preliminary_4',
        label: "Báo cáo đánh giá giai đoạn 1 có đầy đủ nội dung không?/ Does stage 1 - initial audit report cover sufficient contents?",
    },
    {
        key: 'preliminary_5',
        label: "Báo cáo đánh giá giai đoạn 1 có nêu ra kết luận về tình trạng hệ thống/SP dựa trên các căn cứ xác đáng không?/ Does stage 1 - initial audit report give conclusion about system conditions/ products on a factual basis?",
    },
    {
        key: 'preliminary_6',
        label: "Thành phần đoàn đánh giá có phù hợp với quy định?/ Do the members of the audit team meet the requirements?",
    },
    {
        key: 'preliminary_7',
        label: "Chuyên gia đánh giá có đúng code đã phê duyệt?/ Do auditors have the codes as approved?",
    },
    {
        key: 'preliminary_8',
        label: "Chuyên gia tư vấn, tổ chức tư vấn có mối liên hệ với chuyên gia đánh giá, tổ chức chứng nhận không? Có tiềm ẩn mối nguy ảnh hưởng tới tính khách quan không?/ Clarify  that if the consulting body or cosulting expert have any relation with certification body or certification auditor or not? Are there any potential risk against impartiality?",
    },
    {
        key: 'preliminary_9',
        label: "Có kế hoạch đánh giá không? Kế hoạch đánh giá có phù hợp với thông tin, hoạt động được đánh giá không?/ Is there any audit plan? Is the audit plan in compliance with the information and activities being audited?",
    },
    {
        key: 'preliminary_10',
        label: "Hồ sơ đánh giá có đầy đủ và phù hợp với loại hình đánh giá được hoạch định không?/ Are audit documents sufficient and in compliance with the determined audit type?",
    },
    {
        key: 'preliminary_11',
        label: "Tính đầy đủ và nội dung của báo cáo?/ Are the audit report and its contents sufficient?",
    },
    {
        key: 'preliminary_12',
        label: "Nhận xét của báo cáo có cung cấp các bằng chứng của việc đánh giá tất cả các quá trình chính không?/ Does the report contain evidence of auditing all main processes? (Quá trình chính là quá trình thuộc phạm vi chứng nhận/ Main process is the process belong to certification scope).",
    },
    {
        key: 'preliminary_13',
        label: "Phạm vi đánh giá có đầy đủ và đã được xác nhận trong báo cáo đánh giá chưa?/ Is the scope of audit sufficient and verified in audit report?",
    },
    {
        key: 'preliminary_14',
        label: "Các địa điểm đánh giá trong báo cáo có phù hợp với đơn đăng ký chứng nhận không?/ Are audit sites in the audit report in compliance with application for certification?",
    },
    {
        key: 'preliminary_15',
        label: "Các nhận xét và kiến nghị trong báo cáo có đưa ra các gợi ý hoặc tư vấn không?/ Do comments and recommendation in the audit report propose suggestion or consultance?",
    },
    {
        key: 'preliminary_16',
        label: "Các phát hiện, nhận xét của báo cáo đánh giá đưa ra có được viết rõ ràng, hợp lý không?/ Are audit findings and comments clearly and reasonably stated in the audit report?",
    },
    {
        key: 'preliminary_17',
        label: "Các yêu cầu HĐKP của đánh giá trước đó có được thẩm tra hiệu lực và kết thúc chưa?/ Are requests for corrective action of the previous audit verified and accomplished? Báo cáo đánh giá có đề cập tới việc thực hiện HĐKP của lần đánh giá trước không?/ Clarify that if Audit report mentioned about effective of the corrective action in the latest audit?",
    },
    {
        key: 'preliminary_18',
        label: "HĐKP cho các phát hiện của đánh giá lần này có thỏa đáng không?/Is corrective action for this audit’s findings satisfactory?",
    },
    {
        key: 'preliminary_19',
        label: "Địa điểm đề nghị cấp giấy chứng nhận có thống nhất với địa điểm trong đơn đề nghị chứng nhận và Báo cáo đánh giá không?/ Are sites applying for certficates in compliance with those written in Application form and Audit report?",
    },
] as const;

export const TECHNICAL_REVIEW_CRITERIA = [
    {
        key: 'technical_1',
        label: "Phạm vi chứng nhận có phù hợp với loại hình của tổ chức (ví dụ như: có phù hợp với đăng ký kinh doanh, chức năng nhiệm vụ, ...)/Is the scope of certification in compliance with organizational type of the auditee (e.g. is it in compliance with business registration, roles, responsibilities, etc.) Phạm vi có trong Giấy ĐKKD/Giấy phép hoạt động không?/ Are there scopes information belong to the business registration/license?",
    },
    {
        key: 'technical_2',
        label: "Hồ sơ đánh giá có đề cập đến khía cạnh hoạt động của tổ chức (sản xuất, kinh doanh, dịch vụ, …)? / Does audit report mention aspects of the auditee’s activities? (production, merchandise, services, etc.) (Trong Sổ tay chất lượng, trong Báo cáo đánh giá – quá trình/quy trình được đánh giá, ghi chép đánh giá và các tài liệu hồ sơ đánh giá kèm theo thể hiện phạm vi hoạt động trong HTQL?/ in Management System of organization, or if audited clearly by auditor (It can appear in Quality Manual; Audit report - process and procedure which was audited; Audit Notes and attached documents, records which show the scope of Management System?) Có phù hợp không?/ Is it in compliance?",
    },
    {
        key: 'technical_3',
        label: "Hồ sơ đánh giá có đề cập đến văn bản quy phạm pháp luật liên quan không? / Does audit report mention relevant legal regulations? (Lĩnh vực hoạt động của tổ chức được quy định trong những văn bản quy phạm pháp luật nào? (xem báo cáo đánh giá, ghi chép đánh giá)/ The scope of organization is regulated in which legislation? (See Audit Report, Audit Notes)",
    },
    {
        key: 'technical_4',
        label: "Các lưu ý đặc biệt khi đánh giá trong lĩnh vực hoạt động này:/ Special notes when auditing this sector: Dây chuyền sản xuất và địa điểm sản xuất có đáp ứng yêu cầu không? Các yếu tố kỹ thuật nào nên được xem xét? which specific technical factors shall be reviewed? (infrastructure, designs of company/factory, echnology, process, machine, equipment, human resources....)",
    },
] as const;
