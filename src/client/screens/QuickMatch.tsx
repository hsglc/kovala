import { useEffect, useState } from "react";
import { VsBg } from "../ui/VsBg";

const SCRAMBLE = "ABCÇDEFGĞHIİKLMNOÖPRSŞTUÜVYZ";

interface Props {
  wsBase: string;
  pid: string;
  name: string;
  onMatched: (code: string) => void;
  onCancel: () => void;
  onPractice: () => void;
}

export function QuickMatch({ wsBase, pid, name, onMatched, onCancel, onPractice }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const connect = () => {
      ws = new WebSocket(`${wsBase}/ws/quick?${new URLSearchParams({ pid, name })}`);
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const m = JSON.parse(e.data);
          if (m.t === "matched") {
            done = true;
            ws?.close();
            onMatched(m.code);
          }
        } catch {}
      };
      ws.onopen = () => setError(null);
      ws.onclose = () => {
        if (done) return;
        setError("Bağlantı koptu, tekrar deneniyor…");
        retry = setTimeout(connect, 1500);
      };
    };
    connect();
    ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 15000);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => {
      done = true;
      ws?.close();
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      clearInterval(timer);
    };
  }, [wsBase, pid, name, onMatched]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, []);
  const opp = Array.from({ length: 5 }, (_, i) => SCRAMBLE[(tick * (i + 3) + i * 7) % SCRAMBLE.length]).join("");

  return (
    <div className="qm">
      <VsBg split={[52, 46]} />
      <div className="qm-me">
        <span className="marker">sen</span>
        <b>{name}</b>
      </div>
      <div className="qm-vs" aria-hidden="true">
        VS
      </div>
      <div className="qm-opp">
        <b className="qm-scramble" aria-label="Rakip aranıyor">
          {opp}
        </b>
        <span className="marker">rakip aranıyor, {elapsed} sn</span>
        {error && <span className="qm-err">{error}</span>}
        {elapsed >= 20 && <p className="qm-hint">Şu an pek kimse yok. Bir arkadaşını davet et ya da beklerken botla ısın.</p>}
        <div className="qm-actions">
          <button className="tape" onClick={onCancel}>
            <span className="tape-main">Vazgeç</span>
          </button>
          {elapsed >= 20 && (
            <button className="tape tape-go" onClick={onPractice}>
              <span className="tape-main">Botla oyna</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
