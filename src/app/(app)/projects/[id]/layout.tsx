import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMyOwnershipInvites } from '@/lib/data/queries';
import { TransferResponse } from '@/components/settings/TransferResponse';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { ROLE_LABEL } from '@/lib/types';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [members, invites] = await Promise.all([listMembers(id), listMyOwnershipInvites()]);
  const invite = invites.find((i) => i.project_id === id);
  const owner = members.find((m) => m.role === 'owner');

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line pb-2">
        <ProjectHeader
          project={{
            id: project.id,
            name: project.name,
            code: project.code,
            description: project.description,
            startDate: project.startDate,
            endDate: project.endDate,
            cover: project.cover,
            coverY: project.coverY
          }}
          canEdit={project.role === 'owner'}
          ownerName={owner?.displayName ?? '—'}
          memberCount={members.length}
          roleLabel={ROLE_LABEL[project.role].toLowerCase()}
        />
        <nav className="mx-4 mt-3 flex gap-1 overflow-x-auto" aria-label="Các phần của dự án">
          <NavLink variant="tab" href={`/projects/${id}/gantt`}>Masterplan</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/tasks`}>Công việc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/library`}>Thư viện bài đọc</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/ask`}>Hỏi thư viện</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/writing`}>Bài viết</NavLink>
          <NavLink variant="tab" href={`/projects/${id}/settings`}>Thành viên & cài đặt</NavLink>
        </nav>
      </header>
      {invite && (
        <div className="mx-5 mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>
            <Icon name="crown" size={16} className="mr-1.5 inline -mt-0.5" />
            <b>{invite.from_name}</b> muốn trao quyền trưởng nhóm dự án này cho bạn{invite.message ? ` — “${invite.message}”` : ''}.
          </span>
          <TransferResponse transferId={invite.id} compact />
        </div>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}
