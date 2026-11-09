import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getCatalogStatus, getProjectForUser, listMembers, listMilestones, listWatchlist } from '@/lib/data/queries';
import { CatalogManager } from '@/components/settings/CatalogManager';
import { addDays, formatFull, todayISO } from '@/lib/dates';
import { ROLE_LABEL } from '@/lib/types';
import { Avatar } from '@/components/ui/badges';
import { AddMilestoneForm, AddWatchForm, InviteBox, MemberRoleSelect, ProjectInfoForm } from '@/components/settings/SettingsForms';
import { deleteMilestoneAction, removeMemberAction, removeWatchAction } from './actions';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [members, milestones, catalog, watch] = await Promise.all([listMembers(id), listMilestones(id), getCatalogStatus(), listWatchlist(id)]);
  const isOwner = project.role === 'owner';

  return (
    <div className="grid gap-6 p-8 xl:grid-cols-2">
      <Section title={`Thành viên (${members.length})`}>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
              <Avatar name={m.displayName} email={m.email ?? ''} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName} {m.userId === user.id && <span className="text-xs font-normal text-zinc-500">(bạn)</span>}
                </p>
                <p className="truncate text-xs text-zinc-500">{m.email}</p>
              </div>
              {isOwner && m.role !== 'owner' ? (
                <>
                  <MemberRoleSelect projectId={id} userId={m.userId} role={m.role} />
                  <form action={removeMemberAction}>
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="text-xs text-zinc-400 hover:text-rose-700">Gỡ</button>
                  </form>
                </>
              ) : (
                <span className="text-xs text-zinc-600">{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <div className="mt-4 border-t border-line pt-4">
            <InviteBox projectId={id} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">Chỉ trưởng nhóm mới mời được thành viên mới.</p>
        )}
      </Section>

      <Section title="Mốc của dự án">
        <ul className="divide-y divide-line">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="text-accent">◆</span>
              <span className="flex-1">{m.name}</span>
              <span className="text-xs text-zinc-500">{formatFull(m.dueDate)}</span>
              {isOwner && (
                <form action={deleteMilestoneAction}>
                  <input type="hidden" name="milestoneId" value={m.id} />
                  <button className="text-xs text-zinc-400 hover:text-rose-700" title="Xoá mốc (công việc giữ nguyên, chuyển sang 'Chưa gắn mốc')">
                    Xoá
                  </button>
                </form>
              )}
            </li>
          ))}
          {milestones.length === 0 && <li className="py-2 text-sm text-zinc-500">Chưa có mốc.</li>}
        </ul>
        {isOwner && (
          <div className="mt-4 border-t border-line pt-4">
            <AddMilestoneForm projectId={id} defaultDue={addDays(todayISO(), 30)} />
          </div>
        )}
      </Section>

      {isOwner && (
        <Section title="Thông tin dự án">
          <ProjectInfoForm project={project} />
        </Section>
      )}

      <div id="catalog" className="scroll-mt-4 xl:col-span-2">
        <Section title="Danh mục tạp chí — dùng để đánh giá độ tin cậy bài đọc (dùng chung mọi dự án)">
          <CatalogManager status={catalog} canEdit={isOwner} />
          <p className="mt-3 text-[11px] text-zinc-500">
            Hạng Q là xếp hạng của <b>tạp chí</b> theo SCImago (dữ liệu Scopus), không phải của từng bài. Danh sách Beall đã ngừng cập nhật từ 2017 và
            từng gây tranh cãi — chỉ dùng như tín hiệu để kiểm tra thêm, không phải kết luận.
          </p>
        </Section>
      </div>

      <div id="watchlist" className="scroll-mt-4 xl:col-span-2">
        <Section title={`👁 Danh sách theo dõi của nhóm (${watch.length})`}>
          <p className="mb-3 text-xs text-zinc-600">
            Nhà xuất bản / tạp chí nhóm muốn dè chừng (không phải danh sách săn mồi). Bài thuộc danh sách sẽ hiện nhãn <b>👁 Nhóm lưu ý</b> trong Thư viện.
            Nhà xuất bản khớp theo từ (vd. “MDPI” khớp “MDPI AG”); tạp chí khớp đúng tên.
          </p>
          {watch.length > 0 ? (
            <ul className="mb-3 divide-y divide-line border border-line">
              {watch.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-[11px] uppercase tracking-wider text-zinc-500">{w.kind === 'publisher' ? 'NXB' : 'Tạp chí'}</span>
                  <span className="font-medium">{w.name}</span>
                  {w.note && <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={w.note}>— {w.note}</span>}
                  {isOwner && (
                    <form action={removeWatchAction} className="ml-auto">
                      <input type="hidden" name="id" value={w.id} />
                      <button className="text-xs text-zinc-400 hover:text-rose-700">Gỡ</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-zinc-500">Chưa có mục nào.</p>
          )}
          {isOwner ? <AddWatchForm projectId={id} /> : <p className="text-xs text-zinc-500">Chỉ trưởng nhóm sửa được danh sách này.</p>}
        </Section>
      </div>

      <Section title="Phân quyền">
        <ul className="space-y-1.5 text-sm text-zinc-700">
          <li><b>Trưởng nhóm</b> — lập kế hoạch, giao việc cho mọi người, xác nhận “Hoàn thành”, mời/gỡ thành viên.</li>
          <li><b>Thành viên</b> — tạo việc cho chính mình, cập nhật tiến độ việc được giao, gửi “Chờ duyệt”.</li>
          <li><b>Người xem (GVHD)</b> — xem toàn bộ kế hoạch và tiến độ, không chỉnh sửa.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}
