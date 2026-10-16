import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  body: string;
  stayLabel: string;
  leaveLabel: string;
  onStay: () => void;
  onLeave: () => void;
}

/**
 * Maçtan çıkış onayı. Oyun dokunuşlarını dinleyen kabın dışına (body) taşınır,
 * böylece pencereye dokunmak joystick başlatmaz. Esc kapatır, odak "Maça dön"de başlar.
 */
export function LeaveDialog({ title, body, stayLabel, leaveLabel, onStay, onLeave }: Props) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onStay();
      } else if (e.key === "Tab") {
        // Odak iki düğme arasında kalsın
        e.preventDefault();
        (document.activeElement === stayRef.current ? leaveRef : stayRef).current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onStay]);

  return createPortal(
    <div className="leave-scrim" onPointerDown={(e) => e.target === e.currentTarget && onStay()}>
      <div className="leave-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-t" aria-describedby="leave-b">
        <div className="leave-hazard" aria-hidden="true" />
        <h2 id="leave-t">{title}</h2>
        <p id="leave-b">{body}</p>
        <div className="leave-actions">
          <button ref={stayRef} className="leave-stay" onClick={onStay}>
            {stayLabel}
          </button>
          <button ref={leaveRef} className="leave-go" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Kapıdan çıkan ok: ✕ yerine "maçtan çık" anlamını açıkça taşır. */
export function ExitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
