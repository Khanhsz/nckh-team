import type { Database } from '../supabase/database.types';
import type { Milestone, Paper, Profile, Project, ProjectRole, Task, TaskStatus } from '../types';

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
  endDate: r.end_date
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
  title: r.title,
  description: r.description,
  assigneeId: r.assignee_id,
  startDate: r.start_date,
  dueDate: r.due_date,
  dependsOn: r.depends_on ?? [],
  progress: r.progress,
  status: r.status as TaskStatus,
  createdBy: r.created_by,
  updatedAt: r.updated_at
});

export const mapPaper = (r: Pick<T['papers']['Row'], 'id' | 'project_id' | 'file_name' | 'status' | 'created_by' | 'created_at'>): Paper => ({
  id: r.id,
  projectId: r.project_id,
  fileName: r.file_name,
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at
});

export const asRole = (r: string): ProjectRole => (r === 'owner' || r === 'editor' ? r : 'viewer');
