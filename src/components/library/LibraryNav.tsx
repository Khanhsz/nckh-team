import { Icon } from '@/components/ui/Icon';
import Link from 'next/link';

const TABS = [
  { key: 'table', href: '', label: 'Bảng bài đọc', icon: 'table' },
  { key: 'map', href: '/map', label: 'Bản đồ biến', icon: 'graph' },
  { key: 'missing', href: '/missing', label: 'Bài nền tảng còn thiếu', icon: 'compass' }
] as const;

/** Chuyển giữa các chế độ của Thư viện bài đọc */
export function LibraryNav({ projectId, active }: { projectId: string; active: (typeof TABS)[number]['key'] }) {
  return (
    <nav className="flex w-fit gap-1 text-[13px]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/projects/${projectId}/library${t.href}`}
          aria-current={active === t.key ? 'page' : undefined}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${active === t.key ? 'border-transparent bg-primary-container font-medium text-on-primary-container' : 'border-line text-ink-2 hover:bg-paper-2'}`}
        >
          <Icon name={t.icon} size={15} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
