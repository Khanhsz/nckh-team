'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, pendingText = 'Đang xử lý…', className = '' }: { children: ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="border border-rose-300 bg-rose-50 p-2.5 text-sm text-rose-900">{error}</p>;
  if (message) return <p className="border border-emerald-300 bg-emerald-50 p-2.5 text-sm text-emerald-900">{message}</p>;
  return null;
}
