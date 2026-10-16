/**
 * Yama notları. Kural: her push/deploy yeni bir sürüm; yayın saati (İstanbul) dakikasıyla yazılır.
 * En yeni en üstte.
 */
export interface PatchNote {
  version: string;
  date: string;
  time: string;
  title: string;
  items: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.6.1",
    date: "16 Eki 2026",
    time: "07:50",
    title: "Sabit yayın kamerası",
    items: ["Kamera maç boyunca tüm sahayı yukarıdan gösterir; başlangıçta ve hareket ederken zoom ya da takip yok."],
  },
  {
    version: "0.6.0",
    date: "16 Eki 2026",
    time: "01:35",
    title: "Resmî Quad haritası, gerçek malzemeler, akıllı kamera",
    items: [
      "Yeni harita: Resmî Quad. 12 × 12 m, merkez kule, köşe kuleleri, tic-tac duvarları, platform altı kayma boşlukları, 1,0 ve 0,7 m vault blokları, çapraz başlangıç plakaları.",
      "Resmî ölçü ve kurallar: en yüksek engel 1,85 m; maç 16 chase; chase'ler arası dinlenme Resmî (25 sn) ya da Hızlı (5 sn).",
      "Tüm haritalarda engeller resmî Quad gibi: 18 mm kontrplak yüzeyler, galvaniz boru iskele ve kelepçeler, pedli vault kenarları.",
      "Sporcular: sırt ve göğüste forma numarası, yaka bandı, takım renginde ayakkabı şeridi.",
      "Kamera: yönü sabit, sen + rakip + gidiş yönün aynı anda kadrajda; HUD ve tuşların altına kimse kalmaz; araya giren engel saydamlaşır.",
      "Arena: çevrede LED panolar ve ışık direkleri.",
    ],
  },
  {
    version: "0.5.2",
    date: "16 Eki 2026",
    time: "01:05",
    title: "Gerçek yükseklik: duvarın tepesine çık",
    items: [
      "TIRMAN artık seni duvarın tepesine çıkarır; orada durabilir, yürüyebilir ve kenardan atlayabilirsin.",
      "Yerdeki kovalayan tepedekini yakalayamaz (1 m'den fazla yükseklik farkı). Tepede enerji hızla biter; biterse düşersin.",
      "Zıplama yerçekimiyle çalışır: kutuların üstüne konabilirsin, duvardan aşağı atlayabilirsin.",
      "Duvarın içinden geçme sorunu giderildi: önce yerinde yukarı çekilir, sonra tepeye adım atarsın.",
    ],
  },
  {
    version: "0.5.1",
    date: "16 Eki 2026",
    time: "00:48",
    title: "Rakibi kadraja alan kamera, duvar sıçraması",
    items: [
      "Kamera artık her iki oyuncuyu kadraja alır: chase başında rakibi görürsün, uzaklaştıkça kamera yükselir.",
      "Duvar sıçraması (tic-tac) yeniden yapıldı: duvara açıyla koşup DUVAR tuşuna basınca ayağını basıp yansıyarak fırlarsın. Dik ve yavaş gelirsen TIRMAN.",
      "Duvar üstleri koyu, sadece kenarda sarı tutamak şeridi; kutularla karışmıyor.",
      "Arayüz: skorbord, lobi ve sonuç kartında parlama ve cam efektleri, son 5 saniyede nabız atan sayaç.",
    ],
  },
  {
    version: "0.5.0",
    date: "16 Eki 2026",
    time: "00:20",
    title: "3B grafikler: three.js sahnesi",
    items: [
      "Oyun içi grafikler three.js'e taşındı: perspektif takip kamerası, gerçek gölgeler, eklemli 3B koşucular.",
      "Engeller yeniden tasarlandı: iskele duvarlar (sarı tutamaklı), sünger kutular, çelik korkuluk barları.",
      "Yeni hamleler: barların altından KAY, açık alanda ZIPLA (kutuların üstünden geçer).",
      "Her figür için koşu, atlama, kong, tırmanma, kayma, dalış, tökezleme, sevinme ve yorulma animasyonları.",
    ],
  },
  {
    version: "0.4.1",
    date: "15 Eki 2026",
    time: "23:44",
    title: "Yeni logo ve önbellek düzeltmesi",
    items: ["Engelin üstünden uçan koşucu logosu.", "Ana sayfa hero alanı yenilendi.", "Yeni sürümün telefonda eski önbellekten gösterilmesi engellendi."],
  },
  {
    version: "0.4.0",
    date: "15 Eki 2026",
    time: "23:52",
    title: "Takip kamerası, yeni isim, yama notları",
    items: [
      "Oyunun adı artık EVADE.",
      "Kamera karakteri yakından takip ediyor; rakip ekran dışındaysa kenarda ok ve mesafe, sağ üstte mini harita.",
      "Joystick dokunma olaylarına taşındı: iOS'ta parmak altından kaybolma sorunu giderildi.",
      "Ana sayfa ve lobi arayüzü yenilendi; yama notları eklendi.",
    ],
  },
  {
    version: "0.3.0",
    date: "15 Eki 2026",
    time: "23:19",
    title: "Parkur hamleleri ve iki tuşlu kontrol",
    items: [
      "Sarı kutular koşarken kendiliğinden atlanır (speed vault / kong).",
      "PARKUR tuşu: duvara TIRMAN, sırtın duvardayken SEK.",
      "Kaçan için SIÇRA, kovalayan için DALIŞ (uzun erişim, sonra tökezleme).",
      "Düz koşarken saha çizgisi yumuşak duvar; sadece hamleler dışarı taşır.",
      "Daha hızlı ve çevik hareket; kendi karakter kareler arası yumuşatıldı.",
    ],
  },
  {
    version: "0.2.0",
    date: "15 Eki 2026",
    time: "22:30",
    title: "İnsan figürleri",
    items: ["Noktalar yerine koşan, atlayan, sevinen ve yorulan insan figürleri.", "3/4 açılı saha görünümü, engellerin arkasında hayalet görünüm."],
  },
  {
    version: "0.1.0",
    date: "15 Eki 2026",
    time: "22:26",
    title: "İlk sürüm",
    items: [
      "20 saniyelik chase'ler, kaçış puanı, kazanan sahada kalır, sudden death.",
      "Hızlı maç, oda kurma ve davet linki, takım başına 6 oyuncu.",
      "Botla antrenman (kolay / orta / zor), üç saha düzeni.",
    ],
  },
];

export const CURRENT_VERSION = PATCH_NOTES[0].version;
