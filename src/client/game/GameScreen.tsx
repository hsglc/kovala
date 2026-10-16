import { useCallback, useEffect, useRef, useState } from "react";
import { CHAIN_KICK_COST, CLIMB_COST, DIVE_COST, FEINT_COST, JUKE_COST, JUMP_COST, KICK_COST, ROLL_COST } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import { ACT_CLIMB, ACT_JUMP, ACT_KICK, ACT_KONG, ACT_SLIDE, ACT_STUMBLE, ACT_VAULT, parkourPreview, ACT_ROLL, groundAt, type PlayerState } from "../../shared/sim";
import { TEAM_COLORS, memberName, resultLine, resultTitle, teamName } from "../lib/text";
import { music } from "../lib/music";
import { recordMove } from "../lib/progress";
import { isMuted, setMuted, sfx, unlockAudio, vibrate } from "../lib/sound";
import type { GameSource } from "../net/types";
import { computeView, drawOverlay, updateCamera, HUD_TOP, type Camera, type JoyVisual } from "./renderer";
import { Scene3D } from "./three/Scene3D";
import { ExitIcon, LeaveDialog } from "../ui/LeaveDialog";
import { RotatePrompt, goLandscape, leaveLandscape, useRotatePrompt } from "../ui/RotatePrompt";

interface Props {
  source: GameSource;
  state: PublicState;
  onLeave: () => void;
}

