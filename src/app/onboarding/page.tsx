import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listMyProjects } from '@/lib/data/queries';
import { ROLE_LABEL } from '@/lib/types';
import { OnboardingForm } from '@/components/auth/AuthForms';

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.profile?.onboarded) redirect('/today');
  const projects = await listMyProjects(user.id);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <ol className="flex gap-2 text-xs">
          {['Hồ sơ', projects.length ? 'Vào dự án' : 'Tạo dự án hoặc nhận lời mời'].map((s, i) => (
            <li key={s} className={`flex-1 border-t-2 pt-2 ${i === 0 ? 'border-zinc-900 font-semibold' : 'border-line text-zinc-500'}`}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        <div>
          <h1 className="text-2xl font-semibold">Chào mừng tới NCKH Team 👋</h1>
          <p className="mt-1 text-sm text-zinc-600">Cho nhóm biết bạn là ai — thông tin này chỉ hiện với thành viên cùng dự án.</p>
        </div>

        <OnboardingForm defaultName={user.profile?.displayName ?? ''} />

        {projects.length > 0 && (
          <div className="border border-line bg-white p-4 text-sm">
            <p className="font-medium">Bạn đã là thành viên của</p>
            <ul className="mt-2 space-y-1">
              {projects.map((p) => (
                <li key={p.id}>
                  {p.code && <span className="mr-2 font-mono text-xs text-zinc-500">{p.code}</span>}
                  {p.name} <span className="text-xs text-zinc-500">· {ROLE_LABEL[p.role]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
