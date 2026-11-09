'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { isValidISODate } from '@/lib/dates';
import { getSiteUrl, str } from '@/lib/site';
import type { FormState } from '@/lib/auth/actions';
import { getProjectForUser, listMembers } from '@/lib/data/queries';
import { sendMails, smtpConfigured } from '@/lib/mail/smtp';
import { transferInviteMail } from '@/lib/mail/templates';

const refresh = () => revalidatePath('/', 'layout');

export async function addMilestoneAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const name = str(fd, 'name');
  const dueDate = str(fd, 'dueDate');
  if (!name) return { error: 'Nhập tên mốc.' };
  if (!isValidISODate(dueDate)) return { error: 'Ngày không hợp lệ.' };
  const supabase = await createClient();
  const { error } = await supabase.from('milestones').insert({ project_id: str(fd, 'projectId'), name: name.slice(0, 200), due_date: dueDate });
  if (error) return { error: dbErrorMessage(error, 'Không thêm được mốc.') };
  refresh();
  return { ok: true, message: `Đã thêm mốc “${name}”.` };
}

export async function deleteMilestoneAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('milestones').delete().eq('id', str(fd, 'milestoneId'));
  refresh();
}

export interface InviteState extends FormState {
  link?: string;
}

export async function createInviteAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  await requireUser();
  const role = str(fd, 'role') === 'viewer' ? 'viewer' : 'editor';
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc('create_project_invite', { p_project_id: str(fd, 'projectId'), p_role: role });
  if (error || !token) return { error: dbErrorMessage(error, 'Không tạo được link mời.') };
  const site = await getSiteUrl();
  return { ok: true, link: `${site}/invite/${token}` };
}

export async function setMemberRoleAction(projectId: string, userId: string, role: 'editor' | 'viewer'): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_project_member_role', { p_project_id: projectId, p_user_id: userId, p_role: role });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}

export async function removeMemberAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc('remove_project_member', { p_project_id: str(fd, 'projectId'), p_user_id: str(fd, 'userId') });
  refresh();
}

export async function updateMilestoneAction(milestoneId: string, patch: { dueDate?: string; name?: string }): Promise<{ error?: string }> {
  await requireUser();
  const db: { due_date?: string; name?: string } = {};
  if (patch.dueDate !== undefined) {
    if (!isValidISODate(patch.dueDate)) return { error: 'Ngày không hợp lệ.' };
    db.due_date = patch.dueDate;
  }
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { error: 'Tên mốc không được để trống.' };
    db.name = n.slice(0, 200);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('milestones').update(db).eq('id', milestoneId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ trưởng nhóm được sửa mốc.' };
  refresh();
  return {};
}

/* ---------------- Danh sách theo dõi của nhóm (trưởng nhóm) ---------------- */

export async function addWatchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const projectId = str(fd, 'projectId');
  const kind = str(fd, 'kind') === 'journal' ? 'journal' : 'publisher';
  const name = str(fd, 'name').slice(0, 300);
  const note = str(fd, 'note').slice(0, 500) || null;
  if (name.length < 2) return { error: 'Nhập tên nhà xuất bản hoặc tạp chí.' };
  const supabase = await createClient();
  const { error } = await supabase.from('project_watchlist').insert({ project_id: projectId, kind, name, note });
  if (error) return { error: error.code === '23505' ? 'Tên này đã có trong danh sách.' : dbErrorMessage(error, 'Chỉ trưởng nhóm được sửa danh sách theo dõi.') };
  refresh();
  return { ok: true, message: `Đã thêm “${name}”.` };
}

export async function removeWatchAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('project_watchlist').delete().eq('id', str(fd, 'id'));
  refresh();
}

export async function quickWatchAction(projectId: string, kind: 'publisher' | 'journal', name: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('project_watchlist').insert({ project_id: projectId, kind, name: name.trim().slice(0, 300) });
  if (error && error.code !== '23505') return { error: dbErrorMessage(error, 'Chỉ trưởng nhóm được sửa danh sách theo dõi.') };
  refresh();
  return {};
}

