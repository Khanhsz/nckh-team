'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/auth/actions';
import { FormMessage, SubmitButton } from '@/components/ui/FormBits';
import { inputCls, labelCls } from '@/components/auth/AuthShell';
import { createProjectAction } from './actions';

export function NewProjectForm({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const [state, action] = useActionState<FormState, FormData>(createProjectAction, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-3">
          <label className={labelCls} htmlFor="name">Tên đề tài / dự án *</label>
          <input id="name" name="name" required maxLength={160} className={inputCls} placeholder="vd. Employer Branding & hiệu suất làm việc của Gen Z" />
        </div>
        <div>
          <label className={labelCls} htmlFor="code">Mã ngắn</label>
          <input id="code" name="code" maxLength={20} className={`${inputCls} font-mono uppercase`} placeholder="LIT-01" />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="description">Mô tả ngắn</label>
        <textarea id="description" name="description" rows={2} maxLength={2000} className={inputCls} placeholder="Câu hỏi nghiên cứu, phạm vi, mục tiêu…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="startDate">Bắt đầu *</label>
          <input id="startDate" name="startDate" type="date" required defaultValue={defaultStart} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="endDate">Kết thúc dự kiến *</label>
          <input id="endDate" name="endDate" type="date" required defaultValue={defaultEnd} className={inputCls} />
        </div>
      </div>
      <label className="flex items-start gap-2 border border-line bg-paper p-3 text-sm">
        <input type="checkbox" name="template" defaultChecked className="mt-0.5 accent-zinc-900" />
        <span>
          <b>Dùng kế hoạch mẫu cho đề tài định lượng</b>
          <span className="block text-xs text-zinc-600">
            5 mốc (Tổng quan → Mô hình & thang đo → Thu thập dữ liệu → Phân tích → Viết bài) và 11 công việc, chia theo thời gian dự án. Bạn sửa hoặc xoá được sau.
          </span>
        </span>
      </label>
      <FormMessage error={state.error} />
      <SubmitButton pendingText="Đang tạo…">Tạo dự án</SubmitButton>
    </form>
  );
}
