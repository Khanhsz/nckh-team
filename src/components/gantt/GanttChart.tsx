import type { Member, Milestone, Project, Task } from '@/lib/types';
import { TASK_STATUS_LABEL } from '@/lib/types';
import { addDays, diffDays, formatFull, formatShort, maxDate, minDate, todayISO, weekday } from '@/lib/dates';
import { STATUS_STYLE } from '@/components/ui/badges';

/**
 * Gantt render hoàn toàn phía server, không cần thư viện ngoài.
 * Bước sau: thêm lớp client để kéo-thả đổi ngày (gọi updateTask).
 */

export type GanttZoom = 'day' | 'week' | 'month';

const DAY_WIDTH: Record<GanttZoom, number> = { day: 30, week: 12, month: 4 };
const ROW_H = 36;
const HEADER_H = 48;
const LEFT_W = 320;

type Row =
  | { kind: 'milestone'; milestone: Milestone; count: number }
  | { kind: 'group'; label: string }
  | { kind: 'task'; task: Task };

interface Props {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  members: Member[];
  zoom: GanttZoom;
}

export function GanttChart({ project, milestones, tasks, members, zoom }: Props) {
  const today = todayISO();
  const dw = DAY_WIDTH[zoom];
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // ---- Khoảng thời gian hiển thị ----
  const start = addDays(minDate(project.startDate, today, ...tasks.map((t) => t.startDate)), -3);
  const end = addDays(maxDate(project.endDate, today, ...tasks.map((t) => t.dueDate), ...milestones.map((m) => m.dueDate)), 7);
  const totalDays = diffDays(start, end) + 1;
  const width = totalDays * dw;
  const x = (iso: string) => diffDays(start, iso) * dw;

  // ---- Các dòng: mốc → task thuộc mốc; task chưa gắn mốc ở cuối ----
  const rows: Row[] = [];
  for (const m of milestones) {
    const own = tasks.filter((t) => t.milestoneId === m.id);
    rows.push({ kind: 'milestone', milestone: m, count: own.length });
    own.forEach((task) => rows.push({ kind: 'task', task }));
  }
  const orphans = tasks.filter((t) => !t.milestoneId || !milestones.some((m) => m.id === t.milestoneId));
  if (orphans.length) {
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
    if (!last || last.key !== key) {
      months.push({ key, label: `Th${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`, left: i * dw, width: dw });
    } else {
      last.width += dw;
    }
    const wd = weekday(iso);
    if (zoom === 'day') ticks.push({ left: i * dw, label: iso.slice(8, 10), weekend: wd === 0 || wd === 6 });
    else if (zoom === 'week' && wd === 1) ticks.push({ left: i * dw, label: formatShort(iso), weekend: false });
  }

  // ---- Mũi tên phụ thuộc ----
  const arrows = tasks.flatMap((t) =>
    t.dependsOn.flatMap((depId) => {
      const dep = taskById.get(depId);
      const r1 = rowOf.get(depId);
      const r2 = rowOf.get(t.id);
      if (!dep || r1 === undefined || r2 === undefined) return [];
      const x1 = x(dep.dueDate) + dw;
      const y1 = r1 * ROW_H + ROW_H / 2;
      const x2 = x(t.startDate);
      const y2 = r2 * ROW_H + ROW_H / 2;
      const midX = x1 + 6;
      const d =
        x2 - 4 >= midX
          ? `M${x1},${y1} H${midX} V${y2} H${x2 - 2}`
          : `M${x1},${y1} H${midX} V${y2 - ROW_H / 2} H${x2 - 10} V${y2} H${x2 - 2}`;
      // Bắt đầu trước cả khi việc tiên quyết bắt đầu → gần như chắc chắn sai kế hoạch
      const conflict = t.startDate < dep.startDate;
      return [{ key: `${depId}->${t.id}`, d, conflict }];
    })
  );

  const todayX = x(today) + dw / 2;

  return (
    <div className="thin-scroll overflow-auto border border-line bg-white" style={{ maxHeight: 'calc(100vh - 290px)' }}>
      <div className="relative" style={{ width: LEFT_W + width }}>
        {/* ===== Header ===== */}
        <div className="sticky top-0 z-30 flex border-b border-line bg-white" style={{ height: HEADER_H }}>
          <div
            className="sticky left-0 z-40 flex items-end border-r border-line bg-white px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
            style={{ width: LEFT_W, minWidth: LEFT_W }}
          >
            Mốc / Công việc
          </div>
          <div className="relative" style={{ width }}>
            {months.map((m) => (
              <div
                key={m.key}
                className="absolute top-0 h-6 truncate border-l border-line px-1.5 text-[11px] font-semibold leading-6 text-zinc-700"
                style={{ left: m.left, width: m.width }}
              >
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

        {/* ===== Body ===== */}
        <div className="relative" style={{ height: bodyH }}>
          {/* Lớp nền: cuối tuần / lưới tuần */}
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
            if (r.kind === 'milestone') {
              const m = r.milestone;
              const passed = m.dueDate < today;
              return (
                <div key={`m-${m.id}`} className="absolute flex w-full border-b border-line bg-paper/60" style={{ top: i * ROW_H, height: ROW_H }}>
                  <div
                    className="sticky left-0 z-20 flex items-center gap-2 border-r border-line bg-paper px-3 text-[13px] font-semibold"
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    <span className="text-accent">◆</span>
                    <span className="truncate">{m.name}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-normal text-zinc-500">{formatShort(m.dueDate)}</span>
                  </div>
                  <div className="relative" style={{ width }}>
                    <div
                      title={`${m.name} — hạn ${formatFull(m.dueDate)}`}
                      className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${passed ? 'bg-zinc-400' : 'bg-accent'}`}
                      style={{ left: x(m.dueDate) + dw / 2 }}
                    />
                  </div>
                </div>
              );
            }
            if (r.kind === 'group') {
              return (
                <div key={`g-${i}`} className="absolute flex w-full border-b border-line bg-paper/60" style={{ top: i * ROW_H, height: ROW_H }}>
                  <div
                    className="sticky left-0 z-20 flex items-center border-r border-line bg-paper px-3 text-[13px] font-semibold text-zinc-500"
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    {r.label}
                  </div>
                </div>
              );
            }

            const t = r.task;
            const assignee = t.assigneeId ? memberById.get(t.assigneeId) : undefined;
            const left = x(t.startDate);
            const w = Math.max((diffDays(t.startDate, t.dueDate) + 1) * dw, 6);
            const overdue = t.status !== 'done' && t.dueDate < today;
            const deps = t.dependsOn.map((d) => taskById.get(d)?.title).filter(Boolean);
            const tooltip = [
              t.title,
              `${formatFull(t.startDate)} → ${formatFull(t.dueDate)}`,
              `Phụ trách: ${assignee?.displayName ?? 'chưa giao'}`,
              `${TASK_STATUS_LABEL[t.status]} · ${t.progress}%`,
              deps.length ? `Sau: ${deps.join('; ')}` : ''
            ]
              .filter(Boolean)
              .join('\n');

            return (
              <div key={t.id} className="absolute flex w-full border-b border-line/60" style={{ top: i * ROW_H, height: ROW_H }}>
                <div
                  className="sticky left-0 z-20 flex items-center gap-2 border-r border-line bg-white pl-7 pr-3 text-[13px]"
                  style={{ width: LEFT_W, minWidth: LEFT_W }}
                  title={tooltip}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[t.status].barFill}`} />
                  <span className={`truncate ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}>{t.title}</span>
                  <span className={`ml-auto shrink-0 text-[11px] ${overdue ? 'font-semibold text-rose-700' : 'text-zinc-500'}`}>
                    {formatShort(t.dueDate)}
                  </span>
                </div>
                <div className="relative" style={{ width }}>
                  <div
                    title={tooltip}
                    className={`absolute top-2 h-5 overflow-hidden rounded-sm ${STATUS_STYLE[t.status].bar} ${overdue ? 'ring-2 ring-rose-500' : ''}`}
                    style={{ left, width: w }}
                  >
                    <div className={`h-full ${STATUS_STYLE[t.status].barFill}`} style={{ width: `${t.progress}%` }} />
                  </div>
                  {assignee && (
                    <span className="absolute top-2 whitespace-nowrap text-[11px] leading-5 text-zinc-600" style={{ left: left + w + 6 }}>
                      {assignee.displayName.split(' ').slice(-2).join(' ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Mũi tên phụ thuộc */}
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
                stroke={a.conflict ? '#e11d48' : '#a1a1aa'}
                strokeWidth={1.2}
                strokeDasharray={a.conflict ? '3 2' : undefined}
                markerEnd={`url(#${a.conflict ? 'arrow-bad' : 'arrow'})`}
              />
            ))}
          </svg>

          {/* Vạch hôm nay */}
          <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-500" style={{ left: LEFT_W + todayX }} />
        </div>
      </div>
    </div>
  );
}
