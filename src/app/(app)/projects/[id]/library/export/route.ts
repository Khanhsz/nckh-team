import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getProjectForUser, listPaperCredibility, listPapers } from '@/lib/data/queries';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { filterPapers } from '@/lib/library/filter';
import { crossrefByDoi } from '@/lib/scholar/publication';
import { apa, apaSortKey, bibtex, bibtexKey, ris, type CiteInput } from '@/lib/scholar/cite';
import type { Paper } from '@/lib/types';

/**
 * Xuất danh mục tài liệu tham khảo của các bài đang lọc:
 *   ?format=apa|apa-html|bibtex|ris  &rel=…&q=…  (cùng bộ lọc với trang Thư viện)  &ids=a,b (tuỳ chọn)  &inline=1
 * Bài có DOI nhưng chưa có tác giả/tập/trang sẽ được bổ sung từ Crossref (và lưu lại).
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const FORMATS = {
  apa: { ext: 'txt', mime: 'text/plain; charset=utf-8' },
  'apa-html': { ext: 'html', mime: 'text/html; charset=utf-8' },
  bibtex: { ext: 'bib', mime: 'application/x-bibtex; charset=utf-8' },
  ris: { ext: 'ris', mime: 'application/x-research-info-systems; charset=utf-8' }
} as const;

async function backfill(papers: Paper[], canWrite: boolean) {
  const need = papers.filter((p) => p.pub.doi && !p.pub.csl).slice(0, 80);
  if (need.length === 0) return;
  const supabase = canWrite ? await createClient() : null;
  let i = 0;
  const worker = async () => {
    while (i < need.length) {
      const p = need[i++];
      const w = await crossrefByDoi(p.pub.doi!);
      if (!w?.csl) continue;
      p.pub.csl = w.csl;
      if (supabase) await supabase.from('papers').update({ csl: w.csl as unknown as Json }).eq('id', p.id);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  const { id } = await params;
  const project = await getProjectForUser(id, user.id);
  if (!project) return NextResponse.json({ error: 'Không tìm thấy dự án.' }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  const format = (sp.get('format') ?? 'apa') as keyof typeof FORMATS;
  if (!(format in FORMATS)) return NextResponse.json({ error: 'Định dạng không hỗ trợ.' }, { status: 400 });

  const [papers, credMap] = await Promise.all([listPapers(id), listPaperCredibility(id)]);
  const ids = sp.get('ids')?.split(',').filter(Boolean);
  const chosen = ids?.length
    ? papers.filter((p) => ids.includes(p.id))
    : filterPapers(papers, credMap, { rel: sp.get('rel') ?? '', q: sp.get('q') ?? '' });

  await backfill(chosen, project.role !== 'viewer');

  const inputs: CiteInput[] = chosen.map((p) => ({
    csl: p.pub.csl,
    fallback: {
      title: p.fileName.replace(/\.pdf$/i, ''),
      journal: p.pub.journal,
      year: p.pub.year,
      doi: p.pub.doi,
      publisher: p.pub.publisher
    }
  }));
  inputs.sort((a, b) => apaSortKey(a).localeCompare(apaSortKey(b), 'vi'));

  let body: string;
  if (format === 'apa') {
    body = inputs.map((x) => apa(x).text).join('\n\n');
  } else if (format === 'apa-html') {
    body = `<!doctype html><meta charset="utf-8"><title>Tài liệu tham khảo</title><body style="font-family:'Times New Roman',serif;font-size:12pt;line-height:2">${inputs
      .map((x) => `<p style="padding-left:0.5in;text-indent:-0.5in;margin:0">${apa(x).html}</p>`)
      .join('')}</body>`;
  } else if (format === 'bibtex') {
    const used = new Set<string>();
    body = inputs.map((x) => bibtex(x, bibtexKey(x, used))).join('\n\n');
  } else {
    body = inputs.map(ris).join('\r\n\r\n');
  }

  const incomplete = inputs.filter((x) => !apa(x).complete).length;
  const f = FORMATS[format];
  const headers: Record<string, string> = {
    'content-type': f.mime,
    'cache-control': 'no-store',
    'x-papers': String(inputs.length),
    'x-incomplete': String(incomplete)
  };
  if (!sp.get('inline')) {
    const name = `tai-lieu-tham-khao-${(project.code ?? 'nckh').replace(/[^\w-]+/g, '')}.${f.ext}`;
    headers['content-disposition'] = `attachment; filename="${name}"`;
  }
  return new NextResponse(body, { headers });
}
