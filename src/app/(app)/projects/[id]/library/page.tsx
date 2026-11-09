import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listPapers } from '@/lib/data/queries';
import { serviceAccountEmail } from '@/lib/google/drive';
import { geminiConfigured, geminiModel } from '@/lib/ai/extract';
import { PAPER_FIELDS, VIEW_PRESETS } from '@/lib/ai/fields';
import { PAPER_STATUS_LABEL, type PaperStatus } from '@/lib/types';
import { AcademicText } from '@/components/library/AcademicText';
import { ConnectFolderForm, ExtractQueue, SyncButton } from '@/components/library/LibraryControls';
import { disconnectDriveFolderAction } from './actions';

export const maxDuration = 300; // trích xuất một bài có thể mất 30–90 giây

const STATUS_STYLE: Record<PaperStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  processing: 'bg-sky-50 text-sky-800 border-sky-300',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  error: 'bg-rose-50 text-rose-800 border-rose-300',
  stale: 'bg-amber-50 text-amber-800 border-amber-300'
};

export default async function LibraryPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { id } = await params;
  const { view, q } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const papers = await listPapers(id);

  const botEmail = serviceAccountEmail();
  const aiReady = geminiConfigured();
  const canEdit = project.role !== 'viewer';
  const preset = VIEW_PRESETS.find((p) => p.id === view) ?? VIEW_PRESETS[0];
  const columns = PAPER_FIELDS.filter((f) => (preset.keys as readonly string[]).includes(f.key));

  const query = (q ?? '').trim().toLowerCase();
  const visible = query
    ? papers.filter((p) => p.fileName.toLowerCase().includes(query) || Object.values(p.fields).some((v) => v.toLowerCase().includes(query)))
    : papers;
  const toExtract = papers.filter((p) => p.status === 'pending' || p.status === 'stale' || p.status === 'error').map((p) => p.id);
  const done = papers.filter((p) => p.status === 'completed').length;

  return (
    <div className="space-y-4 p-8">
      {/* ---------- Kết nối Drive ---------- */}
      <section className="space-y-3 border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Nguồn: Google Shared Drive</h2>
            {project.driveFolderId ? (
              <p className="mt-0.5 text-sm text-zinc-600">
                📁{' '}
                <a className="underline" href={`https://drive.google.com/drive/folders/${project.driveFolderId}`} target="_blank" rel="noreferrer">
                  {project.driveFolderName ?? project.driveFolderId}
                </a>
                {project.driveSyncedAt && (
                  <span className="text-xs text-zinc-500"> · đồng bộ lần cuối {new Date(project.driveSyncedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-zinc-600">Chưa kết nối thư mục.</p>
            )}
          </div>
          {project.driveFolderId && project.role === 'owner' && (
            <form action={disconnectDriveFolderAction}>
              <input type="hidden" name="projectId" value={id} />
              <button className="text-xs text-zinc-500 underline hover:text-rose-700">Ngắt kết nối</button>
            </form>
          )}
        </div>

        {!botEmail && (
          <p className="border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            Quản trị viên chưa cấu hình tài khoản bot Google (biến <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> trên Vercel).
          </p>
        )}
        {!aiReady && (
          <p className="border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            Chưa cấu hình <code>GEMINI_API_KEY</code> trên Vercel — đồng bộ được nhưng chưa trích xuất được.
          </p>
        )}

        {!project.driveFolderId && project.role === 'owner' && botEmail && (
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
        )}
        {!project.driveFolderId && project.role !== 'owner' && <p className="text-sm text-zinc-500">Trưởng nhóm chưa kết nối thư mục Drive.</p>}

        {project.driveFolderId && canEdit && (
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
            <SyncButton projectId={id} />
            {aiReady && <ExtractQueue paperIds={toExtract} label="Trích xuất bài chưa xử lý" />}
            <span className="ml-auto text-xs text-zinc-500">
              {done}/{papers.length} bài đã trích xuất · model {geminiModel()} · 25 lượt/người/ngày
            </span>
          </div>
        )}
      </section>

      {/* ---------- Ma trận ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line bg-white text-xs">
          {VIEW_PRESETS.map((p) => (
            <Link
              key={p.id}
              href={`?view=${p.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`px-3 py-1.5 ${preset.id === p.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="ml-auto">
          <input type="hidden" name="view" value={preset.id} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Tìm trong ma trận…"
            className="w-64 border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800"
          />
        </form>
      </div>

      <div className="thin-scroll overflow-auto border border-line bg-white" style={{ maxHeight: 'calc(100vh - 360px)' }}>
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-paper text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="sticky left-0 z-20 w-64 min-w-64 border-b border-r border-line bg-paper px-3 py-2 font-semibold">Bài đọc</th>
              {columns.map((c) => (
                <th key={c.key} className="w-72 min-w-72 border-b border-line px-3 py-2 font-semibold">
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="sticky left-0 z-[5] border-b border-r border-line bg-white px-3 py-2.5">
                  <Link href={`/projects/${id}/library/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                    {p.fileName}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`border px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[p.status]}`}>{PAPER_STATUS_LABEL[p.status]}</span>
                    {p.status === 'completed' && (
                      <span className="text-[10px] text-zinc-500">
                        ✓ {Object.keys(p.verified).length}/{PAPER_FIELDS.length} ô đã duyệt
                      </span>
                    )}
                  </div>
                  {p.status === 'error' && p.error && <p className="mt-1 text-[11px] text-rose-700">{p.error}</p>}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="border-b border-line px-3 py-2.5 text-zinc-800">
                    <div className="relative max-h-48 overflow-hidden">
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
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-sm text-zinc-500">
                  {papers.length === 0 ? 'Chưa có bài đọc — kết nối thư mục Drive rồi bấm “Đồng bộ ngay”.' : 'Không có bài nào khớp từ khoá.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Nhãn <span className="text-amber-600">AI</span> = ô do Gemini điền, chưa ai kiểm tra; <span className="text-emerald-700">✓</span> = đã được thành viên
        xác nhận hoặc sửa tay. Bấm tên bài để xem đầy đủ, sửa và xác nhận từng ô. Luôn đối chiếu số liệu với bài gốc trước khi đưa vào bản thảo.
      </p>
    </div>
  );
}
