import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMilestones, listTasks } from '@/lib/data/queries';
import { canCreateTask, canManage, canUpdateTask } from '@/lib/data/permissions';
import { addDays, dueLabel, formatShort, todayISO } from '@/lib/dates';
import { Avatar } from '@/components/ui/badges';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';
import { AssigneeSelect, ProgressInput, StatusSelect } from '@/components/tasks/TaskControls';
import { deleteTaskAction } from './actions';

export default async function TasksPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mine?: string }>;
}) {
  const { id } = await params;
  const { mine } = await searchParams;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [milestones, tasks, members] = await Promise.all([listMilestones(id), listTasks(id), listMembers(id)]);

  const today = todayISO();
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const manage = canManage(project.role);
  const myCount = tasks.filter((t) => t.assigneeId === user.id).length;
  const visible = mine ? tasks.filter((t) => t.assigneeId === user.id) : tasks;

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
            {visible.map((t) => {
              const assignee = t.assigneeId ? memberById.get(t.assigneeId) : undefined;
              const overdue = t.status !== 'done' && t.dueDate < today;
              const edit = canUpdateTask(project.role, user.id, t);
              const deps = t.dependsOn.map((d) => tasks.find((x) => x.id === d)?.title).filter(Boolean);
              return (
                <tr key={t.id} className="align-top hover:bg-paper/60">
                  <td className="max-w-sm px-3 py-2.5">
                    <p className={`font-medium ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}>{t.title}</p>
                    {deps.length > 0 && <p className="mt-0.5 text-[11px] text-zinc-500">Sau: {deps.join('; ')}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600">{t.milestoneId ? milestoneById.get(t.milestoneId)?.name : '—'}</td>
                  <td className="px-3 py-2.5">
                    {manage ? (
                      <AssigneeSelect taskId={t.id} value={t.assigneeId} members={members} />
                    ) : assignee ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Avatar name={assignee.displayName} email={assignee.email ?? ''} size={20} />
                        {assignee.displayName}
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
                        <button className="text-xs text-zinc-400 hover:text-rose-700" title="Xoá công việc">
                          Xoá
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
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
