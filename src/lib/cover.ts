import type { CSSProperties } from 'react';

/** Ảnh bìa dự án kiểu Notion: mẫu màu / chuyển màu / hoạ tiết, ảnh tải lên, hoặc link ảnh. */
export type CoverPreset = { key: string; label: string; group: 'Màu' | 'Chuyển màu' | 'Hoạ tiết'; style: CSSProperties };

const grid = (line: string, bg: string, size = 22): CSSProperties => ({
  backgroundColor: bg,
  backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
  backgroundSize: `${size}px ${size}px`
});

export const COVER_PRESETS: CoverPreset[] = [
  { key: 'sky', label: 'Xanh trời', group: 'Màu', style: { background: '#d3e3fd' } },
  { key: 'mint', label: 'Bạc hà', group: 'Màu', style: { background: '#c4eed0' } },
  { key: 'butter', label: 'Bơ', group: 'Màu', style: { background: '#ffe9b0' } },
  { key: 'lilac', label: 'Tử đinh hương', group: 'Màu', style: { background: '#e9ddff' } },
  { key: 'blush', label: 'Hồng phấn', group: 'Màu', style: { background: '#ffdad6' } },
  { key: 'stone', label: 'Đá', group: 'Màu', style: { background: '#dde3ea' } },

  { key: 'dawn', label: 'Bình minh', group: 'Chuyển màu', style: { background: 'linear-gradient(115deg, #d3e3fd 0%, #e9ddff 55%, #ffd8e4 100%)' } },
  { key: 'lagoon', label: 'Đầm phá', group: 'Chuyển màu', style: { background: 'linear-gradient(115deg, #c2e7ff 0%, #c4eed0 100%)' } },
  { key: 'harvest', label: 'Mùa gặt', group: 'Chuyển màu', style: { background: 'linear-gradient(115deg, #ffe9b0 0%, #ffcfa8 60%, #ffb4a5 100%)' } },
  { key: 'ocean', label: 'Biển sâu', group: 'Chuyển màu', style: { background: 'linear-gradient(120deg, #0b57d0 0%, #1a73e8 45%, #7c4dff 100%)' } },
  { key: 'forest', label: 'Rừng', group: 'Chuyển màu', style: { background: 'linear-gradient(120deg, #0d3b1e 0%, #188038 70%, #5bb974 100%)' } },
  { key: 'ink', label: 'Mực', group: 'Chuyển màu', style: { background: 'linear-gradient(120deg, #1f1f1f 0%, #3c4043 60%, #5f6368 100%)' } },

  { key: 'graph', label: 'Giấy kẻ ô', group: 'Hoạ tiết', style: grid('rgba(11,87,208,.14)', '#f8fafd') },
  { key: 'graph-dark', label: 'Bảng xanh', group: 'Hoạ tiết', style: grid('rgba(255,255,255,.14)', '#0b57d0', 26) },
  {
    key: 'dots',
    label: 'Lưới chấm',
    group: 'Hoạ tiết',
    style: { backgroundColor: '#eef2f8', backgroundImage: 'radial-gradient(rgba(68,71,70,.28) 1.2px, transparent 1.3px)', backgroundSize: '16px 16px' }
  },
  {
    key: 'contour',
    label: 'Đường đồng mức',
    group: 'Hoạ tiết',
    style: {
      backgroundColor: '#e6f4ea',
      backgroundImage:
        'repeating-radial-gradient(circle at 18% 120%, transparent 0 18px, rgba(24,128,56,.22) 18px 19px), repeating-radial-gradient(circle at 85% -30%, transparent 0 22px, rgba(24,128,56,.16) 22px 23px)'
    }
  },
  {
    key: 'lined',
    label: 'Giấy dòng kẻ',
    group: 'Hoạ tiết',
    style: {
      backgroundColor: '#fffdf6',
      backgroundImage: 'linear-gradient(90deg, transparent 63px, rgba(217,48,37,.35) 63px 64px, transparent 64px), linear-gradient(rgba(11,87,208,.16) 1px, transparent 1px)',
      backgroundSize: '100% 100%, 100% 24px'
    }
  }
];

export type ParsedCover =
  | { kind: 'preset'; preset: CoverPreset }
  | { kind: 'image'; path: string }
  | { kind: 'url'; url: string }
  | null;

export function parseCover(cover: string | null | undefined): ParsedCover {
  if (!cover) return null;
  if (cover.startsWith('c:')) {
    const preset = COVER_PRESETS.find((p) => p.key === cover.slice(2));
    return preset ? { kind: 'preset', preset } : null;
  }
  if (cover.startsWith('img:')) return { kind: 'image', path: cover.slice(4) };
  if (cover.startsWith('url:') && /^https:\/\//i.test(cover.slice(4))) return { kind: 'url', url: cover.slice(4) };
  return null;
}

/** URL ảnh để hiển thị (ảnh tải lên đi qua route có kiểm tra quyền) */
export function coverImageSrc(projectId: string, parsed: ParsedCover): string | null {
  if (!parsed) return null;
  if (parsed.kind === 'image') return `/api/projects/${projectId}/cover?v=${encodeURIComponent(parsed.path.split('/').pop() ?? '')}`;
  if (parsed.kind === 'url') return parsed.url;
  return null;
}
