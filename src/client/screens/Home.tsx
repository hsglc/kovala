import { useEffect, useRef, useState } from "react";
import type { BotLevel } from "../../shared/bot";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/protocol";
import { LAYOUTS, LEVEL_LABEL } from "../../shared/maps";
import { fitItem, REGIONS } from "../../shared/outfit";
import { getFit, getName, getPid, setName } from "../lib/identity";
import { QuadThumb } from "../ui/QuadThumb";
import { VsBg } from "../ui/VsBg";
import { getProgress } from "../lib/progress";
import { BOT_FITS, survivalBest } from "../net/LocalGame";
import { prewarmGame } from "../game/three/prewarm";
import { VENUES } from "../../shared/venues";
import { unlockAudio } from "../lib/sound";
import { CURRENT_VERSION, PATCH_NOTES } from "../patchnotes";

interface Props {
  offline?: boolean;
  initialCode?: string;
  busy?: boolean;
  error?: string | null;
  onQuick: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onPractice: (level: BotLevel, map: string, squad: number, venue: string) => void;
  onWardrobe: () => void;
  onSurvival: () => void;
}

type Sheet = null | "rules" | "notes" | "missions" | "practice" | "ladder";

export function Home({ offline, initialCode, busy, error, onQuick, onCreate, onJoin, onPractice, onWardrobe, onSurvival }: Props) {
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode ?? "");
  const [level, setLevel] = useState<BotLevel>("orta");
  const [pmap, setPmap] = useState<string>(() => {
    try {
      return localStorage.getItem("evade:pmap") || "random";
    } catch {
      return "random";
    }
  });
  const [squad, setSquad] = useState<number>(1);
  const [venue, setVenue] = useState<string>("arena");
  // Boştayken oyunu ısıt: modeller ve gölgelendiriciler hazır olsun, "Başlat" beklemesin
  useEffect(() => {
    const t = window.setTimeout(() => prewarmGame(getFit(), [BOT_FITS.orta, BOT_FITS.zor, BOT_FITS.kolay]), 700);
    return () => window.clearTimeout(t);
  }, []);
  const choosePmap = (id: string) => {
    setPmap(id);
    try {
      localStorage.setItem("evade:pmap", id);
    } catch {}
  };
  const [sheet, setSheet] = useState<Sheet>(null);
  const mapsRef = useRef<HTMLDivElement>(null);
  const pl = LAYOUTS.find((l) => l.id === pmap);
  const pmapLabel = pl ? `${pl.name} · ${LEVEL_LABEL[pl.level]}` : "Rastgele";
  const venueName = VENUES.find((v) => v.id === venue)?.name ?? "";
  const summary = `${level[0].toUpperCase() + level.slice(1)} bot, ${squad > 1 ? "3'e 3" : "1'e 1"}, ${venueName}, ${pl ? pl.name : "rastgele saha"}`;
  useEffect(() => {
    if (sheet !== "practice") return;
    const el = mapsRef.current?.querySelector<HTMLElement>(".pmap.on");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sheet]);
  const [nameError, setNameError] = useState(false);

  const ensureName = () => {
    const n = name.trim();
    if (!n) {
      setNameError(true);
      document.getElementById("name-input")?.focus();
      return false;
    }
    setName(n);
    unlockAudio();
    return true;
  };

  const cleanCode = (v: string) =>
    v
      .toUpperCase()
      .split("")
      .filter((c) => ROOM_CODE_ALPHABET.includes(c))
      .join("")
      .slice(0, ROOM_CODE_LENGTH);

  const prog = getProgress();
  const fitSummary = REGIONS.map((r) => fitItem(getFit(), r.id))
    .filter((it) => it.id !== "none")
    .map((it) => it.name);

  return (
    <div className="vs-home">
      {/* Çapraz bölünmüş VS ekranı: üst kırmızı (kovalayan), alt mavi (kaçan) */}
      <VsBg />

      <div className="vs-top">
        <div className="topbar">
          <button className="lvl-chip" onClick={() => setSheet("missions")} aria-label={`Seviye ${prog.level}, görevler`}>
            <b>{prog.level}</b>
            <span className="lvl-rail">
              <i style={{ width: `${Math.round((prog.into / prog.need) * 100)}%` }} />
            </span>
          </button>
          <button className="ver-chip" onClick={() => setSheet("notes")}>
            v{CURRENT_VERSION}
          </button>
        </div>
        <h1 className="mega" aria-label="Evade">
          <span className="mega-1">EVA</span>
          <span className="mega-2">DE</span>
        </h1>
        <p className="mega-sub">20 saniye. Biri kovalar, biri kaçar.</p>
      </div>

      <div className="vs-bottom">
        <label className={`tape tape-white name-tape ${nameError ? "error" : ""}`}>
          <span className="marker">Adın</span>
          <input
            id="name-input"
            value={name}
            maxLength={16}
            placeholder="buraya yaz"
            autoComplete="nickname"
            onChange={(e) => {
              setNameState(e.target.value);
              setNameError(false);
            }}
          />
        </label>

        {error && <div className="tape tape-alert">{error}</div>}

        {initialCode && (
          <button className="tape tape-go" disabled={busy} onClick={() => ensureName() && onJoin(initialCode)}>
            <span className="tape-main">{initialCode} odasına katıl</span>
            <span className="marker">davet edildin</span>
          </button>
        )}

        {offline && <div className="tape">Bu önizlemede sadece botla antrenman var.</div>}

        {!offline && (
          <button className="tape tape-go big" disabled={busy} onClick={() => ensureName() && onQuick()}>
            <span className="tape-main">Hızlı maç</span>
            <span className="marker">rastgele rakip, 1'e 1</span>
          </button>
        )}

        <div className="tape-row">
          {!offline && (
            <button className="tape" disabled={busy} onClick={() => ensureName() && onCreate()}>
              <span className="tape-main">Oda kur</span>
              <span className="marker">arkadaşlarla</span>
            </button>
          )}
          {!offline && (
            <form
              className="tape code-tape"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === ROOM_CODE_LENGTH && ensureName()) onJoin(code);
              }}
            >
              <input
                value={code}
                placeholder="KOD"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Oda kodu"
                onChange={(e) => setCode(cleanCode(e.target.value))}
              />
              <button disabled={busy || code.length !== ROOM_CODE_LENGTH} aria-label="Odaya katıl">
                Gir
              </button>
            </form>
          )}
        </div>

        <button className="tape tape-ply" onClick={() => ensureName() && setSheet("practice")}>
          <span className="tape-main">Antrenman</span>
          <span className="marker">botlara karşı, 9 saha</span>
        </button>

        <button className="tape tape-red" onClick={() => ensureName() && onSurvival()}>
          <span className="tape-main">Hayatta kal</span>
          <span className="marker">yakalanana kadar kaç. Rekorun: {survivalBest()} chase</span>
        </button>

        <div className="tape-row">
          <button className="tape" onClick={onWardrobe}>
            <span className="tape-main">Gardırop</span>
            <span className="marker clip">{fitSummary[0] ?? "kıyafetler"}</span>
          </button>
          <button className="tape" onClick={() => setSheet("ladder")}>
            <span className="tape-main">Sıralama</span>
            <span className="marker">bu hafta</span>
          </button>
        </div>

        <nav className="small-links">
          <button onClick={() => setSheet("rules")}>Nasıl oynanır</button>
          <button onClick={() => setSheet("missions")}>Görevler</button>
          <button onClick={() => setSheet("notes")}>Yama notları</button>
        </nav>
        <footer className="foot">World Chase Tag'den esinlenilmiştir; resmî bir ürün değildir.</footer>
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className={`sheet ${sheet === "practice" ? "compact" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet-head">
              <h2>{SHEET_TITLE[sheet]}</h2>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Kapat">
                ✕
              </button>
            </div>
            {sheet === "rules" && <Rules />}
            {sheet === "missions" && <Missions />}
            {sheet === "notes" && <Notes />}
            {sheet === "ladder" && <LadderSheet />}
            {sheet === "practice" && (
              <div className="sheet-body practice-sheet">
                <div className="ps-row">
                  <div className="opt">
                    <span className="ps-label">Bot</span>
                    <div className="seg">
                      {(["kolay", "orta", "zor"] as BotLevel[]).map((l) => (
                        <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                          {l[0].toUpperCase() + l.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="opt">
                    <span className="ps-label">Format</span>
                    <div className="seg">
                      {[
                        [1, "1'e 1"],
                        [3, "3'e 3"],
                      ].map(([n, label]) => (
                        <button key={n} className={squad === n ? "on" : ""} onClick={() => setSquad(n as number)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="opt">
                  <span className="ps-label">Mekân</span>
                  <div className="ps-venues">
                    {VENUES.map((v) => (
                      <button key={v.id} className={`ps-venue v-${v.id} ${venue === v.id ? "on" : ""}`} onClick={() => setVenue(v.id)} title={v.blurb}>
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="opt">
                  <span className="ps-label">
                    Saha <small>{pmapLabel}</small>
                  </span>
                  <div className="ps-maps" role="listbox" aria-label="Saha" ref={mapsRef}>
                    {[{ id: "random", name: "Rastgele", level: 0 }, ...LAYOUTS].map((l) => (
                      <button
                        key={l.id}
                        role="option"
                        aria-selected={pmap === l.id}
                        className={`pmap ${pmap === l.id ? "on" : ""}`}
                        onClick={() => choosePmap(l.id)}
                      >
                        {l.id === "random" ? <span className="pmap-dice">?</span> : <QuadThumb layout={l.id} />}
                        <span className="pmap-name">{l.name}</span>
                        {l.level > 0 && <span className={`pmap-dot lvl-${l.level}`} aria-label={LEVEL_LABEL[l.level as 1 | 2 | 3]} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ps-go">
                  <button className="tape tape-go" onClick={() => onPractice(level, pmap, squad, venue)}>
                    <span className="tape-main">Başlat</span>
                    <span className="marker clip">{summary}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SHEET_TITLE: Record<Exclude<Sheet, null>, string> = {
  rules: "Nasıl oynanır?",
  missions: "Görevler",
  notes: "Yama notları",
  practice: "Antrenman",
  ladder: "Sıralama",
};

interface LadderRowView {
  name: string;
  rating: number;
  wins: number;
  losses: number;
  wweek: number;
}

function LadderSheet() {
  const [tab, setTab] = useState<"weekly" | "top">("weekly");
  const [data, setData] = useState<{ top: LadderRowView[]; weekly: LadderRowView[]; me: (LadderRowView & { rank: number }) | null } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`/api/ladder?pid=${encodeURIComponent(getPid())}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  }, []);
  const rows = data ? (tab === "weekly" ? data.weekly : data.top) : [];
  return (
    <div className="sheet-body">
      <div className="seg ladder-tabs">
        <button className={tab === "weekly" ? "on" : ""} onClick={() => setTab("weekly")}>
          Bu hafta
        </button>
        <button className={tab === "top" ? "on" : ""} onClick={() => setTab("top")}>
          Puan
        </button>
      </div>
      <p className="hint">
        {tab === "weekly"
          ? "Bu hafta Hızlı Maç'ta en çok kazananlar. Tablo her pazartesi sıfırlanır."
          : "Hızlı Maç puanı: herkes 1000 ile başlar, güçlü rakibi yenmek daha çok puan getirir."}
      </p>
      {err && <p className="hint">Sıralama şu an yüklenemedi. İnternet bağlantını kontrol edip tekrar aç.</p>}
      {data && rows.length === 0 && <p className="hint">Henüz kimse yok. İlk Hızlı Maç'ı kazanan zirveye yerleşir.</p>}
      <ol className="ladder">
        {rows.map((r, i) => (
          <li key={i} className={i < 3 ? `podium p${i + 1}` : ""}>
            <span className="lad-rank">{i + 1}</span>
            <span className="lad-name">{r.name}</span>
            <span className="lad-val">{tab === "weekly" ? `${r.wweek} galibiyet` : r.rating}</span>
          </li>
        ))}
      </ol>
      {data?.me && (
        <div className="lad-me">
          <span>Sen: {data.me.rank}. sıra</span>
          <b>{data.me.rating} puan</b>
          <span>
            {data.me.wins} G, {data.me.losses} M
          </span>
        </div>
      )}
      {data && !data.me && <p className="hint">Hızlı Maç oynayınca sen de tabloya girersin.</p>}
    </div>
  );
}

