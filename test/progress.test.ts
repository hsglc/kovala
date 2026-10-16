import { describe, expect, it } from "vitest";
import { ACT_KICK } from "../src/shared/sim";
import { getProgress, levelInfo, onProgress, recordChase, recordMove } from "../src/client/lib/progress";

describe("ilerleme", () => {
  it("seviye eşikleri artar", () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(100 + 160).level).toBe(3);
  });
  it("chase XP verir, görev ilerler ve tamamlanınca yenisi gelir", () => {
    const notes: string[] = [];
    onProgress((n) => notes.push(n.kind));
    const before = getProgress().xp;
    recordChase({ n: 1, sd: false, chaser: "x", evader: "me", winner: "evader", reason: "time", ticks: 600, evTeam: 0 }, "me", "kafes");
    expect(getProgress().xp).toBeGreaterThanOrEqual(before + 40);
    for (let i = 0; i < 40; i++) recordMove(ACT_KICK);
    expect(getProgress().missions.length).toBe(3);
    expect(notes).toContain("xp");
  });
});
