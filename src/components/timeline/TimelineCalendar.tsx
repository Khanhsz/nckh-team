'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as RPE } from 'react';
import { useRouter } from 'next/navigation';
import type { Member, Milestone, Project, ProjectRole, Task, TaskCategory } from '@/lib/types';
import { isAssignedTo, taskAssignees, TASK_CATEGORIES, TASK_CATEGORY_LABEL, TASK_STATUS_LABEL } from '@/lib/types';
import { addDays, diffDays, formatFull, formatShort, maxDate, minDate, weekday } from '@/lib/dates';
import { CATEGORY_STYLE } from '@/components/ui/badges';
import { createTaskQuickAction, updateTaskAction } from '@/app/(app)/projects/[id]/tasks/actions';
import { updateMilestoneAction } from '@/app/(app)/projects/[id]/settings/actions';
import { TaskDialog, type DialogState } from './TaskDialog';

/**
 * Timeline lịch nằm ngang — mỗi làn là một thành viên.
 *  • Quét chuột trên vùng trống của một làn → ô nhập nhanh → Enter để tạo việc giao cho người đó.
 *  • Kéo ô việc: dời ngày; kéo mép: đổi độ dài; kéo sang làn khác: giao lại (trưởng nhóm).
 *  • Kéo ◆ trên dải mốc: dời hạn mốc. Bấm ô việc: mở chi tiết.
 * Quyền thật sự do RLS + trigger của Supabase kiểm tra.
 */

export type TimelineZoom = 'week' | 'month';
/** Số ngày vừa khung nhìn cho mỗi mức xem nhanh. Mức "Tháng" cũng là mức thu nhỏ tối đa. */
const PRESET_DAYS: Record<TimelineZoom, number> = { week: 7, month: 31 };
const PRESET_LABEL: Record<TimelineZoom, string> = { week: 'Tuần', month: 'Tháng' };
const MAX_DAYS_IN_VIEW = 31;
const MIN_DAYS_IN_VIEW = 5;
const DW_KEY = 'nckh-timeline-day-width';
const LEFT_W = 200;
const SCALE_H = 46;
const MS_H = 30;
const CHIP_H = 26;
const GAP = 4;
const PAD = 6;
const EDGE = 8;
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface Lane {
  key: string;
  label: string;
  sub: string | null;
  memberId: string | null;
  /** Làn "Cả nhóm" — ghim ngay dưới dải mốc */
  team?: boolean;
  tasks: Task[];
  slots: Map<string, number>;
  top: number;
  height: number;
}

type Drag =
  | { kind: 'move' | 'start' | 'end'; id: string; x0: number; y0: number; dDays: number; laneKey: string; from: string; moved: boolean }
  | { kind: 'milestone'; id: string; x0: number; dDays: number; moved: boolean }
  | { kind: 'create'; laneKey: string; a: number; b: number };

/** Xếp các việc chồng ngày vào nhiều tầng (thuật toán tham lam theo ngày bắt đầu). */
function pack(tasks: Task[]) {
  const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.dueDate.localeCompare(b.dueDate));
  const ends: string[] = [];
  const slots = new Map<string, number>();
  for (const t of sorted) {
    let i = ends.findIndex((e) => e < t.startDate);
    if (i === -1) {
      i = ends.length;
      ends.push(t.dueDate);
    } else ends[i] = t.dueDate;
    slots.set(t.id, i);
  }
  return { slots, rows: ends.length };
}

interface Props {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  members: Member[];
  initialZoom?: TimelineZoom;
  role: ProjectRole;
  userId: string;
  today: string;
}