function Rules() {
  return (
    <div className="sheet-body">
      <h3>Kurallar</h3>
      <ul>
        <li>Saha resmî Quad ölçüsünde: 12 × 12 m, en yüksek engel 1,85 m. Maç 16 chase.</li>
        <li>Her chase 20 saniye: biri kovalar ◆, biri kaçar ●. Yakalama sadece el ile.</li>
        <li>Kaçan 20 saniye yakalanmazsa takımı 1 puan alır. Yakalamak puan getirmez.</li>
        <li>Chase'i kazanan sahada kalır ve bir sonrakinde kaçan olur; kaybedenin takımı sıradaki oyuncusunu yollar.</li>
        <li>Düz koşarken çizgi seni tutar; hamle yaparken çizgiyi geçersen chase'i kaybedersin.</li>
        <li>Eşitlikte sudden death: her takım bir kez kaçar, en uzun dayanan kazanır.</li>
      </ul>
      <h3>Hamleler</h3>
      <ul>
        <li>Sarı kutular koşarken kendiliğinden atlanır; çelik barların altından kendiliğinden kayılır.</li>
        <li>
          <b>PARKUR</b> tuşu bağlama göre: duvara dik ve yavaş gelince <b>TIRMAN</b> (tepeye çıkarsın; yerdeki kovalayan seni yakalayamaz ama enerjin hızla biter), duvara açıyla koşarken <b>DUVAR</b> (sıçrayıp yansırsın), açık alanda <b>ZIPLA</b> (kutuların
          üstünden geçer), kutu önünde <b>ATLA</b>, bar önünde <b>KAY</b>.
        </li>
        <li>
          Kaçan <b>SIÇRA</b> ile ani yön değiştirir; kovalayan <b>DALIŞ</b> ile uzağa uzanır ama sonra tökezler.
        </li>
        <li>Kaçan daha çevik döner, kovalayan biraz daha hızlı koşar. Hamleler enerji harcar.</li>
        <li>
          Yüksekten düşerken <b>TAKLA</b> at: hızını korursun. Atmazsan sert iner, kısa süre tökezlersin.
        </li>
        <li>
          Duvardan sıçradıktan sonra havadayken başka bir duvarın yanındaysan <b>TIC-TAC</b>: yarı enerjiyle daha hızlı ikinci sıçrama.
        </li>
        <li>
          Kaçan, koşarken joystick'i bırakıp <b>SAHTE</b> tuşuna basarsa yavaşlıyormuş gibi yapar, sonra geldiği yöne fırlar.
        </li>
      </ul>
      <h3>Kontroller</h3>
      <ul>
        <li>Telefon: ekranın sol tarafını sürükleyerek koş; sağdaki tuşlar hamle.</li>
        <li>Bilgisayar: WASD / ok tuşları, Boşluk = rol hamlesi, Shift = parkur.</li>
      </ul>
    </div>
  );
}

