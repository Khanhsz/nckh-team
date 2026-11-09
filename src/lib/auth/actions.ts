'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { authErrorMessage, dbErrorMessage } from '../errors';
import { getSiteUrl, safeNext, str } from '../site';
import { countMyProjects } from '../data/queries';
import { getSessionUser } from './session';

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const next = safeNext(fd.get('next'));
  if (!EMAIL_RE.test(email) || !password) return { error: 'Nhập email và mật khẩu.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error) };
  redirect(next);
}

export async function signUpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const fullName = str(fd, 'fullName');
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  const next = safeNext(fd.get('next'), '/onboarding');

  if (fullName.length < 2) return { error: 'Vui lòng nhập họ tên.' };
  if (!EMAIL_RE.test(email)) return { error: 'Email không hợp lệ.' };
  if (password.length < 8) return { error: 'Mật khẩu cần ít nhất 8 ký tự.' };
  if (password !== confirm) return { error: 'Hai lần nhập mật khẩu không khớp.' };

  const supabase = await createClient();
  const site = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });
  if (error) return { error: authErrorMessage(error) };

  // Dự án tắt "Confirm email" → có phiên ngay, vào onboarding luôn
  if (data.session) redirect(next);

  return {
    ok: true,
    message: `Đã gửi email kích hoạt tới ${email}. Mở email và bấm link để hoàn tất đăng ký (nhớ kiểm tra mục Spam).`
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Email không hợp lệ.' };
  const supabase = await createClient();
  const site = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`
  });
  if (error && /rate limit/i.test(error.message)) return { error: authErrorMessage(error) };
  // Luôn trả cùng một thông báo để không lộ email nào đã đăng ký
  return { ok: true, message: `Nếu ${email} đã có tài khoản, bạn sẽ nhận được email đặt lại mật khẩu trong ít phút.` };
}

export async function updatePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get('password') ?? '');
  const confirm = String(fd.get('confirm') ?? '');
  if (password.length < 8) return { error: 'Mật khẩu cần ít nhất 8 ký tự.' };
  if (password !== confirm) return { error: 'Hai lần nhập mật khẩu không khớp.' };
  const user = await getSessionUser();
  if (!user) return { error: 'Link đặt lại mật khẩu đã hết hạn. Hãy yêu cầu link mới.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: authErrorMessage(error) };
  redirect('/today?pw=1');
}

export async function completeOnboardingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const displayName = str(fd, 'displayName');
  if (displayName.length < 2 || displayName.length > 120) return { error: 'Vui lòng nhập họ tên (2–120 ký tự).' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      student_id: str(fd, 'studentId').slice(0, 40) || null,
      research_interest: str(fd, 'researchInterest').slice(0, 300) || null,
      phone: str(fd, 'phone').slice(0, 40) || null,
      onboarded: true
    })
    .eq('id', user.id)
    .select('id');
  if (error || !data?.length) return { error: dbErrorMessage(error, 'Không lưu được hồ sơ, vui lòng thử lại.') };

  const projects = await countMyProjects(user.id);
  redirect(projects > 0 ? '/today?welcome=1' : '/projects/new?first=1');
}
