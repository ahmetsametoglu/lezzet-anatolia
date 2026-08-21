/*
  OPERASYON evreni — "Veri Masası" token'ları (admin + depo + kurye).
  Kaynak: design/project/Komponent Envanteri - Operasyon.dc.html §0.
  Müşteri evreninden AYRI settir (`ops-` öneki); ortak renk (olive) bilerek eş değerdedir.
  Anahtarlar custom property adının aile öneki atılmış hâlidir (`--color-ops-ink` → `'ops-ink'`);
  değerler CSS'te yazıldığı gibi STRING — bkz. `customer.ts` başlık yorumu.

  FONTLAR BİLEREK DIŞARIDA: `--font-ops-display` / `--font-ops-mono` / `--font-ops-body`
  next/font değişkenlerine bağlanır ((operations)/layout.tsx: `var(--font-space-grotesk)`,
  `var(--font-ibm-plex-mono)`, `var(--font-karla)`) — değerleri Next.js çalışma zamanında doğar,
  buraya sabit olarak taşınamazlar. Parite testinde açık istisna listesindedirler.
*/

/* §0 YAZI ÖLÇEĞİ (operasyon) — karar 28.07.
   Envanter §0 yalnız font AİLELERİNİ veriyordu, boy vermiyordu; 20 operasyon tasarım dosyası
   18 farklı boy kullanıyor. 18 boy YEDİ role indirgendi; her birleştirme en fazla 1-2 px
   (ayrıntı: design/BACKLOG §5). Satır yüksekliği ve ağırlık BİLEREK gömülmedi: yoğun tablolarda
   `leading` yerel karar ve token'a gömmek, hiç `leading` yazmayan yerlerin satır aralığını
   sessizce değiştirirdi.

   BİR KADEME BÜYÜTÜLDÜ (28.07, kullanıcı kararı): ham boylar ekranda küçük kalıyordu; tüm ölçek
   ~1px yukarı, oranlar korundu. İKİNCİ KEZ BİR KADEME BÜYÜTÜLDÜ (03.08, kullanıcı kararı):
   şikâyetin ikinci kez gelmesi teşhisin kendisi — sorun eşlemede değil ÖLÇEĞİN kalibrasyonunda
   (tasarım 1360px çerçevede çiziliyor, gerçek ekran daha geniş). Token'ı değiştirmek on ekranı
   birden düzeltir; ölçek zaten bunun için token.

   MERDİVENİN ÜSTÜNE İKİ UÇ EKLENDİ (03.08): gösterge rakamları (`hero`, `display`) metin
   basamaklarına sığmıyordu ve dokuz yerde HAM px yazılmıştı — rol gerçekten farklı olduğu için
   basamak eklendi (28px bir başlık değil, bir SAYI). Tam gerekçe: globals.css §0 yorumu +
   design/BACKLOG §5. (`--text-` öneki.) */
export const operationsText = {
  'ops-hero': '36px', //    alarm bandı başlığı      ← 34 · 40
  'ops-display': '29px', // büyük gösterge sayısı    ← 26 · 28
  'ops-title': '25px', //   sayfa başlığı            ← 22 · 24
  'ops-section': '20px', // bölüm başlığı            ← 17 · 18 · 20
  'ops-lead': '17px', //    öne çıkan sayı/kart adı  ← 15 · 16
  'ops-base': '15px', //    gövde, tablo hücresi     ← 13 · 13,5 · 14
  'ops-sm': '14px', //      ikincil satır            ← 12 · 12,5
  'ops-xs': '13px', //      etiket, yardım metni     ← 11 · 11,5
  'ops-micro': '12px', //   tablo başlığı, rozet     ← 9 · 9,5 · 10 · 10,5
} as const satisfies Record<string, string>;

/* §0.1 Yüzey ve mürekkep */
export const operationsSurface = {
  'ops-ink': '#22251f', // başlık, koyu buton, birincil metin, "L"
  'ops-strong': '#3a3f37', // mürekkep yumuşak: ikincil başlık, nötr tutar/tarih
  'ops-body': '#6a7065', // gövde açıklaması, tablo alt satırı
  'ops-muted': '#8b9086', // etiket, yardımcı satır, placeholder
  'ops-faint': '#9aa094', // placeholder ikonu
  'ops-bg': '#dedbd3', // sayfa zemini (pane arkası)
  'ops-card': '#fbfbf9', // kart, tablo, sidebar zemini
  'ops-white': '#ffffff', // dialog ve girdi zemini, dolu çip metni
} as const satisfies Record<string, string>;

