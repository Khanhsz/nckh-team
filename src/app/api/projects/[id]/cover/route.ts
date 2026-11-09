import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX = 5 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/;

/** Trả ảnh bìa đã tải lên (thành viên dự án mới xem được — RLS của bucket covers) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: project } = await supabase.from('projects').select('cover').eq('id', id).maybeSingle();
  const path = project?.cover?.startsWith('img:') ? project.cover.slice(4) : null;
  if (!path) return new NextResponse(null, { status: 404 });
  const { data, error } = await supabase.storage.from('covers').download(path);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(data, {
    headers: { 'Content-Type': data.type || 'image/jpeg', 'Cache-Control': 'private, max-age=604800, immutable' }
  });
}

/** Tải ảnh bìa mới lên (chỉ trưởng nhóm) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Dự án không hợp lệ.' }, { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Chưa chọn ảnh.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Ảnh tối đa 5 MB.' }, { status: 400 });

  const { data: cur } = await supabase.from('projects').select('cover').eq('id', id).maybeSingle();
  const path = `${id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const up = await supabase.storage.from('covers').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: 'Chỉ trưởng nhóm được đổi ảnh bìa.' }, { status: 403 });

  const { data, error } = await supabase.from('projects').update({ cover: `img:${path}`, cover_y: 50 }).eq('id', id).select('id');
  if (error || !data?.length) {
    await supabase.storage.from('covers').remove([path]);
    return NextResponse.json({ error: 'Chỉ trưởng nhóm được đổi ảnh bìa.' }, { status: 403 });
  }
  if (cur?.cover?.startsWith('img:')) await supabase.storage.from('covers').remove([cur.cover.slice(4)]);
  return NextResponse.json({ ok: true, cover: `img:${path}` });
}
