/** Kiểu dữ liệu miền (camelCase) — ánh xạ từ các bảng Supabase trong src/lib/data/mappers.ts */

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';

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
  title: string;
  description: string | null;
  assigneeId: string | null;
  startDate: string;
  dueDate: string;
  dependsOn: string[];
  progress: number;
  status: TaskStatus;
  createdBy: string;
  updatedAt: string;
}

export interface Paper {
  id: string;
  projectId: string;
  fileName: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];

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
