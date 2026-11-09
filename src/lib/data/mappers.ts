import type { Database } from '../supabase/database.types';
import type { Milestone, Paper, PaperStatus, Profile, Project, ProjectRole, Task, TaskStatus } from '../types';
import { isTaskCategory } from '../types';

type T = Database['public']['Tables'];

export const mapProfile = (r: T['profiles']['Row']): Profile => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  studentId: r.student_id,
  researchInterest: r.research_interest,
  phone: r.phone,
  onboarded: r.onboarded
});

export const mapProject = (r: T['projects']['Row']): Project => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.research_topic,
  ownerId: r.owner_id,
  startDate: r.start_date,
  endDate: r.end_date,
  driveFolderId: r.drive_folder_id,
  driveFolderName: r.drive_folder_name,
  driveSyncedAt: r.drive_synced_at,
  writingFolderId: r.writing_folder_id,
  writingFolderName: r.writing_folder_name
});

export const mapMilestone = (r: T['milestones']['Row']): Milestone => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  dueDate: r.due_date,
  sortOrder: r.sort_order
});

export const mapTask = (r: T['tasks']['Row']): Task => ({
  id: r.id,
  projectId: r.project_id,
  milestoneId: r.milestone_id,
  parentId: r.parent_id ?? null,
  isTeam: Boolean(r.is_team),
  title: r.title,
  description: r.description,
  assigneeId: r.assignee_id,
  startDate: r.start_date,
  dueDate: r.due_date,
  dependsOn: r.depends_on ?? [],
  progress: r.progress,
  status: r.status as TaskStatus,
  category: isTaskCategory(r.category) ? r.category : 'task',
  createdBy: r.created_by,
  updatedAt: r.updated_at
});

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const PAPER_STATUSES: PaperStatus[] = ['pending', 'processing', 'completed', 'error', 'stale'];

export const mapPaper = (r: T['papers']['Row']): Paper => {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(asObject(r.fields))) if (typeof v === 'string') fields[k] = v;
  const verified: Paper['verified'] = {};
  for (const [k, v] of Object.entries(asObject(r.verified))) {
    const o = asObject(v);
    if (typeof o.by === 'string' && typeof o.at === 'string') verified[k] = { by: o.by, at: o.at };
  }
  return {
    id: r.id,
    projectId: r.project_id,
    fileName: r.file_name,
    status: (PAPER_STATUSES as string[]).includes(r.status) ? (r.status as PaperStatus) : 'pending',
    createdBy: r.created_by,
    createdAt: r.created_at,
    driveFileId: r.drive_file_id,
    driveWebLink: r.drive_web_link,
    driveModifiedTime: r.drive_modified_time,
    fileSize: r.file_size,
    extractedAt: r.extracted_at,
    model: r.model,
    error: r.error,
    fields,
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string') : [],
    verified
  };
};

export const asRole = (r: string): ProjectRole => (r === 'owner' || r === 'editor' ? r : 'viewer');
