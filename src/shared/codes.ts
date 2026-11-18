// 東証の銘柄コード: 4桁。2024年以降は2桁目・4桁目に英字が入る（例: 285A, 130A）。
export const CODE_RE = /^[1-9][0-9A-Z][0-9][0-9A-Z]$/;

export function isStockCode(s: string): boolean {
  return CODE_RE.test(s);
}

// 単位が続く数字は銘柄コードではない（4497円、2026年、300万 など）
const UNIT_AFTER = /^[円株%％年月日千百万億兆倍人件時分秒回本個枚位社名歳度台期号行頁ドル]/;
// 直前・直後にこれらが付く数字も除外（4,497 / 2026/11 / +94 / 12.3 など）
const GLUE = /[0-9A-Za-z.,，．/:＋+\-−¥$＄#＃]/;

/**
 * メモ本文から銘柄コードらしき4文字を抽出する。
 * 価格・年号・数量の誤検出を避けるため、前後の文字で判定する。
 */
export function extractCodes(text: string): string[] {
  const found: string[] = [];
  const src = toHalfWidth(text);
  const re = /[1-9][0-9A-Z][0-9][0-9A-Z]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index;
    const end = start + 4;
    const before = src[start - 1] ?? '';
    const after = src[end] ?? '';
    if (before && GLUE.test(before)) continue;
    if (after && GLUE.test(after)) {
      // 5333.T のような表記だけは許可
      if (!(after === '.' && src[end + 1] === 'T')) continue;
    }
    if (UNIT_AFTER.test(src.slice(end))) continue;
    const code = m[0];
    // 英字を含まない19xx/20xxは年号の可能性が高いので、括弧で囲まれている時だけ採用
    if (/^(19|20)\d\d$/.test(code) && !(/[（(【\[「]/.test(before) && /[）)】\]」]/.test(after))) continue;
    if (!found.includes(code)) found.push(code);
  }
  return found;
}

export function toHalfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
