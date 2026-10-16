import type { Matchmaker } from "./matchmaker";
import type { Room } from "./room";
import type { Ladder } from "./ladder";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  LADDER: DurableObjectNamespace<Ladder>;
  ASSETS: Fetcher;
}
