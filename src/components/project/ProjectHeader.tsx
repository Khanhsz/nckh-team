'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as RPE } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { COVER_PRESETS, coverImageSrc, parseCover, type CoverPreset } from '@/lib/cover';
import { formatFull } from '@/lib/dates';
import { setProjectCoverAction, updateProjectFieldsAction } from '@/app/(app)/projects/[id]/settings/actions';

type Props = {
  project: { id: string; name: string; code: string | null; description: string; startDate: string; endDate: string; cover: string | null; coverY: number };
  canEdit: boolean;
  ownerName: string;
  memberCount: number;
  roleLabel: string;
};

const COVER_HEIGHT = 'clamp(120px, 22vh, 200px)';

/** Đầu trang dự án kiểu Notion: ảnh bìa đổi được, tên và mô tả sửa ngay tại chỗ (trưởng nhóm). */
export function ProjectHeader({ project, canEdit, ownerName, memberCount, roleLabel }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Ảnh bìa hiển thị ngay khi chọn (lạc quan), rồi đồng bộ khi server trả về
  const [cover, setCover] = useState(project.cover);
  const [coverY, setCoverY] = useState(project.coverY);
  useEffect(() => setCover(project.cover), [project.cover]);
  useEffect(() => setCoverY(project.coverY), [project.coverY]);
  const parsed = parseCover(cover);
  const imgSrc = coverImageSrc(project.id, parsed);

  const [picker, setPicker] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [reposition, setReposition] = useState<{ y0: number; startY: number; dragging: boolean } | null>(null);

  const run = (fn: () => Promise<{ error?: string }>, onFail?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) {
        setError(r.error);
        onFail?.();
        return;
      }
      setSaved(true);
      router.refresh();
    });
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(t);
  }, [saved]);

  const chooseCover = (value: string | null) => {
    const prev = cover;
    setCover(value);
    setCoverY(50);
    setPicker(false);
    run(() => setProjectCoverAction(project.id, value), () => setCover(prev));
  };

  // ---- Chỉnh vị trí ảnh: kéo dọc ----
  const onCoverDown = (e: RPE<HTMLDivElement>) => {
    // Bấm vào nút (Lưu vị trí / Huỷ…) thì không bắt đầu kéo: nếu giữ con trỏ ở khung ảnh, cú bấm nút sẽ không tới được nút
    if (!reposition || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setReposition({ y0: e.clientY, startY: coverY, dragging: true });
  };
  const onCoverMove = (e: RPE<HTMLDivElement>) => {
    if (!reposition?.dragging) return;
    // Ảnh chạy theo con trỏ: đổi % theo phần ảnh bị cắt (cao hơn khung bao nhiêu)
    const box = e.currentTarget;
    const img = imgRef.current;
    const rendered = img && img.naturalWidth ? (box.clientWidth * img.naturalHeight) / img.naturalWidth : box.clientHeight * 2;
    const overflow = Math.max(1, rendered - box.clientHeight);
    setCoverY(Math.max(0, Math.min(100, reposition.startY - ((e.clientY - reposition.y0) / overflow) * 100)));
  };
  const onCoverUp = () => reposition && setReposition({ ...reposition, dragging: false });
  const saveReposition = () => {
    setReposition(null);
    run(() => setProjectCoverAction(project.id, cover, coverY));
  };
  const cancelReposition = () => {
    setCoverY(project.coverY);
    setReposition(null);
  };

  return (
    <div className="group/header">
      {parsed && (
        <div className="relative">
        <div
          className={`relative w-full overflow-hidden ${reposition ? 'cursor-ns-resize touch-none' : ''}`}
          style={{ height: COVER_HEIGHT, ...(parsed.kind === 'preset' ? parsed.preset.style : {}) }}
          onPointerDown={onCoverDown}
          onPointerMove={onCoverMove}
          onPointerUp={onCoverUp}
          onPointerCancel={onCoverUp}
        >
          {imgSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgRef} src={imgSrc} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: `50% ${coverY}%` }} />
          )}
          {reposition && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white">
              Kéo ảnh lên hoặc xuống để chỉnh vị trí
            </span>
          )}
          {canEdit && (
            <div
              className={`absolute bottom-3 right-4 flex overflow-hidden rounded-lg bg-white/90 text-xs text-ink-2 shadow-[0_1px_3px_rgba(60,64,67,.3)] backdrop-blur ${
                reposition || picker ? '' : 'opacity-0 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100'
              }`}
            >
              {reposition ? (
                <>
                  <button onClick={saveReposition} className="rounded-none px-3 py-1.5 font-medium text-primary hover:bg-paper-2">
                    Lưu vị trí
                  </button>
                  <button onClick={cancelReposition} className="rounded-none border-l border-line px-3 py-1.5 hover:bg-paper-2">
                    Huỷ
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setPicker((v) => !v)} className="rounded-none px-3 py-1.5 hover:bg-paper-2" aria-expanded={picker}>
                    Đổi ảnh bìa
                  </button>
                  {imgSrc && (
                    <button onClick={() => setReposition({ y0: 0, startY: coverY, dragging: false })} className="rounded-none border-l border-line px-3 py-1.5 hover:bg-paper-2">
                      Chỉnh vị trí
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
          {picker && <CoverPicker projectId={project.id} current={cover} onPick={chooseCover} onUploaded={(v) => (setCover(v), setCoverY(50), setPicker(false), router.refresh())} onClose={() => setPicker(false)} className="right-4 top-[calc(100%-8px)]" />}
        </div>
      )}

      <div className="relative px-5 pt-4">
        {!parsed && canEdit && (
          <div className="relative -mt-1 mb-1 h-7">
            <button
              onClick={() => setPicker((v) => !v)}
              aria-expanded={picker}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-3 hover:bg-paper-2 hover:text-ink-2 ${
                picker ? '' : 'opacity-0 transition-opacity group-hover/header:opacity-100 focus-visible:opacity-100'
              }`}
            >
              <Icon name="image" size={16} />
              Thêm ảnh bìa
            </button>
            {picker && <CoverPicker projectId={project.id} current={cover} onPick={chooseCover} onUploaded={(v) => (setCover(v), setCoverY(50), setPicker(false), router.refresh())} onClose={() => setPicker(false)} className="left-0 top-8" />}
          </div>
        )}

        <div className="flex min-w-0 items-baseline gap-2">
          {canEdit ? (
            <>
              <InlineInput
                value={project.code ?? ''}
                placeholder="Mã"
                ariaLabel="Mã dự án"
                maxLength={20}
                className="shrink-0 text-[26px] font-normal uppercase text-ink-3"
                autoWidth
                onSave={(v, revert) => run(() => updateProjectFieldsAction(project.id, { code: v }), revert)}
              />
              <InlineInput
                value={project.name}
                placeholder="Tên dự án"
                ariaLabel="Tên dự án"
                maxLength={160}
                className="min-w-0 flex-1 text-[26px] font-semibold tracking-[-0.01em] text-ink"
                onSave={(v, revert) => run(() => updateProjectFieldsAction(project.id, { name: v }), revert)}
              />
            </>
          ) : (
            <h1 className="min-w-0 truncate text-[26px] font-semibold leading-9 tracking-[-0.01em] text-ink">
              {project.code && <span className="mr-2 font-normal text-ink-3">{project.code}</span>}
              {project.name}
            </h1>
          )}
          <span aria-live="polite" className="shrink-0 text-xs text-ink-3">
            {busy ? 'Đang lưu…' : saved ? 'Đã lưu' : ''}
          </span>
        </div>

        {canEdit ? (
          <InlineInput
            multiline
            value={project.description}
            placeholder="Thêm mô tả: đề tài, câu hỏi nghiên cứu, ghi chú cho nhóm…"
            ariaLabel="Mô tả dự án"
            maxLength={2000}
            className="mt-0.5 w-full max-w-[80ch] text-sm leading-6 text-ink-2"
            onSave={(v, revert) => run(() => updateProjectFieldsAction(project.id, { description: v }), revert)}
          />
        ) : (
          project.description && <p className="mt-0.5 max-w-[80ch] whitespace-pre-line text-sm leading-6 text-ink-2">{project.description}</p>
        )}

        <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
          <div className="flex items-center">
            <dt className="sr-only">Thời gian</dt>
            <dd>
              {canEdit ? (
                <DateRange
                  startDate={project.startDate}
                  endDate={project.endDate}
                  onSave={(s, e) => run(() => updateProjectFieldsAction(project.id, { startDate: s, endDate: e }))}
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar" size={14} />
                  {formatFull(project.startDate)} – {formatFull(project.endDate)}
                </span>
              )}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Trưởng nhóm</dt>
            <dd className="text-ink-2">{ownerName}</dd>
          </div>
          <div className="flex gap-1">
            <dd className="text-ink-2">{memberCount}</dd>
            <dt>thành viên</dt>
          </div>
          <div className="flex gap-1">
            <dt>Bạn là</dt>
            <dd className="text-ink-2">{roleLabel}</dd>
          </div>
        </dl>
        {error && <p className="mt-1 text-xs text-[#d93025]">{error}</p>}
      </div>
    </div>
  );
}

/** Ô chữ trông như văn bản thường; bấm vào để sửa, Enter/rời ô để lưu, Esc để huỷ. */
function InlineInput({
  value,
  placeholder,
  ariaLabel,
  maxLength,
  className,
  multiline,
  autoWidth,
  onSave
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  maxLength: number;
  className: string;
  multiline?: boolean;
  autoWidth?: boolean;
  onSave: (v: string, revert: () => void) => void;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const skip = useRef(false);
  useEffect(() => setV(value), [value]);
  useLayoutEffect(() => {
    if (!multiline || !ref.current) return;
    ref.current.style.height = '0px';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [v, multiline]);

  const commit = () => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const next = v.trim();
    if (next === value.trim()) return setV(value);
    onSave(next, () => setV(value));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      skip.current = true;
      setV(value);
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  };
  const base = `rounded-md bg-transparent px-1 -mx-1 outline-none placeholder:text-ink-3/70 hover:bg-paper-2 focus:bg-paper-2 focus-visible:outline-none ${className}`;
  return multiline ? (
    <textarea
      ref={ref}
      rows={1}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className={`block resize-none overflow-hidden border-0 ${base}`}
    />
  ) : (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className={`h-10 border-0 ${base}`}
      style={autoWidth ? { width: `${Math.max(2.4, (v || placeholder).length * 0.72 + 0.6)}em` } : undefined}
    />
  );
}

function DateRange({ startDate, endDate, onSave }: { startDate: string; endDate: string; onSave: (s: string, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(startDate);
  const [e, setE] = useState(endDate);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setS(startDate);
    setE(endDate);
    const onDoc = (ev: MouseEvent) => ref.current && !ref.current.contains(ev.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, startDate, endDate]);
  const invalid = !s || !e || e < s;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-paper-2 hover:text-ink-2">
        <Icon name="calendar" size={14} />
        {formatFull(startDate)} – {formatFull(endDate)}
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-40 w-[300px] space-y-3 rounded-2xl border border-line bg-white p-4 text-ink shadow-[0_4px_12px_rgba(60,64,67,.2)]">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-3">
              Bắt đầu
              <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} className="mt-1 w-full border border-line px-2 py-1.5 text-sm text-ink outline-none focus:border-primary" />
            </label>
            <label className="text-xs text-ink-3">
              Kết thúc
              <input type="date" value={e} min={s} onChange={(ev) => setE(ev.target.value)} className="mt-1 w-full border border-line px-2 py-1.5 text-sm text-ink outline-none focus:border-primary" />
            </label>
          </div>
          {invalid && <p className="text-xs text-[#d93025]">Ngày kết thúc phải sau ngày bắt đầu.</p>}
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setOpen(false)} className="px-3 py-1 text-sm text-ink-2 hover:bg-paper-2">
              Huỷ
            </button>
            <button
              disabled={invalid}
              onClick={() => {
                setOpen(false);
                if (s !== startDate || e !== endDate) onSave(s, e);
              }}
              className="bg-primary px-4 py-1 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-40"
            >
              Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Bảng chọn ảnh bìa: mẫu có sẵn, tải ảnh lên, hoặc dán link ảnh */
function CoverPicker({
  projectId,
  current,
  onPick,
  onUploaded,
  onClose,
  className
}: {
  projectId: string;
  current: string | null;
  onPick: (v: string | null) => void;
  onUploaded: (v: string) => void;
  onClose: () => void;
  className: string;
}) {
  const [tab, setTab] = useState<'presets' | 'upload' | 'link'>('presets');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    // Đợi một nhịp để cú bấm mở bảng không đóng ngay
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc));
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const upload = async (file: File) => {
    setErr(null);
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setErr('Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.');
    setUploading(true);
    try {
      const blob = file.type === 'image/gif' ? file : await shrink(file);
      if (blob.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5 MB.');
      const fd = new FormData();
      fd.append('file', blob, file.name);
      const res = await fetch(`/api/projects/${projectId}/cover`, { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as { error?: string; cover?: string };
      if (!res.ok || !json.cover) throw new Error(json.error ?? 'Tải ảnh lên không thành công.');
      onUploaded(json.cover);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Tải ảnh lên không thành công.');
    } finally {
      setUploading(false);
    }
  };

  const groups = ['Màu', 'Chuyển màu', 'Hoạ tiết'] as const;
  const tabBtn = (k: typeof tab, label: string) => (
    <button
      onClick={() => (setTab(k), setErr(null))}
      aria-pressed={tab === k}
      className={`px-3 py-1 text-[13px] ${tab === k ? 'bg-primary-container font-medium text-on-primary-container' : 'text-ink-2 hover:bg-paper-2'}`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Chọn ảnh bìa"
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute z-50 w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-3 text-ink shadow-[0_4px_16px_rgba(60,64,67,.22)] ${className}`}
    >
      <div className="flex items-center gap-1">
        {tabBtn('presets', 'Mẫu có sẵn')}
        {tabBtn('upload', 'Tải ảnh lên')}
        {tabBtn('link', 'Dán link')}
        {current && (
          <button onClick={() => onPick(null)} className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[13px] text-ink-3 hover:bg-paper-2 hover:text-[#d93025]">
            <Icon name="trash" size={14} />
            Gỡ
          </button>
        )}
      </div>

      <div className="mt-3">
        {tab === 'presets' && (
          <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1 thin-scroll">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-xs text-ink-3">{g}</p>
                <div className="grid grid-cols-3 gap-2">
                  {COVER_PRESETS.filter((p) => p.group === g).map((p: CoverPreset) => (
                    <button
                      key={p.key}
                      onClick={() => onPick(`c:${p.key}`)}
                      title={p.label}
                      aria-label={p.label}
                      aria-pressed={current === `c:${p.key}`}
                      className={`h-14 rounded-lg border border-black/5 ${current === `c:${p.key}` ? 'ring-2 ring-primary ring-offset-2' : 'hover:opacity-85'}`}
                      style={p.style}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'upload' && (
          <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-3/50 text-sm text-ink-2 hover:bg-paper">
            <Icon name="upload" size={20} className="text-primary" />
            {uploading ? 'Đang tải lên…' : 'Chọn ảnh từ máy'}
            <span className="text-xs text-ink-3">Rộng ít nhất 1500px cho đẹp. Tối đa 5 MB.</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
          </label>
        )}

        {tab === 'link' && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const u = url.trim();
              if (!/^https:\/\/\S+$/i.test(u)) return setErr('Link cần bắt đầu bằng https://');
              onPick(`url:${u}`);
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (link trực tiếp tới ảnh)"
              className="w-full border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex justify-end">
              <button className="bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover">Dùng ảnh này</button>
            </div>
          </form>
        )}
        {err && <p className="mt-2 text-xs text-[#d93025]">{err}</p>}
      </div>
    </div>
  );
}

/** Thu ảnh về tối đa 2000px chiều ngang, JPEG ~85% — ảnh bìa không cần lớn hơn */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / bmp.width);
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    return out ?? file;
  } catch {
    return file;
  }
}
