'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listPapers } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { createDocFromHtml, DriveError, getDocMeta, getFolder, parseDocId, parseFolderId } from '@/lib/google/drive';
import { buildDocHtml, type DocTemplate } from '@/lib/writing/templates';
import { str } from '@/lib/site';
import type { FormState } from '@/lib/auth/actions';

export interface DocFormState extends FormState {
  docId?: string;
}

const refresh = () => revalidatePath('/', 'layout');
const KIND: Record<DocTemplate, 'working' | 'proposal' | 'review' | 'other'> = { paper: 'working', proposal: 'proposal', review: 'review', blank: 'other' };

async function editable(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role === 'viewer') return null;
  return project;
}

export async function connectWritingFolderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = str(fd, 'projectId');
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role !== 'owner') return { error: 'Chỉ trưởng nhóm được chọn thư mục bài viết.' };
  const folderId = parseFolderId(str(fd, 'folder'));
  if (!folderId) return { error: 'Không nhận ra link thư mục Drive.' };
  try {
    const folder = await getFolder(folderId);
    const supabase = await createClient();
    const { error } = await supabase
      .from('projects')
      .update({ writing_folder_id: folder.id, writing_folder_name: folder.name.slice(0, 200) })
      .eq('id', projectId);
    if (error) return { error: dbErrorMessage(error) };
    refresh();
    return { ok: true, message: `Working file mới sẽ được tạo trong “${folder.name}”.` };
  } catch (e) {
    return { error: e instanceof DriveError ? e.message : 'Không truy cập được thư mục.' };
  }
}

export async function createDocAction(_prev: DocFormState, fd: FormData): Promise<DocFormState> {
  const projectId = str(fd, 'projectId');
  const project = await editable(projectId);
  if (!project) return { error: 'Bạn không có quyền tạo tài liệu trong dự án này.' };
  const title = str(fd, 'title').slice(0, 200);
  const template = (['paper', 'proposal', 'review', 'blank'].includes(str(fd, 'template')) ? str(fd, 'template') : 'paper') as DocTemplate;
  if (!title) return { error: 'Nhập tên tài liệu.' };
  const folderId = project.writingFolderId ?? project.driveFolderId;
  if (!folderId) return { error: 'Chưa có thư mục Drive để lưu tài liệu. Trưởng nhóm cần chọn thư mục bài viết.' };

  try {
    const papers = template === 'review' ? await listPapers(projectId) : [];
    const doc = await createDocFromHtml(folderId, title, buildDocHtml(template, project, title, papers));
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_documents')
      .insert({ project_id: projectId, drive_file_id: doc.id, title, kind: KIND[template] })
      .select('id')
      .single();
    if (error || !data) return { error: dbErrorMessage(error, 'Đã tạo file trên Drive nhưng không lưu được vào app.') };
    refresh();
    return { ok: true, message: `Đã tạo “${title}”.`, docId: data.id };
  } catch (e) {
    return { error: e instanceof DriveError ? e.message : 'Không tạo được tài liệu.' };
  }
}

export async function linkDocAction(_prev: DocFormState, fd: FormData): Promise<DocFormState> {
  const projectId = str(fd, 'projectId');
  const project = await editable(projectId);
  if (!project) return { error: 'Bạn không có quyền thêm tài liệu trong dự án này.' };
  const docId = parseDocId(str(fd, 'url'));
  if (!docId) return { error: 'Không nhận ra link Google Docs (dạng docs.google.com/document/d/…).' };
  try {
    const meta = await getDocMeta(docId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('project_documents')
      .insert({ project_id: projectId, drive_file_id: meta.id, title: meta.name.slice(0, 300) || 'Tài liệu', kind: 'working' })
      .select('id')
      .single();
    if (error?.code === '23505') return { error: 'Tài liệu này đã có trong danh sách.' };
    if (error || !data) return { error: dbErrorMessage(error, 'Không thêm được tài liệu.') };
    refresh();
    return { ok: true, message: `Đã gắn “${meta.name}”.`, docId: data.id };
  } catch (e) {
    if (e instanceof DriveError && (e.code === 'not_found' || e.code === 'forbidden')) {
      return { error: 'Bot không mở được tài liệu này. Hãy đặt file trong Shared Drive của nhóm (hoặc chia sẻ cho email bot).' };
    }
    return { error: e instanceof DriveError ? e.message : 'Không thêm được tài liệu.' };
  }
}

export async function unlinkDocAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('project_documents').delete().eq('id', str(fd, 'docId'));
  refresh();
}
