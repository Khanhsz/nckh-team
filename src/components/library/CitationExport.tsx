'use client';

import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';

/** Nút sao chép / tải danh mục tài liệu tham khảo (APA 7, BibTeX, RIS) */
export function CitationExport({ projectId, query, count, compact }: { projectId: string; query: string; count: number; compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = (format: string, inline = false) => `/projects/${projectId}/library/export?format=${format}${query ? `&${query}` : ''}${inline ? '&inline=1' : ''}`;

  const copyApa = async () => {
    setBusy(true);
    setMsg('Đang chuẩn bị (lấy thêm tác giả, tập, trang từ Crossref)…');
    try {
      const [h, t] = await Promise.all([fetch(url('apa-html', true)), fetch(url('apa', true))]);
      if (!h.ok || !t.ok) throw new Error('fail');
      const html = await h.text();
      const text = await t.text();
      const incomplete = Number(t.headers.get('x-incomplete') ?? 0);
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })
        ]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
      setMsg(
        `Đã sao chép ${t.headers.get('x-papers')} trích dẫn APA 7 — dán vào Word/Google Docs giữ nguyên in nghiêng.` +
          (incomplete ? ` ${incomplete} bài thiếu thông tin (không có DOI) — kiểm tra các dòng có "[thiếu …]".` : '')
      );
    } catch {
      setMsg('Không tạo được danh mục. Thử lại sau.');
    }
    setBusy(false);
  };

  if (count === 0) return null;
  return (
    <details className="relative">
      <summary
        className={`cursor-pointer list-none border border-line bg-white text-xs hover:bg-paper-2 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'}`}
        title="Danh mục tài liệu tham khảo của các bài đang hiển thị"
      >
        <Icon name="download" size={15} className="inline" /> Trích dẫn ({count})
      </summary>
      <div className="absolute right-0 z-50 mt-1 w-72 space-y-1 rounded-2xl border border-line bg-white p-2 text-xs shadow-xl">
        <button disabled={busy} onClick={copyApa} className="block w-full px-2 py-1.5 text-left font-medium hover:bg-paper-2 disabled:opacity-50">
          <Icon name="copy" size={15} className="inline" /> Sao chép APA 7 (dán vào Word / Docs)
        </button>
        <a href={url('apa-html')} className="block px-2 py-1.5 hover:bg-paper-2">
          Tải APA 7 (.html — mở bằng Word)
        </a>
        <a href={url('ris')} className="block px-2 py-1.5 hover:bg-paper-2">
          Tải RIS — Zotero / Mendeley / EndNote
        </a>
        <a href={url('bibtex')} className="block px-2 py-1.5 hover:bg-paper-2">
          Tải BibTeX (.bib) — LaTeX / Overleaf
        </a>
        <p className="border-t border-line px-2 pt-1.5 text-[10px] text-zinc-500">Theo bộ lọc hiện tại, sắp xếp theo họ tác giả. Lần đầu có thể mất vài giây.</p>
        {msg && <p className="px-2 text-[11px] text-zinc-700">{msg}</p>}
      </div>
    </details>
  );
}
