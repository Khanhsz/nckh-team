'use client';

import { useState, useTransition } from 'react';
import { extractPaperAction, setFieldVerifiedAction, updatePaperFieldAction } from '@/app/(app)/projects/[id]/library/actions';
import { AcademicText } from './AcademicText';

export function PaperFieldEditor({
  paperId,
  field,
  label,
  value,
  verifiedBy,
  canEdit
}: {
  paperId: string;
  field: string;
  label: string;
  value: string;
  verifiedBy: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="border border-line bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className={`text-[11px] ${verifiedBy ? 'text-emerald-700' : 'text-amber-600'}`}>
          {verifiedBy ? `✓ Đã xác nhận bởi ${verifiedBy}` : value ? 'AI tạo — chưa kiểm tra' : ''}
        </span>
        {canEdit && !editing && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            {value && (
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await setFieldVerifiedAction(paperId, field, !verifiedBy);
                    if (r.error) setError(r.error);
                  })
                }
                className="underline disabled:opacity-50"
              >
                {verifiedBy ? 'Bỏ xác nhận' : '✓ Xác nhận đúng với bài gốc'}
              </button>
            )}
            <button
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              className="underline"
            >
              Sửa
            </button>
          </div>
        )}
      </header>
      <div className="px-4 py-3 text-sm">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(16, Math.max(4, draft.split('\n').length + 1))}
              className="w-full border border-line p-2 font-mono text-xs outline-none focus:border-zinc-800"
            />
            <div className="flex items-center gap-3">
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await updatePaperFieldAction(paperId, field, draft);
                    if (r.error) setError(r.error);
                    else setEditing(false);
                  })
                }
                className="bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {pending ? 'Đang lưu…' : 'Lưu (tính là đã kiểm tra)'}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-zinc-600 underline">
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <AcademicText text={value} />
        )}
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </div>
    </section>
  );
}

export function ExtractOneButton({ paperId, label }: { paperId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await extractPaperAction(paperId);
            if (r.error) setError(r.error);
          })
        }
        className="bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {pending ? 'Đang trích xuất (30–90 giây)…' : label}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
