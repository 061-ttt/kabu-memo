// 相場帖：話題株の備忘録（モバイルファースト）
// 未ログインでも端末に保存して動く。Googleでログインすると、端末間の同期・株価の自動取得（J-Quants）・AIが使える。
'use strict';

const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === '1';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 容量超過などは無視 */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
};
// 日付はすべて日本時間の YYYY-MM-DD
const JST = 9 * 3600e3;
const WD = '日月火水木金土';
const pad = (n) => String(n).padStart(2, '0');
const utc = (s) => new Date(`${s}T00:00:00Z`);
const todayISO = () => new Date(Date.now() + JST).toISOString().slice(0, 10);
const fmtJP = (s) => { const d = utc(s); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WD[d.getUTCDay()]})`; };
const fmtMD = (s) => { const d = utc(s); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const fmtSlash = (s) => s.replace(/-/g, '/');
const shiftBiz = (s, dir) => { const d = utc(s); do { d.setUTCDate(d.getUTCDate() + dir); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return d.toISOString().slice(0, 10); };
const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
const decOf = (v) => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(1, s.length - i - 1); };
const nf = (v, dec = 0) => isNum(v) ? Number(v).toLocaleString('ja-JP', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
const signed = (v, dec) => (v > 0 ? '+' : v < 0 ? '−' : '±') + nf(Math.abs(v), dec);
const dirOf = (v) => !isNum(v) || Number(v) === 0 ? 'flat' : Number(v) > 0 ? 'up' : 'dn';
const uid4 = () => Math.random().toString(36).slice(2, 6);
const CODE_RE = /^[1-9][0-9A-Z][0-9][0-9A-Z]$/;
const isCode = (c) => CODE_RE.test(String(c || ''));
const fmtYen = (v) => !isNum(v) ? '' : v >= 1e12 ? `${(v / 1e12).toFixed(2)}兆円` : v >= 1e8 ? `${nf(Math.round(v / 1e8))}億円` : `${nf(Math.round(v / 1e4))}万円`;
const fmtVol = (v) => !isNum(v) ? '' : v >= 1000 ? `${nf(Math.round(v / 1000))}千株` : `${nf(v)}株`;

const IC = {
  flame: '<svg class="ic flame" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.7 1c.4 2.2-.9 3.3-2 4.6C5.5 7 4.4 8.4 4.4 10.4a3.6 3.6 0 0 0 7.2 0c0-1.5-.7-2.6-1.4-3.4.1 1.1-.3 1.9-1 2.2.5-2.5-.1-6-.5-8.2z"/></svg>',
  skull: '<svg class="ic skull" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.4c-3.4 0-5.6 2.3-5.6 5.3 0 1.7.8 3.1 2 3.9v1.8c0 .5.4.9.9.9h.8v-1.3h1.1v1.3h1.6v-1.3h1.1v1.3h.8c.5 0 .9-.4.9-.9v-1.8c1.2-.8 2-2.2 2-3.9 0-3-2.2-5.3-5.6-5.3z"/><circle cx="5.8" cy="7.1" r="1.35" fill="var(--paper)"/><circle cx="10.2" cy="7.1" r="1.35" fill="var(--paper)"/><path d="M7.3 9.5h1.4L8 10.7z" fill="var(--paper)"/></svg>',
  mega: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 6.3v3.4h2.3l5.3 3.1V3.2L4.5 6.3zM11.6 5.4a3.4 3.4 0 0 1 0 5.2M4.8 9.9l.8 3.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  soundOn: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.2v3.6h2.4L8.4 13V3L4.9 6.2zM10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.9a5.8 5.8 0 0 1 0 8.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  soundOff: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6.2v3.6h2.4L8.4 13V3L4.9 6.2zM10.8 6.2l3.4 3.6M14.2 6.2l-3.4 3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 10.2A5.6 5.6 0 0 1 5.8 2.8a5.6 5.6 0 1 0 7.4 7.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  sun: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  more: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.2" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12.8" cy="8" r="1.4" fill="currentColor"/></svg>',
  search: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4l3.6 3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  ext: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true" style="width:.8em;height:.8em"><path d="M6 3h7v7M13 3L5 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spark: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5zM13 11l.6 1.6 1.6.6-1.6.6L13 15.4l-.6-1.6-1.6-.6 1.6-.6z" fill="currentColor"/></svg>',
  cam: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5.2h2.6L5.8 3.5h4.4l1.2 1.7H14v7.3H2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8.7" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  user: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.6" r="2.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
const markIcon = (m) => m === 'strong' ? IC.flame : m === 'weak' ? IC.skull : '';
const markText = (m) => m === 'strong' ? '強' : m === 'weak' ? '弱' : '印なし';

/* ================= sample data（2026/11/18 の録画に映っていた値） ================= */
const SEED_DATE = '2026-11-18';
const SEED = [
  ['6098', 'リクルート', 'weak', '主力株安', '3.35%安で日経平均の重荷', '※個別の悪材料は出ていない', '主力の値がさ株として売られ、日経平均を押し下げた。終値は3.35%安の17,585円。', '指数への寄与が大きい銘柄の下げは指数の売買に引っ張られることも多く、業績の悪化と結びつけるのは早い。', 17585, null, -3.35, {}],
  ['4519', '中外製薬', '', '医薬品株安', '1.83%安', '※業種全体の売り', '医薬品株がそろって軟調ななかで売られた。終値は1.83%安の7,206円。', '個社のニュースではなく業種単位の資金の動きとみられる。下げの理由がはっきりしないまま悲観しすぎない。', 7206, null, -1.83, {}],
  ['4578', '大塚HD', '', '医薬品株安', '2.16%安', '※業種全体の売り', '医薬品株の一角として売られた。終値は2.16%安の12,205円。', '同じ日に中外製薬も下げており、業種全体の動きと重なる。個別の悪材料は確認できていない。', 12205, null, -2.16, {}],
  ['7974', '任天堂', '', '目標株価上げ', 'SBIが目標株価11,800円へ上げ、一時2カ月半ぶり高値', '※1社の見方の変化', 'SBI証券が目標株価を11,800円に引き上げたと伝わり、一時2カ月半ぶりの高値をつけた。終値は0.85%高の9,002円。', '目標株価の引き上げは1社の見解で、会社の業績見通しが変わったわけではない。終値の上げ幅は1%に届いていない。', 9002, null, 0.85, {}],
  ['4911', '資生堂', '', '事業売却', '中国専用ブランド「オプレ」の子会社を売却', '※売却の条件は要確認', '中国専用ブランド「オプレ」を扱う子会社の売却が伝わった。終値は0.46%安の4,293円。', '売却額や利益への影響が分からないうちは、構造改革の進展と評価するのは早い。株価の反応も小さい。', 4293, null, -0.46, {}],
  ['3086', 'Jフロント', 'weak', 'アクティビスト', '3Dが16.49%保有で筆頭株主に、「過剰資本」と指摘し対話中', '※要求の中身はこれから', '投資ファンドの3Dが16.49%を保有する筆頭株主となり、過剰資本を指摘して会社と対話していると伝わった。終値は4.05%安の3,057円。', '物言う株主の登場は株主還元の拡大につながることもあるが、この日の株価は大きく下げた。会社側の対応はまだ見えない。', 3057, null, -4.05, {}],
  ['5333', 'NGK', '', '人事制度', '海外転勤に一時金300万円、2.13%高', '※業績材料ではない', '海外へ転勤する社員に一時金300万円を出すと伝わった。共働き世帯の増加や物価高に対応する。終値は2.13%高の4,497円。', '人事制度の話で業績への影響は小さい。上昇は半導体関連の買い戻しによる部分もありそうだ。', 4497, 94, 2.13, { perA: '13.3', perF: '12.7', pbr: '1.54', roe: '12.3', mcap: '1.27兆円', volume: '1,155千株' }],
  ['5801', '古河電', '', '特許訴訟', '半導体材料で韓国LG化学を提訴、1.04%高', '※請求額は示されず', '半導体材料の特許を侵害されたとして、韓国LG化学を提訴したと伝わった。終値は1.04%高の1,889.5円。', '訴訟の請求額や業績への影響は示されていない。結論が出るまで時間がかかり、すぐ利益につながる材料ではない。', 1889.5, 19.5, 1.04, { perA: '11.2', perF: '11.3', pbr: '2.92', roe: '29.3', mcap: '1.33兆円', volume: '32,161千株' }],
  ['5138', 'Rebase', 'strong', '上方修正', '営業利益予想86%増への修正から3日連続ストップ高', '※過熱感が強い', '16日に27年3月期の営業利益予想を86%増へ上方修正してから連日のストップ高。この日もストップ高の673円（+17.5%）で、7,600株の買い注文を残した。', '3日連続のストップ高で過熱感が強い。時価総額33億円、出来高1.1万株と小さく、売買が細いぶん値が振れやすい。', 673, 100, 17.50, { perA: '67.5', perF: '24.2', pbr: '2.54', roe: '3.8', mcap: '33億円', volume: '11千株' }],
  ['5838', '楽天銀行', 'weak', '情報流出', '楽天証券で最大447万口座の個人情報流出の恐れ、一時ストップ安', '※影響の範囲は確定していない', '楽天証券で最大447万口座の個人情報が流出した恐れがあると伝わり、一時ストップ安。終値は15.20%安の4,489円。', '流出の範囲や原因はまだ確定していない。続報で規模が変わる可能性があり、下げ幅が妥当かは判断しにくい。', 4489, null, -15.20, {}],
  ['4755', '楽天G', 'weak', '情報流出', '一時2年11カ月ぶり安値、5.67%安', '※業績への影響額は不明', '情報流出の問題を受けて売られ、一時2年11カ月ぶりの安値をつけた。終値は5.67%安の612.8円。', '業績への影響額はまだ見えていない。安値更新で投げ売りが出ている面もある。', 612.8, null, -5.67, {}],
  ['4165', 'プレイド', 'weak', '情報流出', '「KARTE」経由の流出発表が相次ぎ2日連続ストップ安', '※取引先の離反は未確認', '自社サービス「KARTE」を経由した情報流出の発表が相次ぎ、2日連続のストップ安。終値は18.20%安の449円。', '原因の特定や再発防止策がまだで、損害の大きさは分からない。売りが売りを呼んでいる面もある。', 449, null, -18.20, {}],
  ['3046', 'JINS HD', '', '情報流出', '会員1829万件がKARTE経由で流出、2.24%安', '※実害の有無は不明', '会員1,829万件分の情報が「KARTE」経由で流出したと伝わった。終値は2.24%安の6,550円。', '流出した情報の中身や不正利用の有無はまだ分からない。下げ幅は2%台にとどまっている。', 6550, null, -2.24, {}],
];
const SEED_NOTES = {
  general: '・KARTE経由の情報流出の発表が相次ぎ、関連銘柄が大きく売られた\n・Rebaseは上方修正から3日連続のストップ高\n・医薬品株がそろって軟調',
  us: '',
  jp: '# 情報流出関連\n・楽天銀行 −15.20%、プレイド −18.20%（2日連続ストップ安）\n・楽天G −5.67%、JINS HD −2.24%\n# 医薬品\n・中外製薬 −1.83%、大塚HD −2.16%',
  indices: [{ name: '日経平均', value: '59,024.28', chg: '+163.85（+0.28%）' }, { name: 'ドル円', value: '159.20', chg: '−0.17（−0.11%）' }],
};
function calcChange(close, pct) {
  if (!isNum(close) || !isNum(pct)) return '';
  const prev = Number(close) / (1 + Number(pct) / 100);
  return decOf(close) ? Math.round((close - prev) * 10) / 10 : Math.round(close - prev);
}
const DATA_KEYS = ['code', 'name', 'mark', 'theme', 'headline', 'takeaway', 'material', 'caveat', 'srcLabel', 'srcUrl', 'close', 'change', 'changePct', 'perA', 'perF', 'pbr', 'roe', 'mcap', 'volume', 'ohlc', 'order', 'sample'];
function blankEntry() {
  return { code: '', name: '', mark: '', theme: '', headline: '', takeaway: '', material: '', caveat: '', srcLabel: '', srcUrl: '', close: '', change: '', changePct: '', perA: '', perF: '', pbr: '', roe: '', mcap: '', volume: '', ohlc: '', order: 0, sample: false };
}
function seedData() {
  const entries = SEED.map((r, i) => {
    const [code, name, mark, theme, headline, takeaway, material, caveat, close, change, pct, m] = r;
    return { ...blankEntry(), id: `${SEED_DATE.replace(/-/g, '')}-${code}`, date: SEED_DATE, order: i + 1, code, name, mark, theme, headline, takeaway, material, caveat,
      close, change: change ?? calcChange(close, pct), changePct: pct, perA: m.perA || '', perF: m.perF || '', pbr: m.pbr || '', roe: m.roe || '', mcap: m.mcap || '', volume: m.volume || '',
      sample: true, createdAt: 1, updatedAt: 1, deletedAt: null };
  });
  return { entries, notes: [{ date: SEED_DATE, ...SEED_NOTES, sample: true, updatedAt: 1 }] };
}

/* ================= prefs ================= */
const prefs = Object.assign({ scale: 100, sound: false, mode: 'auto', mascot: true, range: 63 }, LS.get('soubacho.prefs', {}));
const savePrefs = () => LS.set('soubacho.prefs', prefs);

/* ================= state ================= */
const TABS = {
  zenpan: { label: '全般', badge: '全', kind: 'note', key: 'general' },
  beikoku: { label: '昨晩の米国株', badge: '米', kind: 'note', key: 'us' },
  nihon: { label: '本日の日本株', badge: '日', kind: 'note', key: 'jp' },
  wadai: { label: '話題株', kind: 'list' },
  tsuyoyowa: { label: 'ツヨ・ヨワ', kind: 'tsuyo' },
};
const S = { date: todayISO(), tab: 'wadai', filter: 'all', q: '', detailId: null, nav: [], pushed: false, noteEditing: false, slide: '', user: null, authChecked: LOCAL_ONLY, sync: 'local' };

/* ================= server ================= */
async function req(method, path, body) {
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw { status: 0 }; }
  if (r.status === 401) throw { status: 401 };
  let json = null;
  try { json = await r.json(); } catch (e) { /* 本文なし */ }
  return { status: r.status, ok: r.ok, json };
}

/* ================= store（端末に保存し、ログイン中はサーバーと同期） ================= */
const K = { data: 'soubacho.data', outbox: 'soubacho.outbox', cursor: 'soubacho.cursor', uid: 'soubacho.uid', quotes: 'soubacho.quotes' };
const Store = {
  entries: new Map(), notes: new Map(), outbox: new Set(), cursor: 0,
  load() {
    const saved = LS.get(K.data, null);
    const src = saved && saved.v === 2 ? saved : seedData();
    src.entries.forEach((e) => this.entries.set(e.id, e));
    src.notes.forEach((n) => this.notes.set(n.date, n));
    this.outbox = new Set(LS.get(K.outbox, []));
    this.cursor = LS.get(K.cursor, 0);
    if (!saved) this.persist();
  },
  reset() { this.entries = new Map(); this.notes = new Map(); this.outbox = new Set(); this.cursor = 0; this.persist(); },
  persist() {
    LS.set(K.data, { v: 2, entries: [...this.entries.values()], notes: [...this.notes.values()] });
    LS.set(K.outbox, [...this.outbox]);
    LS.set(K.cursor, this.cursor);
  },
  putEntry(e) { e.updatedAt = Math.max(Date.now(), (e.updatedAt || 0) + 1); e.createdAt = e.createdAt || e.updatedAt; e.deletedAt = e.deletedAt ?? null; this.entries.set(e.id, e); this.outbox.add('e:' + e.id); this.persist(); Sync.soon(); },
  delEntry(id) { const e = this.entries.get(id); if (!e) return; this.putEntry({ ...e, deletedAt: Date.now() }); },
  putNote(n) { n.updatedAt = Math.max(Date.now(), (n.updatedAt || 0) + 1); this.notes.set(n.date, n); this.outbox.add('n:' + n.date); this.persist(); Sync.soon(); },
  live() { return [...this.entries.values()].filter((e) => !e.deletedAt); },
  dayEntries(date) { return this.live().filter((e) => e.date === date).sort((a, b) => (a.order || 0) - (b.order || 0)); },
  note(date) { return this.notes.get(date) || { date, general: '', us: '', jp: '', indices: [], sample: false, updatedAt: 0 }; },
};
const toServerEntry = (e) => {
  const data = {};
  DATA_KEYS.forEach((k) => { data[k] = e[k] ?? blankEntry()[k]; });
  return { day: e.date, data, createdAt: e.createdAt || e.updatedAt || Date.now(), updatedAt: e.updatedAt || Date.now(), deletedAt: e.deletedAt ?? null };
};
const fromServerEntry = (r) => ({ ...blankEntry(), ...r.data, id: r.id, date: r.day, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt });
const toServerNote = (n) => ({ data: { general: n.general || '', us: n.us || '', jp: n.jp || '', indices: n.indices || [], sample: !!n.sample }, updatedAt: n.updatedAt || Date.now() });
const fromServerNote = (r) => ({ date: r.day, ...r.data, updatedAt: r.updatedAt });

const Sync = {
  timer: 0, running: false, again: false,
  soon(ms = 400) { if (!S.user) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms); },
  async run() {
    if (!S.user || LOCAL_ONLY) return;
    if (this.running) { this.again = true; return; }
    this.running = true; setSync('busy');
    try {
      await this.pull();
      await this.push();
      setSync(Store.outbox.size ? 'pending' : 'sync');
    } catch (e) {
      if (e && e.status === 401) loggedOut();
      else setSync('offline');
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.soon(); }
    }
  },
  async pull() {
    const first = !Store.cursor;
    const r = await req('GET', `/api/sync?since=${Store.cursor}`);
    if (!r.ok || !r.json) throw { status: r.status };
    let changed = false;
    const seenE = new Set(), seenN = new Set();
    for (const row of r.json.entries) {
      seenE.add(row.id);
      const loc = Store.entries.get(row.id);
      const localNewer = loc && Store.outbox.has('e:' + row.id) && (loc.updatedAt || 0) > row.updatedAt;
      if (!localNewer) { Store.entries.set(row.id, fromServerEntry(row)); Store.outbox.delete('e:' + row.id); changed = true; }
    }
    for (const row of r.json.notes) {
      seenN.add(row.day);
      const loc = Store.notes.get(row.day);
      const localNewer = loc && Store.outbox.has('n:' + row.day) && (loc.updatedAt || 0) > row.updatedAt;
      if (!localNewer) { Store.notes.set(row.day, fromServerNote(row)); Store.outbox.delete('n:' + row.day); changed = true; }
    }
    if (first) {
      // この端末で初めて同期：サーバーにないものを送る（ログイン前に書いた分）
      for (const e of Store.entries.values()) if (!seenE.has(e.id)) Store.outbox.add('e:' + e.id);
      for (const n of Store.notes.values()) if (!seenN.has(n.date)) Store.outbox.add('n:' + n.date);
    }
    Store.cursor = r.json.now;
    Store.persist();
    if (changed) onRemoteChange();
  },
  async push() {
    for (const key of [...Store.outbox]) {
      const kind = key[0], id = key.slice(2);
      if (kind === 'e') {
        const e = Store.entries.get(id);
        if (!e) { Store.outbox.delete(key); continue; }
        const r = await req('PUT', `/api/entries/${encodeURIComponent(id)}`, toServerEntry(e));
        if (r.status === 0 || r.status >= 500) throw { status: r.status };
        if (r.ok && r.json && r.json.item && r.json.item.updatedAt > (e.updatedAt || 0)) { Store.entries.set(id, fromServerEntry(r.json.item)); onRemoteChange(); }
        if (!r.ok) console.warn('entry rejected', id, r.status);
      } else {
        const n = Store.notes.get(id);
        if (!n) { Store.outbox.delete(key); continue; }
        const r = await req('PUT', `/api/notes/${id}`, toServerNote(n));
        if (r.status === 0 || r.status >= 500) throw { status: r.status };
        if (r.ok && r.json && r.json.item && r.json.item.updatedAt > (n.updatedAt || 0)) { Store.notes.set(id, fromServerNote(r.json.item)); onRemoteChange(); }
      }
      Store.outbox.delete(key);
      Store.persist();
    }
  },
};
let remoteT = 0;
function onRemoteChange() {
  cancelAnimationFrame(remoteT);
  remoteT = requestAnimationFrame(() => {
    if (openScrim) { renderHeader(); renderTabs(); return; }
    if (S.detailId && (!Store.entries.get(S.detailId) || Store.entries.get(S.detailId).deletedAt)) { S.detailId = null; navigate(S.tab, true); return; }
    if (TABS[S.tab].kind === 'note' && S.noteEditing && !S.detailId) { renderHeader(); renderTabs(); return; }
    if (!S.detailId && TABS[S.tab].kind === 'list') { renderHeader(); renderTabs(); renderList($('#main')); return; }
    rerenderMain();
  });
}
function setSync(m) {
  S.sync = m;
  const dot = $('#syncDot');
  dot.className = 'sync' + (m === 'sync' ? ' on' : m === 'busy' || m === 'pending' ? ' slow' : m === 'local' ? ' off' : '');
  dot.title = { sync: '同期済み', busy: '同期中…', pending: '送信待ちがあります', offline: 'サーバーに届きません。この端末には保存しています', local: 'この端末に保存（ログインすると同期）' }[m] || '';
}

/* ================= quotes（J-Quants 経由の株価・指標） ================= */
const Quotes = {
  map: new Map(Object.entries(LS.get(K.quotes, {}))),
  inflight: new Set(), queue: [], active: 0,
  key: (code, day) => `${code}|${day}`,
  get(e) { if (!isCode(e.code)) return null; const v = this.map.get(this.key(e.code, e.date)); return v ? v.q : null; },
  want(e) {
    if (!S.user || LOCAL_ONLY || !isCode(e.code)) return;
    const k = this.key(e.code, e.date), v = this.map.get(k);
    const age = v ? Date.now() - v.at : Infinity;
    const stale = !v || age > 6 * 3600e3 || (age > 5 * 60e3 && (v.q.pending || v.q.day !== e.date || v.q.source === 'none'));
    if (!stale || this.inflight.has(k)) return;
    this.inflight.add(k); this.queue.push([e.code, e.date]); this.pump();
  },
  pump() {
    while (this.active < 2 && this.queue.length) {
      const [code, day] = this.queue.shift();
      this.active++;
      this.fetch(code, day).finally(() => { this.active--; this.inflight.delete(this.key(code, day)); this.pump(); });
    }
  },
  async fetch(code, day) {
    try {
      const r = await req('GET', `/api/quote/${encodeURIComponent(code)}?day=${day}`);
      if (r.ok && r.json && r.json.quote) { this.put(code, day, r.json.quote); onQuote(code, day); }
      return r.ok && r.json ? r.json.quote : null;
    } catch (e) { if (e && e.status === 401) loggedOut(); return null; }
  },
  put(code, day, q) {
    this.map.set(this.key(code, day), { q, at: Date.now() });
    if (this.map.size > 160) [...this.map.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, this.map.size - 160).forEach(([k]) => this.map.delete(k));
    LS.set(K.quotes, Object.fromEntries(this.map));
  },
};
let quoteT = 0;
function onQuote(code, day) {
  cancelAnimationFrame(quoteT);
  quoteT = requestAnimationFrame(() => {
    if (openScrim) return;
    if (S.detailId) {
      const e = Store.entries.get(S.detailId);
      if (e && e.code === code && e.date === day && Chart.hover < 0) rerenderMain();
      return;
    }
    if (TABS[S.tab].kind === 'list') renderList($('#main'));
    else if (TABS[S.tab].kind === 'tsuyo' || (TABS[S.tab].key === 'general' && !S.noteEditing)) rerenderMain();
  });
}

/* ================= theme ================= */
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function effectiveMode() { return prefs.mode !== 'auto' ? prefs.mode : mq && mq.matches ? 'dark' : 'light'; }
function applyTheme() {
  const m = effectiveMode();
  document.body.classList.toggle('mode-dark', m === 'dark');
  document.body.classList.toggle('mode-light', m === 'light');
  const cs = getComputedStyle(document.body);
  const paper = cs.getPropertyValue('--paper').trim(), wave = cs.getPropertyValue('--wave').trim();
  const centers = [[20, -10], [0, 0], [40, 0], [20, 10], [0, 20], [40, 20], [20, 30]];
  const rings = ([x, y]) => `<circle cx='${x}' cy='${y}' r='19.4' fill='${paper}' stroke='${wave}' stroke-width='.9'/>` + [14.6, 9.8, 5].map((r) => `<circle cx='${x}' cy='${y}' r='${r}' fill='none' stroke='${wave}' stroke-width='.9'/>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20' viewBox='0 0 40 20'>${centers.map(rings).join('')}</svg>`;
  document.body.style.setProperty('--pattern', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  const meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', paper);
  $('#modeBtn').innerHTML = m === 'dark' ? IC.sun : IC.moon;
  $('#modeBtn').setAttribute('aria-label', m === 'dark' ? 'ライトモードにする' : 'ダークモードにする');
  if (Chart.cv) Chart.draw();
}
if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
function applyScale() {
  document.documentElement.style.fontSize = (16 * prefs.scale / 100) + 'px';
  $('#fontPct').textContent = prefs.scale + '%';
  if (Chart.cv) requestAnimationFrame(() => Chart.draw());
}

