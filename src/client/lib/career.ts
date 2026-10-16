import { REGIONS, itemsFor, withItem, DEFAULT_FIT, type Region } from "../../shared/outfit";
import { getFit } from "./identity";
import { grantXp } from "./progress";

/**
 * Kariyer: Dünya Turu. Gerçek World Chase Tag® turnuva yapısından esinlenir:
 * grup aşaması (herkes herkesle) → ilk iki eleme turuna → final. Üç basamak:
 * Bölge Elemesi → Türkiye Şampiyonası → Dünya Şampiyonası (Paris).
 * Turnuva sonunda WCT'deki gibi en iyi kaçana "Kaçış Dükü/Düşesi", en iyi kovalayana "Uçuş Şövalyesi" verilir.
 * Tüm takımlar ve sporcular kurgusaldır. Durum bu cihazda saklanır.
 */

export interface Athlete {
  name: string;
  fit: string;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  /** 0 (çaylak) … 1 (dünya elit) — botların ustalığı */
  power: number;
  star: string;
  /** maç öncesi söz */
  quote: string;
  athletes: Athlete[];
}

export interface Fixture {
  a: string;
  b: string;
  /** a ve b'nin kaçış (puan) sayısı; oynanmadıysa null */
  sa: number | null;
  sb: number | null;
  /** beraberlikte sudden death kazananı */
  sd?: string;
  stage: "group" | "semi" | "final";
  group?: "A" | "B";
  /** grup turu (1..3) */
  round?: number;
}

export interface Tournament {
  tier: 0 | 1 | 2;
  groups: { A: string[]; B?: string[] };
  fixtures: Fixture[];
  /** oyuncunun bu turnuvadaki istatistikleri */
  me: { evAtt: number; ev: number; chAtt: number; tag: number };
  done: boolean;
  champion?: string;
  awards?: Award[];
}

export interface Award {
  kind: "cup" | "dodge" | "flight" | "runner";
  tier: 0 | 1 | 2;
  season: number;
  text: string;
}

export interface CareerData {
  v: 1;
  teamName: string;
  season: number;
  /** sıradaki/oynanan turnuva basamağı */
  tier: 0 | 1 | 2;
  /** takım arkadaşlarının gelişimi (0..1) */
  form: number;
  mates: Athlete[];
  cur: Tournament | null;
  trophies: Award[];
  /** rakiplere karşı galibiyet-mağlubiyet */
  h2h: Record<string, [number, number]>;
  /** son haberler */
  news: string[];
}

export const TIERS = [
  { name: "Bölge Elemesi", acc: "Bölge Elemesi'ni", place: "İstanbul", venue: "depo", chases: 8, groups: 1, blurb: "Grubunu ilk ikide bitir, finali kazan, Türkiye'ye git." },
  { name: "Türkiye Şampiyonası", acc: "Türkiye Şampiyonası'nı", place: "Ankara", venue: "cati", chases: 8, groups: 2, blurb: "İki grup, yarı final, final. Şampiyon Paris'e gider." },
  { name: "Dünya Şampiyonası", acc: "Dünya Şampiyonası'nı", place: "Paris", venue: "arena", chases: 10, groups: 2, blurb: "Dünyanın en iyi takımları. Kupa bir kez kazanılır, efsane olur." },
] as const;

const PLAYER = "me";

// ---------- Kurgusal takımlar ----------
const F = (n: string) => ({ n, s: "f" as const });
const M = (n: string) => ({ n, s: "m" as const });
const T = (id: string, name: string, city: string, power: number, ath: { n: string; s: "f" | "m" }[], quote: string) => ({ id, name, city, power, ath, quote });

