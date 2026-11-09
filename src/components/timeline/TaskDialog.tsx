'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Member, Milestone, ProjectRole, Task, TaskCategory, TaskStatus } from '@/lib/types';
import { TASK_CATEGORIES, TASK_CATEGORY_LABEL, TASK_STATUS_LABEL, TASK_STATUSES } from '@/lib/types';
import { CATEGORY_STYLE } from '@/components/ui/badges';
import { diffDays, isValidISODate } from '@/lib/dates';
import { createTaskQuickAction, deleteTaskByIdAction, updateTaskAction } from '@/app/(app)/projects/[id]/tasks/actions';

export type DialogState =
  | { mode: 'create'; milestoneId: string | null; startDate: string; dueDate: string; assigneeId?: string | null; title?: string; category?: TaskCategory; parentId?: string | null }
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
  onSaved,
  onOpen
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
  /** Mở hộp thoại khác (vd. tạo subtask từ việc cha) */
  onOpen?: (next: DialogState) => void;
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
  const [category, setCategory] = useState<TaskCategory>(editing?.category ?? (state.mode === 'create' ? state.category ?? 'task' : 'task'));
  const [dependsOn, setDependsOn] = useState<string[]>(editing?.dependsOn ?? []);
  const [parentId, setParentId] = useState<string>(editing ? editing.parentId ?? '' : state.mode === 'create' ? state.parentId ?? '' : '');
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
  const children = editing ? tasks.filter((t) => t.parentId === editing.id) : [];
  // Chỉ 1 cấp: cha phải là việc chính; việc đang có subtask thì không làm subtask được
  const parentCandidates = children.length ? [] : tasks.filter((t) => !t.parentId && t.id !== editing?.id);
  const parentTask = tasks.find((t) => t.id === parentId);
  const noun = parentId ? 'subtask' : 'công việc';

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
        if (category !== editing.category) patch.category = category;
        if ((parentId || null) !== editing.parentId) patch.parentId = parentId || null;
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
          dependsOn,
          category,
          parentId: parentId || null
        });
        if (r.error) return setError(r.error);
        onSaved(`Đã tạo ${parentId ? 'subtask ' : ''}“${title.trim()}”.`);
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
          <h2 className="text-base font-semibold">
            {editing ? (canEdit ? `Sửa ${noun}` : `Chi tiết ${noun}`) : `Tạo ${noun} mới`}
            {parentTask && <span className="mt-0.5 block text-xs font-normal text-zinc-500">↳ thuộc: {parentTask.title}</span>}
          </h2>
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

          {(parentCandidates.length > 0 || parentId) && (
            <div>
              <label className={label}>Thuộc công việc (để biến thành subtask)</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!canEdit} className={field}>
                <option value="">— Không, đây là công việc chính —</option>
                {parentCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    ↳ {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Loại</label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại công việc">
              {TASK_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  disabled={!canEdit}
                  onClick={() => setCategory(c)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs disabled:opacity-60 ${
                    category === c ? 'border-zinc-900 bg-paper-2 font-semibold' : 'border-line bg-white hover:bg-paper'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 rounded-sm ${CATEGORY_STYLE[c].fill}`} />
                  {TASK_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
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

          {editing && !editing.parentId && (
            <div>
              <label className={label}>Subtask ({children.length})</label>
              {children.length > 0 && (
                <ul className="mb-1.5 max-h-32 space-y-0.5 overflow-y-auto border border-line p-1.5 text-xs">
                  {children.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onOpen?.({ mode: 'edit', task: c })}
                        className={`flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-paper-2 ${c.status === 'done' ? 'text-zinc-400 line-through' : ''}`}
                      >
                        <span className={`inline-block h-2 w-2 shrink-0 rounded-full border-2 ${CATEGORY_STYLE[c.category].edge}`} />
                        <span className="truncate">{c.title}</span>
                        <span className="ml-auto shrink-0 text-zinc-500">
                          {TASK_STATUS_LABEL[c.status]} · {c.progress}%
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(isOwner || role === 'editor') && onOpen && (
                <button
                  type="button"
                  onClick={() =>
                    onOpen({
                      mode: 'create',
                      parentId: editing.id,
                      milestoneId: editing.milestoneId,
                      startDate: editing.startDate,
                      dueDate: editing.dueDate,
                      assigneeId: editing.assigneeId,
                      category: editing.category
                    })
                  }
                  className="text-xs text-zinc-600 underline hover:text-zinc-900"
                >
                  + Thêm subtask
                </button>
              )}
            </div>
          )}

          {error && <p className="border border-rose-300 bg-rose-50 p-2 text-sm text-rose-900">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {canEdit && (
              <button type="submit" disabled={pending} className="bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60">
                {pending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : `Tạo ${noun}`}
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900">
              {canEdit ? 'Huỷ' : 'Đóng'}
            </button>
            {editing && isOwner && (
              <span className="ml-auto">
                {confirmDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    {children.length ? `Xoá việc này và ${children.length} subtask?` : 'Xoá việc này?'}
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
