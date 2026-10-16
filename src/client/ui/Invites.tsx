import { useEffect, useState, useSyncExternalStore } from "react";
import { presence, type PresenceView } from "../net/presence";

const EMPTY: PresenceView = { online: false, total: 0, players: [], incoming: null, outgoing: null, notice: null };
const noop = () => () => {};

/** Çevrimiçi durumunu React'te izle (bağlantı yoksa boş görünüm). */
export function usePresence(): PresenceView {
  const p = presence();
  return useSyncExternalStore(p ? p.subscribe : noop, p ? p.getView : () => EMPTY);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Gelen davet kartı ve davet sonuç bildirimi; her ekranın üstünde. */
export function InviteLayer() {
  const v = usePresence();
  const now = useNow(!!v.incoming);
  useEffect(() => {
    if (!v.notice) return;
    const t = setTimeout(() => presence()?.clearNotice(), 3500);
    return () => clearTimeout(t);
  }, [v.notice]);
  const inc = v.incoming;
  const left = inc ? Math.max(0, Math.ceil((inc.exp - now) / 1000)) : 0;
  return (
    <>
      {inc && left > 0 && (
        <div className="inv-card" role="alertdialog" aria-labelledby="inv-t">
          <div className="inv-hazard" aria-hidden="true" />
          <div className="inv-body">
            <span className="inv-lvl">{inc.from.l}</span>
            <div className="inv-text">
              <b id="inv-t">{inc.from.n}</b>
              <span>seni 1'e 1 maça çağırıyor</span>
            </div>
            <span className="inv-left" aria-label={`${left} saniye`}>
              {left}
            </span>
          </div>
          <div className="inv-actions">
            <button className="inv-no" onClick={() => presence()?.answer(false)}>
              Reddet
            </button>
            <button className="inv-yes" onClick={() => presence()?.answer(true)}>
              Kabul et
            </button>
          </div>
          <div className="inv-bar" style={{ ["--d" as string]: `${Math.max(0, inc.exp - Date.now())}ms` }} key={inc.id} />
        </div>
      )}
      {v.notice && (
        <div className="toast inv-toast" key={v.notice.at}>
          {v.notice.text}
        </div>
      )}
    </>
  );
}
