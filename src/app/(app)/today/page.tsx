import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getNotifySettings, listMyOwnershipInvites, listMyProjects, listTasksAndMilestonesFor } from '@/lib/data/queries';
import { TransferResponse } from '@/components/settings/TransferResponse';
import { ReminderCard } from '@/components/notify/ReminderCard';
import { smtpConfigured } from '@/lib/mail/smtp';
import { getSiteUrl } from '@/lib/site';
import { addDays, dueLabel, formatShort, todayISO } from '@/lib/dates';
import { isAssignedTo, projectLabel, ROLE_LABEL, type ProjectWithRole, type Task } from '@/lib/types';
import { ProgressBar, StatusBadge } from '@/components/ui/badges';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ welcome?: string; pw?: string }> }) {
  const { welcome, pw } = await searchParams;
  const user = await requireUser();
  const projects = await listMyProjects(user.id);
  const [{ tasks, milestones }, notify, site, invites] = await Promise.all([
    listTasksAndMilestonesFor(projects.map((p) => p.id)),
    getNotifySettings(user.id),
    getSiteUrl(),
    listMyOwnershipInvites()
  ]);

  const today = todayISO();
  const in7 = addDays(today, 7);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const mine = tasks.filter((t) => isAssignedTo(t, user.id) && t.status !== 'done');

  const overdue = mine.filter((t) => t.dueDate < today);
  const soon = mine.filter((t) => t.dueDate >= today && t.dueDate <= in7);
  const later = mine.filter((t) => t.dueDate > in7 && t.status === 'doing');
  const toReview = tasks.filter((t) => t.status === 'review' && byId.get(t.projectId)?.role === 'owner' && t.assigneeId !== user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      {welcome && (
        <Notice tone="emerald">Hồ sơ đã lưu. Mở Masterplan của dự án để nắm tiến độ chung; việc được giao cho bạn sẽ hiện ở trang này.</Notice>
      )}
      {pw && <Notice tone="emerald">Đã đổi mật khẩu.</Notice>}

      {invites.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            👑 <b>{i.from_name}</b> muốn trao quyền trưởng nhóm dự án <b>{i.project_name}</b> cho bạn{i.message ? ` — “${i.message}”` : ''}.
          </span>
          <TransferResponse transferId={i.id} compact />
        </div>
      ))}

      <header>
        <p className="text-sm text-zinc-500">Hôm nay, {formatShort(today)}</p>
        <h1 className="text-2xl font-semibold">Chào {user.profile.displayName.split(' ').pop()} 👋</h1>
      </header>

      {projects.length === 0 ? (
        <div className="border border-line bg-white p-6">
          <p className="font-medium">Bạn chưa tham gia dự án nào.</p>
          <p className="mt-1 text-sm text-zinc-600">Tạo dự án mới (bạn sẽ là trưởng nhóm), hoặc mở link mời mà trưởng nhóm gửi cho bạn.</p>
          <Link href="/projects/new" className="mt-4 inline-block bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            ＋ Tạo dự án
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <TaskSection title="Quá hạn" tone="border-t-rose-500" tasks={overdue} projects={byId} empty="Không có việc quá hạn 🎉" />
            <TaskSection title="Đến hạn trong 7 ngày" tone="border-t-amber-500" tasks={soon} projects={byId} empty="Tuần này thong thả." />
            <TaskSection title="Đang làm (hạn xa hơn)" tone="border-t-zinc-400" tasks={later} projects={byId} empty="—" />
            {toReview.length > 0 && (
              <TaskSection title="Chờ bạn duyệt" tone="border-t-sky-500" tasks={toReview} projects={byId} empty="—" />
            )}
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">Dự án của bạn</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {projects.map((p) => {
                const pt = tasks.filter((t) => t.projectId === p.id);
                const progress = pt.length ? Math.round(pt.reduce((s, t) => s + t.progress, 0) / pt.length) : 0;
                const next = milestones.find((m) => m.projectId === p.id && m.dueDate >= today);
                const late = pt.filter((t) => t.status !== 'done' && t.dueDate < today).length;
                return (
                  <Link key={p.id} href={`/projects/${p.id}/gantt`} className="block border border-line bg-white p-4 hover:border-zinc-400">
                    <p className="text-xs text-zinc-500">
                      {p.code && <span className="mr-2 font-mono">{p.code}</span>}
                      {ROLE_LABEL[p.role]}
                    </p>
                    <p className="font-medium">{p.name}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar value={progress} status={progress === 100 ? 'done' : 'doing'} />
                      </div>
                      <span className="text-sm font-semibold">{progress}%</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">
                      {next ? (
                        <>
                          Mốc tiếp theo: <b>{next.name}</b> · {dueLabel(next.dueDate, today).toLowerCase()}
                        </>
                      ) : pt.length === 0 ? (
                        'Chưa có công việc'
                      ) : (
                        'Đã qua mọi mốc'
                      )}
                      {late > 0 && <span className="ml-2 text-rose-700">· {late} việc quá hạn</span>}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      <div id="reminders" className="scroll-mt-4">
        <ReminderCard
          calendarUrl={notify.calendarToken ? `${site}/api/calendar/${notify.calendarToken}.ics` : null}
          digest={notify.digestEmail}
          smtpReady={smtpConfigured()}
          email={user.email}
        />
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'emerald'; children: ReactNode }) {
  return <div className={`border p-4 text-sm ${tone === 'emerald' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : ''}`}>{children}</div>;
}

function TaskSection({
  title,
  tone,
  tasks,
  projects,
  empty
}: {
  title: string;
  tone: string;
  tasks: Task[];
  projects: Map<string, ProjectWithRole>;
  empty: string;
}) {
  return (
    <section className={`border border-line border-t-2 bg-white ${tone}`}>
      <h2 className="flex items-center justify-between px-4 pt-3 text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-zinc-500">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((t) => {
            const p = projects.get(t.projectId);
            return (
              <li key={t.id}>
                <Link href={`/projects/${t.projectId}/tasks`} className="block space-y-1.5 px-4 py-3 hover:bg-paper">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-zinc-500">
                    {p && <span className="font-mono">{projectLabel(p)}</span>} · {dueLabel(t.dueDate)} ({formatShort(t.dueDate)})
                  </p>
                  <ProgressBar value={t.progress} status={t.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
