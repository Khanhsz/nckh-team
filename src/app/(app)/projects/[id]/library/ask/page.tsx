import { redirect } from 'next/navigation';

/** Đường dẫn cũ → tab "Hỏi thư viện" riêng của dự án */
export default async function OldAskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/ask`);
}
