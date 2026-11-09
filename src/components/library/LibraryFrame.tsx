'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Khung bảng thư viện: tự lấp đầy phần còn lại của màn hình (đo theo vị trí thật),
 * và có chế độ toàn màn hình (Esc để thoát).
 */
export function LibraryFrame({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [full, setFull] = useState(false);

  useLayoutEffect(() => {
    if (full) return;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(320, window.innerHeight - top - 16));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [full]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  return (
    <div
      ref={ref}
      className={full ? 'fixed inset-0 z-40 flex flex-col gap-2 bg-paper p-3' : 'flex flex-col gap-2'}
      style={full ? undefined : { height: height ?? 'calc(100vh - 220px)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <button
          onClick={() => setFull((f) => !f)}
          title={full ? 'Thoát toàn màn hình (Esc)' : 'Xem bảng toàn màn hình'}
          aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          className="border border-line bg-white px-2 py-1 text-sm leading-5 hover:bg-paper-2"
        >
          {full ? '✕' : '⛶'}
        </button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-auto border border-line bg-white">{children}</div>
    </div>
  );
}
