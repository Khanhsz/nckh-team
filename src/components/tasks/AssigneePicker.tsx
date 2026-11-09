'use client';

import { Icon } from '@/components/ui/Icon';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Member } from '@/lib/types';

/** Người phụ trách: cả nhóm, hoặc danh sách người (người đầu tiên = người chính). */
export interface AssigneeValue {
  team: boolean;
  ids: string[];
}

export const assigneeValueOf = (t: { isTeam: boolean; assigneeId: string | null; coAssigneeIds: string[] }): AssigneeValue => ({
  team: t.isTeam,
  ids: t.isTeam ? [] : [...(t.assigneeId ? [t.assigneeId] : []), ...t.coAssigneeIds.filter((id) => id !== t.assigneeId)]
});

export const sameAssignees = (a: AssigneeValue, b: AssigneeValue) => a.team === b.team && a.ids.join() === b.ids.join();

/**
 * Dropdown chọn nhiều người phụ trách.
 * - Tick nhiều người; người được tick đầu tiên là người chính (bấm ★ để đổi).
 * - "Cả nhóm" loại trừ các lựa chọn khác (ẩn khi allowTeam = false, vd. subtask).
 * - onClose được gọi khi đóng dropdown (dùng để lưu một lần).
 */
export function AssigneePicker({
  value,
  onChange,
  onClose,
  members,
  allowTeam = true,
  disabled,
  compact,
  currentUserId
}: {
  value: AssigneeValue;
  onChange: (v: AssigneeValue) => void;
  onClose?: (v: AssigneeValue) => void;
  members: Member[];
  allowTeam?: boolean;
  disabled?: boolean;
  compact?: boolean;
  currentUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const people = members.filter((m) => m.role !== 'viewer');
  const nameOf = (id: string) => people.find((m) => m.userId === id)?.displayName ?? members.find((m) => m.userId === id)?.displayName ?? '—';

  const close = () => {
    setOpen(false);
    onClose?.(valueRef.current);
  };

  // Vị trí cố định theo nút (để không bị bảng có overflow cắt mất)
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const width = Math.max(r.width, 230);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      const below = window.innerHeight - r.bottom;
      const top = below < 280 && r.top > below ? Math.max(8, r.top - 4 - Math.min(320, 40 + people.length * 30)) : r.bottom + 4;
      setPos({ left, top, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, people.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) => {
    const on = value.ids.includes(id);
    onChange({ team: false, ids: on ? value.ids.filter((x) => x !== id) : [...value.ids, id] });
  };
  const makePrimary = (id: string) => onChange({ team: false, ids: [id, ...value.ids.filter((x) => x !== id)] });

  const label = value.team
    ? 'Cả nhóm'
    : value.ids.length === 0
      ? '— Chưa giao —'
      : value.ids.length === 1
        ? nameOf(value.ids[0])
        : `${nameOf(value.ids[0])} +${value.ids.length - 1}`;
  const title = value.team ? 'Cả nhóm' : value.ids.map((id, i) => nameOf(id) + (i === 0 && value.ids.length > 1 ? ' (chính)' : '')).join(', ');

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        title={title || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex w-full items-center gap-1 border border-line bg-white text-left outline-none focus:border-primary disabled:bg-paper-2 disabled:text-zinc-500 ${
          compact ? 'max-w-44 px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-sm'
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${!value.team && value.ids.length === 0 ? 'text-zinc-400' : ''}`}>{label}</span>
        {!disabled && <span className="shrink-0 text-[10px] text-zinc-400">▾</span>}
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          role="listbox"
          aria-multiselectable="true"
          className="fixed z-[60] max-h-80 overflow-y-auto rounded-2xl border border-line bg-white p-1 text-sm shadow-xl"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {allowTeam && (
            <label className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-paper-2 ${value.team ? 'font-semibold' : ''}`}>
              <input type="checkbox" checked={value.team} onChange={() => onChange(value.team ? { team: false, ids: [] } : { team: true, ids: [] })} />
              <Icon name="team" size={15} className="text-primary" /> Cả nhóm
              <span className="ml-auto text-[10px] font-normal text-zinc-400">chia subtask</span>
            </label>
          )}
          {allowTeam && <div className="my-1 border-t border-line" />}
          {people.map((m) => {
            const idx = value.ids.indexOf(m.userId);
            const on = idx >= 0;
            return (
              <div key={m.userId} className={`flex items-center gap-2 px-2 py-1 hover:bg-paper-2 ${on ? 'font-medium' : ''}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(m.userId)} />
                  <span className="truncate">
                    {m.displayName}
                    {m.userId === currentUserId ? ' (bạn)' : ''}
                  </span>
                </label>
                {on && value.ids.length > 1 &&
                  (idx === 0 ? (
                    <span className="shrink-0 text-[10px] text-amber-700" title="Người phụ trách chính">
                      <Icon name="star" size={11} strokeWidth={2.2} className="inline" /> chính
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(m.userId)}
                      className="shrink-0 text-[10px] text-zinc-400 hover:text-amber-700"
                      title="Đặt làm người chính"
                    >
                      <Icon name="star" size={13} />
                    </button>
                  ))}
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between border-t border-line px-2 pt-1.5 text-[11px] text-zinc-500">
            <span>{value.team ? 'Việc chung' : value.ids.length ? `${value.ids.length} người` : 'Chưa giao'}</span>
            <button type="button" onClick={close} className="font-medium text-zinc-900 underline">
              Xong
            </button>
          </div>
        </div>
      )}
    </>
  );
}
