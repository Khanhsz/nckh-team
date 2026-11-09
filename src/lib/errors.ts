/** Chuyển lỗi Supabase/Postgres thành thông báo tiếng Việt dễ hiểu. */

const DB_MESSAGES: [RegExp, string][] = [
  [/Invitation is invalid, expired or already used/i, 'Link mời không hợp lệ, đã hết hạn hoặc đã được dùng. Hãy xin trưởng nhóm link mới.'],
  [/Authentication or valid invitation token required/i, 'Link mời không đúng định dạng.'],
  [/Only the project owner can create an invite/i, 'Chỉ trưởng nhóm mới tạo được link mời.'],
  [/Only owner can (manage roles|remove members)/i, 'Chỉ trưởng nhóm mới quản lý được thành viên.'],
  [/owner (role is immutable|cannot be removed)/i, 'Không thể đổi vai trò hoặc xoá trưởng nhóm.'],
  [/row-level security|permission denied/i, 'Bạn không có quyền thực hiện thao tác này.']
];

export function dbErrorMessage(err: { message?: string; code?: string } | null | undefined, fallback = 'Có lỗi xảy ra, vui lòng thử lại.'): string {
  if (!err) return fallback;
  const msg = err.message ?? '';
  for (const [re, vi] of DB_MESSAGES) if (re.test(msg)) return vi;
  if (err.code === '42501') return 'Bạn không có quyền thực hiện thao tác này.';
  if (err.code === '23514') return 'Dữ liệu không hợp lệ — kiểm tra độ dài và ngày tháng.';
  // Lỗi do trigger của app ném ra (đã viết bằng tiếng Việt)
  if (err.code === 'P0001' && msg) return msg;
  return fallback;
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Email chưa được xác nhận. Hãy mở email kích hoạt tài khoản (kiểm tra cả mục Spam).',
  user_already_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng “Quên mật khẩu”.',
  email_exists: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng “Quên mật khẩu”.',
  weak_password: 'Mật khẩu quá yếu — dùng ít nhất 8 ký tự, có cả chữ và số.',
  email_address_invalid: 'Địa chỉ email không hợp lệ.',
  email_address_not_authorized:
    'Hệ thống chưa gửi được email tới địa chỉ này (máy chủ email mặc định của Supabase đang bị giới hạn). Hãy báo quản trị viên.',
  over_email_send_rate_limit: 'Hệ thống vừa gửi quá nhiều email. Vui lòng thử lại sau ít phút.',
  over_request_rate_limit: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  same_password: 'Mật khẩu mới phải khác mật khẩu cũ.',
  signup_disabled: 'Hiện chưa mở đăng ký tài khoản mới.'
};

export function authErrorMessage(err: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!err) return 'Có lỗi xảy ra, vui lòng thử lại.';
  if (err.code && AUTH_MESSAGES[err.code]) return AUTH_MESSAGES[err.code];
  const m = err.message ?? '';
  if (/invalid login credentials/i.test(m)) return AUTH_MESSAGES.invalid_credentials;
  if (/email not confirmed/i.test(m)) return AUTH_MESSAGES.email_not_confirmed;
  if (/already registered/i.test(m)) return AUTH_MESSAGES.user_already_exists;
  if (/rate limit/i.test(m)) return AUTH_MESSAGES.over_email_send_rate_limit;
  if (/password/i.test(m) && /(weak|at least|characters)/i.test(m)) return AUTH_MESSAGES.weak_password;
  return 'Có lỗi xảy ra, vui lòng thử lại.';
}
