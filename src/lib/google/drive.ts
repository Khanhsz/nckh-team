import 'server-only';
import { createSign } from 'crypto';

/**
 * Đọc Google Shared Drive bằng tài khoản bot (service account) — chỉ quyền đọc.
 * Tự ký JWT bằng node:crypto, gọi Drive REST API trực tiếp → không cần thư viện googleapis.
 * Khoá lấy từ biến môi trường GOOGLE_SERVICE_ACCOUNT_JSON (nội dung file JSON, hoặc base64 của nó).
 */

export class DriveError extends Error {
  constructor(
    public code: 'not_configured' | 'auth' | 'not_found' | 'forbidden' | 'not_folder' | 'not_doc' | 'too_large' | 'http',
    message: string
  ) {
    super(message);
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function loadKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as Partial<ServiceAccountKey>;
    if (!json.client_email || !json.private_key) return null;
    return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

export function serviceAccountEmail(): string | null {
  return loadKey()?.client_email ?? null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const key = loadKey();
  if (!key) throw new DriveError('not_configured', 'Chưa cấu hình tài khoản bot Google (biến GOOGLE_SERVICE_ACCOUNT_JSON trên Vercel).');

  const now = Math.floor(Date.now() / 1000);
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })}`;
  let signature: string;
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  } catch {
    throw new DriveError('auth', 'Khoá riêng của tài khoản bot không hợp lệ — hãy dán lại nguyên nội dung file JSON.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    cache: 'no-store'
  });
  if (!res.ok) throw new DriveError('auth', 'Google từ chối xác thực tài khoản bot — kiểm tra khoá JSON và đã bật Google Drive API chưa.');
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function driveGet(path: string, params: Record<string, string>): Promise<Response> {
  const token = await accessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  url.searchParams.set('supportsAllDrives', 'true');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (res.status === 404) throw new DriveError('not_found', 'Bot không thấy thư mục/file này. Hãy thêm email bot vào Shared Drive (quyền Người xem trở lên).');
  if (res.status === 403) {
    const body = await res.text();
    if (/accessNotConfigured|has not been used|is disabled/i.test(body)) {
      throw new DriveError('forbidden', 'Google Drive API chưa được bật trong Google Cloud project của bot.');
    }
    throw new DriveError('forbidden', 'Bot chưa có quyền truy cập. Hãy thêm email bot vào Shared Drive (quyền Người xem trở lên).');
  }
  if (!res.ok) throw new DriveError('http', `Google Drive trả lỗi ${res.status}. Thử lại sau ít phút.`);
  return res;
}

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

/** Nhận link thư mục Drive (hoặc ID) → ID thư mục. */
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,100})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,100})/);
  if (m) return m[1];
  return ID_RE.test(s) ? s : null;
}

export async function getFolder(folderId: string): Promise<{ id: string; name: string }> {
  if (!ID_RE.test(folderId)) throw new DriveError('not_found', 'ID thư mục không hợp lệ.');
  const res = await driveGet(`files/${folderId}`, { fields: 'id,name,mimeType' });
  const json = (await res.json()) as { id: string; name: string; mimeType: string };
  if (json.mimeType !== 'application/vnd.google-apps.folder') throw new DriveError('not_folder', 'Link này là một file, không phải thư mục.');
  return { id: json.id, name: json.name };
}

export interface DrivePdf {
  id: string;
  name: string;
  folderPath: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string | null;
}

/** Liệt kê mọi PDF trong thư mục và các thư mục con (tối đa maxFolders thư mục). */
export async function listPdfs(rootId: string, maxFolders = 80): Promise<DrivePdf[]> {
  const queue: { id: string; path: string }[] = [{ id: rootId, path: '' }];
  const seen = new Set<string>();
  const out: DrivePdf[] = [];

  while (queue.length > 0 && seen.size < maxFolders) {
    const folder = queue.shift()!;
    if (seen.has(folder.id) || !ID_RE.test(folder.id)) continue;
    seen.add(folder.id);
    let pageToken: string | undefined;
    do {
      const params: Record<string, string> = {
        q: `'${folder.id}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder')`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)',
        pageSize: '200',
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives'
      };
      if (pageToken) params.pageToken = pageToken;
      const json = (await (await driveGet('files', params)).json()) as {
        nextPageToken?: string;
        files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime: string; webViewLink?: string }[];
      };
      for (const f of json.files ?? []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          queue.push({ id: f.id, path: folder.path ? `${folder.path}/${f.name}` : f.name });
        } else {
          out.push({
            id: f.id,
            name: f.name,
            folderPath: folder.path,
            size: f.size ? Number(f.size) : null,
            modifiedTime: f.modifiedTime,
            webViewLink: f.webViewLink ?? null
          });
        }
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
  }
  return out;
}

export async function downloadPdf(fileId: string, maxBytes: number): Promise<Buffer> {
  if (!ID_RE.test(fileId)) throw new DriveError('not_found', 'ID file không hợp lệ.');
  const res = await driveGet(`files/${fileId}`, { alt: 'media' });
  const declared = Number(res.headers.get('content-length') || 0);
  const tooLarge = () =>
    new DriveError('too_large', `File lớn hơn ${Math.round(maxBytes / 1048576)} MB — hãy nén PDF (bỏ ảnh độ phân giải cao) rồi đồng bộ lại.`);
  if (declared > maxBytes) throw tooLarge();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw tooLarge();
  return buf;
}

/* ---------------- Google Docs (bài viết) ---------------- */

export interface DriveDocMeta {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string | null;
  lastModifiedBy: string | null;
}

/** Nhận link Google Docs (…/document/d/<id>/…) → ID. */
export function parseDocId(input: string): string | null {
  const m = input.trim().match(/\/document\/d\/([A-Za-z0-9_-]{10,100})/);
  if (m) return m[1];
  return ID_RE.test(input.trim()) ? input.trim() : null;
}

export async function getDocMeta(docId: string): Promise<DriveDocMeta> {
  if (!ID_RE.test(docId)) throw new DriveError('not_found', 'ID tài liệu không hợp lệ.');
  const res = await driveGet(`files/${docId}`, { fields: 'id,name,mimeType,modifiedTime,webViewLink,trashed,lastModifyingUser(displayName)' });
  const j = (await res.json()) as {
    id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string; trashed?: boolean;
    lastModifyingUser?: { displayName?: string };
  };
  if (j.mimeType !== 'application/vnd.google-apps.document') throw new DriveError('not_doc', 'Link này không phải Google Docs.');
  if (j.trashed) throw new DriveError('not_found', 'Tài liệu đã bị chuyển vào thùng rác trên Drive.');
  return { id: j.id, name: j.name, modifiedTime: j.modifiedTime, webViewLink: j.webViewLink ?? null, lastModifiedBy: j.lastModifyingUser?.displayName ?? null };
}
