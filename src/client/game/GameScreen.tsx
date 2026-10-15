import { useEffect, useRef, useState } from "react";
import { CLIMB_COST, DIVE_COST, JUKE_COST, JUMP_COST, KICK_COST } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import { ACT_CLIMB, ACT_JUMP, ACT_KICK, ACT_KONG, ACT_SLIDE, ACT_STUMBLE, ACT_VAULT, parkourPreview } from "../../shared/sim";
import { TEAM_COLORS, memberName, resultLine, resultTitle, teamName } from "../lib/text";
import { isMuted, setMuted, sfx, unlockAudio, vibrate } from "../lib/sound";
import type { GameSource } from "../net/types";
import { computeView, drawOverlay, updateCamera, HUD_TOP, type Camera, type JoyVisual } from "./renderer";
import { Scene3D } from "./three/Scene3D";

interface Props {
  source: GameSource;
  state: PublicState;
  onLeave: () => void;
}

export function GameScreen({ source, state, onLeave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const digitRef = useRef<HTMLDivElement>(null);
  const actRef = useRef<HTMLButtonElement>(null);
  const actLabelRef = useRef<HTMLSpanElement>(null);
  const act2Ref = useRef<HTMLButtonElement>(null);
  const act2LabelRef = useRef<HTMLSpanElement>(null);
  const pingRef = useRef<HTMLSpanElement>(null);
  const muteRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Ses ve titreşim: chase sonuçları
  const lastSeen = useRef<string>("");
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
    const scene = new Scene3D(glRef.current!);
    let view = computeView(1, 1, 1);
    const joy: JoyVisual & { id: number } = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, r: 56, zoneX: 0, zoneY: 0, zoneW: 0, zoneH: 0 };
    const keys = new Set<string>();
    let move = { mx: 0, my: 0 };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
      if (usingTouch) return;
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
      if (e.repeat) return;
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

    const cam: Camera = { x: 6, y: 6, init: false };
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
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const f = source.frame(now);
      const layout = source.layout();
      // Kamera hedefi: kendi karakterin; izliyorsan iki oyuncunun ortası; lobide saha merkezi.
      const dtc = lastNow ? Math.min(100, now - lastNow) : 16;
      lastNow = now;
      const me = f.players.get(source.selfId);
      let tx = 6;
      let ty = 6;
      if (me) {
        tx = me.x;
        ty = me.y;
      } else if (f.players.size) {
        let sx = 0;
        let sy = 0;
        for (const p of f.players.values()) {
          sx += p.x;
          sy += p.y;
        }
        tx = sx / f.players.size;
        ty = sy / f.players.size;
      }
      if (s.phase === "countdown") cam.init = cam.init && s.chaseStartTick === lastChaseTick;
      lastChaseTick = s.chaseStartTick;
      updateCamera(cam, tx, ty, dtc);
      const proj = scene.render(layout, s, f.players, source.selfId, cam, now);
      drawOverlay(ctx, view, layout, s, f.players, proj, source.selfId, joy);

      // Saat
      let t = 20;
      if (s.phase === "chase") t = Math.max(0, (s.phaseEndTick - f.tick) / 30);
      else if (s.phase === "result" && s.last) t = Math.max(0, 20 - s.last.ticks / 30);
      if (timeRef.current) {
        timeRef.current.textContent = t.toFixed(1).replace(".", ",");
        timeRef.current.dataset.low = s.phase === "chase" && t < 5 ? "1" : "0";
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
        label =
          kind === ACT_CLIMB ? "TIRMAN" : kind === ACT_VAULT ? "ATLA" : kind === ACT_SLIDE ? "KAY" : kind === ACT_KICK ? "SEK" : "ZIPLA";
        const cost = kind === ACT_CLIMB ? CLIMB_COST : kind === ACT_KICK ? KICK_COST : kind === ACT_JUMP ? JUMP_COST : 0;
        const busy = f.self.cd > 0 || f.self.ak !== 0;
        disabled = f.self.st < cost || busy;
        const cost2 = myRole === "chaser" ? DIVE_COST : JUKE_COST;
        disabled2 = f.self.st < cost2 || busy;
        if (f.self.ak !== lastAk && f.self.ak !== 0 && f.self.ak !== ACT_STUMBLE) {
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
  const chaseLabel = s.sd ? "SUDDEN DEATH" : `CHASE ${Math.min(s.chaseNo + 1, s.chases)}/${s.chases}`;
  const last = s.last;

  // Tarayıcı onay penceresi yerine sayfa içi iki dokunuşlu onay.
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (!confirmLeave) return;
    const t = setTimeout(() => setConfirmLeave(false), 2500);
    return () => clearTimeout(t);
  }, [confirmLeave]);
  const leave = () => {
    if (confirmLeave) onLeave();
    else setConfirmLeave(true);
  };

  return (
    <div className="game" ref={wrapRef}>
      <canvas ref={glRef} className="game-canvas" />
      <canvas ref={canvasRef} className="game-canvas overlay" />

      <div className="hud-top">
        <button className={`icon-btn ${confirmLeave ? "confirm" : ""}`} onClick={leave} aria-label="Maçtan çık">
          ✕
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

      {s.phase === "result" && last && (
        <div className={`banner result ${last.winner}`} key={`r-${last.n}-${last.sd}`}>
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

      {confirmLeave && <div className="leave-hint">Çıkmak için ✕'e tekrar dokun</div>}

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
          Sol tarafı sürükle: koş · Kutular atlanır, barların altından kayılır
          <br />
          {role === "evader" ? "SIÇRA: ani yön değişimi · TIRMAN/SEK: duvarı kullan" : "DALIŞ: uzun erişim, sonra tökezlersin"}
        </div>
      )}
    </div>
  );
}