export function GameScreen({ source, state, onLeave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLDivElement>(null);
  const digitRef = useRef<HTMLDivElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);
  const actLabelRef = useRef<HTMLSpanElement>(null);
  const act2Ref = useRef<HTMLButtonElement>(null);
  const act2LabelRef = useRef<HTMLSpanElement>(null);
  const pingRef = useRef<HTMLSpanElement>(null);
  const muteRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Çıkış penceresi açıkken oyun girdileri yok sayılır
  const modalRef = useRef(false);
  const resetInputRef = useRef<() => void>(() => {});

  // Ses ve titreşim: chase sonuçları
  const lastSeen = useRef<string>("");
  // Maç müziği: ekran açılınca (ilk geri sayım) başlar, maç bitince ya da çıkınca susar
  useEffect(() => {
    music.start();
    return () => music.stop();
  }, []);

  useEffect(() => {
    const r = state.last;
    if (state.phase !== "result" || !r) return;
    const key = `${r.n}-${r.sd}-${r.chaser}`;
    if (lastSeen.current === key) return;
    lastSeen.current = key;
    if (r.reason === "tag" || (r.reason === "out" && r.winner === "chaser")) {
      sfx.tag();
      if (r.evader === source.selfId || r.chaser === source.selfId) vibrate([60, 40, 120]);
    } else {
      sfx.evade();
      if (r.evader === source.selfId) vibrate(40);
    }
  }, [state, source.selfId]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const scene = new Scene3D(wrap);
    let view = computeView(1, 1, 1);
    const joy: JoyVisual & { id: number } = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, r: 56, zoneX: 0, zoneY: 0, zoneW: 0, zoneH: 0 };
    const keys = new Set<string>();
    let move = { mx: 0, my: 0 };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      view = computeView(rect.width, rect.height, dpr);
      scene.resize(rect.width, rect.height, dpr);
      // Joystick bölgesi: ekranın sol %58'i, HUD'un altından ekranın dibine.
      joy.zoneX = 0;
      joy.zoneW = rect.width * 0.58;
      joy.zoneY = HUD_TOP;
      joy.zoneH = rect.height - joy.zoneY;
      wrap.dataset.portrait = view.portrait ? "1" : "0";
      wrap.style.setProperty("--quad-bottom", `${rect.height * 0.62}px`);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const updateMove = () => {
      let mx = 0;
      let my = 0;
      if (joy.active) {
        mx = (joy.x - joy.ox) / joy.r;
        my = (joy.y - joy.oy) / joy.r;
      } else {
        if (keys.has("ArrowLeft") || keys.has("KeyA")) mx -= 1;
        if (keys.has("ArrowRight") || keys.has("KeyD")) mx += 1;
        if (keys.has("ArrowUp") || keys.has("KeyW")) my -= 1;
        if (keys.has("ArrowDown") || keys.has("KeyS")) my += 1;
      }
      const l = Math.hypot(mx, my);
      if (l > 1) {
        mx /= l;
        my /= l;
      }
      // Ekran yönünden saha yönüne: kamera döndüyse joystick de döner (yukarı her zaman ekranda yukarı)
      const yaw = scene.yaw;
      if (yaw) {
        const c = Math.cos(yaw);
        const s2 = Math.sin(yaw);
        const wx = c * mx + s2 * my;
        const wy = -s2 * mx + c * my;
        mx = wx;
        my = wy;
      }
      move = { mx, my };
      source.setMove(mx, my);
    };

    // Joystick: dokunmatikte touch olayları (iOS pointer'ı kaydırma sanıp iptal edebiliyor), masaüstünde fare.
    const rectOf = () => wrap.getBoundingClientRect();
    const beginJoy = (id: number, x: number, y: number) => {
      if (joy.active) return false;
      if (x > joy.zoneW || y < joy.zoneY) return false;
      joy.active = true;
      joy.id = id;
      joy.ox = joy.x = x;
      joy.oy = joy.y = y;
      updateMove();
      return true;
    };
    const moveJoy = (x: number, y: number) => {
      let dx = x - joy.ox;
      let dy = y - joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > joy.r) {
        // Yüzen joystick: parmak dışarı kaçarsa merkez peşinden gelir.
        const k = (l - joy.r) / l;
        joy.ox += dx * k;
        joy.oy += dy * k;
        dx = x - joy.ox;
        dy = y - joy.oy;
      }
      joy.x = joy.ox + dx;
      joy.y = joy.oy + dy;
      updateMove();
    };
    const endJoy = () => {
      joy.active = false;
      joy.id = -1;
      updateMove();
    };
    let usingTouch = false;
    const onTouchStart = (e: TouchEvent) => {
      usingTouch = true;
      if (modalRef.current) return;
      unlockAudio();
      const r = rectOf();
      for (const t of Array.from(e.changedTouches)) {
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        if (el?.closest("button")) continue;
        if (beginJoy(t.identifier, t.clientX - r.left, t.clientY - r.top)) e.preventDefault();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!joy.active) return;
      const r = rectOf();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joy.id) {
          moveJoy(t.clientX - r.left, t.clientY - r.top);
          e.preventDefault();
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === joy.id) endJoy();
    };
    wrap.addEventListener("touchstart", onTouchStart, { passive: false });
    wrap.addEventListener("touchmove", onTouchMove, { passive: false });
    wrap.addEventListener("touchend", onTouchEnd);
    wrap.addEventListener("touchcancel", onTouchEnd);

    const onMouseDown = (e: MouseEvent) => {
      if (usingTouch || modalRef.current) return;
      if ((e.target as HTMLElement).closest("button")) return;
      unlockAudio();
      const r = rectOf();
      if (beginJoy(-2, e.clientX - r.left, e.clientY - r.top)) e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!joy.active || joy.id !== -2) return;
      const r = rectOf();
      moveJoy(e.clientX - r.left, e.clientY - r.top);
    };
    const onMouseUp = () => {
      if (joy.id === -2) endJoy();
    };
    wrap.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    const noCtx = (e: Event) => e.preventDefault();
    wrap.addEventListener("contextmenu", noCtx);

    const ACT2_KEYS = ["Space", "KeyJ", "Enter"];
    const ACT_KEYS = ["ShiftLeft", "ShiftRight", "KeyK", "KeyE"];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || modalRef.current) return;
      if (ACT2_KEYS.includes(e.code) || ACT_KEYS.includes(e.code)) {
        e.preventDefault();
        if (e.type === "keydown") {
          unlockAudio();
          if (ACT2_KEYS.includes(e.code)) source.pressAction2();
          else source.pressAction();
        }
        return;
      }
      if (e.code.startsWith("Arrow") || ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
        if (e.type === "keydown") keys.add(e.code);
        else keys.delete(e.code);
        updateMove();
      }
    };
    const onBlur = () => {
      keys.clear();
      joy.active = false;
      updateMove();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    resetInputRef.current = onBlur;

    const cam: Camera = { x: 6, y: 6, zoom: 0, init: false };
    let lastNow = 0;
    let raf = 0;
    let lastDigit = -1;
    let lastPhase = "";
    let lastLabel = "";
    let lastDisabled = false;
    let lastLabel2 = "";
    let lastDisabled2 = false;
    let lastAk = 0;
    let lastPing = -2;
    let lastChaseTick = -1;
    let lastTime = "";
    let lastLow = "";
    // Yavaş çekim tekrar: chase boyunca son 2,5 sn kaydedilir, sonuç ekranında %45 hızla oynatılır
    const rec: { t: number; players: Map<string, PlayerState> }[] = [];
    let replay: { start: number; base: number; frames: typeof rec } | null = null;
    const REPLAY_SPEED = 0.45;
    const REPLAY_SPAN = 1600;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const f = source.frame(now);
      const layout = source.layout();
      // Kamera hedefi: kendi karakterin; izliyorsan iki oyuncunun ortası; lobide saha merkezi.
      const dtc = lastNow ? Math.min(100, now - lastNow) : 16;
      lastNow = now;
      const me = f.players.get(source.selfId) ?? null;
      let other: { x: number; y: number } | null = null;
      for (const [id, p] of f.players) if (id !== source.selfId) other = p;
      if (s.phase === "countdown") cam.init = cam.init && s.chaseStartTick === lastChaseTick;
      lastChaseTick = s.chaseStartTick;
      void me; void other; void dtc; void cam; void updateCamera;
      if (s.phase === "chase") {
        // frame() her karede yeni nesneler döndürür; kopyalamaya gerek yok
        rec.push({ t: now, players: f.players });
        while (rec.length && now - rec[0].t > 2500) rec.shift();
      }
      if (s.phase === "result" && lastPhase === "chase" && rec.length > 10) {
        const end = rec[rec.length - 1].t;
        replay = { start: now, base: now, frames: rec.filter((r) => r.t >= end - REPLAY_SPAN) };
        rec.length = 0;
        if (replayRef.current) replayRef.current.dataset.on = "1";
      }
      if (replay && s.phase !== "result") {
        replay = null;
        if (replayRef.current) replayRef.current.dataset.on = "0";
      }
      if (s.phase === "chase" && lastPhase !== "chase") rec.length = 0;
      let drawPlayers = f.players;
      let drawState = s;
      let drawNow = now;
      if (replay) {
        const el = (now - replay.start) * REPLAY_SPEED;
        const fr = replay.frames;
        const tt = Math.min(fr[0].t + el, fr[fr.length - 1].t);
        let i = 0;
        while (i < fr.length - 2 && fr[i + 1].t < tt) i++;
        const a = fr[i];
        const b = fr[Math.min(i + 1, fr.length - 1)];
        const k = b.t > a.t ? Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t))) : 0;
        drawPlayers = new Map();
        for (const [id, pa] of a.players) {
          const pb = b.players.get(id) ?? pa;
          drawPlayers.set(id, { ...pa, x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, h: pa.h + (pb.h - pa.h) * k });
        }
        drawState = { ...s, phase: "chase" };
        drawNow = replay.base + el;
      }
      const proj = scene.render(layout, drawState, drawPlayers, source.selfId, drawNow);
      drawOverlay(ctx, view, layout, drawState, drawPlayers, proj, source.selfId, joy);

      // Saat
      let t = 20;
      if (s.phase === "chase") t = Math.max(0, (s.phaseEndTick - f.tick) / 30);
      else if (s.phase === "result" && s.last) t = Math.max(0, 20 - s.last.ticks / 30);
      // DOM'a yalnızca değer değişince yaz (her karede yazmak yeniden yerleşim/boyama tetikler)
      const tText = t.toFixed(1).replace(".", ",");
      const tLow = s.phase === "chase" && t < 5 ? "1" : "0";
      if (timeRef.current && (tText !== lastTime || tLow !== lastLow)) {
        timeRef.current.textContent = tText;
        timeRef.current.dataset.low = tLow;
        lastTime = tText;
        lastLow = tLow;
      }

      // Geri sayım
      if (s.phase === "countdown") {
        const d = Math.max(1, Math.ceil((s.phaseEndTick - f.tick) / 30));
        if (d !== lastDigit) {
          lastDigit = d;
          if (digitRef.current) digitRef.current.textContent = String(d);
          if (d <= 3) sfx.tick();
        }
      } else lastDigit = -1;
      if (s.phase !== lastPhase) {
        if (s.phase === "chase" && lastPhase === "countdown") sfx.go();
        lastPhase = s.phase;
      }

      // Aksiyon tuşları
      const myRole = s.chaserId === source.selfId ? "chaser" : s.evaderId === source.selfId ? "evader" : null;
      const active = s.phase === "chase" && !!myRole;
      let label = "PARKUR";
      let disabled = !active;
      let label2 = myRole === "chaser" ? "DALIŞ" : "SIÇRA";
      let disabled2 = !active;
      if (active && f.self) {
        const kind = parkourPreview(f.self, { mx: move.mx, my: move.my, act: false, act2: false }, layout);
        const air = f.self.h > groundAt(f.self.x, f.self.y, layout) + 0.35;
        label =
          kind === ACT_ROLL
            ? "TAKLA"
            : kind === ACT_CLIMB
              ? "TIRMAN"
              : kind === ACT_VAULT
                ? "ATLA"
                : kind === ACT_SLIDE
                  ? "KAY"
                  : kind === ACT_KICK
                    ? air
                      ? "TIC-TAC"
                      : "DUVAR"
                    : "ZIPLA";
        const cost =
          kind === ACT_CLIMB ? CLIMB_COST : kind === ACT_KICK ? (air ? CHAIN_KICK_COST : KICK_COST) : kind === ACT_JUMP ? JUMP_COST : kind === ACT_ROLL ? ROLL_COST : 0;
        const busy = air ? false : f.self.cd > 0 || f.self.ak !== 0;
        disabled = f.self.st < cost || busy;
        const feint = myRole === "evader" && Math.hypot(move.mx, move.my) < 0.05 && Math.hypot(f.self.vx, f.self.vy) > 2;
        if (myRole === "evader") label2 = feint ? "SAHTE" : "SIÇRA";
        const cost2 = myRole === "chaser" ? DIVE_COST : feint ? FEINT_COST : JUKE_COST;
        const busy2 = f.self.cd > 0 || f.self.ak !== 0;
        disabled2 = f.self.st < cost2 || busy2;
        if (f.self.ak !== lastAk && f.self.ak !== 0 && f.self.ak !== ACT_STUMBLE) {
          recordMove(f.self.ak);
          if (f.self.ak === ACT_VAULT || f.self.ak === ACT_KONG || f.self.ak === ACT_CLIMB || f.self.ak === ACT_JUMP || f.self.ak === ACT_SLIDE) sfx.vault();
          else sfx.dash();
        }
        lastAk = f.self.ak;
      }
      if (label !== lastLabel && actLabelRef.current) {
        actLabelRef.current.textContent = label;
        lastLabel = label;
      }
      if (disabled !== lastDisabled && actRef.current) {
        actRef.current.dataset.disabled = disabled ? "1" : "0";
        lastDisabled = disabled;
      }
      if (label2 !== lastLabel2 && act2LabelRef.current) {
        act2LabelRef.current.textContent = label2;
        lastLabel2 = label2;
      }
      if (disabled2 !== lastDisabled2 && act2Ref.current) {
        act2Ref.current.dataset.disabled = disabled2 ? "1" : "0";
        lastDisabled2 = disabled2;
      }
      const ping = source.getPing() ?? -1;
      if (ping !== lastPing && pingRef.current) {
        pingRef.current.textContent = ping >= 0 ? `${ping} ms` : "";
        lastPing = ping;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
      wrap.removeEventListener("touchstart", onTouchStart);
      wrap.removeEventListener("touchmove", onTouchMove);
      wrap.removeEventListener("touchend", onTouchEnd);
      wrap.removeEventListener("touchcancel", onTouchEnd);
      wrap.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      wrap.removeEventListener("contextmenu", noCtx);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      source.setMove(0, 0);
    };
  }, [source]);

  const s = state;
  const me = source.selfId;
  const role = s.chaserId === me ? "chaser" : s.evaderId === me ? "evader" : null;
  const chaser = memberName(s, s.chaserId);
  const evader = memberName(s, s.evaderId);
  const myTeam = s.members.find((m) => m.id === me)?.team;
  const chTeam = s.members.find((m) => m.id === s.chaserId)?.team;
  const pickRole: "chaser" | "evader" | null =
    s.phase === "countdown" && myTeam !== undefined && s.pick
      ? myTeam === chTeam
        ? s.pick.chaser
          ? "chaser"
          : null
        : s.pick.evader
          ? "evader"
          : null
      : null;
  const mates = myTeam !== undefined ? s.members.filter((m) => m.team === myTeam && m.connected) : [];
  const activeMate = pickRole === "chaser" ? s.chaserId : pickRole === "evader" ? s.evaderId : null;
  const showPick = !!pickRole && mates.length > 1;
  const chaseLabel = source.survival
    ? `SERİ ${source.survival.streak}`
    : s.sd ? "SUDDEN DEATH" : `CHASE ${Math.min(s.chaseNo + 1, s.chases)}/${s.chases}`;
  const last = s.last;

  // Çıkış: onay penceresi. Yerel oyunda pencere açıkken oyun durur.
  const [askLeave, setAskLeave] = useState(false);
  // Yatay oyun: dikey tutuluyorsa "yan çevir" katmanı; yerel oyunda çevrilene kadar bekler
  const rot = useRotatePrompt();
  useEffect(() => {
    modalRef.current = askLeave || rot.shown;
    if (rot.shown) resetInputRef.current();
    source.setPaused?.(askLeave || rot.shown);
  }, [askLeave, rot.shown, source]);
  // Maç ekranı açılırken (Başlat dokunuşunun hemen ardından) Android'de tam ekran yatay kilidi dene; çıkınca bırak
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    void goLandscape();
    return () => leaveLandscape();
  }, []);
  const openLeave = () => {
    resetInputRef.current();
    setAskLeave(true);
  };
  const stay = useCallback(() => {
    setAskLeave(false);
  }, []);
  const inMatch = s.phase === "countdown" || s.phase === "chase" || s.phase === "result";
  const mateLeft = s.members.some((m) => m.id !== me && m.team === myTeam && m.connected);
  const leaveText = source.survival
    ? { title: "Seri bitsin mi?", body: `${source.survival.streak} kaçışlık serin burada biter. En iyin: ${source.survival.best}.` }
    : source.kind === "local"
      ? { title: "Antrenmandan çık?", body: "Maç yarıda kalır, bu maçın skoru sayılmaz." }
      : !inMatch
        ? { title: "Odadan çık?", body: "Arkadaşların odada kalır, kodla tekrar katılabilirsin." }
        : mateLeft
          ? { title: "Maçtan çık?", body: "Takımın sensiz devam eder. Geri dönemezsin." }
          : { title: "Maçtan çık?", body: "Maçı hükmen kaybedersin, puan rakibe yazılır." };

  return (
    <div className="game" ref={wrapRef}>
      <canvas ref={canvasRef} className="game-canvas overlay" />

      <div className="hud-top">
        <button className="icon-btn exit-btn" onClick={openLeave} aria-label="Maçtan çık" aria-haspopup="dialog">
          <ExitIcon />
        </button>
        <div className="scorebug">
          <div className="sb-team" style={{ ["--c" as string]: TEAM_COLORS[0] }}>
            <span className="sb-name">{teamName(0)}</span>
            <b>{s.scores[0]}</b>
          </div>
          <div className="sb-clock">
            <div className="sb-time" ref={timeRef}>
              20,0
            </div>
            <div className="sb-sub">{chaseLabel}</div>
          </div>
          <div className="sb-team right" style={{ ["--c" as string]: TEAM_COLORS[1] }}>
            <b>{s.scores[1]}</b>
            <span className="sb-name">{teamName(1)}</span>
          </div>
        </div>
        <button
          className="icon-btn"
          ref={muteRef}
          onClick={(e) => {
            setMuted(!isMuted());
            e.currentTarget.textContent = isMuted() ? "🔇" : "🔊";
          }}
          aria-label="Ses"
        >
          {isMuted() ? "🔇" : "🔊"}
        </button>
      </div>

      {s.phase === "countdown" && (
        <div className="banner" key={`cd-${s.phaseEndTick}`}>
          {s.sd && <div className="banner-tag">SUDDEN DEATH</div>}
          <div className={`banner-title ${role ?? "spec"}`}>
            {role === "chaser" ? "KOVALA!" : role === "evader" ? "KAÇ!" : "İZLE"}
          </div>
          <div className="banner-digit" ref={digitRef}>
            3
          </div>
          <div className="banner-line">
            <span className="chip chaser">◆ {chaser}</span>
            <span className="vs">kovalıyor</span>
            <span className="chip evader">● {evader}</span>
          </div>
        </div>
      )}

      {showPick && (
        <div className="pick-panel" key={`pk-${s.phaseEndTick}`}>
          <div className="pick-title">Sahaya kim girsin? <span>{pickRole === "chaser" ? "◆ kovalayan" : "● kaçan"}</span></div>
          <div className="pick-row">
            {mates.map((m) => (
              <button
                key={m.id}
                className={`pick-chip ${activeMate === m.id ? "on" : ""}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  source.pick(m.id);
                }}
              >
                {m.id === me ? "Ben" : m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="replay-badge" ref={replayRef} data-on="0">
        <span className="rec-dot" /> TEKRAR · YAVAŞ ÇEKİM
      </div>

      {s.phase === "result" && last && (
        <div className={`banner result replay-top ${last.winner}`} key={`r-${last.n}-${last.sd}`}>
          <div className="banner-title">{resultTitle(last)}</div>
          <div className="banner-line">{resultLine(s, last)}</div>
          {!last.sd && last.winner === "evader" && last.reason !== "forfeit" && (
            <div className="banner-point" style={{ color: TEAM_COLORS[last.evTeam] }}>
              +1 {teamName(last.evTeam)}
            </div>
          )}
        </div>
      )}

      {s.phase === "chase" && !role && <div className="spectating">İzliyorsun · sıran gelince sahaya gireceksin</div>}

      {rot.shown && !askLeave && <RotatePrompt online={source.kind === "online"} onPortrait={rot.keepPortrait} />}

      {askLeave && (
        <LeaveDialog title={leaveText.title} body={leaveText.body} stayLabel="Maça dön" leaveLabel="Çık" onStay={stay} onLeave={onLeave} />
      )}

      <div className="hud-corner">
        <span ref={pingRef} />
      </div>

      <div className="action-cluster">
        <button
          className="action-btn secondary"
          ref={actRef}
          data-disabled="1"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudio();
            source.pressAction();
          }}
          aria-label="Parkur"
        >
          <span ref={actLabelRef}>PARKUR</span>
        </button>
        <button
          className={`action-btn primary ${role === "chaser" ? "chaser" : ""}`}
          ref={act2Ref}
          data-disabled="1"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudio();
            source.pressAction2();
          }}
          aria-label="Rol hamlesi"
        >
          <span ref={act2LabelRef}>{role === "chaser" ? "DALIŞ" : "SIÇRA"}</span>
        </button>
      </div>

      {s.phase === "countdown" && role && (
        <div className="control-hint">
          Solu sürükle: koş
          <br />
          {role === "evader" ? "SIÇRA: ani yön değişimi" : "DALIŞ: uzun erişim"}
        </div>
      )}
    </div>
  );
}
