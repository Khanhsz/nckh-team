'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { attachLinkAction, type DocFormState } from '@/app/(app)/projects/[id]/writing/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';

const field = 'w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800';

export function AttachLinkForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<DocFormState, FormData>(attachLinkAction, {});
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.docId) {
      formRef.current?.reset();
      router.push(`?doc=${state.docId}`);
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="url" required placeholder="Dán link Google Docs hoặc link bất kỳ" className={`${field} font-mono text-xs`} />
      <input name="title" maxLength={300} placeholder="Tên hiển thị (tuỳ chọn)" className={field} />
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang gắn…">
        ＋ Gắn vào dự án
      </SubmitButton>
      <p className="text-[11px] text-zinc-500">Link Google Docs được xem trước ngay trong app; link khác (Overleaf, Notion, Word online…) mở ở tab mới.</p>
    </form>
  );
}
