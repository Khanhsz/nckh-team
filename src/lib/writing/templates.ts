import 'server-only';
import { NOT_FOUND_TEXT } from '../ai/fields';
import type { Paper, Project } from '../types';

/** Khung tài liệu tạo sẵn — HTML được Google Drive chuyển thành Google Docs (Heading 1/2, bảng). */

export type DocTemplate = 'paper' | 'proposal' | 'review' | 'blank';

export const TEMPLATE_LABEL: Record<DocTemplate, string> = {
  paper: 'Bài báo khoa học (IMRaD)',
  proposal: 'Đề cương nghiên cứu',
  review: 'Tổng quan tài liệu — kèm bảng từ thư viện',
  blank: 'Tài liệu trống'
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const note = (s: string) => `<p style="color:#888888"><i>${esc(s)}</i></p>`;
const h1 = (s: string) => `<h1>${esc(s)}</h1>`;
const h2 = (s: string) => `<h2>${esc(s)}</h2>`;
const cell = (s: string | undefined) =>
  !s || s.trim() === NOT_FOUND_TEXT ? '<td>—</td>' : `<td>${esc(s).replace(/\n/g, '<br>')}</td>`;

export function buildDocHtml(template: DocTemplate, project: Project, title: string, papers: Paper[] = []): string {
  const head = `<p><b>${esc(title)}</b></p><p style="color:#888888">Dự án: ${esc(project.code ? `${project.code} · ` : '')}${esc(project.name)}</p>`;
  let body = '';

  if (template === 'paper') {
    body = [
      h1('Tiêu đề'),
      note('Tiêu đề ngắn gọn, nêu biến chính và bối cảnh.'),
      h1('Tóm tắt (Abstract)'),
      note('Mục đích · Thiết kế/phương pháp · Kết quả · Hàm ý · Tính mới (150–250 từ).'),
      h2('Từ khoá'),
      h1('1. Giới thiệu'),
      note('Bối cảnh → vấn đề → khoảng trống nghiên cứu → câu hỏi nghiên cứu → đóng góp → cấu trúc bài.'),
      h1('2. Cơ sở lý thuyết và giả thuyết'),
      h2('2.1. Lý thuyết nền'),
      h2('2.2. Phát triển giả thuyết'),
      h2('2.3. Mô hình nghiên cứu'),
      h1('3. Phương pháp nghiên cứu'),
      h2('3.1. Mẫu và thu thập dữ liệu'),
      h2('3.2. Thang đo'),
      h2('3.3. Phương pháp phân tích'),
      h1('4. Kết quả'),
      h2('4.1. Đánh giá mô hình đo lường'),
      h2('4.2. Kiểm định mô hình cấu trúc và giả thuyết'),
      h1('5. Thảo luận'),
      h2('5.1. Hàm ý lý thuyết'),
      h2('5.2. Hàm ý thực tiễn'),
      h1('6. Kết luận, hạn chế và hướng nghiên cứu tiếp'),
      h1('Tài liệu tham khảo')
    ].join('');
  } else if (template === 'proposal') {
    body = [
      h1('1. Tính cấp thiết của đề tài'),
      h1('2. Tổng quan tình hình nghiên cứu'),
      note('Tóm lược các nhóm nghiên cứu chính và chỉ ra khoảng trống.'),
      h1('3. Mục tiêu và câu hỏi nghiên cứu'),
      h1('4. Đối tượng và phạm vi nghiên cứu'),
      h1('5. Phương pháp nghiên cứu'),
      h1('6. Kế hoạch thực hiện'),
      note('Xem chi tiết tiến độ ở tab Masterplan của app.'),
      h1('7. Dự kiến kết quả và đóng góp'),
      h1('Tài liệu tham khảo')
    ].join('');
  } else if (template === 'review') {
    const done = papers.filter((p) => p.status === 'completed' || p.status === 'stale');
    const rows = done
      .map(
        (p, i) =>
          `<tr><td>${i + 1}</td>${cell(p.fields.paperInformation ?? p.fileName)}${cell(p.fields.researchBackground)}${cell(p.fields.researchModel)}${cell(p.fields.keyFindings)}<td>${
            Object.keys(p.verified).length
          }/12</td></tr>`
      )
      .join('');
    body = [
      h1('1. Phương pháp tổng quan'),
      note('Cơ sở dữ liệu, từ khoá, tiêu chí chọn/loại, sơ đồ PRISMA.'),
      h1('2. Tổng hợp theo chủ đề'),
      h2('2.1. Chủ đề 1'),
      h2('2.2. Chủ đề 2'),
      h1('3. Khoảng trống nghiên cứu'),
      h1('Phụ lục: Ma trận tài liệu'),
      note(
        `Trích từ thư viện bài đọc của app lúc tạo tài liệu (${done.length} bài đã trích xuất). Cột cuối = số ô đã được thành viên xác nhận; ô chưa xác nhận do AI điền — cần đối chiếu bài gốc trước khi trích dẫn.`
      ),
      done.length
        ? `<table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>#</th><th>Định danh</th><th>Bối cảnh</th><th>Mô hình biến</th><th>Kết quả</th><th>Đã duyệt</th></tr>${rows}</table>`
        : note('Chưa có bài nào được trích xuất.')
    ].join('');
  }

  return `<html><head><meta charset="utf-8"></head><body>${head}${body || '<p></p>'}</body></html>`;
}