export function TimelineCalendar({ project, milestones: msProp, tasks: tasksProp, members, initialZoom = 'month', role, userId, today }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState(tasksProp);
  const [milestones, setMilestones] = useState(msProp);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [quick, setQuick] = useState<{ laneKey: string; a: number; b: number } | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState<TaskCategory>('task');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [saving, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTasks(tasksProp), [tasksProp]);
  useEffect(() => setMilestones(msProp), [msProp]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const isOwner = role === 'owner';

  // ---- Độ rộng ngày co giãn trong khoảng [1 tháng vừa khung … ~5 ngày vừa khung] ----
  const [viewW, setViewW] = useState(1100); // bề rộng vùng ngày nhìn thấy (px)
  const minDw = viewW / MAX_DAYS_IN_VIEW;
  const maxDw = Math.max(viewW / MIN_DAYS_IN_VIEW, minDw + 1);
  const clampDw = (v: number) => Math.min(maxDw, Math.max(minDw, Math.round(v * 10) / 10));
  const [dw, setDw] = useState<number>(1100 / PRESET_DAYS[initialZoom]);
  const dwRef = useRef(dw);
  dwRef.current = dw;
  const pendingScroll = useRef<number | null>(null);
  const stretchRef = useRef<{ x0: number; d0: number; dw0: number; left0: number } | null>(null);
  const [stretching, setStretching] = useState(false);

  // Đo bề rộng khung nhìn (và theo dõi khi đổi cỡ cửa sổ); khôi phục độ rộng đã lưu
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => Math.max(280, el.clientWidth - LEFT_W);
    const w = measure();
    setViewW(w);
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(DW_KEY)) || 0;
    } catch {
      /* trình duyệt chặn localStorage */
    }
    setDw(saved > 0 ? saved : w / PRESET_DAYS[initialZoom]);
    const ro = new ResizeObserver(() => setViewW(measure()));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Khi khung nhìn đổi cỡ: nếu đang ở mức Tuần/Tháng thì giữ đúng 7/31 ngày vừa khung, nếu không thì chỉ ép vào giới hạn
  const prevViewW = useRef(viewW);
  useEffect(() => {
    const prev = prevViewW.current;
    prevViewW.current = viewW;
    const preset = (Object.keys(PRESET_DAYS) as TimelineZoom[]).find((z) => Math.abs(dw - prev / PRESET_DAYS[z]) < 0.6);
    if (preset && prev !== viewW) setDw(viewW / PRESET_DAYS[preset]);
    else if (dw < minDw - 0.05 || dw > maxDw + 0.05) setDw(clampDw(dw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewW]);
  useEffect(() => {
    try {
      localStorage.setItem(DW_KEY, String(dw));
    } catch {
      /* bỏ qua */
    }
  }, [dw]);
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [dw]);

  /** Đổi độ rộng ngày, giữ cố định ngày nằm dưới điểm neo (con trỏ, hoặc giữa khung nhìn). */
  const zoomTo = (next: number, anchorClientX?: number) => {
    const el = scrollRef.current;
    const nd = clampDw(next);
    if (!el) return setDw(nd);
    const rect = el.getBoundingClientRect();
    const cx = anchorClientX !== undefined ? Math.max(0, anchorClientX - rect.left - LEFT_W) : (el.clientWidth - LEFT_W) / 2;
    const dayAt = (el.scrollLeft + cx) / dwRef.current;
    pendingScroll.current = Math.max(0, dayAt * nd - cx);
    setDw(nd);
  };
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;

  // Ctrl/⌘ + cuộn chuột để co giãn (cần listener non-passive để chặn zoom cả trang)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomToRef.current(dwRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Kéo trên thanh ngày để giãn/co: điểm bắt đầu kéo bám theo con trỏ, mép trái khung nhìn đứng yên
  const onScaleDown = (e: RPE<HTMLDivElement>) => {
    if (e.button !== 0 || !scrollRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = scrollRef.current.getBoundingClientRect();
    stretchRef.current = {
      x0: e.clientX,
      d0: Math.max(24, e.clientX - rect.left - LEFT_W),
      dw0: dwRef.current,
      left0: scrollRef.current.scrollLeft
    };
    setStretching(true);
  };
  const onScaleMove = (e: RPE<HTMLDivElement>) => {
    const st = stretchRef.current;
    if (!st) return;
    const nd = clampDw((st.dw0 * (st.d0 + (e.clientX - st.x0))) / st.d0);
    if (nd === dwRef.current) return;
    pendingScroll.current = (st.left0 / st.dw0) * nd;
    setDw(nd);
  };
  const onScaleUp = () => {
    stretchRef.current = null;
    setStretching(false);
  };

  // ---- Khoảng thời gian ----
  const start = addDays(minDate(project.startDate, today, ...tasksProp.map((t) => t.startDate)), -14);
  const end = addDays(maxDate(project.endDate, today, ...tasksProp.map((t) => t.dueDate), ...msProp.map((m) => m.dueDate)), 30);
  const totalDays = diffDays(start, end) + 1;
  const width = totalDays * dw;
  const x = (iso: string) => diffDays(start, iso) * dw;
  const dayIso = (d: number) => addDays(start, d);

  // Cuộn tới hôm nay khi mở trang
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(today) - 4 * dw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Làn: thành viên có thể nhận việc + "Chưa giao" ----
  const lanes: Lane[] = useMemo(() => {
    const workers = members.filter((m) => m.role !== 'viewer');
    const teamTasks = tasks.filter((t) => t.isTeam);
    const defs: { key: string; label: string; sub: string | null; memberId: string | null; team?: boolean }[] = [];
    if (teamTasks.length || isOwner) defs.push({ key: 'team', label: '👥 Cả nhóm', sub: 'Việc chung · chia subtask cho từng người', memberId: null, team: true });
    defs.push(...workers.map((m) => ({
      key: m.userId,
      label: m.displayName + (m.userId === userId ? ' (bạn)' : ''),
      sub: m.role === 'owner' ? 'Trưởng nhóm' : null,
      memberId: m.userId
    })));
    const known = new Set(workers.map((m) => m.userId));
    const others = tasks.filter((t) => !t.isTeam && t.assigneeId && !known.has(t.assigneeId));
    if (others.length) defs.push({ key: 'others', label: 'Người không còn trong nhóm', sub: null, memberId: null });
    const unassigned = tasks.filter((t) => !t.assigneeId && !t.isTeam);
    if (unassigned.length || isOwner) defs.push({ key: 'none', label: 'Chưa giao', sub: 'Kéo việc sang làn một người để giao', memberId: null });

    let top = 0;
    return defs.map((d) => {
      const own =
        d.key === 'team' ? teamTasks : d.key === 'none' ? unassigned : d.key === 'others' ? others : tasks.filter((t) => !t.isTeam && d.memberId !== null && taskAssignees(t).includes(d.memberId));
      const { slots, rows } = pack(own);
      const height = PAD * 2 + (rows + 1) * CHIP_H + rows * GAP; // +1 tầng trống để quét tạo việc
      const lane = { ...d, tasks: own, slots, top, height };
      top += height;
      return lane;
    });
  }, [members, tasks, userId, isOwner]);
  const bodyH = lanes.reduce((s, l) => s + l.height, 0);
  const laneByKey = new Map(lanes.map((l) => [l.key, l]));

  const canCreateIn = (lane: Lane) => isOwner || (!lane.team && role === 'editor' && lane.memberId === userId);
  const teamLane = lanes.find((l) => l.team);
  const teamRef = useRef<HTMLDivElement>(null);
  // Rê chuột lên một việc → làm nổi việc cha và các subtask cùng nhóm
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverFamily = (() => {
    if (!hoverId) return null;
    const h = tasks.find((t) => t.id === hoverId);
    if (!h) return null;
    const root = h.parentId ?? h.id;
    const ids = new Set([root, ...tasks.filter((t) => t.parentId === root).map((t) => t.id)]);
    return ids.size > 1 || taskAssignees(h).length > 1 ? ids : null;
  })();
  const canDragTask = (t: Task) => isOwner || (role === 'editor' && isAssignedTo(t, userId));

  // ---- Thang thời gian ----
  const months: { key: string; label: string; left: number; width: number }[] = [];
  const days: { left: number; iso: string; wd: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const iso = dayIso(i);
    const key = iso.slice(0, 7);
    const last = months[months.length - 1];
    if (!last || last.key !== key) months.push({ key, label: `Tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`, left: i * dw, width: dw });
    else last.width += dw;
    days.push({ left: i * dw, iso, wd: weekday(iso) });
  }

  // ---- Xem trước khi kéo ----
  const preview = (t: Task): Task => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id) return t;
    const d = drag.dDays;
    if (drag.kind === 'move') return { ...t, startDate: addDays(t.startDate, d), dueDate: addDays(t.dueDate, d) };
    if (drag.kind === 'start') {
      const s = addDays(t.startDate, d);
      return { ...t, startDate: s > t.dueDate ? t.dueDate : s };
    }
    const e = addDays(t.dueDate, d);
    return { ...t, dueDate: e < t.startDate ? t.startDate : e };
  };

  const laneAtY = (clientY: number): Lane | null => {
    // Làn "Cả nhóm" dính ở trên khi cuộn → đo theo vị trí thật của nó
    const tr = teamRef.current?.getBoundingClientRect();
    if (teamLane && tr && clientY >= tr.top && clientY < tr.bottom) return teamLane;
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top;
    return lanes.find((l) => !l.team && y >= l.top && y < l.top + l.height) ?? null;
  };

  // ---- Lưu ----
  const run = (optimistic: () => void, revert: () => void, call: () => Promise<{ error?: string }>, ok: string) => {
    optimistic();
    startTransition(async () => {
      const r = await call();
      if (r.error) {
        revert();
        setFlash({ type: 'error', text: r.error });
      } else {
        setFlash({ type: 'ok', text: ok });
        router.refresh();
      }
    });
  };

  // ---- Kéo ô việc ----
  const onChipDown = (e: RPE<HTMLDivElement>, t: Task, lane: Lane) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setQuick(null);
    if (!canDragTask(t)) return setDialog({ mode: 'edit', task: t });
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const off = e.clientX - rect.left;
    const edge = Math.min(EDGE, rect.width / 3);
    const kind = off <= edge ? 'start' : off >= rect.width - edge ? 'end' : 'move';
    setDrag({ kind, id: t.id, x0: e.clientX, y0: e.clientY, dDays: 0, laneKey: lane.key, from: lane.key, moved: false });
  };
  const onChipMove = (e: RPE<HTMLDivElement>, t: Task) => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    const dDays = Math.round(dx / dw);
    const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
    let laneKey = drag.laneKey;
    if (drag.kind === 'move' && isOwner) {
      const lane = laneAtY(e.clientY);
      if (lane && lane.key !== 'others' && !(lane.team && t.parentId)) laneKey = lane.key;
    }
    if (dDays !== drag.dDays || moved !== drag.moved || laneKey !== drag.laneKey) setDrag({ ...drag, dDays, moved, laneKey });
  };
  const onChipUp = (t: Task) => {
    if (!drag || (drag.kind !== 'move' && drag.kind !== 'start' && drag.kind !== 'end') || drag.id !== t.id) return;
    const orig = tasks.find((x) => x.id === t.id)!;
    const next = preview(orig);
    const fromLane = drag.from;
    const fromMember = laneByKey.get(fromLane)?.memberId ?? null;
    const toLane = laneByKey.get(drag.laneKey);
    const moved = drag.moved;
    setDrag(null);
    if (!moved) return setDialog({ mode: 'edit', task: orig });

    const reassigned = toLane && toLane.key !== fromLane;
    const datesChanged = next.startDate !== orig.startDate || next.dueDate !== orig.dueDate;
    if (!reassigned && !datesChanged) return;
    // Đổi đúng "suất" của người ở làn xuất phát sang làn đích; những người cùng làm khác giữ nguyên
    let people = taskAssignees(orig);
    if (reassigned && !toLane!.team) {
      if (!fromMember) people = toLane!.memberId ? [toLane!.memberId] : [];
      else if (!toLane!.memberId) people = people.filter((id) => id !== fromMember);
      else people = [...new Set(people.map((id) => (id === fromMember ? toLane!.memberId! : id)))];
    }
    const isTeam = reassigned ? Boolean(toLane!.team) : orig.isTeam;
    const assigneeId = isTeam ? null : people[0] ?? null;
    const coAssigneeIds = isTeam ? [] : people.slice(1);
    const who = reassigned ? (toLane!.team ? 'cả nhóm' : toLane!.memberId ? toLane!.label.replace(' (bạn)', '') : 'Chưa giao') : null;
    run(
      () => setTasks((ts) => ts.map((x) => (x.id === orig.id ? { ...x, startDate: next.startDate, dueDate: next.dueDate, assigneeId, coAssigneeIds, isTeam } : x))),
      () => setTasks((ts) => ts.map((x) => (x.id === orig.id ? orig : x))),
      () =>
        updateTaskAction(orig.id, {
          ...(datesChanged ? { startDate: next.startDate, dueDate: next.dueDate } : {}),
          ...(reassigned ? (isTeam ? { isTeam: true } : { assigneeId, coAssigneeIds, isTeam: false }) : {})
        }),
      `“${orig.title}”${datesChanged ? ` · ${formatShort(next.startDate)} → ${formatShort(next.dueDate)}` : ''}${who ? ` · giao cho ${who}` : ''}`
    );
  };

  // ---- Quét để tạo việc ----
  const dayAt = (e: RPE<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(totalDays - 1, Math.floor((e.clientX - rect.left) / dw)));
  };
  const onLaneDown = (e: RPE<HTMLDivElement>, lane: Lane) => {
    if (e.button !== 0 || !canCreateIn(lane)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setQuick(null);
    const d = dayAt(e);
    setDrag({ kind: 'create', laneKey: lane.key, a: d, b: d });
  };
  const onLaneMove = (e: RPE<HTMLDivElement>, lane: Lane) => {
    if (drag?.kind !== 'create' || drag.laneKey !== lane.key) return;
    const d = dayAt(e);
    if (d !== drag.b) setDrag({ ...drag, b: d });
  };
  const onLaneUp = (lane: Lane) => {
    if (drag?.kind !== 'create' || drag.laneKey !== lane.key) return;
    const a = Math.min(drag.a, drag.b);
    const b = a === Math.max(drag.a, drag.b) ? Math.min(a + (dw < 18 ? 6 : 2), totalDays - 1) : Math.max(drag.a, drag.b);
    setDrag(null);
    setQuickTitle('');
    setQuick({ laneKey: lane.key, a, b });
  };

  const autoMilestone = (startIso: string) => {
    const sorted = [...milestones].sort((p, q) => p.dueDate.localeCompare(q.dueDate));
    return sorted.find((m) => m.dueDate >= startIso) ?? sorted[sorted.length - 1] ?? null;
  };

  const submitQuick = () => {
    if (!quick) return;
    const title = quickTitle.trim();
    if (!title) return;
    const lane = laneByKey.get(quick.laneKey);
    const startDate = dayIso(quick.a);
    const dueDate = dayIso(quick.b);
    const ms = autoMilestone(startDate);
    const tempId = `temp-${Date.now()}`;
    const temp: Task = {
      id: tempId,
      projectId: project.id,
      milestoneId: ms?.id ?? null,
      parentId: null,
      isTeam: Boolean(lane?.team),
      coAssigneeIds: [],
      title,
      description: null,
      assigneeId: isOwner ? lane?.memberId ?? null : userId,
      startDate,
      dueDate,
      dependsOn: [],
      progress: 0,
      status: 'todo',
      category: quickCategory,
      createdBy: userId,
      updatedAt: ''
    };
    setQuick(null);
    run(
      () => setTasks((ts) => [...ts, temp]),
      () => setTasks((ts) => ts.filter((t) => t.id !== tempId)),
      () =>
        createTaskQuickAction(project.id, {
          title,
          milestoneId: ms?.id ?? null,
          assigneeId: lane?.memberId ?? null,
          startDate,
          dueDate,
          dependsOn: [],
          category: quickCategory,
          isTeam: Boolean(lane?.team)
        }),
      `Đã tạo “${title}”`
    );
  };
  const onQuickKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuick();
    } else if (e.key === 'Escape') setQuick(null);
  };

  // ---- Kéo mốc ----
  const onDiamondDown = (e: RPE<HTMLDivElement>, m: Milestone) => {
    if (!isOwner || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'milestone', id: m.id, x0: e.clientX, dDays: 0, moved: false });
  };
  const onDiamondMove = (e: RPE<HTMLDivElement>, m: Milestone) => {
    if (drag?.kind !== 'milestone' || drag.id !== m.id) return;
    const dx = e.clientX - drag.x0;
    const dDays = Math.round(dx / dw);
    const moved = drag.moved || Math.abs(dx) > 3;
    if (dDays !== drag.dDays || moved !== drag.moved) setDrag({ ...drag, dDays, moved });
  };
  const onDiamondUp = (m: Milestone) => {
    if (drag?.kind !== 'milestone' || drag.id !== m.id) return;
    const orig = milestones.find((x) => x.id === m.id)!;
    const due = addDays(orig.dueDate, drag.dDays);
    const moved = drag.moved;
    setDrag(null);
    if (!moved || due === orig.dueDate) return;
    run(
      () => setMilestones((ms) => ms.map((x) => (x.id === orig.id ? { ...x, dueDate: due } : x))),
      () => setMilestones((ms) => ms.map((x) => (x.id === orig.id ? orig : x))),
      () => updateMilestoneAction(orig.id, { dueDate: due }),
      `Mốc “${orig.name}” → ${formatFull(due)}`
    );
  };
  const viewMilestones = milestones.map((m) =>
    drag?.kind === 'milestone' && drag.id === m.id && drag.dDays !== 0 ? { ...m, dueDate: addDays(m.dueDate, drag.dDays) } : m
  );

  // ---- Nhãn trạng thái kéo ----
  const dragLabel = (() => {
    if (!drag) return null;
    if (drag.kind === 'create') {
      const a = Math.min(drag.a, drag.b);
      const b = Math.max(drag.a, drag.b);
      return `${formatShort(dayIso(a))} → ${formatShort(dayIso(b))} · ${b - a + 1} ngày`;
    }
    if (drag.kind === 'milestone') {
      const m = milestones.find((x) => x.id === drag.id);
      return m && drag.moved ? `Mốc → ${formatFull(addDays(m.dueDate, drag.dDays))}` : null;
    }
    const t = tasks.find((x) => x.id === drag.id);
    if (!t || !drag.moved) return null;
    const p = preview(t);
    const lane = laneByKey.get(drag.laneKey);
    const reassign = lane && lane.key !== drag.from ? ` · giao cho ${lane.memberId ? lane.label.replace(' (bạn)', '') : 'Chưa giao'}` : '';
    return `${formatShort(p.startDate)} → ${formatShort(p.dueDate)} · ${diffDays(p.startDate, p.dueDate) + 1} ngày${reassign}`;
  })();

  const memberName = (id: string | null) => (id ? members.find((m) => m.userId === id)?.displayName ?? '—' : 'Chưa giao');

  const renderChip = (t: Task, lane: Lane, left: number, top: number, opts: { ghost?: boolean; dim?: boolean } = {}) => {
    const shared = taskAssignees(t).length;
    const w = Math.max((diffDays(t.startDate, t.dueDate) + 1) * dw - 2, 10);
    const overdue = t.status !== 'done' && t.dueDate < today;
    const draggable = canDragTask(t) && !t.id.startsWith('temp-');
    const ms = t.milestoneId ? milestones.find((m) => m.id === t.milestoneId) : null;
    const parent = t.parentId ? tasks.find((x) => x.id === t.parentId) : undefined;
    const isSub = Boolean(t.parentId);
    const kids = isSub ? [] : tasks.filter((x) => x.parentId === t.id);
    const tip = [
      t.title,
      `${formatFull(t.startDate)} → ${formatFull(t.dueDate)} (${diffDays(t.startDate, t.dueDate) + 1} ngày)`,
      t.isTeam ? 'Phụ trách: Cả nhóm' : `Phụ trách: ${taskAssignees(t).map(memberName).join(', ') || 'Chưa giao'}`,
      ms ? `Mốc: ${ms.name}` : '',
      parent ? `Subtask của: ${parent.title}` : '',
      kids.length ? `${kids.length} subtask (${kids.filter((k) => k.status === 'done').length} xong)` : '',
      `${TASK_CATEGORY_LABEL[t.category]} · ${TASK_STATUS_LABEL[t.status]} · ${t.progress}%`
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <div
        key={(opts.ghost ? 'ghost-' : '') + lane.key + '-' + t.id}
        title={opts.ghost ? undefined : tip}
        data-task={opts.ghost ? undefined : t.id}
        onPointerDown={opts.ghost ? undefined : (e) => onChipDown(e, t, lane)}
        onPointerMove={opts.ghost ? undefined : (e) => onChipMove(e, t)}
        onPointerUp={opts.ghost ? undefined : () => onChipUp(t)}
        onPointerCancel={() => setDrag(null)}
        onPointerEnter={opts.ghost ? undefined : () => setHoverId(t.id)}
        onPointerLeave={opts.ghost ? undefined : () => setHoverId((h) => (h === t.id ? null : h))}
        className={`group absolute touch-none overflow-hidden rounded border text-[12px] leading-tight ${
          isSub ? `${CATEGORY_STYLE[t.category].sub} border-l-[4px] ${CATEGORY_STYLE[t.category].edge}` : CATEGORY_STYLE[t.category].chip
        } ${
          t.status === 'review' ? 'border-2 border-dashed' : ''
        } ${t.status === 'done' ? 'opacity-55' : ''} ${overdue ? 'ring-2 ring-rose-500' : ''} ${opts.ghost ? 'pointer-events-none z-20 shadow-lg ring-2 ring-sky-500' : ''} ${opts.dim ? 'opacity-30' : ''} ${
          hoverFamily && !opts.ghost ? (hoverFamily.has(t.id) ? 'z-10 shadow-md ring-2 ring-zinc-900' : 'opacity-40') : ''
        } ${t.isTeam ? 'font-semibold' : ''} ${
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } ${t.id.startsWith('temp-') ? 'animate-pulse' : ''}`}
        style={{ left: left + 1, top, width: w, height: CHIP_H }}
      >
        <div className="pointer-events-none flex h-full items-center gap-1 px-1.5">
          {isSub && <span className="shrink-0 text-[11px] text-zinc-400">↳</span>}
          {t.isTeam && <span className="shrink-0 text-[11px]">👥</span>}
          <span className={`truncate ${isSub ? '' : 'font-medium'} ${t.status === 'done' ? 'line-through opacity-60' : ''}`}>{t.title}</span>
          {shared > 1 && (
            <span className="ml-auto shrink-0 rounded-full bg-zinc-900/80 px-1.5 text-[10px] font-semibold leading-4 text-white" title={`${shared} người cùng làm`}>
              {shared}👤
            </span>
          )}
          {kids.length > 0 && (
            <span className={`${shared > 1 ? '' : 'ml-auto'} shrink-0 rounded-sm bg-white/70 px-1 text-[10px] font-semibold text-zinc-600`}>☰{kids.length}</span>
          )}
        </div>
        <div className={`pointer-events-none absolute bottom-0 left-0 h-[3px] ${CATEGORY_STYLE[t.category].fill}`} style={{ width: `${t.progress}%` }} />
        {draggable && (
          <>
            <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-zinc-900/15" />
            <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-zinc-900/15" />
          </>
        )}
      </div>
    );
  };

  // Ô đang kéo sang làn khác → vẽ "bóng" ở làn đích
  const movingTask = drag && drag.kind === 'move' && drag.moved ? tasks.find((t) => t.id === drag.id) : undefined;
  const ghostLane = movingTask && drag && drag.kind === 'move' && drag.laneKey !== drag.from ? laneByKey.get(drag.laneKey) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Độ rộng ngày</span>
        <div className="flex border border-line bg-white">
          {(Object.keys(PRESET_DAYS) as TimelineZoom[]).map((z) => (
            <button
              key={z}
              onClick={() => zoomTo(viewW / PRESET_DAYS[z])}
              className={`px-2.5 py-1 ${Math.abs(dw - viewW / PRESET_DAYS[z]) < 0.6 ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-paper-2'}`}
            >
              {PRESET_LABEL[z]}
            </button>
          ))}
        </div>
        <button onClick={() => zoomTo(dw / 1.25)} className="border border-line bg-white px-2 py-0.5 text-sm leading-5 hover:bg-paper-2" aria-label="Thu hẹp ngày">
          −
        </button>
        <input
          type="range"
          min={Math.ceil(minDw)}
          max={Math.floor(maxDw)}
          step={1}
          value={Math.round(dw)}
          onChange={(e) => zoomTo(Number(e.target.value))}
          aria-label="Độ rộng mỗi ngày"
          className="w-40 accent-zinc-900"
        />
        <button onClick={() => zoomTo(dw * 1.25)} className="border border-line bg-white px-2 py-0.5 text-sm leading-5 hover:bg-paper-2" aria-label="Giãn rộng ngày">
          +
        </button>
        <span className="w-16 font-mono text-zinc-600">{Math.round(dw)} px/ngày</span>
        <span className="text-zinc-500">≈ {Math.round(viewW / dw)} ngày trong khung</span>
        <span className="text-zinc-400">· kéo trên thanh ngày hoặc Ctrl + cuộn chuột để co giãn</span>
        <span className="ml-auto flex items-center gap-3 text-zinc-500" aria-label="Chú thích màu">
          {TASK_CATEGORIES.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CATEGORY_STYLE[c].fill}`} />
              {TASK_CATEGORY_LABEL[c]}
            </span>
          ))}
          <span className="flex items-center gap-1 border-l border-line pl-3">
            <span className="inline-block h-2.5 w-3.5 rounded-sm border-2 border-dashed border-zinc-500" />
            Chờ duyệt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-flex h-3 w-5 items-center rounded-sm border border-l-[3px] border-zinc-400 border-l-zinc-600 bg-white text-[8px] leading-none text-zinc-500">↳</span>
            Subtask
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full bg-zinc-900/80 px-1.5 text-[10px] font-semibold leading-4 text-white">2👤</span>
            Nhiều người cùng làm
          </span>
        </span>
      </div>
      <div className="flex min-h-7 flex-wrap items-center gap-3 text-xs">
        <span className="text-zinc-500">
          {isOwner
            ? 'Quét trên làn 👥 Cả nhóm để tạo việc chung, hoặc trên làn một người để giao riêng · rê chuột lên việc để xem việc cha & subtask · kéo ô để dời · kéo mép để đổi độ dài · kéo sang làn khác để giao lại · kéo ◆ để dời mốc'
            : role === 'editor'
              ? 'Quét trên làn của bạn để tự tạo việc · kéo việc của bạn để dời / đổi độ dài · bấm ô để xem chi tiết'
              : 'Bấm ô để xem chi tiết công việc'}
        </span>
        {stretching && <span className="bg-zinc-900 px-2 py-0.5 font-mono text-white">{Math.round(dw)} px/ngày</span>}
        {dragLabel && <span className="bg-zinc-900 px-2 py-0.5 font-mono text-white">{dragLabel}</span>}
        {!dragLabel && saving && <span className="text-zinc-500">Đang lưu…</span>}
        {!dragLabel && !saving && flash && (
          <span className={`px-2 py-0.5 ${flash.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{flash.text}</span>
        )}
      </div>

      <div ref={scrollRef} className={`thin-scroll overflow-auto border border-line bg-white ${drag ? 'select-none' : ''}`} style={{ maxHeight: 'calc(100vh - 300px)' }}>
        <div className="relative" style={{ width: LEFT_W + width }}>
          {/* ===== Header: tháng · ngày · dải mốc ===== */}
          <div className="sticky top-0 z-30 flex border-b border-line bg-white" style={{ height: SCALE_H + MS_H }}>
            <div className="sticky left-0 z-40 flex flex-col justify-end border-r border-line bg-white" style={{ width: LEFT_W, minWidth: LEFT_W }}>
              <div className="flex items-center px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500" style={{ height: MS_H }}>
                ◆ Mốc
              </div>
            </div>
            <div className="relative" style={{ width }}>
              {months.map((m) => (
                <div key={m.key} className="absolute top-0 h-6 truncate border-l border-line px-2 text-[12px] font-semibold leading-6 text-zinc-800" style={{ left: m.left, width: m.width }}>
                  {m.width > 60 ? m.label : ''}
                </div>
              ))}
              {dw < 18
                ? days
                    .filter((d) => d.wd === 1)
                    .map((d) => (
                      <div key={d.iso} className="absolute top-6 h-5 border-l border-line/70 pl-1 text-[10px] leading-5 text-zinc-500" style={{ left: d.left, width: 7 * dw }}>
                        {formatShort(d.iso)}
                      </div>
                    ))
                : days.map((d) => (
                    <div
                      key={d.iso}
                      className={`absolute top-6 h-5 border-l border-line/60 text-center text-[10px] leading-5 ${
                        d.iso === today ? 'bg-rose-500 font-bold text-white' : d.wd === 0 || d.wd === 6 ? 'text-zinc-400' : 'text-zinc-600'
                      }`}
                      style={{ left: d.left, width: dw }}
                    >
                      {dw >= 48 ? `${WD[d.wd]} ${d.iso.slice(8)}` : d.iso.slice(8)}
                    </div>
                  ))}
              {/* Vùng kéo để co giãn độ rộng ngày */}
              <div
                className={`absolute left-0 top-0 z-10 touch-none ${stretching ? 'cursor-grabbing' : 'cursor-col-resize'}`}
                style={{ width, height: SCALE_H }}
                title="Kéo sang phải để giãn ngày, sang trái để thu hẹp (hoặc Ctrl + cuộn chuột)"
                onPointerDown={onScaleDown}
                onPointerMove={onScaleMove}
                onPointerUp={onScaleUp}
                onPointerCancel={onScaleUp}
              />
              {/* Dải mốc */}
              <div className="absolute left-0 border-t border-line bg-paper/70" style={{ top: SCALE_H, height: MS_H, width }}>
                {viewMilestones.map((m) => (
                  <div
                    key={m.id}
                    title={`${m.name} — hạn ${formatFull(m.dueDate)}${isOwner ? ' (kéo để dời)' : ''}`}
                    onPointerDown={(e) => onDiamondDown(e, m)}
                    onPointerMove={(e) => onDiamondMove(e, m)}
                    onPointerUp={() => onDiamondUp(m)}
                    onPointerCancel={() => setDrag(null)}
                    className={`absolute top-0 flex h-full touch-none items-center gap-1 whitespace-nowrap pr-2 text-[11px] font-medium ${isOwner ? 'cursor-ew-resize' : ''}`}
                    style={{ left: x(m.dueDate) + dw / 2 - 6 }}
                  >
                    <span className={`block h-3 w-3 shrink-0 rotate-45 ${m.dueDate < today ? 'bg-zinc-400' : 'bg-accent'} ${drag?.kind === 'milestone' && drag.id === m.id ? 'ring-2 ring-sky-500' : ''}`} />
                    <span className="text-zinc-700">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== Thân: các làn thành viên ===== */}
          <div ref={bodyRef} className="relative" style={{ height: bodyH }}>
            {/* Lưới ngày, cuối tuần, hôm nay, vạch mốc */}
            <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: LEFT_W, width }}>
              {days.map((d) =>
                d.wd === 0 || d.wd === 6 ? (
                  <div key={d.iso} className="absolute top-0 bottom-0 bg-paper-2" style={{ left: d.left, width: dw }} />
                ) : dw >= 18 ? (
                  <div key={d.iso} className="absolute top-0 bottom-0 border-l border-line/40" style={{ left: d.left }} />
                ) : null
              )}
              {viewMilestones.map((m) => (
                <div key={m.id} className="absolute top-0 bottom-0 border-l border-dashed border-accent/40" style={{ left: x(m.dueDate) + dw / 2 }} />
              ))}
              <div className="absolute top-0 bottom-0 bg-rose-500/10" style={{ left: x(today), width: dw }} />
              <div className="absolute top-0 bottom-0 w-px bg-rose-500" style={{ left: x(today) + dw / 2 }} />
            </div>

            {lanes.map((lane) => {
              const creating = drag?.kind === 'create' && drag.laneKey === lane.key ? drag : null;
              const isTarget = ghostLane?.key === lane.key;
              const creatable = canCreateIn(lane);
              return (
                <div
                  key={lane.key}
                  ref={lane.team ? teamRef : undefined}
                  className={
                    lane.team
                      ? `sticky z-[25] flex w-full border-b-2 border-zinc-300 shadow-sm ${isTarget ? 'bg-sky-50' : 'bg-[#f6f8fb]'}`
                      : `absolute flex w-full border-b border-line ${isTarget ? 'bg-sky-50/60' : ''}`
                  }
                  style={lane.team ? { top: SCALE_H + MS_H, height: lane.height } : { top: lane.top, height: lane.height }}
                >
                  <div
                    className={`sticky left-0 z-20 flex flex-col justify-center border-r border-line px-3 ${lane.team ? 'bg-[#f6f8fb]' : 'bg-white'}`}
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    <p className={`truncate text-[13px] font-medium ${lane.key === 'none' ? 'text-zinc-500' : ''} ${lane.team ? 'font-semibold' : ''}`}>{lane.label}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {lane.tasks.filter((t) => t.status !== 'done').length} việc đang mở{lane.sub ? ` · ${lane.sub}` : ''}
                    </p>
                  </div>
                  <div
                    className={`relative ${creatable ? 'cursor-crosshair' : ''}`}
                    style={{ width }}
                    data-lane={lane.key}
                    onPointerDown={(e) => onLaneDown(e, lane)}
                    onPointerMove={(e) => onLaneMove(e, lane)}
                    onPointerUp={() => onLaneUp(lane)}
                    onPointerCancel={() => setDrag(null)}
                  >
                    {lane.team && <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500" style={{ left: x(today) + dw / 2 }} />}
                    {creating && (
                      <div
                        className="pointer-events-none absolute z-10 rounded border-2 border-dashed border-sky-600 bg-sky-100/80"
                        style={{
                          left: Math.min(creating.a, creating.b) * dw + 1,
                          width: (Math.abs(creating.b - creating.a) + 1) * dw - 2,
                          top: PAD,
                          height: CHIP_H
                        }}
                      />
                    )}
                    {lane.tasks.map((t) => {
                      const p = preview(t);
                      const dim = ghostLane !== undefined && movingTask?.id === t.id && drag?.kind === 'move' && drag.from === lane.key;
                      return renderChip(p, lane, x(p.startDate), PAD + (lane.slots.get(t.id) ?? 0) * (CHIP_H + GAP), { dim });
                    })}
                    {isTarget && movingTask && renderChip(preview(movingTask), lane, x(preview(movingTask).startDate), PAD, { ghost: true })}

                    {quick?.laneKey === lane.key && (
                      <div
                        className="absolute z-30 w-72 border border-zinc-900 bg-white p-2 shadow-xl"
                        style={{ left: quick.a * dw, top: PAD }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          value={quickTitle}
                          onChange={(e) => setQuickTitle(e.target.value)}
                          onKeyDown={onQuickKey}
                          maxLength={300}
                          placeholder="Tên công việc rồi Enter…"
                          className="w-full border border-line px-2 py-1.5 text-sm outline-none focus:border-zinc-800"
                        />
                        <div className="mt-1.5 flex items-center gap-1.5" role="radiogroup" aria-label="Loại công việc">
                          {TASK_CATEGORIES.map((c) => (
                            <button
                              key={c}
                              type="button"
                              role="radio"
                              aria-checked={quickCategory === c}
                              title={TASK_CATEGORY_LABEL[c]}
                              onClick={() => setQuickCategory(c)}
                              className={`h-5 w-5 rounded-sm ${CATEGORY_STYLE[c].fill} ${quickCategory === c ? 'ring-2 ring-zinc-900 ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
                            />
                          ))}
                          <span className="ml-1 text-[11px] text-zinc-500">{TASK_CATEGORY_LABEL[quickCategory]}</span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-zinc-600">
                          {formatShort(dayIso(quick.a))} → {formatShort(dayIso(quick.b))} · {quick.b - quick.a + 1} ngày · {lane.team ? 'Cả nhóm' : lane.memberId ? lane.label.replace(' (bạn)', '') : 'Chưa giao'}
                          {autoMilestone(dayIso(quick.a)) && <> · mốc “{autoMilestone(dayIso(quick.a))!.name}”</>}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <button onClick={submitQuick} disabled={!quickTitle.trim()} className="bg-zinc-900 px-2.5 py-1 font-medium text-white disabled:opacity-40">
                            Tạo
                          </button>
                          <button
                            onClick={() => {
                              setDialog({
                                mode: 'create',
                                milestoneId: autoMilestone(dayIso(quick.a))?.id ?? null,
                                startDate: dayIso(quick.a),
                                dueDate: dayIso(quick.b),
                                assigneeId: lane.team ? '__team' : lane.memberId,
                                title: quickTitle,
                                category: quickCategory
                              });
                              setQuick(null);
                            }}
                            className="underline"
                          >
                            Chi tiết…
                          </button>
                          <button onClick={() => setQuick(null)} className="ml-auto text-zinc-500">
                            Huỷ (Esc)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
          tasks={tasks.filter((t) => !t.id.startsWith('temp-'))}
          key={dialog.mode === 'edit' ? dialog.task.id : `new-${dialog.parentId ?? ''}`}
          onClose={() => setDialog(null)}
          onOpen={setDialog}
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
