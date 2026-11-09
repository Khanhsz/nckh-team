'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getPaper, getProjectForUser } from '@/lib/data/queries';
import { dbErrorMessage } from '@/lib/errors';
import { DriveError, downloadPdf, getFolder, listPdfs, parseFolderId } from '@/lib/google/drive';
import { ExtractError, extractPaper } from '@/lib/ai/extract';
import { isPaperFieldKey } from '@/lib/ai/fields';
import { str } from '@/lib/site';
import { normalizeDoi, normalizeIssns, parseYear, resolvePublication, type PublicationMeta } from '@/lib/scholar/publication';
import type { FormState } from '@/lib/auth/actions';
import type { Json } from '@/lib/supabase/database.types';

const MAX_PDF_BYTES = 14 * 1024 * 1024; // giới hạn gửi trực tiếp cho Gemini (sau base64 < 20 MB)
const refresh = () => revalidatePath('/', 'layout');
const errText = (e: unknown, fallback: string) => (e instanceof DriveError || e instanceof ExtractError ? e.message : fallback);

/** Ghi thông tin xuất bản vào bài (chỉ ghi đè khi có giá trị mới) */
async function savePublication(paperId: string, meta: PublicationMeta) {
  const supabase = await createClient();
  const patch: {
    meta_checked_at: string;
    meta_source: string;
    doi?: string;
    journal?: string;
    issns?: string[];
    publisher?: string;
    pub_year?: number;
    cited_by?: number;
    csl?: Json;
  } = { meta_checked_at: new Date().toISOString(), meta_source: meta.source };
  if (meta.doi) patch.doi = meta.doi;
  if (meta.journal) patch.journal = meta.journal;
  if (meta.issns.length) patch.issns = meta.issns;
  if (meta.publisher) patch.publisher = meta.publisher;
  if (meta.year) patch.pub_year = meta.year;
  if (meta.citedBy !== null) patch.cited_by = meta.citedBy;
  if (meta.csl) patch.csl = meta.csl as unknown as Json;
  return supabase.from('papers').update(patch).eq('id', paperId).select('id');
}

async function editableProject(projectId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { user, project: null, error: 'Dự án không tồn tại hoặc bạn không phải thành viên.' };
  if (project.role === 'viewer') return { user, project: null, error: 'Người xem không thực hiện được thao tác này.' };
  return { user, project, error: null };
}

/* ---------------- Kết nối thư mục Drive (trưởng nhóm) ---------------- */

export async function connectDriveFolderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = str(fd, 'projectId');
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role !== 'owner') return { error: 'Chỉ trưởng nhóm được kết nối thư mục Drive.' };

  const folderId = parseFolderId(str(fd, 'folder'));
  if (!folderId) return { error: 'Không nhận ra link thư mục. Mở thư mục trên Drive và copy link trên thanh địa chỉ (dạng …/folders/…).' };

  let folder: { id: string; name: string };
  try {
    folder = await getFolder(folderId);
  } catch (e) {
    return { error: errText(e, 'Không truy cập được thư mục.') };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('projects')
    .update({ drive_folder_id: folder.id, drive_folder_name: folder.name.slice(0, 200) })
    .eq('id', projectId);
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `Đã kết nối thư mục “${folder.name}”. Bấm “Đồng bộ ngay” để nhập danh sách PDF.` };
}

export async function disconnectDriveFolderAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = str(fd, 'projectId');
  const project = await getProjectForUser(projectId, user.id);
  if (!project || project.role !== 'owner') return;
  const supabase = await createClient();
  await supabase.from('projects').update({ drive_folder_id: null, drive_folder_name: null }).eq('id', projectId);
  refresh();
}

/* ---------------- Đồng bộ danh sách PDF ---------------- */

export interface SyncResult {
  error?: string;
  added?: number;
  changed?: number;
  total?: number;
}

export async function syncDriveAction(projectId: string): Promise<SyncResult> {
  const { user, project, error } = await editableProject(projectId);
  if (!project) return { error: error ?? 'Không có quyền.' };
  if (!project.driveFolderId) return { error: 'Dự án chưa kết nối thư mục Drive.' };

  let files;
  try {
    files = await listPdfs(project.driveFolderId);
  } catch (e) {
    return { error: errText(e, 'Không đọc được thư mục Drive.') };
  }

  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase
    .from('papers')
    .select('id, drive_file_id, drive_modified_time, status')
    .eq('project_id', projectId)
    .not('drive_file_id', 'is', null);
  if (exErr) return { error: dbErrorMessage(exErr) };
  const byDriveId = new Map((existing ?? []).map((p) => [p.drive_file_id as string, p]));

  const toInsert = files
    .filter((f) => !byDriveId.has(f.id))
    .map((f) => ({
      project_id: projectId,
      file_name: f.name.slice(0, 400),
      status: 'pending',
      created_by: user.id,
      drive_file_id: f.id,
      drive_modified_time: f.modifiedTime,
      drive_web_link: f.webViewLink,
      file_size: f.size
    }));

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('papers').insert(toInsert);
    if (insErr) return { error: dbErrorMessage(insErr, 'Không lưu được danh sách bài.') };
  }

  // File đã sửa trên Drive sau lần đồng bộ trước → đánh dấu cần trích xuất lại
  let changed = 0;
  for (const f of files) {
    const old = byDriveId.get(f.id);
    if (!old || !old.drive_modified_time || new Date(f.modifiedTime) <= new Date(old.drive_modified_time)) continue;
    const patch: { drive_modified_time: string; drive_web_link: string | null; file_size: number | null; file_name: string; status?: string } = {
      drive_modified_time: f.modifiedTime,
      file_name: f.name.slice(0, 400),
      drive_web_link: f.webViewLink,
      file_size: f.size
    };
    if (old.status === 'completed') patch.status = 'stale';
    const { error: upErr } = await supabase.from('papers').update(patch).eq('id', old.id);
    if (!upErr) changed++;
  }

  await supabase.rpc('mark_drive_synced', { p_project_id: projectId });
  refresh();
  return { added: toInsert.length, changed, total: files.length };
}

