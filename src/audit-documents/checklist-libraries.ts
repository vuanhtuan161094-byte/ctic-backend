export type ChecklistResult = 'NOT_EVALUATED' | 'CONFORMITY' | 'OFI' | 'MINOR_NC' | 'MAJOR_NC';

export interface ChecklistLibraryRow {
    row_id: string;
    clause: string;
    content: string;
    is_section: boolean;
}

export interface ChecklistLibraryDefinition {
    program_key: string;
    program_code: string;
    management_system: string;
    template_file: string;
    source_label: string;
    rows: ChecklistLibraryRow[];
}

export const CHECKLIST_LIBRARIES: ChecklistLibraryDefinition[] = [
    {
        "program_key": "ISO9001:2015",
        "program_code": "ISO 9001:2015",
        "management_system": "QMS",
        "template_file": "F.06-P.09.checklist-iso9001.template.docx",
        "source_label": "Mẫu F.06-P.09 gốc do người dùng cung cấp",
        "rows": [
            {
                "row_id": "ISO9001-2015-001",
                "clause": "4.",
                "content": "Bối cảnh của tổ chức",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-002",
                "clause": "4.1",
                "content": "Hiểu Tổ chức và bối cảnh của tổ chức\n- Tổ chức đã xác định vấn đề bên ngoài và nội bộ liên quan đến mục đích và định hướng chiến lược của tổ chức và ảnh hưởng đến khả năng của tổ chức trong việc đạt được các kết quả dự kiến của hệ thống quản lý chất lượng chưa?\n- Có theo dõi và xem xét thông tin về các vấn đề này không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-003",
                "clause": "4.2",
                "content": "Hiểu nhu cầu và mong đợi của các bên quan tâm\nTổ chức đã:\na) Xác định các bên quan tâm có liên quan đến hệ thống quản lý chất lượng?\nb) Xác định các yêu cầu của các bên quan tâm này liên quan đến hệ thống quản lý chất lượng?\nTổ chức có theo dõi và xem xét thông tin về các bên quan tâm và các yêu cầu liên quan của họ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-004",
                "clause": "4.3",
                "content": "Xác định phạm vi của hệ thống quản lý chất lượng\nTổ chức có thiết lập thông tin dạng văn bản về Phạm vi của hệ thống QLCL không?\nKhi xác định phạm vi này, tổ chức có xem xét đến:\ncác vấn đề bên ngoài và nội bộ?\ncác yêu cầu của các bên quan tâm liên quan?\ncác sản phẩm và dịch vụ của tổ chức?\nTổ chức có loại trừ điều khoản nào khi xác định phạm vi của hệ thống? lý do loại trừ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-005",
                "clause": "4.4",
                "content": "Hệ thống quản lý chất lượng và các quá trình của hệ thống",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-006",
                "clause": "4.4.1",
                "content": "Tổ chức đã thiết lập, thực hiện, duy trì và cải tiến liên tục hệ thống quản lý chất lượng, bao gồm các quá trình cần thiết và sự tương tác của các quá trình này?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-007",
                "clause": "",
                "content": "Tổ chức phải xác định các quá trình cần thiết của hệ thống quản lý chất lượng và việc áp dụng các quá trình này trong toàn bộ tổ chức?\na) Có xác định các yếu tố đầu vào cần thiết và đầu ra mong đợi từ các quá trình này?\nb) Có xác định trình tự và mối tương tác của các quá trình này?\nc) Có xác định và áp dụng các tiêu chí và phương pháp (bao gồm theo dõi, đo lường và các chỉ số hoạt động liên quan) cần thiết để đảm bảo việc điều hành và kiểm soát các quá trình này có hiệu lực?\nd) Có xác định các nguồn lực cần thiết cho các quá trình này và đảm bảo tính sẵn có của các nguồn lực?\ne) Có phân công trách nhiệm và quyền hạn cho các quá trình này?\nf) Có giải quyết các rủi ro và cơ hội?\ng) Có đánh giá các quá trình này và thực hiện bất kỳ thay đổi nào cần thiết để đảm bảo rằng các quá trình này đạt được kết quả như mong đợi của tổ chức?\nh) Có cải tiến các quá trình và hệ thống quản lý chất lượng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-008",
                "clause": "4.4.2",
                "content": "Tổ chức có tiến hành:",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-009",
                "clause": "",
                "content": "a) duy trì thông tin dạng văn bản để hỗ trợ việc điều hành các quá trình;\nb) lưu giữ thông tin dạng văn bản để khẳng định rằng các quá trình đang được tiến hành theo như hoạch định.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-010",
                "clause": "5",
                "content": "Sự lãnh đạo",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-011",
                "clause": "5.1",
                "content": "Sự lãnh đạo và cam kết",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-012",
                "clause": "5.1.1",
                "content": "Khái quát\nLãnh đạo cao nhất có thể hiện được vai trò lãnh đạo và cam kết đối với hệ thống quản lý chất lượng không? Các cam kết của lãnh đạo bao gồm những nội dung sau:\na) chịu trách nhiệm về hiệu lực của hệ thống quản lý chất lượng;\nb) đảm bảo chính sách chất lượng và các mục tiêu chất lượng được thiết lập cho hệ thống quản lý chất lượng và phù hợp với định hướng chiến lược và bối cảnh của tổ chức;\nc) đảm bảo sự tích hợp của các yêu cầu trong hệ thống quản lý chất lượng vào các quá trình kinh doanh của tổ chức;\nd) thúc đẩy việc sử dụng cách tiếp cận quá trình và tư duy dựa trên rủi ro;\ne) đảm bảo sẵn có các nguồn lực cần thiết cho hệ thống quản lý chất lượng;\nf) truyền đạt về tầm quan trọng của việc quản lý chất lượng có hiệu lực và phù hợp với các yêu cầu hệ thống quản lý chất lượng;\ng) đảm bảo hệ thống quản lý chất lượng đạt được kết quả mong đợi;\nh) tham gia, chỉ đạo và hỗ trợ các cá nhân đóng góp vào tính hiệu lực của hệ thống quản lý chất lượng;\ni) thúc đẩy sự cải tiến;\nj) hỗ trợ vai trò quản lý khác có liên quan để chứng tỏ vai trò lãnh đạo của họ khi hệ thống áp dụng trong các phạm vi thuộc trách nhiệm.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-013",
                "clause": "5.1.2",
                "content": "Hướng vào khách hàng\nLãnh đạo cao nhất có chứng tỏ được vai trò lãnh đạo và cam kết liên quan đến việc hướng vào khách hàng không? Các nội dung trong cam kết hướng vào khách hàng có bao gồm:\ncác yêu cầu khách hàng và luật định và chế định được xác định, thấu hiểu và được đáp ứng một cách nhất quán?\nnhững rủi ro và cơ hội có thể ảnh hưởng đến sự phù hợp của sản phẩm và dịch vụ và khả năng nâng cao sự hài lòng của khách hàng được xác định và được giải quyết?\nsự tập trung vào nâng cao sự hài lòng của khách hàng được duy trì?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-014",
                "clause": "5.2",
                "content": "Chính sách chất lượng",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-015",
                "clause": "5.2.1",
                "content": "Thiết lập chính sách chất lượng\nLãnh đạo cao nhất đã thiết lập, thực hiện và duy trì chính sách chất lượng chưa? Nội dung của chính sách chất lượng có bao gồm:\na) phù hợp với mục đích và bối cảnh của tổ chức và hỗ trợ các định hướng chiến lược của tổ chức?\nb) cung cấp khuôn khổ cho việc thiết lập các mục tiêu chất lượng?\nc) cam kết thỏa mãn các yêu cầu thích hợp?\nd) cam kết cải tiến liên tục hệ thống quản lý chất lượng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-016",
                "clause": "5.2.2",
                "content": "Trao đổi thông tin về chính sách chất lượng\na) sẵn có và được duy trì dưới dạng thông tin bằng văn bản?\nb) được truyền đạt, thấu hiểu và được áp dụng trong tổ chức?\nc) sẵn có cho các bên liên quan, khi thích hợp?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-017",
                "clause": "5.3",
                "content": "Vai trò, trách nhiệm và quyền hạn trong tổ chức\nLãnh đạo cao nhất đã phân công trách nhiệm và quyền hạn cho các vai trò thích hợp, truyền đạt và thấu hiểu trong tổ chức chưa?\nMục tiêu của việc phân công trách nhiệm và quyền hạn có nhằm hướng tới:\na) đảm bảo rằng hệ thống quản lý chất lượng phù hợp với các yêu cầu của Tiêu chuẩn?\nb) đảm bảo rằng các quá trình đang cung cấp các kết quả đầu ra như dự kiến?\nc) báo cáo về việc thực hiện hệ thống quản lý chất lượng và các cơ hội để cải tiến, báo cáo đến lãnh đạo cao nhất?\nd) đảm bảo thúc đẩy việc hướng về khách hàng trong toàn bộ tổ chức?\ne) đảm bảo rằng tính nhất quán của hệ thống quản lý chất lượng được duy trì khi có sự thay đổi đối với hệ thống quản lý chất lượng được hoạch định và thực hiện?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-018",
                "clause": "6",
                "content": "Hoạch định",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-019",
                "clause": "6.1",
                "content": "Hành động giải quyết rủi ro và cơ hội",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-020",
                "clause": "6.1.1",
                "content": "Khi hoạch định hệ thống quản lý chất lượng, tổ chức có tiến hành xác định các rủi ro và cơ hội không? Việc xác định rủi ro và cơ hội có nhằm mục đích giải quyết các vấn đề sau:\na) cung cấp sự bảo đảm rằng hệ thống quản lý chất lượng có thể đạt được (các) kết quả như dự kiến?\nb) nâng cao các tác động mong muốn?\nc) ngăn ngừa, hoặc giảm các tác động không mong muốn?\nd) đạt được sự cải tiến?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-021",
                "clause": "6.1.2",
                "content": "Tổ chức đã hoạch định:\na) các hành động để giải quyết các rủi ro và cơ hội?\nb) làm thế nào để:\n- tích hợp và thực hiện các hành động vào trong các quá trình của hệ thống quản lý chất lượng của tổ chức;\n- đánh giá hiệu lực của các hành động này.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-022",
                "clause": "6.2",
                "content": "Mục tiêu chất lượng và hoạch định để đạt được mục tiêu",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-023",
                "clause": "6.2.1",
                "content": "Tổ chức đã thiết lập các mục tiêu chất lượng tại các cấp, bộ phận chức năng và các quá trình cần thiết của hệ thống quản lý chất lượng chưa?\nMục tiêu chất lượng của tổ chức có:\n+ Có phù hợp với chính sách chất lượng không?\n+ Có đo lường được không?\n+ Có xem xét đến các yêu cầu hiện hành không?\n+ Có liên quan tới sự phù hợp yêu cầu của sản phẩm và dịch vụ; nâng cao sự hài lòng của khách hàng.\n+ Có được theo dõi không?\n+ Có được truyền đạt không?\n+ Có được cập nhật khi cần thiết không?\nMục tiêu chất lượng có được duy trì dưới dạng văn bản không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-024",
                "clause": "6.2.2",
                "content": "Tổ chức đã hoạch định cách thức đạt được các mục tiêu chất lượng chưa?\nTrong kế hoạch thực hiện các mục tiêu chất lượng, tổ chức có:\n+ Xác định cái gì sẽ được thực hiện?\n+ Các nguồn lực cần thiết?\n+ Trách nhiệm thuộc về ai?\n+ Khi nào sẽ hoàn thành?\n+ Xác định cách đánh giá?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-025",
                "clause": "6.3",
                "content": "Hoạch định các thay đổi\nKhi tổ chức xác định nhu cầu cho các thay đổi đối với hệ thống quản lý chất lượng, các thay đổi có được tiến hành một cách hệ thống và có kế hoạch không?\nCác nội dung xem xét cho các hoạch định sự thay đổi này có xét đến:\n+ Mục đích của các thay đổi này và hậu quả tiềm tàng?\n+ Tính toán vẹn của hệ thống QLCL?\n+ Các nguồn lực sẵn có?\n+ Phân bổ hoặc phân bổ lại nguồn lực?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-026",
                "clause": "7",
                "content": "Hỗ trợ",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-027",
                "clause": "7.1",
                "content": "Nguồn lực",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-028",
                "clause": "7.1.1",
                "content": "Khái quát\nTổ chức đã xác định và cung cấp các nguồn lực cần thiết cho việc thiết lập, áp dụng, duy trì và cải tiến liên tục hệ thống quản lý chất lượng?\nCác nguồn lực có được tổ chức xem xét:\n+ khả năng, hạn chế, nguồn lực của mình?\n+ những thứ cần từ nhà cung cấp bên ngoài?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-029",
                "clause": "7.1.2",
                "content": "Con người\nTổ chức đã xác định và cung cấp nhân sự cần thiết cho việc áp dụng có hiệu lực hệ thống quản lý chất lượng và cho việc thực hiện và kiểm soát các quá trình của tổ chức?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-030",
                "clause": "7.1.3",
                "content": "Cơ sở hạ tầng\nTổ chức đã xác định, cung cấp và duy trì cơ sở hạ tầng thiết yếu cho việc vận hành các quá trình của tổ chức để đạt được sự phù hợp của sản phẩm và dịch vụ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-031",
                "clause": "7.1.4",
                "content": "Môi trường cho việc vận hành các quá trình\nTổ chức có xác định, cung cấp và duy trì môi trường cần thiết cho vận hành của các quá trình của tổ chức và để đạt được sự phù hợp của sản phẩm và dịch vụ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-032",
                "clause": "7.1.5",
                "content": "Nguồn lực theo dõi và đo lường",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-033",
                "clause": "7.1.5.1",
                "content": "Khái quát\nTổ chức có xác định và cung cấp các nguồn lực cần thiết để đảm bảo các kết quả xác thực và đáng tin cậy khi sử dụng hoạt động theo dõi hoặc đo lường để xác nhận sự phù hợp của các sản phẩm và dịch vụ đối với các yêu cầu?\nCác nguồn lực được cung cấp có bao gồm:\na) phù hợp với các loại hình cụ thể của các hoạt động giám sát và đo lường đang được thực hiện?\nb) được duy trì để đảm bảo chúng liên tục phù hợp với mục đích của tổ chức?\nTổ chức có lưu giữ lại các thông tin dạng văn bản thích hợp như là bằng chứng của sự phù hợp với mục đích của các nguồn lực theo dõi và đo lường?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-034",
                "clause": "7.1.5.2",
                "content": "Liên kết chuẩn đo lường\nTổ chức có sử dụng đến các thiết bị đo trong quá trình kiểm soát tạo sản phẩm không?\nCác thiết bị đo có được:\na) được hiệu chuẩn hoặc kiểm định, hoặc cả hai, định kỳ, hoặc trước khi sử dụng, dựa trên tiêu chuẩn đo lường được liên kết với các tiêu chuẩn đo lường quốc gia hay quốc tế; khi không có các chuẩn này, thì căn cứ được sử dụng để hiệu chuẩn hoặc kiểm tra xác nhận phải được lưu giữ thông tin dạng văn bản?\nb) được nhận biết để xác định tình trạng?\nc) giữ gìn tránh bị điều chỉnh, hư hỏng hoặc xuống cấp có thể làm mất hiệu lực các tình trạng hiệu chuẩn và các kết quả tiếp đo lường sau đó?\nTổ chức có xác định tính xác thực của các kết quả đo lường trước đó có bị ảnh hưởng xấu khi có thiết bị đo lường được xác định là không thích hợp với mục đích dự kiến, và phải có hành động thích hợp khi cần thiết?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-035",
                "clause": "7.1.6",
                "content": "Tri thức của tổ chức\nTổ chức có xác định tri thức cần thiết cho việc vận hành các quá trình của tổ chức và để đạt được sự phù hợp của các sản phẩm và dịch vụ?\nTri thức này có được duy trì và sẵn có tùy mức độ cần thiết không?\nKhi giải quyết các nhu cầu và xu hướng thay đổi, tổ chức có xem xét tri thức hiện tại của tổ chức và xác định làm thế nào để có được hoặc tiếp cận bất kỳ kiến thức bổ sung và cập nhật tri thức cần thiết không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-036",
                "clause": "7.2",
                "content": "Năng lực\nTổ chức có tiến hành:\na) xác định năng lực cần thiết của (những) người làm việc dưới sự kiểm soát của tổ chức có ảnh hưởng đến kết quả hoạt động và hiệu lực của hệ thống quản lý chất lượng?\nb) đảm bảo rằng những người này có năng lực dựa trên giáo dục, đào tạo, hoặc kinh nghiệm thích hợp;\nc) khi thích hợp, phải có những hành động để đạt được các năng lực cần thiết, và đánh giá tính hiệu lực của các hành động này;\nd) lưu giữ thông tin dạng văn bản thích hợp như bằng chứng chứng minh năng lực.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-037",
                "clause": "7.3",
                "content": "Nhận thức\nNhân viên được kiểm soát của tổ chức có nhận thức được các nội dung sau:\na) chính sách chất lượng?\nb) các mục tiêu chất lượng liên quan?\nc) đóng góp của họ đối với hiệu lực của hệ thống quản lý chất lượng, bao gồm các lợi ích khi kết quả hoạt động được cải tiến?\nd) hậu quả của việc không tuân thủ các yêu cầu của hệ thống quản lý chất lượng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-038",
                "clause": "7.4",
                "content": "Trao đổi thông tin\nTổ chức đã xác định việc trao đổi thông tin nội bộ và bên ngoài liên quan đến hệ thống quản lý chất lượng chưa? Hoạt động trao đổi thông tin có bao gồm:\na) điều gì sẽ truyền đạt?\nb) khi nào truyền đạt?\nc) truyền đạt tới ai?\nd) truyền đạt như thế nào?\ne) ai truyền đạt?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-039",
                "clause": "7.5",
                "content": "Thông tin dạng văn bản",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-040",
                "clause": "7.5.1",
                "content": "Khái quát\nHệ thống quản lý chất lượng của tổ chức có bao gồm:\na) các thông tin dạng văn bản theo yêu cầu của Tiêu chuẩn?\nb) các thông tin dạng văn bản được tổ chức xác định là cần thiết để đảm bảo tính hiệu lực của hệ thống quản lý chất lượng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-041",
                "clause": "7.5.2",
                "content": "Tạo lập và cập nhật\nKhi tạo mới và cập nhật thông tin dạng văn bản, tổ chức có đảm bảo được các yêu cầu bao gồm:\na) việc nhận biết và mô tả thích hợp (ví dụ: tiêu đề, ngày, tác giả hoặc số tham chiếu)?\nb) định dạng trình bày thích hợp (ví dụ: ngôn ngữ, phiên bản phần mềm, hình ảnh) và dạng phát hành (ví dụ: giấy, điện tử)?\nc) xem xét và phê duyệt cho sự thích hợp và thỏa đáng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-042",
                "clause": "7.5.3",
                "content": "Kiểm soát thông tin dạng văn bản\nThông tin dạng văn bản được yêu cầu bởi hệ thống quản lý chất lượng và bởi Tiêu chuẩn có được kiểm soát nhằm đảm bảo các nội dung sau không:\na) sẵn có và thích hợp cho việc sử dụng, bất cứ khi nào và bất cứ ở đâu khi cần thiết?\nb) được bảo vệ đầy đủ (ví dụ: tránh mất tình trạng bảo mật, sử dụng sai mục đích, hoặc mất tính toàn vẹn)?\nCác nội dung kiểm soát thông tin dạng văn bản (bao gồm cả nội bộ và bên ngoài) có giải quyết được các hoạt động sau:\na) phân phối, truy cập, thu hồi và sử dụng?\nb) lưu trữ, bảo quản, bao gồm cả việc bảo quản mức độ rõ ràng?\nc) kiểm soát sự thay đổi (ví dụ kiểm soát phiên bản)?\nd) lưu giữ và hủy bỏ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-043",
                "clause": "8",
                "content": "Thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-044",
                "clause": "8.1",
                "content": "Hoạch định và kiểm soát việc thực hiện\nTổ chức đã hoạch định, thực hiện và kiểm soát các quá trình cần thiết để đáp ứng các yêu cầu đối với việc cung cấp sản phẩm và dịch vụ, và để thực hiện các hành động xác định trong điều 6 chưa?\nCác nội dung hoạch định có thong qua:\na) xác định các yêu cầu đối với sản phẩm và dịch vụ;\nb) thiết lập chuẩn mực cho:\n1] các quá trình;\n2] việc chấp nhận sản phẩm và dịch vụ;\nc) xác định các nguồn lực cần thiết để đạt được sự phù hợp với các yêu cầu của sản phẩm và dịch vụ;\nd) thực hiện việc kiểm soát các quá trình theo các chuẩn mực;\ne) xác định, duy trì và lưu giữ các thông tin dạng văn bản ở mức độ cần thiết:\n1] để có sự tin tưởng rằng các quá trình đã được thực hiện như hoạch định;\n2] để chứng minh sự phù hợp với các yêu cầu của sản phẩm và dịch vụ.\nTổ chức có kiểm soát những thay đổi theo hoạch định và xem xét các hệ quả của các thay đổi không mong muốn, thực hiện hành động để giảm nhẹ mọi tác động bất lợi khi cần?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-045",
                "clause": "8.2",
                "content": "Yêu cầu đối với sản phẩm và dịch vụ",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-046",
                "clause": "8.2.1",
                "content": "Trao đổi thông tin với khách hàng\nTổ chức có tiến hành trao đổi thông tin với khách hàng không?\nCác nội dung được trao đổi thông tin có bao gồm:\na) cung cấp thông tin liên quan đến sản phẩm và dịch vụ;\nb) xử lý các yêu cầu, hợp đồng hoặc đơn đặt hàng, bao gồm cả những thay đổi;\nc) thu thập thông tin phản hồi của khách hàng liên quan đến các sản phẩm và dịch vụ, bao gồm cả các khiếu nại của khách hàng;\nd) xử lý hoặc kiểm soát tài sản của khách hàng;\ne) thiết lập các yêu cầu cụ thể đối với các hành động dự phòng, khi thích hợp.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-047",
                "clause": "8.2.2",
                "content": "Xác định các yêu cầu đối với sản phẩm và dịch vụ\nTổ chức có thực hiện việc xác định các yêu cầu đối với sản phẩm và dịch vụ không?\nNội dung xác định yêu cầu đối với sản phẩm, dịch vụ có đảm bảo:\na) các yêu cầu đối với các sản phẩm và dịch vụ được xác định, bao gồm:\n1) các yêu cầu luật định và chế định áp dụng?\n2) những yêu cầu mà tổ chức xem xét là cần thiết?\nb) có khả năng đáp ứng các tuyên bố về sản phẩm và dịch vụ mà tổ chức cung cấp?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-048",
                "clause": "8.2.3",
                "content": "Xem xét yêu cầu đối với sản phẩm và dịch vụ\n8.2.3.1 Tổ chức có tiến hành xem xét các yêu cầu đối với sản phẩm và dịch vụ trước khi cam kết cung cấp sản phẩm và dịch vụ cho khách hàng không?\nCác nội dung xem xét có được tính đến:\na) các yêu cầu đưa ra bởi khách hàng, bao gồm các yêu cầu đối với các hoạt động giao hàng và sau giao hàng;\nb) các yêu cầu khách hàng không đưa ra, nhưng cần thiết cho mục đích sử dụng, khi đã biết;\nc) các yêu cầu do tổ chức xác định;\nd) các yêu cầu chế định và luật pháp áp dụng đối với các sản phẩm và dịch vụ;\ne) các yêu cầu trong hợp đồng hoặc đơn đặt hàng khác biệt so với những yêu cầu đã đưa ra trước đó.\n8.2.3.2 Tổ chức có lưu trữ các thông tin dạng văn bản bao gồm:\na) kết quả của việc xem xét?\nb) mọi yêu cầu mới cho các sản phẩm và dịch vụ?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-049",
                "clause": "8.2.4",
                "content": "Các thay đổi yêu cầu đối với sản phẩm và dịch vụ\nTổ chức có đảm bảo các thông tin dạng văn bản liên quan được sửa đổi và nhân sự liên quan nhận thức được các yêu cầu đã thay đổi, khi yêu cầu về sản phẩm và dịch vụ thay đổi?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-050",
                "clause": "8.3",
                "content": "Thiết kế và phát triển sản phẩm, dịch vụ",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-051",
                "clause": "8.3.1",
                "content": "Khái quát\nTổ chức có thiết lập, thực hiện và duy trì quá trình thiết kế và phát triển thích hợp để đảm bảo việc cung cấp sản phẩm và dịch vụ sau đó?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-052",
                "clause": "8.3.2",
                "content": "Hoạch định thiết kế và phát triển\nCác nội dung được thực hiện khi xác định các giai đoạn và biện pháp kiểm soát thiết kế và phát triển của tổ chức có bao gồm:\na) bản chất, thời gian và mức độ phức tạp của các hoạt động thiết kế và phát triển?\nb) các giai đoạn thiết kế cần thiết, bao gồm các hoạt động xem xét thiết kế và phát triển phù hợp?\nc) các hoạt động xác nhận giá trị sử dụng và kiểm tra xác nhận thiết kế và phát triển cần thiết?\nd) trách nhiệm và quyền hạn trong quá trình thiết kế và phát triển?\ne) nguồn lực nội bộ và bên ngoài cần thiết cho việc thiết kế và phát triển sản phẩm và dịch vụ?\nf) nhu cầu kiểm soát các mối tương giao giữa những người tham gia vào quá trình thiết kế và phát triển?\ng) nhu cầu tham gia của khách hàng và người sử dụng trong quá trình thiết kế và phát triển?\nh) các yêu cầu đối với việc cung cấp của sản phẩm và dịch vụ sau đó?\ni) mức độ kiểm soát dự kiến cho quá trình thiết kế và phát triển bởi các khách hàng và các bên quan tâm khác có liên quan?\nj) các thông tin dạng văn bản cần thiết để chứng minh rằng các yêu cầu thiết kế và phát triển đã được đáp ứng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-053",
                "clause": "8.3.3",
                "content": "Đầu vào của thiết kế và phát triển\nCác nội dung đầu và được tổ chức xem xét cho việc xác định các yêu cầu thiết yếu cho các loại hình cụ thể của sản phẩm và dịch vụ sẽ được thiết kế và phát triển có bao gồm:\na) các yêu cầu chức năng và kết quả hoạt động;\nb) thông tin từ các hoạt động thiết kế và phát triển tương tự trước đó;\nc) các yêu cầu chế định và luật định;\nd) tiêu chuẩn hoặc quy phạm thực hành mà tổ chức đã cam kết thực hiện;\ne) những hậu quả tiềm ẩn của sự thất bại do bản chất của các sản phẩm và dịch vụ.\nCác nội dung đầu vào có đầy đủ cho các mục đích thiết kế và phát triển, toàn vẹn và rõ ràng?\nMâu thuẫn trong đầu vào thiết kế và phát triển có được giải quyết thoả đáng?\nTổ chức có lưu giữ lại các thông tin dạng văn bản đầu vào thiết kế và phát triển?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-054",
                "clause": "8.3.4",
                "content": "Kiểm soát thiết kế và phát triển\nTổ chức có áp dụng các biện pháp kiểm soát quá trình thiết kế và phát triển không?\nNội dung kiểm soát thiết kế và phát triển có bao gồm:\na) các kết quả cần đạt được xác định;\nb) các hoạt động xem xét được tiến hành để đánh giá các kết quả thiết kế và phát triển nhằm đáp ứng các yêu cầu;\nc) các hoạt động thẩm tra xác nhận được tiến hành để đảm bảo rằng các kết quả đầu ra thiết kế và phát triển đáp ứng các yêu cầu đầu vào;\nd) các hoạt động xác nhận giá trị sử dụng được tiến hành để đảm bảo rằng các sản phẩm và dịch vụ sau cùng đáp ứng các yêu cầu ứng dụng cụ thể hoặc sử dụng dự kiến;\ne) bất kỳ hành động cần thiết nào được thực hiện đối với các vấn đề được xác định trong quá trình xem xét, hoặc các hoạt động kiểm tra xác nhận và xác nhận giá trị sử dụng;\nf) thông tin dạng văn bản của các hoạt động này được lưu giữ.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-055",
                "clause": "8.3.5",
                "content": "Đầu ra của thiết kế và phát triển\nTổ chức có đảm bảo được đầu ra của thiết kế và phát triển:\na) đáp ứng các yêu cầu đầu vào;\nb) đầy đủ cho các quá trình tiếp theo trong việc cung cấp các sản phẩm và dịch vụ;\nc) bao gồm hoặc viện dẫn đến các yêu cầu giám sát và đo lường, khi thích hợp, và các chuẩn mực chấp nhận;\nd) xác định rõ các đặc tính của sản phẩm và dịch vụ cần thiết cho mục đích sử dụng và việc chuyển giao chúng đúng cách và an toàn.\nTổ chức có lưu giữ các thông tin dạng văn bản về kết quả đầu ra của thiết kế và phát triển?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-056",
                "clause": "8.3.6",
                "content": "Thay đổi thiết kế và phát triển\nNhững thay đổi được tạo ra trong hoặc sau thiết kế và phát triển sản phẩm và dịch vụ ở mức độ cần thiết có được tổ chức nhận biết, xem xét và kiểm soát không?\nCó lưu giữ các thông tin dạng văn bản về các thay đổi bao gồm:\na) các thay đổi thiết kế và phát triển;\nb) các kết quả của việc xem xét;\nc) quyền hạn thông qua các thay đổi;\nd) các hành động được thực hiện để ngăn chặn những tác động bất lợi.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-057",
                "clause": "8.4",
                "content": "Kiểm soát các quá trình, sản phẩm và dịch vụ do bên ngoài cung cấp",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-058",
                "clause": "8.4.1",
                "content": "Khái quát\nCác quá trình, sản phẩm và dịch vụ do bên ngoài cung cấp có phù hợp với các yêu cầu không?\nTổ chức có xác định việc kiểm soát được áp dụng cho các quy trình, sản phẩm và dịch vụ được bên ngoài cung cấp khi:\na) sản phẩm và dịch vụ từ các nhà cung cấp bên ngoài được dự kiến đưa vào cho việc cấu thành các sản phẩm và dịch vụ của tổ chức;\nb) sản phẩm và dịch vụ được cung cấp trực tiếp cho khách hàng bởi các nhà cung cấp bên ngoài thay mặt cho tổ chức;\nc) quá trình hay một phần của quá trình, được cung cấp bởi một nhà cung cấp bên ngoài như là kết quả của một quyết định của tổ chức.\nTổ chức có xác định và áp dụng các tiêu chí cho việc đánh giá, lựa chọn, theo dõi kết quả thực hiện và đánh giá lại nhà cung cấp bên ngoài trên cơ sở khả năng của họ trong việc cung cấp các quá trình, sản phẩm và dịch vụ phù hợp với các yêu cầu?\nCó lưu giữ các thông tin dạng văn bản về hoạt động này và mọi hành động cần thiết nảy sinh từ việc đánh giá?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-059",
                "clause": "8.4.2",
                "content": "Loại hình và mức độ kiểm soát\nTổ chức có đảm bảo rằng các quá trình, sản phẩm và dịch vụ được cung cấp từ bên ngoài không ảnh hưởng xấu đến khả năng của tổ chức trong việc chuyển giao một cách ổn định sản phẩm và dịch vụ phù hợp khách hàng của tổ chức?\nTổ chức có:\na) đảm bảo rằng các quá trình được cung cấp từ bên ngoài nằm trong phạm vi kiểm soát của hệ thống quản lý chất lượng?\nb) xác định các kiểm soát dự định áp dụng đối với nhà cung cấp bên ngoài và các kết quả đầu ra?\nc) tiến hành xem xét:\n1] các tác động tiềm ẩn của các quá trình, sản phẩm và dịch vụ được cung cấp từ bên ngoài đến khả năng của tổ chức đáp ứng ổn định các yêu cầu khách hàng và các yêu cầu luật định và chế định được áp dụng?\n2] hiệu lực của các biện pháp kiểm soát áp dụng đối với các nhà cung cấp bên ngoài?\nd) xác định việc kiểm tra xác nhận, hoặc các hoạt động khác, cần thiết để đảm bảo rằng các quá trình, sản phẩm và dịch vụ bên ngoài cung cấp đáp ứng các yêu cầu?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-060",
                "clause": "8.4.3",
                "content": "Thông tin cho nhà cung cấp bên ngoài\nTổ chức có trao đổi thông tin về các yêu cầu của tổ chức với các nhà cung cấp bên ngoài không?\nNội dung trao đổi thông tin với nhà cung cấp bên ngoài có bao gồm các yêu cầu đối với:\na) các quá trình, sản phẩm và dịch vụ sẽ được cung cấp;\nb) việc phê duyệt:\n1] các sản phẩm và dịch vụ;\n2] phương pháp, quy trình và thiết bị;\n3] Chuyển giao các sản phẩm và dịch vụ;\nc) năng lực, bao gồm bất kỳ yêu cầu về trình độ của nhân lực;\nd) hoạt động tương tác của nhà cung cấp bên ngoài với tổ chức;\ne) việc kiểm soát và theo dõi kết quả hoạt động của các nhà cung cấp bên ngoài sẽ được tổ chức áp dụng;\nf) hoạt động kiểm tra xác nhận hoặc xác nhận giá trị sử dụng mà tổ chức, hoặc khách hàng của tổ chức, dự định sẽ thực hiện tại các cơ sở của nhà cung cấp bên ngoài.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-061",
                "clause": "8.5",
                "content": "Sản xuất và cung cấp dịch vụ",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-062",
                "clause": "8.5.1",
                "content": "Kiểm soát sản xuất và cung cấp dịch vụ\nĐối tượng sản phẩm và dịch vụ được tổ chức cung cấp là gì?\nCác nội dung kiểm soát có bao gồm:\na) sự sẵn có của các thông tin dạng văn bản định rõ:\n1] các đặc tính của sản phẩm được sản xuất, các dịch vụ được cung cấp, hoặc các hoạt động được thực hiện;\n2] các kết quả cần đạt được;\nb) sự sẵn có và sử dụng các nguồn lực phù hợp cho việc theo dõi và đo lường thích hợp;\nc) việc thực hiện các hoạt động theo dõi và đo lường ở các giai đoạn thích hợp để xác nhận rằng các chuẩn mực kiểm soát các quá trình hoặc các kết quả đầu ra, và chuẩn mực chấp nhận cho các sản phẩm và dịch vụ, đã được đáp ứng;\nd) việc sử dụng cơ sở hạ tầng và môi trường phù hợp cho việc vận hành các quá trình;\ne) việc chỉ định nhân sự có năng lực, bao gồm bất cứ yêu cầu nào về năng lực;\nf) xác nhận giá trị sử dụng, và tái xác nhận giá trị sử dụng định kỳ, khả năng đạt được các kết quả đã hoạch định của các quá trình sản xuất và cung cấp dịch vụ, khi kết quả đầu ra không thể kiểm tra xác nhận được bằng sự giám sát hoặc đo lường tiếp theo;\ng) thực hiện các hành động để ngăn ngừa lỗi do con người;\nh) thực hiện việc phát hành, giao hàng và các hoạt động sau giao hàng.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-063",
                "clause": "8.5.2",
                "content": "Nhận biết và truy xuất nguồn gốc\nĐầu ra của quá trình có được tổ chức nhận biết nhằm đảm bảo sự phù hợp của sản phẩm và dịch vụ?\nTình trạng của các kết quả đầu ra này có liên quan đến các yêu cầu theo dõi và đo lường trong toàn bộ quá trình sản xuất và cung cấp dịch vụ không?\nViệc kiểm soát đầu ta này có được nhận biết duy nhất không?\nCó lưu giữ các thông tin dạng văn bản cho quá trình nhận biết này không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-064",
                "clause": "8.5.3",
                "content": "Tài sản của khách hàng hoặc của nhà cung cấp bên ngoài\nTổ chức có sử dụng tài sản của khách hàng bên ngoài không?\nĐối với các tài sản của khách hàng được sử dụng, tổ chức có nhận biết, kiểm tra xác nhận, bảo vệ và bảo quản tài sản của nhà cung cấp bên ngoài hoặc do khách hàng cung cấp để sử dụng hoặc để hợp thành sản phẩm và dịch vụ không?\nKhi tài sản của khách hàng hoặc của nhà cung cấp bên ngoài bị mất, hư hỏng hoặc được phát hiện không phù hợp để sử dụng, tổ chức đã xử lý như thế nào?\nCó báo cáo cho khách hàng hoặc nhà cung cấp bên ngoài và lưu giữ thông tin dạng văn bản về vấn đề đã xảy ra không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-065",
                "clause": "8.5.4",
                "content": "Bảo toàn\nTổ chức có bảo toàn đầu ra trong suốt quá trình sản xuất và cung cấp dịch vụ ở mức cần thiết để đảm bảo sự phù hợp với các yêu cầu không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-066",
                "clause": "8.5.5",
                "content": "Các hoạt động sau giao hàng\nTổ chức có thực hiện hoạt động giao hàng không?\nCác hoạt động sau giao hàng có đáp ứng được các yêu cầu không?\nKhi xác định mức độ cần thiết của hoạt động sau giao hàng, tổ chức có xem xét đến:\na) yêu cầu chế định và luật định?\nb) những hậu quả tiềm ẩn không mong muốn liên quan với các sản phẩm và dịch vụ của tổ chức?\nc) bản chất, việc sử dụng và tuổi thọ dự kiến của sản phẩm và dịch vụ của tổ chức?\nd) các yêu cầu khách hàng?\ne) phản hồi của khách hàng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-067",
                "clause": "8.5.6",
                "content": "Kiểm soát các thay đổi\nTổ chức có tiến hành xem xét và kiểm soát những thay đổi đối với việc sản xuất hay cung cấp dịch vụ để đảm bảo liên tục sự phù hợp với các yêu cầu không?\nCó lưu giữ thông tin dạng văn bản mô tả các kết quả của việc xem xét các thay đổi, những người cho phép thay đổi và mọi hành động cần thiết nảy sinh từ việc xem xét không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-068",
                "clause": "8.6",
                "content": "Thông qua sản phẩm và dịch vụ\nTổ chức có tiến hành xác nhận rằng các yêu cầu sản phẩm và dịch vụ đã được đáp ứng không?\nViệc chuyển giao các sản phẩm và dịch vụ cho khách hàng có được phê duyệt của cấp có thẩm quyền liên quan hoặc bởi khách hàng không?\nTổ chức có lưu giữ lại thông tin dạng văn bản về việc chuyển giao các sản phẩm và dịch vụ không?\nThông tin dạng văn bản này có bao gồm:\na) bằng chứng về sự phù hợp với các chuẩn mực chấp nhận?\nb) truy xuất nguồn gốc đến người cho phép thông qua?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-069",
                "clause": "8.7",
                "content": "Kiểm soát đầu ra không phù hợp",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-070",
                "clause": "8.7.1",
                "content": "Các kết quả đầu ra không phù hợp có được nhận biết và được kiểm soát để ngăn ngừa việc sử dụng hoặc việc chuyển giao không mong muốn không?\nTổ chức có đưa ra hành động thích hợp dựa trên bản chất của sự không phù hợp và ảnh hưởng của nó đến sự phù hợp của sản phẩm và dịch vụ (kể cả các sản phẩm và dịch vụ không phù hợp được phát hiện sau khi chuyển giao sản phẩm, trong hoặc sau khi thực hiện dịch vụ) không?\nCách thức xử lý đầu ra không phù hợp của tổ chức có bao gồm một hoặc các cách sau:\na) khắc phục?\nb) phân tách, lưu giữ, trả lại hoặc đình chỉ việc cung cấp các sản phẩm và dịch vụ?\nc) thông tin đến khách hàng?\nd) được cho phép chấp nhận có nhân nhượng?\nKhi các kết quả đầu ra không phù hợp được khắc phục tổ chức có kiểm tra xác nhận lại không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-071",
                "clause": "8.7.2",
                "content": "Tổ chức có lưu giữ lại thông tin dạng văn bản về:\na) mô tả sự không phù hợp?\nb) mô tả các hành động được tiến hành?\nc) mô tả tất cả trường hợp nhân nhượng?\nd) xác định thẩm quyền quyết định các hành động liên quan đến sự không phù hợp?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-072",
                "clause": "9",
                "content": "Đánh giá kết quả thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-073",
                "clause": "9.1",
                "content": "Theo dõi, đo lường, phân tích và đánh giá",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-074",
                "clause": "9.1.1",
                "content": "Khái quát\nTổ chức có xác định:\na) điều gì cần phải được theo dõi và đo lường?\nb) các phương pháp theo dõi, đo lường, phân tích và đánh giá cần thiết để đảm bảo có được các kết quả hợp lệ?\nc) khi nào thực hiện theo dõi và đo lường?\nd) khi nào phải phân tích và đánh giá các kết quả từ hoạt động theo dõi và đo lường?\nTổ chức có đánh giá kết quả thực hiện và hiệu lực của hệ thống quản lý chất lượng không?\nTổ chức có lưu giữ lại thông tin dạng văn bản thích hợp như là bằng chứng của các kết quả trên?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-075",
                "clause": "9.1.2",
                "content": "Sự thỏa mãn của khách hàng\nTổ chức có tiến hành theo dõi cảm nhận của khách hàng về mức độ theo đó nhu cầu và mong đợi của họ đã được đáp ứng không?\nCác phương pháp cho việc thu thập, theo dõi và xem xét thông tin này của tổ chức là gì?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-076",
                "clause": "9.1.3",
                "content": "Phân tích và đánh giá\nTổ chức đã tiến hành phân tích và đánh giá các dữ liệu và thông tin thích hợp phát sinh từ hoạt động theo dõi và đo lường chưa?\nKết quả phân tích có được sử dụng để đánh giá các nội dung sau không:\na) sự phù hợp của các sản phẩm và dịch vụ;\nb) mức độ hài lòng của khách hàng;\nc) kết quả hoạt động và hiệu lực của hệ thống quản lý chất lượng;\nd) liệu rằng việc hoạch định đã được thực hiện có hiệu lực;\ne) tính hiệu lực của các hành động được thực hiện để giải quyết các rủi ro và cơ hội;\nf) kết quả hoạt động của các nhà cung cấp bên ngoài;\ng) nhu cầu cải tiến hệ thống quản lý chất lượng.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-077",
                "clause": "9.2",
                "content": "Đánh giá nội bộ",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-078",
                "clause": "9.2.1",
                "content": "Tổ chức đã thực hiện việc đánh giá nội bộ định kỳ như đã hoạch định để cung cấp thông tin về hệ thống quản lý chất lượng có:\na) phù hợp với:\n1] các yêu cầu của tổ chức đối với hệ thống quản lý chất lượng?\n2] các yêu cầu của Tiêu chuẩn?\nb) được thực hiện và duy trì một cách có hiệu lực?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-079",
                "clause": "9.2.2",
                "content": "Hoạt động đánh giá nội bộ có được:\na) hoạch định, thiết lập, thực hiện và duy trì (các) chương trình đánh giá bao gồm tần suất, phương pháp, trách nhiệm các yêu cầu hoạch định và việc báo cáo, và có tính đến tầm quan trọng của các quá trình có liên quan, những thay đổi ảnh hưởng đến tổ chức, và các kết quả đánh giá trước đó?\nb) xác định chuẩn mực và phạm vi cho mỗi lần đánh giá?\nc) lựa chọn chuyên gia đánh giá và tiến hành các cuộc đánh giá để đảm bảo tính khách quan và vô tư của quá trình đánh giá?\nd) đảm bảo rằng các kết quả đánh giá được báo cáo đến cấp lãnh đạo thích hợp?\ne) thực hiện không chậm trễ việc khắc phục và hành động khắc phục thích hợp?\nf) lưu giữ lại thông tin dạng văn bản làm bằng chứng về việc thực hiện các chương trình đánh giá và kết quả đánh giá?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-080",
                "clause": "9.3",
                "content": "Xem xét của lãnh đạo",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-081",
                "clause": "9.3.1",
                "content": "Khái quát\nLãnh đạo cao nhất có tiền hành xem xét định kỳ hệ thống quản lý chất lượng của tổ chức để đảm bảo tính liên tục phù hợp, thỏa đáng, hiệu lực và liên kết với định hướng chiến lược của tổ chức không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-082",
                "clause": "9.3.2",
                "content": "Đầu vào của xem xét lãnh đạo\nCác nội dung đầu vào được tiến hành xem xét trong lần xem xét lãnh đạo gần nhất có bao gồm:\na) tình trạng của các hành động từ lần xem xét trước;\nb) các thay đổi bên trong và bên ngoài có liên quan đến hệ thống quản lý chất lượng;\nc) thông tin về kết quả hoạt động và hiệu lực của hệ thống quản lý chất lượng, bao gồm cả các xu hướng về:\n1] sự hài lòng của khách hàng và phản hồi từ các bên quan tâm;\n2] mức độ mà các mục tiêu chất lượng đã đạt được;\n3] kết quả hoạt động và sự phù hợp của sản phẩm và dịch vụ;\n4] sự không phù hợp và các hành động khắc phục;\n5] các kết quả theo dõi và đo lường;\n6] các kết quả đánh giá;\n7] kết quả hoạt động của các nhà cung cấp bên ngoài;\nd) sự đầy đủ các nguồn lực;\ne) tính hiệu lực của các hành động được thực hiện để giải quyết rủi ro và cơ hội (xem 6.1);\nf) các cơ hội cải tiến.",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-083",
                "clause": "9.3.3",
                "content": "Đầu ra của xem xét lãnh đạo\nCác quyết định đầu ra của xem xét lãnh đạo lần gần nhất có bao gồm các thông tin về:\na) các cơ hội cải tiến?\nb) bất kỳ nhu cầu thay đổi nào đối với hệ thống quản lý chất lượng?\nc) các nhu cầu nguồn lực?\nTổ chức có lưu giữ thông tin dạng văn bản như bằng chứng về các kết quả xem xét của lãnh đạo?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-084",
                "clause": "10",
                "content": "Cải tiến",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-085",
                "clause": "10.1",
                "content": "Khái quát\nTổ chức có xác định và lựa chọn các cơ hội cải tiến và thực hiện mọi hành động cần thiết để đáp ứng các yêu cầu của khách hàng và nâng cao sự thoả mãn của khách hàng không?\nHoạt động cải tiến có bao gồm:\ncải tiến các sản phẩm và dịch vụ để đáp ứng các yêu cầu cũng như để giải quyết nhu cầu và mong đợi trong tương lai?\nkhắc phục, ngăn ngừa hoặc làm giảm các ảnh hưởng không mong muốn?\ncải tiến kết quả thực hiện và hiệu lực của hệ thống quản lý chất lượng?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-086",
                "clause": "10.2",
                "content": "Sự không phù hợp và hành động khắc phục",
                "is_section": true
            },
            {
                "row_id": "ISO9001-2015-087",
                "clause": "10.2.1",
                "content": "Khi xảy ra sự không phù hợp, kể cả phát sinh từ các khiếu nại, tổ chức có tiến hành:\na) ứng phó với sự không phù hợp và khi thích hợp:\n1] thực hiện hành động để kiểm soát và khắc phục sự không phù hợp;\n2] giải quyết các hệ quả;\nb) đánh giá nhu cầu thực hiện hành động để loại bỏ (các) nguyên nhân của sự không phù hợp, để không tái diễn hoặc xảy ra nơi khác, bằng cách:\n1] xem xét và phân tích sự không phù hợp;\n2] xác định các nguyên nhân của sự không phù hợp;\n3] xác định xem liệu sự không phù hợp tương tự có tồn tại hay không, hoặc có thể tiềm ẩn xảy ra;\nc) thực hiện bất kỳ hành động nào cần thiết;\nd) xem xét tính hiệu lực của bất kỳ hành động khắc phục được thực hiện;\ne) cập nhật các rủi ro và cơ hội được xác định trong quá trình hoạch định, nếu cần thiết;\nf) tạo sự thay đổi đối với hệ thống quản lý chất lượng, nếu cần thiết.\nHành động khắc phục này có tương ứng với tác động của các sự không phù hợp gặp phải không?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-088",
                "clause": "10.2.2",
                "content": "Tổ chức có lưu giữ lại thông tin dạng văn bản làm bằng chứng về:\na) bản chất của sự không phù hợp và bất kỳ hành động tiếp theo được thực hiện?\nb) kết quả của mọi hành động khắc phục?",
                "is_section": false
            },
            {
                "row_id": "ISO9001-2015-089",
                "clause": "10.3",
                "content": "Cải tiến liên tục\nTổ chức có cải tiến liên tục sự phù hợp, thỏa đáng và hiệu lực của hệ thống quản lý chất lượng không?\nTổ chức có xem xét các kết quả phân tích và đánh giá, và các kết quả đầu ra từ xem xét của lãnh đạo, để xác định xem có nhu cầu hay cơ hội nào phải được giải quyết như một phần của cải tiến liên tục không?",
                "is_section": false
            }
        ]
    },
    {
        "program_key": "ISO14001:2015",
        "program_code": "ISO 14001:2015",
        "management_system": "EMS",
        "template_file": "F.06-P.09.checklist-iso14001.template.docx",
        "source_label": "Thư viện khởi tạo có thể chỉnh sửa",
        "rows": [
            {
                "row_id": "ISO14001-2015-001",
                "clause": "4",
                "content": "Bối cảnh của tổ chức",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-002",
                "clause": "4.1",
                "content": "Hiểu tổ chức và bối cảnh; xác định vấn đề nội bộ, bên ngoài liên quan đến kết quả dự kiến của hệ thống quản lý môi trường.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-003",
                "clause": "4.2",
                "content": "Xác định nhu cầu, mong đợi và nghĩa vụ tuân thủ của các bên quan tâm.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-004",
                "clause": "4.3",
                "content": "Xác định và duy trì phạm vi hệ thống quản lý môi trường.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-005",
                "clause": "4.4",
                "content": "Thiết lập, thực hiện, duy trì và cải tiến liên tục hệ thống quản lý môi trường và các quá trình cần thiết.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-006",
                "clause": "5",
                "content": "Sự lãnh đạo",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-007",
                "clause": "5.1",
                "content": "Lãnh đạo thể hiện vai trò, trách nhiệm và cam kết đối với hệ thống quản lý môi trường.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-008",
                "clause": "5.2",
                "content": "Chính sách môi trường phù hợp bối cảnh, cam kết bảo vệ môi trường, tuân thủ và cải tiến liên tục.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-009",
                "clause": "5.3",
                "content": "Vai trò, trách nhiệm và quyền hạn được phân công, truyền đạt và duy trì.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-010",
                "clause": "6",
                "content": "Hoạch định",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-011",
                "clause": "6.1.1",
                "content": "Xác định rủi ro và cơ hội cần giải quyết để đạt kết quả dự kiến và ngăn ngừa tác động không mong muốn.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-012",
                "clause": "6.1.2",
                "content": "Xác định khía cạnh môi trường theo quan điểm vòng đời và xác định khía cạnh có ý nghĩa.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-013",
                "clause": "6.1.3",
                "content": "Xác định, tiếp cận, cập nhật và đánh giá nghĩa vụ tuân thủ.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-014",
                "clause": "6.1.4",
                "content": "Hoạch định hành động đối với khía cạnh có ý nghĩa, nghĩa vụ tuân thủ, rủi ro và cơ hội; tích hợp vào quá trình.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-015",
                "clause": "6.2.1",
                "content": "Thiết lập mục tiêu môi trường tại cấp và chức năng liên quan; theo dõi, truyền đạt và cập nhật.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-016",
                "clause": "6.2.2",
                "content": "Hoạch định cách đạt mục tiêu: công việc, nguồn lực, trách nhiệm, thời hạn và phương pháp đánh giá kết quả.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-017",
                "clause": "7",
                "content": "Hỗ trợ",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-018",
                "clause": "7.1",
                "content": "Xác định và cung cấp nguồn lực cần thiết.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-019",
                "clause": "7.2",
                "content": "Xác định năng lực; bảo đảm người thực hiện có năng lực và lưu bằng chứng.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-020",
                "clause": "7.3",
                "content": "Bảo đảm nhận thức về chính sách, khía cạnh đáng kể, đóng góp và hậu quả của việc không phù hợp.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-021",
                "clause": "7.4",
                "content": "Hoạch định và thực hiện trao đổi thông tin nội bộ, bên ngoài liên quan đến hệ thống môi trường.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-022",
                "clause": "7.5",
                "content": "Tạo lập, cập nhật và kiểm soát thông tin dạng văn bản.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-023",
                "clause": "8",
                "content": "Thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-024",
                "clause": "8.1",
                "content": "Hoạch định và kiểm soát hoạt động; kiểm soát thay đổi, quá trình thuê ngoài và yêu cầu vòng đời.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-025",
                "clause": "8.2",
                "content": "Thiết lập, thực hiện và duy trì quá trình chuẩn bị, ứng phó tình huống khẩn cấp; thử nghiệm và xem xét định kỳ.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-026",
                "clause": "9",
                "content": "Đánh giá kết quả thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-027",
                "clause": "9.1.1",
                "content": "Theo dõi, đo lường, phân tích và đánh giá kết quả môi trường; kiểm soát thiết bị đo và lưu bằng chứng.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-028",
                "clause": "9.1.2",
                "content": "Đánh giá sự tuân thủ theo tần suất xác định và duy trì hiểu biết về tình trạng tuân thủ.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-029",
                "clause": "9.2",
                "content": "Hoạch định và thực hiện đánh giá nội bộ; bảo đảm khách quan và theo dõi kết quả.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-030",
                "clause": "9.3",
                "content": "Lãnh đạo xem xét hệ thống với đầy đủ đầu vào, đầu ra và quyết định cải tiến.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-031",
                "clause": "10",
                "content": "Cải tiến",
                "is_section": true
            },
            {
                "row_id": "ISO14001-2015-032",
                "clause": "10.1",
                "content": "Xác định cơ hội cải tiến và thực hiện hành động để đạt kết quả dự kiến.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-033",
                "clause": "10.2",
                "content": "Xử lý sự không phù hợp, nguyên nhân, hành động khắc phục và đánh giá hiệu lực.",
                "is_section": false
            },
            {
                "row_id": "ISO14001-2015-034",
                "clause": "10.3",
                "content": "Cải tiến liên tục tính phù hợp, đầy đủ và hiệu lực của hệ thống quản lý môi trường.",
                "is_section": false
            }
        ]
    },
    {
        "program_key": "ISO45001:2018",
        "program_code": "ISO 45001:2018",
        "management_system": "OHSMS",
        "template_file": "F.06-P.09.checklist-iso45001.template.docx",
        "source_label": "Thư viện khởi tạo có thể chỉnh sửa",
        "rows": [
            {
                "row_id": "ISO45001-2018-001",
                "clause": "4",
                "content": "Bối cảnh của tổ chức",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-002",
                "clause": "4.1",
                "content": "Hiểu tổ chức và bối cảnh có ảnh hưởng đến kết quả dự kiến của hệ thống quản lý an toàn và sức khỏe nghề nghiệp.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-003",
                "clause": "4.2",
                "content": "Xác định nhu cầu và mong đợi của người lao động và các bên quan tâm; xác định yêu cầu pháp luật và yêu cầu khác.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-004",
                "clause": "4.3",
                "content": "Xác định và duy trì phạm vi hệ thống quản lý an toàn và sức khỏe nghề nghiệp.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-005",
                "clause": "4.4",
                "content": "Thiết lập, thực hiện, duy trì và cải tiến hệ thống cùng các quá trình cần thiết.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-006",
                "clause": "5",
                "content": "Sự lãnh đạo và sự tham gia của người lao động",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-007",
                "clause": "5.1",
                "content": "Lãnh đạo thể hiện cam kết, chịu trách nhiệm và tích hợp yêu cầu ATVSLĐ vào quá trình kinh doanh.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-008",
                "clause": "5.2",
                "content": "Chính sách ATVSLĐ cam kết điều kiện làm việc an toàn, loại bỏ mối nguy, giảm rủi ro, tuân thủ và cải tiến.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-009",
                "clause": "5.3",
                "content": "Vai trò, trách nhiệm và quyền hạn được phân công, truyền đạt và duy trì.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-010",
                "clause": "5.4",
                "content": "Thiết lập quá trình tham vấn và tham gia của người lao động ở các cấp, chú trọng người lao động không quản lý.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-011",
                "clause": "6",
                "content": "Hoạch định",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-012",
                "clause": "6.1.1",
                "content": "Xác định rủi ro, cơ hội và các yếu tố cần giải quyết để bảo đảm hệ thống đạt kết quả dự kiến.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-013",
                "clause": "6.1.2.1",
                "content": "Nhận diện mối nguy thường xuyên, không thường xuyên, tình huống khẩn cấp, con người và thay đổi.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-014",
                "clause": "6.1.2.2",
                "content": "Đánh giá rủi ro ATVSLĐ và rủi ro khác của hệ thống theo phương pháp xác định.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-015",
                "clause": "6.1.2.3",
                "content": "Đánh giá cơ hội ATVSLĐ và cơ hội cải tiến hệ thống.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-016",
                "clause": "6.1.3",
                "content": "Xác định, tiếp cận và cập nhật yêu cầu pháp luật và yêu cầu khác.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-017",
                "clause": "6.1.4",
                "content": "Hoạch định hành động; áp dụng thứ bậc kiểm soát và tích hợp vào quá trình.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-018",
                "clause": "6.2.1",
                "content": "Thiết lập mục tiêu ATVSLĐ phù hợp chính sách, đo lường được khi có thể và được theo dõi.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-019",
                "clause": "6.2.2",
                "content": "Hoạch định cách đạt mục tiêu: công việc, nguồn lực, trách nhiệm, thời hạn và chỉ số đánh giá.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-020",
                "clause": "7",
                "content": "Hỗ trợ",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-021",
                "clause": "7.1",
                "content": "Xác định và cung cấp nguồn lực cần thiết.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-022",
                "clause": "7.2",
                "content": "Xác định năng lực và lưu giữ bằng chứng năng lực của người thực hiện công việc ảnh hưởng ATVSLĐ.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-023",
                "clause": "7.3",
                "content": "Bảo đảm người lao động nhận thức về chính sách, mối nguy, rủi ro, quyền dừng việc và hậu quả không phù hợp.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-024",
                "clause": "7.4",
                "content": "Hoạch định và thực hiện trao đổi thông tin nội bộ, bên ngoài.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-025",
                "clause": "7.5",
                "content": "Tạo lập, cập nhật và kiểm soát thông tin dạng văn bản.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-026",
                "clause": "8",
                "content": "Thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-027",
                "clause": "8.1.1",
                "content": "Hoạch định, thực hiện và kiểm soát hoạt động theo tiêu chí; điều chỉnh công việc phù hợp người lao động.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-028",
                "clause": "8.1.2",
                "content": "Loại bỏ mối nguy và giảm rủi ro theo thứ bậc biện pháp kiểm soát.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-029",
                "clause": "8.1.3",
                "content": "Hoạch định và kiểm soát thay đổi tạm thời, lâu dài.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-030",
                "clause": "8.1.4.1",
                "content": "Kiểm soát mua sắm sản phẩm và dịch vụ phù hợp yêu cầu ATVSLĐ.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-031",
                "clause": "8.1.4.2",
                "content": "Phối hợp và kiểm soát nhà thầu; đánh giá tiêu chí ATVSLĐ khi lựa chọn.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-032",
                "clause": "8.1.4.3",
                "content": "Kiểm soát chức năng và quá trình thuê ngoài.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-033",
                "clause": "8.2",
                "content": "Chuẩn bị và ứng phó tình huống khẩn cấp; đào tạo, thử nghiệm, đánh giá và truyền đạt.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-034",
                "clause": "9",
                "content": "Đánh giá kết quả thực hiện",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-035",
                "clause": "9.1.1",
                "content": "Theo dõi, đo lường, phân tích và đánh giá kết quả ATVSLĐ; kiểm soát thiết bị đo.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-036",
                "clause": "9.1.2",
                "content": "Đánh giá sự tuân thủ và duy trì hiểu biết về tình trạng tuân thủ.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-037",
                "clause": "9.2",
                "content": "Hoạch định, thực hiện đánh giá nội bộ; bảo đảm khách quan và xử lý kết quả.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-038",
                "clause": "9.3",
                "content": "Lãnh đạo xem xét hệ thống với đầu vào, đầu ra và quyết định cần thiết.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-039",
                "clause": "10",
                "content": "Cải tiến",
                "is_section": true
            },
            {
                "row_id": "ISO45001-2018-040",
                "clause": "10.1",
                "content": "Xác định cơ hội cải tiến và thực hiện hành động để đạt kết quả dự kiến.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-041",
                "clause": "10.2",
                "content": "Báo cáo, điều tra sự cố và sự không phù hợp; xác định nguyên nhân, hành động khắc phục và đánh giá hiệu lực.",
                "is_section": false
            },
            {
                "row_id": "ISO45001-2018-042",
                "clause": "10.3",
                "content": "Cải tiến liên tục kết quả và hiệu lực hệ thống, thúc đẩy văn hóa và sự tham gia của người lao động.",
                "is_section": false
            }
        ]
    }
] as ChecklistLibraryDefinition[];

export function findChecklistLibrary(programKey: string) {
    return CHECKLIST_LIBRARIES.find((item) => item.program_key === programKey) ?? null;
}
