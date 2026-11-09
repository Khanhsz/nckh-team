import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth/session';
import { listMyProjects } from '@/lib/data/queries';
import { AppSidebar } from '@/components/ui/AppSidebar';
import { SIDEBAR_COOKIE } from '@/lib/ui-constants';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [projects, cookieStore] = await Promise.all([listMyProjects(user.id), cookies()]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed';

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        initialCollapsed={collapsed}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        user={{ displayName: user.profile.displayName, email: user.email }}
      />
      <main className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto rounded-[24px] bg-white">{children}</main>
    </div>
  );
}
