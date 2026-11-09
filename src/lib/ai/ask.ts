import 'server-only';
import { PAPER_FIELDS, NOT_FOUND_TEXT } from './fields';
import { geminiJson } from './gemini';
import type { Paper, PaperCredibility } from '@/lib/types';

/**
 * Hỏi thư viện: chọn các bài liên quan nhất (theo từ khoá, có trọng số hiếm/phổ biến),
 * gửi nội dung ĐÃ TRÍCH XUẤT (không gửi lại PDF → rẻ, nhanh), yêu cầu Gemini trả lời kèm trích [P#, Tr. x].
 */

export interface AskTurn {
  q: string;
  a: string;
}
export interface AskResult {
  answer: string;
  sources: { key: string; paperId: string; label: string }[];
  considered: number;
  total: number;
}

const STOP = new Set(
  'và của các những một được cho trong với là có không này đó thì để khi từ theo về như bài báo nghiên cứu nào gì bao nhiêu sao hay hoặc tôi mình nhóm the and of to in a an for on with by is are what which how do does paper papers study studies'.split(
    ' '
  )
);

// RegExp constructor: \p{…} cần ES2018, tsconfig target ES2017
const NON_WORD = new RegExp('[^\\p{L}\\p{N}\\s-]', 'gu');
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(NON_WORD, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

const MAX_FULL = 12;
const FIELD_CHARS = 900;

function paperText(p: Paper) {
  return [p.fileName, p.pub.journal ?? '', ...Object.values(p.fields)].join(' ');
}

function label(p: Paper) {
  return p.fileName.replace(/\.pdf$/i, '');
}

export async function askLibrary(opts: {
  question: string;
  papers: Paper[];
  credMap: Map<string, PaperCredibility>;
  history: AskTurn[];
  projectTopic: string;
}): Promise<AskResult> {
  const usable = opts.papers.filter((p) => Object.keys(p.fields).length > 0);
  if (usable.length === 0) return { answer: 'Thư viện chưa có bài nào được trích xuất — hãy trích xuất bài trước khi hỏi.', sources: [], considered: 0, total: 0 };

  // Xếp hạng liên quan: BM25 rút gọn trên toàn văn đã trích xuất
  const docs = usable.map((p) => ({ p, toks: tokens(paperText(p)) }));
  const qToks = [...new Set(tokens([opts.question, ...opts.history.slice(-1).map((h) => h.q)].join(' ')))];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.toks.length, 0) / docs.length;
  const scored = docs
    .map((d) => {
      const tf = new Map<string, number>();
      for (const t of d.toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of qToks) {
        const f = tf.get(t) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.toks.length / avgLen)));
      }
      return { p: d.p, score };
    })
    .sort((a, b) => b.score - a.score);

  const full = scored.filter((x) => x.score > 0).slice(0, MAX_FULL);
  const pick = full.length >= 3 ? full : scored.slice(0, MAX_FULL); // câu hỏi chung chung → lấy theo thứ tự
  const fullIds = new Set(pick.map((x) => x.p.id));

  const keyOf = new Map<string, string>();
  usable.forEach((p, i) => keyOf.set(p.id, `P${i + 1}`));

  const credLine = (p: Paper) => {
    const c = opts.credMap.get(p.id);
    const bits = [c?.quartile, c?.flags.length ? `cảnh báo: ${c.flags.map((f) => f.kind).join(',')}` : ''].filter(Boolean);
    return bits.length ? ` (${bits.join('; ')})` : '';
  };

  const fullBlocks = pick
    .map(({ p }) => {
      const fields = PAPER_FIELDS.map((f) => {
        const v = p.fields[f.key];
        if (!v || v === NOT_FOUND_TEXT) return '';
        return `- ${f.label}: ${v.length > FIELD_CHARS ? v.slice(0, FIELD_CHARS) + '…' : v}`;
      })
        .filter(Boolean)
        .join('\n');
      return `### [${keyOf.get(p.id)}] ${label(p)}${p.pub.journal ? ` — ${p.pub.journal}` : ''}${p.pub.year ? ` (${p.pub.year})` : ''}${credLine(p)}\n${fields}`;
    })
    .join('\n\n');
  const index = usable
    .filter((p) => !fullIds.has(p.id))
    .map((p) => `[${keyOf.get(p.id)}] ${label(p)}${p.pub.year ? ` (${p.pub.year})` : ''}`)
    .join('\n');

  const history = opts.history
    .slice(-3)
    .map((h) => `Hỏi: ${h.q}\nĐáp: ${h.a.slice(0, 1500)}`)
    .join('\n\n');

  const system = `Bạn là trợ lý tổng quan tài liệu của một nhóm nghiên cứu khoa học. Trả lời câu hỏi CHỈ dựa trên dữ liệu thư viện được cung cấp (đã trích xuất từ các bài báo).

QUY TẮC:
1. Mỗi ý phải ghi nguồn dạng [P3] hoặc [P3, Tr. 5] (lấy số trang từ ghi chú [Tr. x] trong dữ liệu nếu có). Không ghi nguồn không có trong dữ liệu.
2. Không bịa số liệu, tên thang đo, kết quả. Thiếu dữ liệu thì nói rõ "thư viện chưa có thông tin về…" và gợi ý bài nên đọc thêm trong danh mục.
3. Viết tiếng Việt, giữ thuật ngữ/tên biến tiếng Anh. Ngắn gọn, có cấu trúc: dùng gạch đầu dòng "- " và **in đậm** cho ý chính. Không dùng bảng.
4. Nếu bài có cảnh báo (Scopus loại, Beall, nhóm lưu ý) mà được dùng làm nguồn, nhắc người đọc thận trọng.
5. Khi so sánh nhiều bài, nêu rõ điểm thống nhất và mâu thuẫn.`;

  const prompt = `Đề tài của nhóm: ${opts.projectTopic || '(chưa mô tả)'}

## Bài liên quan nhất (nội dung chi tiết)
${fullBlocks}

## Các bài khác trong thư viện (chỉ có tên)
${index || '(không có)'}

${history ? `## Hội thoại trước\n${history}\n\n` : ''}## Câu hỏi
${opts.question}`;

  const out = await geminiJson<{ answer?: string; citedKeys?: string[] }>({
    system,
    prompt,
    temperature: 0.2,
    schema: {
      type: 'OBJECT',
      properties: {
        answer: { type: 'STRING', description: 'Câu trả lời tiếng Việt, có trích [P#, Tr. x].' },
        citedKeys: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Các mã bài đã trích, vd. ["P3","P7"].' }
      },
      required: ['answer', 'citedKeys']
    }
  });

  const answer = (out.answer ?? '').trim() || 'Không có câu trả lời.';
  const mentioned = new Set([...(out.citedKeys ?? []), ...[...answer.matchAll(/\bP(\d+)\b/g)].map((m) => `P${m[1]}`)]);
  const byKey = new Map([...keyOf.entries()].map(([id, k]) => [k, id]));
  const sources = [...mentioned]
    .filter((k) => byKey.has(k))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((k) => {
      const p = usable.find((x) => x.id === byKey.get(k))!;
      return { key: k, paperId: p.id, label: label(p) };
    });
  return { answer, sources, considered: pick.length, total: usable.length };
}