/* ---------------- Trích xuất bằng Gemini ---------------- */

export async function extractPaperAction(paperId: string): Promise<{ error?: string; stop?: boolean }> {
  const paper = await getPaper(paperId);
  if (!paper) return { error: 'Không tìm thấy bài.' };
  const { project, error } = await editableProject(paper.projectId);
  if (!project) return { error: error ?? 'Không có quyền.', stop: true };
  if (!paper.driveFileId) return { error: 'Bài này không có file trên Drive.' };

  const supabase = await createClient();
  await supabase.from('papers').update({ status: 'processing', error: null }).eq('id', paperId);

  try {
    const pdf = await downloadPdf(paper.driveFileId, MAX_PDF_BYTES);
    const result = await extractPaper(pdf, {
      fileName: paper.fileName,
      projectTopic: [project.name, project.description].filter(Boolean).join(' — ')
    });
    const { error: saveErr } = await supabase
      .from('papers')
      .update({
        status: 'completed',
        fields: result.fields,
        warnings: result.warnings,
        model: result.model,
        error: null,
        extracted_at: new Date().toISOString(),
        verified: {},
        // Nội dung đổi → phân tích giả thuyết lại ở Bản đồ biến
        relations: null,
        relations_at: null
      })
      .eq('id', paperId);
    if (saveErr) throw saveErr;
    // Thông tin xuất bản: Gemini đọc từ PDF + Crossref bổ sung (lỗi ở bước này không làm hỏng kết quả trích xuất)
    try {
      const meta = await resolvePublication({
        ...result.publication,
        issns: result.publication.issn,
        bibliographic: result.fields.paperInformation
      });
      await savePublication(paperId, meta);
    } catch (metaErr) {
      console.error('publication', metaErr);
    }
    refresh();
    return {};
  } catch (e) {
    const message = e instanceof DriveError || e instanceof ExtractError ? e.message : 'Trích xuất thất bại. Thử lại sau.';
    await supabase.from('papers').update({ status: 'error', error: message.slice(0, 500) }).eq('id', paperId);
    refresh();
    const stop = (e instanceof ExtractError && (e.code === 'quota' || e.code === 'not_configured')) || (e instanceof DriveError && e.code === 'not_configured');
    return { error: message, stop };
  }
}

/* ---------------- Sửa & xác nhận từng ô ---------------- */

export async function updatePaperFieldAction(paperId: string, field: string, value: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isPaperFieldKey(field)) return { error: 'Trường không hợp lệ.' };
  const paper = await getPaper(paperId);
  if (!paper) return { error: 'Không tìm thấy bài.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('papers')
    .update({
      fields: { ...paper.fields, [field]: value.slice(0, 20000) },
      // Người sửa tay = đã kiểm tra ô đó
      verified: { ...paper.verified, [field]: { by: user.id, at: new Date().toISOString() } }
    })
    .eq('id', paperId)
    .select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa bài này.' };
  refresh();
  return {};
}

export async function setFieldVerifiedAction(paperId: string, field: string, verified: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isPaperFieldKey(field)) return { error: 'Trường không hợp lệ.' };
  const paper = await getPaper(paperId);
  if (!paper) return { error: 'Không tìm thấy bài.' };
  const next = { ...paper.verified };
  if (verified) next[field] = { by: user.id, at: new Date().toISOString() };
  else delete next[field];
  const supabase = await createClient();
  const { data, error } = await supabase.from('papers').update({ verified: next }).eq('id', paperId).select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa bài này.' };
  refresh();
  return {};
}

/* ---------------- Độ tin cậy: tra thông tin xuất bản (không tốn lượt Gemini) ---------------- */

export async function refreshPaperMetaAction(paperId: string): Promise<{ error?: string; stop?: boolean }> {
  const paper = await getPaper(paperId);
  if (!paper) return { error: 'Không tìm thấy bài.' };
  const { project, error } = await editableProject(paper.projectId);
  if (!project) return { error: error ?? 'Không có quyền.', stop: true };
  const info = paper.fields.paperInformation;
  const meta = await resolvePublication({
    doi: paper.pub.doi,
    journal: paper.pub.journal,
    issns: paper.pub.issns,
    publisher: paper.pub.publisher,
    year: paper.pub.year,
    title: info ? null : paper.fileName.replace(/\.pdf$/i, '').replace(/[_]+/g, ' '),
    bibliographic: info ?? null
  });
  const { data, error: dbErr } = await savePublication(paperId, meta);
  if (dbErr) return { error: dbErrorMessage(dbErr) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa bài này.', stop: true };
  refresh();
  return {};
}

/** Sửa tay thông tin xuất bản (khi AI/Crossref nhận sai) */
export async function updatePublicationAction(
  paperId: string,
  input: { doi: string; journal: string; issns: string; publisher: string; year: string }
): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('papers')
    .update({
      doi: normalizeDoi(input.doi),
      journal: input.journal.trim().slice(0, 300) || null,
      issns: normalizeIssns(input.issns),
      publisher: input.publisher.trim().slice(0, 300) || null,
      pub_year: parseYear(input.year),
      meta_source: 'manual',
      meta_checked_at: new Date().toISOString()
    })
    .eq('id', paperId)
    .select('id');
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa bài này.' };
  refresh();
  return {};
}
