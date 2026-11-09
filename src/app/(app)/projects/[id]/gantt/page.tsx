import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMilestones, listTasks } from '@/lib/data/queries';
import { todayISO } from '@/lib/dates';
import { TimelineCalendar } from '@/components/timeline/TimelineCalendar';


export default async function GanttPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; joined?: string }>;
}) {
  const { id } = await params;
  const { created, joined } = await searchParams;

  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [milestones, tasks, members] = await Promise.all([listMilestones(id), listTasks(id), listMembers(id)]);

  const today = todayISO();
  const done = tasks.filter((t) => t.status === 'done').length;
  const late = tasks.filter((t) => t.status !== 'done' && t.dueDate < today).length;
  const progress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
  const isOwner = project.role === 'owner';

  return (
    <div className="space-y-4 p-8">
      {created && isOwner && (
        <div className="border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          Đã tạo dự án. Bước tiếp theo: vào{' '}
          <Link className="font-semibold underline" href={`/projects/${id}/settings`}>
            Thành viên & cài đặt
          </Link>{' '}
          để tạo link mời nhóm, rồi giao việc ở tab{' '}
          <Link className="font-semibold underline" href={`/projects/${id}/tasks`}>
            Công việc
          </Link>
          .
        </div>
      )}
      {joined && <div className="border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">Bạn đã tham gia dự án 🎉</div>}

      <div className="flex flex-wrap items-center gap-6">
        <Stat label="Tiến độ chung" value={`${progress}%`} />
        <Stat label="Hoàn thành" value={`${done}/${tasks.length}`} />
        <Stat label="Quá hạn" value={String(late)} danger={late > 0} />
      </div>

      {tasks.length === 0 && milestones.length === 0 && project.role === 'viewer' ? (
        <div className="border border-dashed border-zinc-400 bg-white p-8 text-center text-sm text-zinc-600">
          Chưa có mốc hay công việc nào.{' '}
          Trưởng nhóm sẽ lập kế hoạch sớm.
        </div>
      ) : (
        <TimelineCalendar
          project={project}
          milestones={milestones}
          tasks={tasks}
          members={members}
          role={project.role}
          userId={user.id}
          today={today}
        />
      )}

      <p className="text-xs text-zinc-500">
        Mỗi làn là một thành viên; các việc trùng ngày tự xếp thành nhiều tầng. Thêm/sửa mốc ở tab Thành viên & cài đặt. Viền đỏ = quá hạn.
      </p>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-xl font-semibold ${danger ? 'text-rose-700' : ''}`}>{value}</p>
    </div>
  );
}
