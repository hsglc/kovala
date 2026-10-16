import { useState } from "react";
import type { BotLevel } from "../../shared/bot";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/protocol";
import { LAYOUTS, LEVEL_LABEL } from "../../shared/maps";
import { fitItem, REGIONS } from "../../shared/outfit";
import { getFit, getName, setName } from "../lib/identity";
import { LedClock, QuadThumb } from "../ui/QuadThumb";
import { getProgress } from "../lib/progress";
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
  onPractice: (level: BotLevel, map: string, squad: number) => void;
  onWardrobe: () => void;
}

type Sheet = null | "rules" | "notes" | "missions";

export function Home({ offline, initialCode, busy, error, onQuick, onCreate, onJoin, onPractice, onWardrobe }: Props) {
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
  const choosePmap = (id: string) => {
    setPmap(id);
    try {
      localStorage.setItem("evade:pmap", id);
    } catch {}
  };
  const [sheet, setSheet] = useState<Sheet>(null);
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
    <div className="page home">
      <header className="masthead">
        <img className="logo-mark" src="/favicon.svg" alt="" width="44" height="44" />
        <h1 className="wordmark">EVADE</h1>
        <button className="version" onClick={() => setSheet("notes")} aria-label="Yama notları">
          v{CURRENT_VERSION}
        </button>
      </header>

      <section className="arena-board" aria-label="Oyun vitrini">
        <div className="board-quad">
          <QuadThumb layout="quad" live />
        </div>
        <div className="board-side">
          <LedClock />
          <p className="board-copy">
            Kovalayan <span className="mk-c">◆</span> yakalamaya, kaçan <span className="mk-e">●</span> 20 saniye dayanmaya çalışır.
          </p>
        </div>
      </section>

      <button className="career" onClick={() => setSheet("missions")}>
        <span className="career-lvl">
          <small>Seviye</small>
          {prog.level}
        </span>
        <span className="career-body">
          <span className="career-bar">
            <i style={{ width: `${Math.round((prog.into / prog.need) * 100)}%` }} />
          </span>
          <span className="career-meta">
            {prog.into}/{prog.need} XP, sonraki seviyeye {prog.need - prog.into}
          </span>
        </span>
        <span className="career-go">Görevler</span>
      </button>

      <label className={`field ${nameError ? "error" : ""}`}>
        <span>Sahada görünecek adın</span>
        <input
          id="name-input"
          value={name}
          maxLength={16}
          placeholder="Ör. Hızlı Hüseyin"
          autoComplete="nickname"
          onChange={(e) => {
            setNameState(e.target.value);
            setNameError(false);
          }}
        />
      </label>

      {error && <div className="alert">{error}</div>}

      {initialCode && (
        <div className="invite">
          <span>
            <b>{initialCode}</b> odasına davet edildin
          </span>
          <button className="btn primary" disabled={busy} onClick={() => ensureName() && onJoin(initialCode)}>
            Katıl
          </button>
        </div>
      )}

      {offline && (
        <div className="invite">
          <span>Bu önizlemede botla antrenman oynanır. Online maç canlı sürümde.</span>
        </div>
      )}

      <div className="play-stack" hidden={offline}>
        <button className="plate plate-quick" disabled={busy} onClick={() => ensureName() && onQuick()}>
          <span className="plate-title">Hızlı maç</span>
          <span className="plate-sub">Rastgele bir rakiple 1'e 1, hemen</span>
          <span className="plate-icon" aria-hidden="true">
            ⚡
          </span>
        </button>
        <div className="plate-row">
          <button className="plate plate-room" disabled={busy} onClick={() => ensureName() && onCreate()}>
            <span className="plate-title">Oda kur</span>
            <span className="plate-sub">Arkadaşlarınla, takım başına 6 kişi</span>
          </button>
          <form
            className="plate plate-join"
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
            <button className="join-go" disabled={busy || code.length !== ROOM_CODE_LENGTH}>
              Odaya katıl
            </button>
          </form>
        </div>
      </div>

      <section className="ply practice">
        <h2 className="ply-title">Botla antrenman</h2>
        <div className="ply-grid">
          <div className="ply-field">
            <span>Bot</span>
            <div className="seg">
              {(["kolay", "orta", "zor"] as BotLevel[]).map((l) => (
                <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                  {l[0].toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="ply-field">
            <span>Format</span>
            <div className="seg">
              {[
                [1, "1'e 1"],
                [3, "3'e 3 takım"],
              ].map(([n, label]) => (
                <button key={n} className={squad === n ? "on" : ""} onClick={() => setSquad(n as number)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="ply-field">
          <span>Saha</span>
          <div className="pmap-row" role="listbox" aria-label="Saha">
            {[{ id: "random", name: "Rastgele", level: 0 }, ...LAYOUTS].map((l) => (
              <button
                key={l.id}
                role="option"
                aria-selected={pmap === l.id}
                className={`pmap ${pmap === l.id ? "on" : ""}`}
                onClick={() => choosePmap(l.id)}
              >
                {l.id === "random" ? <span className="pmap-dice">?</span> : <QuadThumb layout={l.id} />}
                <span className="pmap-name">
                  {l.level > 0 && <span className={`pdot lvl-${l.level}`} title={LEVEL_LABEL[l.level as 1 | 2 | 3]} />}
                  {l.name}
                </span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn go" onClick={() => ensureName() && onPractice(level, pmap, squad)}>
          Antrenmanı başlat
        </button>
      </section>

      <button className="locker" onClick={onWardrobe}>
        <span className="locker-hook" aria-hidden="true">
          👕
        </span>
        <span className="locker-text">
          <b>Gardırop</b>
          <small>{fitSummary.join(", ")}</small>
        </span>
        <span className="locker-open">Aç</span>
      </button>

      <nav className="links">
        <button className="link-btn" onClick={() => setSheet("rules")}>
          Nasıl oynanır?
        </button>
        <button className="link-btn" onClick={() => setSheet("notes")}>
          Yama notları
        </button>
      </nav>

      <footer className="foot">World Chase Tag'den esinlenilmiştir; resmî bir ürün değildir.</footer>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet-head">
              <h2>{sheet === "rules" ? "Nasıl oynanır?" : sheet === "missions" ? "Görevler" : "Yama notları"}</h2>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Kapat">
                ✕
              </button>
            </div>
            {sheet === "rules" ? <Rules /> : sheet === "missions" ? <Missions /> : <Notes />}
          </div>
        </div>
      )}
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
