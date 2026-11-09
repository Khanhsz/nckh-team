'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { FormState } from '@/lib/auth/actions';
import type { ProjectRole } from '@/lib/types';
import {
  addMilestoneAction,
  addWatchAction,
  createInviteAction,
  setMemberRoleAction,
  updateProjectAction,
  type InviteState
} from '@/app/(app)/projects/[id]/settings/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';

const field = 'w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-primary';
const label = 'mb-1 block text-xs font-medium';

export function ProjectInfoForm({
  project
}: {
  project: { id: string; name: string; code: string | null; description: string; startDate: string; endDate: string };
}) {
  const [state, action] = useActionState<FormState, FormData>(updateProjectAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={project.id} />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-3">
          <label className={label}>Tên dự án</label>
          <input name="name" defaultValue={project.name} required maxLength={160} className={field} />
        </div>
        <div>
          <label className={label}>Mã</label>
          <input name="code" defaultValue={project.code ?? ''} maxLength={20} className={`${field} font-mono uppercase`} />
        </div>
      </div>
      <div>
        <label className={label}>Mô tả</label>
        <textarea name="description" defaultValue={project.description} rows={2} maxLength={2000} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Bắt đầu</label>
          <input type="date" name="startDate" defaultValue={project.startDate} required className={field} />
        </div>
        <div>
          <label className={label}>Kết thúc</label>
          <input type="date" name="endDate" defaultValue={project.endDate} required className={field} />
        </div>
      </div>
      <FormMessage error={state.error} message={state.ok ? state.message : undefined} />
      <SubmitButton pendingText="Đang lưu…">Lưu thông tin</SubmitButton>
    </form>
  );
}

export function AddMilestoneForm({ projectId, defaultDue }: { projectId: string; defaultDue: string }) {
  const [state, action] = useActionState<FormState, FormData>(addMilestoneAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className={label}>Tên mốc</label>
          <input name="name" required maxLength={200} className={field} placeholder="vd. Nộp đề cương cho GVHD" />
        </div>
        <div>
          <label className={label}>Hạn</label>
          <input type="date" name="dueDate" required defaultValue={defaultDue} className={field} />
        </div>
        <SubmitButton pendingText="…">Thêm mốc</SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}

export function InviteBox({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<InviteState, FormData>(createInviteAction, {});
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [state.link]);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <label className={label}>Mời với vai trò</label>
          <select name="role" defaultValue="editor" className={field}>
            <option value="editor">Thành viên — nhận & cập nhật việc</option>
            <option value="viewer">Người xem — GVHD, chỉ xem</option>
          </select>
        </div>
        <SubmitButton pendingText="Đang tạo…">Tạo link mời</SubmitButton>
      </form>
      <FormMessage error={state.error} />
      {state.link && (
        <div className="space-y-1.5 border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-900">Gửi link này cho <b>một</b> người (qua Zalo/email). Dùng được 1 lần, hết hạn sau 7 ngày.</p>
          <div className="flex gap-2">
            <input readOnly value={state.link} onFocus={(e) => e.target.select()} className={`${field} font-mono text-xs`} />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="shrink-0 border border-ink-3/50 text-primary px-3 text-xs font-medium hover:bg-white"
            >
              {copied ? 'Đã copy ✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MemberRoleSelect({ projectId, userId, role }: { projectId: string; userId: string; role: ProjectRole }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        key={role}
        defaultValue={role}
        disabled={pending}
        onChange={(e) => {
          const el = e.target;
          setError(null);
          startTransition(async () => {
            const res = await setMemberRoleAction(projectId, userId, el.value as 'editor' | 'viewer');
            if (res.error) {
              setError(res.error);
              el.value = role;
            }
          });
        }}
        className="border border-line bg-white px-1.5 py-1 text-xs"
      >
        <option value="editor">Thành viên</option>
        <option value="viewer">Người xem (GVHD)</option>
      </select>
      {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}

export function AddWatchForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addWatchAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={label}>Loại</label>
          <select name="kind" defaultValue="publisher" className={field}>
            <option value="publisher">Nhà xuất bản</option>
            <option value="journal">Tạp chí</option>
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label className={label}>Tên</label>
          <input name="name" required maxLength={300} className={field} placeholder="vd. MDPI, Frontiers, Hindawi" />
        </div>
        <div className="min-w-48 flex-[2]">
          <label className={label}>Ghi chú lý do (tuỳ chọn)</label>
          <input name="note" maxLength={500} className={field} placeholder="vd. mega-journal, review nhanh — ưu tiên nguồn khác" />
        </div>
        <SubmitButton pendingText="…">Thêm</SubmitButton>
      </div>
      <FormMessage error={state.error} message={state.ok ? state.message : undefined} />
    </form>
  );
}
