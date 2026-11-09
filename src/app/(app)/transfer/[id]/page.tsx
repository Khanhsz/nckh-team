import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { TransferResponse } from '@/components/settings/TransferResponse';

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_ownership_invites');
  const invite = (data ?? []).find((i) => i.id === id);
  const { data: row } = invite ? { data: null } : await supabase.from('ownership_transfers').select('status, project_id').eq('id', id).maybeSingle();

  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      {invite ? (
        <section className="space-y-3 rounded-2xl border border-line bg-white p-5">
          <p className="text-xs  text-zinc-500">Lời mời nhận quyền trưởng nhóm</p>
          <h1 className="text-lg font-semibold">
            {invite.project_code && <span className="mr-2 font-mono text-sm text-zinc-500">{invite.project_code}</span>}
            {invite.project_name}
          </h1>
          <p className="text-sm text-zinc-700">
            <b>{invite.from_name}</b> muốn trao quyền trưởng nhóm cho bạn.
          </p>
          {invite.message && <p className="border-l-2 border-zinc-300 pl-3 text-sm text-zinc-600">{invite.message}</p>}
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-600">
            <li>Bạn sẽ quản lý phân công, mốc, thành viên, cài đặt và danh sách theo dõi của dự án.</li>
            <li>{invite.from_name} chuyển thành thành viên (quyền chỉnh sửa).</li>
            <li>
              Lời mời hết hạn ngày {new Date(invite.expires_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.
            </li>
          </ul>
          <TransferResponse transferId={invite.id} />
        </section>
      ) : (
        <section className="space-y-2 rounded-2xl border border-line bg-white p-5 text-sm">
          <p className="font-medium">
            {row?.status === 'accepted'
              ? 'Lời mời này đã được chấp nhận.'
              : row?.status === 'declined'
                ? 'Lời mời này đã bị từ chối.'
                : row?.status === 'cancelled'
                  ? 'Trưởng nhóm đã huỷ lời mời này.'
                  : 'Không tìm thấy lời mời, hoặc lời mời đã hết hạn / không dành cho tài khoản này.'}
          </p>
          {row?.project_id ? (
            <Link href={`/projects/${row.project_id}/gantt`} className="underline">
              Mở dự án
            </Link>
          ) : (
            <Link href="/today" className="underline">
              Về trang Hôm nay
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
