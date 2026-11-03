// Parents' cell numbers: what someone types cleaned to one stored form (+1XXXXXXXXXX for US
// numbers), shown as (337) 555-0123, and dialed with a tel: link.

/** "+13375550123", or null if it can't be a phone number. US numbers need no +1. */
export function cleanPhone(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!plus && digits.length === 10) return `+1${digits}`;
  if (!plus && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (plus && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "(337) 555-0123" for US numbers; other countries as stored. */
export function formatPhone(phone: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** tel:+13375550123 */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
