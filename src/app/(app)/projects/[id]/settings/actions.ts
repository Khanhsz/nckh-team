'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { isValidISODate } from '@/lib/dates';
import { getSiteUrl, str } from '@/lib/site';
import type { FormState } from '@/lib/auth/actions';

const refresh = () => revalidatePath('/', 'layout');

export async function updateProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const id = str(fd, 'projectId');
  const name = str(fd, 'name');
  const startDate = str(fd, 'startDate');
  const endDate = str(fd, 'endDate');
  if (name.length < 2 || name.length > 160) return { error: 'Tên dự án cần 2–160 ký tự.' };
  if (!isValidISODate(startDate) || !isValidISODate(endDate) || endDate < startDate) return { error: 'Khoảng thời gian không hợp lệ.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .update({
      name,
      code: str(fd, 'code').toUpperCase().slice(0, 20) || null,
      research_topic: str(fd, 'description').slice(0, 2000),
      start_date: startDate,
      end_date: endDate
    })
    .eq('id', id)
    .select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ trưởng nhóm được sửa thông tin dự án.' };
  refresh();
  return { ok: true, message: 'Đã lưu.' };
}

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
