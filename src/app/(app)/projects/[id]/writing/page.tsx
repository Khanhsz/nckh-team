import { Icon } from '@/components/ui/Icon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listDocuments, listMembers } from '@/lib/data/queries';
import { getDocMeta, serviceAccountEmail, type DriveDocMeta } from '@/lib/google/drive';
import { AttachLinkForm } from '@/components/writing/WritingForms';
import { unlinkDocAction } from './actions';

const docUrl = (id: string, mode: 'edit' | 'preview') => `https://docs.google.com/document/d/${id}/${mode}`;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export default async function WritingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { id } = await params;
  const { doc } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [docs, members] = await Promise.all([listDocuments(id), listMembers(id)]);

  const canEdit = project.role !== 'viewer';
  const isOwner = project.role === 'owner';
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '—';

  // Tên & lần sửa gần nhất của Google Docs (nếu bot đọc được) — lỗi không chặn trang
  const metas = new Map<string, DriveDocMeta | null>();
  if (serviceAccountEmail()) {
    const gdocs = docs.filter((d) => d.driveFileId);
    const results = await Promise.allSettled(gdocs.map((d) => getDocMeta(d.driveFileId!)));
    results.forEach((r, i) => metas.set(gdocs[i].id, r.status === 'fulfilled' ? r.value : null));
  }
  const selected = docs.find((d) => d.id === doc) ?? docs[0];
  const selectedMeta = selected ? metas.get(selected.id) : undefined;
  const openUrl = selected ? (selected.driveFileId ? docUrl(selected.driveFileId, 'edit') : selected.url!) : '';

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Tài liệu & link ({docs.length})</h2>
          <ul className="divide-y divide-line">
            {docs.map((d) => {
              const meta = metas.get(d.id);
              return (
                <li key={d.id} className={selected?.id === d.id ? 'bg-paper-2' : ''}>
                  <Link href={`?doc=${d.id}`} className="flex gap-2 px-4 py-2.5 hover:bg-paper">
                    <span className="mt-0.5 shrink-0 text-sm" aria-hidden>
                      <Icon name={d.driveFileId ? 'folder' : 'link'} size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium leading-snug">{meta?.name ?? d.title}</span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {d.driveFileId ? (
                          meta ? (
                            <>
                              Google Docs · sửa {new Date(meta.modifiedTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}
                              {meta.lastModifiedBy && <> bởi {meta.lastModifiedBy}</>}
                            </>
                          ) : (
                            'Google Docs'
                          )
                        ) : (
                          hostOf(d.url ?? '')
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {docs.length === 0 && <li className="px-4 py-4 text-sm text-zinc-500">Chưa có tài liệu nào.</li>}
          </ul>
        </section>

        {canEdit && (
          <section className="space-y-2 rounded-2xl border border-line bg-white p-4">
            <h3 className="text-sm font-semibold">Gắn tài liệu có sẵn</h3>
            <AttachLinkForm projectId={id} />
          </section>
        )}
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-line bg-white">
        {selected ? (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">{selectedMeta?.name ?? selected.title}</h2>
                <p className="truncate text-[11px] text-zinc-500">
                  Gắn bởi {nameOf(selected.createdBy)} · {new Date(selected.createdAt).toLocaleDateString('vi-VN')}
                  {selected.url && <> · {selected.url}</>}
                </p>
              </div>
              <a href={openUrl} target="_blank" rel="noreferrer" className="bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">
                {selected.driveFileId ? 'Mở để viết trên Google Docs' : 'Mở link'}
              </a>
              {canEdit && (isOwner || selected.createdBy === user.id) && (
                <form action={unlinkDocAction}>
                  <input type="hidden" name="docId" value={selected.id} />
                  <button className="text-xs text-zinc-400 hover:text-rose-700" title="Chỉ gỡ khỏi app — tài liệu gốc vẫn còn">
                    Gỡ khỏi app
                  </button>
                </form>
              )}
            </header>
            {selected.driveFileId ? (
              <>
                <iframe
                  key={selected.driveFileId}
                  src={docUrl(selected.driveFileId, 'preview')}
                  title={selected.title}
                  className="w-full flex-1"
                  style={{ minHeight: '65vh' }}
                />
                <p className="border-t border-line px-4 py-2 text-[11px] text-zinc-500">
                  Bản xem trước — cần đăng nhập Google bằng tài khoản có quyền xem tài liệu. Google không cho chỉnh sửa Docs nhúng trong trang khác, nên bấm
                  “Mở để viết” để soạn.
                </p>
              </>
            ) : (
              <div className="m-auto max-w-md space-y-3 p-8 text-center text-sm text-zinc-600">
                <p className="text-3xl" aria-hidden>
                  <Icon name="link" size={15} />
                </p>
                <p className="break-all font-mono text-xs">{selected.url}</p>
                <p>Link ngoài được mở ở tab mới (nhiều trang không cho hiển thị bên trong ứng dụng khác).</p>
              </div>
            )}
          </>
        ) : (
          <div className="m-auto max-w-sm p-8 text-center text-sm text-zinc-500">
            Chưa có tài liệu. Dán link Google Docs (bản thảo, đề cương…) hoặc link bất kỳ ở cột bên trái để cả nhóm cùng truy cập từ một chỗ.
          </div>
        )}
      </section>
    </div>
  );
}
