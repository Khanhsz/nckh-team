import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/AuthForms';
import { safeNext } from '@/lib/site';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  const signupHref = target !== '/today' ? `/signup?next=${encodeURIComponent(target)}` : '/signup';

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle={target.startsWith('/invite/') ? 'Đăng nhập để tham gia dự án bạn được mời.' : 'Quản lý kế hoạch, công việc và bài đọc của nhóm nghiên cứu.'}
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link href={signupHref} className="font-medium text-zinc-900 underline">
            Đăng ký
          </Link>
        </>
      }
    >
      {error === 'link' && (
        <p className="border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
          Link xác nhận đã hết hạn hoặc được mở trên thiết bị khác. Nếu bạn vừa xác nhận email, hãy đăng nhập bình thường bên dưới.
        </p>
      )}
      <SignInForm next={target} />
    </AuthShell>
  );
}
