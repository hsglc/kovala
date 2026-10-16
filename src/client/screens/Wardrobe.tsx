import { useEffect, useRef, useState } from "react";
import { fitIndex, REGIONS, withItem, type Region } from "../../shared/outfit";
import { WardrobePreview } from "../game/three/WardrobePreview";
import { getFit, setFit } from "../lib/identity";
import { getProgress } from "../lib/progress";

interface Props {
  onBack: () => void;
}

export function Wardrobe({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<WardrobePreview | null>(null);
  const [fit, setFitState] = useState(getFit());
  const [region, setRegion] = useState<Region>("head");
  const [team, setTeam] = useState<0 | 1>(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = new WardrobePreview(canvasRef.current!);
    previewRef.current = p;
    return () => p.dispose();
  }, []);

  useEffect(() => {
    previewRef.current?.set(team, fit);
  }, [team, fit]);

  const pick = (i: number) => {
    const next = withItem(fit, region, i);
    setFitState(next);
    setFit(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const myLevel = getProgress().level;
  const reg = REGIONS.find((r) => r.id === region)!;
  const sel = fitIndex(fit, region);

  return (
    <div className="page wardrobe">
      <header className="wr-head">
        <button className="icon-btn" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <h1>Gardırop</h1>
        <span className={`wr-saved ${saved ? "on" : ""}`}>Kaydedildi ✓</span>
      </header>

      <div className="wr-stage" data-team={team}>
        <canvas ref={canvasRef} className="wr-canvas" />
        <div className="wr-team">
          <button className={team === 0 ? "on red" : ""} onClick={() => setTeam(0)}>
            Kırmızı
          </button>
          <button className={team === 1 ? "on blue" : ""} onClick={() => setTeam(1)}>
            Mavi
          </button>
        </div>
        <div className="wr-hint">Döndürmek için sürükle</div>
      </div>

      <div className="wr-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${REGIONS.length}, 1fr)` }}>
        {REGIONS.map((r) => (
          <button key={r.id} role="tab" aria-selected={region === r.id} className={region === r.id ? "on" : ""} onClick={() => setRegion(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="wr-items">
        {reg.items.map((it, i) => {
          const locked = (it.lvl ?? 0) > myLevel;
          return (
          <button
            key={it.id}
            className={`wr-item ${sel === i ? "on" : ""} ${locked ? "locked" : ""}`}
            disabled={locked}
            onClick={() => pick(i)}
          >
            {locked && <span className="wr-lock">Seviye {it.lvl}</span>}
            <span className="wr-swatch" style={{ background: it.swatch }} />
            <span className="wr-text">
              <b>{it.name}</b>
              <small>{it.desc}</small>
            </span>
            <span className="wr-check">{sel === i ? "✓" : ""}</span>
          </button>
          );
        })}
      </div>
      <p className="wr-note">
        Seviyen {myLevel}. Kilitli parçalar seviye atladıkça açılır; görev yaparak hızlı XP topla. Renkler maçta takımına göre değişir.
      </p>
    </div>
  );
}