/* §0.2 Nötr gri skalası — kademe atlanmaz; iki komşu adım aynı kartta yan yana kullanılmaz */
export const operationsGray = {
  'ops-gray-25': '#f8f9f5', // sekme çubuğu, tablo başlığı
  'ops-gray-50': '#f0f1ec', // iç ayraç, satır ayracı
  'ops-gray-100': '#eef0ea', // kapanmış rozet zemini, satır hover
  'ops-gray-200': '#e6e7e1', // standart kenarlık (kart, tablo)
  'ops-gray-300': '#e0e2da', // iç kart kenarlığı, 2. ayraç
  'ops-gray-400': '#d9dbd2', // girdi/select kenarı, nötr çip
  'ops-gray-500': '#d4d7ce', // kesikli çerçeve, boş durum
  'ops-gray-600': '#c9ccc3', // pasif buton dolgusu/çerçevesi
  'ops-gray-700': '#b3b7ac', // pasif ikon, pasif metin
} as const satisfies Record<string, string>;

/* Skala takma adları — kullanımdaki adlar korunur (envanter §0.5 eşlemesi) */
export const operationsAliases = {
  'ops-subtle': '#f8f9f5', // = gray-25
  'ops-panel': '#f8f9f5', // = gray-25; sidebar zemini (#f3f4f0 kalktı)
  'ops-line-soft': '#f0f1ec', // = gray-50
  'ops-line': '#e6e7e1', // = gray-200
  'ops-line-strong': '#d9dbd2', // = gray-400
  /* İskelet çubuğu AYRI takma ad (15.08): `ops-card` zemininde görünür kalmalı — globals.css künyesi. */
  'ops-skeleton': '#d9dbd2', // = gray-400; iskelet çubuğu dolgusu
  'ops-skeleton-soft': '#e6e7e1', // = gray-200; iskelet gradyanının açık ucu
  /* Kartın İÇİNDE hafifçe çukur duran zemin (15.08'e kadar tanımsızdı — globals.css künyesi). */
  'ops-surface-sunken': '#f0f1ec', // = gray-50
} as const satisfies Record<string, string>;

/* §0.3 Semantik aileler — metin · koyu · zemin · kenarlık (+ grafik/nokta) */
export const operationsOlive = {
  'ops-olive': '#5f7a2c', // ikon, etiket, bağlantı, dolu çip
  'ops-olive-dark': '#4a6121', // kutu başlığı, olumlu tutar, hover
  'ops-olive-bg': '#eef4e2', // başarı kutusu, rozet arkası
  'ops-olive-line': '#cdd8b6', // kutu çerçevesi, seçili çip
  'ops-olive-light': '#a9c46b', // grafik dolgusu, ilerleme çubuğu
} as const satisfies Record<string, string>;

export const operationsAmber = {
  'ops-amber': '#9a6416', // ikon, uyarı etiketi, sayaç
  'ops-amber-dark': '#8a6410', // kutu başlığı ve gövdesi
  'ops-amber-bg': '#fdf1e3', // uyarı kutusu, rozet arkası
  'ops-amber-line': '#ecd9b4', // kutu çerçevesi, amber çip
  'ops-amber-dot': '#c98a2e', // durum noktası, eşleşmedi işareti
} as const satisfies Record<string, string>;

export const operationsRed = {
  'ops-red': '#a5443c', // hata etiketi, ikon, eksi tutar
  'ops-red-dark': '#8a3a33', // kutu başlığı ve gövdesi
  'ops-red-bg': '#fbe9e7', // hata kutusu, rozet arkası
  'ops-red-line': '#e2c4c0', // kutu çerçevesi, hatalı girdi
  'ops-red-dot': '#c2571f', // bağlantı yok noktası, iade tutarı
} as const satisfies Record<string, string>;

