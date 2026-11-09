import { addDays, todayISO } from '@/lib/dates';
import { NewProjectForm } from './NewProjectForm';

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  const today = todayISO();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{first ? 'Bắt đầu: tạo dự án đầu tiên' : 'Dự án mới'}</h1>
        <p className="mt-1 text-sm text-zinc-600">Bạn sẽ là trưởng nhóm của dự án này và có thể mời thành viên bằng link ở mục Thành viên.</p>
      </div>

      <NewProjectForm defaultStart={today} defaultEnd={addDays(today, 150)} />

      <div className="border border-dashed border-zinc-400 p-4 text-sm text-zinc-700">
        <b>Được mời vào dự án có sẵn?</b> Mở link mời mà trưởng nhóm gửi bạn (dạng <code className="font-mono text-xs">…/invite/abc123…</code>) — bạn sẽ
        được thêm vào dự án ngay, không cần tạo dự án mới.
      </div>
    </div>
  );
}
