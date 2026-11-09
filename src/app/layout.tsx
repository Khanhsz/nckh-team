import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'NCKH Team',
  description: 'Masterplan, phân công công việc và thư viện bài đọc cho nhóm nghiên cứu'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
