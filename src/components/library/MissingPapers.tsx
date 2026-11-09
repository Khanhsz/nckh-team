'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Suggestion } from '@/lib/library/missing';
import { dismissRefAction, fetchRefsAction, resolveMissingMetaAction, restoreDismissedAction } from '@/app/(app)/projects/[id]/library/missing/actions';

type Row = Suggestion & { quartile: string | null };

const Q_STYLE: Record<string, string> = {
  Q1: 'bg-emerald-600 text-white',
  Q2: 'bg-lime-500 text-white',
  Q3: 'bg-amber-400 text-zinc-900',
  Q4: 'bg-orange-500 text-white'
};

export function MissingPapers({
  projectId,
  suggestions,
  stats,
  pending,
  unresolved,
  canEdit
}: {
  projectId: string;
  suggestions: Row[];
  stats: { total: number; withRefs: number; noRefsDeposited: number; totalRefs: number; noDoi: number; dismissed: number };
  pending: string[];
  unresolved: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();
  const stopRef = useRef(false);
  const maxCount = Math.max(2, ...suggestions.map((s) => s.citing.length));
  const [minCount, setMinCount] = useState(2);

  const rows = useMemo(() => suggestions.filter((s) => !hidden.has(s.key) && s.citing.length >= minCount), [suggestions, hidden, minCount]);

  const run = async () => {
    setRunning(true);
    stopRef.current = false;
    let done = 0;
    let empty = 0;
    for (let i = 0; i < pending.length; i += 10) {
      if (stopRef.current) break;
      setProgress(`Đang lấy danh mục tham khảo ${Math.min(i + 10, pending.length)}/${pending.length} bài…`);
      const r = await fetchRefsAction(projectId, pending.slice(i, i + 10));
      if (r.error) {
        setMsg(r.error);
        if (r.stop) break;
      }
      done += r.done ?? 0;
      empty += r.empty ?? 0;
    }
    setProgress('Đang bổ sung tên bài, tác giả, số trích dẫn…');
    await resolveMissingMetaAction(projectId);
    setMsg(`Đã lấy danh mục của ${done} bài${empty ? ` (${empty} bài NXB không công bố danh mục)` : ''}.`);
    setRunning(false);
    setProgress('');
    router.refresh();
  };

  const resolve = () =>
    start(async () => {
      const r = await resolveMissingMetaAction(projectId);
      setMsg(r.error ?? `Đã bổ sung thông tin ${r.resolved} bài.`);
      router.refresh();
    });

  const dismiss = (key: string) => {
    setHidden((h) => new Set(h).add(key));
    start(async () => {
      const r = await dismissRefAction(projectId, key);
      if (r.error) setMsg(r.error);
    });
  };

  const restore = () =>
    start(async () => {
      await restoreDismissedAction(projectId);
      setHidden(new Set());
      router.refresh();
    });

  const scholar = (s: Row) => `https://scholar.google.com/scholar?q=${encodeURIComponent(s.title ? `"${s.title}"` : s.text ?? '')}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border border-line bg-white px-3 py-2 text-xs">
        <span className="text-zinc-600">
          Đã có danh mục tham khảo của <b className="text-zinc-900">{stats.withRefs}</b>/{stats.total} bài · <b className="text-zinc-900">{stats.totalRefs.toLocaleString('vi-VN')}</b> tài liệu được trích
          {stats.noDoi > 0 && <> · {stats.noDoi} bài chưa có DOI (không tra được)</>}
          {stats.noRefsDeposited > 0 && <> · {stats.noRefsDeposited} bài NXB không công bố danh mục</>}
        </span>
        {canEdit && pending.length > 0 && !running && (
          <button onClick={run} className="bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700">
            ↓ Lấy danh mục tham khảo ({pending.length} bài)
          </button>
        )}
        {running && (
          <span className="flex items-center gap-2">
            {progress}
            <button onClick={() => (stopRef.current = true)} className="text-zinc-500 underline">
              Dừng
            </button>
          </span>
        )}
        {canEdit && unresolved > 0 && !running && (
          <button onClick={resolve} disabled={busy} className="border border-zinc-900 px-2.5 py-1 font-medium hover:bg-paper-2 disabled:opacity-50">
            ↻ Bổ sung thông tin ({unresolved})
          </button>
        )}
        {msg && <span className="text-zinc-700">{msg}</span>}
        <span className="ml-auto text-[11px] text-zinc-400">Nguồn: Crossref (miễn phí). Bài không có DOI cần tra DOI trước (tab Bảng → ★ Tra độ tin cậy).</span>
      </div>

      {suggestions.length === 0 ? (
        <div className="border border-dashed border-zinc-400 bg-white p-8 text-center text-sm text-zinc-600">
          {stats.withRefs === 0
            ? 'Chưa có danh mục tham khảo. Bấm “Lấy danh mục tham khảo” để bắt đầu.'
            : 'Chưa thấy tài liệu nào được từ 2 bài trở lên cùng trích mà nhóm chưa có. Thêm bài vào thư viện hoặc lấy danh mục cho các bài còn lại.'}
        </div>
      ) : (
        <div className="border border-line bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 text-xs text-zinc-600">
            <span>
              <b className="text-zinc-900">{rows.length}</b> tài liệu nhóm <b>chưa có</b>, được ít nhất
            </span>
            <input type="range" min={2} max={maxCount} value={minCount} onChange={(e) => setMinCount(Number(e.target.value))} />
            <b className="tabular-nums text-zinc-900">{minCount}</b> bài trong thư viện cùng trích
            {stats.dismissed > 0 && canEdit && (
              <button onClick={restore} className="ml-auto text-zinc-400 underline hover:text-zinc-700">
                Hiện lại {stats.dismissed} gợi ý đã ẩn
              </button>
            )}
          </div>
          <ol className="divide-y divide-line">
            {rows.map((s, i) => (
              <li key={s.key} className="flex gap-3 px-3 py-2.5">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-lg font-bold tabular-nums leading-none">{s.citing.length}</p>
                  <p className="text-[10px] leading-tight text-zinc-500">bài trích</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium leading-snug">
                    <span className="mr-1 text-zinc-400">{i + 1}.</span>
                    {s.title ?? <span className="font-normal italic text-zinc-600">{s.text ?? 'Không rõ tên bài'}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                    {s.authors && <span>{s.authors}</span>}
                    {s.year && <span>· {s.year}</span>}
                    {s.journal && <span className="italic">· {s.journal}</span>}
                    {s.quartile && <span className={`rounded-sm px-1 text-[10px] font-bold ${Q_STYLE[s.quartile] ?? ''}`}>{s.quartile}</span>}
                    {s.citedBy !== null && <span className="text-zinc-500">· {s.citedBy.toLocaleString('vi-VN')} trích dẫn</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-zinc-400">Được trích bởi:</span>
                    {s.citing.slice(0, 8).map((c) => (
                      <Link key={c.id} href={`/projects/${projectId}/library/${c.id}`} className="rounded-sm bg-paper-2 px-1.5 py-0.5 text-zinc-700 hover:bg-zinc-200">
                        {c.label.length > 30 ? c.label.slice(0, 29) + '…' : c.label}
                      </Link>
                    ))}
                    {s.citing.length > 8 && <span className="text-zinc-400">+{s.citing.length - 8}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {s.doi && (
                    <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer" className="underline">
                      DOI ↗
                    </a>
                  )}
                  <a href={scholar(s)} target="_blank" rel="noreferrer" className="underline">
                    Google Scholar ↗
                  </a>
                  {canEdit && (
                    <button onClick={() => dismiss(s.key)} className="text-zinc-400 hover:text-rose-700" title="Không cần (đã có dưới tên khác / không liên quan)">
                      Ẩn
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        Cách tính: lấy danh mục tài liệu tham khảo của các bài có DOI qua Crossref, gộp theo DOI (hoặc tác giả + năm + tên bài), loại những bài đã có trong thư viện (theo DOI, tên bài,
        hoặc “Tác giả, năm” trong tên file). Một số NXB không công bố danh mục lên Crossref nên kết quả có thể thiếu. Bài đã có nhưng vẫn hiện (do tên file khác) → bấm “Ẩn”.
      </p>
    </div>
  );
}
