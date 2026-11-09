import 'server-only';
import { cache } from 'react';
import { createClient } from '../supabase/server';
import type { Member, Milestone, Paper, ProjectWithRole, Task } from '../types';
import { asRole, mapMilestone, mapPaper, mapProject, mapTask } from './mappers';

/**
 * Mọi truy vấn chạy bằng phiên của người dùng → RLS của Supabase quyết định họ thấy gì.
 * Code ở đây không cần tự lọc quyền.
 */

export const listMyProjects = cache(async (userId: string): Promise<ProjectWithRole[]> => {
  const sb = await createClient();
  const { data, error } = await sb.from('project_members').select('role, projects(*)').eq('user_id', userId);
  if (error) throw error;
  return (data ?? [])
    .flatMap((r) => (r.projects ? [{ ...mapProject(r.projects), role: asRole(r.role) }] : []))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
});

export const getProjectForUser = cache(async (projectId: string, userId: string): Promise<ProjectWithRole | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const sb = await createClient();
  const [{ data: project }, { data: membership }] = await Promise.all([
    sb.from('projects').select('*').eq('id', projectId).maybeSingle(),
    sb.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle()
  ]);
  if (!project || !membership) return null;
  return { ...mapProject(project), role: asRole(membership.role) };
});

export const listMembers = cache(async (projectId: string): Promise<Member[]> => {
  const sb = await createClient();
  const { data: rows, error } = await sb.from('project_members').select('user_id, role, joined_at').eq('project_id', projectId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await sb.from('profiles').select('id, display_name, email').in('id', ids)
    : { data: [] as { id: string; display_name: string; email: string | null }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const order = { owner: 0, editor: 1, viewer: 2 } as const;
  return (rows ?? [])
    .map((r) => ({
      userId: r.user_id,
      role: asRole(r.role),
      joinedAt: r.joined_at,
      displayName: byId.get(r.user_id)?.display_name ?? 'Thành viên',
      email: byId.get(r.user_id)?.email ?? null
    }))
    .sort((a, b) => order[a.role] - order[b.role] || a.displayName.localeCompare(b.displayName, 'vi'));
});

export const listMilestones = cache(async (projectId: string): Promise<Milestone[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapMilestone);
});

export const listTasks = cache(async (projectId: string): Promise<Task[]> => {
  const sb = await createClient();
  const { data, error } = await sb.from('tasks').select('*').eq('project_id', projectId).order('start_date').order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapTask);
});

/** Công việc + mốc của nhiều dự án (cho trang "Hôm nay"). */
export async function listTasksAndMilestonesFor(projectIds: string[]): Promise<{ tasks: Task[]; milestones: Milestone[] }> {
  if (projectIds.length === 0) return { tasks: [], milestones: [] };
  const sb = await createClient();
  const [t, m] = await Promise.all([
    sb.from('tasks').select('*').in('project_id', projectIds).order('due_date'),
    sb.from('milestones').select('*').in('project_id', projectIds).order('due_date')
  ]);
  if (t.error) throw t.error;
  if (m.error) throw m.error;
  return { tasks: (t.data ?? []).map(mapTask), milestones: (m.data ?? []).map(mapMilestone) };
}

export const listPapers = cache(async (projectId: string): Promise<Paper[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from('papers')
    .select('*')
    .eq('project_id', projectId)
    .order('file_name');
  if (error) throw error;
  return (data ?? []).map(mapPaper);
});

export const getPaper = cache(async (paperId: string): Promise<Paper | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(paperId)) return null;
  const sb = await createClient();
  const { data } = await sb.from('papers').select('*').eq('id', paperId).maybeSingle();
  return data ? mapPaper(data) : null;
});

export async function countMyProjects(userId: string): Promise<number> {
  const sb = await createClient();
  const { count } = await sb.from('project_members').select('project_id', { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
}
