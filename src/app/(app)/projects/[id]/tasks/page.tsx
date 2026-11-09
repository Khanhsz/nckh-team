import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMilestones, listTasks } from '@/lib/data/queries';
import { canCreateTask, canManage, canUpdateTask } from '@/lib/data/permissions';
import { addDays, dueLabel, formatShort, todayISO } from '@/lib/dates';
import { Avatar, CategoryDot, SubtaskMark } from '@/components/ui/badges';
import { isAssignedTo, TASK_CATEGORY_LABEL } from '@/lib/types';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';
import { AssigneeSelect, CoAssigneePicker, ProgressInput, StatusSelect } from '@/components/tasks/TaskControls';
import { deleteTaskAction } from './actions';

export default async function TasksPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mine?: string; sub?: string }>;
}) {
  const { id } = await params;
  const { mine, sub } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [milestones, tasks, members] = await Promise.all([listMilestones(id), listTasks(id), listMembers(id)]);

  const today = todayISO();
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const manage = canManage(project.role);
  const myCount = tasks.filter((t) => isAssignedTo(t, user.id)).length;
  const visible = mine ? tasks.filter((t) => isAssignedTo(t, user.id)) : tasks;
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Gom subtask ngay dưới việc cha (1 cấp). Subtask có cha bị lọc mất thì hiện riêng kèm tên cha.
  const allChildren = new Map<string, typeof tasks>();
  for (const t of tasks) if (t.parentId) allChildren.set(t.parentId, [...(allChildren.get(t.parentId) ?? []), t]);
  const visibleIds = new Set(visible.map((t) => t.id));
  const rows: { t: (typeof tasks)[number]; sub: boolean; orphan: boolean }[] = [];
  for (const t of visible) {
    if (t.parentId && visibleIds.has(t.parentId)) continue;
    rows.push({ t, sub: Boolean(t.parentId), orphan: Boolean(t.parentId) });
    for (const c of allChildren.get(t.id) ?? []) if (visibleIds.has(c.id)) rows.push({ t: c, sub: true, orphan: false });
  }
  const subHref = (taskId: string) => `?${mine ? 'mine=1&' : ''}sub=${taskId}#new-task`;

  return (
    <div className="space-y-4 p-8">
      <div className="flex flex-wrap items-center gap-3">
        {canCreateTask(project.role) ? (
          <NewTaskForm
            projectId={id}
            milestones={milestones}
            members={members}
            tasks={tasks}
            isOwner={manage}
            currentUserId={user.id}
            defaultStart={today}
            defaultDue={addDays(today, 7)}
            initialParentId={sub}
            key={sub ?? 'new'}
          />
        ) : (
          <p className="text-sm text-zinc-500">Bạn đang ở chế độ chỉ xem.</p>
        )}
        <div className="ml-auto flex border border-line bg-white text-xs">
          <a href="?" className={`px-3 py-1.5 ${!mine ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}>
            Tất cả ({tasks.length})
          </a>
          <a href="?mine=1" className={`px-3 py-1.5 ${mine ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}>
            Của tôi ({myCount})
          </a>
        </div>
      </div>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-paper text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Công việc</th>
              <th className="px-3 py-2 font-semibold">Mốc</th>
              <th className="px-3 py-2 font-semibold">Phụ trách</th>
              <th className="px-3 py-2 font-semibold">Thời gian</th>
              <th className="px-3 py-2 font-semibold">Tiến độ</th>
              <th className="px-3 py-2 font-semibold">Trạng thái</th>
              {manage && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ t, sub: isSub, orphan }) => {
              const kids = allChildren.get(t.id) ?? [];
              const kidsDone = kids.filter((k) => k.status === 'done').length;
              const kidsAvg = kids.length ? Math.round(kids.reduce((s, k) => s + k.progress, 0) / kids.length) : 0;
              const assignee = t.assigneeId ? memberById.get(t.assigneeId) : undefined;
              const overdue = t.status !== 'done' && t.dueDate < today;
              const edit = canUpdateTask(project.role, user.id, t);
              const deps = t.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title).filter(Boolean);
              return (
                <tr key={t.id} className={`align-top hover:bg-paper/60 ${isSub && !orphan ? 'bg-paper/30' : ''}`}>
                  <td className={`max-w-sm py-2.5 pr-3 ${isSub && !orphan ? 'pl-8' : 'pl-3'}`}>
                    <p
                      className={`flex items-center gap-2 ${isSub ? 'text-[13px]' : 'font-medium'} ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}
                      title={`${isSub ? 'Subtask · ' : ''}${TASK_CATEGORY_LABEL[t.category]}`}
                    >
                      {isSub ? <SubtaskMark category={t.category} /> : <CategoryDot category={t.category} />}
                      {t.isTeam && <span title="Việc của cả nhóm">👥</span>}
                      {t.title}
                    </p>
                    {orphan && t.parentId && <p className="mt-0.5 text-[11px] text-zinc-500">Subtask của: {taskById.get(t.parentId)?.title ?? '—'}</p>}
                    {kids.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-zinc-500" title="Tiến độ trung bình các subtask">
                        ☰ {kidsDone}/{kids.length} subtask xong · TB {kidsAvg}%
                      </p>
                    )}
                    {deps.length > 0 && <p className="mt-0.5 text-[11px] text-zinc-500">Sau: {deps.join('; ')}</p>}
                    {!isSub && canCreateTask(project.role) && (
                      <a href={subHref(t.id)} className="mt-0.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-900 hover:underline">
                        + Subtask
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600">{t.milestoneId ? milestoneById.get(t.milestoneId)?.name : '—'}</td>
                  <td className="px-3 py-2.5">
                    {manage ? (
                      <>
                        <AssigneeSelect taskId={t.id} value={t.isTeam ? '__team' : t.assigneeId} members={members} allowTeam={!t.parentId} />
                        {!t.isTeam && t.assigneeId && (
                          <CoAssigneePicker key={t.coAssigneeIds.join()} taskId={t.id} primaryId={t.assigneeId} value={t.coAssigneeIds} members={members} />
                        )}
                      </>
                    ) : t.isTeam ? (
                      <span className="text-xs font-medium">👥 Cả nhóm</span>
                    ) : assignee ? (
                      <span className="flex flex-col gap-1 text-xs">
                        {[assignee, ...t.coAssigneeIds.map((id) => memberById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))].map((m, i) => (
                          <span key={m.userId} className="flex items-center gap-1.5">
                            <Avatar name={m.displayName} email={m.email ?? ''} size={20} />
                            {m.displayName}
                            {i === 0 && t.coAssigneeIds.length > 0 && <span className="text-[10px] text-zinc-400">(chính)</span>}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">Chưa giao</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {formatShort(t.startDate)} → {formatShort(t.dueDate)}
                    {t.status !== 'done' && (
                      <span className={`block ${overdue ? 'font-semibold text-rose-700' : 'text-zinc-500'}`}>{dueLabel(t.dueDate, today)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <ProgressInput taskId={t.id} value={t.progress} status={t.status} disabled={!edit || t.status === 'done'} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusSelect taskId={t.id} value={t.status} disabled={!edit} />
                  </td>
                  {manage && (
                    <td className="px-3 py-2.5 text-right">
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <button className="text-xs text-zinc-400 hover:text-rose-700" title={kids.length ? `Xoá công việc và ${kids.length} subtask` : 'Xoá công việc'}>
                          Xoá
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Chưa có công việc nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Quy trình: thành viên cập nhật tiến độ → chuyển “Chờ duyệt” → trưởng nhóm xác nhận “Hoàn thành”. Quyền được kiểm tra trực tiếp trong database,
        nên không ai sửa được việc của người khác kể cả khi gọi API thẳng.
      </p>
    </div>
  );
}
