import { useEffect, useState } from "react";

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

  return (
    <div className="page center-page">
      <div className="searching">
        <div className="radar" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>Rakip aranıyor</h2>
        <p className="muted">{elapsed} sn</p>
        {error && <p className="muted">{error}</p>}
        {elapsed >= 20 && (
          <p className="hint center">
            Şu an pek kimse yok gibi. Bir arkadaşını davet edebilir ya da beklerken botla ısınabilirsin.
          </p>
        )}
        <div className="row">
          <button className="btn" onClick={onCancel}>
            Vazgeç
          </button>
          {elapsed >= 20 && (
            <button className="btn ghost" onClick={onPractice}>
              Botla oyna
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
