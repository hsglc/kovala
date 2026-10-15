import {
  CHASE_OPTIONS,
  CHASE_TICKS,
  COUNTDOWN_TICKS,
  MAX_REWIND_TICKS,
  MAX_TEAM_SIZE,
  RESULT_TICKS,
} from "./constants";
import { LAYOUTS, getLayout, pickSpawnPair, type QuadLayout } from "./maps";
import { chaserReach, createPlayer, isTag, NEUTRAL_INPUT, stepPlayer, type Input, type PlayerState } from "./sim";

/**
 * Maç kuralları (World Chase Tag formatından uyarlandı):
 * - Her chase 20 sn, bir kovalayan (chaser) bir kaçan (evader).
 * - Sadece başarılı kaçış (20 sn dayanmak) puan getirir.
 * - Chase'i kazanan sahada kalır ve sonraki chase'te kaçan olur;
 *   kaybedenin takımı sıradaki oyuncusunu kovalayan olarak sokar.
 * - Saha dışına çıkan chase'i kaybeder.
 * - Berabere biterse sudden death: her takım bir kez kaçar, en uzun kaçış kazanır.
 */

export type Phase = "lobby" | "countdown" | "chase" | "result" | "finished";
export type Team = 0 | 1;
export type Reason = "tag" | "time" | "out" | "forfeit";

export interface Member {
  id: string;
  name: string;
  team: Team;
  connected: boolean;
}

export interface ChaseRecord {
  n: number;
  sd: boolean;
  chaser: string;
  evader: string;
  winner: "chaser" | "evader";
  reason: Reason;
  ticks: number;
  /** kaçanın takımı */
  evTeam: Team;
}

export interface PublicState {
  v: number;
  phase: Phase;
  members: Member[];
  host: string | null;
  chases: number;
  layoutId: string;
  scores: [number, number];
  chaseNo: number;
  sd: boolean;
  sdTimes: [number | null, number | null];
  chaserId: string | null;
  evaderId: string | null;
  phaseEndTick: number;
  chaseStartTick: number;
  last: ChaseRecord | null;
  history: ChaseRecord[];
  winner: Team | null;
  winReason: "score" | "sd" | "forfeit" | null;
}

export interface TickInput {
  input: Input;
  /** İstemcinin bu input'u üretirken rakibi ekranda gösterdiği sunucu tick'i (lag kompanzasyonu için). */
  viewTick?: number;
}

export type EngineEvent =
  | { type: "chaseStart" }
  | { type: "chaseEnd"; record: ChaseRecord }
  | { type: "action"; id: string; kind: number }
  | { type: "finished" };

const MAX_MEMBERS = MAX_TEAM_SIZE * 2;

export class MatchEngine {
  tick = 0;
  phase: Phase = "lobby";
  members: Member[] = [];
  host: string | null = null;
  chases = 10;
  layoutChoice: string | "random" = "random";
  layout: QuadLayout = LAYOUTS[0];
  scores: [number, number] = [0, 0];
  chaseNo = 0;
  sd = false;
  sdRound = 0;
  sdTimes: [number | null, number | null] = [null, null];
  sdFirstTeam: Team = 0;
  chaserId: string | null = null;
  evaderId: string | null = null;
  players = new Map<string, PlayerState>();
  phaseEndTick = 0;
  chaseStartTick = 0;
  last: ChaseRecord | null = null;
  history: ChaseRecord[] = [];
  winner: Team | null = null;
  winReason: PublicState["winReason"] = null;
  /** Durum her değiştiğinde artar; sunucu bunu görünce herkese yeni state yollar. */
  version = 1;
  private lastUsed: [number, number] = [-1, -1];
  private lastWinner: string | null = null;
  private evaderHist: { tick: number; x: number; y: number }[] = [];
  readonly lastInputs = new Map<string, Input>();

  constructor(private rnd: () => number = Math.random) {}

  private bump() {
    this.version++;
  }

  // ---------- Lobi işlemleri ----------

  member(id: string): Member | undefined {
    return this.members.find((m) => m.id === id);
  }

  teamMembers(team: Team): Member[] {
    return this.members.filter((m) => m.team === team);
  }

  inMatch(): boolean {
    return this.phase === "countdown" || this.phase === "chase" || this.phase === "result";
  }

  /** Oyuncuyu ekler ya da yeniden bağlanırsa eski yerine oturtur. false: oda dolu. */
  join(id: string, name: string): boolean {
    const existing = this.member(id);
    if (existing) {
      existing.connected = true;
      existing.name = name || existing.name;
      if (!this.host || !this.member(this.host)?.connected) this.host = id;
      this.bump();
      return true;
    }
    if (this.members.length >= MAX_MEMBERS) return false;
    const a = this.teamMembers(0).length;
    const b = this.teamMembers(1).length;
    const team: Team = a <= b ? 0 : 1;
    this.members.push({ id, name: name || "Oyuncu", team, connected: true });
    if (!this.host || !this.member(this.host)?.connected) this.host = id;
    this.bump();
    return true;
  }

