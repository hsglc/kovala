import { useState } from "react";
import type { BotLevel } from "../../shared/bot";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/protocol";
import { getName, setName } from "../lib/identity";
import { unlockAudio } from "../lib/sound";

interface Props {
  offline?: boolean;
  initialCode?: string;
  busy?: boolean;
  error?: string | null;
  onQuick: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onPractice: (level: BotLevel) => void;
}

export function Home({ offline, initialCode, busy, error, onQuick, onCreate, onJoin, onPractice }: Props) {
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState(initialCode ?? "");
  const [level, setLevel] = useState<BotLevel>("orta");
  const [showRules, setShowRules] = useState(false);
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
      <header className="brand">
        <h1 className="logo">
          <span className="streaks" aria-hidden="true" />
          KOVALA
        </h1>
        <p className="tagline">20 saniye. Bir kovalayan, bir kaçan.</p>
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
          <b>{initialCode}</b> odasına davet edildin
          <button className="btn primary" disabled={busy} onClick={() => ensureName() && onJoin(initialCode)}>
            Odaya katıl
          </button>
        </div>
      )}

      {offline && (
        <div className="invite">
          <span>
            Bu önizlemede botla antrenman oynanır. Online maç, oyun yayına alınınca açılacak.
          </span>
        </div>
      )}

      <div className="stack" hidden={offline}>
        <button className="btn primary big" disabled={busy} onClick={() => ensureName() && onQuick()}>
          Hızlı Maç
          <small>Rastgele bir rakiple 1'e 1</small>
        </button>
        <button className="btn big" disabled={busy} onClick={() => ensureName() && onCreate()}>
          Oda Kur
          <small>Arkadaşlarınla, takım başına 6 kişiye kadar</small>
        </button>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === ROOM_CODE_LENGTH && ensureName()) onJoin(code);
          }}
        >
          <input
            value={code}
            placeholder="ODA KODU"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(cleanCode(e.target.value))}
          />
          <button className="btn" disabled={busy || code.length !== ROOM_CODE_LENGTH}>
            Katıl
          </button>
        </form>
      </div>

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

      <section className="rules">
        <button className="link-btn" onClick={() => setShowRules((v) => !v)}>
          {showRules ? "▾" : "▸"} Nasıl oynanır?
        </button>
        {showRules && (
          <ul>
            <li>Her chase 20 saniye: biri kovalar ◆, biri kaçar ●.</li>
            <li>Kaçan 20 saniye yakalanmazsa takımı 1 puan alır. Yakalamak puan getirmez.</li>
            <li>Chase'i kazanan sahada kalır ve bir sonrakinde kaçan olur; kaybedenin takımı sıradaki oyuncusunu yollar.</li>
            <li>Saha çizgisinin dışına basan chase'i kaybeder.</li>
            <li>Sarı kutular koşarken kendiliğinden atlanır. <b>PARKUR</b> tuşu: duvara <b>TIRMAN</b>, sırtın duvardayken <b>SEK</b>.</li>
            <li>Kaçan <b>SIÇRA</b> ile ani yön değiştirir; kovalayan <b>DALIŞ</b> ile uzağa uzanır ama sonra tökezler.</li>
            <li>Düz koşarken çizgi seni tutar; hamle yaparken çizgiyi geçersen chase'i kaybedersin.</li>
            <li>Eşitlikte sudden death: her takım bir kez kaçar, en uzun dayanan kazanır.</li>
            <li>Telefonda: sol tarafı sürükleyerek koş, sağdaki tuşlar hamle. Bilgisayarda: WASD/ok tuşları, Boşluk = rol hamlesi, Shift = parkur.</li>
          </ul>
        )}
      </section>

      <footer className="foot">World Chase Tag'den esinlenilmiştir; resmî bir ürün değildir.</footer>
    </div>
  );
}
