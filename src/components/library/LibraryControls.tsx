'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FormState } from '@/lib/auth/actions';
import { connectDriveFolderAction, extractPaperAction, syncDriveAction } from '@/app/(app)/projects/[id]/library/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';

export function ConnectFolderForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(connectDriveFolderAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <input
          name="folder"
          required
          placeholder="https://drive.google.com/drive/folders/…"
          className="min-w-72 flex-1 border border-line bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-zinc-800"
        />
        <SubmitButton pendingText="Đang kiểm tra…">Kết nối</SubmitButton>
      </div>
      <FormMessage error={state.error} message={state.ok ? state.message : undefined} />
    </form>
  );
}

export function SyncButton({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; text?: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await syncDriveAction(projectId);
            setMsg(
              r.error
                ? { error: r.error }
                : { text: `Thư mục có ${r.total} PDF · thêm mới ${r.added} · đã đổi ${r.changed}` }
            );
          })
        }
        className="border border-zinc-900 bg-white px-3 py-1.5 text-sm font-medium hover:bg-paper-2 disabled:opacity-60"
      >
        {pending ? 'Đang đồng bộ…' : '⟳ Đồng bộ ngay'}
      </button>
      {msg?.error && <span className="text-xs text-rose-700">{msg.error}</span>}
      {msg?.text && <span className="text-xs text-emerald-800">{msg.text}</span>}
    </div>
  );
}

/** Trích xuất lần lượt từng bài (tránh vượt hạn mức Gemini), có tiến độ và nút dừng. */
export function ExtractQueue({ paperIds, label }: { paperIds: string[]; label: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [stopRequested, setStopRequested] = useState(false);
  const stopRef = useRef(false);
  if (paperIds.length === 0 && !running) return null;

  const run = async () => {
    setRunning(true);
    setDone(0);
    setErrors([]);
    setStopRequested(false);
    stopRef.current = false;
    for (let i = 0; i < paperIds.length; i++) {
      if (stopRef.current) break;
      const r = await extractPaperAction(paperIds[i]);
      setDone(i + 1);
      router.refresh();
      if (r.error) setErrors((e) => [...e, r.error!]);
      if (r.stop) break;
      if (i < paperIds.length - 1) await new Promise((res) => setTimeout(res, 4000)); // giãn cách cho hạn mức miễn phí
    }
    stopRef.current = false;
    setRunning(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!running ? (
        <button onClick={run} className="bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
          ✦ {label} ({paperIds.length})
        </button>
      ) : (
        <>
          <span className="text-sm">
            Đang trích xuất {done}/{paperIds.length}…
          </span>
          <button
            disabled={stopRequested}
            onClick={() => {
              stopRef.current = true;
              setStopRequested(true);
            }}
            className="text-xs text-zinc-600 underline"
          >
            {stopRequested ? 'Sẽ dừng sau bài hiện tại' : 'Dừng'}
          </button>
        </>
      )}
      {errors.length > 0 && <span className="text-xs text-rose-700">{errors[errors.length - 1]}</span>}
    </div>
  );
}

/** Làm mới dữ liệu định kỳ khi tab đang mở (bài mới do bộ đồng bộ 5 phút đưa vào sẽ hiện ra). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
