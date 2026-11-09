'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { isValidISODate } from '@/lib/dates';
import { str } from '@/lib/site';
import { isTaskCategory, TASK_STATUSES, type TaskCategory, type TaskStatus } from '@/lib/types';
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
    depends_on: fd.getAll('dependsOn').map(String).filter(Boolean),
    category: isTaskCategory(str(fd, 'category')) ? str(fd, 'category') : 'task',
    parent_id: str(fd, 'parentId') || null
  });
  if (error) return { error: dbErrorMessage(error, 'Không tạo được công việc.') };
  refresh();
  return { ok: true, message: `Đã tạo ${str(fd, 'parentId') ? 'subtask ' : ''}“${title}”.` };
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

/* ---------------- Dùng cho Gantt tương tác ---------------- */

export interface TaskPatchInput {
  title?: string;
  milestoneId?: string | null;
  assigneeId?: string | null;
  startDate?: string;
  dueDate?: string;
  status?: TaskStatus;
  dependsOn?: string[];
  category?: TaskCategory;
  parentId?: string | null;
}

export async function updateTaskAction(taskId: string, patch: TaskPatchInput): Promise<{ error?: string }> {
  await requireUser();
  const db: {
    title?: string;
    milestone_id?: string | null;
    assignee_id?: string | null;
    start_date?: string;
    due_date?: string;
    status?: TaskStatus;
    depends_on?: string[];
    category?: TaskCategory;
    parent_id?: string | null;
  } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: 'Tên công việc không được để trống.' };
    db.title = t.slice(0, 300);
  }
  if (patch.milestoneId !== undefined) db.milestone_id = patch.milestoneId || null;
  if (patch.assigneeId !== undefined) db.assignee_id = patch.assigneeId || null;
  if (patch.startDate !== undefined) {
    if (!isValidISODate(patch.startDate)) return { error: 'Ngày bắt đầu không hợp lệ.' };
    db.start_date = patch.startDate;
  }
  if (patch.dueDate !== undefined) {
    if (!isValidISODate(patch.dueDate)) return { error: 'Hạn chót không hợp lệ.' };
    db.due_date = patch.dueDate;
  }
  if (db.start_date && db.due_date && db.due_date < db.start_date) return { error: 'Hạn chót phải sau hoặc bằng ngày bắt đầu.' };
  if (patch.status !== undefined) {
    if (!TASK_STATUSES.includes(patch.status)) return { error: 'Trạng thái không hợp lệ.' };
    db.status = patch.status;
  }
  if (patch.dependsOn !== undefined) db.depends_on = patch.dependsOn.filter(Boolean).slice(0, 50);
  if (patch.category !== undefined) {
    if (!isTaskCategory(patch.category)) return { error: 'Loại công việc không hợp lệ.' };
    db.category = patch.category;
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId === taskId) return { error: 'Công việc không thể là subtask của chính nó.' };
    db.parent_id = patch.parentId || null;
  }
  if (Object.keys(db).length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update(db).eq('id', taskId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: NO_ROW };
  refresh();
  return {};
}

export async function createTaskQuickAction(
  projectId: string,
  input: { title: string; milestoneId: string | null; assigneeId: string | null; startDate: string; dueDate: string; dependsOn: string[]; category?: TaskCategory; parentId?: string | null }
): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { error: 'Dự án không tồn tại hoặc bạn không phải thành viên.' };
  if (project.role === 'viewer') return { error: 'Người xem không tạo được công việc.' };
  const title = input.title.trim();
  if (!title) return { error: 'Nhập tên công việc.' };
  if (!isValidISODate(input.startDate) || !isValidISODate(input.dueDate)) return { error: 'Ngày không hợp lệ.' };
  if (input.dueDate < input.startDate) return { error: 'Hạn chót phải sau hoặc bằng ngày bắt đầu.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      milestone_id: input.milestoneId || null,
      title: title.slice(0, 300),
      assignee_id: project.role === 'owner' ? input.assigneeId || null : user.id,
      start_date: input.startDate,
      due_date: input.dueDate,
      depends_on: input.dependsOn.filter(Boolean).slice(0, 50),
      category: input.category && isTaskCategory(input.category) ? input.category : 'task',
      parent_id: input.parentId || null
    })
    .select('id')
    .single();
  if (error || !data) return { error: dbErrorMessage(error, 'Không tạo được công việc.') };
  refresh();
  return { id: data.id };
}

export async function deleteTaskByIdAction(taskId: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Chỉ trưởng nhóm được xoá công việc.' };
  refresh();
  return {};
}
