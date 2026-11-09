'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { FormState } from '@/lib/auth/actions';
import { connectWritingFolderAction, createDocAction, linkDocAction, type DocFormState } from '@/app/(app)/projects/[id]/writing/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';

const field = 'w-full border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-800';

function useOpenDoc(state: DocFormState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.docId) router.push(`?doc=${state.docId}`);
  }, [state, router]);
}

export function CreateDocForm({ projectId, templates }: { projectId: string; templates: { id: string; label: string }[] }) {
  const [state, action] = useActionState<DocFormState, FormData>(createDocAction, {});
  useOpenDoc(state);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" required maxLength={200} placeholder="Tên working file, vd. Bản thảo v1 — Employer Branding" className={field} />
      <select name="template" defaultValue="paper" className={field}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            Khung: {t.label}
          </option>
        ))}
      </select>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang tạo trên Google Docs…">
        ＋ Tạo Google Doc
      </SubmitButton>
    </form>
  );
}

export function LinkDocForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<DocFormState, FormData>(linkDocAction, {});
  useOpenDoc(state);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="url" required placeholder="https://docs.google.com/document/d/…" className={`${field} font-mono text-xs`} />
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingText="Đang kiểm tra…">
        Gắn Doc có sẵn
      </SubmitButton>
    </form>
  );
}

export function WritingFolderForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(connectWritingFolderAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex gap-2">
        <input name="folder" required placeholder="Link thư mục trong Shared Drive" className={`${field} font-mono text-xs`} />
        <SubmitButton pendingText="…">Lưu</SubmitButton>
      </div>
      <FormMessage error={state.error} message={state.ok ? state.message : undefined} />
    </form>
  );
}