  leave(id: string) {
    const m = this.member(id);
    if (!m) return;
    if (this.inMatch()) {
      m.connected = false;
    } else {
      this.members = this.members.filter((x) => x.id !== id);
    }
    if (this.host === id) {
      this.host = this.members.find((x) => x.connected)?.id ?? null;
    }
    this.bump();
  }

  switchTeam(id: string): boolean {
    if (this.inMatch()) return false;
    const m = this.member(id);
    if (!m) return false;
    const target: Team = m.team === 0 ? 1 : 0;
    if (this.teamMembers(target).length >= MAX_TEAM_SIZE) return false;
    // Takımlar arası sırayı korumak için listenin sonuna taşı.
    this.members = this.members.filter((x) => x.id !== id);
    m.team = target;
    this.members.push(m);
    this.bump();
    return true;
  }

  setChases(by: string, n: number): boolean {
    if (by !== this.host || this.inMatch()) return false;
    if (!(CHASE_OPTIONS as readonly number[]).includes(n)) return false;
    this.chases = n;
    this.bump();
    return true;
  }

  setLayout(by: string, id: string): boolean {
    if (by !== this.host || this.inMatch()) return false;
    if (id !== "random" && !LAYOUTS.some((l) => l.id === id)) return false;
    this.layoutChoice = id;
    this.bump();
    return true;
  }

  canStart(): boolean {
    return (
      !this.inMatch() &&
      this.teamMembers(0).some((m) => m.connected) &&
      this.teamMembers(1).some((m) => m.connected)
    );
  }

  start(by: string | null): boolean {
    if (by !== null && by !== this.host) return false;
    if (!this.canStart()) return false;
    // Kopmuş oyuncuları temizle.
    this.members = this.members.filter((m) => m.connected);
    this.layout =
      this.layoutChoice === "random"
        ? LAYOUTS[Math.floor(this.rnd() * LAYOUTS.length) % LAYOUTS.length]
        : getLayout(this.layoutChoice);
    this.scores = [0, 0];
    this.chaseNo = 0;
    this.sd = false;
    this.sdRound = 0;
    this.sdTimes = [null, null];
    this.history = [];
    this.last = null;
    this.winner = null;
    this.winReason = null;
    this.lastUsed = [-1, -1];
    this.lastWinner = null;
    const evTeam: Team = this.rnd() < 0.5 ? 0 : 1;
    const ev = this.nextFrom(evTeam);
    const ch = this.nextFrom(evTeam === 0 ? 1 : 0);
    if (!ev || !ch) return false;
    this.setupChase(ch.id, ev.id);
    return true;
  }

  // ---------- Rotasyon ----------

  private nextFrom(team: Team): Member | null {
    const list = this.teamMembers(team);
    if (list.length === 0) return null;
    for (let i = 1; i <= list.length; i++) {
      const idx = (this.lastUsed[team] + i) % list.length;
      const m = list[idx];
      if (m.connected) {
        this.lastUsed[team] = idx;
        return m;
      }
    }
    return null;
  }

  private markUsed(m: Member) {
    const list = this.teamMembers(m.team);
    const idx = list.findIndex((x) => x.id === m.id);
    if (idx >= 0) this.lastUsed[m.team] = idx;
  }

  private setupChase(chaserId: string, evaderId: string) {
    this.chaserId = chaserId;
    this.evaderId = evaderId;
    const [a, b] = pickSpawnPair(this.layout, this.rnd);
    const swap = this.rnd() < 0.5;
    const cPos = swap ? b : a;
    const ePos = swap ? a : b;
    this.players.clear();
    this.players.set(chaserId, createPlayer(cPos[0], cPos[1], ePos[0] - cPos[0], ePos[1] - cPos[1]));
    this.players.set(evaderId, createPlayer(ePos[0], ePos[1], ePos[0] - cPos[0], ePos[1] - cPos[1]));
    this.lastInputs.clear();
    this.phase = "countdown";
    this.phaseEndTick = this.tick + COUNTDOWN_TICKS;
    this.bump();
  }

  // ---------- Simülasyon ----------

