import type { ReactNode } from 'react';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-xs font-semibold  text-accent">NCKH Team</p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-sm text-zinc-600">{footer}</div>}
      </div>
    </main>
  );
}

export const inputCls = 'w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary';
export const labelCls = 'mb-1 block text-sm font-medium';
