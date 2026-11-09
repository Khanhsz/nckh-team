import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';
import { supabaseEnv } from './env';

const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/auth', '/invite', '/api/cron'];
const GUEST_ONLY = ['/login', '/signup', '/forgot-password'];

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + '/'));

/** Làm mới phiên Supabase cho mỗi request và chặn trang cần đăng nhập. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[], headers?: Record<string, string>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        if (headers) Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      }
    }
  });

  // Không chèn code giữa createServerClient và getClaims (theo hướng dẫn Supabase).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, search = '') => {
    const target = request.nextUrl.clone();
    target.pathname = pathname;
    target.search = search;
    const res = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && !matches(path, PUBLIC_PREFIXES)) {
    const next = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return redirectTo('/login', next);
  }
  if (signedIn && matches(path, GUEST_ONLY)) {
    return redirectTo('/today');
  }
  return response;
}
