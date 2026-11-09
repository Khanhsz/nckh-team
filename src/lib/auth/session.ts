import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import { mapProfile } from '../data/mappers';
import type { Profile } from '../types';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
}

/** Người dùng hiện tại — getClaims() xác thực chữ ký JWT, an toàn để phân quyền. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', claims.sub).maybeSingle();
  return {
    id: claims.sub,
    email: (typeof claims.email === 'string' ? claims.email : null) ?? profile?.email ?? '',
    profile: profile ? mapProfile(profile) : null
  };
});

export async function requireUser(opts: { allowNotOnboarded?: boolean } = {}): Promise<SessionUser & { profile: Profile }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.profile) redirect('/onboarding');
  if (!user.profile.onboarded && !opts.allowNotOnboarded) redirect('/onboarding');
  return user as SessionUser & { profile: Profile };
}
