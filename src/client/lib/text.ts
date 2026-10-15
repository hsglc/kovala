import type { ChaseRecord, Member, PublicState, Team } from "../../shared/engine";

export const TEAM_NAMES = ["Kırmızı", "Mavi"] as const;
export const TEAM_COLORS = ["#ff5a4f", "#35b8ff"] as const;
export const TEAM_DARK = ["#a8302a", "#1a6fa3"] as const;

export function teamName(t: Team | number) {
  return TEAM_NAMES[t as 0 | 1];
}

export function memberName(s: PublicState | null, id: string | null | undefined) {
  if (!s || !id) return "?";
  return s.members.find((m) => m.id === id)?.name ?? "?";
}

export function memberTeam(s: PublicState | null, id: string | null | undefined): Team | null {
  if (!s || !id) return null;
  return s.members.find((m) => m.id === id)?.team ?? null;
}

export function secs(ticks: number) {
  return (ticks / 30).toFixed(1).replace(".", ",");
}

export function resultTitle(r: ChaseRecord): string {
  if (r.reason === "tag") return "YAKALADI!";
  if (r.reason === "out") return "SAHA DIŞI!";
  if (r.reason === "forfeit") return "HÜKMEN";
  return r.sd ? "KAÇTI!" : "KAÇTI! +1";
}

export function resultLine(s: PublicState, r: ChaseRecord): string {
  const ch = memberName(s, r.chaser);
  const ev = memberName(s, r.evader);
  if (r.reason === "tag") return `${ch}, ${ev} oyuncusunu ${secs(r.ticks)} sn'de yakaladı`;
  if (r.reason === "out") return r.winner === "chaser" ? `${ev} sahadan çıktı` : `${ch} sahadan çıktı, puan ${teamName(r.evTeam)} takımına`;
  if (r.reason === "forfeit") return "Rakip bağlantıyı kaybetti";
  return `${ev} 20 saniye boyunca yakalanmadı`;
}

export function sortedTeam(members: Member[], team: Team) {
  return members.filter((m) => m.team === team);
}
