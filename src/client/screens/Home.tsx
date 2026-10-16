import { useState } from "react";
import type { BotLevel } from "../../shared/bot";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/protocol";
import { fitItem, REGIONS } from "../../shared/outfit";
import { getFit, getName, setName } from "../lib/identity";
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
  onPractice: (level: BotLevel) => void;
  onWardrobe: () => void;
}

type Sheet = null | "rules" | "notes";

export function Home({ offline, initialCode, busy, error, onQuick, onCreate, onJoin, onPractice, onWardrobe }: Props) {
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode ?? "");
  const [level, setLevel] = useState<BotLevel>("orta");
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

  return (
    <div className="page home">
      <div className="hero-glow" aria-hidden="true" />
      <header className="brand">
        <div className="brand-row">
          <img className="logo-mark" src="/favicon.svg" alt="" width="64" height="64" />
          <h1 className="logo">EVADE</h1>
          <button className="pill" onClick={() => setSheet("notes")}>
            v{CURRENT_VERSION}
          </button>
        </div>
        <p className="tagline">
          <b>20 saniye.</b> Bir kovalayan, bir kaçan. Parkur sahasında.
        </p>
      </header>

      <label className={`field ${nameError ? "error" : ""}`}>
        <span>Adın</span>
        <input
          id="name-input"
          value={name}
          maxLength={16}
          placeholder="Sahada görünecek ad"
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

      <div className="stack" hidden={offline}>
        <button className="btn primary big" disabled={busy} onClick={() => ensureName() && onQuick()}>
          <span className="big-icon">⚡</span>
          <span>
            Hızlı Maç
            <small>Rastgele bir rakiple 1'e 1</small>
          </span>
        </button>
        <div className="two">
          <button className="btn big" disabled={busy} onClick={() => ensureName() && onCreate()}>
            <span className="big-icon">＋</span>
            <span>
              Oda Kur
              <small>Arkadaşlarınla, 6'ya 6'ya kadar</small>
            </span>
          </button>
          <form
            className="join-card"
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
            <button className="btn small" disabled={busy || code.length !== ROOM_CODE_LENGTH}>
              Odaya katıl
            </button>
          </form>
        </div>
      </div>

      <button className="wardrobe-card" onClick={onWardrobe}>
        <span className="wc-icon" aria-hidden="true">
          👕
        </span>
        <span className="wc-text">
          <b>Gardırop</b>
          <small>{REGIONS.map((r) => fitItem(getFit(), r.id)).filter((it) => it.id !== "none").map((it) => it.name).join(" · ")}</small>
        </span>
        <span className="wc-arrow">›</span>
      </button>

      <section className="practice">
        <div className="practice-head">
          <span>Botla antrenman</span>
          <div className="seg">
            {(["kolay", "orta", "zor"] as BotLevel[]).map((l) => (
              <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button className="btn wide" onClick={() => ensureName() && onPractice(level)}>
          Antrenmanı başlat
        </button>
      </section>

      <div className="links">
        <button className="link-btn" onClick={() => setSheet("rules")}>
          Nasıl oynanır?
        </button>
        <span className="dot-sep">·</span>
        <button className="link-btn" onClick={() => setSheet("notes")}>
          Yama notları
        </button>
      </div>

      <footer className="foot">World Chase Tag'den esinlenilmiştir; resmî bir ürün değildir.</footer>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet-head">
              <h2>{sheet === "rules" ? "Nasıl oynanır?" : "Yama notları"}</h2>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Kapat">
                ✕
              </button>
            </div>
            {sheet === "rules" ? <Rules /> : <Notes />}
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

function Notes() {
  return (
    <div className="sheet-body">
      {PATCH_NOTES.map((n) => (
        <article className="note" key={n.version}>
          <div className="note-head">
            <span className="note-ver">v{n.version}</span>
            <span className="note-date">
              {n.date} · {n.time}
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
