'use server';

import { requireUser } from '@/lib/auth/session';
import { getProjectForUser, listPaperCredibility, listPapers } from '@/lib/data/queries';
import { askLibrary, type AskResult, type AskTurn } from '@/lib/ai/ask';
import { ExtractError } from '@/lib/ai/extract';

export async function askLibraryAction(projectId: string, question: string, history: AskTurn[]): Promise<AskResult | { error: string }> {
  const user = await requireUser();
  const project = await getProjectForUser(projectId, user.id);
  if (!project) return { error: 'Không tìm thấy dự án.' };
  const q = question.trim().slice(0, 1000);
  if (q.length < 3) return { error: 'Câu hỏi quá ngắn.' };
  const [papers, credMap] = await Promise.all([listPapers(projectId), listPaperCredibility(projectId)]);
  try {
    return await askLibrary({
      question: q,
      papers,
      credMap,
      history: (Array.isArray(history) ? history : []).slice(-3).map((h) => ({ q: String(h.q).slice(0, 1000), a: String(h.a).slice(0, 3000) })),
      projectTopic: [project.name, project.description].filter(Boolean).join(' — ')
    });
  } catch (e) {
    return { error: e instanceof ExtractError ? e.message : 'Không trả lời được lúc này. Thử lại sau.' };
  }
}
