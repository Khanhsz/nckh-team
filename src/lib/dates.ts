/** Tiện ích ngày tháng — mọi ngày dạng 'YYYY-MM-DD', tính theo giờ Việt Nam. */

const TZ = 'Asia/Ho_Chi_Minh';

export function todayISO(): string {
  // en-CA cho định dạng YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * 86_400_000);
}

/** Số ngày từ a đến b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

/** 0 = Chủ nhật … 6 = Thứ bảy */
export function weekday(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export function formatShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function formatFull(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function minDate(...dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}

export function maxDate(...dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b));
}

/** Nhãn hạn chót tương đối: "Hôm nay", "Còn 3 ngày", "Quá hạn 2 ngày". */
export function dueLabel(dueDate: string, today = todayISO()): string {
  const d = diffDays(today, dueDate);
  if (d === 0) return 'Hạn hôm nay';
  if (d === 1) return 'Hạn ngày mai';
  if (d > 0) return `Còn ${d} ngày`;
  return `Quá hạn ${-d} ngày`;
}
