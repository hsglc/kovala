import { useEffect, useState } from "react";
import { QUAD_SIZE } from "../../shared/constants";
import { getLayout, type QuadLayout } from "../../shared/maps";

const Q = QUAD_SIZE;
const H = Q / 2;

/** Sahanın kuşbakışı çizimi. `live` açıksa kovalayan ◆ kaçanı ● bir döngü boyunca kovalar. */
export function QuadThumb({ layout, live = false, className = "" }: { layout: QuadLayout | string; live?: boolean; className?: string }) {
  const L = typeof layout === "string" ? getLayout(layout) : layout;
  const reduce = usePrefersReducedMotion();
  const animate = live && !reduce;
  // Merkez etrafında dolanan sekiz şeklinde bir rota
  const a = 1.4;
  const z = Q - 1.4;
  const route = `M${H} ${a} C ${z} ${a} ${z} ${H} ${H} ${H} C ${a} ${H} ${a} ${z} ${H} ${z} C ${z} ${z} ${z} ${H} ${H} ${H} C ${a} ${H} ${a} ${a} ${H} ${a} Z`;
  return (
    <svg className={`quad-thumb ${className}`} viewBox={`-0.6 -0.6 ${Q + 1.2} ${Q + 1.2}`} role="img" aria-label={`${L.name} sahası`}>
      <rect x="-0.6" y="-0.6" width={Q + 1.2} height={Q + 1.2} rx="0.5" className="qt-floor" />
      <rect x="0" y="0" width={Q} height={Q} className="qt-line" />
      <circle cx={H} cy={H} r="1.6" className="qt-ring" />
      {L.plates?.map(([x, y], i) => (
        <rect key={i} x={x - 0.45} y={y - 0.45} width="0.9" height="0.9" className={i === 0 ? "qt-plate-c" : "qt-plate-e"} />
      ))}
      {L.obstacles.map((o, i) =>
        o.kind === "bar" ? (
          <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} className="qt-bar" />
        ) : o.kind === "box" ? (
          <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx="0.06" className="qt-box" />
        ) : (
          <g key={i}>
            <rect x={o.x} y={o.y} width={o.w} height={o.h} className="qt-wall" />
            <rect x={o.x + 0.08} y={o.y + 0.08} width={Math.max(0, o.w - 0.16)} height={Math.max(0, o.h - 0.16)} className="qt-wall-top" />
          </g>
        ),
      )}
      {animate && (
        <>
          <g className="qt-evader">
            <circle r="0.42" />
            <animateMotion dur="7s" repeatCount="indefinite" path={route} rotate="auto" />
          </g>
          <g className="qt-chaser">
            <rect x="-0.38" y="-0.38" width="0.76" height="0.76" transform="rotate(45)" />
            <animateMotion dur="7s" begin="-0.55s" repeatCount="indefinite" path={route} rotate="auto" />
          </g>
        </>
      )}
    </svg>
  );
}

function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return r;
}

/** 20,0'dan geriye sayan LED saat (ana sayfa vitrini). */
export function LedClock({ running = true }: { running?: boolean }) {
  const reduce = usePrefersReducedMotion();
  const [t, setT] = useState(200);
  useEffect(() => {
    if (!running || reduce) return;
    const id = setInterval(() => setT((x) => (x <= 0 ? 200 : x - 1)), 100);
    return () => clearInterval(id);
  }, [running, reduce]);
  const s = (t / 10).toFixed(1).replace(".", ",");
  return (
    <span className="led" data-low={t < 50 ? "1" : "0"} aria-label="20 saniyelik chase sayacı">
      <span className="led-ghost" aria-hidden="true">
        88,8
      </span>
      <span className="led-on">{s.padStart(4, " ")}</span>
    </span>
  );
}
