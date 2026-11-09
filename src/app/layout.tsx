import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

// Be Vietnam Pro: thiết kế cho tiếng Việt — dấu rõ, cân đối ở cỡ chữ nhỏ
const appFont = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-app' });

export const metadata: Metadata = {
  title: 'NCKH Team',
  description: 'Masterplan, phân công công việc và thư viện bài đọc cho nhóm nghiên cứu'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${appFont.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
