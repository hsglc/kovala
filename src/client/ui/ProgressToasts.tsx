import { useEffect, useState } from "react";
import { onProgress, type Notice } from "../lib/progress";

/** XP, görev ve seviye bildirimleri: ekranın üstünde kısa süreli şeritler. */
export function ProgressToasts() {
  const [items, setItems] = useState<{ id: number; n: Notice }[]>([]);
  useEffect(() => {
    let seq = 0;
    return onProgress((n) => {
      const id = ++seq + Date.now();
      setItems((xs) => [...xs.slice(-3), { id, n }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), n.kind === "xp" ? 1800 : 3200);
    });
  }, []);
  if (!items.length) return null;
  return (
    <div className="ptoasts" aria-live="polite">
      {items.map(({ id, n }) => (
        <div key={id} className={`ptoast ${n.kind}`}>
          {n.kind === "xp" && (
            <>
              <b>+{n.xp} XP</b> {n.why}
            </>
          )}
          {n.kind === "mission" && (
            <>
              <b>Görev tamam</b> {n.text} <span className="pt-xp">+{n.xp} XP</span>
            </>
          )}
          {n.kind === "level" && (
            <>
              <b>Seviye {n.level}</b> Gardırobunda yeni parçalara bak
            </>
          )}
        </div>
      ))}
    </div>
  );
}
