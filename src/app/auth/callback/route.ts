import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/site';

/**
 * Đích của link trong email (xác nhận đăng ký, đặt lại mật khẩu).
 * Hỗ trợ cả luồng PKCE (?code=) lẫn token_hash (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get('next'), '/today');

  if (searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  return NextResponse.redirect(ok ? `${origin}${next}` : `${origin}/login?error=link`);
}
