'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MapEdge, RelationMapData } from '@/lib/library/relmap';
import type { RelResult } from '@/lib/types';
import { analyzeRelationsAction, normalizeConstructsAction, renameConstructAction } from '@/app/(app)/projects/[id]/library/map/actions';

const STATUS_COLOR: Record<MapEdge['status'], string> = { solid: '#059669', rejected: '#e11d48', mixed: '#d97706', untested: '#a1a1aa' };
const STATUS_LABEL: Record<MapEdge['status'], string> = { solid: 'Vững', rejected: 'Bị bác bỏ', mixed: 'Chưa thống nhất', untested: 'Chưa kiểm định' };
const RESULT_STYLE: Record<RelResult, string> = {
  supported: 'bg-emerald-600 text-white',
  not_supported: 'bg-rose-600 text-white',
  partial: 'bg-amber-400 text-zinc-900',
  not_tested: 'bg-zinc-200 text-zinc-700'
};
const RESULT_LABEL: Record<RelResult, string> = { supported: 'ủng hộ', not_supported: 'bác bỏ', partial: 'một phần', not_tested: 'chưa kiểm định' };
const TYPE_LABEL = { direct: '', mediation: 'trung gian', moderation: 'điều tiết' } as const;

/* ---------------- Bố cục lực (tính một lần, xác định) ---------------- */
function layout(names: string[], edges: { a: number; b: number; w: number }[], W: number, H: number) {
  const n = names.length;
  const pos = names.map((_, i) => {
    const t = (2 * Math.PI * i) / Math.max(n, 1);
    return { x: W / 2 + (W / 2.6) * Math.cos(t), y: H / 2 + (H / 2.6) * Math.sin(t) };
  });
  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.75;
  for (let it = 0; it < 320; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d = Math.max(Math.hypot(dx, dy), 0.01);
        const f = (k * k) / d;
        disp[i].x += (dx / d) * f;
        disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f;
        disp[j].y -= (dy / d) * f;
      }
    for (const e of edges) {
      const dx = pos[e.a].x - pos[e.b].x;
      const dy = pos[e.a].y - pos[e.b].y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = ((d * d) / k) * (0.6 + 0.2 * Math.min(e.w, 4));
      disp[e.a].x -= (dx / d) * f;
      disp[e.a].y -= (dy / d) * f;
      disp[e.b].x += (dx / d) * f;
      disp[e.b].y += (dy / d) * f;
    }
    const temp = (W / 8) * (1 - it / 320) + 1;
    for (let i = 0; i < n; i++) {
      // kéo nhẹ về tâm để không trôi
      disp[i].x += (W / 2 - pos[i].x) * 0.02 * k;
      disp[i].y += (H / 2 - pos[i].y) * 0.02 * k;
      const d = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.01);
      pos[i].x = Math.min(W - 70, Math.max(70, pos[i].x + (disp[i].x / d) * Math.min(d, temp)));
      pos[i].y = Math.min(H - 24, Math.max(24, pos[i].y + (disp[i].y / d) * Math.min(d, temp)));
    }
  }
  return pos;
}

