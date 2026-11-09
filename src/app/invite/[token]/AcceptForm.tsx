'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/auth/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';
import { acceptInviteAction } from './actions';

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang tham gia…">
        Tham gia dự án
      </SubmitButton>
    </form>
  );
}