/* ALARM — DOLU kırmızı bant; sistem sağlığının `kritik`/`izleme durdu` hâli (O20, 18.5).
   Kendi ailesi çünkü var olan hiçbiri işi görmüyor: `red-bg` kutu zeminidir (açık), `red-dark`
   metin rengidir ve karanlık temada AÇILIR (#f2c8c3) — zemin olarak kullanılsaydı bant koyu temada
   soluk pembeye döner, "yüksek sesle görünme" yükümlülüğü kaybolurdu (`OBSERVABILITY §4.1`:
   e-posta alarmı yok, ekran alarmın yerini tutar). Bant her iki temada da DOLU ve koyu kalır;
   üzerindeki metin/kutu renkleri bu yüzden ayrı token. */
export const operationsAlarm = {
  'ops-alarm': '#8a3a33', // bandın kendisi
  'ops-alarm-ink': '#ffffff', // bant üzerindeki başlık ve hüküm
  'ops-alarm-muted': 'rgba(255, 255, 255, 0.75)', // bant üzerindeki etiket, ölçüm yaşı
  'ops-alarm-inset': 'rgba(255, 255, 255, 0.1)', // bandın içindeki gerekçe kutusu
  'ops-alarm-inset-line': 'rgba(242, 200, 195, 0.34)',
  'ops-alarm-dot': '#f2c8c3', // nabız atan durum noktası
} as const satisfies Record<string, string>;

/* PANEL ŞERİDİ — günün TEK yönlendirmesi (09.3, tasarım `Operasyon - Dashboard.dc.html`).
   Alarm bandıyla aynı gerekçeyle kendi ailesi ve aynı gerekçeyle TERS ÇEVRİLMEZ: sayfanın en
   yüksek sesli öğesi, bir "kutu" değil. Ama alarm DEĞİL — şerit sakin günü de taşır, tonu
   içeriğe göre değişen nötr bir zemindir; kırmızı bir bant "her gün bir şey yanlış" der.
   `ops-ink` kullanılamazdı: o MÜREKKEP rengidir ve karanlıkta açılır (#e9ebe3) — şerit gece
   beyaz bir levhaya dönerdi. */
export const operationsBand = {
  'ops-band': '#22251f', // şeridin kendisi
  'ops-band-ink': '#f4f5f0', // şerit üzerindeki başlık
  'ops-band-muted': '#a7ada0', // şerit üzerindeki etiket ve gerekçe
  'ops-band-line': '#454a41', // şerit içindeki ikincil düğmenin çerçevesi
} as const satisfies Record<string, string>;

/* MARKA renkleri — palete ait değil, kanalların kendi renkleri. Token olarak duruyorlar ki ham
   hex ikonun/kenarın içinde kalmasın (CLAUDE.md §3) ve karanlık temada da aynı kalsınlar: marka
   rengi temayla dönmez, döndüğü an marka olmaktan çıkar. (Önek `ops-` DEĞİL: `--color-brand-…`.)
   Messenger + Instagram 21.08'de geldi (15.15 — sosyal gelen kutusunun kanal kenarı). */
export const operationsBrand = {
  'brand-whatsapp': '#128c4b',
  'brand-messenger': '#0084ff',
  'brand-instagram': '#e1306c',
} as const satisfies Record<string, string>;

/* Mavi — YENİ aile (bilgi, nötr bildirim, aday kayıt) */
export const operationsBlue = {
  'ops-blue': '#3a6b8a', // bilgi ikonu, etiket, vade rozeti
  'ops-blue-dark': '#2f5a78', // kutu başlığı ve gövdesi
  'ops-blue-bg': '#e6eef3', // bilgi kutusu, rozet arkası
  'ops-blue-line': '#bcd0e0', // bilgi kutusu çerçevesi
} as const satisfies Record<string, string>;

/* Kurşuni — ÖLÇÜM/nötr kayıt: sayım farkı gibi "kayıp da değil, kazanç da değil" olaylar.
   Mavi bu işe uymuyordu: bizim palette mavi onay/aday demek ve sayım farkına yanlış anlam yükler. */
export const operationsSlate = {
  'ops-slate': '#5a6472',
  'ops-slate-dark': '#47505c',
  'ops-slate-bg': '#eceff3',
  'ops-slate-line': '#dde2e8',
} as const satisfies Record<string, string>;

export const operationsViolet = {
  'ops-violet': '#5a4a8a', // ajan ikonu, etiket (ayrı koyu katman yok)
  'ops-violet-bg': '#ece8f5', // öneri kutusu, rozet arkası
  'ops-violet-line': '#d8d0ec', // öneri kutusu çerçevesi
  'ops-violet-dot': '#6a5acd', // yolda/işliyor durum noktası
} as const satisfies Record<string, string>;

