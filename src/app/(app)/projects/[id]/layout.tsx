import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers } from '@/lib/data/queries';
import { formatFull } from '@/lib/dates';
import { ROLE_LABEL } from '@/lib/types';
import { NavLink } from '@/components/ui/NavLink';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const members = await listMembers(id);
  const owner = members.find((m) => m.role === 'owner');

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-white px-4 pt-2.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {project.code && <span className="font-mono text-xs text-zinc-500">{project.code}</span>}
          <h1 className="min-w-0 max-w-full truncate text-base font-semibold" title={project.description ?? project.name}>
            {project.name}
          </h1>
          <span className="text-xs text-zinc-500">
            {formatFull(project.startDate)} → {formatFull(project.endDate)} · Trưởng nhóm: {owner?.displayName ?? '—'} · {members.length} thành viên · Vai trò:{' '}
            <b>{ROLE_LABEL[project.role]}</b>
          </span>
        </div>
        <nav className="mt-1.5 flex gap-1 overflow-x-auto">
          <NavLink variant="tab" href={`/projects/${id}/gantt`}>Masterplan</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/tasks`}>Công việc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/library`}>Thư viện bài đọc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/ask`}>Hỏi thư viện</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/writing`}>Bài viết</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/settings`}>Thành viên & cài đặt</NavLink>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