const POOL = [
  // Bölge
  [
    T("kadikoy", "Kadıköy Kedileri", "İstanbul", 0.12, [F("Ezgi"), M("Barış"), M("Onur")], "Duvarın arkasına saklanırız, sonra pat diye kayboluruz."),
    T("uskudar", "Üsküdar Rüzgârı", "İstanbul", 0.22, [M("Emre"), F("Dila"), M("Kerem")], "Bizi yakalamak için önce görmen lazım."),
    T("galata", "Galata Gölgeleri", "İstanbul", 0.34, [F("Selin"), M("Taylan"), F("Nehir")], "Geçen yıl bu grupta kimse bize dokunamadı."),
    T("besiktas", "Beşiktaş Akrobatları", "İstanbul", 0.28, [M("Umut"), M("Can"), F("Defne")], "Takla atmadan yakalanmayız."),
  ],
  // Türkiye
  [
    T("ankara", "Ankara Atmacaları", "Ankara", 0.46, [M("Mert"), F("Ece"), M("Alp")], "Başkentte kural basit: kaçamazsan kazanamazsın."),
    T("izmir", "İzmir Dalgası", "İzmir", 0.5, [F("Deniz"), M("Kaan"), F("Lara")], "Biz kıyıya vurmayız, kıyıyı biz yaparız."),
    T("bursa", "Bursa Ayıları", "Bursa", 0.4, [M("Oğuz"), M("Berk"), F("Su")], "Yavaşız sanırlar. Sonra dalışı yerler."),
    T("trabzon", "Karadeniz Fırtınası", "Trabzon", 0.52, [M("Yiğit"), F("Melis"), M("Arda")], "Fırtına yön değiştirir, biz de."),
    T("eskisehir", "Eskişehir Roketleri", "Eskişehir", 0.44, [F("İpek"), M("Efe"), M("Toprak")], "Üç saniyede bir duvardan bir duvara."),
    T("antalya", "Antalya Güneşi", "Antalya", 0.42, [F("Ada"), F("Zeynep"), M("Rüzgar")], "Sıcağı sevmeyen erken yorulur."),
  ],
  // Dünya
  [
    T("seine", "Seine Hayaletleri", "Paris", 0.8, [M("Hugo"), F("Léa"), M("Yanis")], "Evimizdeyiz. Burada kaybetmeyiz."),
    T("brooklyn", "Brooklyn Duvarları", "New York", 0.86, [M("Marcus"), F("Jade"), M("Tyler")], "Dünya şampiyonuyuz. Gelin alın."),
    T("london", "Londra Tilkileri", "Londra", 0.76, [F("Amelia"), M("Oscar"), M("Kai")], "Tilki köşeye sıkışmaz, köşeyi kendine çevirir."),
    T("tokyo", "Tokyo Kirpileri", "Tokyo", 0.72, [M("Haruto"), F("Yui"), M("Ren")], "Küçük adımlar, büyük kaçışlar."),
    T("berlin", "Berlin Betonu", "Berlin", 0.7, [M("Lukas"), M("Jonas"), F("Mia")], "Duvar gibi dururuz, rüzgâr gibi kaçarız."),
    T("rio", "Rio Akrobatları", "Rio", 0.78, [F("Bianca"), M("Thiago"), M("Davi")], "Biz oynarız, siz izlersiniz."),
    T("seoul", "Seul Şimşekleri", "Seul", 0.74, [M("Jun"), F("Hana"), M("Min")], "Göz açıp kapayıncaya kadar."),
  ],
];

const MATE_NAMES = [F("Beren"), M("Kuzey"), F("Asya"), M("Doruk"), F("Elif"), M("Aras")];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** İsim ve cinsiyetten kararlı bir kombin üret. */
function makeFit(name: string, sex: "f" | "m"): string {
  const r = rng(hash(name));
  let fit = withItem(DEFAULT_FIT, "body", sex === "m" ? 1 : 0);
  for (const reg of REGIONS) {
    if (reg.id === "body") continue;
    const opts = itemsFor(reg.id as Region, sex).filter((o) => !o.it.lvl || o.it.lvl <= 3);
    if (!opts.length) continue;
    const o = opts[Math.floor(r() * opts.length)];
    fit = withItem(fit, reg.id as Region, o.i);
  }
  return fit;
}

const TEAMS: Record<string, Team> = {};
POOL.flat().forEach((t) => {
  TEAMS[t.id] = {
    id: t.id,
    name: t.name,
    city: t.city,
    power: t.power,
    star: t.ath[0].n,
    quote: t.quote,
    athletes: t.ath.map((a) => ({ name: a.n, fit: makeFit(t.id + a.n, a.s) })),
  };
});

export function team(id: string, data?: CareerData | null): Team {
  if (id === PLAYER) {
    const d = data ?? load();
    return {
      id: PLAYER,
      name: d?.teamName || "Takımın",
      city: "",
      power: playerPower(d),
      star: "",
      quote: "",
      athletes: d?.mates ?? [],
    };
  }
  return TEAMS[id];
}

