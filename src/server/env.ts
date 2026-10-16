import type { Matchmaker } from "./matchmaker";
import type { Room } from "./room";
import type { Ladder } from "./ladder";
import type { Presence } from "./presence";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  LADDER: DurableObjectNamespace<Ladder>;
  PRESENCE: DurableObjectNamespace<Presence>;
  ASSETS: Fetcher;
}
