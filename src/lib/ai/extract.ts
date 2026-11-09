import 'server-only';
import { NOT_FOUND_TEXT, PAPER_FIELDS, type PaperFieldKey } from './fields';

/**
 * Trích xuất ma trận tài liệu từ PDF bằng Gemini (gọi từ server, khoá không lộ ra trình duyệt).
 * NGUYÊN TẮC: không có dữ liệu dự phòng/bịa. Lỗi → ném lỗi, ô để trống.
 */

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export class ExtractError extends Error {
  constructor(
    public code: 'not_configured' | 'quota' | 'bad_request' | 'blocked' | 'empty' | 'http',
    message: string
  ) {
    super(message);
  }
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export interface ExtractionResult {
  fields: Record<PaperFieldKey, string>;
  warnings: string[];
  model: string;
}

const SYSTEM_PROMPT = `Bạn là trợ lý tổng quan tài liệu cho nhóm nghiên cứu khoa học, đọc bài báo PDF đính kèm và điền ma trận tài liệu.

QUY TẮC BẮT BUỘC:
1. CHỈ dùng thông tin có trong bài. Tuyệt đối không suy đoán, không bịa số liệu, tên tác giả, tạp chí hay xếp hạng tạp chí.
2. Mọi số liệu thống kê (N, β, t, p, R², α, CR, AVE, CFI, RMSEA…) phải chép đúng như trong bài.
3. Sau mỗi ý, ghi số trang nguồn dạng [Tr. X] (theo số trang in trên bài; nếu không có thì theo thứ tự trang PDF).
4. Trường nào bài không đề cập: ghi đúng câu "${NOT_FOUND_TEXT}"
5. Viết tiếng Việt, giữ nguyên thuật ngữ và tên biến tiếng Anh. Xuống dòng bằng \\n giữa các ý.
6. Nếu trang nào không đọc được (ảnh scan mờ, bảng vỡ) hoặc có điểm không chắc chắn, ghi vào mảng "warnings".`;

function buildSchema() {
  const properties: Record<string, { type: string; description?: string; items?: { type: string } }> = {};
  for (const f of PAPER_FIELDS) properties[f.key] = { type: 'STRING', description: `${f.label}: ${f.instruction}` };
  properties.warnings = { type: 'ARRAY', items: { type: 'STRING' }, description: 'Cảnh báo về chất lượng đọc hoặc điểm không chắc chắn.' };
  const order = [...PAPER_FIELDS.map((f) => f.key), 'warnings'];
  return { type: 'OBJECT', properties, required: order, propertyOrdering: order };
}

export async function extractPaper(pdf: Buffer, opts: { fileName: string; projectTopic: string }): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ExtractError('not_configured', 'Chưa cấu hình GEMINI_API_KEY trên Vercel.');
  const model = geminiModel();

  const fieldGuide = PAPER_FIELDS.map((f, i) => `${i + 1}. ${f.key} — ${f.label}: ${f.instruction}`).join('\n');
  const userPrompt = `Bài báo: "${opts.fileName}"

Đề tài của nhóm (dùng cho trường relevanceToMyResearch): ${opts.projectTopic || '(nhóm chưa mô tả đề tài — ghi "Nhóm chưa mô tả đề tài để so sánh.")'}

Điền các trường sau:
${fieldGuide}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } }, { text: userPrompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: buildSchema() }
    })
  });

  if (res.status === 429) throw new ExtractError('quota', 'Gemini đang hết hạn mức miễn phí (quá nhiều yêu cầu). Đợi 1–2 phút rồi thử lại.');
  if (res.status === 400 || res.status === 404) {
    const body = await res.text();
    if (/API key not valid|API_KEY_INVALID/i.test(body)) throw new ExtractError('not_configured', 'GEMINI_API_KEY không hợp lệ.');
    if (/not found|is not supported/i.test(body)) throw new ExtractError('bad_request', `Không tìm thấy model "${model}". Kiểm tra biến GEMINI_MODEL.`);
    throw new ExtractError('bad_request', 'Gemini không đọc được file này (có thể PDF bị khoá mật khẩu hoặc hỏng).');
  }
  if (!res.ok) throw new ExtractError('http', `Gemini trả lỗi ${res.status}. Thử lại sau ít phút.`);

  const json = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (json.promptFeedback?.blockReason) throw new ExtractError('blocked', `Gemini từ chối xử lý file (${json.promptFeedback.blockReason}).`);
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new ExtractError('empty', 'Gemini không trả về kết quả. Thử trích xuất lại.');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ExtractError('empty', 'Kết quả của Gemini bị cắt ngang hoặc sai định dạng. Thử trích xuất lại.');
  }

  const fields = {} as Record<PaperFieldKey, string>;
  for (const f of PAPER_FIELDS) {
    const v = parsed[f.key];
    fields[f.key] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 20000) : NOT_FOUND_TEXT;
  }
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).map((w) => w.slice(0, 500)).slice(0, 20)
    : [];
  if (json.candidates?.[0]?.finishReason === 'MAX_TOKENS') warnings.push('Kết quả có thể bị cắt do quá dài.');

  return { fields, warnings, model };
}
