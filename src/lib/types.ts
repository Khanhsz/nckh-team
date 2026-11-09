/** Kiểu dữ liệu miền (camelCase) — ánh xạ từ các bảng Supabase trong src/lib/data/mappers.ts */

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export type TaskCategory = 'task' | 'meeting' | 'data' | 'survey';

export interface Profile {
  id: string;
  email: string | null;
  displayName: string;
  studentId: string | null;
  researchInterest: string | null;
  phone: string | null;
  onboarded: boolean;
}

export interface Project {
  id: string;
  code: string | null;
  name: string;
  description: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  driveFolderId: string | null;
  driveFolderName: string | null;
  driveSyncedAt: string | null;
  writingFolderId: string | null;
  writingFolderName: string | null;
}

export interface ProjectWithRole extends Project {
  role: ProjectRole;
}

export interface Member {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  displayName: string;
  email: string | null;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  sortOrder: number;
}

export interface Task {
  id: string;
  projectId: string;
  milestoneId: string | null;
  /** Việc cha (null = công việc chính). Chỉ 1 cấp. */
  parentId: string | null;
  /** Việc chung của cả nhóm (không có người phụ trách riêng; chia subtask cho từng người) */
  isTeam: boolean;
  /** Người cùng làm (ngoài người phụ trách chính) */
  coAssigneeIds: string[];
  title: string;
  description: string | null;
  assigneeId: string | null;
  startDate: string;
  dueDate: string;
  dependsOn: string[];
  progress: number;
  status: TaskStatus;
  category: TaskCategory;
  createdBy: string;
  updatedAt: string;
}

export type PaperStatus = 'pending' | 'processing' | 'completed' | 'error' | 'stale';

export interface Paper {
  id: string;
  projectId: string;
  fileName: string;
  status: PaperStatus;
  createdBy: string;
  createdAt: string;
  driveFileId: string | null;
  driveWebLink: string | null;
  driveModifiedTime: string | null;
  fileSize: number | null;
  extractedAt: string | null;
  model: string | null;
  error: string | null;
  fields: Record<string, string>;
  warnings: string[];
  /** field key → người xác nhận */
  verified: Record<string, { by: string; at: string }>;
}

export const PAPER_STATUS_LABEL: Record<PaperStatus, string> = {
  pending: 'Chưa trích xuất',
  processing: 'Đang trích xuất…',
  completed: 'Đã trích xuất',
  error: 'Lỗi',
  stale: 'File đã đổi — cần trích xuất lại'
};

export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];

export const TASK_CATEGORIES: TaskCategory[] = ['task', 'meeting', 'data', 'survey'];
export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = { task: 'Task', meeting: 'Meeting', data: 'Data', survey: 'Survey' };
export const isTaskCategory = (v: string): v is TaskCategory => (TASK_CATEGORIES as string[]).includes(v);

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Chưa làm',
  doing: 'Đang làm',
  review: 'Chờ duyệt',
  done: 'Hoàn thành'
};

export const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: 'Trưởng nhóm',
  editor: 'Thành viên',
  viewer: 'Người xem (GVHD)'
};

export const projectLabel = (p: Pick<Project, 'code' | 'name'>) => p.code || p.name.slice(0, 12);

export interface ProjectDocument {
  id: string;
  projectId: string;
  driveFileId: string | null;
  url: string | null;
  title: string;
  kind: 'working' | 'proposal' | 'review' | 'other' | 'link';
  createdBy: string;
  createdAt: string;
}

/** Tất cả người phụ trách một việc: người chính trước, rồi người cùng làm */
export const taskAssignees = (t: Pick<Task, 'assigneeId' | 'coAssigneeIds'>): string[] =>
  t.assigneeId ? [t.assigneeId, ...t.coAssigneeIds.filter((id) => id !== t.assigneeId)] : [...t.coAssigneeIds];
export const isAssignedTo = (t: Pick<Task, 'assigneeId' | 'coAssigneeIds'>, userId: string) =>
  t.assigneeId === userId || t.coAssigneeIds.includes(userId);
