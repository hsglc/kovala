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
export const OUT_MARGIN = 0.22;
export const CHASE_SECONDS = 20;
export const CHASE_TICKS = CHASE_SECONDS * TICK_RATE;
export const COUNTDOWN_TICKS = 3 * TICK_RATE;
export const RESULT_TICKS = Math.round(2.6 * TICK_RATE);

export const PLAYER_RADIUS = 0.32;
export const TAG_REACH = 0.2;

export const SPEED_EVADER = 5.3;
export const SPEED_CHASER = 5.45;
/** Kaçan daha çevik döner (juke), kovalayan biraz daha hızlı koşar. */
export const ACCEL_EVADER = 58;
export const ACCEL_CHASER = 44;

export const STAMINA_MAX = 100;
export const STAMINA_REGEN = 26;

/** Kutu üstünden atlama: koşarken otomatik, bedava. */
export const VAULT_SPEED = 6.4;
export const VAULT_MIN_TIME = 0.26;
export const VAULT_MAX_TIME = 0.8;
export const VAULT_PROBE = 0.55;
/** Otomatik atlamanın tetiklenmesi için en düşük hız. */
export const VAULT_AUTO_SPEED = 2.2;

/** Duvar tırmanma: yavaş ama duvarı aşar; tırmanırken yakalanabilirsin. */
export const CLIMB_SPEED = 2.3;
export const CLIMB_MAX_TIME = 1.1;
export const CLIMB_COST = 30;

/** Duvar sıçraması (tic-tac): duvara açıyla koşup ayağını basıp yansıyarak fırlama. */
export const KICK_SPEED = 8.2;
export const KICK_TIME = 0.3;
export const KICK_COST = 14;
/** Duvara bu mesafedeyken sıçranabilir. */
export const KICK_RANGE = 0.75;

/** Kovalayanın dalışı: uzun erişim, sonra tökezleme. */
export const DIVE_SPEED = 9.8;
export const DIVE_TIME = 0.26;
export const DIVE_REACH = 0.32;
export const DIVE_COST = 38;
export const STUMBLE_TIME = 0.5;

/** Kaçanın sıçraması: kısa, çok hızlı yön değişimi. */
export const JUKE_SPEED = 9.6;
export const JUKE_TIME = 0.14;
export const JUKE_COST = 24;

/** Kayma: barın altından, hız korunur. */
export const SLIDE_SPEED = 6.0;
export const SLIDE_MIN_TIME = 0.3;
export const SLIDE_MAX_TIME = 0.8;

/** Zıplama: kısa havada kalma; kutuların üstünden geçer. */
export const JUMP_SPEED = 5.9;
export const JUMP_TIME = 0.42;
export const JUMP_COST = 10;

export const ACTION_COOLDOWN = 0.25;

export const CHASE_OPTIONS = [10, 16] as const;
export const MAX_TEAM_SIZE = 6;
