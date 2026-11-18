// E2E用の模擬 J-Quants API V2。x-api-key を確かめ、ページングも本物と同じ形で返す。
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_JQUANTS_PORT || 8791);
const KEY = 'e2e-jquants-key';
const NAMES = { 5801: '古河電気工業', 5138: 'Ｒｅｂａｓｅ', 5333: '日本ガイシ', 6098: 'リクルートホールディングス', 7974: '任天堂' };
const stats = {};

const day = (d) => d.toISOString().slice(0, 10);
const parseDay = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);

/** コードごとに決まった値動き。最終日の調整前終値は 1,889.5 など扱いやすい値にする */
function bars(code, from, to) {
  const out = [];
  let seed = [...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let p = 1500 + (seed % 1000);
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w === 0 || w === 6) continue;
    const o = p;
    const c = Math.round(o * (1 + (rand() - 0.48) * 0.04) * 10) / 10;
    const h = Math.max(o, c) + 5, l = Math.min(o, c) - 5;
    p = c;
    out.push({ Date: day(d), Code: `${code}0`, O: o, H: h, L: l, C: c, UL: '0', LL: '0', Vo: 100000, Va: c * 100000, AdjFactor: 1, AdjO: o, AdjH: h, AdjL: l, AdjC: c, AdjVo: 100000 });
  }
  return out;
}

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/health') return json(200, { ok: true });
  if (url.pathname === '/__stats') return json(200, stats);
  if (url.pathname === '/__reset') { for (const k of Object.keys(stats)) delete stats[k]; return json(200, {}); }

  const q = url.searchParams;
  const code = (q.get('code') || '').slice(0, 4);
  stats[`${url.pathname}:${code}`] = (stats[`${url.pathname}:${code}`] || 0) + 1;
  if (req.headers['x-api-key'] !== KEY) return json(401, { message: 'invalid api key' });

  if (url.pathname === '/v2/equities/bars/daily') {
    if (code === '9999') return json(403, { message: 'plan' });
    const all = bars(code, parseDay(q.get('from')), parseDay(q.get('to')));
    // 60件ずつページングする
    const start = Number(q.get('pagination_key') || 0);
    const page = all.slice(start, start + 60);
    return json(200, start + 60 < all.length ? { data: page, pagination_key: String(start + 60) } : { data: page });
  }
  if (url.pathname === '/v2/equities/master') {
    if (code === '9999') return json(200, { data: [{ Code: '99990', CoName: '契約外の銘柄', MktNm: 'グロース', S33Nm: 'サービス業' }] });
    return json(200, { data: [{ Date: '2026-11-18', Code: `${code}0`, CoName: NAMES[code] || `テスト銘柄${code}`, MktNm: 'プライム', S33Nm: '非鉄金属' }] });
  }
  if (url.pathname === '/v2/equities/valuation') {
    return json(200, { data: [{ Date: q.get('date'), Code: `${code}0`, EPS: 168.2, FwdEPS: 167.1, BPS: 646.9, ROE: 0.2931, FwdROE: 0.28, PER: 11.23, FwdPER: 11.3, PBR: 2.92, MktCap: 1330000 }] });
  }
  json(404, { message: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`mock J-Quants on ${PORT}`));
