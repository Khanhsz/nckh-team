'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getProjectForUser } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { getDocMeta, parseDocId, serviceAccountEmail } from '@/lib/google/drive';
import { str } from '@/lib/site';
import type { FormState } from '@/lib/auth/actions';

export interface DocFormState extends FormState {
  docId?: string;
}

const refresh = () => revalidatePath('/', 'layout');

/** Gắn tài liệu có sẵn: link Google Docs (có xem trước) hoặc link bất kỳ. */
export async function attachLinkAction(_prev: DocFormState, fd: FormData): Promise<DocFormState> {
  const user = await requireUser();
  const projectId = str(fd, 'projectId');
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role === 'viewer') return { error: 'Bạn không có quyền thêm tài liệu trong dự án này.' };

  const raw = str(fd, 'url');
  const customTitle = str(fd, 'title').slice(0, 300);
  let url: URL;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
  } catch {
    return { error: 'Link không hợp lệ — dán đầy đủ địa chỉ bắt đầu bằng https://' };
  }

  const supabase = await createClient();
  const isGoogleDoc = url.hostname === 'docs.google.com' && url.pathname.startsWith('/document/');
  const docId = isGoogleDoc ? parseDocId(raw) : null;

  let row: { drive_file_id: string | null; url: string | null; title: string; kind: string };
  if (docId) {
    // Lấy tên thật của Doc nếu bot đọc được; không đọc được vẫn cho gắn
    let title = customTitle;
    if (!title && serviceAccountEmail()) {
      try {
        title = (await getDocMeta(docId)).name;
      } catch {
        /* Doc nằm ngoài Shared Drive của bot — vẫn gắn được, chỉ thiếu tên tự động */
      }
    }
    row = { drive_file_id: docId, url: null, title: (title || 'Google Doc').slice(0, 300), kind: 'working' };
  } else {
    row = { drive_file_id: null, url: url.toString().slice(0, 2000), title: (customTitle || url.hostname.replace(/^www\./, '')).slice(0, 300), kind: 'link' };
  }

  const { data, error } = await supabase
    .from('project_documents')
    .insert({ project_id: projectId, ...row })
    .select('id')
    .single();
  if (error?.code === '23505') return { error: 'Tài liệu/link này đã có trong danh sách.' };
  if (error || !data) return { error: dbErrorMessage(error, 'Không thêm được.') };
  refresh();
  return { ok: true, message: `Đã gắn “${row.title}”.`, docId: data.id };
}

export async function unlinkDocAction(fd: FormData): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('project_documents').delete().eq('id', str(fd, 'docId'));
  refresh();
}
