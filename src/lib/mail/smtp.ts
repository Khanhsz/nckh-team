import 'server-only';
import { connect, type TLSSocket } from 'node:tls';

/**
 * Gửi email qua SMTP (TLS cổng 465) — không cần thư viện ngoài.
 * Cấu hình trên Vercel (đánh dấu Sensitive):
 *   SMTP_USER  (vd. nhom.nckh@gmail.com)   SMTP_PASS (Gmail: "App password" 16 ký tự)
 *   SMTP_HOST  (mặc định smtp.gmail.com)   SMTP_PORT (mặc định 465)   SMTP_FROM (tuỳ chọn, tên hiển thị)
 */

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');

class SmtpSession {
  private buf = '';
  private waiters: ((line: string) => void)[] = [];
  constructor(private sock: TLSSocket) {
    sock.setEncoding('utf8');
    sock.on('data', (d: string) => {
      this.buf += d;
      // Một phản hồi hoàn chỉnh: dòng cuối có dạng "250 ..." (không phải "250-...")
      let m: RegExpMatchArray | null;
      while ((m = this.buf.match(/^(?:\d{3}-.*\r\n)*\d{3} .*\r\n/))) {
        this.buf = this.buf.slice(m[0].length);
        this.waiters.shift()?.(m[0]);
      }
    });
  }
  read(): Promise<string> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async cmd(line: string | null, expect: number): Promise<string> {
    const p = this.read();
    if (line !== null) this.sock.write(line + '\r\n');
    const res = await p;
    if (!res.startsWith(String(expect))) throw new Error(`SMTP ${expect} expected, got: ${res.slice(0, 120).trim()}`);
    return res;
  }
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Lời mời lịch (iCalendar). Gmail/Outlook hiện thẻ sự kiện kèm nút thêm vào lịch. */
  calendar?: { method: 'REQUEST' | 'CANCEL'; ics: string };
}

/** Gửi nhiều email trong một phiên SMTP. Trả về số email gửi được và lỗi (nếu có). */
export async function sendMails(mails: Mail[]): Promise<{ sent: number; errors: string[] }> {
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const fromName = process.env.SMTP_FROM || 'NCKH Team';
  const errors: string[] = [];
  let sent = 0;

  const sock = connect({ host, port, servername: host });
  sock.setTimeout(30000, () => sock.destroy(new Error('SMTP timeout')));
  const s = new SmtpSession(sock);
  try {
    await new Promise<void>((resolve, reject) => {
      sock.once('secureConnect', () => resolve());
      sock.once('error', reject);
    });
    await s.cmd(null, 220);
    await s.cmd('EHLO nckh-team.vercel.app', 250);
    await s.cmd('AUTH LOGIN', 334);
    await s.cmd(b64(user), 334);
    await s.cmd(b64(pass), 235);

    for (const m of mails) {
      try {
        const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
        const alt = `a${boundary}`;
        const head = [
          `From: ${encHeader(fromName)} <${user}>`,
          `To: <${m.to}>`,
          `Subject: ${encHeader(m.subject)}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${boundary}@nckh-team.vercel.app>`,
          'MIME-Version: 1.0'
        ];
        const altParts = [
          `--${alt}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          wrap76(b64(m.text)),
          `--${alt}`,
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          wrap76(b64(m.html))
        ];
        const msg = m.calendar
          ? [
              ...head,
              `Content-Type: multipart/mixed; boundary="${boundary}"`,
              '',
              `--${boundary}`,
              `Content-Type: multipart/alternative; boundary="${alt}"`,
              '',
              ...altParts,
              `--${alt}`,
              `Content-Type: text/calendar; charset=UTF-8; method=${m.calendar.method}`,
              'Content-Transfer-Encoding: base64',
              '',
              wrap76(b64(m.calendar.ics)),
              `--${alt}--`,
              `--${boundary}`,
              `Content-Type: application/ics; name="invite.ics"`,
              'Content-Disposition: attachment; filename="invite.ics"',
              'Content-Transfer-Encoding: base64',
              '',
              wrap76(b64(m.calendar.ics)),
              `--${boundary}--`,
              ''
            ].join('\r\n')
          : [...head, `Content-Type: multipart/alternative; boundary="${alt}"`, '', ...altParts, `--${alt}--`, ''].join('\r\n');
        await s.cmd(`MAIL FROM:<${user}>`, 250);
        await s.cmd(`RCPT TO:<${m.to}>`, 250);
        await s.cmd('DATA', 354);
        await s.cmd(`${msg}\r\n.`, 250);
        sent++;
      } catch (e) {
        errors.push(`${m.to}: ${e instanceof Error ? e.message : 'lỗi'}`);
        await s.cmd('RSET', 250).catch(() => undefined);
      }
    }
    await s.cmd('QUIT', 221).catch(() => undefined);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'SMTP lỗi');
  } finally {
    sock.end();
  }
  return { sent, errors };
}
