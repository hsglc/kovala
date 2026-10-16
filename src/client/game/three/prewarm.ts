import { createPlayer, type PlayerState } from "../../../shared/sim";
import { getLayout } from "../../../shared/maps";
import type { PublicState } from "../../../shared/engine";
import { loadAthlete } from "./athlete";
import { Scene3D } from "./Scene3D";

/**
 * Ana ekranda boştayken oyun sahnesini görünmez bir kapta birkaç kare çizer:
 * sporcu modelleri yüklenir, kumaş/deri/engel/efekt gölgelendiricileri paylaşılan bağlamda derlenir.
 * "Başlat"a basınca maç beklemeden açılır. Gerçek bir maç tuvali devralırsa hemen çekilir.
 */
let done = false;
let running = false;

export function prewarmGame(myFit: string, botFits: string[]) {
  if (done || running) return;
  running = true;
  void (async () => {
    try {
      await loadAthlete();
      const host = document.createElement("div");
      const sc = new Scene3D(host);
      // Küçük tuval: derleme çözünürlükten bağımsız, çizim ucuz kalsın
      sc.resize(180, 320, 1);
      const layout = getLayout("quad");
      const players = new Map<string, PlayerState>([
        ["warm-me", createPlayer(4, 4, 1, 0)],
        ["warm-bot", createPlayer(7, 6, -1, 0)],
      ]);
      const fits = botFits.length ? botFits : ["0000000"];
      for (let i = 0; i < fits.length; i++) {
        const state = {
          phase: "chase",
          venue: "arena",
          layoutId: layout.id,
          chaseStartTick: 1,
          chaserId: "warm-me",
          evaderId: "warm-bot",
          last: null,
          members: [
            { id: "warm-me", name: "", team: 0, fit: myFit, connected: true },
            { id: "warm-bot", name: "", team: 1, fit: fits[i], connected: true },
          ],
        } as unknown as PublicState;
        // 1. kare: figürler kurulur, gölgelendiricileri arka planda derlenmeye başlar
        // ardından derleme bitene kadar bekle, sonra 2 kare (gölge, AO, efekt geçişleri)
        for (let f = 0; f < 3; f++) {
          if (!sc.active) {
            sc.dispose();
            return;
          }
          sc.render(layout, state, players, "warm-me", performance.now());
          if (f === 0) await sc.compiled();
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      }
      sc.dispose();
      done = true;
      if (import.meta.env.DEV) (globalThis as { __warmDone?: number }).__warmDone = performance.now();
    } catch {
      /* ön ısıtma isteğe bağlı */
    } finally {
      running = false;
    }
  })();
}