function playerPower(d: CareerData | null) {
  // Simülasyonda (yalnızca diğer maçlar için kullanılmaz) oyuncunun takımı: basamağa göre orta seviye
  return d ? [0.3, 0.5, 0.75][d.tier] : 0.3;
}

// ---------- Kayıt ----------
const KEY = "evade:career";

export function load(): CareerData | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null") as CareerData | null;
    if (d && d.v === 1) return d;
  } catch {}
  return null;
}

function save(d: CareerData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
}

export function resetCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function startCareer(teamName: string): CareerData {
  const r = rng(Date.now());
  const picks = [...MATE_NAMES].sort(() => r() - 0.5).slice(0, 2);
  const d: CareerData = {
    v: 1,
    teamName: teamName.trim().slice(0, 22) || "Takımın",
    season: 1,
    tier: 0,
    form: 0,
    mates: picks.map((a) => ({ name: a.n, fit: makeFit("mate" + a.n, a.s) })),
    cur: null,
    trophies: [],
    h2h: {},
    news: ["Takımın kuruldu. İlk durak: İstanbul Bölge Elemesi."],
  };
  d.cur = newTournament(d);
  save(d);
  return d;
}

function newTournament(d: CareerData): Tournament {
  const tier = d.tier;
  const r = rng(Date.now() + tier * 77);
  const pool = [...POOL[tier].map((t) => t.id)].sort(() => r() - 0.5);
  // Bir önceki basamağın güçlü rakibi bazen yükselip karşına çıkar (rekabet sürer)
  if (tier === 1 && r() < 0.6) pool.splice(5, 0, "galata");
  let A: string[];
  let B: string[] | undefined;
  if (TIERS[tier].groups === 1) {
    A = [PLAYER, ...pool.slice(0, 3)];
  } else {
    A = [PLAYER, ...pool.slice(0, 3)];
    B = pool.slice(3, 7);
    // eksikse bir alt basamağın güçlü takımlarından tamamla (aynı takım iki kez olmasın)
    const used = new Set([...A, ...B]);
    const fill = POOL[Math.max(0, tier - 1)].map((x) => x.id).sort((u, v) => power(v) - power(u));
    for (const id of fill) if (B.length < 4 && !used.has(id)) B.push(id);
  }
  const fixtures: Fixture[] = [];
  // Dörtlü grupta 3 tur; her turda iki maç. Oyuncunun rakipleri zayıftan güçlüye.
  const rounds = (g: string[], name: "A" | "B") => {
    const [p, x, y, z] = g;
    const pairs: [string, string, number][] = [
      [p, x, 1], [y, z, 1],
      [p, y, 2], [x, z, 2],
      [p, z, 3], [x, y, 3],
    ];
    for (const [a_, b_, round] of pairs) fixtures.push({ a: a_, b: b_, sa: null, sb: null, stage: "group", group: name, round });
  };
  const [p0, ...restA] = A;
  rounds([p0, ...restA.sort((u, v) => power(u) - power(v))], "A");
  if (B) rounds(B, "B");
  return { tier, groups: { A, B }, fixtures, me: { evAtt: 0, ev: 0, chAtt: 0, tag: 0 }, done: false };
}

const power = (id: string) => (id === PLAYER ? 0.5 : TEAMS[id]?.power ?? 0.5);
const other = (f: Fixture) => (f.a === PLAYER ? f.b : f.a);

// ---------- Tablo ----------
export interface Row {
  id: string;
  p: number;
  w: number;
  l: number;
  ev: number;
  ag: number;
  pts: number;
}

export function table(t: Tournament, g: "A" | "B"): Row[] {
  const ids = t.groups[g] ?? [];
  const rows = new Map<string, Row>(ids.map((id) => [id, { id, p: 0, w: 0, l: 0, ev: 0, ag: 0, pts: 0 }]));
  for (const f of t.fixtures) {
    if (f.stage !== "group" || f.group !== g || f.sa === null || f.sb === null) continue;
    const a = rows.get(f.a)!;
    const b = rows.get(f.b)!;
    a.p++;
    b.p++;
    a.ev += f.sa;
    a.ag += f.sb;
    b.ev += f.sb;
    b.ag += f.sa;
    const aw = winner(f) === f.a;
    (aw ? a : b).w++;
    (aw ? b : a).l++;
    (aw ? a : b).pts += 3;
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.ev - y.ag - (x.ev - x.ag) || y.ev - x.ev || power(y.id) - power(x.id));
}

