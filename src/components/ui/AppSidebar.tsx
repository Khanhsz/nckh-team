'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { signOutAction } from '@/lib/auth/actions';
import { SIDEBAR_COOKIE } from '@/lib/ui-constants';
import { Avatar } from './badges';

interface Props {
  initialCollapsed: boolean;
  projects: { id: string; code: string | null; name: string }[];
  user: { displayName: string; email: string };
}

const shortCode = (p: { code: string | null; name: string }) =>
  p.code?.trim()
    ? p.code.trim().slice(0, 6).toUpperCase()
    : p.name
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase() || '•';

export function AppSidebar({ initialCollapsed, projects, user }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Ctrl/⌘ + B để đóng/mở
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const item = (href: string, activePrefix: string, icon: ReactNode, label: ReactNode, title: string) => {
    const active = pathname === href || pathname.startsWith(activePrefix);
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? title : undefined}
        aria-label={collapsed ? title : undefined}
        className={`flex items-center gap-2 py-1.5 text-sm ${collapsed ? 'justify-center px-0' : 'px-3'} ${
          active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-paper-2'
        }`}
      >
        {icon}
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-white transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-60'}`}
      aria-label="Điều hướng"
    >
      <div className={`flex items-center border-b border-line py-3 ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {!collapsed && <p className="text-xs font-semibold uppercase tracking-widest text-accent">NCKH Team</p>}
        <button
          onClick={toggle}
          title={collapsed ? 'Mở sidebar (Ctrl/⌘ + B)' : 'Thu gọn sidebar (Ctrl/⌘ + B)'}
          aria-label={collapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
          aria-expanded={!collapsed}
          className="flex h-6 w-6 items-center justify-center border border-line text-xs text-zinc-600 hover:bg-paper-2 hover:text-zinc-900"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className={`flex-1 space-y-4 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-1.5 py-2' : 'p-2'}`}>
        {item('/today', '/today', <span className="w-4 text-center">☀︎</span>, 'Hôm nay của tôi', 'Hôm nay của tôi')}
        <div>
          {!collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Dự án</p>}
          {collapsed && <div className="mx-2 mb-2 border-t border-line" />}
          <div className="space-y-0.5">
            {projects.map((p) =>
              item(
                `/projects/${p.id}/gantt`,
                `/projects/${p.id}/`,
                collapsed ? (
                  <span className="font-mono text-[10px] font-semibold tracking-tight">{shortCode(p)}</span>
                ) : p.code ? (
                  <span className="font-mono text-[11px] opacity-70">{p.code}</span>
                ) : null,
                p.name,
                p.code ? `${p.code} · ${p.name}` : p.name
              )
            )}
            {item('/projects/new', '/projects/new', <span className="w-4 text-center">＋</span>, 'Dự án mới', 'Dự án mới')}
          </div>
        </div>
      </nav>

      <div className={`flex items-center border-t border-line p-3 ${collapsed ? 'flex-col gap-2 px-1' : 'gap-2'}`}>
        <span title={collapsed ? `${user.displayName} · ${user.email}` : undefined}>
          <Avatar name={user.displayName} email={user.email} size={30} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
          </div>
        )}
        <form action={signOutAction}>
          <button className="text-xs text-zinc-500 hover:text-zinc-900" title="Đăng xuất">
            {collapsed ? '⎋' : 'Thoát'}
          </button>
        </form>
      </div>
    </aside>
  );
}
