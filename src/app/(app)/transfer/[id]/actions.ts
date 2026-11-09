'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { listMembers } from '@/lib/data/queries';
import { getSiteUrl } from '@/lib/site';
import { sendMails, smtpConfigured } from '@/lib/mail/smtp';
import { transferResultMail } from '@/lib/mail/templates';

export async function respondTransferAction(transferId: string, accept: boolean): Promise<{ error?: string; status?: string; projectId?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: t } = await supabase.from('ownership_transfers').select('project_id, from_user').eq('id', transferId).maybeSingle();
  const { data: status, error } = await supabase.rpc('respond_ownership_transfer', { p_id: transferId, p_accept: accept });
  if (error) return { error: dbErrorMessage(error, 'Không xử lý được lời mời.') };

  if (t && smtpConfigured() && (status === 'accepted' || status === 'declined')) {
    const members = await listMembers(t.project_id).catch(() => []);
    const from = members.find((m) => m.userId === t.from_user);
    const { data: p } = await supabase.from('projects').select('name').eq('id', t.project_id).maybeSingle();
    if (from?.email) {
      await sendMails([
        transferResultMail({
          to: from.email,
          toName: from.displayName,
          byName: user.profile.displayName,
          project: p?.name ?? 'dự án',
          accepted: status === 'accepted',
          link: `${await getSiteUrl()}/projects/${t.project_id}/settings`
        })
      ]).catch(() => undefined);
    }
  }
  revalidatePath('/', 'layout');
  return { status: status ?? undefined, projectId: t?.project_id };
}