/* ================= sound ================= */
let actx = null;
function blip(kind) {
  if (!prefs.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(kind === 'up' ? 880 : kind === 'down' ? 330 : kind === 'del' ? 196 : 660, t);
    if (kind === 'up') o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.16);
  } catch (e) { /* 音が出せない環境 */ }
}

/* ================= price data ================= */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function synthBars(e) {
  const close = Number(e.close); if (!(close > 0)) return null;
  const pct = isNum(e.changePct) ? Number(e.changePct) : 0;
  const N = 90, r = rng(hashStr(e.code + e.date + e.name));
  const vol = Math.min(0.04, 0.011 + Math.abs(pct) / 100 * 0.22);
  const dates = []; let d = e.date; for (let i = 0; i < N; i++) { dates.unshift(d); d = shiftBiz(d, -1); }
  const closes = new Array(N); closes[N - 1] = close; closes[N - 2] = close / (1 + pct / 100);
  const drift = (r() - 0.5) * 0.004;
  for (let i = N - 3; i >= 0; i--) closes[i] = closes[i + 1] / (1 + drift + gauss(r) * vol);
  const dec = decOf(close);
  const rd = (v) => dec ? Math.round(v * 10) / 10 : Math.round(v);
  const base = 40000 + r() * 160000, bars = [];
  for (let i = 0; i < N; i++) {
    const c = closes[i], prev = i ? closes[i - 1] : c * (1 - gauss(r) * vol * 0.5);
    const o = i === N - 1 ? prev * (1 + pct / 100 * 0.35 * r()) : prev * (1 + gauss(r) * vol * 0.35);
    const h = Math.max(o, c) * (1 + Math.abs(gauss(r)) * vol * 0.45), l = Math.min(o, c) * (1 - Math.abs(gauss(r)) * vol * 0.45);
    const ret = Math.abs(c / prev - 1);
    const v = Math.round(base * (0.6 + r() * 0.8) * (1 + ret / vol * 0.5) * (i === N - 1 ? 1 + Math.abs(pct) / 4 : 1));
    const O = rd(o), C = i === N - 1 ? close : rd(c);
    bars.push([dates[i], O, Math.max(rd(h), O, C), Math.min(rd(l), O, C), C, v]);
  }
  return bars;
}
function parseOHLC(txt) {
  const out = new Map();
  for (const raw of String(txt || '').split(/\r?\n|;/)) {
    const line = raw.trim(); if (!line) continue;
    let parts;
    if (line.includes('\t')) parts = line.split('\t');
    else if (/\s/.test(line) && line.split(/\s+/).length >= 5) parts = line.split(/\s+/);
    else parts = line.split(',');
    parts = parts.map((s) => s.trim()).filter(Boolean);
    const m = (parts[0] || '').match(/(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/);
    if (!m) continue;
    const nums = parts.slice(1).map((s) => Number(s.replace(/[,円株]/g, '')));
    if (nums.length < 4 || nums.slice(0, 4).some((n) => !isFinite(n) || n <= 0)) continue;
    const [o, h, l, c] = nums; const v = isFinite(nums[4]) ? nums[4] : 0;
    out.set(`${m[1]}-${pad(m[2])}-${pad(m[3])}`, [o, Math.max(h, o, c), Math.min(l, o, c), c, v]);
  }
  return [...out.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, a]) => [d, ...a]);
}
const encodeOHLC = (bars) => bars.map((b) => b.join(',')).join(';');
const ohlcToText = (s) => parseOHLC(s).map((b) => [fmtSlash(b[0]), ...b.slice(1)].join(',')).join('\n');
const barCache = new Map();
function localBars(e) {
  const key = [e.id, e.ohlc ? e.ohlc.length : 0, e.close, e.changePct, e.date].join('|');
  if (barCache.has(key)) return barCache.get(key);
  let res = null;
  if (e.ohlc) { const b = parseOHLC(e.ohlc); if (b.length >= 2) res = { bars: b, synthetic: false }; }
  if (!res) { const b = synthBars(e); res = b ? { bars: b, synthetic: true } : null; }
  barCache.set(key, res); return res;
}
/** 画面に出す株価：J-Quants などの取得値 → 手入力 → サンプル（合成）の順 */
function mkt(e) {
  Quotes.want(e);
  const q = Quotes.get(e);
  const hasQ = !!(q && q.source !== 'none' && q.bars && q.bars.length);
  const lb = hasQ ? null : localBars(e);
  const pick = (qv, ev) => (hasQ && qv !== null && qv !== undefined ? qv : isNum(ev) ? Number(ev) : null);
  const qm = (hasQ && q.metrics) || {};
  return {
    q, hasQ,
    bars: hasQ ? q.bars : lb ? lb.bars : null,
    synthetic: !hasQ && !!(lb && lb.synthetic),
    source: hasQ ? q.source : lb ? (lb.synthetic ? 'sample' : 'csv') : '',
    close: pick(q && q.close, e.close),
    change: pick(q && q.change, e.change),
    changePct: pick(q && q.changePct, e.changePct),
    day: hasQ && q.day ? q.day : e.date,
    name: e.name || (q && q.name) || e.code,
    m: {
      perA: isNum(qm.per) ? nf(qm.per, 1) : e.perA,
      perF: isNum(qm.perF) ? nf(qm.perF, 1) : e.perF,
      pbr: isNum(qm.pbr) ? nf(qm.pbr, 2) : e.pbr,
      roe: isNum(qm.roe) ? nf(qm.roe, 1) : e.roe,
      mcap: isNum(qm.mcap) ? fmtYen(qm.mcap) : e.mcap,
      volume: hasQ && isNum(q.volume) ? fmtVol(q.volume) : e.volume,
    },
  };
}
const SOURCE_LABEL = { jquants: 'J-Quants', yahoo: 'Yahoo!ファイナンス', mock: '模擬データ', csv: '貼り付けた日足', sample: '' };
function sparkSVG(e, k) {
  if (!k.bars) return '<span class="muted">—</span>';
  const cl = k.bars.slice(-30).map((b) => b[4]);
  const w = 112, h = 30, p = 3, mn = Math.min(...cl), mx = Math.max(...cl), rg = mx - mn || 1;
  const pts = cl.map((c, i) => [p + (w - 2 * p) * i / Math.max(1, cl.length - 1), p + (h - 2 * p) * (1 - (c - mn) / rg)]);
  const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
  const last = pts[pts.length - 1];
  const col = dirOf(k.changePct) === 'dn' ? 'var(--dn)' : 'var(--up)';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${line}L${last[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}Z" fill="${col}" opacity=".1"/><path d="${line}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"${k.synthetic ? ' stroke-dasharray="3 2.2"' : ''}/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="${col}"/></svg>`;
}

/* ================= candlestick chart ================= */
const Chart = {
  cv: null, bars: null, n: 63, hover: -1, ro: null,
  mount(cv, bars) {
    this.cv = cv; this.bars = bars; this.hover = -1; this.n = prefs.range;
    if (this.ro) this.ro.disconnect();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(cv); }
    const pick = (ev) => {
      const rect = cv.getBoundingClientRect(), data = this.data(); const L = this.layout(rect.width);
      const i = Math.floor((ev.clientX - rect.left - L.x0) / ((L.x1 - L.x0) / data.length));
      this.hover = i >= 0 && i < data.length ? i : -1; this.draw();
    };
    cv.addEventListener('pointermove', pick);
    cv.addEventListener('pointerdown', pick);
    cv.addEventListener('pointerleave', () => { this.hover = -1; this.draw(); });
    this.draw();
  },
  unmount() { if (this.ro) this.ro.disconnect(); this.ro = null; this.cv = null; this.hover = -1; },
  data() { return this.bars.slice(-this.n); },
  layout(W) { return { x0: 4, x1: W - 50 }; },
  draw() {
    const cv = this.cv; if (!cv || !cv.isConnected) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.body), col = (n) => cs.getPropertyValue(n).trim();
    const C = { up: col('--up'), dn: col('--dn'), line: col('--line'), sub: col('--sub'), gold: col('--gold-2'), ink: col('--ink'), card: col('--card') };
    const data = this.data(), { x0, x1 } = this.layout(W);
    const padT = 8, padB = 18, volH = Math.round(H * 0.2), gap = 8, priceH = H - padT - padB - volH - gap;
    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (const b of data) { hi = Math.max(hi, b[2]); lo = Math.min(lo, b[3]); vmax = Math.max(vmax, b[5] || 0); }
    const span = (hi - lo) || hi * 0.02; hi += span * 0.06; lo -= span * 0.06;
    const dec = data.some((b) => b[4] % 1) ? 1 : 0;
    const y = (v) => padT + (hi - v) / (hi - lo) * priceH;
    const cw = (x1 - x0) / data.length, bw = Math.max(1, Math.min(9, cw * 0.64));
    const fs = Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.66);
    const font = (w, s) => `${w} ${s}px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`;
    g.font = font(600, fs); g.textBaseline = 'middle';
    g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.sub;
    for (const f of [0.06, 0.36, 0.64, 0.94]) {
      const v = hi - (hi - lo) * f, yy = Math.round(y(v)) + 0.5;
      g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); g.globalAlpha = 1;
      g.textAlign = 'left'; g.fillText(nf(v, dec), x1 + 6, yy);
    }
    data.forEach((b, i) => {
      const [, o, h, l, c] = b, cx = x0 + cw * (i + 0.5), up = c >= o;
      g.strokeStyle = g.fillStyle = up ? C.up : C.dn;
      g.beginPath(); g.moveTo(Math.round(cx) + 0.5, y(h)); g.lineTo(Math.round(cx) + 0.5, y(l)); g.stroke();
      g.fillRect(cx - bw / 2, y(Math.max(o, c)), bw, Math.max(1, Math.abs(y(o) - y(c))));
    });
    const vy0 = H - padB;
    data.forEach((b, i) => {
      const cx = x0 + cw * (i + 0.5), hgt = vmax ? (b[5] / vmax) * volH : 0;
      g.fillStyle = b[4] >= b[1] ? C.up : C.dn; g.globalAlpha = 0.4;
      g.fillRect(cx - bw / 2, vy0 - hgt, bw, hgt); g.globalAlpha = 1;
    });
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(x0, vy0 + 0.5); g.lineTo(x1, vy0 + 0.5); g.stroke();
    const last = data[data.length - 1], ly = y(last[4]);
    g.setLineDash([3, 3]); g.strokeStyle = C.sub; g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(x0, Math.round(ly) + 0.5); g.lineTo(x1, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    const tag = nf(last[4], dec), tw = g.measureText(tag).width + 10;
    g.fillStyle = C.gold; g.beginPath();
    if (g.roundRect) g.roundRect(x1 + 2, ly - 9, Math.max(tw, 44), 18, 3); else g.rect(x1 + 2, ly - 9, Math.max(tw, 44), 18);
    g.fill();
    g.fillStyle = '#FFF9EC'; g.textAlign = 'left'; g.fillText(tag, x1 + 7, ly + 0.5);
    g.fillStyle = C.sub; g.textBaseline = 'alphabetic';
    const md = (s) => { const d = utc(s); return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`; };
    g.textAlign = 'left'; g.fillText(md(data[0][0]), x0, H - 4);
    g.textAlign = 'right'; g.fillText(md(last[0]), x1, H - 4);
    if (this.hover >= 0 && data[this.hover]) {
      const b = data[this.hover], cx = x0 + cw * (this.hover + 0.5);
      g.strokeStyle = C.ink; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(Math.round(cx) + 0.5, padT); g.lineTo(Math.round(cx) + 0.5, vy0); g.stroke(); g.globalAlpha = 1;
      const txt = `${md(b[0])}  始${nf(b[1], dec)} 高${nf(b[2], dec)} 安${nf(b[3], dec)} 終${nf(b[4], dec)}`;
      g.font = font(600, fs + 1);
      const w = Math.min(g.measureText(txt).width + 14, x1 - x0 - 4);
      g.fillStyle = C.card; g.strokeStyle = C.line; g.globalAlpha = 0.95;
      g.fillRect(x0 + 2, padT, w, 22); g.globalAlpha = 1; g.strokeRect(x0 + 2.5, padT + 0.5, w, 21);
      g.fillStyle = C.ink; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, x0 + 9, padT + 11.5);
    }
  },
};

/* ================= header / tabs ================= */
function counts(date) {
  const list = Store.dayEntries(date);
  return { all: list.length, strong: list.filter((e) => e.mark === 'strong').length, weak: list.filter((e) => e.mark === 'weak').length, list };
}
function renderHeader() {
  const t = todayISO();
  $('#dateLabel').textContent = fmtJP(S.date);
  $('#todayBtn').hidden = S.date === t;
  $('#nextDay').disabled = S.date >= t;
  $('#soundBtn').innerHTML = prefs.sound ? IC.soundOn : IC.soundOff;
  $('#soundBtn').setAttribute('aria-pressed', String(prefs.sound));
  $('#moreBtn').innerHTML = IC.more;
  const slot = $('#acctSlot');
  if (LOCAL_ONLY || !S.authChecked) slot.innerHTML = '';
  else if (S.user) {
    const initial = esc((S.user.name || S.user.email || '?').trim().slice(0, 1).toUpperCase());
    const want = `acct:${S.user.email}`;
    if (slot.dataset.k !== want) slot.innerHTML = `<button class="acct" data-act="menu" data-testid="avatar" aria-label="アカウント（${esc(S.user.email)}）">${initial}</button>`;
    slot.dataset.k = want;
  } else {
    if (slot.dataset.k !== 'login') slot.innerHTML = `<button class="tbtn" data-act="login" data-testid="login" aria-label="Googleでログイン">${IC.user}</button>`;
    slot.dataset.k = 'login';
  }
}
function renderTabs() {
  const c = counts(S.date);
  $('#tabs').innerHTML = Object.entries(TABS).map(([k, t]) => {
    const badge = t.badge ? `<span class="bdg">${t.badge}</span>` : k === 'wadai' ? `<span class="bdg" style="color:var(--gold)">${IC.mega}</span>` : `<span class="bdg icons">${IC.flame}${IC.skull}</span>`;
    const cnt = k === 'wadai' ? `<span class="cnt" data-testid="count-all">${c.all}</span>` : k === 'tsuyoyowa' ? `<span class="cnt">${c.strong + c.weak}</span>` : '';
    return `<button class="tab" role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${badge}<span>${t.label}</span>${cnt}</button>`;
  }).join('');
  const box = $('#tabs'), act = $('.tab[aria-selected="true"]', box);
  if (act && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, act.offsetLeft - box.offsetLeft - 40);
}

/* ================= list ================= */
function filtered() {
  const q = S.q.trim().toLowerCase();
  return Store.dayEntries(S.date).filter((e) =>
    (S.filter === 'all' || e.mark === S.filter) &&
    (!q || [e.name, e.code, e.theme, e.headline].some((v) => String(v || '').toLowerCase().includes(q))));
}
function rowHTML(e) {
  const k = mkt(e);
  const dir = dirOf(k.changePct);
  return `<button class="row ${e.mark || ''}" data-open="${esc(e.id)}" data-testid="row">
    <span class="r-nm"><b>${esc(k.name)}</b><small>${esc(e.code)}</small></span>
    <span class="r-mk" aria-label="${markText(e.mark)}">${markIcon(e.mark)}</span>
    <span class="r-th">${e.theme ? `<span class="tag">${esc(e.theme)}</span>` : ''}</span>
    <span class="r-hd">${esc(e.headline)}</span>
    <span class="r-sp">${sparkSVG(e, k)}</span>
    <span class="r-px">${k.close !== null ? nf(k.close, decOf(k.close)) : '—'}</span>
    <span class="r-ch">${k.changePct !== null ? `<span class="pill ${dir}">${signed(k.changePct, 2)}%</span>` : ''}</span>
    <span class="r-go" aria-hidden="true">›</span>
  </button>`;
}
const THEAD = '<div class="thead" aria-hidden="true"><span>銘柄</span><span></span><span>テーマ</span><span>見出し</span><span>推移</span><span>終値</span><span>前日比</span><span>詳細</span></div>';
function noticeHTML(c) {
  const parts = [];
  if (c.list.some((e) => e.sample)) parts.push(`<div class="notice"><span>録画に映っていた2026/11/18の話題株をサンプルとして入れています。${S.user ? '' : '点線の推移は合成データです。'}</span><button data-act="clear-sample">サンプルを消す</button></div>`);
  if (!LOCAL_ONLY && S.authChecked && !S.user) parts.push(`<div class="notice"><span>ログインすると、株価の自動取得（J-Quants）・AIの下書き・端末間の同期が使えます。</span><button class="btn-gold" data-act="login">Googleでログイン</button></div>`);
  return parts.join('');
}
function renderList(main) {
  const key = `list|${S.date}`;
  const c = counts(S.date);
  const isToday = S.date === todayISO();
  if (main.dataset.key !== key) {
    main.dataset.key = key;
    main.innerHTML = `
      <div class="list-head">
        <h2 class="sec-title">${isToday ? '本日の話題株' : `${fmtMD(S.date)}の話題株`}</h2>
        <div class="chips" id="chips"></div>
        <label class="search">${IC.search}<span class="vh">絞り込み</span><input id="q" type="search" placeholder="銘柄名・コード・テーマで絞り込み" value="${esc(S.q)}" autocomplete="off"></label>
        <button class="btn-gold add" data-act="add" data-testid="add">＋ 銘柄</button>
      </div>
      <div id="notice"></div>
      ${THEAD}
      <div class="rows" id="rows"></div>
      <p class="legend" id="legend"></p>`;
  }
  $('#chips').innerHTML = [['all', 'すべて', c.all, ''], ['strong', '強', c.strong, IC.flame], ['weak', '弱', c.weak, IC.skull]]
    .map(([k, l, n, ic]) => `<button class="chip" data-filter="${k}" aria-pressed="${S.filter === k}">${ic}${l}<b>${n}</b></button>`).join('');
  $('#notice').innerHTML = noticeHTML(c);
  const list = filtered();
  const rows = $('#rows');
  if (!c.all) {
    const prev = Store.live().map((e) => e.date).filter((d) => d < S.date).sort().pop();
    rows.innerHTML = `<div class="empty"><p>${isToday ? '今日' : fmtMD(S.date)}の話題株はまだありません。</p><button class="btn-gold" data-act="add">＋ 銘柄を追加</button>${prev ? `<button class="btn-ghost" data-date="${prev}">${fmtMD(prev)}を見る</button>` : ''}</div>`;
  } else if (!list.length) {
    rows.innerHTML = '<div class="empty"><p>条件に合う銘柄がありません。</p><button class="btn-ghost" data-act="reset-filter">絞り込みを解除</button></div>';
  } else rows.innerHTML = list.map(rowHTML).join('');
  rows.classList.toggle('bare', !c.all || !list.length);
  $('.thead', main).style.visibility = list.length ? '' : 'hidden';
  $('#legend').textContent = list.some((e) => mkt(e).synthetic) ? '点線の推移は合成データ（ログインするか日足を貼ると実データになります）' : '';
}
function renderTsuyo(main) {
  main.dataset.key = `tsuyo|${S.date}`;
  const c = counts(S.date);
  const s = c.list.filter((e) => e.mark === 'strong'), w = c.list.filter((e) => e.mark === 'weak');
  const block = (title, ic, arr) => `<h3 class="group-h">${ic}${title}<span class="num">${arr.length}</span></h3>${arr.length ? THEAD + `<div class="rows">${arr.map(rowHTML).join('')}</div>` : '<div class="empty"><p>まだありません。銘柄の詳細で印をつけると、ここに集まります。</p></div>'}`;
  main.innerHTML = `<h2 class="sec-title" style="margin:6px 0 4px">ツヨ・ヨワ<small>${fmtMD(S.date)}</small></h2>${block('ツヨ（強）', IC.flame, s)}${block('ヨワ（弱）', IC.skull, w)}`;
}

/* ================= notes ================= */
function noteBody(txt) {
  const lines = String(txt || '').split('\n'); let html = '', inList = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^[・\-*]\s?/.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${esc(l.replace(/^[・\-*]\s?/, ''))}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l) continue;
    if (/^#\s?/.test(l)) html += `<h4>${esc(l.replace(/^#\s?/, ''))}</h4>`; else html += `<p>${esc(l)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function renderNote(main) {
  const t = TABS[S.tab], key = `note|${S.date}|${S.tab}`;
  if (main.dataset.key === key && S.noteEditing) return;
  main.dataset.key = key;
  const n = Store.note(S.date), body = n[t.key] || '';
  const ed = S.noteEditing;
  let extra = '';
  if (t.key === 'general') {
    const idx = n.indices || [];
    const c = counts(S.date);
    const withPct = c.list.map((e) => ({ e, k: mkt(e) })).filter((x) => x.k.changePct !== null);
    const ups = withPct.filter((x) => x.k.changePct > 0).sort((a, b) => b.k.changePct - a.k.changePct).slice(0, 3);
    const dns = withPct.filter((x) => x.k.changePct < 0).sort((a, b) => a.k.changePct - b.k.changePct).slice(0, 3);
    const mv = (title, ic, arr) => `<div class="card mv"><h3>${ic}${title}</h3>${arr.length ? `<ol>${arr.map(({ e, k }) => `<li><button data-open="${esc(e.id)}"><span class="nm">${esc(k.name)}<small>${esc(e.code)}</small></span>${e.theme ? `<span class="tag">${esc(e.theme)}</span>` : ''}<span class="pill ${dirOf(k.changePct)}">${signed(k.changePct, 2)}%</span></button></li>`).join('')}</ol>` : '<p class="muted">なし</p>'}</div>`;
    extra = `${ed ? `<label class="fld note-edit"><span>指標（1行に「名前 値 前日比」）</span><textarea id="idxEdit" rows="3">${esc(idx.map((i) => [i.name, i.value, i.chg].join(' ')).join('\n'))}</textarea></label>`
      : (idx.length ? `<div class="idx">${idx.map((i) => `<div class="met"><span>${esc(i.name)}</span><b>${esc(i.value)}</b><em style="color:var(--${/^[−-]/.test(i.chg) ? 'dn' : /^\+/.test(i.chg) ? 'up' : 'sub'})">${esc(i.chg)}</em></div>`).join('')}</div>` : '')}
      ${c.all ? `<div class="movers">${mv('話題株の上昇率', IC.flame, ups)}${mv('話題株の下落率', IC.skull, dns)}</div>` : ''}`;
  }
  const title = t.key === 'general' ? `${fmtMD(S.date)}の全般` : t.label;
  main.innerHTML = `<section class="note-wrap">
    <div class="note-head"><h2>${esc(title)}</h2><button class="btn-ghost" data-act="note-toggle" data-testid="note-toggle">${ed ? '完了' : '編集'}</button></div>
    ${extra}
    ${ed ? `<label class="fld note-edit"><span>メモ（「・」で箇条書き、「#」で見出し）</span><textarea id="noteEdit" rows="12" placeholder="${t.key === 'us' ? '例）\n# 指数\n・NYダウ …\n# 半導体\n・SOX指数 …' : '例）\n・気になったこと\n・明日の確認事項'}">${esc(body)}</textarea></label><p class="saved" id="savedNote">入力すると自動で保存します</p>`
      : (body ? `<div class="card note-body" data-testid="note-body">${noteBody(body)}</div>` : `<div class="empty"><p>${t.key === 'us' ? '昨晩の米国株' : t.key === 'jp' ? '本日の日本株' : 'この日'}のメモはまだありません。</p><button class="btn-gold" data-act="note-toggle">書く</button></div>`)}
  </section>`;
  if (ed) { const ta = $('#noteEdit'); if (ta) ta.focus({ preventScroll: true }); }
}
let noteTimer = null, pendingNote = null;
function scheduleNoteSave() {
  clearTimeout(noteTimer);
  const t = TABS[S.tab]; if (t.kind !== 'note') return;
  pendingNote = { date: S.date, key: t.key };
  noteTimer = setTimeout(flushNote, 600);
}
function flushNote() {
  clearTimeout(noteTimer); noteTimer = null;
  const ctx = pendingNote; pendingNote = null; if (!ctx) return;
  const n = { ...Store.note(ctx.date) };
  const ta = $('#noteEdit'); if (ta) n[ctx.key] = ta.value;
  const ix = $('#idxEdit');
  if (ix) n.indices = ix.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/\s+/); if (p.length < 2) return { name: p[0], value: '', chg: '' };
    if (p.length === 2) return { name: p[0], value: p[1], chg: '' };
    return { name: p.slice(0, p.length - 2).join(' '), value: p[p.length - 2], chg: p[p.length - 1] };
  });
  n.sample = false;
  Store.putNote(n);
  const s = $('#savedNote'); if (s) s.textContent = '保存しました ' + new Date(Date.now() + JST).toISOString().slice(11, 16);
}

/* ================= detail ================= */
function metricTile(id, label, val, unit) {
  let v = String(val ?? '').trim(), u = unit;
  if (!v) return `<div class="met" data-testid="metric-${id}"><span>${label}</span><b>—</b></div>`;
  const m = v.match(/^([−\-+]?[\d.,]+)\s*(.*)$/);
  if (m) { v = m[1]; if (m[2]) u = m[2]; }
  return `<div class="met" data-testid="metric-${id}"><span>${label}</span><b>${esc(v)}${u ? `<small>${esc(u)}</small>` : ''}</b></div>`;
}
function renderDetail(main) {
  const e = Store.entries.get(S.detailId);
  main.dataset.key = 'detail|' + e.id;
  Chart.unmount();
  const k = mkt(e);
  const dir = dirOf(k.changePct), dec = decOf(k.close ?? 0);
  const srcOk = /^https?:\/\//i.test(e.srcUrl || '');
  const q = k.q;
  const notes = [];
  if (q && q.pending) notes.push(`${fmtMD(e.date)}の日足は大引け後（16:30ごろ）に配信されます。いまは前の営業日の値です。`);
  else if (k.hasQ && q.day && q.day !== e.date) notes.push(`${fmtMD(e.date)}の値はまだありません。${fmtMD(q.day)}の値を表示しています。`);
  if (q && q.note) notes.push(q.note);
  if (!S.user && !LOCAL_ONLY && isCode(e.code)) notes.push('ログインすると J-Quants から株価と指標を自動で取得します。');
  const srcLabel = SOURCE_LABEL[k.source] || '';
  main.innerHTML = `<article class="detail ${S.slide}" id="detail" data-testid="detail">
    <div class="d-left">
      <section class="d-title">
        <div class="l1"><h1 class="d-name">${esc(k.name)}</h1><span class="code">${esc(e.code)}</span>
        <button class="markbtn ${e.mark || ''}" data-act="cycle-mark" data-testid="mark" aria-label="印を切り替える（今は${markText(e.mark)}）">${markIcon(e.mark)}${markText(e.mark)}</button></div>
        ${e.theme || (q && q.sector) ? `<div class="d-theme">${esc(e.theme || '')}${q && q.sector ? `<span class="muted" style="margin-left:8px;font-weight:500;letter-spacing:0">${esc(q.market ? q.market + '・' : '')}${esc(q.sector)}</span>` : ''}</div>` : ''}
      </section>
      <section class="d-head">
        <p class="headline">${esc(e.headline || '（見出し未入力）')}</p>
        ${e.takeaway ? `<p class="takeaway">→ ${esc(e.takeaway)}</p>` : ''}
      </section>
      <section class="card d-mat"><h3>材料と反応</h3><p>${e.material ? esc(e.material) : '<span class="muted">（まだ書かれていません）</span>'}</p></section>
      <section class="card corners d-cav"><h3>※ 素直に受け取れない点</h3><p>${e.caveat ? esc(e.caveat) : '<span class="muted">（なし）</span>'}</p></section>
      <section class="d-src"><h3>出所</h3>${srcOk ? `<a class="src-link" href="${esc(e.srcUrl)}" target="_blank" rel="noopener noreferrer">${e.srcLabel ? `<span class="lb">${esc(e.srcLabel)}</span>` : ''}記事を開く ${IC.ext}</a>` : `<span class="muted">${e.srcLabel ? esc(e.srcLabel) + '（URL未登録）' : '未登録'}</span>`}</section>
    </div>
    <div class="d-right">
      <section class="d-price">${k.close !== null ? `<span class="big" data-testid="price">${nf(k.close, dec)}</span><span class="yen">円</span>` : '<span class="muted">株価未入力</span>'}
        ${k.changePct !== null ? `<span class="pill ${dir}">${k.change !== null ? signed(k.change, dec) : ''}（${signed(k.changePct, 2)}%）</span>` : ''}</section>
      <section class="card d-chart">
        <div class="ch-head"><h3>日足チャート</h3>${k.synthetic ? '<span class="badge-sample" data-testid="sample-badge">サンプル（合成）</span>' : srcLabel ? `<span class="src-tag" data-testid="source">${esc(srcLabel)}</span>` : ''}
          <div class="seg" role="group" aria-label="期間">${[[21, '1ヶ月'], [63, '3ヶ月'], [84, '4ヶ月']].map(([n, l]) => `<button data-range="${n}" aria-pressed="${prefs.range === n}">${l}</button>`).join('')}</div></div>
        ${k.bars ? '<div class="chart-wrap"><canvas id="cv" role="img" aria-label="日足ローソク足と出来高"></canvas></div>' : `<div class="empty"><p>${isCode(e.code) && S.user ? '株価を取得しています…' : '終値を入れるとチャートを表示します。'}</p></div>`}
        ${k.synthetic ? '<div class="ch-foot"><span>実際の値動きではありません</span><button data-act="edit-csv">日足を貼る</button></div>' : k.bars ? `<div class="ch-foot"><span>${k.bars.length}本の日足</span><span>タップで四本値</span></div>` : ''}
        ${notes.map((t) => `<p class="qnote">${esc(t)}</p>`).join('')}
      </section>
      <section class="d-metrics">
        ${metricTile('per', 'PER（実績）', k.m.perA, '倍')}${metricTile('perf', 'PER（予想）', k.m.perF, '倍')}${metricTile('pbr', 'PBR', k.m.pbr, '倍')}
        ${metricTile('roe', 'ROE', k.m.roe, '%')}${metricTile('mcap', '時価総額', k.m.mcap, '')}${metricTile('vol', '出来高', k.m.volume, '')}
      </section>
      <p class="basis">${fmtSlash(k.day)} 終値ベース${srcLabel ? `・${esc(srcLabel)}` : ''}</p>
    </div>
  </article>`;
  S.slide = '';
  const cv = $('#cv'); if (cv && k.bars) Chart.mount(cv, k.bars);
  bindSwipe($('#detail'));
}
function renderDock() {
  const host = $('#dockHost');
  if (!S.detailId) {
    host.innerHTML = TABS[S.tab].kind === 'list' ? '<button class="fab" data-act="add" aria-label="銘柄を追加">＋</button>' : '';
    return;
  }
  const e = Store.entries.get(S.detailId);
  const i = S.nav.indexOf(e.id), n = S.nav.length;
  const kd = TABS[S.tab].kind;
  const backLabel = kd === 'list' ? '<span class="long">話題株</span>一覧' : kd === 'tsuyo' ? '<span class="long">ツヨ・ヨワ</span>一覧' : `<span class="long">${esc(TABS[S.tab].label)}に</span>戻る`;
  host.innerHTML = `<nav class="dock" aria-label="銘柄の操作"><div class="dock-in">
    <button class="dk" data-act="back" data-testid="back"><span>← ${backLabel}</span></button>
    ${isCode(e.code) ? `<a class="dk" href="https://kabutan.jp/stock/?code=${encodeURIComponent(e.code)}" target="_blank" rel="noopener noreferrer">株探 ${IC.ext}</a>` : ''}
    <button class="dk" data-act="edit" data-testid="edit">編集</button>
    <button class="dk del" data-act="del"><span><span class="long">この銘柄を</span>消す</span></button>
    <span class="pager"><button data-act="prev" aria-label="前の銘柄" ${i <= 0 ? 'disabled' : ''}>‹</button><b data-testid="pager">${i + 1} / ${n}</b><button data-act="next" aria-label="次の銘柄" ${i >= n - 1 ? 'disabled' : ''}>›</button></span>
  </div></nav>`;
}
function bindSwipe(el) {
  if (!el) return;
  let sx = 0, sy = 0, st = 0, on = false;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' || ev.target.closest('canvas,button,a,input,textarea')) { on = false; return; }
    on = true; sx = ev.clientX; sy = ev.clientY; st = Date.now();
  });
  el.addEventListener('pointerup', (ev) => {
    if (!on) return; on = false;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 700) step(dx < 0 ? 1 : -1);
  });
  el.addEventListener('pointercancel', () => { on = false; });
}

/* ================= routing（#wadai / #d-<id> など） ================= */
function buildNav() {
  if (S.tab === 'tsuyoyowa') { const l = Store.dayEntries(S.date); return [...l.filter((e) => e.mark === 'strong'), ...l.filter((e) => e.mark === 'weak')].map((e) => e.id); }
  if (S.tab === 'wadai') return filtered().map((e) => e.id);
  return Store.dayEntries(S.date).map((e) => e.id);
}
const alive = (id) => { const e = Store.entries.get(id); return e && !e.deletedAt ? e : null; };
function route(h) {
  h = h ?? location.hash.slice(1);
  if (h.startsWith('d-')) {
    const id = h.slice(2), e = alive(id);
    if (e) {
      if (S.detailId === id) return;
      S.detailId = id;
      if (e.date !== S.date) S.date = e.date;
      if (!S.nav.includes(id)) S.nav = buildNav();
      if (!S.nav.includes(id)) S.nav = Store.dayEntries(S.date).map((x) => x.id);
      render(); window.scrollTo(0, 0); return;
    }
    h = S.tab;
  }
  const tab = TABS[h] ? h : S.tab;
  if (!S.detailId && S.tab === tab && $('#main').dataset.key) return;
  S.detailId = null; S.tab = tab; S.noteEditing = false;
  render();
}
function navigate(hash, replace) {
  route(hash);
  try {
    if (location.hash.slice(1) === hash) return;
    if (replace) history.replaceState(null, '', '#' + hash); else location.hash = hash;
  } catch (e) { /* noop */ }
}
window.addEventListener('hashchange', () => route());
function openDetail(id) {
  S.nav = buildNav(); if (!S.nav.includes(id)) S.nav = Store.dayEntries(S.date).map((e) => e.id);
  S.pushed = true; blip('tap');
  navigate('d-' + id);
}
function step(d) {
  const i = S.nav.indexOf(S.detailId), j = i + d;
  if (j < 0 || j >= S.nav.length) return;
  S.slide = d > 0 ? 'slide-next' : 'slide-prev'; blip('tap');
  S.detailId = null; navigate('d-' + S.nav[j], true);
}
function backToList() {
  blip('tap');
  if (S.pushed) { S.pushed = false; history.back(); setTimeout(() => { if (S.detailId) navigate(S.tab, true); }, 200); }
  else navigate(S.tab, true);
}

/* ================= render root ================= */
function render() {
  flushNote();
  renderHeader(); renderTabs();
  const main = $('#main');
  if (S.detailId && !alive(S.detailId)) S.detailId = null;
  if (S.detailId) renderDetail(main);
  else {
    Chart.unmount();
    const kd = TABS[S.tab].kind;
    if (kd === 'list') renderList(main); else if (kd === 'tsuyo') renderTsuyo(main); else renderNote(main);
  }
  renderDock(); placeCat();
  const dl = $('#themes'); if (dl) dl.innerHTML = [...new Set(Store.live().map((e) => e.theme).filter(Boolean))].map((t) => `<option value="${esc(t)}">`).join('');
}
function rerenderMain() { $('#main').dataset.key = ''; render(); }

/* ================= sheets & dialogs ================= */
let openScrim = null;
function showScrim(html, cls = '') {
  closeScrim();
  const s = document.createElement('div');
  s.className = 'scrim ' + cls; s.innerHTML = html;
  s.addEventListener('click', (ev) => { if (ev.target === s) closeScrim(); });
  document.body.appendChild(s); openScrim = s;
  requestAnimationFrame(() => s.classList.add('open'));
  return s;
}
function closeScrim() { if (openScrim) { openScrim.remove(); openScrim = null; } }
function confirmBox(msg, ok = 'OK', danger = false) {
  return new Promise((res) => {
    const s = showScrim(`<div class="panel" role="alertdialog" aria-modal="true"><div class="panel-body"><p>${msg}</p><div class="acts"><button class="btn-ghost" data-r="0">やめる</button><button class="btn-gold" data-r="1" data-testid="confirm" style="${danger ? 'background:var(--up);border-color:var(--up)' : ''}">${ok}</button></div></div></div>`, 'center dialog');
    s.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) { closeScrim(); res(b.dataset.r === '1'); } });
    $('[data-r="1"]', s).focus();
  });
}
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3000); }

/* ----- editor ----- */
const FIELDS = ['code', 'name', 'theme', 'headline', 'takeaway', 'material', 'caveat', 'srcLabel', 'srcUrl', 'close', 'change', 'changePct', 'perA', 'perF', 'pbr', 'roe', 'mcap', 'volume'];
const aiReady = () => !LOCAL_ONLY && !!S.user;
function openEditor(id, focusCsv) {
  const e = id ? alive(id) : null;
  const date = e ? e.date : S.date;
  const v = (key) => esc(e ? (e[key] ?? '') : '');
  const mk = e ? (e.mark || '') : '';
  const fld = (key, label, attrs = '', extra = '') => `<label class="fld"><span>${label}</span><input id="f-${key}" value="${v(key)}" ${attrs}>${extra}</label>`;
  const area = (key, label, rows, ph = '') => `<label class="fld"><span>${label}</span><textarea id="f-${key}" rows="${rows}" placeholder="${ph}">${v(key)}</textarea></label>`;
  const aiHint = aiReady() ? '' : '<p class="hint">ログインすると、AIの下書きとスクショ読み取りが使えます。</p>';
  const s = showScrim(`<div class="panel" role="dialog" aria-modal="true" aria-labelledby="edTitle">
    <div class="panel-head"><button class="link" data-act="close">閉じる</button><h2 id="edTitle">${e ? '銘柄を編集' : '銘柄を追加'}<small style="display:block;font-family:var(--f-body);font-weight:500;font-size:.7rem;color:var(--sub)">${fmtJP(date)}</small></h2><button class="btn-gold sm" data-act="save" data-testid="save">保存</button></div>
    <form class="panel-body" id="ef" novalidate>
      ${aiReady() ? `<div class="ai-box"><button type="button" class="btn-ai" data-act="ai-shot" data-testid="ai-shot">${IC.cam}スクショから読み取る</button><input type="file" id="f-shot" accept="image/png,image/jpeg,image/webp" hidden><p class="hint" id="aiHint">ニュースや株価画面のスクショから、コード・銘柄名・見出しを下書きします</p></div>` : aiHint}
      <div class="g2">${fld('code', 'コード', 'inputmode="text" autocapitalize="characters" maxlength="5" placeholder="5801" autocomplete="off"', '<p class="look" id="lookHint"></p>')}${fld('name', '銘柄名', 'placeholder="古河電" autocomplete="off"')}</div>
      <fieldset class="fld"><legend>印</legend><div class="marks">
        ${[['', '印なし', ''], ['strong', '強', IC.flame], ['weak', '弱', IC.skull]].map(([val, l, ic]) => `<label><input type="radio" name="mark" value="${val}" ${mk === val ? 'checked' : ''}><span>${ic}${l}</span></label>`).join('')}
      </div></fieldset>
      ${area('headline', '見出し', 2, '半導体材料で韓国LG化学を提訴、1.04%高')}
      ${area('material', '材料と反応', 3, '何が伝わり、株価がどう動いたか')}
      ${aiReady() ? `<div class="ai-box"><button type="button" class="btn-ai" data-act="ai-draft" data-testid="ai-draft">${IC.spark}AIで下書き</button><p class="hint">見出しと材料から、テーマ・一言・素直に受け取れない点・印を提案します（空欄だけ埋めます）</p></div>` : ''}
      <div class="g2">${fld('theme', 'テーマ', 'list="themes" placeholder="上方修正" autocomplete="off"')}${fld('takeaway', '一言（→ ※）', 'placeholder="※業績材料ではない" autocomplete="off"')}</div>
      ${area('caveat', '※ 素直に受け取れない点', 3, '過熱感、材料の小ささ、未確認の点など')}
      <div class="g2">${fld('srcLabel', '出所の名前', 'placeholder="日経・株探・適時開示"')}${fld('srcUrl', '出所のURL', 'inputmode="url" placeholder="https://"')}</div>
      <h3 class="sub-h">株価と指標${aiReady() ? '（自動取得できないときだけ）' : ''}</h3>
      <div class="g3">${fld('close', '終値', 'inputmode="decimal"')}${fld('change', '前日比（円）', 'inputmode="decimal"')}${fld('changePct', '前日比（%）', 'inputmode="decimal"')}</div>
      <div class="g3">${fld('perA', 'PER 実績', 'inputmode="decimal"')}${fld('perF', 'PER 予想', 'inputmode="decimal"')}${fld('pbr', 'PBR', 'inputmode="decimal"')}</div>
      <div class="g3">${fld('roe', 'ROE（%）', 'inputmode="decimal"')}${fld('mcap', '時価総額', 'placeholder="1.33兆円"')}${fld('volume', '出来高', 'placeholder="32,161千株"')}</div>
      <details class="csv" ${focusCsv ? 'open' : ''}><summary>日足データ（CSVを貼り付け）</summary>
        <textarea id="f-ohlc" rows="5" style="width:100%;border:1px solid var(--line);background:var(--head-bg);border-radius:10px;padding:10px 12px;font-size:14px;font-family:var(--f-num);color:var(--ink)" placeholder="日付,始値,高値,安値,終値,出来高&#10;2026/11/17,573,573,573,573,4200&#10;2026/11/18,673,673,673,673,11200">${esc(e && e.ohlc ? ohlcToText(e.ohlc) : '')}</textarea>
        <p class="hint" id="ohlcInfo">株探の時系列などをコピーして貼れます。タブ区切りも読めます。</p></details>
      ${e ? '<button type="button" class="btn-danger" data-act="del">この銘柄を消す</button>' : ''}
    </form></div>`);
  s.dataset.editId = e ? e.id : '';
  s.dataset.edDate = date;
  const form = $('#ef', s);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); saveEditor(); });
  $('#f-ohlc', s).addEventListener('input', (ev) => { const n = parseOHLC(ev.target.value).length; $('#ohlcInfo', s).textContent = n ? `${n}本の日足を読み取りました` : '株探の時系列などをコピーして貼れます。タブ区切りも読めます。'; });
  const shot = $('#f-shot', s);
  if (shot) shot.addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) aiFromImage(f, s); ev.target.value = ''; });
  $('#f-code', s).addEventListener('input', () => lookupCode(s));
  if (e && isCode(e.code)) lookupCode(s, true);
  if (focusCsv) setTimeout(() => { const t = $('#f-ohlc', s); t.scrollIntoView({ block: 'center' }); t.focus(); }, 250);
  else if (!e && window.matchMedia('(min-width:900px)').matches) setTimeout(() => $('#f-code', s).focus(), 60);
}
let lookT = 0, lookSeq = 0;
function lookupCode(s, quiet) {
  clearTimeout(lookT);
  const hint = $('#lookHint', s);
  const code = toCode($('#f-code', s).value);
  if (!isCode(code)) { hint.textContent = ''; return; }
  if (!S.user || LOCAL_ONLY) { hint.textContent = ''; return; }
  const seq = ++lookSeq;
  lookT = setTimeout(async () => {
    if (!quiet) hint.textContent = '銘柄を確認しています…';
    const q = await Quotes.fetch(code, s.dataset.edDate);
    if (seq !== lookSeq || !s.isConnected) return;
    if (!q) { hint.textContent = '株価を取得できませんでした'; return; }
    const nameEl = $('#f-name', s);
    if (q.name && !nameEl.value.trim()) nameEl.value = q.name;
    hint.textContent = q.close !== null
      ? `${q.name || code}・${nf(q.close, decOf(q.close))}円${q.changePct !== null ? `（${signed(q.changePct, 2)}%）` : ''}・${SOURCE_LABEL[q.source] || ''}`
      : (q.name ? `${q.name}・${q.note || '株価はまだありません'}` : (q.note || '見つかりませんでした'));
  }, quiet ? 0 : 350);
}
const toCode = (v) => String(v || '').trim().toUpperCase().replace(/[０-９Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
function readForm(s) {
  const o = {}; FIELDS.forEach((k) => { const el = $('#f-' + k, s); o[k] = el ? el.value.trim() : ''; });
  o.mark = ($('input[name="mark"]:checked', s) || {}).value || '';
  o.code = toCode(o.code);
  return o;
}
function setField(s, key, val) {
  const el = $('#f-' + key, s); if (!el || val === null || val === undefined || val === '') return false;
  el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
}
function saveEditor() {
  const s = openScrim; if (!s) return;
  const id = s.dataset.editId, f = readForm(s);
  if (!f.code && !f.name) { toast('コードか銘柄名を入れてください'); $('#f-code', s).focus(); return; }
  if (f.code && !isCode(f.code)) { toast('コードは4桁（例: 5801、285A）で入れてください'); $('#f-code', s).focus(); return; }
  if (f.srcUrl && !/^https?:\/\//i.test(f.srcUrl)) { toast('出所のURLは https:// から入れてください'); $('#f-srcUrl', s).focus(); return; }
  ['close', 'change', 'changePct'].forEach((key) => { f[key] = f[key].replace(/[,，円%％]/g, '').replace(/^[−▲]/, '-').replace(/^＋/, '+'); f[key] = isNum(f[key]) ? Number(f[key]) : ''; });
  if (isNum(f.close) && isNum(f.changePct) && !isNum(f.change)) f.change = calcChange(f.close, f.changePct);
  if (isNum(f.close) && isNum(f.change) && !isNum(f.changePct)) { const prev = f.close - f.change; if (prev > 0) f.changePct = Math.round(f.change / prev * 10000) / 100; }
  const bars = parseOHLC($('#f-ohlc', s).value);
  const prev = id ? alive(id) : null;
  const date = s.dataset.edDate;
  const base = prev || { ...blankEntry(), id: `${date.replace(/-/g, '')}-${(f.code || 'X').replace(/[^0-9A-Za-z]/g, '')}-${uid4()}`, date, order: Math.max(0, ...Store.dayEntries(date).map((x) => x.order || 0)) + 1, createdAt: 0 };
  const e = Object.assign({}, base, f);
  e.ohlc = bars.length ? encodeOHLC(bars) : '';
  if (!isNum(e.close) && bars.length) { const b = bars[bars.length - 1]; e.close = b[4]; if (bars.length > 1) { e.change = Math.round((b[4] - bars[bars.length - 2][4]) * 10) / 10; e.changePct = Math.round(e.change / bars[bars.length - 2][4] * 10000) / 100; } }
  e.sample = false;
  Store.putEntry(e);
  closeScrim(); blip('up');
  toast(prev ? '保存しました' : `${e.name || e.code} を追加しました`);
  if (prev) rerenderMain();
  else { S.tab = S.tab === 'tsuyoyowa' && !e.mark ? 'wadai' : (TABS[S.tab].kind === 'note' ? 'wadai' : S.tab); S.filter = 'all'; S.q = ''; S.date = date; $('#main').dataset.key = ''; openDetail(e.id); }
}
async function deleteEntry(id) {
  const e = alive(id); if (!e) return;
  const ok = await confirmBox(`<b>${esc(e.name || e.code)}（${esc(e.code)}）</b>を消しますか？<br><span class="muted">メモと株価データも消えます。</span>`, '消す', true);
  if (!ok) return;
  const i = S.nav.indexOf(id);
  Store.delEntry(id); blip('del'); closeScrim();
  S.nav = S.nav.filter((x) => x !== id);
  toast('消しました');
  if (S.detailId === id) {
    const nxt = S.nav[Math.min(i, S.nav.length - 1)];
    S.detailId = null;
    if (nxt) navigate('d-' + nxt, true); else { S.pushed = false; navigate(S.tab, true); rerenderMain(); }
  } else rerenderMain();
}

/* ----- menu ----- */
function openMenu() {
  const syncText = !S.user ? 'この端末だけに保存（ログインすると同期）' : { sync: '同期済み：同じアカウントの端末で共有', busy: '同期中…', pending: '送信待ちがあります', offline: 'サーバーに届きません。この端末には保存しています' }[S.sync] || '';
  const sw = (id, on, label, sub) => `<div class="menu-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button class="switch" role="switch" aria-checked="${on}" data-sw="${id}" aria-label="${label}"></button></div>`;
  const acct = LOCAL_ONLY ? '<div class="menu-row"><span>この版は端末保存のみ<small>株価の自動取得・AI・同期はサーバー版で使えます</small></span></div>'
    : S.user ? `<div class="menu-row"><span>ログイン中<small data-testid="user-email">${esc(S.user.email)}</small></span><button class="btn-ghost" data-act="logout" data-testid="logout">ログアウト</button></div>`
    : '<div class="menu-row"><span>ログインしていません<small>株価の自動取得・AI・同期が使えます</small></span><button class="btn-gold" data-act="login">Googleでログイン</button></div>';
  const s = showScrim(`<div class="panel" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="panel-head"><span style="width:52px"></span><h2 id="mTitle">設定</h2><button class="link" data-act="close">閉じる</button></div>
    <div class="panel-body">
      ${acct}
      <div class="menu-row"><span>保存先<small>${syncText}</small></span><span class="sync ${S.user && S.sync === 'sync' ? 'on' : ''}"></span></div>
      <div class="menu-row"><span>文字サイズ</span><div class="fontctl" style="display:flex"><button data-act="fdn" aria-label="文字を小さく">A−</button><span id="mPct">${prefs.scale}%</span><button data-act="fup" aria-label="文字を大きく">A+</button></div></div>
      ${sw('sound', prefs.sound, '効果音', '操作したときに小さく鳴らす')}
      ${sw('mascot', prefs.mascot, 'こばんを表示', '画面の下を歩く招き猫。タップで話します')}
      <div class="menu-row"><span>バックアップ<small>全データをJSONでコピー／貼り付けで読み込み</small></span><button class="btn-ghost" data-act="export">コピー</button><button class="btn-ghost" data-act="import">読み込む</button></div>
      <p class="hint">株価・指標：J-Quants API（JPX総研）。投資助言ではありません。</p>
    </div></div>`);
  s.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sw]');
    if (b) { const key = b.dataset.sw; prefs[key] = !prefs[key]; savePrefs(); b.setAttribute('aria-checked', String(prefs[key])); if (key === 'sound') { renderHeader(); blip('up'); } if (key === 'mascot') setupCat(); }
  });
}
async function exportData() {
  const txt = JSON.stringify({ v: 2, entries: Store.live(), notes: [...Store.notes.values()] });
  try { await navigator.clipboard.writeText(txt); toast('バックアップをコピーしました'); }
  catch (e) {
    showScrim(`<div class="panel"><div class="panel-head"><span style="width:52px"></span><h2>バックアップ</h2><button class="link" data-act="close">閉じる</button></div><div class="panel-body"><p class="hint">全文を選んでコピーしてください。</p><textarea readonly rows="10" style="width:100%;font-size:12px" id="expTa">${esc(txt)}</textarea></div></div>`);
    const ta = $('#expTa'); ta.focus(); ta.select();
  }
}
function importData() {
  const s = showScrim(`<div class="panel" role="dialog" aria-modal="true"><div class="panel-head"><button class="link" data-act="close">閉じる</button><h2>バックアップを読み込む</h2><button class="btn-gold sm" id="doImp">読み込む</button></div>
    <div class="panel-body"><label class="fld"><span>コピーしたJSONを貼り付け</span><textarea id="impTa" rows="10" style="font-size:12px"></textarea></label><p class="hint">同じ銘柄は上書きされます。</p></div></div>`);
  $('#doImp', s).addEventListener('click', () => {
    try {
      const d = JSON.parse($('#impTa', s).value);
      if (!d || !Array.isArray(d.entries)) throw new Error('format');
      d.entries.forEach((e) => { if (e && e.id && e.date) Store.putEntry({ ...blankEntry(), ...e, deletedAt: null }); });
      (d.notes || []).forEach((n) => { if (n && n.date) Store.putNote({ ...n }); });
      closeScrim(); rerenderMain(); toast(`${d.entries.length}件を読み込みました`);
    } catch (e) { toast('読み込めませんでした。コピーした内容を確かめてください'); }
  });
}

