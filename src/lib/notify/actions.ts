'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getSiteUrl } from '@/lib/site';
import { dbErrorMessage } from '@/lib/errors';

/** Tạo (hoặc đổi) link lịch ICS riêng — link cũ hết hiệu lực ngay */
export async function rotateCalendarTokenAction(): Promise<{ url?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rotate_calendar_token');
  if (error || !data) return { error: dbErrorMessage(error, 'Không tạo được link lịch.') };
  revalidatePath('/today');
  return { url: `${await getSiteUrl()}/api/calendar/${data}.ics` };
}

export async function setDigestAction(enabled: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('user_notify').upsert({ user_id: user.id, digest_email: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath('/today');
  return {};
}
