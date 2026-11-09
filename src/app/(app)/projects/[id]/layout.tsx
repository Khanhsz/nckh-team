import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listMyOwnershipInvites } from '@/lib/data/queries';
import { TransferResponse } from '@/components/settings/TransferResponse';
import { formatFull } from '@/lib/dates';
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
      <header className="border-b border-line px-5 pb-2 pt-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="min-w-0 max-w-full truncate text-[22px] font-normal leading-7 text-ink" title={project.description ?? project.name}>
            {project.code && <span className="mr-2 text-ink-3">{project.code}</span>}
            {project.name}
          </h1>
          <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-3">
            <div>
              <dt className="sr-only">Thời gian</dt>
              <dd>
                {formatFull(project.startDate)} – {formatFull(project.endDate)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Trưởng nhóm</dt>
              <dd className="text-ink-2">{owner?.displayName ?? '—'}</dd>
            </div>
            <div className="flex gap-1">
              <dd className="text-ink-2">{members.length}</dd>
              <dt>thành viên</dt>
            </div>
            <div className="flex gap-1">
              <dt>Bạn là</dt>
              <dd className="text-ink-2">{ROLE_LABEL[project.role].toLowerCase()}</dd>
            </div>
          </dl>
        </div>
        <nav className="-mx-1 mt-3 flex gap-1 overflow-x-auto" aria-label="Các phần của dự án">
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
