import { Icon } from '@/components/ui/Icon';
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
export const CATEGORY_STYLE: Record<TaskCategory, { chip: string; fill: string; dot: string; sub: string; edge: string }> = {
  // Bảng màu sự kiện kiểu Google Calendar: nền nhạt, chữ đậm cùng tông
  task: { chip: 'bg-[#d3e3fd] border-transparent text-[#041e49]', fill: 'bg-[#0b57d0]', dot: 'bg-[#0b57d0]', sub: 'bg-white border-[#a8c7fa] text-[#041e49]', edge: 'border-[#0b57d0]' },
  data: { chip: 'bg-[#c4eed0] border-transparent text-[#072711]', fill: 'bg-[#188038]', dot: 'bg-[#188038]', sub: 'bg-white border-[#8fd5a6] text-[#072711]', edge: 'border-[#188038]' },
  survey: { chip: 'bg-[#ffe9b0] border-transparent text-[#3d2e00]', fill: 'bg-[#f9ab00]', dot: 'bg-[#f9ab00]', sub: 'bg-white border-[#fcd36b] text-[#3d2e00]', edge: 'border-[#f9ab00]' }
};

export function CategoryDot({ category, size = 8 }: { category: TaskCategory; size?: number }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${CATEGORY_STYLE[category].dot}`} style={{ width: size, height: size }} />;
}

/** Ký hiệu subtask: mũi tên con + chấm rỗng viền theo màu loại (khác chấm đặc của việc chính). */
export function SubtaskMark({ category, size = 8 }: { category: TaskCategory; size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5 text-ink-3">
      <Icon name="subtask" size={11} strokeWidth={2.2} />
      <span className={`inline-block rounded-full border-2 bg-white ${CATEGORY_STYLE[category].edge}`} style={{ width: size, height: size }} />
    </span>
  );
}
