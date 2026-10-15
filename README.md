# Kovala

Tarayıcıda oynanan, online, 20 saniyelik kovalamaca chase'leri. World Chase Tag formatından esinlenildi (resmî bir ürün değildir).

## Kurallar

- Her chase 20 saniye: bir kovalayan (◆), bir kaçan (●).
- Kaçan 20 saniye yakalanmazsa takımı 1 puan alır. Yakalamak puan getirmez.
- Chase'i kazanan sahada kalır ve bir sonrakinde kaçan olur; kaybedenin takımı sıradaki oyuncusunu kovalayan olarak yollar.
- Saha çizgisinin dışına çıkan chase'i kaybeder.
- Eşitlikte sudden death: her takım bir kez kaçar, en uzun dayanan kazanır.
- Sarı (alçak) engellerin üstünden **ATLA**, açık alanda **DEPAR**. İkisi de enerji harcar.
- Kaçan daha çevik döner, kovalayan biraz daha hızlı koşar.

## Mimari

```
src/shared/   Sunucu ve istemcinin birebir paylaştığı deterministik motor
  sim.ts        Oyuncu fiziği (hareket, çarpışma, depar, atlama, tag)
  engine.ts     Maç kuralları (rotasyon, puan, sudden death, hükmen)
  maps.ts       Saha düzenleri
  bot.ts        Antrenman botu (Dijkstra mesafe alanı ile kovalama/kaçma)
  protocol.ts   WebSocket mesajları
src/server/   Cloudflare Worker + Durable Objects
  room.ts       Oda başına bir DO: lobi + 30 Hz yetkili maç döngüsü
  matchmaker.ts Hızlı maç eşleştirme (tek global DO)
src/client/   React + Canvas istemci (mobil öncelikli)
  net/RoomClient.ts  Client-side prediction, reconciliation, interpolation
  net/LocalGame.ts   Botla antrenman (ağsız)
  game/              Çizim, joystick, HUD
```

- Sunucu yetkilidir: tag, saha dışı ve süre kararlarını oda DO'su verir.
- Kendi karakterin anında hareket eder (prediction); sunucu durumu gelince uzlaştırılır.
- Rakip ~100 ms geriden yumuşak çizilir; tag kararında kovalayanın gördüğü konuma göre sınırlı gecikme telafisi uygulanır.
- Lobide döngü durur ve DO hibernation'a girer (ücretsiz planda süre harcamaz).

## Geliştirme

```bash
npm install
npm run build        # istemciyi dist/ içine derler
npm run dev:worker   # wrangler dev (http://localhost:8787)
npm run dev          # Vite dev sunucusu, /ws ve /api isteklerini 8787'ye yönlendirir
npm test             # motor, kural ve bot denge testleri
npm run typecheck
```

Uçtan uca test (wrangler dev açıkken, 100 ms yapay gecikmeyle iki botun tam maçı):

```bash
npx esbuild test/e2e.ts --bundle --platform=node --outfile=/tmp/e2e.js && node /tmp/e2e.js
```

## Yayın

Cloudflare Workers Builds bu repoya bağlı: `main`'e her push'ta `npm run build` + `npx wrangler deploy` çalışır.
