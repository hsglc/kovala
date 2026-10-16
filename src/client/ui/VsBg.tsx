/**
 * VS zemini: ekran çaprazlamasına bölünür. Üst kırmızı (kovalayan), alt mavi (kaçan),
 * arada beyaz saha çizgisi ve çizgi boyunca birbirini kovalayan ◆ ve ●.
 * `split` dikiş yüksekliğini (sol, sağ; ekran yüzdesi) ayarlar.
 */
export function VsBg({ split = [46, 34], live = true }: { split?: [number, number]; live?: boolean }) {
  const [l, r] = split;
  return (
    <div className="vs-bg" aria-hidden="true" style={{ ["--sl" as string]: `${l}%`, ["--sr" as string]: `${r}%` }}>
      <svg className="vs-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id="halftone" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
            <circle cx="1.2" cy="1.2" r="0.55" fill="rgba(0,0,0,0.16)" />
          </pattern>
          <pattern id="speed" width="100" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-7)">
            <rect x="0" y="0" width="100" height="0.35" fill="rgba(255,255,255,0.07)" />
          </pattern>
        </defs>
        <polygon points={`0,0 100,0 100,${r} 0,${l}`} fill="var(--red)" />
        <polygon points={`0,0 100,0 100,${r} 0,${l}`} fill="url(#halftone)" />
        <polygon points={`0,${l} 100,${r} 100,100 0,100`} fill="var(--blue)" />
        <polygon points={`0,${l} 100,${r} 100,100 0,100`} fill="url(#speed)" />
        <line x1="0" y1={l} x2="100" y2={r} stroke="#fff" strokeWidth="7" vectorEffect="non-scaling-stroke" />
      </svg>
      {live && (
        <>
          <span className="seam-dot seam-evader" />
          <span className="seam-dot seam-chaser" />
        </>
      )}
    </div>
  );
}
