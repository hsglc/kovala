import { useEffect, useRef, useState } from "react";
import { fitIndex, fitItem, fitSex, itemsFor, REGIONS, withItem, type Region } from "../../shared/outfit";
import { WardrobePreview } from "../game/three/WardrobePreview";
import { cachedThumb, releaseThumbs, requestThumb, thumbKey } from "../game/three/thumbs";
import { getFit, setFit } from "../lib/identity";
import { getProgress } from "../lib/progress";

interface Props {
  onBack: () => void;
}

type Pose = "idle" | "run" | "cheer";
const TABS: Region[] = ["top", "bottom", "shoes", "hair", "head", "acc"];
const POSES: [Pose, string][] = [
  ["idle", "Bekle"],
  ["run", "Koş"],
  ["cheer", "Sevin"],
];

export function Wardrobe({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<WardrobePreview | null>(null);
  const [fit, setFitState] = useState(getFit());
  const [region, setRegion] = useState<Region>("top");
  const [team, setTeam] = useState<0 | 1>(0);
  const [pose, setPose] = useState<Pose>("idle");
  const [saved, setSaved] = useState(false);
  const myLevel = getProgress().level;
  const sex = fitSex(fit);

  useEffect(() => {
    const p = new WardrobePreview(canvasRef.current!);
    previewRef.current = p;
    return () => p.dispose();
  }, []);

  useEffect(() => {
    previewRef.current?.set(team, fit);
  }, [team, fit]);

  // Kart önizlemeleri: açık sekmedeki parçalar, sırayla üretilir
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const list = itemsFor(region, sex);
    for (const { i } of [...list].reverse()) {
      if (cachedThumb(sex, team, region, i)) continue;
      requestThumb(sex, team, region, i).then((url) => {
        if (alive) setThumbs((t) => ({ ...t, [thumbKey(sex, team, region, i)]: url }));
      });
    }
    return () => {
      alive = false;
    };
  }, [region, sex, team]);
  useEffect(() => () => releaseThumbs(), []);

  useEffect(() => {
    previewRef.current?.setPose(pose);
  }, [pose]);

  const commit = (next: string) => {
    setFitState(next);
    setFit(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const shuffle = () => {
    let f = fit;
    for (const r of REGIONS) {
      if (r.id === "body") continue;
      const open = itemsFor(r.id, sex).filter(({ it }) => (it.lvl ?? 0) <= myLevel);
      const pick = open[Math.floor(Math.random() * open.length)];
      f = withItem(f, r.id, pick.i);
    }
    commit(f);
  };

  const reg = REGIONS.find((r) => r.id === region)!;
  const sel = fitIndex(fit, region);
  const items = itemsFor(region, sex);

  return (
    <div className="page wardrobe">
      <header className="wr-head">
        <button className="icon-btn" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <h1>Gardırop</h1>
        <span className={`wr-saved ${saved ? "on" : ""}`}>kaydedildi</span>
      </header>

      <div className="wr-sex" role="radiogroup" aria-label="Karakter">
        {REGIONS[0].items.map((it, i) => (
          <button
            key={it.id}
            role="radio"
            aria-checked={sex === it.id}
            className={`wr-sex-btn ${sex === it.id ? "on" : ""}`}
            onClick={() => commit(withItem(fit, "body", i))}
          >
            <b>{it.id === "f" ? "Kadın" : "Erkek"}</b>
            <small>{it.desc}</small>
          </button>
        ))}
      </div>

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
        <div className="wr-poses">
          {POSES.map(([p, label]) => (
            <button key={p} className={pose === p ? "on" : ""} onClick={() => setPose(p)}>
              {label}
            </button>
          ))}
        </div>
        <button className="wr-shuffle" onClick={shuffle}>
          Rastgele kombin
        </button>
        <div className="wr-hint">Döndürmek için sürükle</div>
        <div className="wr-tag">
          {fitItem(fit, "top").name}
          <span>+</span>
          {fitItem(fit, "bottom").name}
          <span>+</span>
          {fitItem(fit, "shoes").name}
        </div>
      </div>

      <div className="wr-tabs" role="tablist">
        {TABS.map((id) => {
          const r = REGIONS.find((x) => x.id === id)!;
          return (
            <button key={id} role="tab" aria-selected={region === id} className={region === id ? "on" : ""} onClick={() => setRegion(id)}>
              {r.label}
            </button>
          );
        })}
      </div>

      <div className="wr-items" aria-label={reg.label}>
        {items.map(({ it, i }) => {
          const locked = (it.lvl ?? 0) > myLevel;
          return (
            <button
              key={it.id}
              className={`wr-item ${sel === i ? "on" : ""} ${locked ? "locked" : ""}`}
              disabled={locked}
              onClick={() => commit(withItem(fit, region, i))}
            >
              {locked && <span className="wr-lock">Seviye {it.lvl}</span>}
              {(() => {
                const url = thumbs[thumbKey(sex, team, region, i)] ?? cachedThumb(sex, team, region, i);
                return (
                  <span className={`wr-thumb ${url ? "ready" : ""}`} data-team={team} data-region={region}>
                    {url ? <img src={url} alt="" draggable={false} /> : <span className="wr-thumb-wait" style={{ background: it.swatch }} />}
                  </span>
                );
              })()}
              <span className="wr-text">
                <b>{it.name}</b>
                <small>{it.desc}</small>
              </span>
              <span className="wr-check">{sel === i ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <p className="wr-note">Seviyen {myLevel}. Kilitli parçalar seviye atladıkça açılır. Renkler maçta takımına göre değişir; rakiplerin de kombinini görür.</p>
    </div>
  );
}