  /** Bir tick ilerletir. inputs: aktif oyuncuların bu tick'teki girdisi. */
  step(inputs: Map<string, TickInput> = new Map()): EngineEvent[] {
    this.tick++;
    const events: EngineEvent[] = [];
    if (!this.inMatch()) return events;

    // Bir takımda bağlı kimse kalmadıysa hükmen biter.
    const alive0 = this.teamMembers(0).some((m) => m.connected);
    const alive1 = this.teamMembers(1).some((m) => m.connected);
    if (!alive0 || !alive1) {
      if (!alive0 && !alive1) {
        this.toLobby();
      } else {
        this.finish(alive0 ? 0 : 1, "forfeit");
        events.push({ type: "finished" });
      }
      return events;
    }

    if (this.phase === "countdown") {
      // Geri sayımda aktif oyuncu koptuysa takım arkadaşı girer.
      this.replaceDisconnected();
      if (this.tick >= this.phaseEndTick) {
        this.phase = "chase";
        this.chaseStartTick = this.tick;
        this.phaseEndTick = this.tick + CHASE_TICKS;
        this.evaderHist = [];
        this.bump();
        events.push({ type: "chaseStart" });
      }
      return events;
    }

    if (this.phase === "result") {
      if (this.tick >= this.phaseEndTick) {
        const ev = this.advance();
        if (ev) events.push(ev);
      }
      return events;
    }

    // phase === "chase"
    const chaser = this.chaserId!;
    const evader = this.evaderId!;
    const elapsed = this.tick - this.chaseStartTick;
    if (!this.member(chaser)?.connected) {
      events.push(this.endChase("evader", "forfeit", elapsed));
      return events;
    }
    if (!this.member(evader)?.connected) {
      events.push(this.endChase("chaser", "forfeit", elapsed));
      return events;
    }

    const cp = this.players.get(chaser)!;
    const ep = this.players.get(evader)!;
    const ci = inputs.get(chaser);
    const ei = inputs.get(evader);
    const cIn = ci?.input ?? this.carry(chaser);
    const eIn = ei?.input ?? this.carry(evader);
    if (ci) this.lastInputs.set(chaser, ci.input);
    if (ei) this.lastInputs.set(evader, ei.input);

    const cr = stepPlayer(cp, cIn, "chaser", this.layout);
    const er = stepPlayer(ep, eIn, "evader", this.layout);
    if (cr.started) events.push({ type: "action", id: chaser, kind: cr.started });
    if (er.started) events.push({ type: "action", id: evader, kind: er.started });

    this.evaderHist.push({ tick: this.tick, x: ep.x, y: ep.y });
    if (this.evaderHist.length > MAX_REWIND_TICKS + 4) this.evaderHist.shift();

    if (er.out) {
      events.push(this.endChase("chaser", "out", elapsed));
      return events;
    }
    if (cr.out) {
      events.push(this.endChase("evader", "out", elapsed));
      return events;
    }

    const reach = chaserReach(cp);
    let tagged = isTag(cp.x, cp.y, ep.x, ep.y, reach);
    if (!tagged && ci?.viewTick !== undefined) {
      // Lag kompanzasyonu: kovalayan rakibi ekranında nerede gördüyse oraya göre de kontrol et.
      const vt = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, Math.round(ci.viewTick)));
      const h = this.evaderHist.find((e) => e.tick === vt);
      if (h) tagged = isTag(cp.x, cp.y, h.x, h.y, reach);
    }
    if (tagged) {
      events.push(this.endChase("chaser", "tag", elapsed));
      return events;
    }
    if (elapsed >= CHASE_TICKS) {
      events.push(this.endChase("evader", "time", CHASE_TICKS));
    }
    return events;
  }

  /** Input gelmediyse son yönü korur ama aksiyonu tekrarlamaz. */
  private carry(id: string): Input {
    const l = this.lastInputs.get(id);
    return l ? { mx: l.mx, my: l.my, act: false, act2: false } : NEUTRAL_INPUT;
  }

  private replaceDisconnected() {
    for (const role of ["chaser", "evader"] as const) {
      const id = role === "chaser" ? this.chaserId : this.evaderId;
      const m = id ? this.member(id) : undefined;
      if (m && !m.connected) {
        const sub = this.nextFrom(m.team);
        if (sub && sub.id !== id) {
          const st = this.players.get(m.id)!;
          this.players.delete(m.id);
          this.players.set(sub.id, st);
          if (role === "chaser") this.chaserId = sub.id;
          else this.evaderId = sub.id;
          this.bump();
        }
      }
    }
  }

  private endChase(winner: "chaser" | "evader", reason: Reason, ticks: number): EngineEvent {
    const ev = this.member(this.evaderId!)!;
    const record: ChaseRecord = {
      n: this.sd ? this.chaseNo + this.sdRound + 1 : this.chaseNo + 1,
      sd: this.sd,
      chaser: this.chaserId!,
      evader: this.evaderId!,
      winner,
      reason,
      ticks,
      evTeam: ev.team,
    };
    if (this.sd) {
      this.sdTimes[ev.team] = winner === "evader" ? CHASE_TICKS : ticks;
      this.sdRound++;
    } else {
      if (winner === "evader") this.scores[ev.team]++;
      this.chaseNo++;
    }
    this.lastWinner = winner === "chaser" ? this.chaserId : this.evaderId;
    this.last = record;
    this.history.push(record);
    if (this.history.length > 40) this.history.shift();
    this.phase = "result";
    this.phaseEndTick = this.tick + RESULT_TICKS;
    this.bump();
    return { type: "chaseEnd", record };
  }

  private advance(): EngineEvent | null {
    const lw = this.lastWinner ? this.member(this.lastWinner) : undefined;
    let evTeam: Team;

    if (!this.sd) {
      if (this.chaseNo >= this.chases) {
        if (this.scores[0] !== this.scores[1]) {
          this.finish(this.scores[0] > this.scores[1] ? 0 : 1, "score");
          return { type: "finished" };
        }
        this.sd = true;
        this.sdRound = 0;
        this.sdTimes = [null, null];
        this.sdFirstTeam = lw ? lw.team : 0;
      }
    } else if (this.sdRound >= 2) {
      const [a, b] = this.sdTimes as [number, number];
      if (a !== b) {
        this.finish(a > b ? 0 : 1, "sd");
        return { type: "finished" };
      }
      // Eşitlik: yeni bir sudden death turu.
      this.sdRound = 0;
      this.sdTimes = [null, null];
      this.sdFirstTeam = lw ? lw.team : this.sdFirstTeam;
    }

    if (this.sd) {
      evTeam = this.sdRound === 0 ? this.sdFirstTeam : this.sdFirstTeam === 0 ? 1 : 0;
    } else {
      evTeam = lw ? lw.team : 0;
    }
    const chTeam: Team = evTeam === 0 ? 1 : 0;

    let evader: Member | null = lw && lw.team === evTeam && lw.connected ? lw : null;
    let chaser: Member | null = lw && lw.team === chTeam && lw.connected ? lw : null;
    if (evader) this.markUsed(evader);
    if (chaser) this.markUsed(chaser);
    evader = evader ?? this.nextFrom(evTeam);
    chaser = chaser ?? this.nextFrom(chTeam);
    if (!evader || !chaser) {
      this.finish(evader ? evTeam : chTeam, "forfeit");
      return { type: "finished" };
    }
    this.setupChase(chaser.id, evader.id);
    return null;
  }

  private finish(winner: Team, reason: "score" | "sd" | "forfeit") {
    this.phase = "finished";
    this.winner = winner;
    this.winReason = reason;
    this.chaserId = null;
    this.evaderId = null;
    this.players.clear();
    // Maç sırasında kopanları listeden çıkar.
    this.members = this.members.filter((m) => m.connected);
    if (this.host && !this.member(this.host)) this.host = this.members[0]?.id ?? null;
    this.bump();
  }

  private toLobby() {
    this.phase = "lobby";
    this.chaserId = null;
    this.evaderId = null;
    this.players.clear();
    this.members = this.members.filter((m) => m.connected);
    this.host = this.members[0]?.id ?? null;
    this.bump();
  }

  // ---------- Serileştirme ----------

  publicState(): PublicState {
    return {
      v: this.version,
      phase: this.phase,
      members: this.members.map((m) => ({ ...m })),
      host: this.host,
      chases: this.chases,
      layoutId: this.inMatch() || this.phase === "finished" ? this.layout.id : this.layoutChoice,
      scores: [...this.scores] as [number, number],
      chaseNo: this.chaseNo,
      sd: this.sd,
      sdTimes: [...this.sdTimes] as [number | null, number | null],
      chaserId: this.chaserId,
      evaderId: this.evaderId,
      phaseEndTick: this.phaseEndTick,
      chaseStartTick: this.chaseStartTick,
      last: this.last,
      history: this.history.slice(-20),
      winner: this.winner,
      winReason: this.winReason,
    };
  }

  /** Hibernation'dan dönüşte lobi bilgisini geri yüklemek için kalıcı kısım. */
  persistable() {
    return {
      members: this.members,
      host: this.host,
      chases: this.chases,
      layoutChoice: this.layoutChoice,
      phase: this.phase === "finished" ? "finished" : "lobby",
      scores: this.scores,
      winner: this.winner,
      winReason: this.winReason,
      history: this.history.slice(-20),
      layoutId: this.layout.id,
    };
  }

  restore(data: ReturnType<MatchEngine["persistable"]>) {
    this.members = data.members.map((m) => ({ ...m, connected: false }));
    this.host = data.host;
    this.chases = data.chases;
    this.layoutChoice = data.layoutChoice;
    this.phase = data.phase as Phase;
    this.scores = data.scores;
    this.winner = data.winner;
    this.winReason = data.winReason;
    this.history = data.history;
    this.layout = getLayout(data.layoutId);
    this.bump();
  }
}
