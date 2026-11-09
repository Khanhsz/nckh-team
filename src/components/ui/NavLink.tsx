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
        aria-current={active ? 'page' : undefined}
        className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
          active ? 'bg-primary-container font-medium text-on-primary-container' : 'text-ink-2 hover:bg-paper-2'
        }`}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`block rounded-full px-4 py-1.5 text-sm ${active ? 'bg-primary-container font-medium text-on-primary-container' : 'text-ink-2 hover:bg-paper-2'}`}
    >
      {children}
    </Link>
  );
}