export function winner(f: Fixture): string | null {
  if (f.sa === null || f.sb === null) return null;
  if (f.sa !== f.sb) return f.sa > f.sb ? f.a : f.b;
  return f.sd ?? f.a;
}

// ---------- Diğer maçların simülasyonu ----------
function simulate(f: Fixture, chases: number, r: () => number) {
  const pa = power(f.a);
  const pb = power(f.b);
  // WCT'de kaçış oranı ~%30; güç farkı oranı değiştirir
  const pA = Math.max(0.08, Math.min(0.62, 0.3 + (pa - pb) * 0.45));
  const pB = Math.max(0.08, Math.min(0.62, 0.3 + (pb - pa) * 0.45));
  let sa = 0;
  let sb = 0;
  // Kazanan kaçışçı sahada kalır; sırayla değil, kaçış serilerine göre
  let evA = r() < 0.5;
  for (let i = 0; i < chases; i++) {
    if (evA) {
      if (r() < pA) sa++;
      else evA = false;
    } else {
      if (r() < pB) sb++;
      else evA = true;
    }
  }
  f.sa = sa;
  f.sb = sb;
  if (sa === sb) f.sd = r() < 0.5 + (pa - pb) * 0.6 ? f.a : f.b;
}

/** Oyuncunun sıradaki maçı (yoksa null). */
export function nextMatch(d: CareerData): Fixture | null {
  const t = d.cur;
  if (!t || t.done) return null;
  return t.fixtures.find((f) => f.sa === null && (f.a === PLAYER || f.b === PLAYER)) ?? null;
}

/** Oyuncunun maçı oynanana kadar araya giren diğer maçları oyna; sonra eleme turlarını kur. */
function advance(d: CareerData) {
  const t = d.cur!;
  const r = rng(Date.now());
  const chases = TIERS[t.tier].chases;
  const news: string[] = [];
  // Oyuncunun son oynadığı maçın turu/aşaması kadar diğer maçları oyna
  const mine = t.fixtures.filter((x) => (x.a === PLAYER || x.b === PLAYER) && x.sa !== null);
  const last = mine[mine.length - 1];
  for (const f of t.fixtures) {
    if (f.sa !== null || f.a === PLAYER || f.b === PLAYER) continue;
    const due = f.stage === "group" ? last && last.stage === "group" && (f.round ?? 9) <= (last.round ?? 0) : last && last.stage === f.stage;
    if (!due) continue;
    simulate(f, chases, r);
    const w = winner(f)!;
    const l = w === f.a ? f.b : f.a;
    const ws = w === f.a ? f.sa! : f.sb!;
    const ls = w === f.a ? f.sb! : f.sa!;
    news.push(`${TEAMS[w].name} ${ws}–${ls} ${TEAMS[l].name}${f.sa === f.sb ? " (sudden death)" : ""}`);
  }
  const groupDone = t.fixtures.filter((f) => f.stage === "group").every((f) => f.sa !== null);
  const hasSemi = t.fixtures.some((f) => f.stage === "semi");
  const hasFinal = t.fixtures.some((f) => f.stage === "final");
  if (groupDone && !hasSemi && !hasFinal) {
    const A = table(t, "A");
    if (!t.groups.B) {
      t.fixtures.push({ a: A[0].id, b: A[1].id, sa: null, sb: null, stage: "final" });
      news.push(`Final: ${team(A[0].id, d).name} – ${team(A[1].id, d).name}`);
    } else {
      const B = table(t, "B");
      t.fixtures.push({ a: A[0].id, b: B[1].id, sa: null, sb: null, stage: "semi" });
      t.fixtures.push({ a: B[0].id, b: A[1].id, sa: null, sb: null, stage: "semi" });
      news.push(`Yarı finaller: ${team(A[0].id, d).name} – ${team(B[1].id, d).name}, ${team(B[0].id, d).name} – ${team(A[1].id, d).name}`);
    }
    if (!A.slice(0, 2).some((x) => x.id === PLAYER)) news.push("Gruptan çıkamadın. Turnuva senin için bitti.");
  }
  // yarı finaller oynandıysa final
  const semis = t.fixtures.filter((f) => f.stage === "semi");
  if (semis.length === 2 && semis.every((f) => f.sa !== null) && !t.fixtures.some((f) => f.stage === "final")) {
    t.fixtures.push({ a: winner(semis[0])!, b: winner(semis[1])!, sa: null, sb: null, stage: "final" });
    news.push(`Final: ${team(winner(semis[0])!, d).name} – ${team(winner(semis[1])!, d).name}`);
  }
  // oyuncu elendiyse kalan maçları simüle et
  const fin = t.fixtures.find((f) => f.stage === "final");
  const playerAlive = !!nextMatchRaw(t);
  if (!playerAlive) {
    for (const f of t.fixtures) if (f.sa === null && f.a !== PLAYER && f.b !== PLAYER) simulate(f, chases, r);
    const s2 = t.fixtures.filter((f) => f.stage === "semi");
    if (s2.length === 2 && !t.fixtures.some((f) => f.stage === "final")) {
      const ff: Fixture = { a: winner(s2[0])!, b: winner(s2[1])!, sa: null, sb: null, stage: "final" };
      t.fixtures.push(ff);
      if (ff.a !== PLAYER && ff.b !== PLAYER) simulate(ff, chases, r);
    }
    const f2 = t.fixtures.find((f) => f.stage === "final");
    if (f2 && f2.sa !== null) finish(d, winner(f2)!);
    else if (!f2 && groupDone) finish(d, table(t, "A")[0].id);
  } else if (fin && fin.sa !== null) finish(d, winner(fin)!);
  d.news = [...news.reverse(), ...d.news].slice(0, 8);
}

