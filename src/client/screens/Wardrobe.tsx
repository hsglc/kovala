import { useEffect, useRef, useState } from "react";
import { fitIndex, REGIONS, withItem, type Region } from "../../shared/outfit";
import { WardrobePreview } from "../game/three/WardrobePreview";
import { getFit, setFit } from "../lib/identity";

interface Props {
  onBack: () => void;
}

/** Her parçanın kartta gösterilen renk örneği. */
const SWATCH: Record<Region, [string, string]> = {
  head: ["linear-gradient(135deg,#ff5a4f 0 60%,#15171d 60%)", "linear-gradient(180deg,#f4f6fa 0 38%,#ff5a4f 38% 62%,#f4f6fa 62%)"],
  top: ["linear-gradient(90deg,#f2f2f2 0 18%,#ff5a4f 18% 82%,#f2f2f2 82%)", "repeating-linear-gradient(180deg,#ff5a4f 0 7px,#f5f5f5 7px 12px)"],
  bottom: ["linear-gradient(180deg,#a8302a,#7c221e)", "linear-gradient(90deg,#a8302a 0 18%,#fff 18% 22%,#a8302a 22% 26%,#fff 26% 30%,#a8302a 30% 34%,#fff 34% 38%,#a8302a 38%)"],
  shoes: ["linear-gradient(180deg,#c6ff28 0 72%,#f5f5f5 72%)", "linear-gradient(180deg,#f5f5f5 0 72%,#ff5a4f 72%)"],
};

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

  const pick = (i: 0 | 1) => {
    const next = withItem(fit, region, i);
    setFitState(next);
    setFit(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

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

      <div className="wr-stage">
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

      <div className="wr-tabs" role="tablist">
        {REGIONS.map((r) => (
          <button key={r.id} role="tab" aria-selected={region === r.id} className={region === r.id ? "on" : ""} onClick={() => setRegion(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="wr-items">
        {reg.items.map((it, i) => (
          <button key={it.name} className={`wr-item ${sel === i ? "on" : ""}`} onClick={() => pick(i as 0 | 1)}>
            <span className="wr-swatch" style={{ background: SWATCH[region][i] }} />
            <span className="wr-text">
              <b>{it.name}</b>
              <small>{it.desc}</small>
            </span>
            <span className="wr-check">{sel === i ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <p className="wr-note">Renkler maçta takımına göre değişir. Seçimin rakiplerine de görünür.</p>
    </div>
  );
}
