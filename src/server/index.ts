import { isValidPid, isValidRoomCode, randomRoomCode } from "../shared/protocol";
import type { Env } from "./env";

export { Room } from "./room";
export { Matchmaker } from "./matchmaker";
export { Ladder } from "./ladder";
export { Presence } from "./presence";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") return json({ ok: true });

    if (path === "/api/ladder" && request.method === "GET") {
      const stub = env.LADDER.get(env.LADDER.idFromName("global"));
      const pid = url.searchParams.get("pid");
      return json(await stub.view(isValidPid(pid) ? pid : null));
    }

    if (path === "/api/room" && request.method === "POST") {
      return json({ code: randomRoomCode() });
    }

    const roomMatch = path.match(/^\/ws\/room\/([A-Za-z0-9]+)$/);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      if (!isValidRoomCode(code)) return new Response("Geçersiz oda kodu", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const fwd = new URL(request.url);
      fwd.searchParams.set("code", code);
      return stub.fetch(new Request(fwd, request));
    }

    if (path === "/ws/presence") {
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName("global"));
      return stub.fetch(request);
    }

    if (path === "/ws/quick") {
      const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