/* ---------------- Trao quyền trưởng nhóm ---------------- */

export async function requestTransferAction(projectId: string, toUserId: string, message: string): Promise<{ error?: string; emailed?: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: tid, error } = await supabase.rpc('request_ownership_transfer', { p_project_id: projectId, p_to_user: toUserId, p_message: message.slice(0, 500) || null });
  if (error || !tid) return { error: dbErrorMessage(error, 'Không gửi được lời mời.') };

  let emailed = false;
  if (smtpConfigured()) {
    const [members, project] = await Promise.all([listMembers(projectId), getProjectForUser(projectId, user.id)]);
    const to = members.find((m) => m.userId === toUserId);
    if (to?.email && project) {
      const expires = new Date(Date.now() + 7 * 86400000).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const r = await sendMails([
        transferInviteMail({
          to: to.email,
          toName: to.displayName,
          fromName: user.profile.displayName,
          project: project.name,
          message: message.trim() || null,
          link: `${await getSiteUrl()}/transfer/${tid}`,
          expires
        })
      ]);
      emailed = r.sent > 0;
    }
  }
  refresh();
  return { emailed };
}

export async function cancelTransferAction(transferId: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_ownership_transfer', { p_id: transferId });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}

// ---- Sửa nhanh thông tin dự án ngay trên tiêu đề (chỉ trưởng nhóm; RLS chặn người khác) ----
export async function updateProjectFieldsAction(
  projectId: string,
  patch: { name?: string; code?: string; description?: string; startDate?: string; endDate?: string }
): Promise<{ error?: string }> {
  await requireUser();
  const upd: { name?: string; code?: string | null; research_topic?: string; start_date?: string; end_date?: string } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2 || name.length > 160) return { error: 'Tên dự án cần 2–160 ký tự.' };
    upd.name = name;
  }
  if (patch.code !== undefined) upd.code = patch.code.trim().toUpperCase().slice(0, 20) || null;
  if (patch.description !== undefined) upd.research_topic = patch.description.trim().slice(0, 2000);
  if (patch.startDate !== undefined || patch.endDate !== undefined) {
    const s = patch.startDate ?? '';
    const e = patch.endDate ?? '';
    if (!isValidISODate(s) || !isValidISODate(e) || e < s) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
    upd.start_date = s;
    upd.end_date = e;
  }
  if (!Object.keys(upd).length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').update(upd).eq('id', projectId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ trưởng nhóm được sửa thông tin dự án.' };
  refresh();
  return {};
}

/** Đặt ảnh bìa là một mẫu (c:key), link ảnh (url:https…), hoặc gỡ (null). Ảnh tải lên đi qua /api/projects/[id]/cover. */
export async function setProjectCoverAction(projectId: string, cover: string | null, coverY?: number): Promise<{ error?: string }> {
  await requireUser();
  if (cover !== null && !/^c:[a-z-]{2,30}$/.test(cover) && !/^url:https:\/\/\S{4,580}$/i.test(cover) && !/^img:[0-9a-f-]{36}\/[\w.-]{1,80}$/.test(cover))
    return { error: 'Ảnh bìa không hợp lệ.' };
  const supabase = await createClient();
  const { data: cur } = await supabase.from('projects').select('cover').eq('id', projectId).maybeSingle();
  const upd: { cover?: string | null; cover_y?: number } = { cover };
  if (coverY !== undefined) upd.cover_y = Math.max(0, Math.min(100, Math.round(coverY)));
  else if (cover !== cur?.cover) upd.cover_y = 50;
  const { data, error } = await supabase.from('projects').update(upd).eq('id', projectId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ trưởng nhóm được đổi ảnh bìa.' };
  // Xoá ảnh đã tải lên trước đó nếu không còn dùng
  if (cur?.cover?.startsWith('img:') && cur.cover !== cover) await supabase.storage.from('covers').remove([cur.cover.slice(4)]);
  refresh();
  return {};
}
