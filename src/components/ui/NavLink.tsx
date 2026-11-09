'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({
  href,
  activePrefix,
  children,
  variant = 'side'
}: {
  href: string;
  activePrefix?: string;
  children: ReactNode;
  variant?: 'side' | 'tab';
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(activePrefix ?? href + '/');

  if (variant === 'tab') {
    return (
      <Link
        href={href}
        className={`-mb-px border-b-2 px-3 py-2 text-sm ${
          active ? 'border-zinc-900 font-semibold text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'
        }`}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`block px-3 py-1.5 text-sm ${active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-paper-2'}`}
    >
      {children}
    </Link>
  );
}
