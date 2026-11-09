import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { UpdatePasswordForm } from '@/components/auth/AuthForms';
import { getSessionUser } from '@/lib/auth/session';

export default async function UpdatePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?error=link');
  return (
    <AuthShell title="Đặt mật khẩu mới" subtitle={`Tài khoản: ${user.email}`}>
      <UpdatePasswordForm />
    </AuthShell>
  );
}
