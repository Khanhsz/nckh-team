import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getCatalogStatus, getPaper, getProjectForUser, listMembers, listPaperCredibility } from '@/lib/data/queries';
import { CredibilityCell } from '@/components/library/Credibility';
import { PublicationEditor } from '@/components/library/PublicationEditor';
import { QuickWatch } from '@/components/library/QuickWatch';
import { CitationExport } from '@/components/library/CitationExport';
import { geminiConfigured } from '@/lib/ai/extract';
import { PAPER_FIELDS } from '@/lib/ai/fields';
import { PAPER_STATUS_LABEL } from '@/lib/types';
import { ExtractOneButton, PaperFieldEditor } from '@/components/library/PaperFieldEditor';

export const maxDuration = 300;

const SOURCE_LABEL: Record<string, string> = {
  gemini: 'AI đọc từ PDF',
  crossref: 'Crossref',
  'gemini+crossref': 'AI đọc từ PDF + Crossref',
  manual: 'Nhập tay',
  none: 'Chưa tìm thấy'
};

export default async function PaperPage({ params }: { params: Promise<{ id: string; paperId: string }> }) {
  const { id, paperId } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const paper = await getPaper(paperId);
  if (!paper || paper.projectId !== id) notFound();
  const [members, credMap, catalog] = await Promise.all([listMembers(id), listPaperCredibility(id), getCatalogStatus()]);
  const cred = credMap.get(paper.id);
  const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? 'thành viên cũ';

  const canEdit = project.role !== 'viewer';
  const verifiedCount = Object.keys(paper.verified).length;
  const hasResult = paper.status === 'completed' || paper.status === 'stale' || Object.keys(paper.fields).length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <Link href={`/projects/${id}/library`} className="text-xs text-zinc-500 underline">
        ← Thư viện bài đọc
      </Link>

      <header className="space-y-2 border border-line bg-white p-4">
        <h2 className="text-lg font-semibold leading-snug">{paper.fileName}</h2>
        <p className="text-xs text-zinc-600">
          {PAPER_STATUS_LABEL[paper.status]}
          {paper.extractedAt && <> · trích xuất {new Date(paper.extractedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</>}
          {paper.model && <> · {paper.model}</>}
          {hasResult && (
            <>
              {' '}
              · {verifiedCount}/{PAPER_FIELDS.length} ô đã duyệt
            </>
          )}
          {paper.fileSize && <> · {(paper.fileSize / 1048576).toFixed(1)} MB</>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {paper.driveWebLink && (
            <a href={paper.driveWebLink} target="_blank" rel="noreferrer" className="border border-ink-3/50 text-primary px-3 py-1.5 text-sm font-medium hover:bg-paper-2">
              Mở PDF trên Drive ↗
            </a>
          )}
          <CitationExport projectId={id} count={1} query={`ids=${paper.id}`} />
          {canEdit && geminiConfigured() && (
            <ExtractOneButton paperId={paper.id} label={hasResult ? 'Trích xuất lại (xoá trạng thái duyệt)' : 'Trích xuất bằng AI'} />
          )}
        </div>
        {paper.status === 'error' && paper.error && <p className="text-sm text-rose-700">{paper.error}</p>}
        {paper.warnings.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <p className="font-semibold">AI lưu ý:</p>
            <ul className="mt-1 list-disc pl-5">
              {paper.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <section className="space-y-2 rounded-2xl border border-line bg-white p-4">
        <h3 className="text-xs font-semibold  text-zinc-500">Độ tin cậy & thông tin xuất bản</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <CredibilityCell cred={cred} pub={paper.pub} detailed catalogReady={catalog.sjr.count > 0} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-zinc-500">Tạp chí</dt>
            <dd>{paper.pub.journal ?? '—'}</dd>
            <dt className="text-zinc-500">ISSN</dt>
            <dd className="tabular-nums">{paper.pub.issns.length ? paper.pub.issns.map((x) => `${x.slice(0, 4)}-${x.slice(4)}`).join(', ') : '—'}</dd>
            <dt className="text-zinc-500">DOI</dt>
            <dd>
              {paper.pub.doi ? (
                <a className="underline" href={`https://doi.org/${paper.pub.doi}`} target="_blank" rel="noreferrer">
                  {paper.pub.doi}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-zinc-500">NXB</dt>
            <dd>{paper.pub.publisher ?? '—'}</dd>
            <dt className="text-zinc-500">Năm</dt>
            <dd>{paper.pub.year ?? '—'}</dd>
            <dt className="text-zinc-500">Nguồn</dt>
            <dd className="text-zinc-500">
              {SOURCE_LABEL[paper.pub.source ?? ''] ?? 'Chưa tra'}
            </dd>
          </dl>
        </div>
        <PublicationEditor paperId={paper.id} pub={paper.pub} canEdit={canEdit} />
        {project.role === 'owner' && <QuickWatch projectId={id} publisher={paper.pub.publisher} journal={paper.pub.journal} />}
      </section>

      {hasResult ? (
        PAPER_FIELDS.map((f) => (
          <PaperFieldEditor
            key={f.key}
            paperId={paper.id}
            field={f.key}
            label={f.label}
            value={paper.fields[f.key] ?? ''}
            verifiedBy={paper.verified[f.key] ? nameOf(paper.verified[f.key].by) : null}
            canEdit={canEdit}
          />
        ))
      ) : (
        <p className="border border-dashed border-zinc-400 bg-white p-8 text-center text-sm text-zinc-600">
          Bài chưa được trích xuất.{canEdit ? ' Bấm “Trích xuất bằng AI” ở trên.' : ''}
        </p>
      )}
    </div>
  );
}
