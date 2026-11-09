import 'server-only';
import { NOT_FOUND_TEXT } from './fields';
import { geminiJson } from './gemini';
import type { Paper, Relation, RelResult, RelSign, RelType } from '@/lib/types';

/**
 * Bản đồ biến – giả thuyết.
 * 1) Trích các quan hệ X → Y (kèm kết quả kiểm định) từ nội dung ĐÃ trích xuất của từng bài (không gửi lại PDF).
 * 2) Chuẩn hoá tên biến giữa các bài (gộp đồng nghĩa) để so sánh được.
 */

export type { RelType, RelResult, RelSign, Relation } from '@/lib/types';

const TYPES: RelType[] = ['direct', 'mediation', 'moderation'];
const RESULTS: RelResult[] = ['supported', 'not_supported', 'partial', 'not_tested'];
const SIGNS: RelSign[] = ['positive', 'negative', 'none', 'unclear'];

const pickField = (p: Paper, key: string, max: number) => {
  const v = p.fields[key];
  if (!v || v === NOT_FOUND_TEXT) return '';
  return v.length > max ? v.slice(0, max) + '…' : v;
};

const SYSTEM = `Bạn là trợ lý phân tích mô hình nghiên cứu định lượng. Từ thông tin đã tóm tắt của mỗi bài báo, liệt kê MỌI quan hệ giữa các biến mà bài đề xuất/kiểm định.

QUY TẮC:
- Chỉ dùng thông tin được cung cấp. Không suy đoán quan hệ bài không nêu.
- "from"/"to": tên biến (construct) bằng tiếng Anh như trong bài, ngắn gọn (vd. "Employer Branding", "Job Satisfaction"). Không ghi chỉ báo/câu hỏi.
- "type": direct (X→Y), mediation (X→Y qua "via"), moderation ("via" điều tiết quan hệ X→Y).
- "result": supported (được ủng hộ / có ý nghĩa), not_supported (bác bỏ / không có ý nghĩa), partial (ủng hộ một phần), not_tested (chỉ đề xuất, chưa kiểm định — vd. bài tổng quan/lý thuyết).
- "sign": positive / negative / none (không có tác động) / unclear.
- "hypothesis": mã giả thuyết nếu có (H1, H2a…); "page": số trang dạng "Tr. 7" nếu dữ liệu có ghi.
- Bài định tính / tổng quan không có quan hệ cụ thể → trả mảng rỗng.`;

/** Trích quan hệ cho một lô bài (tối đa ~6 bài/lần để tiết kiệm hạn mức). */
export async function extractRelations(papers: Paper[]): Promise<Map<string, Relation[]>> {
  const keyed = papers.map((p, i) => ({ key: `B${i + 1}`, p }));
  const blocks = keyed
    .map(
      ({ key, p }) => `### [${key}] ${p.fileName.replace(/\.pdf$/i, '')}
- Mô hình: ${pickField(p, 'researchModel', 1500)}
- Giả thuyết: ${pickField(p, 'researchHypotheses', 2500)}
- Kết quả chính: ${pickField(p, 'keyFindings', 2500)}
- Phương pháp: ${pickField(p, 'methodology', 500)}`
    )
    .join('\n\n');

  const out = await geminiJson<{ papers?: { key?: string; relations?: Partial<Relation>[] }[] }>({
    system: SYSTEM,
    prompt: `Phân tích các bài sau và trả về quan hệ của TỪNG bài (giữ đúng mã [B#]):\n\n${blocks}`,
    temperature: 0.1,
    schema: {
      type: 'OBJECT',
      properties: {
        papers: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              key: { type: 'STRING' },
              relations: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    from: { type: 'STRING' },
                    to: { type: 'STRING' },
                    type: { type: 'STRING', enum: TYPES },
                    via: { type: 'STRING', nullable: true },
                    sign: { type: 'STRING', enum: SIGNS },
                    result: { type: 'STRING', enum: RESULTS },
                    hypothesis: { type: 'STRING', nullable: true },
                    page: { type: 'STRING', nullable: true }
                  },
                  required: ['from', 'to', 'type', 'sign', 'result']
                }
              }
            },
            required: ['key', 'relations']
          }
        }
      },
      required: ['papers']
    }
  });

  const clean = (s: unknown, max = 120) => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ').slice(0, max) : null);
  const result = new Map<string, Relation[]>();
  for (const { key, p } of keyed) {
    const found = out.papers?.find((x) => x.key === key);
    const rels: Relation[] = (found?.relations ?? [])
      .map((r) => ({
        from: clean(r.from) ?? '',
        to: clean(r.to) ?? '',
        type: TYPES.includes(r.type as RelType) ? (r.type as RelType) : 'direct',
        via: clean(r.via),
        sign: SIGNS.includes(r.sign as RelSign) ? (r.sign as RelSign) : 'unclear',
        result: RESULTS.includes(r.result as RelResult) ? (r.result as RelResult) : 'not_tested',
        hypothesis: clean(r.hypothesis, 20),
        page: clean(r.page, 20)
      }))
      .filter((r) => r.from && r.to && r.from.toLowerCase() !== r.to.toLowerCase())
      .slice(0, 60);
    result.set(p.id, rels);
  }
  return result;
}

export const rawKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[“”"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

/** Gộp tên biến đồng nghĩa → tên chuẩn (tiếng Anh, Title Case). */
export async function normalizeConstructs(names: string[], projectTopic: string): Promise<Map<string, string>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 400);
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const out = await geminiJson<{ groups?: { canonical?: string; variants?: string[] }[] }>({
    system: `Bạn chuẩn hoá tên biến (construct) trong nghiên cứu khoa học xã hội/kinh doanh. Gộp các tên CÙNG một khái niệm (đồng nghĩa, viết tắt, số ít/số nhiều, khác cách viết) thành một tên chuẩn tiếng Anh, Title Case, ngắn gọn.
KHÔNG gộp các khái niệm khác nhau dù gần nghĩa (vd. "Job Satisfaction" ≠ "Work Engagement"; "Organizational Commitment" ≠ "Affective Commitment" nếu bài phân biệt). Mỗi tên đầu vào phải xuất hiện đúng một lần trong "variants".`,
    prompt: `Đề tài: ${projectTopic || '(chưa mô tả)'}\n\nDanh sách tên biến:\n${unique.map((n) => `- ${n}`).join('\n')}`,
    temperature: 0,
    schema: {
      type: 'OBJECT',
      properties: {
        groups: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { canonical: { type: 'STRING' }, variants: { type: 'ARRAY', items: { type: 'STRING' } } },
            required: ['canonical', 'variants']
          }
        }
      },
      required: ['groups']
    }
  });
  for (const g of out.groups ?? []) {
    const canonical = g.canonical?.trim().slice(0, 200);
    if (!canonical) continue;
    for (const v of g.variants ?? []) map.set(rawKey(v), canonical);
  }
  // Tên Gemini bỏ sót → giữ nguyên
  for (const n of unique) if (!map.has(rawKey(n))) map.set(rawKey(n), n);
  return map;
}