export const operationsScrim = {
  /* Yüzen katman — dialog örtüsü (scrim). Temayla döner: koyuda daha koyu, çünkü panel
     zemini de koyudur ve ayrışma yalnız örtü + kenarlıkla kurulur (gölge işe yaramaz). */
  'ops-scrim': 'rgba(34, 37, 31, 0.42)',
  /* Görsel ÜSTÜ örtü (yükleme/değiştirme hover'ı) — fotoğrafın üstünde durur, bu yüzden
     temayla dönmez: her iki temada da koyu kalır ki üstündeki açık metin okunsun. */
  'ops-image-scrim': 'rgba(30, 33, 27, 0.5)',
} as const satisfies Record<string, string>;

/* §0.4 Etkileşim durumları — odak halkası ayrı renk taşımaz (2px olive, 2px offset) */
export const operationsInteraction = {
  'ops-ink-hover': '#33372e', // koyu butonun hover/active durumu
  // Eşdeğerlik notları AÇIK TEMA için geçerli; karanlıkta ikisi de ayrı kademeye kayar (aşağıdaki
  // koyu bloğun künyesi — bilinçli, kontrastı korumak için).
  'ops-disabled-fill': '#c9ccc3', // disabled buton zemini (açıkta = gray-600)
  'ops-disabled-text': '#8b9086', // disabled buton/girdi metni (açıkta = muted)
  'ops-row-selected': '#eef0ea', // tablo satırı hover ve seçim (= gray-100)
} as const satisfies Record<string, string>;

/* Operasyon renklerinin tam kümesi (AÇIK tema) — CSS dosya sırasıyla (`--color-` öneki). */
export const operationsColors = {
  ...operationsSurface,
  ...operationsGray,
  ...operationsAliases,
  ...operationsOlive,
  ...operationsAmber,
  ...operationsRed,
  ...operationsAlarm,
  ...operationsBand,
  ...operationsBrand,
  ...operationsBlue,
  ...operationsSlate,
  ...operationsViolet,
  ...operationsScrim,
  ...operationsInteraction,
} as const satisfies Record<string, string>;

/* Köşe yarıçapları (operasyon) — `--radius-` öneki. */
export const operationsRadius = {
  'ops-card': '8px',
  'ops-dialog': '14px',
  'ops-chip': '14px',
  'ops-btn': '8px',
} as const satisfies Record<string, string>;

/* ═══════════════════════════════════════════════════════════════════════════
   KARANLIK MOD — yalnız OPERASYON yüzeyi. Kaynak: envanter §0.6.
   Token ADLARI değişmez, yalnız değerleri yeniden tanımlanır — hiçbir bileşene
   dokunulmaz (envanterin kuralı). Müşteri yüzeyi bilerek dışarıda: vitrin gündüz
   krem zemin üstünde kurulu (envanter - Musteri §0.5), karanlık palet tasarlanmadı.

   CSS'te uygulama: `<html data-surface="operations" data-theme="dark|light">`; çözüm
   JS tarafında (ThemeScript, FOUC olmadan) — CSS TEK blok tutar, koyu değerler iki kez
   yazılmaz. Bu nesne o bloğun karşılığıdır: yalnız DEĞİŞEN token'lar, hepsi `--color-`
   ailesinden. `ops-image-scrim` BİLEREK yok — temayla dönmez (fotoğraf üstü örtü, iki
   temada da koyu); `brand-whatsapp` da yok — marka rengi temayla dönmez.
   ═══════════════════════════════════════════════════════════════════════════ */
