import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/AuthForms';

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Quên mật khẩu"
      subtitle="Nhập email, chúng tôi sẽ gửi link để đặt mật khẩu mới."
      footer={
        <Link href="/login" className="underline">
          ← Quay lại đăng nhập
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
