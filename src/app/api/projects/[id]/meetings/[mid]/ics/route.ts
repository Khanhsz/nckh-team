import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { meetingIcs } from '@/lib/calendar/ics';

const UUID = /^[0-9a-f-]{36}$/;

/** Tải tệp .ics của một cuộc họp (thành viên dự án — RLS kiểm tra) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  if (!UUID.test(id) || !UUID.test(mid)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createClient();
  const { data: m } = await supabase.from('meetings').select('*').eq('id', mid).eq('project_id', id).maybeSingle();
  if (!m) return new NextResponse('Not found', { status: 404 });
  const ics = meetingIcs({
    id: m.id,
    sequence: m.sequence,
    title: m.title,
    startsAt: m.starts_at,
    endsAt: m.ends_at,
    location: m.location,
    meetUrl: m.meet_url,
    description: m.notes ?? '',
    organizerEmail: process.env.SMTP_USER || 'noreply@nckh-team.vercel.app',
    organizerName: 'NCKH Team',
    attendees: [],
    method: 'PUBLISH'
  });
  return new NextResponse(ics, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="hop-nhom.ics"', 'Cache-Control': 'no-store' }
  });
}
