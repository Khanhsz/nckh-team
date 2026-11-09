import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listDismissedRefs, listPaperRefs, listPapers, listRanksByIssns, listRefMeta } from '@/lib/data/queries';
import { findMissing } from '@/lib/library/missing';
import { LibraryNav } from '@/components/library/LibraryNav';
import { MissingPapers } from '@/components/library/MissingPapers';

export const maxDuration = 120;

export default async function MissingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [papers, refs, meta, dismissed] = await Promise.all([listPapers(id), listPaperRefs(id), listRefMeta(id), listDismissedRefs(id)]);
  const result = findMissing(papers, refs, meta, dismissed);
  const ranks = await listRanksByIssns(result.suggestions.slice(0, 150).flatMap((s) => s.issns));
  const pending = papers.filter((p) => p.pub.doi && !refs.has(p.id)).map((p) => p.id);
  const noDoi = papers.filter((p) => !p.pub.doi).length;
  const unresolved = result.suggestions.filter((s) => s.doi && !meta.has(s.doi)).length;

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      <LibraryNav projectId={id} active="missing" />
      <MissingPapers
        projectId={id}
        suggestions={result.suggestions.slice(0, 150).map((s) => ({ ...s, quartile: s.issns.map((i) => ranks.get(i)?.quartile).find(Boolean) ?? null }))}
        stats={{ total: papers.length, withRefs: result.withRefs, noRefsDeposited: result.noRefsDeposited, totalRefs: result.totalRefs, noDoi, dismissed: dismissed.size }}
        pending={pending}
        unresolved={unresolved}
        canEdit={project.role !== 'viewer'}
      />
    </div>
  );
}
