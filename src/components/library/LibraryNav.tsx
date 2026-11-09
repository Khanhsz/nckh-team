import Link from 'next/link';

const TABS = [
  { key: 'table', href: '', label: '▦ Bảng bài đọc' },
  { key: 'ask', href: '/ask', label: '💬 Hỏi thư viện' },
  { key: 'map', href: '/map', label: '🕸 Bản đồ biến' },
  { key: 'missing', href: '/missing', label: '🧭 Bài nền tảng còn thiếu' }
] as const;

/** Chuyển giữa các chế độ của Thư viện bài đọc */
export function LibraryNav({ projectId, active }: { projectId: string; active: (typeof TABS)[number]['key'] }) {
  return (
    <nav className="flex w-fit border border-line bg-white text-xs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/projects/${projectId}/library${t.href}`}
          className={`px-3 py-1.5 ${active === t.key ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-600 hover:bg-paper-2'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
