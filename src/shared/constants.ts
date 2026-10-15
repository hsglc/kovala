// Tüm birimler metre ve saniye. Sunucu ve istemci aynı sabitleri kullanır.

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
/** Sunucu her kaç tick'te bir anlık görüntü yollar (30/2 = 15 Hz). */
export const SNAPSHOT_EVERY = 2;
/** İstemci input'larını kaç tick'te bir paketleyip yollar (30/2 = 15 mesaj/sn). */
export const INPUT_SEND_EVERY = 2;
/** Rakibi kaç tick geriden çizeriz (interpolasyon tamponu, ~100 ms). */
export const INTERP_TICKS = 3;
/** Tag kararında en fazla kaç tick geriye sarılır (lag kompanzasyonu, ~200 ms). */
export const MAX_REWIND_TICKS = 3;

export const QUAD_SIZE = 12;
/** Oyuncunun merkezi çizgiyi bu kadar geçerse saha dışı sayılır (vücudun yaklaşık yarısı). */
export const OUT_MARGIN = 0.15;
export const CHASE_SECONDS = 20;
export const CHASE_TICKS = CHASE_SECONDS * TICK_RATE;
export const COUNTDOWN_TICKS = 3 * TICK_RATE;
export const RESULT_TICKS = Math.round(2.6 * TICK_RATE);

export const PLAYER_RADIUS = 0.32;
export const TAG_REACH = 0.2;

export const SPEED_EVADER = 4.6;
export const SPEED_CHASER = 4.7;
/** Kaçan daha çevik döner (juke), kovalayan biraz daha hızlı koşar. */
export const ACCEL_EVADER = 40;
export const ACCEL_CHASER = 30;

export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 19;

export const DASH_SPEED = 8.4;
export const DASH_TIME = 0.2;
export const DASH_COST = 36;

export const VAULT_SPEED = 5.8;
export const VAULT_MIN_TIME = 0.3;
export const VAULT_MAX_TIME = 0.8;
export const VAULT_COST = 20;
/** Oyuncunun önündeki bu mesafede alçak engel varsa aksiyon = atlama. */
export const VAULT_PROBE = 0.5;

export const ACTION_COOLDOWN = 0.3;

export const CHASE_OPTIONS = [10, 16] as const;
export const MAX_TEAM_SIZE = 6;
