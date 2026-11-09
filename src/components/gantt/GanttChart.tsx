'use client';

import { useCallback, useEffect, useMemo, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Member, Milestone, Project, ProjectRole, Task } from '@/lib/types';
import { TASK_STATUS_LABEL } from '@/lib/types';
import { addDays, diffDays, formatFull, formatShort, maxDate, minDate, weekday } from '@/lib/dates';
import { STATUS_STYLE } from '@/components/ui/badges';
import { updateTaskAction } from '@/app/(app)/projects/[id]/tasks/actions';
import { updateMilestoneAction } from '@/app/(app)/projects/[id]/settings/actions';
import { TaskDialog, type DialogState } from './TaskDialog';

/**
 * Gantt tương tác:
 *  - Kéo thân thanh → dời cả công việc; kéo mép trái/phải → đổi ngày bắt đầu/hạn chót.
 *  - Kéo trên dòng mốc (vùng trống) → quét chọn khoảng ngày → tạo việc mới thuộc mốc đó.
 *  - Kéo hình thoi ◆ → dời hạn của mốc. Bấm vào thanh → sửa, giao việc, đổi trạng thái.
 * Mọi thay đổi được kiểm tra lại bởi RLS + trigger trong Supabase.
 */

export type GanttZoom = 'day' | 'week' | 'month';

const DAY_WIDTH: Record<GanttZoom, number> = { day: 32, week: 14, month: 5 };
const ROW_H = 38;
const HEADER_H = 48;
const LEFT_W = 320;
const EDGE = 8; // px vùng nắm mép thanh

type Row =
  | { kind: 'milestone'; milestone: Milestone }
  | { kind: 'group'; label: string }
  | { kind: 'task'; task: Task };

type Drag =
  | { kind: 'move' | 'start' | 'end'; id: string; x0: number; delta: number; moved: boolean }
  | { kind: 'milestone'; id: string; x0: number; delta: number; moved: boolean }
  | { kind: 'create'; milestoneId: string | null; rowKey: string; a: number; b: number };

interface Props {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  members: Member[];
  zoom: GanttZoom;
  role: ProjectRole;
  userId: string;
  today: string;
}

