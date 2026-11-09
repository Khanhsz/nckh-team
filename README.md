# NCKH Team

Web app cho nhóm nghiên cứu: **Masterplan (Gantt)** · **Phân công & theo dõi công việc** · **Thư viện bài đọc**.
Next.js 15 (App Router) + Supabase (Auth, Postgres với RLS, Storage).

## Chạy trên máy

```bash
cp .env.example .env.local   # đã điền sẵn URL + publishable key của project Supabase
npm install
npm run dev
```

## Kiến trúc

- **Đăng ký / đăng nhập**: email + mật khẩu qua Supabase Auth (`src/lib/auth`). Ai cũng đăng ký được.
- **Onboarding**: điền hồ sơ → tạo dự án đầu tiên (có kế hoạch mẫu) hoặc mở link mời.
- **Vai trò theo dự án**: `owner` (trưởng nhóm) / `editor` (thành viên) / `viewer` (GVHD).
- **Phân quyền thực thi trong database** (RLS + trigger): thành viên chỉ sửa việc của mình, chỉ trưởng nhóm
  xác nhận "Hoàn thành", người ngoài dự án không đọc được gì. `src/lib/data/permissions.ts` chỉ để ẩn/hiện nút.
- **Mời thành viên**: trưởng nhóm tạo link 1 lần dùng, hết hạn 7 ngày (`create_project_invite` / `accept_project_invite`).

## Cấu hình Supabase cần làm trên Dashboard

1. **Authentication → URL Configuration**: Site URL = domain Vercel; thêm `https://<domain>/**` vào Redirect URLs.
2. **Email xác nhận**: máy chủ email mặc định chỉ gửi tới thành viên tổ chức Supabase. Hoặc cấu hình
   **Custom SMTP** (Resend, Brevo…), hoặc tạm tắt **Confirm email** khi demo (bật lại trước khi dùng thật).

## Bảo mật

- Chỉ dùng publishable key ở client. Không bao giờ đặt secret/service_role key vào biến `NEXT_PUBLIC_*`.
- Commit `package-lock.json` sau lần `npm install` đầu tiên để cố định phiên bản thư viện.
