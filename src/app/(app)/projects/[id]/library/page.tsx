import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getCatalogStatus, getProjectForUser, listPaperCredibility, listPapers } from '@/lib/data/queries';
import { serviceAccountEmail } from '@/lib/google/drive';
import { geminiConfigured, geminiModel } from '@/lib/ai/extract';
import { PAPER_FIELDS, VIEW_PRESETS } from '@/lib/ai/fields';
import { PAPER_STATUS_LABEL, type PaperStatus } from '@/lib/types';
import { AcademicText } from '@/components/library/AcademicText';
import { AutoRefresh, ConnectFolderForm, ExtractQueue, MetaQueue, SyncButton } from '@/components/library/LibraryControls';
import { CredibilityCell, flagLevel } from '@/components/library/Credibility';
import { LibraryFrame } from '@/components/library/LibraryFrame';
import { disconnectDriveFolderAction } from './actions';

export const maxDuration = 300; // trích xuất một bài có thể mất 30–90 giây

const STATUS_STYLE: Record<PaperStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  processing: 'bg-sky-50 text-sky-800 border-sky-300',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  error: 'bg-rose-50 text-rose-800 border-rose-300',
  stale: 'bg-amber-50 text-amber-800 border-amber-300'
};

type Density = 'compact' | 'normal' | 'full';
const DENSITY: { id: Density; label: string; cell: string }[] = [
  { id: 'compact', label: 'Gọn', cell: 'max-h-24 overflow-hidden' },
  { id: 'normal', label: 'Vừa', cell: 'max-h-56 overflow-hidden' },
  { id: 'full', label: 'Đầy đủ', cell: '' }
];

