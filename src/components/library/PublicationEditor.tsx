'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PaperPublication } from '@/lib/types';
import { refreshPaperMetaAction, updatePublicationAction } from '@/app/(app)/projects/[id]/library/actions';

const field = 'w-full border border-line bg-white px-2 py-1 text-sm outline-none focus:border-primary';

/** Sửa tay / tra lại thông tin xuất bản của một bài */
export function PublicationEditor({ paperId, pub, canEdit }: { paperId: string; pub: PaperPublication; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    doi: pub.doi ?? '',
    journal: pub.journal ?? '',
    issns: pub.issns.map((x) => `${x.slice(0, 4)}-${x.slice(4)}`).join(', '),
    publisher: pub.publisher ?? '',
    year: pub.year ? String(pub.year) : ''
  });
  if (!canEdit) return null;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await updatePublicationAction(paperId, v);
      if (r.error) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  const lookup = () =>
    start(async () => {
      setError(null);
      const r = await refreshPaperMetaAction(paperId);
      if (r.error) return setError(r.error);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button onClick={lookup} disabled={pending} className="border border-ink-3/50 text-primary px-2.5 py-1 font-medium hover:bg-paper-2 disabled:opacity-50">
          {pending ? 'Đang tra…' : '↻ Tra lại qua Crossref'}
        </button>
        <button onClick={() => setOpen((o) => !o)} className="text-zinc-600 underline">
          {open ? 'Đóng' : 'Sửa tay (khi AI / Crossref nhận sai)'}
        </button>
        {error && <span className="text-rose-700">{error}</span>}
      </div>
      {open && (
        <div className="grid gap-2 border border-line p-3 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">
            Tên tạp chí / kỷ yếu
            <input className={field} value={v.journal} onChange={(e) => setV({ ...v, journal: e.target.value })} />
          </label>
          <label className="text-xs">
            ISSN (nhiều số cách nhau dấu phẩy)
            <input className={field} value={v.issns} onChange={(e) => setV({ ...v, issns: e.target.value })} placeholder="1234-5678, 2345-6789" />
          </label>
          <label className="text-xs">
            DOI
            <input className={field} value={v.doi} onChange={(e) => setV({ ...v, doi: e.target.value })} placeholder="10.xxxx/…" />
          </label>
          <label className="text-xs">
            Nhà xuất bản
            <input className={field} value={v.publisher} onChange={(e) => setV({ ...v, publisher: e.target.value })} />
          </label>
          <label className="text-xs">
            Năm
            <input className={field} value={v.year} onChange={(e) => setV({ ...v, year: e.target.value })} inputMode="numeric" />
          </label>
          <div className="sm:col-span-2">
            <button onClick={save} disabled={pending} className="bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
