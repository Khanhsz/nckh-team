'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  completeOnboardingAction,
  forgotPasswordAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type FormState
} from '@/lib/auth/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';
import { inputCls, labelCls } from './AuthShell';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={labelCls} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label className="text-sm font-medium" htmlFor="password">Mật khẩu</label>
          <Link href="/forgot-password" className="text-xs text-zinc-500 underline hover:text-zinc-900">
            Quên mật khẩu?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang đăng nhập…">Đăng nhập</SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, {});
  if (state.ok) return <FormMessage message={state.message} />;
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={labelCls} htmlFor="fullName">Họ và tên</label>
        <input id="fullName" name="fullName" autoComplete="name" required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="password">Mật khẩu (ít nhất 8 ký tự)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="confirm">Nhập lại mật khẩu</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang tạo tài khoản…">Tạo tài khoản</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  if (state.ok) return <FormMessage message={state.message} />;
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <label className={labelCls} htmlFor="email">Email đã đăng ký</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang gửi…">Gửi link đặt lại mật khẩu</SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePasswordAction, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <label className={labelCls} htmlFor="password">Mật khẩu mới</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="confirm">Nhập lại</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang lưu…">Lưu mật khẩu mới</SubmitButton>
    </form>
  );
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState<FormState, FormData>(completeOnboardingAction, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <label className={labelCls} htmlFor="displayName">
          Họ và tên <span className="text-rose-600">*</span>
        </label>
        <input id="displayName" name="displayName" defaultValue={defaultName} required maxLength={120} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="studentId">MSSV / Mã cán bộ</label>
          <input id="studentId" name="studentId" maxLength={40} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="phone">SĐT / Zalo</label>
          <input id="phone" name="phone" maxLength={40} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="researchInterest">Mảng nghiên cứu / phụ trách</label>
        <input id="researchInterest" name="researchInterest" maxLength={300} placeholder="vd. Hành vi tổ chức, xử lý dữ liệu SEM…" className={inputCls} />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang lưu…">Tiếp tục</SubmitButton>
    </form>
  );
}
