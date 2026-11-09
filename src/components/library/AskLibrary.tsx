'use client';

import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { askLibraryAction } from '@/app/(app)/projects/[id]/library/ask/actions';
import type { AskResult } from '@/lib/ai/ask';

const SUGGESTIONS = [
  'Những thang đo nào được dùng cho các biến chính? Bài nào báo cáo Cronbach’s α?',
  'Tổng hợp các giả thuyết được ủng hộ và bị bác bỏ',
  'Các bài dùng phương pháp gì (PLS-SEM, CB-SEM, hồi quy…), cỡ mẫu bao nhiêu?',
  'Khoảng trống nghiên cứu nào được nhiều bài nhắc đến?',
  'Lý thuyết nền nào được dùng nhiều nhất?'
];

interface Turn {
  q: string;
  res?: AskResult;
  error?: string;
}

const STORE = (pid: string) => `nckh-ask-${pid}`;

/** Hiển thị markdown tối giản: đoạn, gạch đầu dòng, **đậm**, và biến [P3, Tr. 5] thành link */
function Rich({ text, projectId, sources }: { text: string; projectId: string; sources: AskResult['sources'] }) {
  const idOf = new Map(sources.map((s) => [s.key, s]));
  const inline = (s: string, k: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|\[P\d+(?:[^\]]*)\])/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={`${k}-${i}`}>{part.slice(2, -2)}</b>;
      const m = part.match(/^\[(P\d+)([^\]]*)\]$/);
      if (m) {
        const src = idOf.get(m[1]);
        return src ? (
          <Link
            key={`${k}-${i}`}
            href={`/projects/${projectId}/library/${src.paperId}`}
            title={src.label}
            className="mx-0.5 rounded-sm bg-sky-50 px-1 text-[11px] font-medium text-sky-800 no-underline hover:bg-sky-100"
          >
            {m[1]}
            {m[2]}
          </Link>
        ) : (
          <span key={`${k}-${i}`} className="text-[11px] text-zinc-500">
            {part}
          </span>
        );
      }
      return <Fragment key={`${k}-${i}`}>{part}</Fragment>;
    });

  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = (k: string) => {
    if (list.length) blocks.push(<ul key={`ul-${k}`} className="my-1 list-disc space-y-1 pl-5">{list}</ul>);
    list = [];
  };
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) list.push(<li key={i}>{inline(bullet[1], String(i))}</li>);
    else {
      flush(String(i));
      if (!t) return;
      const h = t.match(/^#{1,4}\s+(.*)$/);
      blocks.push(
        h ? (
          <p key={i} className="mt-2 font-semibold">
            {inline(h[1], String(i))}
          </p>
        ) : (
          <p key={i} className="my-1">
            {inline(t, String(i))}
          </p>
        )
      );
    }
  });
  flush('end');
  return <div className="text-sm leading-relaxed text-zinc-800">{blocks}</div>;
}

export function AskLibrary({ projectId, ready, total, aiReady }: { projectId: string; ready: number; total: number; aiReady: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE(projectId));
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch {
      /* bỏ qua */
    }
  }, [projectId]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE(projectId), JSON.stringify(turns.slice(-10)));
    } catch {
      /* bỏ qua */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, projectId]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    setQ('');
    const history = turns.filter((t) => t.res).map((t) => ({ q: t.q, a: t.res!.answer }));
    setTurns((ts) => [...ts, { q: text }]);
    start(async () => {
      const r = await askLibraryAction(projectId, text, history);
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? ('error' in r ? { q: text, error: r.error } : { q: text, res: r }) : t)));
    });
  };

  if (!aiReady) return <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Chưa cấu hình GEMINI_API_KEY nên chưa hỏi được.</p>;
  if (ready === 0)
    return <p className="border border-dashed border-zinc-400 bg-white p-6 text-sm text-zinc-600">Chưa có bài nào được trích xuất — trích xuất bài ở tab Bảng bài đọc trước khi hỏi.</p>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      <p className="text-xs text-zinc-500">
        Hỏi dựa trên <b>{ready}</b>/{total} bài đã trích xuất. Mỗi câu trả lời ghi nguồn <span className="rounded-sm bg-sky-50 px-1 text-sky-800">P#</span> — bấm để mở bài. AI chỉ dùng
        dữ liệu đã trích xuất; nên đối chiếu lại PDF trước khi đưa vào bài viết.
      </p>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="border border-line bg-white px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-paper-2">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] bg-zinc-900 px-3 py-2 text-sm text-white">{t.q}</p>
            <div className="border border-line bg-white p-4">
              {t.error ? (
                <p className="text-sm text-rose-700">{t.error}</p>
              ) : t.res ? (
                <>
                  <Rich text={t.res.answer} projectId={projectId} sources={t.res.sources} />
                  {t.res.sources.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2 text-[11px] text-zinc-500">
                      <span className="mr-1">Nguồn:</span>
                      {t.res.sources.map((s) => (
                        <Link key={s.key} href={`/projects/${projectId}/library/${s.paperId}`} className="mr-2 inline-block hover:text-zinc-900 hover:underline">
                          <b>{s.key}</b> {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-zinc-400">
                    Đã xem chi tiết {t.res.considered} bài liên quan nhất / {t.res.total} bài.
                  </p>
                </>
              ) : (
                <p className="animate-pulse text-sm text-zinc-500">Đang đọc thư viện…</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="sticky bottom-2 flex gap-2 border border-zinc-900 bg-white p-2 shadow-lg"
      >
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask(q);
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Hỏi về thư viện… (Enter để gửi, Shift+Enter xuống dòng)"
          className="min-w-0 flex-1 resize-none px-1 text-sm outline-none"
        />
        <div className="flex flex-col gap-1">
          <button disabled={pending || !q.trim()} className="bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {pending ? '…' : 'Hỏi'}
          </button>
          {turns.length > 0 && (
            <button type="button" onClick={() => setTurns([])} className="text-[11px] text-zinc-400 hover:text-zinc-700">
              Xoá
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
