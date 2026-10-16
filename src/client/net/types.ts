import type { PublicState } from "../../shared/engine";
import type { QuadLayout } from "../../shared/maps";
import type { PlayerState } from "../../shared/sim";

export interface FrameData {
  /** Şu an çizilecek oyuncu durumları (aktif iki oyuncu). */
  players: Map<string, PlayerState>;
  /** Sayaçlar için kesirli sunucu tick'i. */
  tick: number;
  /** Kendi oyuncumuz için anlık durum (stamina, aksiyon önizlemesi). */
  self: PlayerState | null;
}

export type ConnStatus = "connecting" | "open" | "reconnecting" | "closed";

/** Online oda ve botla antrenman aynı arayüzü sunar; oyun ekranı ikisini ayırt etmez. */
export interface GameSource {
  readonly selfId: string;
  readonly kind: "online" | "local";
  getState(): PublicState | null;
  getStatus(): ConnStatus;
  getError(): string | null;
  getPing(): number | null;
  getCode(): string;
  subscribe(cb: () => void): () => void;
  layout(): QuadLayout;
  frame(now: number): FrameData;
  setMove(mx: number, my: number): void;
  pressAction(): void;
  pressAction2(): void;
  switchTeam(): void;
  setChases(n: number): void;
  setLayout(id: string): void;
  setRest(v: "official" | "quick"): void;
  start(): void;
  /** Takım maçı: geri sayımda sahaya girecek takım arkadaşını seç */
  pick(id: string): void;
  close(): void;
}
