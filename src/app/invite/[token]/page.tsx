import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { getSessionUser } from '@/lib/auth/session';
import { AcceptForm } from './AcceptForm';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!user) {
    return (
      <AuthShell title="Bạn được mời tham gia một dự án" subtitle="Đăng nhập hoặc tạo tài khoản miễn phí để nhận lời mời.">
        <div className="flex gap-2">
          <Link href={`/signup?next=${next}`} className="flex-1 bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700">
            Tạo tài khoản
          </Link>
          <Link href={`/login?next=${next}`} className="flex-1 border border-zinc-900 px-3 py-2 text-center text-sm font-medium hover:bg-paper-2">
            Đăng nhập
          </Link>
        </div>
        <p className="text-xs text-zinc-500">Link mời chỉ dùng được một lần và hết hạn sau 7 ngày.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Bạn được mời tham gia một dự án" subtitle={`Đang đăng nhập: ${user.email}`}>
      <AcceptForm token={token} />
      <p className="text-xs text-zinc-500">
        Không phải bạn?{' '}
        <Link href="/today" className="underline">
          Về trang chính
        </Link>
      </p>
    </AuthShell>
  );
}
