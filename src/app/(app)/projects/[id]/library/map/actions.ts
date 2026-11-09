'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listPapers } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { ExtractError } from '@/lib/ai/extract';
import { extractRelations, normalizeConstructs, rawKey } from '@/lib/ai/relations';
import type { Json } from '@/lib/supabase/database.types';

async function editable(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role === 'viewer') return null;
  return project;
}

/** Phân tích quan hệ cho một lô bài (≤ 6 bài) */
export async function analyzeRelationsAction(projectId: string, paperIds: string[]): Promise<{ error?: string; stop?: boolean; done?: number }> {
  const project = await editable(projectId);
  if (!project) return { error: 'Bạn không có quyền.', stop: true };
  const papers = (await listPapers(projectId)).filter((p) => paperIds.slice(0, 6).includes(p.id) && Object.keys(p.fields).length > 0);
  if (papers.length === 0) return { done: 0 };
  try {
    const rels = await extractRelations(papers);
    const supabase = await createClient();
    const now = new Date().toISOString();
    for (const p of papers) {
      await supabase
        .from('papers')
        .update({ relations: (rels.get(p.id) ?? []) as unknown as Json, relations_at: now })
        .eq('id', p.id);
    }
    revalidatePath(`/projects/${projectId}/library/map`);
    return { done: papers.length };
  } catch (e) {
    const stop = e instanceof ExtractError && (e.code === 'quota' || e.code === 'not_configured');
    return { error: e instanceof ExtractError ? e.message : 'Phân tích thất bại. Thử lại sau.', stop };
  }
}

/** Gộp tên biến đồng nghĩa trên toàn dự án */
export async function normalizeConstructsAction(projectId: string): Promise<{ error?: string; groups?: number }> {
  const project = await editable(projectId);
  if (!project) return { error: 'Bạn không có quyền.' };
  const papers = await listPapers(projectId);
  const names = papers.flatMap((p) => (p.relations ?? []).flatMap((r) => [r.from, r.to, ...(r.via ? [r.via] : [])]));
  if (names.length === 0) return { error: 'Chưa có quan hệ nào để chuẩn hoá — bấm "Phân tích giả thuyết" trước.' };
  try {
    const map = await normalizeConstructs(names, [project.name, project.description].filter(Boolean).join(' — '));
    const supabase = await createClient();
    const { error: delErr } = await supabase.from('project_constructs').delete().eq('project_id', projectId);
    if (delErr) return { error: dbErrorMessage(delErr) };
    const rows = [...map.entries()].map(([raw_key, canonical]) => ({ project_id: projectId, raw_key, canonical }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('project_constructs').insert(rows.slice(i, i + 500));
      if (error) return { error: dbErrorMessage(error) };
    }
    revalidatePath(`/projects/${projectId}/library/map`);
    return { groups: new Set(map.values()).size };
  } catch (e) {
    return { error: e instanceof ExtractError ? e.message : 'Chuẩn hoá thất bại. Thử lại sau.' };
  }
}

/** Đổi tên / gộp tay: mọi tên đang trỏ tới `from` sẽ trỏ tới `to` */
export async function renameConstructAction(projectId: string, from: string, to: string): Promise<{ error?: string }> {
  const project = await editable(projectId);
  if (!project) return { error: 'Bạn không có quyền.' };
  const target = to.trim().slice(0, 200);
  if (!target) return { error: 'Tên mới không được trống.' };
  const supabase = await createClient();
  const { data } = await supabase.from('project_constructs').select('raw_key').eq('project_id', projectId).eq('canonical', from);
  if (!data?.length) {
    // Chưa chuẩn hoá: tạo ánh xạ cho chính tên đó
    const { error } = await supabase.from('project_constructs').upsert({ project_id: projectId, raw_key: rawKey(from), canonical: target }, { onConflict: 'project_id,raw_key' });
    if (error) return { error: dbErrorMessage(error) };
  } else {
    const { error } = await supabase
      .from('project_constructs')
      .update({ canonical: target, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('canonical', from);
    if (error) return { error: dbErrorMessage(error) };
  }
  revalidatePath(`/projects/${projectId}/library/map`);
  return {};
}
