'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Member, Milestone, ProjectRole, Task, TaskStatus } from '@/lib/types';
import { TASK_STATUS_LABEL, TASK_STATUSES } from '@/lib/types';
import { diffDays, isValidISODate } from '@/lib/dates';
import { createTaskQuickAction, deleteTaskByIdAction, updateTaskAction } from '@/app/(app)/projects/[id]/tasks/actions';

export type DialogState =
  | { mode: 'create'; milestoneId: string | null; startDate: string; dueDate: string; assigneeId?: string | null; title?: string }
  | { mode: 'edit'; task: Task };

const field = 'w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800 disabled:bg-paper-2 disabled:text-zinc-500';
const label = 'mb-1 block text-xs font-medium text-zinc-700';

export function TaskDialog({
  state,
  projectId,
  role,
  userId,
  members,
  milestones,
  tasks,
  onClose,
  onSaved
}: {
  state: DialogState;
  projectId: string;
  role: ProjectRole;
  userId: string;
  members: Member[];
  milestones: Milestone[];
  tasks: Task[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isOwner = role === 'owner';
  const editing = state.mode === 'edit' ? state.task : null;
  const canEdit = isOwner || (role === 'editor' && (!editing || editing.assigneeId === userId));

  const [title, setTitle] = useState(editing?.title ?? (state.mode === 'create' ? state.title ?? '' : ''));
  const [milestoneId, setMilestoneId] = useState<string>(editing ? editing.milestoneId ?? '' : state.mode === 'create' ? state.milestoneId ?? '' : '');
  const [assigneeId, setAssigneeId] = useState<string>(
    editing ? editing.assigneeId ?? '' : !isOwner ? userId : state.mode === 'create' && state.assigneeId ? state.assigneeId : ''
  );
  const [startDate, setStartDate] = useState(editing?.startDate ?? (state.mode === 'create' ? state.startDate : ''));
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? (state.mode === 'create' ? state.dueDate : ''));
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'todo');
  const [dependsOn, setDependsOn] = useState<string[]>(editing?.dependsOn ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const days = isValidISODate(startDate) && isValidISODate(dueDate) ? diffDays(startDate, dueDate) + 1 : null;
  const assignable = members.filter((m) => m.role !== 'viewer');
  const depCandidates = tasks.filter((t) => t.id !== editing?.id);

  const save = () => {
    setError(null);
    if (!title.trim()) return setError('Nhập tên công việc.');
    if (!days || days < 1) return setError('Hạn chót phải sau hoặc bằng ngày bắt đầu.');
    start(async () => {
      if (editing) {
        const patch: Parameters<typeof updateTaskAction>[1] = {};
        if (title !== editing.title) patch.title = title;
        if ((milestoneId || null) !== editing.milestoneId) patch.milestoneId = milestoneId || null;
        if (isOwner && (assigneeId || null) !== editing.assigneeId) patch.assigneeId = assigneeId || null;
        if (startDate !== editing.startDate) patch.startDate = startDate;
        if (dueDate !== editing.dueDate) patch.dueDate = dueDate;
        if (status !== editing.status) patch.status = status;
        if (dependsOn.join() !== editing.dependsOn.join()) patch.dependsOn = dependsOn;
        const r = await updateTaskAction(editing.id, patch);
        if (r.error) return setError(r.error);
        onSaved(`Đã lưu “${title.trim()}”.`);
      } else {
        const r = await createTaskQuickAction(projectId, {
          title,
          milestoneId: milestoneId || null,
          assigneeId: assigneeId || null,
          startDate,
          dueDate,
          dependsOn
        });
        if (r.error) return setError(r.error);
        onSaved(`Đã tạo “${title.trim()}”.`);
      }
    });
  };

  const remove = () => {
    if (!editing) return;
    start(async () => {
      const r = await deleteTaskByIdAction(editing.id);
      if (r.error) return setError(r.error);
      onSaved(`Đã xoá “${editing.title}”.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={editing ? 'Sửa công việc' : 'Tạo công việc'} className="w-full max-w-lg space-y-4 border border-zinc-900 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{editing ? (canEdit ? 'Sửa công việc' : 'Chi tiết công việc') : 'Tạo công việc mới'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900" aria-label="Đóng">
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canEdit) save();
          }}
          className="space-y-3"
        >
          <div>
            <label className={label}>Tên công việc</label>
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} maxLength={300} className={field} placeholder="vd. Dịch thang đo sang tiếng Việt" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Thuộc mốc</label>
              <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={!canEdit} className={field}>
                <option value="">— Chưa gắn mốc —</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Người phụ trách</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!isOwner} className={field}>
                <option value="">— Chưa giao —</option>
                {assignable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                    {m.userId === userId ? ' (bạn)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Bắt đầu</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canEdit} className={field} />
            </div>
            <div>
              <label className={label}>Hạn chót</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!canEdit} className={field} />
            </div>
            <div>
              <label className={label}>Thời lượng</label>
              <p className="py-1.5 text-sm text-zinc-600">{days && days > 0 ? `${days} ngày` : '—'}</p>
            </div>
          </div>

          {editing && (
            <div>
              <label className={label}>Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={!canEdit} className={field}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === 'done' && !isOwner && editing.status !== 'done'}>
                    {TASK_STATUS_LABEL[s]}
                    {s === 'done' && !isOwner ? ' (trưởng nhóm xác nhận)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {depCandidates.length > 0 && (
            <div>
              <label className={label}>Làm sau khi xong ({dependsOn.length} việc)</label>
              <select
                multiple
                value={dependsOn}
                onChange={(e) => setDependsOn(Array.from(e.target.selectedOptions).map((o) => o.value))}
                disabled={!canEdit}
                className={`${field} h-24`}
              >
                {depCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[11px] text-zinc-500">Giữ Ctrl (⌘ trên Mac) để chọn nhiều.</p>
            </div>
          )}

          {error && <p className="border border-rose-300 bg-rose-50 p-2 text-sm text-rose-900">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {canEdit && (
              <button type="submit" disabled={pending} className="bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60">
                {pending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo công việc'}
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900">
              {canEdit ? 'Huỷ' : 'Đóng'}
            </button>
            {editing && isOwner && (
              <span className="ml-auto">
                {confirmDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    Xoá việc này?
                    <button type="button" onClick={remove} disabled={pending} className="font-semibold text-rose-700 underline">
                      Xoá
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="underline">
                      Không
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-zinc-400 hover:text-rose-700">
                    Xoá công việc
                  </button>
                )}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
