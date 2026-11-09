'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { Member, Milestone, Task } from '@/lib/types';
import { TASK_CATEGORIES, TASK_CATEGORY_LABEL } from '@/lib/types';
import type { FormState } from '@/lib/auth/actions';
import { createTaskAction } from '@/app/(app)/projects/[id]/tasks/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';

const field = 'w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800';

export function NewTaskForm({
  projectId,
  milestones,
  members,
  tasks,
  isOwner,
  currentUserId,
  defaultStart,
  defaultDue,
  initialParentId
}: {
  projectId: string;
  milestones: Milestone[];
  members: Member[];
  tasks: Task[];
  isOwner: boolean;
  currentUserId: string;
  defaultStart: string;
  defaultDue: string;
  /** Mở sẵn form để thêm subtask cho việc này */
  initialParentId?: string;
}) {
  const parents = tasks.filter((t) => !t.parentId);
  const initialParent = parents.find((t) => t.id === initialParentId);
  const [open, setOpen] = useState(Boolean(initialParent));
  const [parentId, setParentId] = useState(initialParent?.id ?? '');
  const [startDate, setStartDate] = useState(initialParent?.startDate ?? defaultStart);
  const [dueDate, setDueDate] = useState(initialParent?.dueDate ?? defaultDue);
  const parent = parents.find((t) => t.id === parentId);
  const [state, action] = useActionState<FormState, FormData>(createTaskAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
        + Thêm công việc / subtask
      </button>
    );
  }

  return (
    <form ref={formRef} id="new-task" action={action} className="w-full space-y-3 border border-line bg-white p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <label className="text-xs font-medium">Thuộc công việc</label>
        <select
          name="parentId"
          value={parentId}
          onChange={(e) => {
            const p = parents.find((t) => t.id === e.target.value);
            setParentId(e.target.value);
            if (p) {
              setStartDate(p.startDate);
              setDueDate(p.dueDate);
            }
          }}
          className={`${field} max-w-md flex-1`}
        >
          <option value="">— Không (đây là công việc chính) —</option>
          {parents.map((t) => (
            <option key={t.id} value={t.id}>
              ↳ subtask của: {t.title}
            </option>
          ))}
        </select>
        {parent && <span className="text-xs text-zinc-500">Mốc để trống sẽ theo việc cha.</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium">Tên công việc *</label>
          <input name="title" required maxLength={300} className={field} placeholder="vd. Dịch thang đo IWPQ sang tiếng Việt" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium">Thuộc mốc</label>
          <select name="milestoneId" className={field} defaultValue="">
            <option value="">— Chưa gắn mốc —</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Loại</label>
          <select name="category" className={field} defaultValue="task">
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium">Người phụ trách</label>
          {isOwner ? (
            <select name="assigneeId" className={field} defaultValue="">
              <option value="">— Chưa giao —</option>
              {!parent && <option value="__team">👥 Cả nhóm (chia subtask cho từng người)</option>}
              {members
                .filter((m) => m.role !== 'viewer')
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                    {m.userId === currentUserId ? ' (bạn)' : ''}
                  </option>
                ))}
            </select>
          ) : (
            <p className="py-1.5 text-sm text-zinc-600">Bạn (thành viên chỉ tự giao cho mình)</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Bắt đầu *</label>
          <input type="date" name="startDate" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Hạn chót *</label>
          <input type="date" name="dueDate" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium">Làm sau khi xong (Ctrl/⌘ để chọn nhiều)</label>
          <select name="dependsOn" multiple className={`${field} h-24`}>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormMessage error={state.error} message={state.ok ? state.message : undefined} />
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Đang lưu…">{parent ? 'Tạo subtask' : 'Tạo công việc'}</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-600 hover:text-zinc-900">
          Đóng
        </button>
      </div>
    </form>
  );
}