export default async function LibraryPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; q?: string; d?: string; rel?: string }>;
}) {
  const { id } = await params;
  const { view, q, d, rel } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [papers, credMap, catalog] = await Promise.all([listPapers(id), listPaperCredibility(id), getCatalogStatus()]);
  const catalogReady = catalog.sjr.count > 0;

  const botEmail = serviceAccountEmail();
  const aiReady = geminiConfigured();
  const canEdit = project.role !== 'viewer';
  const preset = VIEW_PRESETS.find((p) => p.id === view) ?? VIEW_PRESETS[0];
  const density = DENSITY.find((x) => x.id === d) ?? DENSITY[1];
  const columns = PAPER_FIELDS.filter((f) => (preset.keys as readonly string[]).includes(f.key));

  const query = (q ?? '').trim().toLowerCase();
  const RELS = [
    { id: '', label: 'Tất cả' },
    { id: 'q12', label: 'Q1–Q2' },
    { id: 'warn', label: '⚠ Có cảnh báo' },
    { id: 'none', label: 'Không xếp hạng' }
  ] as const;
  const relFilter = RELS.find((r) => r.id === rel)?.id ?? '';
  const relMatch = (pid: string) => {
    const c = credMap.get(pid);
    if (relFilter === 'q12') return c?.quartile === 'Q1' || c?.quartile === 'Q2';
    if (relFilter === 'warn') return Boolean(c?.flags.length);
    if (relFilter === 'none') return !c?.quartile;
    return true;
  };
  const relCount = (id: string) =>
    papers.filter((p) => {
      const c = credMap.get(p.id);
      return id === 'q12' ? c?.quartile === 'Q1' || c?.quartile === 'Q2' : id === 'warn' ? Boolean(c?.flags.length) : id === 'none' ? !c?.quartile : true;
    }).length;
  const visible = papers.filter(
    (p) =>
      relMatch(p.id) &&
      (!query ||
        p.fileName.toLowerCase().includes(query) ||
        (p.pub.journal ?? '').toLowerCase().includes(query) ||
        Object.values(p.fields).some((v) => v.toLowerCase().includes(query)))
  );
  const needMeta = papers.filter((p) => !p.pub.checkedAt).map((p) => p.id);
  const toExtract = papers.filter((p) => p.status === 'pending' || p.status === 'stale' || p.status === 'error').map((p) => p.id);
  const done = papers.filter((p) => p.status === 'completed').length;
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { view: preset.id, d: density.id, q: q || undefined, rel: relFilter || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `?${sp.toString()}`;
  };

  // ---------- Chưa kết nối Drive: hiện hướng dẫn đầy đủ ----------
  if (!project.driveFolderId) {
    return (
      <div className="max-w-3xl space-y-3 p-6">
        <section className="space-y-3 border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Kết nối thư mục bài đọc trên Google Shared Drive</h2>
          {!botEmail && (
            <p className="border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Quản trị viên chưa cấu hình tài khoản bot Google (biến <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> trên Vercel).
            </p>
          )}
          {project.role === 'owner' && botEmail ? (
            <div className="space-y-2 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
                <li>
                  Trên Google Drive, mở Shared Drive của nhóm → <b>Quản lý thành viên</b> → thêm email bot với quyền <b>Người xem</b>:
                  <code className="ml-1 select-all border border-line bg-paper-2 px-1 font-mono text-xs">{botEmail}</code>
                </li>
                <li>Mở thư mục chứa bài đọc, copy link trên thanh địa chỉ và dán vào đây (thư mục con cũng được quét).</li>
              </ol>
              <ConnectFolderForm projectId={id} />
            </div>
          ) : (
            project.role !== 'owner' && <p className="text-sm text-zinc-500">Trưởng nhóm chưa kết nối thư mục Drive.</p>
          )}
        </section>
      </div>
    );
  }

  // ---------- Đã kết nối: thanh công cụ gọn + bảng lấp đầy màn hình ----------
  const toolbar = (
    <>
      <div className="flex border border-line bg-white text-xs">
        {VIEW_PRESETS.map((p) => (
          <Link key={p.id} href={href({ view: p.id })} className={`px-2.5 py-1.5 ${preset.id === p.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}>
            {p.label}
          </Link>
        ))}
      </div>
      <div className="flex border border-line bg-white text-xs" title="Độ cao mỗi dòng">
        {DENSITY.map((x) => (
          <Link key={x.id} href={href({ d: x.id })} className={`px-2.5 py-1.5 ${density.id === x.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}>
            {x.label}
          </Link>
        ))}
      </div>
      <div className="flex border border-line bg-white text-xs" title="Lọc theo độ tin cậy của tạp chí">
        {RELS.map((r) => (
          <Link
            key={r.id}
            href={href({ rel: r.id || undefined })}
            className={`px-2.5 py-1.5 ${relFilter === r.id ? 'bg-zinc-900 text-white' : r.id === 'warn' && relCount('warn') > 0 ? 'text-amber-800 hover:bg-amber-50' : 'text-zinc-600 hover:bg-paper-2'}`}
          >
            {r.label}
            {r.id && <span className="ml-1 tabular-nums opacity-70">{relCount(r.id)}</span>}
          </Link>
        ))}
      </div>
      <form className="min-w-48 flex-1">
        <input type="hidden" name="view" value={preset.id} />
        <input type="hidden" name="d" value={density.id} />
        {relFilter && <input type="hidden" name="rel" value={relFilter} />}
        <input
          name="q"
          defaultValue={q}
          placeholder={`Tìm trong ${papers.length} bài…`}
          className="w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800"
        />
      </form>
    </>
  );

  return (
    <div className="space-y-2 px-4 pb-2 pt-3">
      <AutoRefresh seconds={60} />

      {!catalogReady && (
        <div className="flex flex-wrap items-center gap-2 border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span>
            <b>Chưa có danh mục SCImago</b> nên cột Độ tin cậy chưa xếp hạng Q được (số trích dẫn và tên tạp chí vẫn hiện).
            {project.role === 'owner' ? ' Nạp file CSV một lần là xong:' : ' Nhờ trưởng nhóm nạp ở tab Thành viên & cài đặt.'}
          </span>
          {project.role === 'owner' && (
            <Link href={`/projects/${id}/settings#catalog`} className="bg-sky-900 px-2.5 py-1 font-medium text-white hover:bg-sky-700">
              Nạp danh mục tạp chí →
            </Link>
          )}
        </div>
      )}

      {/* Thanh nguồn Drive: một dòng */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-white px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden>📁</span>
          <a className="max-w-64 truncate font-medium underline" href={`https://drive.google.com/drive/folders/${project.driveFolderId}`} target="_blank" rel="noreferrer">
            {project.driveFolderName ?? 'Thư mục Drive'}
          </a>
          {project.driveSyncedAt && (
            <span className="text-zinc-500">
              · đồng bộ {new Date(project.driveSyncedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} (tự động 7h & 19h — bấm Đồng bộ để cập nhật ngay)
            </span>
          )}
        </span>
        {canEdit && <SyncButton projectId={id} />}
        {canEdit && aiReady && <ExtractQueue paperIds={toExtract} label="Trích xuất bài chưa xử lý" />}
        {canEdit && <MetaQueue paperIds={needMeta} />}
        {!aiReady && <span className="text-amber-700">Chưa cấu hình GEMINI_API_KEY — chưa trích xuất được.</span>}
        <span className="ml-auto text-zinc-500">
          <b className="text-zinc-800">{done}</b>/{papers.length} đã trích xuất · {geminiModel()}
        </span>
        {project.role === 'owner' && (
          <form action={disconnectDriveFolderAction}>
            <input type="hidden" name="projectId" value={id} />
            <button className="text-zinc-400 hover:text-rose-700" title="Ngắt kết nối thư mục Drive">
              Ngắt
            </button>
          </form>
        )}
      </div>

      <LibraryFrame toolbar={toolbar}>
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="sticky left-0 z-20 w-64 min-w-64 border-b border-r border-line bg-paper px-3 py-2 font-semibold">
                Bài đọc ({visible.length})
              </th>
              <th className="w-52 min-w-52 border-b border-r border-line px-3 py-2 font-semibold" title="Hạng Q (SCImago), SJR, số trích dẫn, cảnh báo tạp chí săn mồi">
                Độ tin cậy
              </th>
              {columns.map((c) => (
                <th key={c.key} className="w-80 min-w-80 border-b border-line px-3 py-2 font-semibold">
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="align-top hover:bg-paper/50">
                <td
                  className={`sticky left-0 z-[5] border-b border-r border-line bg-white px-3 py-2 ${
                    flagLevel(credMap.get(p.id)) === 'danger'
                      ? 'shadow-[inset_4px_0_0_#e11d48]'
                      : flagLevel(credMap.get(p.id)) === 'warn'
                        ? 'shadow-[inset_4px_0_0_#f59e0b]'
                        : ''
                  }`}
                >
                  <Link href={`/projects/${id}/library/${p.id}`} className="line-clamp-3 font-medium underline-offset-2 hover:underline" title={p.fileName}>
                    {p.fileName}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`border px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[p.status]}`}>{PAPER_STATUS_LABEL[p.status]}</span>
                    {p.status === 'completed' && (
                      <span className="text-[10px] text-zinc-500">
                        ✓ {Object.keys(p.verified).length}/{PAPER_FIELDS.length}
                      </span>
                    )}
                    {p.driveWebLink && (
                      <a href={p.driveWebLink} target="_blank" rel="noreferrer" className="text-[10px] text-zinc-500 underline" title="Mở PDF trên Drive">
                        PDF ↗
                      </a>
                    )}
                  </div>
                  {p.status === 'error' && p.error && <p className="mt-1 line-clamp-2 text-[11px] text-rose-700" title={p.error}>{p.error}</p>}
                </td>
                <td className="border-b border-r border-line px-3 py-2">
                  <CredibilityCell cred={credMap.get(p.id)} pub={p.pub} catalogReady={catalogReady} />
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="border-b border-line px-3 py-2 text-zinc-800">
                    <div className={density.cell}>
                      {p.fields[c.key] && (
                        <span
                          title={p.verified[c.key] ? 'Đã được thành viên xác nhận' : 'AI tạo, chưa ai kiểm tra'}
                          className={`float-right ml-1 text-[10px] ${p.verified[c.key] ? 'text-emerald-700' : 'text-amber-600'}`}
                        >
                          {p.verified[c.key] ? '✓' : 'AI'}
                        </span>
                      )}
                      <AcademicText text={p.fields[c.key]} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-10 text-center text-sm text-zinc-500">
                  {papers.length === 0 ? 'Chưa có bài đọc — bấm “Đồng bộ ngay” hoặc chờ lần đồng bộ tự động.' : 'Không có bài nào khớp bộ lọc.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </LibraryFrame>
    </div>
  );
}