function Missions() {
  const p = getProgress();
  const unlocks = REGIONS.flatMap((r) => r.items.filter((it) => (it.lvl ?? 0) > p.level).map((it) => ({ ...it, region: r.label })))
    .sort((a, b) => (a.lvl ?? 0) - (b.lvl ?? 0))
    .slice(0, 4);
  return (
    <div className="sheet-body">
      <p className="hint">Bir görevi bitirince yerine yenisi gelir. Tamamlanan görev: {p.done}.</p>
      <ul className="missions">
        {p.missions.map((m) => (
          <li key={m.id}>
            <span className="ms-text">{m.text}</span>
            <span className="ms-xp">+{m.xp} XP</span>
            <span className="ms-bar">
              <i style={{ width: `${(m.n / m.goal) * 100}%` }} />
            </span>
            <span className="ms-n">
              {m.n}/{m.goal}
            </span>
          </li>
        ))}
      </ul>
      <h3>XP nasıl kazanılır?</h3>
      <ul>
        <li>Oynadığın her chase 10, her kaçış 30, her yakalama 25 XP.</li>
        <li>Maç galibiyeti 50, mağlubiyet 15 XP. Görevler 50 ile 150 XP arası.</li>
      </ul>
      {unlocks.length > 0 && (
        <>
          <h3>Sıradaki ödüller</h3>
          <ul className="unlocks">
            {unlocks.map((u) => (
              <li key={u.id}>
                <span className="wr-swatch mini" style={{ background: u.swatch }} />
                <span>
                  {u.name} <small>{u.region}</small>
                </span>
                <b>Seviye {u.lvl}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Notes() {
  return (
    <div className="sheet-body">
      {PATCH_NOTES.map((n) => (
        <article className="note" key={n.version}>
          <div className="note-head">
            <span className="note-ver">v{n.version}</span>
            <span className="note-date">
              {n.date}, {n.time}
            </span>
          </div>
          <h3>{n.title}</h3>
          <ul>
            {n.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
