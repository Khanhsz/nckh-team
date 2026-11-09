'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogStatus } from '@/lib/data/queries';
import { parseNameList, parseScopusFile, parseSjrCsv, type FlagRow, type SjrRow } from '@/lib/catalog/parse';
import {
  clearCatalogAction,
  finishCatalogImportAction,
  importBeallFromWebAction,
  insertFlagsAction,
  insertSjrAction,
  type CatalogKind
} from '@/lib/catalog/actions';

const BATCH = 800;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'chưa có');

type Job = { kind: CatalogKind; text: string; pct?: number; error?: boolean; done?: boolean } | null;

export function CatalogManager({ status, canEdit }: { status: CatalogStatus; canEdit: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<Job>(null);
  const [pasteKind, setPasteKind] = useState<'beall_publisher' | 'beall_journal'>('beall_publisher');
  const [paste, setPaste] = useState('');
  const sjrRef = useRef<HTMLInputElement>(null);
  const scRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(job && !job.done && !job.error);

  /** Xoá danh mục cũ rồi gửi theo lô */
  async function upload<T>(kind: CatalogKind, rows: T[], send: (b: T[]) => Promise<{ error?: string }>, label: string) {
    const cleared = await clearCatalogAction(kind);
    if (cleared.error) throw new Error(cleared.error);
    for (let i = 0; i < rows.length; i += BATCH) {
      setJob({ kind, text: `Đang lưu ${label}: ${Math.min(i + BATCH, rows.length).toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')}`, pct: (i / rows.length) * 100 });
      const r = await send(rows.slice(i, i + BATCH));
      if (r.error) throw new Error(r.error);
    }
    await finishCatalogImportAction();
  }

  async function run(kind: CatalogKind, work: () => Promise<string>) {
    try {
      setJob({ kind, text: 'Đang đọc file…' });
      const msg = await work();
      setJob({ kind, text: msg, done: true });
      router.refresh();
    } catch (e) {
      setJob({ kind, text: e instanceof Error ? e.message : 'Lỗi không xác định.', error: true });
    }
  }

  const onSjr = (file: File) =>
    run('sjr', async () => {
      const { rows, year } = parseSjrCsv(await file.text());
      await upload<SjrRow>('sjr', rows, insertSjrAction, 'tạp chí SCImago');
      return `Đã nạp ${rows.length.toLocaleString('vi-VN')} tạp chí SCImago${year ? ` (năm ${year})` : ''}.`;
    });

  const onScopus = (file: File) =>
    run('scopus_discontinued', async () => {
      const rows = await parseScopusFile(file, (t) => setJob({ kind: 'scopus_discontinued', text: t }));
      await upload<FlagRow>('scopus_discontinued', rows, insertFlagsAction, 'tạp chí bị Scopus loại');
      return `Đã nạp ${rows.length.toLocaleString('vi-VN')} tạp chí bị Scopus ngừng chỉ mục.`;
    });

  const onBeallWeb = () =>
    run('beall', async () => {
      setJob({ kind: 'beall', text: 'Đang tải beallslist.net…' });
      const r = await importBeallFromWebAction();
      if (r.error) throw new Error(r.error);
      return `Đã nạp danh sách Beall: ${r.publishers} NXB, ${r.journals} tạp chí.`;
    });

  const onBeallPaste = () =>
    run('beall', async () => {
      const rows = parseNameList(paste, pasteKind);
      if (rows.length === 0) throw new Error('Chưa có tên nào — mỗi dòng một tên.');
      // Dán thủ công: chỉ thay phần cùng loại (NXB hoặc tạp chí)
      for (let i = 0; i < rows.length; i += BATCH) {
        const r = await insertFlagsAction(rows.slice(i, i + BATCH));
        if (r.error) throw new Error(r.error);
      }
      await finishCatalogImportAction();
      setPaste('');
      return `Đã thêm ${rows.length} ${pasteKind === 'beall_publisher' ? 'NXB' : 'tạp chí'} vào danh sách cảnh báo.`;
    });

  const card = 'space-y-2 border border-line p-3';
  const fileBtn = 'cursor-pointer bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50';
  const jobLine = (kind: CatalogKind) =>
    job?.kind === kind && (
      <div className={`text-xs ${job.error ? 'text-rose-700' : job.done ? 'text-emerald-700' : 'text-zinc-600'}`}>
        <p>{job.text}</p>
        {!job.done && !job.error && job.pct !== undefined && (
          <div className="mt-1 h-1 w-full bg-zinc-200">
            <div className="h-full bg-primary transition-all" style={{ width: `${job.pct}%` }} />
          </div>
        )}
      </div>
    );

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* SCImago */}
      <div className={card}>
        <p className="text-sm font-semibold">① Hạng Q — SCImago (SJR)</p>
        <p className="text-xs text-zinc-600">
          <b className="tabular-nums">{status.sjr.count.toLocaleString('vi-VN')}</b> tạp chí{status.sjr.year ? ` · năm ${status.sjr.year}` : ''} · cập nhật {fmt(status.sjr.updatedAt)}
        </p>
        {canEdit && (
          <>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-zinc-500">
              <li>
                Mở{' '}
                <a className="underline" href="https://www.scimagojr.com/journalrank.php" target="_blank" rel="noreferrer">
                  scimagojr.com/journalrank.php
                </a>{' '}
                (để “All subject areas”), bấm <b>Download data</b>.
              </li>
              <li>Chọn file .csv vừa tải. Làm lại mỗi năm khi SCImago ra bảng mới.</li>
            </ol>
            <input ref={sjrRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onSjr(e.target.files[0])} />
            <button disabled={busy} onClick={() => sjrRef.current?.click()} className={fileBtn}>
              Chọn file SCImago (.csv)
            </button>
          </>
        )}
        {jobLine('sjr')}
      </div>

      {/* Scopus discontinued */}
      <div className={card}>
        <p className="text-sm font-semibold">Tạp chí bị Scopus loại</p>
        <p className="text-xs text-zinc-600">
          <b className="tabular-nums">{status.scopus.count.toLocaleString('vi-VN')}</b> tạp chí · cập nhật {fmt(status.scopus.updatedAt)}
        </p>
        {canEdit && (
          <>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-zinc-500">
              <li>
                Mở{' '}
                <a className="underline" href="https://www.elsevier.com/products/scopus/content" target="_blank" rel="noreferrer">
                  trang nội dung Scopus (Elsevier)
                </a>
                , tải <b>Source title list</b> (gồm danh sách Discontinued).
              </li>
              <li>Chọn file .xlsx (hoặc .csv) vừa tải. Elsevier cập nhật hằng tháng.</li>
            </ol>
            <input ref={scRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && onScopus(e.target.files[0])} />
            <button disabled={busy} onClick={() => scRef.current?.click()} className={fileBtn}>
              Chọn file Scopus (.xlsx)
            </button>
          </>
        )}
        {jobLine('scopus_discontinued')}
      </div>

      {/* Beall */}
      <div className={card}>
        <p className="text-sm font-semibold">Danh sách Beall (tham khảo)</p>
        <p className="text-xs text-zinc-600">
          <b className="tabular-nums">{status.beall.publishers.toLocaleString('vi-VN')}</b> NXB · <b className="tabular-nums">{status.beall.journals.toLocaleString('vi-VN')}</b> tạp chí · cập nhật{' '}
          {fmt(status.beall.updatedAt)}
        </p>
        {canEdit && (
          <>
            <button disabled={busy} onClick={onBeallWeb} className={fileBtn}>
              Tải tự động từ beallslist.net
            </button>
            <details className="text-[11px] text-zinc-500">
              <summary className="cursor-pointer">Hoặc dán danh sách thủ công</summary>
              <div className="mt-1.5 space-y-1.5">
                <select value={pasteKind} onChange={(e) => setPasteKind(e.target.value as typeof pasteKind)} className="border border-line bg-white px-1.5 py-1 text-xs">
                  <option value="beall_publisher">Nhà xuất bản</option>
                  <option value="beall_journal">Tạp chí</option>
                </select>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={4}
                  placeholder="Mỗi dòng một tên…"
                  className="w-full border border-line p-1.5 text-xs outline-none focus:border-primary"
                />
                <button disabled={busy || !paste.trim()} onClick={onBeallPaste} className="border border-ink-3/50 text-primary px-2 py-1 text-xs font-medium disabled:opacity-40">
                  Thêm vào danh sách
                </button>
              </div>
            </details>
          </>
        )}
        {jobLine('beall')}
      </div>
    </div>
  );
}
