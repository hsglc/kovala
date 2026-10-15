import { useEffect, useRef, useState } from "react";
import { CLIMB_COST, DIVE_COST, JUKE_COST, KICK_COST } from "../../shared/constants";
import type { PublicState } from "../../shared/engine";
import { ACT_CLIMB, ACT_DIVE, ACT_JUKE, ACT_KICK, ACT_KONG, ACT_NONE, ACT_STUMBLE, ACT_VAULT, parkourPreview } from "../../shared/sim";
import { TEAM_COLORS, memberName, resultLine, resultTitle, teamName } from "../lib/text";
import { isMuted, setMuted, sfx, unlockAudio, vibrate } from "../lib/sound";
import type { GameSource } from "../net/types";
import { computeView, drawFrame, type JoyVisual } from "./renderer";

interface Props {
  source: GameSource;
  state: PublicState;
  onLeave: () => void;
}

export function GameScreen({ source, state, onLeave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      // Joystick bölgesi: ekranın sol yarısı, sahanın altından ekranın dibine (dikeyde); yatayda tüm sol kısım.
      joy.zoneX = 0;
      joy.zoneW = rect.width * 0.55;
      joy.zoneY = view.portrait ? view.qy + view.qs + 8 : 0;
      joy.zoneH = rect.height - joy.zoneY;
      if (joy.zoneH < 160) {
        joy.zoneY = rect.height * 0.45;
        joy.zoneH = rect.height - joy.zoneY;
      }
      wrap.dataset.portrait = view.portrait ? "1" : "0";
      wrap.style.setProperty("--quad-bottom", `${view.qy + view.qs}px`);
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

    const local = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top] as const;
    };
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      const t = e.target as HTMLElement;
      if (t.closest("button")) return;
      if (joy.active) return;
      const [x, y] = local(e);
      // Sağ taraf tuşlara ayrılmış; sahanın üstüne basınca da joystick açılır (sol yarı).
      if (x > joy.zoneW && y > joy.zoneY) return;
      joy.active = true;
      joy.id = e.pointerId;
      joy.ox = joy.x = x;
      joy.oy = joy.y = y;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
      updateMove();
    };
    const onMove = (e: PointerEvent) => {
      if (!joy.active || e.pointerId !== joy.id) return;
      const [x, y] = local(e);
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
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== joy.id) return;
      joy.active = false;
      joy.id = -1;
      updateMove();
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);

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

    let raf = 0;
    let lastDigit = -1;
    let lastPhase = "";
    let lastLabel = "";
    let lastDisabled = false;
    let lastLabel2 = "";
    let lastDisabled2 = false;
    let lastAk = 0;
    let lastPing = -2;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const f = source.frame(now);
      const layout = source.layout();
      drawFrame(ctx, view, layout, s, f.players, source.selfId, joy, now);

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
        label = kind === ACT_CLIMB ? "TIRMAN" : kind === ACT_VAULT ? "ATLA" : kind === ACT_KICK ? "SEK" : "PARKUR";
        const cost = kind === ACT_CLIMB ? CLIMB_COST : kind === ACT_KICK ? KICK_COST : kind === ACT_VAULT ? 0 : 1e9;
        const busy = f.self.cd > 0 || f.self.ak !== 0;
        disabled = kind === ACT_NONE || f.self.st < cost || busy;
        const cost2 = myRole === "chaser" ? DIVE_COST : JUKE_COST;
        disabled2 = f.self.st < cost2 || busy;
        if (f.self.ak !== lastAk && f.self.ak !== 0 && f.self.ak !== ACT_STUMBLE) {
          if (f.self.ak === ACT_VAULT || f.self.ak === ACT_KONG || f.self.ak === ACT_CLIMB) sfx.vault();
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
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
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
      <canvas ref={canvasRef} className="game-canvas" />

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
          Sol tarafı sürükle: koş · Kutular otomatik atlanır
          <br />
          {role === "evader" ? "SIÇRA: ani yön değişimi · TIRMAN/SEK: duvarı kullan" : "DALIŞ: uzun erişim, sonra tökezlersin"}
        </div>
      )}
    </div>
  );
}