export function GanttChart({ project, milestones: msProp, tasks: tasksProp, members, zoom, role, userId, today }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(tasksProp);
  const [milestones, setMilestones] = useState(msProp);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  // Đồng bộ lại khi server trả dữ liệu mới (sau router.refresh)
  useEffect(() => setTasks(tasksProp), [tasksProp]);
  useEffect(() => setMilestones(msProp), [msProp]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const isOwner = role === 'owner';
  const canCreate = role === 'owner' || role === 'editor';
  const canDragTask = (t: Task) => isOwner || (role === 'editor' && t.assigneeId === userId);
  const dw = DAY_WIDTH[zoom];
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);

  // ---- Khoảng thời gian: dựa trên dữ liệu gốc + đệm để có chỗ kéo ----
  const start = addDays(minDate(project.startDate, today, ...tasksProp.map((t) => t.startDate)), -7);
  const end = addDays(maxDate(project.endDate, today, ...tasksProp.map((t) => t.dueDate), ...msProp.map((m) => m.dueDate)), 21);
  const totalDays = diffDays(start, end) + 1;
  const width = totalDays * dw;
  const x = (iso: string) => diffDays(start, iso) * dw;
  const dayToIso = (d: number) => addDays(start, d);

  // ---- Áp thay đổi đang kéo (xem trước) ----
  const effTask = (t: Task): Task => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id || drag.delta === 0) return t;
    const d = drag.delta;
    if (drag.kind === 'move') return { ...t, startDate: addDays(t.startDate, d), dueDate: addDays(t.dueDate, d) };
    if (drag.kind === 'start') {
      const s = addDays(t.startDate, d);
      return { ...t, startDate: s > t.dueDate ? t.dueDate : s };
    }
    const e = addDays(t.dueDate, d);
    return { ...t, dueDate: e < t.startDate ? t.startDate : e };
  };
  const effMilestone = (m: Milestone): Milestone =>
    drag?.kind === 'milestone' && drag.id === m.id && drag.delta !== 0 ? { ...m, dueDate: addDays(m.dueDate, drag.delta) } : m;

  const viewTasks = tasks.map(effTask);
  const taskById = new Map(viewTasks.map((t) => [t.id, t]));

  // ---- Các dòng ----
  const rows: Row[] = [];
  for (const m of milestones) {
    rows.push({ kind: 'milestone', milestone: effMilestone(m) });
    viewTasks.filter((t) => t.milestoneId === m.id).forEach((task) => rows.push({ kind: 'task', task }));
  }
  const orphans = viewTasks.filter((t) => !t.milestoneId || !milestones.some((m) => m.id === t.milestoneId));
  if (orphans.length || canCreate) {
    rows.push({ kind: 'group', label: 'Chưa gắn mốc' });
    orphans.forEach((task) => rows.push({ kind: 'task', task }));
  }
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.kind === 'task' && rowOf.set(r.task.id, i));
  const bodyH = rows.length * ROW_H;

  // ---- Thang thời gian ----
  const months: { key: string; label: string; left: number; width: number }[] = [];
  const ticks: { left: number; label: string; weekend: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const iso = addDays(start, i);
    const key = iso.slice(0, 7);
    const last = months[months.length - 1];
    if (!last || last.key !== key) months.push({ key, label: `Th${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`, left: i * dw, width: dw });
    else last.width += dw;
    const wd = weekday(iso);
    if (zoom === 'day') ticks.push({ left: i * dw, label: iso.slice(8, 10), weekend: wd === 0 || wd === 6 });
    else if (zoom === 'week' && wd === 1) ticks.push({ left: i * dw, label: formatShort(iso), weekend: false });
  }

  // ---- Mũi tên phụ thuộc ----
  const arrows = viewTasks.flatMap((t) =>
    t.dependsOn.flatMap((depId) => {
      const dep = taskById.get(depId);
      const r1 = rowOf.get(depId);
      const r2 = rowOf.get(t.id);
      if (!dep || r1 === undefined || r2 === undefined) return [];
      const x1 = x(dep.dueDate) + dw;
      const y1 = r1 * ROW_H + ROW_H / 2;
      const x2 = x(t.startDate);
      const y2 = r2 * ROW_H + ROW_H / 2;
      const mid = x1 + 6;
      const d = x2 - 4 >= mid ? `M${x1},${y1} H${mid} V${y2} H${x2 - 2}` : `M${x1},${y1} H${mid} V${y2 - ROW_H / 2} H${x2 - 10} V${y2} H${x2 - 2}`;
      return [{ key: `${depId}->${t.id}`, d, bad: t.startDate < dep.startDate }];
    })
  );

  // ---- Lưu thay đổi ----
  const saveTaskDates = useCallback(
    (orig: Task, next: Task) => {
      setTasks((ts) => ts.map((t) => (t.id === orig.id ? { ...t, startDate: next.startDate, dueDate: next.dueDate } : t)));
      startTransition(async () => {
        const r = await updateTaskAction(orig.id, { startDate: next.startDate, dueDate: next.dueDate });
        if (r.error) {
          setTasks((ts) => ts.map((t) => (t.id === orig.id ? orig : t)));
          setFlash({ type: 'error', text: r.error });
        } else {
          setFlash({ type: 'ok', text: `“${orig.title}”: ${formatShort(next.startDate)} → ${formatShort(next.dueDate)}` });
          router.refresh();
        }
      });
    },
    [router]
  );

  const saveMilestoneDate = (orig: Milestone, due: string) => {
    setMilestones((ms) => ms.map((m) => (m.id === orig.id ? { ...m, dueDate: due } : m)));
    startTransition(async () => {
      const r = await updateMilestoneAction(orig.id, { dueDate: due });
      if (r.error) {
        setMilestones((ms) => ms.map((m) => (m.id === orig.id ? orig : m)));
        setFlash({ type: 'error', text: r.error });
      } else {
        setFlash({ type: 'ok', text: `Mốc “${orig.name}” → ${formatFull(due)}` });
        router.refresh();
      }
    });
  };

  // ---- Xử lý kéo trên thanh công việc ----
  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>, t: Task) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!canDragTask(t)) {
      setDialog({ mode: 'edit', task: t });
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const off = e.clientX - rect.left;
    const edge = Math.min(EDGE, rect.width / 3);
    const kind = off <= edge ? 'start' : off >= rect.width - edge ? 'end' : 'move';
    setDrag({ kind, id: t.id, x0: e.clientX, delta: 0, moved: false });
  };
  const onBarMove = (e: ReactPointerEvent<HTMLDivElement>, t: Task) => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / dw);
    const moved = drag.moved || Math.abs(dx) > 3;
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved });
  };
  const onBarUp = (t: Task) => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id) return;
    const orig = tasks.find((x) => x.id === t.id)!;
    const next = effTask(orig);
    const moved = drag.moved;
    setDrag(null);
    if (!moved) return setDialog({ mode: 'edit', task: orig });
    if (next.startDate !== orig.startDate || next.dueDate !== orig.dueDate) saveTaskDates(orig, next);
  };

  // ---- Quét chọn để tạo việc ----
  const dayAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(totalDays - 1, Math.floor((e.clientX - rect.left) / dw)));
  };
  const onLaneDown = (e: ReactPointerEvent<HTMLDivElement>, milestoneId: string | null, rowKey: string) => {
    if (!canCreate || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = dayAt(e);
    setDrag({ kind: 'create', milestoneId, rowKey, a: d, b: d });
  };
  const onLaneMove = (e: ReactPointerEvent<HTMLDivElement>, rowKey: string) => {
    if (drag?.kind !== 'create' || drag.rowKey !== rowKey) return;
    const d = dayAt(e);
    if (d !== drag.b) setDrag({ ...drag, b: d });
  };
  const onLaneUp = (rowKey: string) => {
    if (drag?.kind !== 'create' || drag.rowKey !== rowKey) return;
    const a = Math.min(drag.a, drag.b);
    const b = Math.max(drag.a, drag.b);
    const milestoneId = drag.milestoneId;
    setDrag(null);
    // Bấm 1 lần (không kéo) → mặc định 7 ngày
    setDialog({ mode: 'create', milestoneId, startDate: dayToIso(a), dueDate: dayToIso(a === b ? Math.min(a + 6, totalDays - 1) : b) });
  };

  // ---- Kéo mốc ----
  const onDiamondDown = (e: ReactPointerEvent<HTMLDivElement>, m: Milestone) => {
    if (!isOwner || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'milestone', id: m.id, x0: e.clientX, delta: 0, moved: false });
  };
  const onDiamondMove = (e: ReactPointerEvent<HTMLDivElement>, m: Milestone) => {
    if (drag?.kind !== 'milestone' || drag.id !== m.id) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / dw);
    const moved = drag.moved || Math.abs(dx) > 3;
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved });
  };
  const onDiamondUp = (m: Milestone) => {
    if (drag?.kind !== 'milestone' || drag.id !== m.id) return;
    const orig = milestones.find((x) => x.id === m.id)!;
    const due = addDays(orig.dueDate, drag.delta);
    setDrag(null);
    if (drag.moved && due !== orig.dueDate) saveMilestoneDate(orig, due);
  };

  const dragLabel = (() => {
    if (!drag) return null;
    if (drag.kind === 'create') {
      const a = Math.min(drag.a, drag.b);
      const b = Math.max(drag.a, drag.b);
      return `${formatShort(dayToIso(a))} → ${formatShort(dayToIso(b))} · ${b - a + 1} ngày`;
    }
    if (drag.kind === 'milestone') {
      const m = milestones.find((x) => x.id === drag.id);
      return m && drag.moved ? `Mốc: ${formatFull(addDays(m.dueDate, drag.delta))}` : null;
    }
    const t = taskById.get(drag.id);
    return t && drag.moved ? `${formatShort(t.startDate)} → ${formatShort(t.dueDate)} · ${diffDays(t.startDate, t.dueDate) + 1} ngày` : null;
  })();

  const todayX = x(today) + dw / 2;
  const leftCell = (cls: string, children: ReactNode, title?: string, onClick?: () => void) => (
    <div
      className={`sticky left-0 z-20 flex items-center gap-2 border-r border-line ${cls} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: LEFT_W, minWidth: LEFT_W }}
      title={title}
      onClick={onClick}
    >
      {children}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex min-h-7 flex-wrap items-center gap-3 text-xs">
        {canCreate && (
          <span className="text-zinc-500">
            {isOwner
              ? 'Kéo thân thanh để dời · kéo mép để đổi độ dài · quét trên dòng mốc để tạo việc · kéo ◆ để dời mốc · bấm thanh để sửa/giao việc'
              : 'Bạn kéo được các việc của mình · quét trên dòng mốc để tự tạo việc · bấm thanh để xem chi tiết'}
          </span>
        )}
        {dragLabel && <span className="bg-zinc-900 px-2 py-0.5 font-mono text-white">{dragLabel}</span>}
        {flash && !dragLabel && (
          <span className={`px-2 py-0.5 ${flash.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{flash.text}</span>
        )}
      </div>

      <div className={`thin-scroll overflow-auto border border-line bg-white ${drag ? 'select-none' : ''}`} style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <div className="relative" style={{ width: LEFT_W + width }}>
          {/* Header */}
          <div className="sticky top-0 z-30 flex border-b border-line bg-white" style={{ height: HEADER_H }}>
            <div
              className="sticky left-0 z-40 flex items-end border-r border-line bg-white px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
              style={{ width: LEFT_W, minWidth: LEFT_W }}
            >
              Mốc / Công việc
            </div>
            <div className="relative" style={{ width }}>
              {months.map((m) => (
                <div key={m.key} className="absolute top-0 h-6 truncate border-l border-line px-1.5 text-[11px] font-semibold leading-6 text-zinc-700" style={{ left: m.left, width: m.width }}>
                  {m.width > 40 ? m.label : ''}
                </div>
              ))}
              {ticks.map((t) => (
                <div
                  key={t.left}
                  className={`absolute top-6 h-6 border-l border-line/70 text-center text-[10px] leading-6 ${t.weekend ? 'text-zinc-400' : 'text-zinc-600'}`}
                  style={{ left: t.left, width: zoom === 'day' ? dw : 7 * dw }}
                >
                  {t.label}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative" style={{ height: bodyH }}>
            <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: LEFT_W, width }}>
              {ticks.map((t) =>
                zoom === 'day' ? (
                  t.weekend && <div key={t.left} className="absolute top-0 bottom-0 bg-paper-2" style={{ left: t.left, width: dw }} />
                ) : (
                  <div key={t.left} className="absolute top-0 bottom-0 border-l border-line/50" style={{ left: t.left }} />
                )
              )}
            </div>

            {rows.map((r, i) => {
              const top = i * ROW_H;
              if (r.kind === 'milestone' || r.kind === 'group') {
                const m = r.kind === 'milestone' ? r.milestone : null;
                const rowKey = m ? `m-${m.id}` : 'g-orphans';
                const creating = drag?.kind === 'create' && drag.rowKey === rowKey ? drag : null;
                return (
                  <div key={rowKey} className="absolute flex w-full border-b border-line bg-paper/60" style={{ top, height: ROW_H }}>
                    {leftCell(
                      'bg-paper px-3 text-[13px] font-semibold',
                      m ? (
                        <>
                          <span className="text-accent">◆</span>
                          <span className="truncate">{m.name}</span>
                          <span className="ml-auto shrink-0 text-[11px] font-normal text-zinc-500">{formatShort(m.dueDate)}</span>
                        </>
                      ) : (
                        <span className="text-zinc-500">{r.kind === 'group' ? r.label : ''}</span>
                      )
                    )}
                    <div
                      className={`relative ${canCreate ? 'cursor-crosshair' : ''}`}
                      style={{ width }}
                      title={canCreate ? 'Kéo để chọn khoảng ngày và tạo công việc' : undefined}
                      onPointerDown={(e) => onLaneDown(e, m?.id ?? null, rowKey)}
                      onPointerMove={(e) => onLaneMove(e, rowKey)}
                      onPointerUp={() => onLaneUp(rowKey)}
                      onPointerCancel={() => setDrag(null)}
                    >
                      {creating && (
                        <div
                          className="pointer-events-none absolute top-1.5 border-2 border-dashed border-sky-600 bg-sky-100/70"
                          style={{ left: Math.min(creating.a, creating.b) * dw, width: (Math.abs(creating.b - creating.a) + 1) * dw, height: ROW_H - 12 }}
                        />
                      )}
                      {m && (
                        <div
                          title={`${m.name} — hạn ${formatFull(m.dueDate)}${isOwner ? ' (kéo để dời)' : ''}`}
                          onPointerDown={(e) => onDiamondDown(e, m)}
                          onPointerMove={(e) => onDiamondMove(e, m)}
                          onPointerUp={() => onDiamondUp(m)}
                          className={`absolute top-1/2 z-[6] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${isOwner ? 'cursor-ew-resize' : ''}`}
                          style={{ left: x(m.dueDate) + dw / 2 }}
                        >
                          <span className={`block h-3 w-3 rotate-45 ${m.dueDate < today ? 'bg-zinc-400' : 'bg-accent'} ${drag?.kind === 'milestone' && drag.id === m.id ? 'ring-2 ring-sky-500' : ''}`} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const t = r.task;
              const assignee = t.assigneeId ? memberById.get(t.assigneeId) : undefined;
              const left = x(t.startDate);
              const w = Math.max((diffDays(t.startDate, t.dueDate) + 1) * dw, 8);
              const overdue = t.status !== 'done' && t.dueDate < today;
              const draggable = canDragTask(t);
              const active = drag && drag.kind !== 'create' && drag.kind !== 'milestone' && drag.id === t.id;
              const deps = t.dependsOn.map((d) => taskById.get(d)?.title).filter(Boolean);
              const tip = [
                t.title,
                `${formatFull(t.startDate)} → ${formatFull(t.dueDate)} (${diffDays(t.startDate, t.dueDate) + 1} ngày)`,
                `Phụ trách: ${assignee?.displayName ?? 'chưa giao'}`,
                `${TASK_STATUS_LABEL[t.status]} · ${t.progress}%`,
                deps.length ? `Sau: ${deps.join('; ')}` : ''
              ]
                .filter(Boolean)
                .join('\n');

              return (
                <div key={t.id} className="absolute flex w-full border-b border-line/60" style={{ top, height: ROW_H }}>
                  {leftCell(
                    'bg-white pl-7 pr-3 text-[13px] hover:bg-paper',
                    <>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[t.status].barFill}`} />
                      <span className={`truncate ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}>{t.title}</span>
                      <span className={`ml-auto shrink-0 text-[11px] ${overdue ? 'font-semibold text-rose-700' : 'text-zinc-500'}`}>{assignee ? assignee.displayName.split(' ').pop() : '—'}</span>
                    </>,
                    tip,
                    () => setDialog({ mode: 'edit', task: tasks.find((x) => x.id === t.id) ?? t })
                  )}
                  <div className="relative" style={{ width }}>
                    <div
                      title={tip}
                      onPointerDown={(e) => onBarDown(e, t)}
                      onPointerMove={(e) => onBarMove(e, t)}
                      onPointerUp={() => onBarUp(t)}
                      onPointerCancel={() => setDrag(null)}
                      className={`group absolute top-2 h-[22px] touch-none overflow-hidden rounded-sm ${STATUS_STYLE[t.status].bar} ${overdue ? 'ring-2 ring-rose-500' : ''} ${
                        active ? 'shadow-lg ring-2 ring-sky-500' : ''
                      } ${draggable ? (active && drag?.kind === 'move' ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
                      style={{ left, width: w }}
                    >
                      <div className={`pointer-events-none h-full ${STATUS_STYLE[t.status].barFill}`} style={{ width: `${t.progress}%` }} />
                      {draggable && (
                        <>
                          <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-zinc-900/0 group-hover:bg-zinc-900/25" />
                          <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-zinc-900/0 group-hover:bg-zinc-900/25" />
                        </>
                      )}
                    </div>
                    {assignee && (
                      <span className="pointer-events-none absolute top-2 whitespace-nowrap text-[11px] leading-[22px] text-zinc-600" style={{ left: left + w + 6 }}>
                        {assignee.displayName.split(' ').slice(-2).join(' ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LEFT_W }} width={width} height={bodyH}>
              <defs>
                <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#a1a1aa" />
                </marker>
                <marker id="arrow-bad" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#e11d48" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke={a.bad ? '#e11d48' : '#a1a1aa'}
                  strokeWidth={1.2}
                  strokeDasharray={a.bad ? '3 2' : undefined}
                  markerEnd={`url(#${a.bad ? 'arrow-bad' : 'arrow'})`}
                />
              ))}
            </svg>

            <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-500" style={{ left: LEFT_W + todayX }} />
          </div>
        </div>
      </div>

      {dialog && (
        <TaskDialog
          state={dialog}
          projectId={project.id}
          role={role}
          userId={userId}
          members={members}
          milestones={milestones}
          tasks={tasks}
          onClose={() => setDialog(null)}
          onSaved={(text) => {
            setDialog(null);
            setFlash({ type: 'ok', text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