export function RelationMap({
  projectId,
  data,
  pending,
  unmapped,
  canEdit,
  aiReady
}: {
  projectId: string;
  data: RelationMapData;
  pending: string[];
  unmapped: number;
  canEdit: boolean;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MapEdge['status'] | 'all' | 'conflict' | 'thin'>('all');
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  /* ---- Hàng đợi phân tích ---- */
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const stopRef = useRef(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const runQueue = async () => {
    setRunning(true);
    stopRef.current = false;
    let done = 0;
    for (let i = 0; i < pending.length; i += 5) {
      if (stopRef.current) break;
      setProgress(`Đang phân tích ${Math.min(i + 5, pending.length)}/${pending.length} bài…`);
      const r = await analyzeRelationsAction(projectId, pending.slice(i, i + 5));
      if (r.error) {
        setMsg(r.error);
        if (r.stop) break;
      } else done += r.done ?? 0;
      if (i + 5 < pending.length) await new Promise((res) => setTimeout(res, 4000));
    }
    if (done > 0 && !stopRef.current) {
      setProgress('Đang gộp tên biến đồng nghĩa…');
      const n = await normalizeConstructsAction(projectId);
      setMsg(n.error ?? `Đã phân tích ${done} bài và gộp còn ${n.groups} biến.`);
    }
    setRunning(false);
    setProgress('');
    router.refresh();
  };

  const normalize = () =>
    start(async () => {
      const n = await normalizeConstructsAction(projectId);
      setMsg(n.error ?? `Đã gộp còn ${n.groups} biến.`);
      router.refresh();
    });

  /* ---- Phát hiện ---- */
  const isConflict = (e: MapEdge) => (e.counts.supported > 0 && e.counts.not_supported > 0) || (e.signs.positive > 0 && e.signs.negative > 0);
  const insights = useMemo(
    () => ({
      solid: data.edges.filter((e) => e.status === 'solid' && e.evidence.length >= 3),
      conflict: data.edges.filter(isConflict),
      thin: data.edges.filter((e) => e.evidence.length === 1 && e.type === 'direct')
    }),
    [data.edges]
  );

  /* ---- Đồ thị ---- */
  const W = 980;
  const H = 560;
  const shownNodes = useMemo(() => data.nodes.slice(0, limit), [data.nodes, limit]);
  const idx = useMemo(() => new Map(shownNodes.map((n, i) => [n.name, i])), [shownNodes]);
  const graphEdges = useMemo(
    () => data.edges.filter((e) => e.type !== 'moderation' && idx.has(e.from) && idx.has(e.to)),
    [data.edges, idx]
  );
  const pos = useMemo(
    () =>
      layout(
        shownNodes.map((n) => n.name),
        graphEdges.map((e) => ({ a: idx.get(e.from)!, b: idx.get(e.to)!, w: e.evidence.length })),
        W,
        H
      ),
    [shownNodes, graphEdges, idx]
  );
  const maxPapers = Math.max(1, ...shownNodes.map((n) => n.papers));

  /* ---- Bảng ---- */
  const tableEdges = data.edges.filter((e) => {
    if (selected && e.from !== selected && e.to !== selected && e.via !== selected) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'conflict') return isConflict(e);
    if (statusFilter === 'thin') return e.evidence.length === 1;
    return e.status === statusFilter;
  });

  /* ---- Đổi tên / gộp biến ---- */
  const [renameTo, setRenameTo] = useState('');
  const doRename = () => {
    if (!selected || !renameTo.trim()) return;
    start(async () => {
      const r = await renameConstructAction(projectId, selected, renameTo);
      if (r.error) return setMsg(r.error);
      setMsg(`Đã đổi “${selected}” → “${renameTo.trim()}”.`);
      setSelected(renameTo.trim());
      setRenameTo('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {/* Thanh điều khiển */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-xs">
        <span className="text-zinc-600">
          Đã phân tích <b className="text-zinc-900">{data.analyzed}</b>/{data.extracted} bài đã trích xuất · <b className="text-zinc-900">{data.nodes.length}</b> biến ·{' '}
          <b className="text-zinc-900">{data.edges.length}</b> quan hệ
        </span>
        {canEdit && aiReady && pending.length > 0 && !running && (
          <button onClick={runQueue} className="bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-hover">
            Phân tích giả thuyết ({pending.length} bài)
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
        {canEdit && aiReady && data.edges.length > 0 && !running && (
          <button onClick={normalize} disabled={busy} className="border border-ink-3/50 text-primary px-2.5 py-1 font-medium hover:bg-paper-2 disabled:opacity-50" title="AI gộp các tên biến đồng nghĩa giữa các bài">
            {busy ? 'Đang gộp…' : `Gộp tên biến${unmapped ? ` (${unmapped} chưa gộp)` : ''}`}
          </button>
        )}
        {msg && <span className="text-zinc-700">{msg}</span>}
        <span className="ml-auto text-[11px] text-zinc-400">Phân tích dùng nội dung đã trích xuất (không đọc lại PDF) — nên đối chiếu bài gốc.</span>
      </div>

      {data.edges.length === 0 ? (
        <div className="border border-dashed border-zinc-400 bg-white p-8 text-center text-sm text-zinc-600">
          {data.extracted === 0
            ? 'Chưa có bài nào được trích xuất. Trích xuất bài ở tab Bảng bài đọc trước.'
            : 'Chưa có quan hệ nào. Bấm “Phân tích giả thuyết” để AI tổng hợp các quan hệ X → Y và kết quả kiểm định từ mọi bài.'}
        </div>
      ) : (
        <>
          {/* Phát hiện */}
          <div className="grid gap-2 md:grid-cols-3">
            {(
              [
                ['solid', 'Quan hệ đã vững', '≥ 3 bài, đa số ủng hộ, có thể dùng làm nền cho giả thuyết', 'border-emerald-300 bg-emerald-50 text-emerald-900', insights.solid],
                ['conflict', 'Kết quả mâu thuẫn', 'Có bài ủng hộ, có bài bác bỏ (hoặc ngược chiều), đáng để kiểm định lại / tìm biến điều tiết', 'border-amber-300 bg-amber-50 text-amber-900', insights.conflict],
                ['thin', '◌ Ít bằng chứng', 'Quan hệ trực tiếp mới có 1 bài — khoảng trống tiềm năng', 'border-sky-300 bg-sky-50 text-sky-900', insights.thin]
              ] as const
            ).map(([key, title, hint, cls, list]) => (
              <button
                key={key}
                onClick={() => {
                  setStatusFilter(statusFilter === key ? 'all' : key === 'solid' ? 'solid' : key);
                  setSelected(null);
                }}
                className={`border p-3 text-left ${cls} ${statusFilter === key ? 'ring-2 ring-zinc-900' : ''}`}
              >
                <p className="text-sm font-semibold">
                  {title} <span className="tabular-nums">({list.length})</span>
                </p>
                <p className="mt-0.5 text-[11px] opacity-80">{hint}</p>
                <p className="mt-1 line-clamp-2 text-[11px]">
                  {list
                    .slice(0, 3)
                    .map((e) => `${e.from} → ${e.to}`)
                    .join(' · ')}
                </p>
              </button>
            ))}
          </div>

          {/* Sơ đồ */}
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-1.5 text-[11px] text-zinc-600">
              <label className="flex items-center gap-1.5">
                Hiện
                <input type="range" min={8} max={Math.max(8, data.nodes.length)} value={Math.min(limit, Math.max(8, data.nodes.length))} onChange={(e) => setLimit(Number(e.target.value))} />
                <b className="tabular-nums">{Math.min(limit, data.nodes.length)}</b> biến nhiều bài nhất
              </label>
              {(['solid', 'mixed', 'rejected', 'untested'] as const).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="inline-block h-0.5 w-5" style={{ background: STATUS_COLOR[s] }} />
                  {STATUS_LABEL[s]}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="inline-block w-5 border-t-2 border-dashed border-zinc-500" /> qua trung gian
              </span>
              <span className="ml-auto">Bấm một biến để lọc bảng · nét đậm = nhiều bài</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="Sơ đồ quan hệ giữa các biến">
              <defs>
                {(Object.keys(STATUS_COLOR) as MapEdge['status'][]).map((s) => (
                  <marker key={s} id={`arr-${s}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={STATUS_COLOR[s]} />
                  </marker>
                ))}
              </defs>
              {graphEdges.map((e) => {
                const a = pos[idx.get(e.from)!];
                const b = pos[idx.get(e.to)!];
                const rb = 6 + 14 * Math.sqrt(data.nodes[idx.get(e.to)!].papers / maxPapers);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d = Math.max(Math.hypot(dx, dy), 1);
                const x2 = b.x - (dx / d) * (rb + 3);
                const y2 = b.y - (dy / d) * (rb + 3);
                const dim = selected ? e.from !== selected && e.to !== selected : hoverEdge ? hoverEdge !== e.key : false;
                return (
                  <line
                    key={e.key}
                    x1={a.x}
                    y1={a.y}
                    x2={x2}
                    y2={y2}
                    stroke={STATUS_COLOR[e.status]}
                    strokeWidth={1 + Math.min(5, Math.log2(1 + e.evidence.length) * 1.6)}
                    strokeDasharray={e.type === 'mediation' ? '5 4' : undefined}
                    markerEnd={`url(#arr-${e.status})`}
                    opacity={dim ? 0.12 : 0.8}
                    onMouseEnter={() => setHoverEdge(e.key)}
                    onMouseLeave={() => setHoverEdge(null)}
                  >
                    <title>{`${e.from} → ${e.to}${e.via ? ` (qua ${e.via})` : ''}\n${e.evidence.length} bài: ${e.counts.supported} ủng hộ, ${e.counts.not_supported} bác bỏ, ${e.counts.partial} một phần, ${e.counts.not_tested} chưa kiểm định`}</title>
                  </line>
                );
              })}
              {shownNodes.map((n, i) => {
                const r = 6 + 14 * Math.sqrt(n.papers / maxPapers);
                const on = selected === n.name;
                const dim = selected && !on && !graphEdges.some((e) => (e.from === selected && e.to === n.name) || (e.to === selected && e.from === n.name));
                return (
                  <g key={n.name} transform={`translate(${pos[i].x},${pos[i].y})`} onClick={() => setSelected(on ? null : n.name)} className="cursor-pointer" opacity={dim ? 0.25 : 1}>
                    <circle r={r} fill={on ? '#18181b' : '#ffffff'} stroke="#18181b" strokeWidth={on ? 2 : 1.2} />
                    <text y={r + 11} textAnchor="middle" fontSize={11} fontWeight={on ? 700 : 500} fill="#18181b" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
                      {n.name.length > 28 ? n.name.slice(0, 27) + '…' : n.name}
                    </text>
                    <title>{`${n.name}\n${n.papers} bài · ${n.degree} quan hệ`}</title>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Biến đang chọn: đổi tên / gộp */}
          {selected && (
            <div className="flex flex-wrap items-center gap-2 border border-ink-3/50 text-primary bg-white px-3 py-2 text-xs">
              <span>
                Đang xem: <b>{selected}</b>
              </span>
              <button onClick={() => setSelected(null)} className="text-zinc-500 underline">
                bỏ chọn
              </button>
              {canEdit && (
                <span className="ml-auto flex items-center gap-1">
                  Đổi tên / gộp vào:
                  <input
                    list="construct-names"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    placeholder="tên biến khác hoặc tên mới"
                    className="w-56 border border-line px-1.5 py-1"
                  />
                  <datalist id="construct-names">
                    {data.nodes
                      .filter((n) => n.name !== selected)
                      .map((n) => (
                        <option key={n.name} value={n.name} />
                      ))}
                  </datalist>
                  <button onClick={doRename} disabled={busy || !renameTo.trim()} className="bg-primary px-2 py-1 font-medium text-white disabled:opacity-40">
                    Lưu
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Bảng quan hệ */}
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5 text-xs">
              {(
                [
                  ['all', 'Tất cả'],
                  ['solid', 'Vững'],
                  ['conflict', 'Mâu thuẫn'],
                  ['rejected', 'Bị bác bỏ'],
                  ['untested', 'Chưa kiểm định'],
                  ['thin', '1 bài']
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setStatusFilter(k)} className={`px-2 py-1 ${statusFilter === k ? 'bg-primary-container font-medium text-on-primary-container' : 'text-zinc-600 hover:bg-paper-2'}`}>
                  {l}
                </button>
              ))}
              <span className="ml-auto text-zinc-500">{tableEdges.length} quan hệ</span>
            </div>
            <div className="thin-scroll max-h-[520px] overflow-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-paper text-left text-[11px]  text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Quan hệ</th>
                    <th className="w-16 px-2 py-2 font-semibold">Số bài</th>
                    <th className="w-44 px-2 py-2 font-semibold">Kết quả</th>
                    <th className="px-3 py-2 font-semibold">Bằng chứng</th>
                  </tr>
                </thead>
                <tbody>
                  {tableEdges.map((e) => (
                    <tr key={e.key} className="border-t border-line align-top hover:bg-paper/50" onMouseEnter={() => setHoverEdge(e.key)} onMouseLeave={() => setHoverEdge(null)}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{e.from}</span> <span style={{ color: STATUS_COLOR[e.status] }}>→</span>{' '}
                        <span className="font-medium">{e.to}</span>
                        {e.type !== 'direct' && (
                          <span className="ml-1 text-[11px] text-zinc-500">
                            ({TYPE_LABEL[e.type]}: {e.via ?? '?'})
                          </span>
                        )}
                        <span className="ml-1.5 text-[10px]" style={{ color: STATUS_COLOR[e.status] }}>
                          {STATUS_LABEL[e.status]}
                        </span>
                        {(e.signs.positive > 0 || e.signs.negative > 0) && (
                          <span className="ml-1.5 text-[10px] text-zinc-500">
                            {e.signs.positive > 0 && `+${e.signs.positive}`} {e.signs.negative > 0 && `−${e.signs.negative}`}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{e.evidence.length}</td>
                      <td className="px-2 py-2">
                        <div className="flex h-2 w-36 overflow-hidden bg-zinc-100">
                          {(['supported', 'partial', 'not_supported', 'not_tested'] as const).map((k) =>
                            e.counts[k] ? (
                              <span
                                key={k}
                                className={RESULT_STYLE[k].split(' ')[0]}
                                style={{ width: `${(e.counts[k] / e.evidence.length) * 100}%` }}
                                title={`${e.counts[k]} ${RESULT_LABEL[k]}`}
                              />
                            ) : null
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {e.counts.supported} ủng hộ · {e.counts.not_supported} bác bỏ{e.counts.partial ? ` · ${e.counts.partial} một phần` : ''}
                          {e.counts.not_tested ? ` · ${e.counts.not_tested} chưa KĐ` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {e.evidence.map((ev) => (
                            <Link
                              key={ev.paperId}
                              href={`/projects/${projectId}/library/${ev.paperId}`}
                              className={`rounded-sm px-1.5 py-0.5 text-[10px] ${RESULT_STYLE[ev.result]} hover:opacity-80`}
                              title={`${ev.label}\n${RESULT_LABEL[ev.result]}${ev.hypothesis ? ` · ${ev.hypothesis}` : ''}${ev.page ? ` · ${ev.page}` : ''}`}
                            >
                              {ev.label.length > 26 ? ev.label.slice(0, 25) + '…' : ev.label}
                              {ev.hypothesis ? ` (${ev.hypothesis})` : ''}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
