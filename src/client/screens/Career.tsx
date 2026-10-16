import { useEffect, useState } from "react";
import { getName } from "../lib/identity";
import {
  PLAYER_ID,
  TIERS,
  load,
  nextMatch,
  nextTournament,
  resetCareer,
  rivalry,
  stageLabel,
  startCareer,
  table,
  team,
  winner,
  type Award,
  type CareerData,
  type Fixture,
  type Tournament,
} from "../lib/career";
import { VsBg } from "../ui/VsBg";

interface Props {
  onPlay: (f: Fixture) => void;
  onBack: () => void;
  /** az önce biten maçın özeti */
  last?: { mine: number; theirs: number; won: boolean; opp: string } | null;
}

/** Kariyer: Dünya Turu ana ekranı. */
export function Career({ onPlay, onBack, last }: Props) {
  const [d, setD] = useState<CareerData | null>(() => load());
  const tkey = d ? `${d.season}-${d.tier}-${d.cur?.fixtures.length}-${d.cur?.done}` : "none";
  // Ekran değişince (kuruluş, maç dönüşü, yeni turnuva) en üstten başla: maç afişi görünsün
  useEffect(() => window.scrollTo(0, 0), [tkey]);
  if (!d) return <CareerIntro onBack={onBack} onStart={(n) => setD(startCareer(n))} />;
  const t = d.cur!;
  const next = nextMatch(d);
  return (
    <div className="page career">
      <VsBg split={[34, 24]} live={false} />
      <header className="cr-head">
        <button className="link-btn" onClick={onBack}>
          ← Ana menü
        </button>
        <div className="cr-team">
          <span className="marker">{d.season}. sezon</span>
          <h1>{d.teamName}</h1>
          <small>
            {getName() || "Sen"}, {d.mates.map((m) => m.name).join(" ve ")}
          </small>
        </div>
      </header>

      <Route d={d} />

      {last && (
        <div className={`cr-last ${last.won ? "won" : "lost"}`}>
          <b>{last.won ? "Kazandın" : "Kaybettin"}</b> {last.mine}–{last.theirs} · {team(last.opp, d).name}
        </div>
      )}

      {next ? <Poster d={d} f={next} onPlay={() => onPlay(next)} /> : t.done ? <TourEnd d={d} t={t} onNext={() => setD(nextTournament())} /> : null}

      <Standings d={d} t={t} />
      <Knockout d={d} t={t} />
      <MyStats t={t} />

      {d.news.length > 0 && (
        <section className="cr-panel">
          <h2 className="cr-h">Haberler</h2>
          <ul className="cr-news">
            {d.news.slice(0, 6).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <Shelf awards={d.trophies} />

      <ResetLink
        onReset={() => {
          resetCareer();
          setD(null);
        }}
      />
    </div>
  );
}

function CareerIntro({ onStart, onBack }: { onStart: (name: string) => void; onBack: () => void }) {
  const me = getName() || "Sen";
  const [name, setName] = useState(`${me} Kulübü`);
  const ideas = ["Duvar Kaçakları", "Gece Koşucuları", "Çatı Kedileri", "Rüzgâr Ekibi"];
  return (
    <div className="page career">
      <VsBg split={[34, 24]} live={false} />
      <header className="cr-head">
        <button className="link-btn" onClick={onBack}>
          ← Ana menü
        </button>
      </header>
      <section className="cr-intro">
        <span className="marker">kariyer</span>
        <h1>Dünya Turu</h1>
        <p>
          Kendi takımını kur. İstanbul'da bölge elemesiyle başla, Türkiye Şampiyonası'nı kazan, Paris'teki Dünya Şampiyonası'nda kupayı kaldır.
        </p>
        <ol className="cr-steps">
          <li>
            <b>Grup aşaması.</b> Herkes herkesle oynar, ilk iki takım elemelere çıkar.
          </li>
          <li>
            <b>Kimin gireceğini sen seçersin.</b> Takımında üç sporcu var: her chase'ten önce sahaya kimin çıkacağına karar ver.
          </li>
          <li>
            <b>Ödüller.</b> Turnuvanın en iyi kaçanı Kaçış Dükü veya Düşesi, en iyi kovalayanı Uçuş Şövalyesi olur.
          </li>
        </ol>
      </section>
      <section className="cr-panel">
        <label className="cr-label" htmlFor="cr-name">
          Takımının adı
        </label>
        <input id="cr-name" className="cr-input" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} />
        <div className="cr-ideas">
          {ideas.map((i) => (
            <button key={i} onClick={() => setName(i)}>
              {i}
            </button>
          ))}
        </div>
      </section>
      <button className="tape tape-go big cr-go" disabled={!name.trim()} onClick={() => onStart(name)}>
        <span className="tape-main">Takımı kur</span>
        <span className="marker">ilk durak: İstanbul</span>
      </button>
    </div>
  );
}

function Route({ d }: { d: CareerData }) {
  const wonTier = (k: number) => d.trophies.some((a) => a.kind === "cup" && a.tier === k && a.season === d.season);
  return (
    <ol className="cr-route" aria-label="Sezon rotası">
      {TIERS.map((tr, k) => (
        <li key={k} className={`${k === d.tier ? "on" : ""} ${wonTier(k) ? "won" : ""} ${k > d.tier ? "locked" : ""}`}>
          <span className="cr-city">{tr.place}</span>
          <span className="cr-tname">{tr.name}</span>
        </li>
      ))}
    </ol>
  );
}

function Poster({ d, f, onPlay }: { d: CareerData; f: Fixture; onPlay: () => void }) {
  const oppId = f.a === PLAYER_ID ? f.b : f.a;
  const opp = team(oppId, d);
  const riv = rivalry(d, oppId);
  const tier = TIERS[d.tier];
  const lvl = opp.power < 0.3 ? "Çaylak" : opp.power < 0.5 ? "İddialı" : opp.power < 0.72 ? "Güçlü" : "Dünya elit";
  return (
    <section className="cr-poster">
      <div className="cr-stage">
        <span>{stageLabel(f)}</span>
        <span>
          {tier.name} · {tier.chases} chase
        </span>
      </div>
      <div className="cr-vs">
        <div className="cr-side me">{d.teamName}</div>
        <div className="cr-x">vs</div>
        <div className="cr-side opp">
          {opp.name}
          <small>
            {opp.city} · {lvl}
          </small>
        </div>
      </div>
      <blockquote className="cr-quote">
        “{opp.quote}”<cite>{opp.star}, takım yıldızı</cite>
      </blockquote>
      {riv && <p className="cr-riv">{riv}</p>}
      <button className="tape tape-go big cr-go" onClick={onPlay}>
        <span className="tape-main">Maça çık</span>
        <span className="marker">maçtan çıkarsan hükmen kaybedersin</span>
      </button>
    </section>
  );
}

function TourEnd({ d, t, onNext }: { d: CareerData; t: Tournament; onNext: () => void }) {
  const champ = t.champion === PLAYER_ID;
  const lastTier = t.tier === 2;
  return (
    <section className={`cr-poster end ${champ ? "champ" : ""}`}>
      <span className="marker">{champ ? "şampiyon!" : "turnuva bitti"}</span>
      <h2 className="cr-endt">{champ ? `${d.teamName} kupayı kaldırdı` : `${team(t.champion ?? "", d)?.name ?? "?"} şampiyon`}</h2>
      {(t.awards ?? []).length > 0 && (
        <ul className="cr-awards">
          {t.awards!.map((a, i) => (
            <li key={i} className={`aw-${a.kind}`}>
              {AWARD_ICON[a.kind]} {a.text}
            </li>
          ))}
        </ul>
      )}
      <p className="cr-endp">
        {champ
          ? lastTier
            ? "Dünya şampiyonusun. Yeni sezonda unvanını korumak için yeniden başla."
            : `Sıradaki durak: ${TIERS[t.tier + 1].place}, ${TIERS[t.tier + 1].name}.`
          : "Aynı turnuvaya yeni bir kurayla yeniden gir. Takım arkadaşların her maçta biraz daha gelişiyor."}
      </p>
      <button className="tape tape-go big cr-go" onClick={onNext}>
        <span className="tape-main">{champ ? (lastTier ? "Yeni sezon" : "Sıradaki turnuva") : "Yeniden dene"}</span>
      </button>
    </section>
  );
}

const AWARD_ICON: Record<Award["kind"], string> = { cup: "🏆", runner: "🥈", dodge: "👑", flight: "🦅" };

function Standings({ d, t }: { d: CareerData; t: Tournament }) {
  const groups: ("A" | "B")[] = t.groups.B ? ["A", "B"] : ["A"];
  return (
    <section className="cr-panel">
      <h2 className="cr-h">Grup{groups.length > 1 ? "lar" : ""}</h2>
      {groups.map((g) => (
        <table key={g} className="cr-table">
          {groups.length > 1 && <caption>Grup {g}</caption>}
          <thead>
            <tr>
              <th className="tl">Takım</th>
              <th title="Oynanan">O</th>
              <th title="Galibiyet">G</th>
              <th title="Kaçış farkı">±</th>
              <th title="Puan">P</th>
            </tr>
          </thead>
          <tbody>
            {table(t, g).map((r, i) => (
              <tr key={r.id} className={`${r.id === PLAYER_ID ? "me" : ""} ${i < 2 ? "q" : ""}`}>
                <td className="tl">{team(r.id, d).name}</td>
                <td>{r.p}</td>
                <td>{r.w}</td>
                <td>{r.ev - r.ag > 0 ? `+${r.ev - r.ag}` : r.ev - r.ag}</td>
                <td>
                  <b>{r.pts}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="cr-note">İlk iki takım elemelere çıkar. Galibiyet 3 puan; eşitlikte kaçış farkı.</p>
    </section>
  );
}

function Knockout({ d, t }: { d: CareerData; t: Tournament }) {
  const ko = t.fixtures.filter((f) => f.stage !== "group");
  if (!ko.length) return null;
  return (
    <section className="cr-panel">
      <h2 className="cr-h">Eleme</h2>
      <ul className="cr-ko">
        {ko.map((f, i) => {
          const w = winner(f);
          return (
            <li key={i}>
              <span className="cr-kos">{stageLabel(f)}</span>
              <span className={`${f.a === PLAYER_ID ? "me" : ""} ${w === f.a ? "w" : ""}`}>{team(f.a, d).name}</span>
              <span className="cr-kosc">{f.sa === null ? "–" : `${f.sa}–${f.sb}${f.sa === f.sb ? " SD" : ""}`}</span>
              <span className={`${f.b === PLAYER_ID ? "me" : ""} ${w === f.b ? "w" : ""}`}>{team(f.b, d).name}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MyStats({ t }: { t: Tournament }) {
  const m = t.me;
  if (!m.evAtt && !m.chAtt) return null;
  const ev = m.evAtt ? Math.round((m.ev / m.evAtt) * 100) : null;
  const tg = m.chAtt ? Math.round((m.tag / m.chAtt) * 100) : null;
  return (
    <section className="cr-panel">
      <h2 className="cr-h">Senin turnuvan</h2>
      <div className="cr-stats">
        <div>
          <b>{ev ?? "–"}%</b>
          <span>kaçış oranı ({m.ev}/{m.evAtt})</span>
          <i style={{ ["--w" as string]: `${ev ?? 0}%` }} />
        </div>
        <div>
          <b>{tg ?? "–"}%</b>
          <span>yakalama oranı ({m.tag}/{m.chAtt})</span>
          <i style={{ ["--w" as string]: `${tg ?? 0}%` }} />
        </div>
      </div>
      <p className="cr-note">Gerçek WCT'de ortalama kaçış oranı yaklaşık %30. Ödül için turnuvanın en iyisi olmalısın.</p>
    </section>
  );
}

function Shelf({ awards }: { awards: Award[] }) {
  return (
    <section className="cr-panel">
      <h2 className="cr-h">Kupa rafı</h2>
      {awards.length ? (
        <ul className="cr-shelf">
          {[...awards].reverse().map((a, i) => (
            <li key={i} className={`aw-${a.kind}`}>
              <span className="cr-ico">{AWARD_ICON[a.kind]}</span>
              <span>
                {a.text}
                <small>{a.season}. sezon</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cr-note">Raf boş. İlk kupa İstanbul'da seni bekliyor.</p>
      )}
    </section>
  );
}

function ResetLink({ onReset }: { onReset: () => void }) {
  const [ask, setAsk] = useState(false);
  return ask ? (
    <div className="cr-reset">
      <span>Kariyerin, kupaların ve haberler silinsin mi?</span>
      <button onClick={onReset}>Sil</button>
      <button onClick={() => setAsk(false)}>Vazgeç</button>
    </div>
  ) : (
    <button className="cr-reset-link" onClick={() => setAsk(true)}>
      Kariyeri sıfırla
    </button>
  );
}
