import type { Paper, RelResult, RelSign, RelType } from '@/lib/types';

/** Gộp quan hệ của mọi bài thành bản đồ biến: nút = biến, cạnh = quan hệ X→Y với bằng chứng từ các bài */

export interface EdgeEvidence {
  paperId: string;
  label: string;
  year: number | null;
  result: RelResult;
  sign: RelSign;
  hypothesis: string | null;
  page: string | null;
}

export interface MapEdge {
  key: string;
  from: string;
  to: string;
  type: RelType;
  via: string | null;
  evidence: EdgeEvidence[];
  counts: Record<RelResult, number>;
  signs: Record<RelSign, number>;
  status: 'solid' | 'rejected' | 'mixed' | 'untested';
}

export interface MapNode {
  name: string;
  papers: number;
  degree: number;
}

export interface RelationMapData {
  nodes: MapNode[];
  edges: MapEdge[];
  analyzed: number;
  extracted: number;
}

const rawKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[“”"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

export function edgeStatus(c: Record<RelResult, number>): MapEdge['status'] {
  const tested = c.supported + c.not_supported + c.partial;
  if (tested === 0) return 'untested';
  const ratio = (c.supported + 0.5 * c.partial) / tested;
  return ratio >= 0.75 ? 'solid' : ratio <= 0.25 ? 'rejected' : 'mixed';
}

export function buildRelationMap(papers: Paper[], canonMap: Map<string, string>): RelationMapData {
  const canon = (n: string) => canonMap.get(rawKey(n)) ?? n.trim();
  const edges = new Map<string, MapEdge>();
  const nodePapers = new Map<string, Set<string>>();
  const touch = (name: string, pid: string) => {
    if (!nodePapers.has(name)) nodePapers.set(name, new Set());
    nodePapers.get(name)!.add(pid);
  };

  for (const p of papers) {
    for (const r of p.relations ?? []) {
      const from = canon(r.from);
      const to = canon(r.to);
      if (!from || !to || from === to) continue;
      const via = r.via ? canon(r.via) : null;
      const key = `${from}→${to}|${r.type}|${r.type === 'direct' ? '' : via ?? ''}`;
      let e = edges.get(key);
      if (!e) {
        e = {
          key,
          from,
          to,
          type: r.type,
          via: r.type === 'direct' ? null : via,
          evidence: [],
          counts: { supported: 0, not_supported: 0, partial: 0, not_tested: 0 },
          signs: { positive: 0, negative: 0, none: 0, unclear: 0 },
          status: 'untested'
        };
        edges.set(key, e);
      }
      // Một bài chỉ tính một lần cho mỗi cạnh (lấy kết quả "mạnh" nhất nếu bài lặp lại)
      if (e.evidence.some((x) => x.paperId === p.id)) continue;
      e.evidence.push({
        paperId: p.id,
        label: p.fileName.replace(/\.pdf$/i, ''),
        year: p.pub.year,
        result: r.result,
        sign: r.sign,
        hypothesis: r.hypothesis,
        page: r.page
      });
      e.counts[r.result]++;
      e.signs[r.sign]++;
      touch(from, p.id);
      touch(to, p.id);
      if (via) touch(via, p.id);
    }
  }

  const list = [...edges.values()].map((e) => ({ ...e, status: edgeStatus(e.counts) }));
  const degree = new Map<string, number>();
  for (const e of list) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const nodes = [...nodePapers.entries()]
    .map(([name, ps]) => ({ name, papers: ps.size, degree: degree.get(name) ?? 0 }))
    .sort((a, b) => b.papers - a.papers || b.degree - a.degree);
  list.sort((a, b) => b.evidence.length - a.evidence.length || a.from.localeCompare(b.from));

  return {
    nodes,
    edges: list,
    analyzed: papers.filter((p) => p.relations !== null).length,
    extracted: papers.filter((p) => Object.keys(p.fields).length > 0).length
  };
}
