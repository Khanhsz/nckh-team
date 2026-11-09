import type { ReactNode } from 'react';
import { signOutAction } from '@/lib/auth/actions';
import { requireUser } from '@/lib/auth/session';
import { listMyProjects } from '@/lib/data/queries';
import { NavLink } from '@/components/ui/NavLink';
import { Avatar } from '@/components/ui/badges';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const projects = await listMyProjects(user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">NCKH Team</p>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          <NavLink href="/today">☀︎ Hôm nay của tôi</NavLink>
          <div>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Dự án</p>
            <div className="space-y-0.5">
              {projects.map((p) => (
                <NavLink key={p.id} href={`/projects/${p.id}/gantt`} activePrefix={`/projects/${p.id}/`}>
                  {p.code && <span className="mr-1.5 font-mono text-[11px] opacity-70">{p.code}</span>}
                  <span>{p.name}</span>
                </NavLink>
              ))}
              <NavLink href="/projects/new">＋ Dự án mới</NavLink>
            </div>
          </div>
        </nav>

        <div className="flex items-center gap-2 border-t border-line p-3">
          <Avatar name={user.profile.displayName} email={user.email} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.profile.displayName}</p>
            <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
          </div>
          <form action={signOutAction}>
            <button className="text-xs text-zinc-500 hover:text-zinc-900" title="Đăng xuất">
              Thoát
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
