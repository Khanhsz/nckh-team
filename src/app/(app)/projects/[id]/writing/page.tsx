import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listDocuments, listMembers } from '@/lib/data/queries';
import { getDocMeta, serviceAccountEmail, type DriveDocMeta } from '@/lib/google/drive';
import { TEMPLATE_LABEL, type DocTemplate } from '@/lib/writing/templates';
import { CreateDocForm, LinkDocForm, WritingFolderForm } from '@/components/writing/WritingForms';
import { unlinkDocAction } from './actions';

const KIND_LABEL = { working: 'Bản thảo', proposal: 'Đề cương', review: 'Tổng quan', other: 'Tài liệu' } as const;
const docUrl = (id: string, mode: 'edit' | 'preview') => `https://docs.google.com/document/d/${id}/${mode}`;

export default async function WritingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { id } = await params;
  const { doc } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [docs, members] = await Promise.all([listDocuments(id), listMembers(id)]);

  const botEmail = serviceAccountEmail();
  const canEdit = project.role !== 'viewer';
  const isOwner = project.role === 'owner';
  const folderId = project.writingFolderId ?? project.driveFolderId;
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '—';

  // Lấy tên/thời điểm sửa mới nhất trực tiếp từ Drive (không chặn trang nếu lỗi)
  const metas = new Map<string, DriveDocMeta | null>();
  if (botEmail) {
    const results = await Promise.allSettled(docs.map((d) => getDocMeta(d.driveFileId)));
    results.forEach((r, i) => metas.set(docs[i].id, r.status === 'fulfilled' ? r.value : null));
  }
  const selected = docs.find((d) => d.id === doc) ?? docs[0];
  const selectedMeta = selected ? metas.get(selected.id) : undefined;
  const templates = (Object.keys(TEMPLATE_LABEL) as DocTemplate[]).map((t) => ({ id: t, label: TEMPLATE_LABEL[t] }));

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[320px_1fr]">
      {/* ===== Cột trái: danh sách + tạo mới ===== */}
      <aside className="space-y-4">
        <section className="border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Working files ({docs.length})</h2>
          <ul className="divide-y divide-line">
            {docs.map((d) => {
              const meta = metas.get(d.id);
              const active = selected?.id === d.id;
              return (
                <li key={d.id} className={active ? 'bg-paper-2' : ''}>
                  <Link href={`?doc=${d.id}`} className="block px-4 py-2.5 hover:bg-paper">
                    <p className="text-sm font-medium leading-snug">{meta?.name ?? d.title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {KIND_LABEL[d.kind]}
                      {meta ? (
                        <>
                          {' '}
                          · sửa {new Date(meta.modifiedTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}
                          {meta.lastModifiedBy && <> bởi {meta.lastModifiedBy}</>}
                        </>
                      ) : botEmail ? (
                        <span className="text-rose-700"> · bot không mở được file</span>
                      ) : null}
                    </p>
                  </Link>
                </li>
              );
            })}
            {docs.length === 0 && <li className="px-4 py-4 text-sm text-zinc-500">Chưa có tài liệu nào.</li>}
          </ul>
        </section>

        {canEdit && botEmail && (
          <section className="space-y-3 border border-line bg-white p-4">
            <h3 className="text-sm font-semibold">Tạo working file mới</h3>
            {folderId ? (
              <>
                <p className="text-[11px] text-zinc-500">
                  Lưu trong thư mục Drive: <b>{project.writingFolderName ?? project.driveFolderName ?? folderId}</b>
                </p>
                <CreateDocForm projectId={id} templates={templates} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">{isOwner ? 'Chọn thư mục lưu bài viết ở bên dưới trước.' : 'Trưởng nhóm cần chọn thư mục lưu bài viết.'}</p>
            )}
            <div className="border-t border-line pt-3">
              <h3 className="mb-2 text-sm font-semibold">Hoặc gắn Google Doc có sẵn</h3>
              <LinkDocForm projectId={id} />
            </div>
          </section>
        )}

        {isOwner && botEmail && (
          <section className="space-y-2 border border-line bg-white p-4">
            <h3 className="text-sm font-semibold">Thư mục lưu bài viết</h3>
            <p className="text-[11px] text-zinc-500">
              {project.writingFolderId
                ? `Hiện tại: ${project.writingFolderName}`
                : project.driveFolderId
                  ? `Chưa chọn — đang dùng tạm thư mục thư viện (${project.driveFolderName}).`
                  : 'Chưa chọn.'}{' '}
              Bot cần quyền <b>Người đóng góp</b> trở lên trong Shared Drive để tạo file.
            </p>
            <WritingFolderForm projectId={id} />
          </section>
        )}

        {!botEmail && (
          <p className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Chưa cấu hình tài khoản bot Google (<code>GOOGLE_SERVICE_ACCOUNT_JSON</code>) nên chưa tạo/gắn được Google Docs.
          </p>
        )}
      </aside>

      {/* ===== Cột phải: xem trước tài liệu ===== */}
      <section className="flex min-h-[70vh] flex-col border border-line bg-white">
        {selected ? (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">{selectedMeta?.name ?? selected.title}</h2>
                <p className="text-[11px] text-zinc-500">
                  Thêm bởi {nameOf(selected.createdBy)} · {new Date(selected.createdAt).toLocaleDateString('vi-VN')}
                </p>
              </div>
              <a
                href={docUrl(selected.driveFileId, 'edit')}
                target="_blank"
                rel="noreferrer"
                className="bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                ✎ Mở để viết trên Google Docs ↗
              </a>
              {(isOwner || selected.createdBy === user.id) && canEdit && (
                <form action={unlinkDocAction}>
                  <input type="hidden" name="docId" value={selected.id} />
                  <button className="text-xs text-zinc-400 hover:text-rose-700" title="Chỉ gỡ khỏi app — file trên Drive vẫn còn">
                    Gỡ khỏi app
                  </button>
                </form>
              )}
            </header>
            <iframe
              key={selected.driveFileId}
              src={docUrl(selected.driveFileId, 'preview')}
              title={selected.title}
              className="w-full flex-1"
              style={{ minHeight: '65vh' }}
            />
            <p className="border-t border-line px-4 py-2 text-[11px] text-zinc-500">
              Bản xem trước — bạn cần đăng nhập Google bằng tài khoản có quyền vào Shared Drive. Google không cho chỉnh sửa Docs nhúng trong trang
              khác, nên bấm “Mở để viết” để soạn; nội dung tự cập nhật ở đây khi tải lại.
            </p>
          </>
        ) : (
          <div className="m-auto max-w-sm p-8 text-center text-sm text-zinc-500">
            Chưa có working file. Tạo Google Doc mới từ khung mẫu (bài báo IMRaD, đề cương, tổng quan kèm bảng ma trận tài liệu) hoặc gắn Doc có sẵn ở cột
            bên trái.
          </div>
        )}
      </section>
    </div>
  );
}
