'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listDismissedRefs, listPaperRefs, listPapers, listRefMeta } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { crossrefByDoi, crossrefReferences } from '@/lib/scholar/publication';
import { findMissing } from '@/lib/library/missing';
import type { Json } from '@/lib/supabase/database.types';

async function editable(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  return project && project.role !== 'viewer' ? project : null;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Lấy danh mục tham khảo (Crossref) cho một lô bài có DOI */
export async function fetchRefsAction(projectId: string, paperIds: string[]): Promise<{ error?: string; stop?: boolean; done?: number; empty?: number }> {
  if (!(await editable(projectId))) return { error: 'Bạn không có quyền.', stop: true };
  const papers = (await listPapers(projectId)).filter((p) => paperIds.slice(0, 10).includes(p.id) && p.pub.doi);
  const supabase = await createClient();
  let done = 0;
  let empty = 0;
  let failed = 0;
  await pool(papers, 2, async (p) => {
    const refs = await crossrefReferences(p.pub.doi!);
    if (refs === null) {
      failed++;
      return;
    }
    const { error } = await supabase
      .from('paper_refs')
      .upsert({ paper_id: p.id, project_id: projectId, refs: refs as unknown as Json, ref_count: refs.length, fetched_at: new Date().toISOString() }, { onConflict: 'paper_id' });
    if (error) failed++;
    else {
      done++;
      if (refs.length === 0) empty++;
    }
  });
  return failed && !done ? { error: 'Không tra được Crossref lúc này. Thử lại sau.' } : { done, empty };
}

/** Bổ sung tên bài, tác giả, tạp chí, số trích dẫn cho các gợi ý có DOI */
export async function resolveMissingMetaAction(projectId: string): Promise<{ error?: string; resolved?: number }> {
  if (!(await editable(projectId))) return { error: 'Bạn không có quyền.' };
  const [papers, refs, meta, dismissed] = await Promise.all([listPapers(projectId), listPaperRefs(projectId), listRefMeta(projectId), listDismissedRefs(projectId)]);
  const { suggestions } = findMissing(papers, refs, meta, dismissed);
  const need = suggestions.filter((s) => s.doi && !meta.has(s.doi)).slice(0, 60);
  const supabase = await createClient();
  let resolved = 0;
  await pool(need, 3, async (s) => {
    const w = await crossrefByDoi(s.doi!);
    if (!w) return;
    const c = w.csl;
    const authors = c?.authors.length
      ? `${c.authors[0].family}${c.authors.length > 2 ? ' et al.' : c.authors.length === 2 ? ` & ${c.authors[1].family}` : ''}`
      : null;
    const { error } = await supabase.from('project_ref_meta').upsert(
      {
        project_id: projectId,
        doi: s.doi!,
        title: w.title,
        authors,
        year: w.year,
        container: w.journal,
        issns: w.issns,
        cited_by: w.citedBy,
        fetched_at: new Date().toISOString()
      },
      { onConflict: 'project_id,doi' }
    );
    if (!error) resolved++;
  });
  revalidatePath(`/projects/${projectId}/library/missing`);
  return { resolved };
}

export async function dismissRefAction(projectId: string, key: string): Promise<{ error?: string }> {
  if (!(await editable(projectId))) return { error: 'Bạn không có quyền.' };
  const supabase = await createClient();
  const { error } = await supabase.from('project_ref_dismissed').insert({ project_id: projectId, ref_key: key.slice(0, 400) });
  if (error && error.code !== '23505') return { error: dbErrorMessage(error) };
  revalidatePath(`/projects/${projectId}/library/missing`);
  return {};
}

export async function restoreDismissedAction(projectId: string): Promise<{ error?: string }> {
  if (!(await editable(projectId))) return { error: 'Bạn không có quyền.' };
  const supabase = await createClient();
  const { error } = await supabase.from('project_ref_dismissed').delete().eq('project_id', projectId);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/projects/${projectId}/library/missing`);
  return {};
}
