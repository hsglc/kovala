import { DurableObject } from "cloudflare:workers";
import { cleanName, isValidPid, randomRoomCode } from "../shared/protocol";
import type { Env } from "./env";

interface Waiting {
  pid: string;
  name: string;
  matched: boolean;
}

/**
 * Hızlı maç: tek bir global Durable Object bekleyenleri ikişer eşleştirir
 * ve ikisine de aynı oda kodunu yollar. Bekleme listesi soketlerin kendisi;
 * hibernation'da da korunur, ayrıca veri saklamaya gerek yok.
 */
export class Matchmaker extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket bekleniyor", { status: 426 });
    }
    const url = new URL(request.url);
    const pid = url.searchParams.get("pid");
    if (!isValidPid(pid)) return new Response("Geçersiz oyuncu", { status: 400 });
    const name = cleanName(url.searchParams.get("name"));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Aynı oyuncunun eski bekleme bağlantısını kapat.
    for (const old of this.ctx.getWebSockets(pid)) {
      old.serializeAttachment(null);
      try {
        old.close(4000, "replaced");
      } catch {}
    }
    this.ctx.acceptWebSocket(server, [pid]);
    server.serializeAttachment({ pid, name, matched: false } satisfies Waiting);

    const opponent = this.ctx.getWebSockets().find((ws) => {
      if (ws === server) return false;
      const a = ws.deserializeAttachment() as Waiting | null;
      return !!a && !a.matched && a.pid !== pid && ws.readyState === WebSocket.OPEN;
    });

    if (opponent) {
      const code = randomRoomCode();
      for (const ws of [opponent, server]) {
        const a = ws.deserializeAttachment() as Waiting;
        ws.serializeAttachment({ ...a, matched: true });
        ws.send(JSON.stringify({ t: "matched", code }));
      }
    } else {
      server.send(JSON.stringify({ t: "waiting" }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage() {
    // İstemciden mesaj beklenmiyor (ping otomatik yanıtlanıyor).
  }

  async webSocketClose(ws: WebSocket) {
    ws.serializeAttachment(null);
  }

  async webSocketError(ws: WebSocket) {
    ws.serializeAttachment(null);
  }
}
