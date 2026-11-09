import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMilestones, listTasks } from '@/lib/data/queries';
import { todayISO } from '@/lib/dates';
import { TASK_STATUS_LABEL, TASK_STATUSES } from '@/lib/types';
import { GanttChart, type GanttZoom } from '@/components/gantt/GanttChart';
import { STATUS_STYLE } from '@/components/ui/badges';

const ZOOMS: { id: GanttZoom; label: string }[] = [
  { id: 'day', label: 'Ngày' },
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' }
];

export default async function GanttPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zoom?: string; created?: string; joined?: string }>;
}) {
  const { id } = await params;
  const { zoom: z, created, joined } = await searchParams;
  const zoom: GanttZoom = z === 'day' || z === 'month' ? z : 'week';

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
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-3 text-[11px] text-zinc-600">
            {TASK_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`h-2.5 w-4 rounded-sm ${STATUS_STYLE[s].barFill}`} />
                {TASK_STATUS_LABEL[s]}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-3 w-px bg-rose-500" /> Hôm nay
            </span>
          </div>
          <div className="flex border border-line bg-white text-xs">
            {ZOOMS.map((zz) => (
              <Link
                key={zz.id}
                href={`?zoom=${zz.id}`}
                className={`px-3 py-1.5 ${zoom === zz.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}
              >
                {zz.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {tasks.length === 0 && milestones.length === 0 && project.role === 'viewer' ? (
        <div className="border border-dashed border-zinc-400 bg-white p-8 text-center text-sm text-zinc-600">
          Chưa có mốc hay công việc nào.{' '}
          Trưởng nhóm sẽ lập kế hoạch sớm.
        </div>
      ) : (
        <GanttChart
          project={project}
          milestones={milestones}
          tasks={tasks}
          members={members}
          zoom={zoom}
          role={project.role}
          userId={user.id}
          today={today}
        />
      )}

      <p className="text-xs text-zinc-500">
        Mũi tên đỏ nét đứt: việc được xếp bắt đầu trước cả việc tiên quyết — nên xem lại kế hoạch. Thêm/sửa mốc ở tab Thành viên & cài đặt.
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