function nextMatchRaw(t: Tournament) {
  return t.fixtures.find((f) => f.sa === null && (f.a === PLAYER || f.b === PLAYER)) ?? null;
}

function finish(d: CareerData, champ: string) {
  const t = d.cur!;
  if (t.done) return;
  t.done = true;
  t.champion = champ;
  const awards: Award[] = [];
  const tierName = `${TIERS[t.tier].name} ${d.season}. sezon`;
  if (champ === PLAYER) {
    awards.push({ kind: "cup", tier: t.tier, season: d.season, text: `${TIERS[t.tier].name} şampiyonu` });
    d.news.unshift(`ŞAMPİYON! ${d.teamName}, ${TIERS[t.tier].acc} kazandı.`);
  } else {
    const fin = t.fixtures.find((f) => f.stage === "final");
    if (fin && (fin.a === PLAYER || fin.b === PLAYER)) awards.push({ kind: "runner", tier: t.tier, season: d.season, text: `${TIERS[t.tier].name} finalisti` });
    d.news.unshift(`${team(champ, d).name} ${TIERS[t.tier].acc} kazandı.`);
  }
  // Bireysel ödüller: WCT'de ortalama kaçış oranı ~%30. Turnuvanın en iyisi olmak için rakiplerin yıldızlarını geçmelisin.
  const me = t.me;
  const r = rng(Date.now() + 5);
  const bestOtherEv = 0.38 + t.tier * 0.06 + r() * 0.08;
  const bestOtherTag = 0.72 + t.tier * 0.05 + r() * 0.06;
  const sex = getFit()[0] === "1" ? "m" : "f";
  if (me.evAtt >= 3 && me.ev / me.evAtt > bestOtherEv)
    awards.push({ kind: "dodge", tier: t.tier, season: d.season, text: `${sex === "f" ? "Kaçış Düşesi" : "Kaçış Dükü"} · ${tierName}` });
  if (me.chAtt >= 3 && me.tag / me.chAtt > bestOtherTag) awards.push({ kind: "flight", tier: t.tier, season: d.season, text: `Uçuş Şövalyesi · ${tierName}` });
  t.awards = awards;
  d.trophies.push(...awards);
  // ödül XP'si
  let xp = 0;
  for (const a of awards) xp += a.kind === "cup" ? [250, 450, 900][a.tier] : a.kind === "runner" ? [100, 180, 350][a.tier] : 200;
  if (xp) grantXp(xp, "Kariyer");
}

