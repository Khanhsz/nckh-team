import type { CslItem } from './scholar/publication';
export type { CslItem };

/** Kiểu dữ liệu miền (camelCase) — ánh xạ từ các bảng Supabase trong src/lib/data/mappers.ts */

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export type TaskCategory = 'task' | 'data' | 'survey';

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
  /** Ảnh bìa: 'c:<mã mẫu>' | 'img:<đường dẫn trong bucket covers>' | 'url:<https…>' */
  cover: string | null;
  /** Vị trí dọc của ảnh bìa, 0–100 (%) */
  coverY: number;
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

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  /** ISO có múi giờ */
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetUrl: string | null;
  notes: string | null;
  attendeeIds: string[];
  guestEmails: string[];
  sequence: number;
  createdBy: string;
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
  /** Thông tin xuất bản (Gemini đọc từ PDF, bổ sung bằng Crossref) */
  pub: PaperPublication;
  /** Quan hệ giữa các biến (null = chưa phân tích) */
  relations: Relation[] | null;
}

export interface PaperPublication {
  doi: string | null;
  journal: string | null;
  issns: string[];
  publisher: string | null;
  year: number | null;
  citedBy: number | null;
  source: string | null;
  checkedAt: string | null;
  /** Dữ liệu trích dẫn đầy đủ từ Crossref (tác giả, tập, số, trang) */
  csl: CslItem | null;
}

export type JournalFlagKind = 'scopus_discontinued' | 'beall_journal' | 'beall_publisher' | 'team_watch';

/** Danh sách theo dõi riêng của nhóm (NXB / tạp chí cần dè chừng) */
export interface WatchItem {
  id: string;
  kind: 'publisher' | 'journal';
  name: string;
  note: string | null;
  createdAt: string;
}
export interface JournalFlag {
  kind: JournalFlagKind;
  title: string | null;
  publisher: string | null;
  reason: string | null;
  since: string | null;
}
/** Độ tin cậy của một bài: hạng tạp chí (SCImago) + cảnh báo */
export interface PaperCredibility {
  quartile: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  sjr: number | null;
  hIndex: number | null;
  categories: string | null;
  rankYear: number | null;
  rankTitle: string | null;
  flags: JournalFlag[];
}

export const PAPER_STATUS_LABEL: Record<PaperStatus, string> = {
  pending: 'Chưa trích xuất',
  processing: 'Đang trích xuất…',
  completed: 'Đã trích xuất',
  error: 'Lỗi',
  stale: 'File đã đổi — cần trích xuất lại'
};

export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];

export const TASK_CATEGORIES: TaskCategory[] = ['task', 'data', 'survey'];
export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = { task: 'Task', data: 'Data', survey: 'Survey' };
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

/* ---------------- Bản đồ biến – giả thuyết ---------------- */
export type RelType = 'direct' | 'mediation' | 'moderation';
export type RelResult = 'supported' | 'not_supported' | 'partial' | 'not_tested';
export type RelSign = 'positive' | 'negative' | 'none' | 'unclear';
export interface Relation {
  from: string;
  to: string;
  type: RelType;
  /** biến trung gian / điều tiết */
  via: string | null;
  sign: RelSign;
  result: RelResult;
  hypothesis: string | null;
  page: string | null;
}
