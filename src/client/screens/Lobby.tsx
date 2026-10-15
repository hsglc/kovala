import { useState } from "react";
import { CHASE_OPTIONS } from "../../shared/constants";
import type { PublicState, Team } from "../../shared/engine";
import { LAYOUTS } from "../../shared/maps";
import { TEAM_COLORS, memberName, secs, sortedTeam, teamName } from "../lib/text";
import { unlockAudio } from "../lib/sound";
import type { GameSource } from "../net/types";

interface Props {
  source: GameSource;
  state: PublicState;
  onLeave: () => void;
}

export function Lobby({ source, state: s, onLeave }: Props) {
  const me = source.selfId;
  const isHost = s.host === me;
  const local = source.kind === "local";
  const [copied, setCopied] = useState(false);
  const code = source.getCode();
  const finished = s.phase === "finished";
  const myTeam = s.members.find((m) => m.id === me)?.team;
  const canStart = [0, 1].every((t) => s.members.some((m) => m.team === t && m.connected));

  const share = async () => {
    const url = `${location.origin}/?oda=${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kovala", text: `Kovala odama gel! Kod: ${code}`, url });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="page lobby">
      <header className="lobby-head">
        <button className="link-btn" onClick={onLeave}>
          ← {local ? "Ana menü" : "Odadan çık"}
        </button>
        {!local && (
          <div className="room-code">
            <span className="label">ODA KODU</span>
            <span className="code">{code}</span>
            <button className="btn small ghost" onClick={share}>
              {copied ? "Kopyalandı ✓" : "Davet et"}
            </button>
          </div>
        )}
      </header>

      {finished && s.winner !== null && <MatchResult s={s} me={me} />}

      {!local && (
        <section className="teams">
          {([0, 1] as Team[]).map((t) => (
            <div className="team-card" key={t} style={{ ["--c" as string]: TEAM_COLORS[t] }}>
              <div className="team-head">
                <span className="dot" />
                {teamName(t)}
                <span className="count">{sortedTeam(s.members, t).length}/6</span>
              </div>
              <ul>
                {sortedTeam(s.members, t).map((m) => (
                  <li key={m.id} className={m.connected ? "" : "dim"}>
                    <span className="pname">{m.name}</span>
                    {m.id === me && <span className="tag">sen</span>}
                    {m.id === s.host && <span className="tag host">kurucu</span>}
                  </li>
                ))}
                {sortedTeam(s.members, t).length === 0 && <li className="empty">Oyuncu bekleniyor…</li>}
              </ul>
              {myTeam !== undefined && myTeam !== t && (
                <button className="btn small ghost" onClick={() => source.switchTeam()}>
                  Bu takıma geç
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="settings">
        <div className="setting">
          <span className="setting-label">Chase sayısı</span>
          <div className="seg">
            {CHASE_OPTIONS.map((n) => (
              <button key={n} disabled={!isHost} className={s.chases === n ? "on" : ""} onClick={() => source.setChases(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="setting-label">Saha</span>
          <div className="seg wrap">
            {[{ id: "random", name: "Rastgele" }, ...LAYOUTS].map((l) => (
              <button
                key={l.id}
                disabled={!isHost || finished}
                className={s.layoutId === l.id ? "on" : ""}
                onClick={() => source.setLayout(l.id)}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="lobby-actions">
        {isHost ? (
          <>
            <button
              className="btn primary big"
              disabled={!canStart}
              onClick={() => {
                unlockAudio();
                source.start();
              }}
            >
              {finished ? "Rövanş" : "Maçı başlat"}
            </button>
            {!canStart && <p className="hint">Başlamak için her takımda en az bir oyuncu olmalı. Arkadaşına “Davet et” ile link gönder.</p>}
          </>
        ) : (
          <p className="hint center">Kurucu ({memberName(s, s.host)}) başlatınca maç başlayacak.</p>
        )}
      </div>
    </div>
  );
}

function MatchResult({ s, me }: { s: PublicState; me: string }) {
  const w = s.winner!;
  const myTeam = s.members.find((m) => m.id === me)?.team;
  const won = myTeam === w;
  const reason = s.winReason === "sd" ? "Sudden death ile" : s.winReason === "forfeit" ? "Hükmen" : "";
  return (
    <section className="result-card" style={{ ["--c" as string]: TEAM_COLORS[w] }}>
      <div className="result-kicker">{won ? "KAZANDIN" : myTeam === undefined ? "MAÇ BİTTİ" : "KAYBETTİN"}</div>
      <div className="result-title">
        {teamName(w)} kazandı {reason && <small>· {reason}</small>}
      </div>
      <div className="result-score">
        <span style={{ color: TEAM_COLORS[0] }}>{s.scores[0]}</span>
        <span className="sep">–</span>
        <span style={{ color: TEAM_COLORS[1] }}>{s.scores[1]}</span>
      </div>
      {s.history.length > 0 && (
        <ol className="history">
          {s.history.map((h, i) => (
            <li key={i}>
              <span className="hn">{h.sd ? "SD" : h.n}</span>
              <span className="dot" style={{ background: TEAM_COLORS[h.evTeam] }} />
              <span className="hx">
                {h.winner === "evader"
                  ? `${memberName(s, h.evader)} kaçtı`
                  : h.reason === "tag"
                    ? `${memberName(s, h.chaser)} yakaladı`
                    : h.reason === "out"
                      ? `${memberName(s, h.evader)} saha dışı`
                      : "hükmen"}
              </span>
              <span className="ht">{secs(h.ticks)} sn</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