/** Turnuva bitince: kazandıysan bir üst basamağa, yoksa aynı basamakta yeni turnuva. Paris sonrası yeni sezon. */
export function nextTournament(): CareerData | null {
  const d = load();
  if (!d || !d.cur?.done) return d;
  const won = d.cur.champion === PLAYER;
  if (won) {
    d.form = Math.min(1, d.form + 0.12);
    if (d.tier < 2) d.tier = (d.tier + 1) as 0 | 1 | 2;
    else {
      d.season++;
      d.tier = 0;
      d.news.unshift(`${d.season}. sezon başladı. Unvanını korumak için yine en baştan.`);
    }
  }
  d.cur = newTournament(d);
  save(d);
  return d;
}

/** Oyuncunun maç sonucu (a/b sırasına göre değil: benim ve rakibin skoru). */
export function recordCareerMatch(mine: number, theirs: number, sdWon: boolean | null, stats: Tournament["me"]) {
  const d = load();
  if (!d || !d.cur) return null;
  const f = nextMatch(d);
  if (!f) return d;
  const meA = f.a === PLAYER;
  f.sa = meA ? mine : theirs;
  f.sb = meA ? theirs : mine;
  if (mine === theirs) f.sd = sdWon ? PLAYER : other(f);
  const opp = other(f);
  const h = d.h2h[opp] ?? [0, 0];
  const won = winner(f) === PLAYER;
  if (won) h[0]++;
  else h[1]++;
  d.h2h[opp] = h;
  d.cur.me.evAtt += stats.evAtt;
  d.cur.me.ev += stats.ev;
  d.cur.me.chAtt += stats.chAtt;
  d.cur.me.tag += stats.tag;
  d.news.unshift(`${won ? "Kazandın" : "Kaybettin"}: ${d.teamName} ${mine}–${theirs} ${TEAMS[opp].name}${mine === theirs ? " (sudden death)" : ""}`);
  // takım arkadaşları maç oynadıkça gelişir
  d.form = Math.min(1, d.form + (won ? 0.02 : 0.01));
  advance(d);
  save(d);
  return d;
}

/** Hükmen mağlubiyet (maçtan çıkış). */
export function forfeitCareerMatch() {
  const d = load();
  if (!d) return null;
  const f = nextMatch(d);
  if (!f) return d;
  return recordCareerMatch(0, 3, false, { evAtt: 0, ev: 0, chAtt: 0, tag: 0 });
}

/** Maç kadrosu: sıra rakip, arkadaş, rakip, arkadaş, rakip (motor takımları sırayla doldurur). */
export function matchRoster(d: CareerData, f: Fixture) {
  const opp = TEAMS[other(f)];
  const tier = d.tier;
  // Rakip gücü + basamak; arkadaşlar basamağın biraz altından başlar, form ile gelişir
  const oppTune = Math.min(1, opp.power);
  const mateTune = Math.min(1, [0.12, 0.36, 0.6][tier] + d.form * 0.3);
  const r: { name: string; fit: string; tune: number }[] = [];
  const mates = d.mates;
  r.push({ ...opp.athletes[0], tune: oppTune });
  r.push({ ...mates[0], tune: mateTune });
  r.push({ ...opp.athletes[1], tune: Math.max(0, oppTune - 0.05) });
  r.push({ ...mates[1], tune: mateTune });
  r.push({ ...opp.athletes[2], tune: Math.max(0, oppTune - 0.08) });
  return { roster: r, opp, chases: TIERS[tier].chases, venue: TIERS[tier].venue };
}

export function stageLabel(f: Fixture) {
  return f.stage === "final" ? "Final" : f.stage === "semi" ? "Yarı final" : `Grup ${f.group}`;
}

export const PLAYER_ID = PLAYER;

/** Rakiple geçmiş: "3–1" ve bir hikâye cümlesi. */
export function rivalry(d: CareerData, opp: string): string | null {
  const h = d.h2h[opp];
  if (!h) return null;
  const [w, l] = h;
  if (l >= 2 && w === 0) return `${l} maçtır yenemiyorsun. İntikam zamanı.`;
  if (w >= 2 && l === 0) return `Son ${w} karşılaşmanın hepsini kazandın. Seni bekliyorlar.`;
  if (w + l > 0) return `Aranızda ${w}–${l}.`;
  return null;
}
