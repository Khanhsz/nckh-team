'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { isValidISODate } from '@/lib/dates';
import { str } from '@/lib/site';
import { TASK_STATUSES, type TaskStatus } from '@/lib/types';
import type { FormState } from '@/lib/auth/actions';

/**
 * Mọi kiểm tra quyền thật sự nằm ở RLS + trigger trong Supabase.
 * Server action chỉ kiểm tra định dạng và đổi lỗi sang tiếng Việt.
 */

const refresh = () => revalidatePath('/', 'layout');
const NO_ROW = 'Bạn không có quyền sửa công việc này (hoặc nó đã bị xoá).';

export async function createTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = str(fd, 'projectId');
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { error: 'Dự án không tồn tại hoặc bạn không phải thành viên.' };

  const title = str(fd, 'title');
  const startDate = str(fd, 'startDate');
  const dueDate = str(fd, 'dueDate');
  if (!title) return { error: 'Nhập tên công việc.' };
  if (!isValidISODate(startDate) || !isValidISODate(dueDate)) return { error: 'Ngày không hợp lệ.' };
  if (dueDate < startDate) return { error: 'Hạn chót phải sau hoặc bằng ngày bắt đầu.' };

  const assigneeId = project.role === 'owner' ? str(fd, 'assigneeId') || null : user.id;
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    project_id: projectId,
    milestone_id: str(fd, 'milestoneId') || null,
    title: title.slice(0, 300),
    assignee_id: assigneeId,
    start_date: startDate,
    due_date: dueDate,
    depends_on: fd.getAll('dependsOn').map(String).filter(Boolean)
  });
  if (error) return { error: dbErrorMessage(error, 'Không tạo được công việc.') };
  refresh();
  return { ok: true, message: `Đã tạo “${title}”.` };
}

export async function updateTaskStatusAction(taskId: string, status: TaskStatus): Promise<{ error?: string }> {
  await requireUser();
  if (!TASK_STATUSES.includes(status)) return { error: 'Trạng thái không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', taskId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: NO_ROW };
  refresh();
  return {};
}

export async function updateTaskProgressAction(taskId: string, progress: number, currentStatus: TaskStatus): Promise<{ error?: string }> {
  await requireUser();
  const value = Math.round(Math.max(0, Math.min(100, Number(progress) || 0)));
  const patch: { progress: number; status?: TaskStatus } = { progress: value };
  if (currentStatus === 'todo' && value > 0) patch.status = 'doing';
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: NO_ROW };
  refresh();
  return {};
}

export async function updateTaskAssigneeAction(taskId: string, assigneeId: string | null): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: NO_ROW };
  refresh();
  return {};
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('tasks').delete().eq('id', str(fd, 'taskId'));
  refresh();
}
