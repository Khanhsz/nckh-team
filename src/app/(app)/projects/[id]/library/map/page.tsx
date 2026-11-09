import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listConstructMap, listPapers } from '@/lib/data/queries';
import { geminiConfigured } from '@/lib/ai/extract';
import { buildRelationMap } from '@/lib/library/relmap';
import { LibraryNav } from '@/components/library/LibraryNav';
import { RelationMap } from '@/components/library/RelationMap';

export const maxDuration = 120;

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const [papers, canonMap] = await Promise.all([listPapers(id), listConstructMap(id)]);
  const data = buildRelationMap(papers, canonMap);
  const pending = papers.filter((p) => Object.keys(p.fields).length > 0 && p.relations === null).map((p) => p.id);
  const unmapped = new Set(
    papers.flatMap((p) => (p.relations ?? []).flatMap((r) => [r.from, r.to, ...(r.via ? [r.via] : [])])).filter((n) => !canonMap.has(n.toLowerCase().replace(/[“”"'`’]/g, '').replace(/\s+/g, ' ').trim()))
  ).size;

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      <LibraryNav projectId={id} active="map" />
      <RelationMap
        projectId={id}
        data={data}
        pending={pending}
        unmapped={unmapped}
        canEdit={project.role !== 'viewer'}
        aiReady={geminiConfigured()}
      />
    </div>
  );
}
