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
    version: "0.12.0",
    date: "16 Eki 2026",
    time: "10:09",
    title: "Yavaş çekim tekrar",
    items: [
      "Her chase bitince son 1,6 saniye yavaş çekimde tekrar oynar: yakalanma ya da son kaçış anını gör.",
      "Tekrarda animasyonlar da yavaşlar; üstte kırmızı TEKRAR · YAVAŞ ÇEKİM etiketi, sonuç kartı alta iner.",
      "Sonuç ekranı 3,6 sn oldu; Resmî dinlenme süresi değişmedi.",
    ],
  },
  {
    version: "0.11.0",
    date: "16 Eki 2026",
    time: "10:06",
    title: "Takım maçı: 3'e 3 ve sıra seçimi",
    items: [
      "Gerçek WCT takım formatı: geri sayımda takımın sahaya kimi süreceğini seçer (Sahaya kim girsin?). Seçim son 2 saniyede kilitlenir.",
      "Kazanan sahada kalır, seçilemez; yeni girecek oyuncu için en az 6 sn seçim süresi var.",
      "Botla antrenmanda 3'e 3 takım modu: iki bot takım arkadaşın ve üç bot rakiple 10 chase'lik maç.",
      "Online odalarda da çalışır: takım başına 6 oyuncuya kadar, her takım kendi sırasını seçer.",
    ],
  },
  {
    version: "0.10.0",
    date: "16 Eki 2026",
    time: "10:00",
    title: "Kolaydan zora 4 yeni saha",
    items: [
      "Sahalar artık zorluk seviyeli: yeşil Kolay, sarı Orta, kırmızı Zor. Lobide her sahanın kısa açıklaması var.",
      "Kolay · Isınma: açık saha, alçak bloklar ve iki kule; hamleleri öğrenmek için.",
      "Kolay · Açık Avlu: büyük merkez kule ve dört küçük kule; sadece koş ve dön.",
      "Zor · Kafes: dokuz kuleli ızgara, aralar kayma platformları ve bloklarla dolu.",
      "Zor · Yılan Yolu: uzun tic-tac duvarları arasında zikzak koridorlar; kestirme duvarın üstünden.",
      "Labirent artık Zor; Resmî Quad, Klasik ve Dört Sütun Orta.",
      "Botla antrenmanda sahayı sen seçebilirsin (seçimin hatırlanır).",
    ],
  },
  {
    version: "0.9.1",
    date: "16 Eki 2026",
    time: "09:45",
    title: "Gardırop büyüdü: 26 parça",
    items: [
      "Baş: Snapback Kep, Ters Kep, ponponlu Bere, Güneş Vizörü, Ter Bandı.",
      "Üst: Pro Forma, Çizgili Forma, Kamuflaj, Gün Batımı, Şimşek, Karbon Siyah.",
      "Alt: Antrenman Taytı, Üç Şeritli Eşofman, Kamuflaj Kargo, karanlıkta parlayan Neon Biyeli, İki Renk.",
      "Ayakkabı: Neon Koşu, Beyaz Sneaker, Siyah Altın, Gökkuşağı, parlayan Lav.",
      "Yeni bölge Takı: Bileklik, Kol Kılıfı, Altın Zincir, Kaptan Bandı (ya da sade).",
      "Gardırop ekranı iki sütunlu kart düzenine geçti; botların tarzları da yenilendi.",
    ],
  },
  {
    version: "0.9.0",
    date: "16 Eki 2026",
    time: "09:38",
    title: "Maç müziği ve gardırop",
    items: [
      "Maç müziği: 128 BPM elektronik parça; geri sayımda yükselen girişle başlar, maç ilerledikçe arpej ve melodi katmanları eklenir. Ses tuşu müziği de kapatır.",
      "Gardırop: ana sayfadan aç, sporcunu 3B önizlemede döndürerek giydir. Seçimin otomatik kaydedilir.",
      "Baş: Snapback Kep, Ter Bandı. Üst: Pro Forma, Çizgili Forma. Alt: Antrenman Taytı, Üç Şeritli Eşofman. Ayakkabı: Neon Koşu, Beyaz Sneaker.",
      "Kıyafet renkleri takımına uyar; online maçta rakiplerin de senin kıyafetini görür. Botların da kendi tarzı var.",
    ],
  },
  {
    version: "0.8.0",
    date: "16 Eki 2026",
    time: "08:03",
    title: "Resmî Quad engelleri",
    items: [
      "Resmî Quad haritasındaki engeller gerçek WCT modülleri gibi yeniden modellendi:",
      "The Mountain: ortada eğimli etekli, tepesi huş platformlu 1,85 m kule.",
      "The Sisters: köşelerde yan yana ikiz kuleler, tutunma çıtaları ve çelik kuşaklar.",
      "The Ridge: sırtında çelik boru, uçlarında açık iskele çaprazları olan uzun tic-tac duvarları.",
      "Loading Bay: altından kayılan platform; uçlarda kapalı bölmeler, sarı-siyah uyarı bandı.",
      "Tilted Cube: eğik üstlü vault bloğu. Lazy Boy: yaslanmış koltuk biçimli alçak blok.",
      "Engellerin ölçüleri ve hamle davranışları değişmedi.",
    ],
  },
  {
    version: "0.7.0",
    date: "16 Eki 2026",
    time: "08:00",
    title: "Gerçek insan sporcular",
    items: [
      "Sporcular Blender'da riglenmiş, dokulu insan modelleriyle değiştirildi; forma ve şort takım renginde.",
      "Koşu, yürüme ve bekleme gerçek hareket yakalama (mocap) verisinden; adım hızı koşu hızına göre ayarlanır.",
      "Vault, kong, tırmanma, kayma, zıplama, dalış, tökezleme, sıçrama, duvar sıçraması, sevinme ve yorulma için yeni insan animasyonları; hareketler arası yumuşak geçiş.",
      "Havadayken yükselme ve iniş pozları ayrı.",
    ],
  },
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