export const operationsDarkColors = {
  /* §0.6 Yüzey ve mürekkep — ters çevrilir */
  'ops-ink': '#e9ebe3',
  'ops-strong': '#c8ccc2',
  'ops-body': '#b4b9ad',
  'ops-muted': '#8f9688',
  'ops-faint': '#757c6d',
  'ops-bg': '#1b1e18',
  'ops-card': '#23261f',
  'ops-white': '#2a2e26', // dialog/girdi zemini — koyuda "beyaz" kart altıdır

  /* §0.6 Gri skalası — aynı kademeler, koyu yönde */
  'ops-gray-25': '#23261f',
  'ops-gray-50': '#2a2e26',
  'ops-gray-100': '#31352c',
  'ops-gray-200': '#3c4038',
  'ops-gray-300': '#464b41',
  'ops-gray-400': '#545a4e',
  'ops-gray-500': '#646a5d',
  'ops-gray-600': '#757c6d',
  'ops-gray-700': '#8f9688',

  'ops-subtle': '#23261f',
  'ops-panel': '#23261f',
  'ops-line-soft': '#2a2e26',
  'ops-line': '#3c4038',
  'ops-line-strong': '#545a4e',
  'ops-skeleton': '#31352c', // = gray-100; koyuda skala adımları geniş, görünürlük sorunu yok
  'ops-skeleton-soft': '#2a2e26', // = gray-50
  'ops-surface-sunken': '#1b1e18', // = bg; çukur koyuda karttan koyu

  /* §0.6 Semantik aileler — koyu zeminde okunur kalacak şekilde açılır */
  'ops-olive': '#a9c46b',
  'ops-olive-dark': '#cdd8b6',
  'ops-olive-bg': '#2a3a1c',
  'ops-olive-line': '#46592a',
  'ops-olive-light': '#8fb04f',

  'ops-amber': '#dfa94f',
  'ops-amber-dark': '#f0d7ab',
  'ops-amber-bg': '#38290f',
  'ops-amber-line': '#5c4520',
  'ops-amber-dot': '#c98a2e',

  'ops-red': '#e08d84',
  'ops-red-dark': '#f2c8c3',
  'ops-red-bg': '#351d1a',
  'ops-red-line': '#5c322d',
  'ops-red-dot': '#e07a3a',

  /* Alarm bandı koyu temada da DOLU ve koyu kalır — yalnız bir tık derinleşir. Diğer ailelerin
     aksine ters çevrilmiyor: bu bant bir "kutu" değil, sayfanın en yüksek sesli öğesi. */
  'ops-alarm': '#6e2a24',
  'ops-alarm-ink': '#fbeceb',
  'ops-alarm-muted': 'rgba(251, 236, 235, 0.72)',
  'ops-alarm-inset': 'rgba(255, 255, 255, 0.07)',
  'ops-alarm-inset-line': 'rgba(224, 141, 132, 0.3)',
  'ops-alarm-dot': '#f2c8c3',

  /* Panel şeridi karanlıkta KABARIR (karttan bir kademe açık), koyulaşmaz — sayfa zemini zaten
     #1b1e18, daha koyu bir şerit görünmez olurdu. Mürekkep/ikincil metin bilerek yok: ikisi de
     açık temadaki değerini korur, çünkü zemin iki temada da koyu kalıyor. */
  'ops-band': '#2f342b',
  'ops-band-line': '#4a5044',

  'ops-blue': '#82b2d0',
  'ops-blue-dark': '#c3d6e4',
  'ops-blue-bg': '#1a2a36',
  'ops-blue-line': '#34505f',

  /* Kurşuni karanlıkta da nötr kalır: zemin koyulaşır, metin açılır — parlaklık tersine çevrilir
     ki rozet gece "beyaz bir leke" olmasın. */
  'ops-slate': '#97a3b3',
  'ops-slate-dark': '#cbd4de',
  'ops-slate-bg': '#232a33',
  'ops-slate-line': '#3b4552',

  'ops-violet': '#a99adf',
  'ops-violet-bg': '#241f38',
  'ops-violet-line': '#3e3560',
  'ops-violet-dot': '#8a7ae0',

  'ops-scrim': 'rgba(8, 9, 7, 0.74)',

  /* §0.6 Etkileşim — koyu buton açık zemine döner (mürekkep ters) */
  'ops-ink-hover': '#d3d8ca',
  // DEĞERLER DOĞRU, açıktaki eşdeğerlik burada BİLEREK bozulur (ölçüldü 07.08): eşleme korunsaydı
  // dolgu #757c6d, metin #8f9688 olurdu — birbirine yapışık iki ton, yani okunmayan bir buton.
  // Korunan şey renk eşleşmesi değil, dolgu ile metin arasındaki KONTRAST.
  'ops-disabled-fill': '#3c4038', // karanlıkta = gray-200
  'ops-disabled-text': '#757c6d', // karanlıkta = faint
  'ops-row-selected': '#31352c',
} as const satisfies Record<string, string>;
