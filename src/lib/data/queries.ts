import 'server-only';
import { cache } from 'react';
import { createClient } from '../supabase/server';
import type { JournalFlag, WatchItem, Meeting, Member, Milestone, Paper, PaperCredibility, ProjectDocument, ProjectWithRole, Task } from '../types';
import { asRole, mapMilestone, mapPaper, mapProject, mapTask } from './mappers';
import type { RefItem } from '../scholar/publication';
import type { RefMeta } from '../library/missing';

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

export const listMeetings = cache(async (projectId: string): Promise<Meeting[]> => {
  const sb = await createClient();
  const { data, error } = await sb.from('meetings').select('*').eq('project_id', projectId).order('starts_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    location: r.location,
    meetUrl: r.meet_url,
    notes: r.notes,
    attendeeIds: r.attendee_ids,
    guestEmails: r.guest_emails,
    sequence: r.sequence,
    createdBy: r.created_by
  }));
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

/** Độ tin cậy (hạng Q, SJR, cảnh báo) của mọi bài trong dự án, theo paper id */
export const listPaperCredibility = cache(async (projectId: string): Promise<Map<string, PaperCredibility>> => {
  const sb = await createClient();
  const { data, error } = await sb.rpc('paper_credibility', { p_project: projectId });
  if (error) {
    console.error('paper_credibility', error.message);
    return new Map();
  }
  const map = new Map<string, PaperCredibility>();
  for (const r of data ?? []) {
    const flags = Array.isArray(r.flags) ? (r.flags as unknown as JournalFlag[]) : [];
    map.set(r.paper_id, {
      quartile: r.quartile === 'Q1' || r.quartile === 'Q2' || r.quartile === 'Q3' || r.quartile === 'Q4' ? r.quartile : null,
      sjr: r.sjr === null ? null : Number(r.sjr),
      hIndex: r.h_index,
      categories: r.categories,
      rankYear: r.rank_year,
      rankTitle: r.rank_title,
      flags
    });
  }
  return map;
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

export const listDocuments = cache(async (projectId: string): Promise<ProjectDocument[]> => {
  const sb = await createClient();
  const { data, error } = await sb.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    driveFileId: r.drive_file_id,
    url: r.url,
    title: r.title,
    kind: (['working', 'proposal', 'review', 'other', 'link'].includes(r.kind) ? r.kind : 'other') as ProjectDocument['kind'],
    createdBy: r.created_by,
    createdAt: r.created_at
  }));
});

export interface CatalogStatus {
  sjr: { count: number; year: number | null; updatedAt: string | null };
  scopus: { count: number; updatedAt: string | null };
  beall: { publishers: number; journals: number; updatedAt: string | null };
}

/** Tình trạng danh mục tạp chí dùng chung */
export async function getCatalogStatus(): Promise<CatalogStatus> {
  const sb = await createClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [sjrCount, sjrLatest, scCount, scLatest, bp, bj, bLatest] = await Promise.all([
    count(sb.from('journal_ranks').select('sourceid', { count: 'exact', head: true })),
    sb.from('journal_ranks').select('rank_year, updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    count(sb.from('journal_flags').select('id', { count: 'exact', head: true }).eq('kind', 'scopus_discontinued')),
    sb.from('journal_flags').select('updated_at').eq('kind', 'scopus_discontinued').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    count(sb.from('journal_flags').select('id', { count: 'exact', head: true }).eq('kind', 'beall_publisher')),
    count(sb.from('journal_flags').select('id', { count: 'exact', head: true }).eq('kind', 'beall_journal')),
    sb.from('journal_flags').select('updated_at').in('kind', ['beall_publisher', 'beall_journal']).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  return {
    sjr: { count: sjrCount, year: sjrLatest.data?.rank_year ?? null, updatedAt: sjrLatest.data?.updated_at ?? null },
    scopus: { count: scCount, updatedAt: scLatest.data?.updated_at ?? null },
    beall: { publishers: bp, journals: bj, updatedAt: bLatest.data?.updated_at ?? null }
  };
}

export const listWatchlist = cache(async (projectId: string): Promise<WatchItem[]> => {
  const sb = await createClient();
  const { data } = await sb.from('project_watchlist').select('id, kind, name, note, created_at').eq('project_id', projectId).order('kind').order('name');
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind === 'journal' ? 'journal' : 'publisher', name: r.name, note: r.note, createdAt: r.created_at }));
});

export async function getNotifySettings(userId: string): Promise<{ calendarToken: string | null; digestEmail: boolean }> {
  const sb = await createClient();
  const { data } = await sb.from('user_notify').select('calendar_token, digest_email').eq('user_id', userId).maybeSingle();
  return { calendarToken: data?.calendar_token ?? null, digestEmail: data?.digest_email ?? true };
}

/** Ánh xạ tên biến → tên chuẩn của dự án */
export async function listConstructMap(projectId: string): Promise<Map<string, string>> {
  const sb = await createClient();
  const { data } = await sb.from('project_constructs').select('raw_key, canonical').eq('project_id', projectId).limit(5000);
  return new Map((data ?? []).map((r) => [r.raw_key, r.canonical]));
}

/* ---------------- Bài nền tảng còn thiếu ---------------- */
export async function listPaperRefs(projectId: string): Promise<Map<string, RefItem[]>> {
  const sb = await createClient();
  const { data } = await sb.from('paper_refs').select('paper_id, refs').eq('project_id', projectId).limit(2000);
  return new Map((data ?? []).map((r) => [r.paper_id, Array.isArray(r.refs) ? (r.refs as unknown as RefItem[]) : []]));
}

export async function listRefMeta(projectId: string): Promise<Map<string, RefMeta>> {
  const sb = await createClient();
  const { data } = await sb.from('project_ref_meta').select('doi, title, authors, year, container, issns, cited_by').eq('project_id', projectId).limit(5000);
  return new Map(
    (data ?? []).map((r) => [r.doi, { doi: r.doi, title: r.title, authors: r.authors, year: r.year, container: r.container, issns: r.issns ?? [], citedBy: r.cited_by }])
  );
}

export async function listDismissedRefs(projectId: string): Promise<Set<string>> {
  const sb = await createClient();
  const { data } = await sb.from('project_ref_dismissed').select('ref_key').eq('project_id', projectId).limit(5000);
  return new Set((data ?? []).map((r) => r.ref_key));
}

/** Hạng SCImago theo ISSN (cho danh sách gợi ý) */
export async function listRanksByIssns(issns: string[]): Promise<Map<string, { quartile: string | null; title: string }>> {
  const uniq = [...new Set(issns)].slice(0, 400);
  if (uniq.length === 0) return new Map();
  const sb = await createClient();
  const { data } = await sb.from('journal_ranks').select('title, issns, quartile, rank_year').overlaps('issns', uniq).order('rank_year', { ascending: false }).limit(1000);
  const map = new Map<string, { quartile: string | null; title: string }>();
  for (const r of data ?? []) for (const i of r.issns) if (!map.has(i)) map.set(i, { quartile: r.quartile, title: r.title });
  return map;
}

/* ---------------- Trao quyền trưởng nhóm ---------------- */
export const listMyOwnershipInvites = cache(async () => {
  const sb = await createClient();
  const { data } = await sb.rpc('my_ownership_invites');
  return data ?? [];
});

export async function getPendingTransfer(projectId: string) {
  const sb = await createClient();
  const { data } = await sb
    .from('ownership_transfers')
    .select('id, to_user, created_at, expires_at')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return data;
}
