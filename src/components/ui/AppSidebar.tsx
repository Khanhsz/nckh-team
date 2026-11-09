'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { signOutAction } from '@/lib/auth/actions';
import { SIDEBAR_COOKIE } from '@/lib/ui-constants';
import { Avatar } from './badges';
import { Icon } from './Icon';

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
        aria-current={active ? 'page' : undefined}
        className={`flex h-9 items-center gap-3 rounded-full text-sm ${collapsed ? 'mx-auto w-10 justify-center' : 'px-4'} ${
          active ? 'bg-primary-container font-medium text-on-primary-container' : 'text-ink-2 hover:bg-paper-2'
        }`}
      >
        {icon}
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <aside className={`flex shrink-0 flex-col transition-[width] duration-150 ${collapsed ? 'w-[68px]' : 'w-64'}`} aria-label="Điều hướng">
      <div className={`flex h-16 items-center gap-2 ${collapsed ? 'justify-center' : 'px-3'}`}>
        <button
          onClick={toggle}
          title={collapsed ? 'Mở thanh bên (Ctrl/⌘ + B)' : 'Thu gọn thanh bên (Ctrl/⌘ + B)'}
          aria-label={collapsed ? 'Mở thanh bên' : 'Thu gọn thanh bên'}
          aria-expanded={!collapsed}
          className="flex h-10 w-10 items-center justify-center text-ink-2 hover:bg-paper-2"
        >
          <Icon name="menu" size={20} />
        </button>
        {!collapsed && (
          <Link href="/today" className="flex items-center gap-2 text-[19px] font-medium tracking-tight text-ink-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[13px] font-semibold text-white">NC</span>
            NCKH Team
          </Link>
        )}
      </div>

      <div className={collapsed ? 'flex justify-center py-2' : 'px-3 py-2'}>
        <Link
          href="/projects/new"
          title="Tạo dự án mới"
          className={`flex items-center gap-3 rounded-2xl bg-white text-sm font-medium text-ink shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] hover:bg-paper-2 ${
            collapsed ? 'h-12 w-12 justify-center' : 'h-14 w-fit pl-4 pr-6'
          }`}
        >
          <Icon name="plus" size={22} className="text-primary" strokeWidth={2} />
          {!collapsed && 'Dự án mới'}
        </Link>
      </div>

      <nav className={`flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-3 pt-3 ${collapsed ? 'px-1' : 'px-3'}`}>
        {item('/today', '/today', <Icon name="today" />, 'Hôm nay của tôi', 'Hôm nay của tôi')}
        <div>
          {!collapsed && <p className="px-4 pb-1.5 text-sm font-medium text-ink-2">Dự án của tôi</p>}
          {collapsed && <div className="mx-3 mb-2 border-t border-line" />}
          <div className="space-y-0.5">
            {projects.map((p) =>
              item(
                `/projects/${p.id}/gantt`,
                `/projects/${p.id}/`,
                collapsed ? (
                  <span className="text-[11px] font-semibold">{shortCode(p).slice(0, 4)}</span>
                ) : (
                  <span className="w-[18px] text-center text-[11px] font-semibold opacity-70">{shortCode(p).slice(0, 2)}</span>
                ),
                p.name,
                p.code ? `${p.code}: ${p.name}` : p.name
              )
            )}
          </div>
        </div>
      </nav>

      <div className={`flex items-center gap-2 p-3 ${collapsed ? 'flex-col px-1' : ''}`}>
        <span title={collapsed ? `${user.displayName} (${user.email})` : undefined}>
          <Avatar name={user.displayName} email={user.email} size={32} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
          </div>
        )}
        <form action={signOutAction}>
          <button className="flex h-9 w-9 items-center justify-center text-ink-3 hover:bg-paper-2 hover:text-ink" title="Đăng xuất" aria-label="Đăng xuất">
            <Icon name="logout" />
          </button>
        </form>
      </div>
    </aside>
  );
}
