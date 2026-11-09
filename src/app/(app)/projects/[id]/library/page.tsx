import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listMembers, listPapers } from '@/lib/data/queries';
import { formatFull } from '@/lib/dates';

const STATUS_LABEL: Record<string, string> = { processing: 'Đang trích xuất', completed: 'Đã trích xuất', error: 'Lỗi' };

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [papers, members] = await Promise.all([listPapers(id), listMembers(id)]);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '—';

  return (
    <div className="space-y-4 p-8">
      <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <b>Đang xây dựng.</b> Ma trận tài liệu SciMatrix (trích xuất PDF bằng Gemini) sẽ được chuyển vào đây ở bước tiếp theo. Database đã sẵn sàng:
        bảng <code className="font-mono text-xs">papers</code>, kho lưu PDF riêng tư theo dự án và giới hạn lượt gọi AI mỗi ngày.
      </div>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-paper text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Tài liệu</th>
              <th className="px-3 py-2 font-semibold">Trạng thái</th>
              <th className="px-3 py-2 font-semibold">Người thêm</th>
              <th className="px-3 py-2 font-semibold">Ngày</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {papers.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2.5 font-medium">{p.fileName}</td>
                <td className="px-3 py-2.5 text-xs">{STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-600">{nameOf(p.createdBy)}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-600">{formatFull(p.createdAt.slice(0, 10))}</td>
              </tr>
            ))}
            {papers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-500">
                  Chưa có bài đọc nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
