'use client';

import { useState, useTransition } from 'react';
import { TASK_STATUS_LABEL, TASK_STATUSES, type Member, type TaskStatus } from '@/lib/types';
import { AssigneePicker, assigneeValueOf, sameAssignees, type AssigneeValue } from './AssigneePicker';
import {
  updateTaskAction,
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

/** Ô người phụ trách trong bảng công việc: dropdown chọn nhiều người, lưu khi đóng */
export function TaskAssigneeCell({
  taskId,
  task,
  members,
  allowTeam
}: {
  taskId: string;
  task: { isTeam: boolean; assigneeId: string | null; coAssigneeIds: string[] };
  members: Member[];
  allowTeam: boolean;
}) {
  const saved = assigneeValueOf(task);
  const [value, setValue] = useState<AssigneeValue>(saved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (v: AssigneeValue) => {
    if (sameAssignees(v, saved)) return;
    setError(null);
    startTransition(async () => {
      const r = await updateTaskAction(
        taskId,
        v.team ? { isTeam: true } : { isTeam: false, assigneeId: v.ids[0] ?? null, coAssigneeIds: v.ids.slice(1) }
      );
      if (r.error) {
        setError(r.error);
        setValue(saved);
      }
    });
  };

  return (
    <div className={pending ? 'opacity-60' : ''}>
      <AssigneePicker value={value} onChange={setValue} onClose={save} members={members} allowTeam={allowTeam} disabled={pending} compact />
      <ErrorNote error={error} />
    </div>
  );
}
