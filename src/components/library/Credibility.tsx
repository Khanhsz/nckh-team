import type { JournalFlag, PaperCredibility, PaperPublication } from '@/lib/types';

const Q_STYLE: Record<string, string> = {
  Q1: 'bg-emerald-600 text-white',
  Q2: 'bg-lime-500 text-white',
  Q3: 'bg-amber-400 text-zinc-900',
  Q4: 'bg-orange-500 text-white'
};

export function flagLevel(c: PaperCredibility | undefined): 'danger' | 'warn' | 'watch' | null {
  if (!c) return null;
  if (c.flags.some((f) => f.kind === 'scopus_discontinued')) return 'danger';
  if (c.flags.some((f) => f.kind === 'beall_journal' || f.kind === 'beall_publisher')) return 'warn';
  if (c.flags.length) return 'watch';
  return null;
}

function flagText(f: JournalFlag): string {
  if (f.kind === 'team_watch')
    return `${f.publisher ? `Nhà xuất bản “${f.publisher}”` : `Tạp chí “${f.title ?? '?'}”`} nằm trong danh sách theo dõi của nhóm${f.reason ? ` — ${f.reason}` : ''}.`;
  if (f.kind === 'scopus_discontinued')
    return `Scopus đã ngừng chỉ mục tạp chí “${f.title ?? '?'}”${f.since ? ` từ ${f.since}` : ''}${f.reason ? ` — lý do: ${f.reason}` : ''}. Bài đăng trước thời điểm này vẫn được Scopus giữ lại.`;
  if (f.kind === 'beall_publisher')
    return `Nhà xuất bản “${f.publisher ?? '?'}” có trong danh sách Beall (bản lưu trữ, ngừng cập nhật từ 2017). Chỉ là tín hiệu tham khảo — hãy kiểm tra thêm.`;
  return `Tạp chí “${f.title ?? '?'}” có trong danh sách Beall (bản lưu trữ). Chỉ là tín hiệu tham khảo — hãy kiểm tra thêm.`;
}

/** Ô "Độ tin cậy": hạng Q, SJR, số trích dẫn, cảnh báo săn mồi */
export function CredibilityCell({
  cred,
  pub,
  detailed,
  catalogReady = true
}: {
  cred: PaperCredibility | undefined;
  pub: PaperPublication;
  detailed?: boolean;
  /** false = chưa nạp danh mục SCImago → không thể kết luận "không thuộc Scopus" */
  catalogReady?: boolean;
}) {
  const discontinued = cred?.flags.filter((f) => f.kind === 'scopus_discontinued') ?? [];
  const beall = cred?.flags.filter((f) => f.kind === 'beall_journal' || f.kind === 'beall_publisher') ?? [];
  const watch = cred?.flags.filter((f) => f.kind === 'team_watch') ?? [];
  const known = Boolean(pub.journal || pub.issns.length);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {cred?.quartile ? (
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none ${Q_STYLE[cred.quartile]}`}
            title={`Hạng tốt nhất của tạp chí theo SCImago${cred.rankYear ? ` ${cred.rankYear}` : ''}${cred.categories ? `\nLĩnh vực: ${cred.categories}` : ''}`}
          >
            {cred.quartile}
          </span>
        ) : known && cred?.rankTitle ? (
          <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] leading-none text-zinc-500">SJR chưa xếp Q</span>
        ) : discontinued.length ? null : known && !catalogReady ? (
          <span className="rounded-sm border border-dashed border-sky-300 px-1.5 py-0.5 text-[10px] leading-none text-sky-700" title="Chưa nạp danh mục SCImago nên chưa xếp hạng được. Trưởng nhóm nạp ở tab Thành viên & cài đặt → Danh mục tạp chí.">
            Chờ nạp SJR
          </span>
        ) : known ? (
          <span className="rounded-sm border border-dashed border-zinc-300 px-1.5 py-0.5 text-[10px] leading-none text-zinc-500" title="Không tìm thấy tạp chí trong danh mục SCImago (Scopus). Có thể là hội thảo, sách, preprint hoặc tạp chí không thuộc Scopus — không có nghĩa là bài kém.">
            Không thuộc Scopus
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400" title={pub.checkedAt ? 'Đã tra nhưng chưa xác định được tạp chí — bấm vào bài để nhập tay.' : 'Chưa tra thông tin xuất bản.'}>
            {pub.checkedAt ? 'Chưa rõ tạp chí' : 'Chưa tra'}
          </span>
        )}
        {cred?.sjr !== null && cred?.sjr !== undefined && (
          <span className="text-[11px] tabular-nums text-zinc-600" title={`SJR ${cred.sjr}${cred.hIndex ? ` · h-index tạp chí ${cred.hIndex}` : ''}`}>
            SJR {cred.sjr.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
          </span>
        )}
        {pub.citedBy !== null && (
          <span className="text-[11px] tabular-nums text-zinc-600" title="Số lần được trích dẫn (Crossref — mức tối thiểu, số thực thường cao hơn)">
            · {pub.citedBy.toLocaleString('vi-VN')} trích dẫn
          </span>
        )}
      </div>

      {discontinued.map((f, i) => (
        <p key={`d${i}`} className="w-fit border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-rose-800" title={flagText(f)}>
          ⛔ Scopus đã loại{f.since ? ` (${f.since})` : ''}
          {detailed && <span className="mt-0.5 block font-normal">{flagText(f)}</span>}
        </p>
      ))}
      {beall.length > 0 && (
        <p className="w-fit border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-amber-900" title={beall.map(flagText).join('\n')}>
          ⚠ Nghi săn mồi (Beall)
          {detailed && beall.map((f, i) => <span key={i} className="mt-0.5 block font-normal">{flagText(f)}</span>)}
        </p>
      )}

      {watch.length > 0 && (
        <p className="w-fit border border-yellow-300 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-yellow-900" title={watch.map(flagText).join('\n')}>
          👁 Nhóm lưu ý{!detailed && watch[0].reason ? `: ${watch[0].reason.slice(0, 40)}${watch[0].reason.length > 40 ? '…' : ''}` : ''}
          {detailed && watch.map((f, i) => <span key={i} className="mt-0.5 block font-normal">{flagText(f)}</span>)}
        </p>
      )}

      {(pub.journal || pub.year) && (
        <p className={`text-[11px] text-zinc-500 ${detailed ? '' : 'line-clamp-2'}`} title={[pub.journal, pub.publisher, pub.year].filter(Boolean).join(' · ')}>
          {pub.journal}
          {pub.year ? `${pub.journal ? ' · ' : ''}${pub.year}` : ''}
        </p>
      )}
    </div>
  );
}
