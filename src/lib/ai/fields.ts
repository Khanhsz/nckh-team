/**
 * 12 trường của ma trận tài liệu — khớp với danh sách cho phép trong hàm
 * public.update_paper_field của database. Dùng được cả ở client lẫn server.
 */
export const PAPER_FIELDS = [
  {
    key: 'paperInformation',
    label: 'Định danh & nguồn',
    short: 'Định danh',
    instruction: 'Tác giả (năm); tên bài; tên tạp chí, tập/số/trang; DOI nếu có. Mỗi ý một dòng.'
  },
  {
    key: 'researchBackground',
    label: 'Bối cảnh nghiên cứu',
    short: 'Bối cảnh',
    instruction: 'Mỗi dòng bắt đầu bằng nhãn: [Quốc gia] …, [Ngành] …, [Đối tượng] …, [Thời điểm] … (giai đoạn thu thập dữ liệu).'
  },
  {
    key: 'researchObjectives',
    label: 'Mục tiêu & câu hỏi nghiên cứu',
    short: 'Mục tiêu / RQ',
    instruction: 'Mục tiêu nghiên cứu và từng câu hỏi nghiên cứu (RQ1, RQ2…), mỗi câu một dòng.'
  },
  {
    key: 'researchGap',
    label: 'Khoảng trống nghiên cứu',
    short: 'Khoảng trống',
    instruction: 'Khoảng trống (research gap) mà tác giả nêu, kèm lập luận chính.'
  },
  {
    key: 'theoreticalFoundation',
    label: 'Lý thuyết nền & cơ chế',
    short: 'Lý thuyết nền',
    instruction: 'Các lý thuyết nền (tên lý thuyết, tác giả gốc) và cơ chế lý thuyết nối các biến.'
  },
  {
    key: 'researchModel',
    label: 'Mô hình biến số',
    short: 'Mô hình biến',
    instruction: 'Mỗi nhóm biến một dòng, bắt đầu bằng nhãn [IV], [MED], [MOD], [DV], [Control]. Bỏ nhóm không có.'
  },
  {
    key: 'researchHypotheses',
    label: 'Giả thuyết nghiên cứu',
    short: 'Giả thuyết',
    instruction: 'Mỗi giả thuyết một dòng, bắt đầu bằng mã như trong bài (H1:, H2a:…), ghi chiều tác động kỳ vọng (+)/(-).'
  },
  {
    key: 'methodology',
    label: 'Phương pháp & mẫu',
    short: 'Phương pháp',
    instruction: 'Thiết kế nghiên cứu; cỡ mẫu (N = …); cách chọn mẫu; công cụ/phần mềm phân tích (PLS-SEM, CB-SEM, hồi quy…).'
  },
  {
    key: 'measurementScales',
    label: 'Thang đo & độ tin cậy',
    short: 'Thang đo',
    instruction:
      'Nguồn thang đo từng biến (tác giả gốc, số items, Likert mấy điểm); chỉ số độ tin cậy/giá trị (Cronbach α, CR, AVE, HTMT) và độ phù hợp mô hình (CFI, TLI, RMSEA, SRMR) đúng như bài báo cáo.'
  },
  {
    key: 'keyFindings',
    label: 'Kết quả kiểm định',
    short: 'Kết quả',
    instruction:
      'Mỗi giả thuyết một dòng: mã (H1:) + nhãn [Supported] / [Rejected] / [Partial] + hệ số (β hoặc r), t, p, R² đúng như bài báo cáo. Sau đó các phát hiện chính khác.'
  },
  {
    key: 'contributionsLimitations',
    label: 'Đóng góp, hạn chế & hướng tiếp',
    short: 'Hạn chế',
    instruction: 'Đóng góp lý thuyết/thực tiễn; hạn chế; hướng nghiên cứu tương lai — mỗi nhóm bắt đầu bằng "• ".'
  },
  {
    key: 'relevanceToMyResearch',
    label: 'Liên hệ với đề tài của nhóm',
    short: 'Liên hệ đề tài',
    instruction:
      'Bài này hữu ích thế nào cho đề tài của nhóm (mô tả ở dưới): biến/thang đo/lý thuyết có thể kế thừa, điểm khác biệt về bối cảnh. Đây là nhận định — ghi rõ "(nhận định của AI)".'
  }
] as const;

export type PaperFieldKey = (typeof PAPER_FIELDS)[number]['key'];
export const PAPER_FIELD_KEYS = PAPER_FIELDS.map((f) => f.key) as PaperFieldKey[];
export const isPaperFieldKey = (k: string): k is PaperFieldKey => (PAPER_FIELD_KEYS as string[]).includes(k);

export const NOT_FOUND_TEXT = 'Không đề cập trong bài.';

export const VIEW_PRESETS: { id: string; label: string; keys: PaperFieldKey[] }[] = [
  { id: 'overview', label: 'Tổng quan', keys: ['paperInformation', 'researchBackground', 'researchGap', 'researchModel', 'researchHypotheses', 'keyFindings'] },
  { id: 'theory', label: 'Lý thuyết & mô hình', keys: ['theoreticalFoundation', 'researchModel', 'researchHypotheses', 'measurementScales'] },
  { id: 'method', label: 'Phương pháp & kết quả', keys: ['methodology', 'measurementScales', 'keyFindings', 'contributionsLimitations'] },
  { id: 'all', label: 'Tất cả', keys: PAPER_FIELDS.map((f) => f.key) }
];
