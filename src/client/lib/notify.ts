import { sfx, vibrate } from "./sound";

/**
 * Davet uyarısı: her zaman ses + titreşim; sekme gizliyse ve izin verildiyse sistem bildirimi.
 * Android Chrome sistem bildirimini yalnızca servis çalışanı üzerinden gösterir.
 */
let reg: ServiceWorkerRegistration | null = null;

export function setupNotifications() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then((r) => {
      reg = r;
    })
    .catch(() => {});
}

export function canAskNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "default";
}

export async function askNotify(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function alertInvite(from: string) {
  sfx.invite();
  vibrate([220, 90, 220, 90, 360]);
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  const title = `${from} seni maça çağırıyor`;
  const opts: NotificationOptions = { body: "Kabul etmek için 60 saniyen var.", tag: "evade-invite", icon: "/favicon.svg" };
  try {
    if (reg) void reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {}
}
