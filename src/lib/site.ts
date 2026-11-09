import 'server-only';
import { headers } from 'next/headers';

/** URL gốc của site — dùng cho link trong email (xác nhận, đặt lại mật khẩu, lời mời). */
export async function getSiteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Chỉ cho phép chuyển hướng nội bộ — chặn open redirect. */
export function safeNext(next: unknown, fallback = '/today'): string {
  const s = typeof next === 'string' ? next : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}
