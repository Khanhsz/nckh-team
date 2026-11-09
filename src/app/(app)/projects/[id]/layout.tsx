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
      <header className="border-b border-line bg-white px-8 pt-6">
        <p className="text-xs text-zinc-500">
          {project.code && <span className="mr-2 font-mono">{project.code}</span>}
          Vai trò của bạn: <b>{ROLE_LABEL[project.role]}</b>
        </p>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 max-w-3xl text-sm text-zinc-600">{project.description}</p>}
        <p className="mt-2 text-xs text-zinc-500">
          {formatFull(project.startDate)} → {formatFull(project.endDate)} · Trưởng nhóm: {owner?.displayName ?? '—'} · {members.length} thành viên
        </p>
        <nav className="mt-4 flex gap-1">
          <NavLink variant="tab" href={`/projects/${id}/gantt`}>Masterplan</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/tasks`}>Công việc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/library`}>Thư viện bài đọc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/writing`}>Bài viết</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/settings`}>Thành viên & cài đặt</NavLink>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
