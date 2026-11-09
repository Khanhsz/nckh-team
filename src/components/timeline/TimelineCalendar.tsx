'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as RPE } from 'react';
import { useRouter } from 'next/navigation';
import type { Member, Milestone, Project, ProjectRole, Task, TaskCategory } from '@/lib/types';
import { isAssignedTo, taskAssignees, TASK_CATEGORIES, TASK_CATEGORY_LABEL, TASK_STATUS_LABEL } from '@/lib/types';
import { addDays, diffDays, formatFull, formatShort, maxDate, minDate, weekday } from '@/lib/dates';
import { Icon } from '@/components/ui/Icon';
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
const LEFT_W = 168;
const SCALE_H_BIG = 78; // tháng + thứ + số ngày lớn (khi ngày đủ rộng)
const SCALE_H_SMALL = 50;
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
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = dialog !== null;
  const [flash, setFlash] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [saving, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const scrollRaf = useRef(0);
  const [frameH, setFrameH] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTasks(tasksProp), [tasksProp]);

  // Bảng cao bằng vùng nội dung trừ thanh công cụ (dính trên cùng khi cuộn trang):
  // cuộn trang xuống thì ảnh bìa/tiêu đề trôi lên và bảng chiếm trọn màn hình. Chế độ toàn màn hình: Esc để thoát.
  const toolbarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (full) return;
    const main = scrollRef.current?.closest('main') as HTMLElement | null;
    const measure = () => {
      const avail = (main?.clientHeight ?? window.innerHeight) - (toolbarRef.current?.offsetHeight ?? 52) - 28;
      setFrameH(Math.max(320, avail));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (main) ro.observe(main);
    if (toolbarRef.current) ro.observe(toolbarRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [full]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !dialogOpenRef.current && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
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
  const scaleH = dw >= 30 ? SCALE_H_BIG : SCALE_H_SMALL;
  const pendingScroll = useRef<number | null>(null);
  const stretchRef = useRef<{ x0: number; d0: number; dw0: number; left0: number } | null>(null);
  const [stretching, setStretching] = useState(false);

  /** Vị trí cuộn lúc mở: chế độ Tuần bắt đầu từ thứ Hai tuần này, còn lại để hôm nay cách mép trái 2 ngày */
  function openScrollLeft(d: number, vw: number) {
    const s0 = addDays(minDate(project.startDate, today, ...tasksProp.map((t) => t.startDate)), -14);
    const week = d * 7 >= vw * 0.9;
    const anchor = week ? addDays(today, -((weekday(today) + 6) % 7)) : addDays(today, -2);
    return Math.max(0, diffDays(s0, anchor) * d);
  }
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
    const nd = saved > 0 ? saved : w / PRESET_DAYS[initialZoom];
    // Mở trang là thấy hôm nay ngay: tính vị trí cuộn theo độ rộng ngày cuối cùng (không phải giá trị tạm lúc render đầu)
    const left = openScrollLeft(nd, w);
    pendingScroll.current = left;
    setDw(nd);
    el.scrollLeft = left;
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
    const next = preset && prev !== viewW ? viewW / PRESET_DAYS[preset] : dw < minDw - 0.05 || dw > maxDw + 0.05 ? clampDw(dw) : dw;
    if (next === dw) return;
    // Giữ nguyên ngày đang ở mép trái khi độ rộng ngày đổi theo cỡ khung
    const el = scrollRef.current;
    if (el) pendingScroll.current = (el.scrollLeft / dw) * next;
    setDw(next);
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


  // ---- Làn: thành viên có thể nhận việc + "Chưa giao" ----
  const lanes: Lane[] = useMemo(() => {
    const workers = members.filter((m) => m.role !== 'viewer');
    const teamTasks = tasks.filter((t) => t.isTeam);
    const defs: { key: string; label: string; sub: string | null; memberId: string | null; team?: boolean }[] = [];
    if (teamTasks.length || isOwner) defs.push({ key: 'team', label: 'Cả nhóm', sub: 'Việc chung, chia subtask cho từng người', memberId: null, team: true });
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
        className={`group absolute touch-none overflow-hidden rounded-md border text-[12px] leading-tight ${
          isSub ? `${CATEGORY_STYLE[t.category].sub} border-l-[4px] ${CATEGORY_STYLE[t.category].edge}` : CATEGORY_STYLE[t.category].chip
        } ${
          t.status === 'review' ? 'border-2 border-dashed !border-current/40' : ''
        } ${t.status === 'done' ? 'opacity-55' : ''} ${overdue ? 'ring-2 ring-[#d93025]' : ''} ${opts.ghost ? 'pointer-events-none z-20 shadow-lg ring-2 ring-primary' : ''} ${opts.dim ? 'opacity-30' : ''} ${
          hoverFamily && !opts.ghost ? (hoverFamily.has(t.id) ? 'z-10 shadow-[0_2px_6px_rgba(60,64,67,.3)] ring-2 ring-primary' : 'opacity-40') : ''
        } ${t.isTeam ? 'font-semibold' : ''} ${
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } ${t.id.startsWith('temp-') ? 'animate-pulse' : ''}`}
        style={{ left: left + 1, top, width: w, height: CHIP_H }}
      >
        <div
          className="pointer-events-none flex h-full items-center gap-1 px-1.5"
          // Việc bắt đầu trước mép trái khung nhìn: đẩy tên vào trong để luôn đọc được
          style={left < scrollX && !opts.ghost ? { paddingLeft: Math.min(scrollX - left, Math.max(0, w - 72)) + 6 } : undefined}
        >
          {isSub && <Icon name="subtask" size={12} className="opacity-60" />}
          {t.isTeam && <Icon name="team" size={13} className="opacity-80" />}
          <span className={`truncate ${isSub ? '' : 'font-medium'} ${t.status === 'done' ? 'line-through opacity-60' : ''}`}>{t.title}</span>
          {shared > 1 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 px-1.5 text-[10px] font-semibold leading-4" title={`${shared} người cùng làm`}>
              <Icon name="user" size={11} strokeWidth={2.2} />
              {shared}
            </span>
          )}
          {kids.length > 0 && (
            <span className={`${shared > 1 ? '' : 'ml-auto'} flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 px-1.5 text-[10px] font-semibold leading-4`} title={`${kids.length} subtask`}>
              <Icon name="subtask" size={11} strokeWidth={2.2} />
              {kids.length}
            </span>
          )}
        </div>
        <div className={`pointer-events-none absolute bottom-0 left-0 h-[3px] ${CATEGORY_STYLE[t.category].fill}`} style={{ width: `${t.progress}%` }} />
        {draggable && (
          <>
            <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize group-hover:bg-black/10" />
            <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize group-hover:bg-black/10" />
          </>
        )}
      </div>
    );
  };

  // Ô đang kéo sang làn khác → vẽ "bóng" ở làn đích
  const movingTask = drag && drag.kind === 'move' && drag.moved ? tasks.find((t) => t.id === drag.id) : undefined;
  const ghostLane = movingTask && drag && drag.kind === 'move' && drag.laneKey !== drag.from ? laneByKey.get(drag.laneKey) : undefined;

  // ---- Số liệu nhanh ----
  const realTasks = tasks.filter((t) => !t.id.startsWith('temp-'));
  const doneCount = realTasks.filter((t) => t.status === 'done').length;
  const lateCount = realTasks.filter((t) => t.status !== 'done' && t.dueDate < today).length;
  const reviewCount = realTasks.filter((t) => t.status === 'review').length;
  const mineOpen = realTasks.filter((t) => t.status !== 'done' && isAssignedTo(t, userId)).length;
  const overall = realTasks.length ? Math.round(realTasks.reduce((sum, t) => sum + t.progress, 0) / realTasks.length) : 0;
  const mondayOf = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7));
  const weekMode = dw * 7 >= viewW * 0.9;
  // Chế độ Tuần: bắt đầu từ thứ Hai như Google Calendar; chế độ khác: để hôm nay cách mép trái 4 ngày
  const scrollToToday = () =>
    scrollRef.current?.scrollTo({ left: Math.max(0, weekMode ? x(mondayOf(today)) : x(today) - 2 * dw), behavior: 'smooth' });
  const iconBtn = 'flex h-9 w-9 items-center justify-center text-ink-2 hover:bg-paper-2';
  const navStep = weekMode ? 7 : 30;
  const scrollByDays = (n: number) => scrollRef.current?.scrollBy({ left: n * dw, behavior: 'smooth' });
  const centerIso = addDays(start, Math.max(0, Math.round((scrollX + viewW / 2) / dw)));
  const centerLabel = `Tháng ${Number(centerIso.slice(5, 7))}, ${centerIso.slice(0, 4)}`;
  const help = isOwner
    ? [
        'Quét chuột trên làn Cả nhóm để tạo việc chung, trên làn một người để giao riêng',
        'Kéo ô để dời ngày · kéo mép trái/phải để đổi độ dài',
        'Kéo ô sang làn khác để giao lại · kéo ◆ để dời mốc',
        'Rê chuột lên việc để làm nổi việc cha, subtask và người cùng làm',
        'Ctrl + cuộn chuột, hoặc kéo trên thanh ngày, để co giãn'
      ]
    : role === 'editor'
      ? ['Quét trên làn của bạn để tự tạo việc', 'Kéo việc của bạn để dời / đổi độ dài', 'Bấm ô để xem chi tiết', 'Ctrl + cuộn chuột để co giãn']
      : ['Bấm ô để xem chi tiết công việc', 'Ctrl + cuộn chuột để co giãn'];

  return (
    <div className={full ? 'fixed inset-0 z-40 flex flex-col gap-3 bg-white p-4' : 'flex flex-col gap-3'}>
      <div
        ref={toolbarRef}
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${full ? '' : 'sticky top-0 z-30 -mx-4 bg-white px-4 py-2'}`}
      >
        {/* Điều hướng thời gian — như Google Calendar */}
        <button onClick={scrollToToday} className="h-9 rounded-full border border-ink-3/50 px-4 text-sm font-medium text-ink-2 hover:bg-paper-2">
          Hôm nay
        </button>
        <div className="flex items-center">
          <button onClick={() => scrollByDays(-navStep)} className={iconBtn} title={`Lùi ${navStep} ngày`} aria-label="Lùi">
            <Icon name="chevronLeft" size={20} />
          </button>
          <button onClick={() => scrollByDays(navStep)} className={iconBtn} title={`Tới ${navStep} ngày`} aria-label="Tới">
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
        <h2 className="min-w-[9.5rem] text-[22px] font-normal leading-7 text-ink">{centerLabel}</h2>

        {/* Số liệu: chữ thường, chỉ tô màu khi cần chú ý */}
        <dl className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <div className="flex items-center gap-2 rounded-full bg-paper px-3 py-1" title="Tiến độ trung bình mọi công việc">
            <dt className="sr-only">Tiến độ</dt>
            <dd className="font-semibold tabular-nums text-ink">{overall}%</dd>
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${overall}%` }} />
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-paper px-3 py-1" title="Việc đã hoàn thành / tổng số việc">
            <dd className="font-semibold tabular-nums text-ink">
              {doneCount}/{realTasks.length}
            </dd>
            <dt className="text-ink-3">xong</dt>
          </div>
          {lateCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-[#fce8e6] px-3 py-1 text-[#a50e0e]" title="Việc chưa xong đã quá hạn">
              <dd className="font-semibold tabular-nums">{lateCount}</dd>
              <dt>quá hạn</dt>
            </div>
          )}
          {reviewCount > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-[#fef7e0] px-3 py-1 text-[#7a5900]" title="Việc đang chờ trưởng nhóm duyệt">
              <dd className="font-semibold tabular-nums">{reviewCount}</dd>
              <dt>chờ duyệt</dt>
            </div>
          )}
          {role !== 'viewer' && (
            <div className="flex items-center gap-1 rounded-full bg-primary-container/60 px-3 py-1 text-on-primary-container" title="Việc của bạn chưa xong">
              <dd className="font-semibold tabular-nums">{mineOpen}</dd>
              <dt>việc của bạn</dt>
            </div>
          )}
        </dl>

        {/* Trạng thái thao tác */}
        <div className="min-w-0 flex-1 text-xs" aria-live="polite">
          {(stretching || dragLabel) && (
            <span className="rounded-full bg-ink px-3 py-1.5 text-white">{dragLabel ?? `${Math.round(viewW / dw)} ngày trong khung`}</span>
          )}
          {!dragLabel && !stretching && saving && <span className="text-ink-3">Đang lưu…</span>}
          {!dragLabel && !stretching && !saving && flash && (
            <span className={`inline-block max-w-full truncate rounded-full px-3 py-1.5 align-middle ${flash.type === 'error' ? 'bg-[#fce8e6] text-[#a50e0e]' : 'bg-[#e6f4ea] text-[#0d652d]'}`}>
              {flash.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex overflow-hidden rounded-full border border-ink-3/50 text-sm" role="group" aria-label="Chế độ xem">
            {(Object.keys(PRESET_DAYS) as TimelineZoom[]).map((z) => {
              const on = Math.abs(dw - viewW / PRESET_DAYS[z]) < 0.6;
              return (
                <button
                  key={z}
                  onClick={() => {
                    const nd = clampDw(viewW / PRESET_DAYS[z]);
                    if (z !== 'week') return zoomTo(nd);
                    // Sang Tuần: hiện tuần chứa hôm nay (nếu đang thấy), không thì tuần chứa ngày ở giữa
                    const visEnd = addDays(start, Math.floor((scrollX + viewW) / dw));
                    const anchor = today >= addDays(start, Math.floor(scrollX / dw)) && today <= visEnd ? today : centerIso;
                    pendingScroll.current = Math.max(0, diffDays(start, mondayOf(anchor)) * nd);
                    setDw(nd);
                  }}
                  aria-pressed={on}
                  className={`h-9 rounded-none px-4 ${on ? 'bg-primary-container font-medium text-on-primary-container' : 'text-ink-2 hover:bg-paper-2'}`}
                >
                  {PRESET_LABEL[z]}
                </button>
              );
            })}
          </div>
          <button onClick={() => zoomTo(dw / 1.25)} className={iconBtn} title="Thu hẹp ngày (Ctrl + cuộn xuống)" aria-label="Thu hẹp ngày">
            <span className="text-lg leading-none">−</span>
          </button>
          <button onClick={() => zoomTo(dw * 1.25)} className={iconBtn} title="Giãn rộng ngày (Ctrl + cuộn lên)" aria-label="Giãn rộng ngày">
            <Icon name="plus" size={18} />
          </button>
          <details className="relative">
            <summary className={`${iconBtn} cursor-pointer list-none`} title="Chú thích và hướng dẫn" aria-label="Chú thích và hướng dẫn">
              <Icon name="info" size={20} />
            </summary>
            <div className="absolute right-0 z-50 mt-1 w-80 space-y-3 rounded-2xl border border-line bg-white p-4 text-xs shadow-[0_4px_16px_rgba(60,64,67,.2)]">
              <div>
                <p className="mb-2 text-sm font-medium">Chú thích</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-ink-2">
                  {TASK_CATEGORIES.map((c) => (
                    <span key={c} className="flex items-center gap-2">
                      <span className={`inline-block h-3 w-3 rounded-full ${CATEGORY_STYLE[c].fill}`} />
                      {TASK_CATEGORY_LABEL[c]}
                    </span>
                  ))}
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-5 rounded border-2 border-dashed border-ink-3" />
                    Chờ duyệt
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-5 rounded ring-2 ring-[#d93025]" />
                    Quá hạn
                  </span>
                  <span className="flex items-center gap-2">
                    <Icon name="subtask" size={14} className="text-ink-3" />
                    Subtask
                  </span>
                  <span className="flex items-center gap-2">
                    <Icon name="user" size={14} className="text-ink-3" />
                    Nhiều người làm
                  </span>
                  <span className="flex items-center gap-2">
                    <Icon name="team" size={14} className="text-ink-3" />
                    Việc cả nhóm
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-primary" />
                    Mốc
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Thao tác</p>
                <ul className="list-disc space-y-1 pl-4 text-ink-2">
                  {help.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <button onClick={() => setFull((f) => !f)} className={iconBtn} title={full ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'} aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
            <Icon name={full ? 'close' : 'expand'} size={18} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const left = e.currentTarget.scrollLeft;
          if (scrollRaf.current) return;
          scrollRaf.current = requestAnimationFrame(() => {
            scrollRaf.current = 0;
            setScrollX(left);
          });
        }}
        className={`thin-scroll overflow-auto rounded-2xl border border-line bg-white ${drag ? 'select-none' : ''} ${full ? 'min-h-0 flex-1' : ''}`}
        style={full ? undefined : { height: frameH === null ? 'calc(100vh - 200px)' : Math.min(frameH, scaleH + MS_H + bodyH + 2) }}
      >
        <div className="relative" style={{ width: LEFT_W + width }}>
          {/* ===== Header: tháng · ngày · dải mốc ===== */}
          <div className="sticky top-0 z-30 flex border-b border-line bg-white" style={{ height: scaleH + MS_H }}>
            <div className="sticky left-0 z-40 flex flex-col justify-end border-r border-line bg-white" style={{ width: LEFT_W, minWidth: LEFT_W }}>
              <div className="flex items-center gap-2 px-4 text-xs text-ink-3" style={{ height: MS_H }}>
                <span className="block h-2 w-2 rotate-45 rounded-[1px] bg-primary" aria-hidden />
                Mốc
              </div>
            </div>
            <div className="relative" style={{ width }}>
              {months.map((m) => (
                <div key={m.key} className="absolute top-0 h-6 border-l border-line text-xs font-medium leading-6 text-ink-2" style={{ left: m.left, width: m.width }}>
                  {/* Nhãn tháng bám mép trái khi tháng bắt đầu ngoài khung nhìn */}
                  {m.width > 60 && (
                    <span className="sticky inline-block whitespace-nowrap px-2" style={{ left: LEFT_W }}>
                      {m.label}
                    </span>
                  )}
                </div>
              ))}
              {dw < 18
                ? days
                    .filter((d) => d.wd === 1)
                    .map((d) => (
                      <div key={d.iso} className="absolute top-7 h-5 border-l border-line pl-1.5 text-xs tabular-nums leading-5 text-ink-2" style={{ left: d.left, width: 7 * dw }}>
                        {formatShort(d.iso)}
                      </div>
                    ))
                : days.map((d) => {
                    const isToday = d.iso === today;
                    const weekend = d.wd === 0 || d.wd === 6;
                    const big = dw >= 30;
                    return (
                      <div key={d.iso} className="absolute top-6 flex flex-col items-center" style={{ left: d.left, width: dw }}>
                        {big && (
                          <span className={`mt-1 text-[11px] font-medium leading-4 ${isToday ? 'text-primary' : 'text-ink-3'}`}>{WD[d.wd]}</span>
                        )}
                        <span
                          className={`flex items-center justify-center rounded-full tabular-nums ${big ? (dw >= 46 ? 'mt-0.5 h-10 w-10 text-[22px] leading-none' : 'mt-1 h-7 w-7 text-[15px] leading-none') : 'mt-0.5 h-6 w-6 text-[12px]'} ${
                            isToday ? 'bg-primary font-medium text-white' : weekend ? 'text-ink-3' : 'text-ink-2'
                          }`}
                        >
                          {Number(d.iso.slice(8))}
                        </span>
                      </div>
                    );
                  })}
              {/* Vùng kéo để co giãn độ rộng ngày */}
              <div
                className={`absolute left-0 top-0 z-10 touch-none ${stretching ? 'cursor-grabbing' : 'cursor-col-resize'}`}
                style={{ width, height: scaleH }}
                title="Kéo sang phải để giãn ngày, sang trái để thu hẹp (hoặc Ctrl + cuộn chuột)"
                onPointerDown={onScaleDown}
                onPointerMove={onScaleMove}
                onPointerUp={onScaleUp}
                onPointerCancel={onScaleUp}
              />
              {/* Dải mốc */}
              <div className="absolute left-0 border-t border-line bg-white" style={{ top: scaleH, height: MS_H, width }}>
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
                    <span className={`block h-3 w-3 shrink-0 rotate-45 rounded-[2px] ${m.dueDate < today ? 'bg-ink-3/50' : 'bg-primary'} ${drag?.kind === 'milestone' && drag.id === m.id ? 'ring-2 ring-primary/40' : ''}`} />
                    <span className={m.dueDate < today ? 'text-ink-3' : 'text-ink-2'}>{m.name}</span>
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
                  <div key={d.iso} className="absolute top-0 bottom-0 bg-paper" style={{ left: d.left, width: dw }} />
                ) : dw >= 18 ? (
                  <div key={d.iso} className="absolute top-0 bottom-0 border-l border-line/70" style={{ left: d.left }} />
                ) : null
              )}
              {viewMilestones.map((m) => (
                <div key={m.id} className="absolute top-0 bottom-0 border-l border-dashed border-primary/35" style={{ left: x(m.dueDate) + dw / 2 }} />
              ))}
              {/* Vạch "hôm nay" kiểu Google Calendar: đường đỏ mảnh + chấm đầu */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#ea4335]" style={{ left: x(today) + dw / 2 - 1 }} />
              <div className="absolute -top-1.5 h-3 w-3 rounded-full bg-[#ea4335]" style={{ left: x(today) + dw / 2 - 6 }} />
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
                      ? `sticky z-[25] flex w-full border-b border-line shadow-[0_1px_3px_rgba(60,64,67,.15)] ${isTarget ? 'bg-primary-container/60' : 'bg-paper'}`
                      : `absolute flex w-full border-b border-line/70 ${isTarget ? 'bg-primary-container/30' : ''}`
                  }
                  style={lane.team ? { top: scaleH + MS_H, height: lane.height } : { top: lane.top, height: lane.height }}
                >
                  <div
                    className={`sticky left-0 z-20 flex flex-col justify-center border-r border-line px-3 ${lane.team ? 'bg-paper' : 'bg-white'}`}
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    <p
                      className={`flex items-center gap-1.5 truncate text-[13px] font-medium ${lane.key === 'none' ? 'text-ink-3' : 'text-ink'}`}
                      title={lane.sub ? `${lane.label}: ${lane.sub}` : lane.label}
                    >
                      {lane.team && <Icon name="team" size={15} className="text-primary" />}
                      <span className="truncate">{lane.label}</span>
                      {lane.sub === 'Trưởng nhóm' && <Icon name="crown" size={13} className="shrink-0 text-[#b06000]" />}
                    </p>
                    <p className="truncate text-[11px] text-ink-3">
                      <b className="tabular-nums text-ink">{lane.tasks.filter((t) => t.status !== 'done').length}</b> đang mở
                      {lane.tasks.some((t) => t.status !== 'done' && t.dueDate < today) && (
                        <span className="ml-1.5 font-semibold text-[#d93025]">{lane.tasks.filter((t) => t.status !== 'done' && t.dueDate < today).length} trễ</span>
                      )}
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
                    {lane.team && <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#ea4335]" style={{ left: x(today) + dw / 2 - 1 }} />}
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
                        className="absolute z-30 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl"
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
                          className="w-full border border-line px-2 py-1.5 text-sm outline-none focus:border-primary"
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
                          <button onClick={submitQuick} disabled={!quickTitle.trim()} className="bg-primary px-2.5 py-1 font-medium text-white disabled:opacity-40">
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
