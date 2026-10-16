import { useEffect, useState } from "react";

const KEY = "evade:portrait-ok";
const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const isPortrait = () => window.innerHeight > window.innerWidth;

type OrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/** Yatay oyuna geç: tam ekran + yatay kilit (Android). iPhone'da desteklenmez; kullanıcı çevirir. */
export async function goLandscape(): Promise<boolean> {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (screen.orientation as OrientationLock).lock?.("landscape");
    return true;
  } catch {
    return false;
  }
}

export function leaveLandscape() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* desteklenmiyor */
  }
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

/**
 * Maçta telefon dikeyse: "telefonu yan çevir" katmanı. Dikeyde oynamak isteyen için seçenek de var.
 * shown değişince çağrılır (yerel oyunda oyunu durdurmak için).
 */
export function useRotatePrompt() {
  const [portrait, setPortrait] = useState(() => isTouch() && isPortrait());
  const [ok, setOk] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const f = () => setPortrait(isTouch() && isPortrait());
    window.addEventListener("resize", f);
    window.addEventListener("orientationchange", f);
    return () => {
      window.removeEventListener("resize", f);
      window.removeEventListener("orientationchange", f);
    };
  }, []);
  const keepPortrait = () => {
    setOk(true);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* gizli sekme */
    }
  };
  return { shown: portrait && !ok, keepPortrait };
}

export function RotatePrompt({ onPortrait, online }: { onPortrait: () => void; online: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="rot-scrim" role="dialog" aria-labelledby="rot-t">
      <div className="rot-phone" aria-hidden="true">
        <span />
      </div>
      <h2 id="rot-t">Telefonu yan çevir</h2>
      <p>Yatayda saha iki kat geniş görünür: rakibi ve engelleri çok daha erken görürsün.{online ? "" : " Oyun sen çevirene kadar bekliyor."}</p>
      {failed && <p className="rot-hint">Telefonun ekran döndürme kilidi açıksa kapat, sonra telefonu yan çevir.</p>}
      <div className="rot-actions">
        <button
          className="rot-go"
          onClick={async () => {
            const done = await goLandscape();
            if (!done) setFailed(true);
          }}
        >
          Yatay oyna
        </button>
        <button className="rot-stay" onClick={onPortrait}>
          Dikey devam et
        </button>
      </div>
    </div>
  );
}
