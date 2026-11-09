import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listPapers } from '@/lib/data/queries';
import { geminiConfigured } from '@/lib/ai/extract';
import { LibraryNav } from '@/components/library/LibraryNav';
import { AskLibrary } from '@/components/library/AskLibrary';

export const maxDuration = 60;

export default async function AskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(id, user.id);
  if (!project) notFound();
  const papers = await listPapers(id);
  const ready = papers.filter((p) => Object.keys(p.fields).length > 0).length;

  return (
    <div className="space-y-3 px-4 pb-4 pt-3">
      <LibraryNav projectId={id} active="ask" />
      <AskLibrary projectId={id} ready={ready} total={papers.length} aiReady={geminiConfigured()} />
    </div>
  );
}