/* ================= AI（Workers AI） ================= */
function aiError(r) {
  if (r && r.status === 429) toast('今日のAIの利用回数を使い切りました');
  else if (r && r.status === 401) { loggedOut(); toast('もう一度ログインしてください'); }
  else if (r && r.status === 400) toast('送った内容を読み取れませんでした');
  else toast('AIの呼び出しに失敗しました。少しして試してください');
}
async function aiDraft(s, btn) {
  const f = readForm(s);
  if (!f.headline && !f.material) { toast('見出しか材料を先に入れてください'); $('#f-headline', s).focus(); return; }
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = IC.spark + '考え中…';
  const q = isCode(f.code) ? Quotes.get({ code: f.code, date: s.dataset.edDate }) : null;
  try {
    const r = await req('POST', '/api/ai/draft', {
      code: f.code, name: f.name, headline: f.headline, material: f.material,
      close: q && q.close !== null ? q.close : isNum(f.close) ? Number(f.close) : null,
      changePct: q && q.changePct !== null ? q.changePct : isNum(f.changePct) ? Number(f.changePct) : null,
    });
    if (!r.ok || !r.json) return aiError(r);
    const d = r.json.draft;
    let n = 0;
    for (const key of ['theme', 'takeaway', 'caveat', 'material']) if (!f[key] && d[key]) n += setField(s, key, d[key]) ? 1 : 0;
    if (!f.mark && (d.mark === 'strong' || d.mark === 'weak')) { const el = $(`input[name="mark"][value="${d.mark}"]`, s); if (el) { el.checked = true; n++; } }
    toast(n ? `${n}か所を下書きしました。内容を確かめてください` : '空欄がないため、変更しませんでした');
  } catch (e) { aiError(e); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}
async function aiFromImage(file, s) {
  const btn = $('[data-act="ai-shot"]', s), hint = $('#aiHint', s);
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = IC.cam + '読み取り中…'; hint.textContent = '画像を読んでいます。少し時間がかかります';
  try {
    const image = await shrinkImage(file);
    const r = await req('POST', '/api/ai/read', { image });
    if (!r.ok || !r.json) { aiError(r); hint.textContent = '読み取れませんでした'; return; }
    const d = r.json.read;
    let n = 0;
    for (const key of ['code', 'name', 'headline', 'material']) if (d[key] && !($('#f-' + key, s) || {}).value) n += setField(s, key, d[key]) ? 1 : 0;
    hint.textContent = n ? `${n}項目を読み取りました。画面と見比べてください` : '読み取れる項目が見つかりませんでした';
  } catch (e) { aiError(e); hint.textContent = '読み取れませんでした'; }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}

/* ================= mascot（こばん） ================= */
const CAT_BASE = [
  '..kk........kk....',
  '..kpk......kpk....',
  '.kppkkkkkkkkppk...',
  '.kwwwwwwwwwwwwk...',
  'kwwwwwwwwwwwwwwk..',
  'kwwkkwwwwwwkkwwk..',
  'kwpwwwwkkwwwwpwk..',
  '.kwwwwkwwkwwwwk...',
  '..kkrrrrrrrrkk....',
  '.kwwwwwyywwwwwk...',
  'kwwswwwyywwwswwk..',
  'kwwswwwwwwwwswwk..',
  'kwwswwwwwwwwswwk..',
  '.kwwwwwwwwwwwwk...',
];
const CAT_A = [...CAT_BASE, '..kwwk....kkkk....', '..kkkk............'];
const CAT_B = [...CAT_BASE, '..kkkk....kwwk....', '..........kkkk....'];
const TAIL_A = [[9, 15], [8, 16], [7, 16]], TAIL_B = [[10, 16], [9, 16], [9, 17]];
const CAT_COL = { k: '#3B2F26', w: '#FFFAF0', s: '#EADFC9', p: '#F0A39B', r: '#C0392B', y: '#E3B23C' };
function catSVG(rows, tail, cls) {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (CAT_COL[ch]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${CAT_COL[ch]}"/>`; }));
  tail.forEach(([y, x]) => { r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${CAT_COL.k}"/>`; });
  return `<svg class="${cls}" viewBox="0 0 18 16" aria-hidden="true">${r}</svg>`;
}
const Cat = { x: 24, dir: 1, pause: 0, raf: 0 };
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setupCat() {
  const el = $('#cat');
  el.hidden = !prefs.mascot; $('#bubble').hidden = true;
  if (!el.innerHTML) el.innerHTML = `<span class="flip">${catSVG(CAT_A, TAIL_A, 'f1')}${catSVG(CAT_B, TAIL_B, 'f2')}</span>`;
  cancelAnimationFrame(Cat.raf);
  if (!prefs.mascot) return;
  placeCat();
  if (reduced) { el.classList.remove('walk'); el.style.transform = `translateX(${Cat.x}px)`; return; }
  const tick = () => {
    if (!prefs.mascot) return;
    const max = window.innerWidth - 70;
    if (Cat.pause > 0) { Cat.pause--; el.classList.remove('walk'); }
    else {
      el.classList.add('walk');
      Cat.x += Cat.dir * 0.45;
      if (Cat.x > max) { Cat.x = max; Cat.dir = -1; } if (Cat.x < 8) { Cat.x = 8; Cat.dir = 1; }
      if (Math.random() < 0.003) Cat.pause = 90 + Math.random() * 180;
    }
    el.classList.toggle('left', Cat.dir < 0);
    el.style.transform = `translateX(${Cat.x}px)`;
    if (!$('#bubble').hidden) placeBubble();
    Cat.raf = requestAnimationFrame(tick);
  };
  Cat.raf = requestAnimationFrame(tick);
}
function placeCat() {
  const el = $('#cat'); if (!el) return;
  const dock = $('.dock');
  el.style.bottom = dock ? (dock.offsetHeight - 4) + 'px' : 'calc(6px + env(safe-area-inset-bottom))';
}
function placeBubble() {
  const b = $('#bubble'), r = $('#cat').getBoundingClientRect();
  const w = b.offsetWidth;
  b.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + 27 - w / 2)) + 'px';
  b.style.top = (r.top - b.offsetHeight - 8) + 'px';
}
let bubbleT = null;
const TIPS = ['ストップ高が続いた後は、寄り付きの気配を見てからにゃ', '目標株価の引き上げは1社の見方にゃ', '出来高が細い銘柄は値が飛びやすいにゃ', '業績に関係ない材料は、数日で忘れられがちにゃ', '下げた理由が業種全体か個別か、分けて考えるにゃ'];
function catTalk() {
  let msg;
  const e = S.detailId && alive(S.detailId);
  if (e) msg = `${mkt(e).name}：${e.caveat || e.takeaway || 'まだメモがないにゃ。素直に受け取れない点を書いておくにゃ'}`;
  else {
    const c = counts(S.date);
    msg = c.all && Math.random() < 0.5 ? `${fmtMD(S.date)}の話題株は${c.all}件。ツヨ${c.strong}・ヨワ${c.weak}だにゃ` : TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  const b = $('#bubble'); b.textContent = msg; b.hidden = false; placeBubble(); blip('tap');
  Cat.pause = Math.max(Cat.pause, 200);
  clearTimeout(bubbleT); bubbleT = setTimeout(() => { b.hidden = true; }, 6000);
}

/* ================= account ================= */
function login() {
  const next = '/' + (location.hash || '');
  location.href = `/auth/login?next=${encodeURIComponent(next)}`;
}
async function logout() {
  try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* noop */ }
  S.user = null; closeScrim(); setSync('local'); renderHeader(); rerenderMain(); toast('ログアウトしました');
}
function loggedOut() { if (!S.user) return; S.user = null; setSync('local'); renderHeader(); rerenderMain(); }
async function checkAuth() {
  if (LOCAL_ONLY) return;
  try {
    const r = await req('GET', '/api/me');
    if (r.ok && r.json && r.json.user) {
      const u = r.json.user;
      const prevUid = LS.get(K.uid, null);
      if (prevUid && prevUid !== u.id) Store.reset(); // 別のアカウントで入った：前の人のデータを混ぜない
      if (prevUid !== u.id) { Store.cursor = 0; Store.persist(); }
      LS.set(K.uid, u.id);
      S.user = u;
    }
  } catch (e) { /* 401 やオフライン：端末保存で続ける */ }
  S.authChecked = true;
  setSync(S.user ? 'busy' : 'local');
  rerenderMain();
  if (S.user) Sync.run();
}

/* ================= events ================= */
document.addEventListener('click', (ev) => {
  const t = ev.target;
  const tab = t.closest('.tab');
  if (tab) { S.detailId = null; S.pushed = false; S.noteEditing = false; blip('tap'); navigate(tab.dataset.tab, true); rerenderMain(); return; }
  const open = t.closest('[data-open]'); if (open) { openDetail(open.dataset.open); return; }
  const fil = t.closest('[data-filter]'); if (fil) { S.filter = fil.dataset.filter; blip('tap'); renderList($('#main')); return; }
  const rg = t.closest('[data-range]'); if (rg) { prefs.range = Number(rg.dataset.range); savePrefs(); Chart.n = prefs.range; Chart.hover = -1; Chart.draw(); $$('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === prefs.range))); return; }
  const dt = t.closest('[data-date]'); if (dt) { S.date = dt.dataset.date; rerenderMain(); return; }
  const a = t.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'add') { blip('tap'); openEditor(null); }
  else if (act === 'close') closeScrim();
  else if (act === 'save') saveEditor();
  else if (act === 'back') backToList();
  else if (act === 'prev') step(-1);
  else if (act === 'next') step(1);
  else if (act === 'edit') openEditor(S.detailId);
  else if (act === 'edit-csv') openEditor(S.detailId, true);
  else if (act === 'del') deleteEntry(openScrim && openScrim.dataset.editId ? openScrim.dataset.editId : S.detailId);
  else if (act === 'cycle-mark') {
    const e = alive(S.detailId); if (!e) return;
    const nx = { '': 'strong', strong: 'weak', weak: '' }[e.mark || ''];
    Store.putEntry({ ...e, mark: nx }); blip(nx === 'strong' ? 'up' : nx === 'weak' ? 'down' : 'tap');
    rerenderMain();
  }
  else if (act === 'reset-filter') { S.filter = 'all'; S.q = ''; const q = $('#q'); if (q) q.value = ''; renderList($('#main')); }
  else if (act === 'clear-sample') clearSample();
  else if (act === 'note-toggle') { flushNote(); S.noteEditing = !S.noteEditing; $('#main').dataset.key = ''; renderNote($('#main')); }
  else if (act === 'ai-draft') aiDraft(openScrim, a);
  else if (act === 'ai-shot') $('#f-shot', openScrim).click();
  else if (act === 'fup' || act === 'fdn') { prefs.scale = Math.max(80, Math.min(160, prefs.scale + (act === 'fup' ? 10 : -10))); savePrefs(); applyScale(); const m = $('#mPct'); if (m) m.textContent = prefs.scale + '%'; }
  else if (act === 'export') exportData();
  else if (act === 'import') importData();
  else if (act === 'login') login();
  else if (act === 'logout') logout();
  else if (act === 'menu') openMenu();
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') { S.q = ev.target.value; renderList($('#main')); }
  if (ev.target.id === 'noteEdit' || ev.target.id === 'idxEdit') { const s = $('#savedNote'); if (s) s.textContent = '保存中…'; scheduleNoteSave(); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { if (openScrim) closeScrim(); else if (S.detailId) backToList(); return; }
  if (openScrim || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
  if (S.detailId && ev.key === 'ArrowRight') step(1);
  if (S.detailId && ev.key === 'ArrowLeft') step(-1);
});
async function clearSample() {
  const ok = await confirmBox('サンプルの銘柄とメモを消しますか？<br><span class="muted">自分で追加・編集したものは残ります。</span>', '消す', true);
  if (!ok) return;
  Store.live().filter((e) => e.sample).forEach((e) => Store.delEntry(e.id));
  const n = Store.notes.get(SEED_DATE);
  if (n && n.sample) Store.putNote({ date: SEED_DATE, general: '', us: '', jp: '', indices: [], sample: false });
  toast('サンプルを消しました'); rerenderMain();
}
const goDay = (d) => { S.date = d; S.detailId = null; S.noteEditing = false; blip('tap'); navigate(S.tab, true); rerenderMain(); };
$('#prevDay').addEventListener('click', () => goDay(shiftBiz(S.date, -1)));
$('#nextDay').addEventListener('click', () => { const n = shiftBiz(S.date, 1); if (n <= todayISO()) goDay(n); });
$('#todayBtn').addEventListener('click', () => goDay(todayISO()));
$('#fontUp').addEventListener('click', () => { prefs.scale = Math.min(160, prefs.scale + 10); savePrefs(); applyScale(); });
$('#fontDn').addEventListener('click', () => { prefs.scale = Math.max(80, prefs.scale - 10); savePrefs(); applyScale(); });
$('#soundBtn').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); renderHeader(); blip('up'); });
$('#modeBtn').addEventListener('click', () => { prefs.mode = effectiveMode() === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); blip('tap'); });
$('#moreBtn').addEventListener('click', openMenu);
$('#cat').addEventListener('click', catTalk);
window.addEventListener('resize', () => { placeCat(); if (Cat.x > window.innerWidth - 70) Cat.x = Math.max(8, window.innerWidth - 70); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.soon(50); });
window.addEventListener('online', () => Sync.soon(50));
setInterval(() => { if (document.visibilityState === 'visible') Sync.soon(0); }, 60_000);

function tickClock() { const d = new Date(Date.now() + JST); $('#clock').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }

/* ================= boot ================= */
Store.load();
if (!Store.dayEntries(S.date).length && Store.dayEntries(SEED_DATE).length && Store.live().every((e) => e.sample)) S.date = SEED_DATE;
const authError = new URLSearchParams(location.search).get('auth_error');
if (authError) history.replaceState(null, '', location.pathname + location.hash);
applyScale(); applyTheme(); tickClock(); setInterval(tickClock, 10_000);
setSync('local');
route(location.hash.slice(1) || 'wadai');
setupCat();
if (authError) toast(authError === 'forbidden' ? 'このアカウントではログインできません' : 'ログインできませんでした。もう一度お試しください');
checkAuth();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
