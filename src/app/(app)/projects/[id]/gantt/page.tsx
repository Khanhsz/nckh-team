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
  const isOwner = project.role === 'owner';

  return (
    <div className="space-y-2 px-4 pb-2 pt-3">
      {created && isOwner && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
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
      {joined && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">Bạn đã tham gia dự án.</div>}

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

    </div>
  );
}
