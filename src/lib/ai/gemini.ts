import 'server-only';
import { ExtractError, geminiModel } from './extract';

/**
 * Gọi Gemini trả JSON theo schema (dùng cho Hỏi thư viện, Bản đồ biến…).
 * Lỗi được đổi sang ExtractError có thông điệp tiếng Việt.
 */
export async function geminiJson<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ExtractError('not_configured', 'Chưa cấu hình GEMINI_API_KEY trên Vercel.');
  const model = geminiModel();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    cache: 'no-store',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: opts.temperature ?? 0.2, responseMimeType: 'application/json', responseSchema: opts.schema }
    })
  });
  if (res.status === 429) throw new ExtractError('quota', 'Gemini đang hết hạn mức miễn phí. Đợi 1–2 phút rồi thử lại.');
  if (!res.ok) {
    const body = await res.text();
    if (/API key not valid|API_KEY_INVALID/i.test(body)) throw new ExtractError('not_configured', 'GEMINI_API_KEY không hợp lệ.');
    throw new ExtractError('http', `Gemini trả lỗi ${res.status}. Thử lại sau ít phút.`);
  }
  const json = (await res.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (json.promptFeedback?.blockReason) throw new ExtractError('blocked', `Gemini từ chối xử lý (${json.promptFeedback.blockReason}).`);
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new ExtractError('empty', 'Gemini không trả về kết quả. Thử lại.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ExtractError('empty', 'Kết quả của Gemini bị cắt ngang. Thử lại với câu hỏi hẹp hơn.');
  }
}
