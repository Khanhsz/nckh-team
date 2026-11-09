import type { TaskCategory, TaskStatus } from '@/lib/types';
import { TASK_STATUS_LABEL } from '@/lib/types';

export const STATUS_STYLE: Record<TaskStatus, { badge: string; bar: string; barFill: string }> = {
  todo: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-300', bar: 'bg-zinc-200', barFill: 'bg-zinc-400' },
  doing: { badge: 'bg-sky-50 text-sky-800 border-sky-300', bar: 'bg-sky-200', barFill: 'bg-sky-600' },
  review: { badge: 'bg-amber-50 text-amber-800 border-amber-300', bar: 'bg-amber-200', barFill: 'bg-amber-500' },
  done: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-300', bar: 'bg-emerald-200', barFill: 'bg-emerald-700' }
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status].badge}`}>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({ value, status }: { value: number; status: TaskStatus }) {
  return (
    <div className={`h-1.5 w-full ${STATUS_STYLE[status].bar}`}>
      <div className={`h-full ${STATUS_STYLE[status].barFill}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function initials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, email, size = 24 }: { name: string; email: string; size?: number }) {
  return (
    <span
      title={name || email}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-800 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name, email)}
    </span>
  );
}

/** Màu theo loại công việc — chỉ hiển thị màu, không ghi chữ trên ô việc. */
export const CATEGORY_STYLE: Record<TaskCategory, { chip: string; fill: string; dot: string }> = {
  task: { chip: 'bg-sky-100 border-sky-300 text-sky-950', fill: 'bg-sky-600', dot: 'bg-sky-500' },
  meeting: { chip: 'bg-violet-100 border-violet-300 text-violet-950', fill: 'bg-violet-600', dot: 'bg-violet-500' },
  data: { chip: 'bg-emerald-100 border-emerald-300 text-emerald-950', fill: 'bg-emerald-600', dot: 'bg-emerald-500' },
  survey: { chip: 'bg-amber-100 border-amber-300 text-amber-950', fill: 'bg-amber-500', dot: 'bg-amber-500' }
};

export function CategoryDot({ category, size = 8 }: { category: TaskCategory; size?: number }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${CATEGORY_STYLE[category].dot}`} style={{ width: size, height: size }} />;
}
