'use server';

import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { dbErrorMessage } from '@/lib/errors';
import { addDays, diffDays, isValidISODate } from '@/lib/dates';
import { str } from '@/lib/site';
import type { FormState } from '@/lib/auth/actions';

/** Kế hoạch mẫu cho một đề tài định lượng — tỉ lệ theo tổng thời gian dự án. */
const TEMPLATE: { milestone: string; at: number; tasks: [string, number, number][] }[] = [
  {
    milestone: 'Tổng quan tài liệu',
    at: 0.15,
    tasks: [
      ['Xây dựng chiến lược tìm kiếm (Scopus, WoS)', 0, 0.05],
      ['Sàng lọc tài liệu theo PRISMA', 0.04, 0.1],
      ['Đọc toàn văn & lập ma trận tài liệu', 0.08, 0.15]
    ]
  },
  {
    milestone: 'Mô hình nghiên cứu & thang đo',
    at: 0.35,
    tasks: [
      ['Đề xuất mô hình & giả thuyết', 0.15, 0.24],
      ['Kế thừa & dịch thang đo (back-translation)', 0.23, 0.31],
      ['Khảo sát thử (pilot)', 0.31, 0.35]
    ]
  },
  { milestone: 'Thu thập dữ liệu', at: 0.6, tasks: [['Khảo sát chính thức', 0.36, 0.6]] },
  {
    milestone: 'Xử lý & phân tích dữ liệu',
    at: 0.8,
    tasks: [
      ['Làm sạch dữ liệu & CFA', 0.6, 0.7],
      ['Kiểm định mô hình cấu trúc (SEM)', 0.69, 0.8]
    ]
  },
  {
    milestone: 'Viết bài & nộp',
    at: 1,
    tasks: [
      ['Viết bản thảo', 0.79, 0.93],
      ['Hoàn thiện theo góp ý & nộp bài', 0.92, 1]
    ]
  }
];

export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(fd, 'name');
  const code = str(fd, 'code').toUpperCase();
  const description = str(fd, 'description');
  const startDate = str(fd, 'startDate');
  const endDate = str(fd, 'endDate');
  const useTemplate = fd.get('template') === 'on';

  if (name.length < 2 || name.length > 160) return { error: 'Tên dự án cần 2–160 ký tự.' };
  if (code.length > 20) return { error: 'Mã dự án tối đa 20 ký tự.' };
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) return { error: 'Ngày không hợp lệ.' };
  if (endDate < startDate) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
  if (diffDays(startDate, endDate) > 365 * 3) return { error: 'Thời gian dự án tối đa 3 năm.' };

  const supabase = await createClient();
  const projectId = randomUUID();
  // Không dùng .select() sau insert: quyền đọc được cấp bởi trigger thêm thành viên chạy sau insert
  const { error } = await supabase.from('projects').insert({
    id: projectId,
    name,
    code: code || null,
    research_topic: description.slice(0, 2000),
    owner_id: user.id,
    start_date: startDate,
    end_date: endDate
  });
  if (error) return { error: dbErrorMessage(error, 'Không tạo được dự án.') };

  if (useTemplate) {
    const total = Math.max(diffDays(startDate, endDate), 10);
    const at = (f: number) => addDays(startDate, Math.round(f * total));
    let prevTaskId: string | null = null;
    for (const [i, block] of TEMPLATE.entries()) {
      const milestoneId = randomUUID();
      const { error: mErr } = await supabase
        .from('milestones')
        .insert({ id: milestoneId, project_id: projectId, name: block.milestone, due_date: at(block.at), sort_order: i + 1 });
      if (mErr) break;
      for (const [title, s, e] of block.tasks) {
        const taskId = randomUUID();
        const start = at(s);
        const due = at(e) < start ? start : at(e);
        const { error: tErr } = await supabase.from('tasks').insert({
          id: taskId,
          project_id: projectId,
          milestone_id: milestoneId,
          title,
          start_date: start,
          due_date: due,
          depends_on: prevTaskId ? [prevTaskId] : []
        });
        if (!tErr) prevTaskId = taskId;
      }
    }
  }

  revalidatePath('/', 'layout');
  redirect(`/projects/${projectId}/gantt?created=1`);
}
