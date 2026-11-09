'use client';

import { useState, useTransition } from 'react';
import { TASK_STATUS_LABEL, TASK_STATUSES, type Member, type TaskStatus } from '@/lib/types';
import {
  updateTaskAction,
  updateTaskAssigneeAction,
  updateTaskProgressAction,
  updateTaskStatusAction
} from '@/app/(app)/projects/[id]/tasks/actions';

function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="mt-1 max-w-52 text-[11px] leading-tight text-rose-700">{error}</p> : null;
}

export function StatusSelect({ taskId, value, disabled }: { taskId: string; value: TaskStatus; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        aria-label="Trạng thái"
        key={value}
        defaultValue={value}
        disabled={disabled || pending}
        onChange={(e) => {
          const el = e.target;
          const next = el.value as TaskStatus;
          setError(null);
          startTransition(async () => {
            const res = await updateTaskStatusAction(taskId, next);
            if (res.error) {
              setError(res.error);
              el.value = value;
            }
          });
        }}
        className="border border-line bg-white px-1.5 py-1 text-xs disabled:opacity-60"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ErrorNote error={error} />
    </div>
  );
}

export function ProgressInput({ taskId, value, status, disabled }: { taskId: string; value: number; status: TaskStatus; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (v === value) return;
    startTransition(async () => {
      const res = await updateTaskProgressAction(taskId, v, status);
      if (res.error) {
        setError(res.error);
        setV(value);
      }
    });
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={v}
          disabled={disabled || pending}
          onChange={(e) => setV(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          className="w-20 accent-zinc-900 disabled:opacity-50"
          aria-label="Tiến độ"
        />
        <span className="w-9 text-right text-xs tabular-nums text-zinc-600">{v}%</span>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

/** value = '__team' nghĩa là việc của cả nhóm; allowTeam = false cho subtask */
export function AssigneeSelect({ taskId, value, members, allowTeam = true }: { taskId: string; value: string | null; members: Member[]; allowTeam?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        aria-label="Người phụ trách"
        key={value ?? 'none'}
        defaultValue={value ?? ''}
        disabled={pending}
        onChange={(e) => {
          const el = e.target;
          setError(null);
          startTransition(async () => {
            const res = await updateTaskAssigneeAction(taskId, el.value || null);
            if (res.error) {
              setError(res.error);
              el.value = value ?? '';
            }
          });
        }}
        className="max-w-40 border border-line bg-white px-1.5 py-1 text-xs"
      >
        <option value="">— Chưa giao —</option>
        {allowTeam && <option value="__team">👥 Cả nhóm</option>}
        {members
          .filter((m) => m.role !== 'viewer')
          .map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
      </select>
      <ErrorNote error={error} />
    </div>
  );
}

/** Chọn người cùng làm (ngoài người phụ trách chính) — chỉ trưởng nhóm */
export function CoAssigneePicker({
  taskId,
  primaryId,
  value,
  members
}: {
  taskId: string;
  primaryId: string | null;
  value: string[];
  members: Member[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>(value);
  const options = members.filter((m) => m.role !== 'viewer' && m.userId !== primaryId);
  const names = sel.map((id) => members.find((m) => m.userId === id)?.displayName).filter(Boolean);

  const toggle = (id: string) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    const prev = sel;
    setSel(next);
    setError(null);
    startTransition(async () => {
      const r = await updateTaskAction(taskId, { coAssigneeIds: next });
      if (r.error) {
        setError(r.error);
        setSel(prev);
      }
    });
  };

  return (
    <details className="relative mt-1">
      <summary className={`cursor-pointer list-none text-[11px] ${sel.length ? 'text-zinc-700' : 'text-zinc-400'} hover:text-zinc-900`}>
        {sel.length ? `+ cùng làm: ${names.join(', ')}` : '+ người cùng làm'}
        {pending && ' …'}
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-52 space-y-0.5 border border-line bg-white p-1.5 shadow-lg">
        {options.length === 0 && <p className="px-1 text-[11px] text-zinc-500">Không còn thành viên nào khác.</p>}
        {options.map((m) => (
          <label key={m.userId} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-xs hover:bg-paper-2">
            <input type="checkbox" checked={sel.includes(m.userId)} onChange={() => toggle(m.userId)} disabled={pending} />
            {m.displayName}
          </label>
        ))}
      </div>
      <ErrorNote error={error} />
    </details>
  );
}
