import { isAssignedTo, type ProjectRole, type Task } from '../types';

/**
 * Quy tắc hiển thị trên giao diện — PHẢN CHIẾU RLS trong database.
 * Database mới là nơi thực thi thật; ở đây chỉ để ẩn/hiện nút cho đúng.
 */
export const canManage = (role: ProjectRole) => role === 'owner';
export const canCreateTask = (role: ProjectRole) => role === 'owner' || role === 'editor';
export const canUpdateTask = (role: ProjectRole, userId: string, task: Task) =>
  role === 'owner' || (role === 'editor' && isAssignedTo(task, userId));
