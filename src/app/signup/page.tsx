import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignUpForm } from '@/components/auth/AuthForms';
import { safeNext } from '@/lib/site';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next, '/onboarding');
  const loginHref = target !== '/onboarding' ? `/login?next=${encodeURIComponent(target)}` : '/login';

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Miễn phí. Sau khi đăng ký, bạn có thể tạo dự án riêng hoặc tham gia dự án qua link mời."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link href={loginHref} className="font-medium text-zinc-900 underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <SignUpForm next={target} />
    </AuthShell>
  );
}
