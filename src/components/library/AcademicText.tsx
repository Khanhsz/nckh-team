import type { ReactNode } from 'react';
import { NOT_FOUND_TEXT } from '@/lib/ai/fields';

/** Hiển thị ô ma trận: tách dòng H1/[IV]/[Quốc gia]…, tô nhãn và số trang [Tr. X]. Không dùng hook → dùng được ở server & client. */

const LINE_SPLIT = /([^\n])\s+(?=(?:\bH\d+[a-z]?[:.]\s)|\[(?:IV|MED|MOD|DV|Control|Quốc gia|Ngành|Đối tượng|Thời điểm)\])/gi;
const TOKEN =
  /(\[(?:IV|MED|MOD|DV|Control|Quốc gia|Ngành|Đối tượng|Thời điểm|Supported|Rejected|Partial)\]|\[(?:Tr\.|p\.|pp\.)\s*[^\]]+\]|\bH\d+[a-z]?:|\((?:\+|-)\))/gi;

const TAG_STYLE: Record<string, string> = {
  IV: 'bg-zinc-900 text-white border-zinc-900',
  MED: 'bg-amber-50 text-amber-900 border-amber-300',
  MOD: 'bg-stone-200 text-stone-900 border-stone-400',
  DV: 'bg-emerald-800 text-white border-emerald-900',
  CONTROL: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  SUPPORTED: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-300',
  PARTIAL: 'bg-amber-50 text-amber-800 border-amber-300'
};

function renderTokens(line: string): ReactNode[] {
  return line.split(TOKEN).map((part, i) => {
    if (!part) return null;
    const tag = part.match(/^\[([^\]]+)\]$/)?.[1];
    if (tag && /^(Tr\.|p\.|pp\.)/i.test(tag)) {
      return (
        <span key={i} className="mx-0.5 whitespace-nowrap border border-zinc-300 bg-paper-2 px-1 font-mono text-[10px] text-zinc-600">
          {part}
        </span>
      );
    }
    if (tag) {
      const style = TAG_STYLE[tag.toUpperCase()] ?? 'bg-paper-2 text-zinc-700 border-zinc-300';
      return (
        <span key={i} className={`mr-1 inline-block border px-1 font-mono text-[10px] font-semibold ${style}`}>
          {tag}
        </span>
      );
    }
    if (/^H\d+[a-z]?:$/i.test(part)) {
      return (
        <span key={i} className="mr-1 inline-block border border-zinc-400 bg-paper-2 px-1 font-mono text-[10px] font-bold">
          {part.toUpperCase()}
        </span>
      );
    }
    if (part === '(+)' || part === '(-)') {
      return (
        <span key={i} className={`font-mono text-[11px] font-bold ${part === '(+)' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AcademicText({ text, className = '' }: { text?: string | null; className?: string }) {
  if (!text) return <span className="text-zinc-300">—</span>;
  if (text.trim() === NOT_FOUND_TEXT) return <span className="italic text-zinc-400">{NOT_FOUND_TEXT}</span>;
  const lines = text.replace(LINE_SPLIT, '$1\n').split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className={`space-y-1 leading-relaxed ${className}`}>
      {lines.map((l, i) => (
        <p key={i}>{renderTokens(l)}</p>
      ))}
    </div>
  );
}
