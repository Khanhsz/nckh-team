'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dbErrorMessage } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth/session';
import type { FormState } from '@/lib/auth/actions';

export async function acceptInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSessionUser();
  const token = String(fd.get('token') ?? '');
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: 'Link mời không đúng định dạng.' };

  const supabase = await createClient();
  const { data: projectId, error } = await supabase.rpc('accept_project_invite', { p_token: token });
  if (error || !projectId) return { error: dbErrorMessage(error, 'Không nhận được lời mời.') };
  redirect(`/projects/${projectId}/gantt?joined=1`);
}
