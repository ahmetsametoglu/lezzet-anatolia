/*
  MOBİL UYGULAMA — müşteri evreninin UYGULAMAYA-ÖZGÜ token'ları (21.3, kullanıcı kararı 07.08).

  Bu dosya mobil uygulamanın müşteri token'larıdır; ortak tabanla (`customer.ts`) KOMPOZİSYONLA
  birleşir — aynı addaki anahtar BU dosyadan kazanır:

      const colors = { ...customerColors, ...customerAppColors };
      const radius = { ...customerRadius, ...customerAppRadius };

  Web'e SIFIR etki (tüzük §3.6'nın hükmü): `globals.css` bu dosyayı görmez, parite testi bu
  dosyayı hiç okumaz, `render-theme-css.ts` buradan CSS ÜRETMEZ — üretilecek bir CSS'i yoktur.
  Değişiklik burada kaldığı sürece web şeridine tur/refactor faturası çıkmaz.

  AYRIM SONEKLE DEĞİL DOSYAYLA (kullanıcı kararı 07.08 — `-app` soneki İPTAL): sonek, "hangi
  evren" bilgisini her token adının içine gömüyor ve aynı tonu iki adla (`sand-300` +
  `sand-300-app`) okutuyordu. Dosya sınırı aynı bilgiyi bir kez ve yapısal olarak verir; bu
  yüzden buradaki anahtarlar DOĞAL adlarını taşır (`sand-300`, `star`, `card`) — hangi evrene
  ait olduğu adından değil, geldiği dosyadan okunur.

  İKİ TÜR TOKEN var, ikisi de burada:
    (1) FARK (8) — tabanla AYNI adı taşıyan, uygulamada başka değerde olan token. Web değeri
        `customer.ts`te dokunulmadan durur; kompozisyonda uygulama değeri kazanır.
    (2) UYGULAMAYA-YENİ (41) — tabanda hiç olmayan token: hata ailesi · örtü · krem cam · vurgu
        yaprağı · gölge · fotoğraf gradyanı · bulanıklık · marka renkleri · uygulama tipografi
        kademeleri · yarıçap setinin iki kademesi.
  Kaynak: `design/project/Mobil - Token Kararlari.md` (24 karar; 14–24 ikinci tur) +
  `Mobil - Musteri v3.dc.html`.

  Değerler tabandaki gibi CSS dizgesi tutulur ("20px", "0.18em", "rgba(…)"); birim/parse
  dönüşümü tüketicinin (Unistyles teması) işidir, kaynağın değil — `customer.ts` başlığındaki
  kuralın aynısı. Karanlık mod YOK: müşteri vitrini tek temalıdır, uygulama da öyle.
*/
import { customerSurface } from './customer';

/* ── (1) FARK RENKLERİ — tabanın aynı adlı anahtarını EZER ───────────────────
   Token Kararlari #3'te ölçülen uygulama değerleri. Küçük ayak izi kuralı gereği web değeri
   DEĞİŞMEDİ: taban ne diyorsa web onu görmeye devam eder, uygulama buradan okur.
   Yalnız RENK farkları burada; iki yarıçap farkı (`card` · `pill`) `customerAppRadius` içinde
   kendi skalasıyla birlikte durur — dört kademeli bir seti "farklı/yeni" diye ikiye bölmek
   okumayı, kazandırdığı simetriden fazla zorlaştırırdı. */
export const customerAppOverrides = {
  'sand-300': '#e2d8bd', // avatar/stepper zemini, spinner izi (taban: #e0d8c2 girdi kenarı)
  'olive-line': '#cddbb0', // zeytin çerçeveli ikincil düğme, kupon satırı (taban: #d7e3bd)
  star: '#d9a441', // yorum yıldızları (taban: #d99a2b)
  /* Kapanmış rozet uygulamada kendi tonunu taşır — tabanda `sand-100` (#f0e9d6) ile eşitti,
     uygulamada bir tık daha gri; bant zemini ile rozet arkası artık ayırt edilebilir. */
  'closed-bg': '#e9e2cf', // "Teslim edildi" rozet zemini (taban: #f0e9d6)
  'disabled-fill': '#b9b29e', // engelli düğme dolgusu (taban: #c9c3b0)
  /* Fotoğraf üstü ALTYAZI (çeşit satırı, imza) — Token Kararlari #15: rolün RESMÎ değeri artık
     SICAK #d5d0c2 ve referansı mobildir. Tabandaki #dfe3cf soğuk yeşilimsi bir gri; krem paletin
     üstünde yeşile kaçıyordu ve fotoğrafın rengine göre bazen yosun gibi okunuyordu.
     Web kullanımları AYRI bir turda (web şeridi) bu değere çekilecek — `customer.ts` bu turda
     bilerek DEĞİŞMEDİ, yani parite testi ve `globals.css` ikizliği bozulmadı. */
  'on-image-soft': '#d5d0c2',
} as const satisfies Record<string, string>;

/* ── (2) KUM SKALASININ İKİ YENİ KADEMESİ — Token Kararlari #2 ───────────────
   Skalanın ARASINA girerler çünkü uygulamada krem zeminde "seçili" ve "kart" yüzeyleri
   100 ile 300 arasında iki ayrı sıcaklık istiyor. */
export const customerAppSand = {
  'sand-150': '#efdfc2', // seçili kart, özet paneli, puan zemini
  /* AD ÇARPIŞMASI ÇÖZÜMÜ: Token Kararlari #2 bu tonu "sand-100" diye adlandırmıştı, ama
     `sand-100` ZATEN #f0e9d6'nın adı (web vurgulu bölüm bandı) ve o ad tabanda yaşıyor —
     kompozisyonda ezilseydi web tonunun uygulamadaki karşılığı sessizce kaybolurdu. Resmî ad
     `sand-250`: skalada 200 ile 300 arasında, boş bir ad. KULLANICI ONAYLADI (07.08). Karar
     dosyasındaki "sand-100" yazımının düzeltilmesi Claude Design kanalından. */
  'sand-250': '#ece3c8', // kart zemini
} as const satisfies Record<string, string>;

/* ── HATA ailesi — Token Kararlari #3 ────────────────────────────────────────
   Terracotta'ya KATILMADI: terracotta fırsat/indirim demek ve aynı ailede iki zıt anlam
   taşımak (kampanya + hata) rozet renginin bilgi değerini sıfırlar.

   ── ÜÇÜNCÜ KATMAN AÇILDI (30.08) ─────────────────────────────────────────
   Künye *"kenarlık hâlâ tabandaki `terracotta-line` ile çiziliyor, üçüncü katman gerçek bir ihtiyaç
   doğunca eklenir"* diyordu. İhtiyaç doğdu ve PAYLAŞILAN kitte doğdu: `SecondaryButton`ın `error`
   tonu (kuryenin kapıdaki "Kabul etmedi"si, v3:17) kırmızı bir çerçeve istiyor ve bileşen iki
   yüzeyde birden yaşıyor. Token yalnız operasyon setinde olsaydı stil fabrikası müşteri temasında
   çözülemeyen bir anahtar okurdu — cihazda `Property 'operationsTheme' doesn't exist` diye düştü
   (ölçüldü 30.08). Kenarlık için terracotta kullanmak da olmazdı: o amber bir çizgi, bu pembe bir
   çizgi ve ikisi ayrı şey söylüyor.

   Değer operasyon setinin `error-line`ıyla AYNI: aile iki yüzeyde tek renkte konuşur. */
export const customerAppError = {
  error: '#a44a3f', // hata metni, iptal/başarısız etiketi
  'error-bg': '#f4e3e0', // hata kutusu, başarısız ödeme zemini
  'error-line': '#e0b9b2', // hata kutusu/düğmesi çerçevesi (kurye "Kabul etmedi")
} as const satisfies Record<string, string>;

/* ── ÖRTÜ (scrim) — Token Kararlari #5 ───────────────────────────────────────
   Yüzen katmanın ve fotoğraf üstü yazının arkasındaki koyu örtü. Tek renk (rgb 21,23,15 —
   krem paletin altındaki en koyu yeşilimsi siyah), ÜÇ yoğunlukta; opaklığı ham yazmak yerine
   kademe adı kullanılır, böylece "biraz daha koyu olsun" kararı tek yerden verilir.
   Operasyonun `ops-scrim`'inden AYRI: o tema ile döner (koyu modda derinleşir), bu dönmez —
   müşteri vitrini tek temalıdır ve örtü her hâlde fotoğrafın üstündedir. */
export const customerAppScrim = {
  'scrim-soft': 'rgba(21, 23, 15, 0.28)', // fotoğrafın ÜST kenarı, hafif karartma
  scrim: 'rgba(21, 23, 15, 0.45)', // sayfa örtüsü (sheet/dialog arkası)
  /* TÜKENDİ/PASİF örtüsü — Token Kararlari #18. `.82`'ye YUVARLANMADI ve bu bir incelik değil,
     iki ayrı iş: `.82` metin koruma gradyanının ucudur ve işi FOTOĞRAFI OKUNUR KILMAK; `.72`'nin
     işi fotoğrafı SOLDURMAK. Aynı değere çekilseler rozet ile gradyanın ucu birbirine karışır ve
     "bu ürün alınamaz" bilgisi görsel olarak kaybolurdu. Ad kararın kendi adıdır (`scrim-72`):
     ailenin soft/heavy sıfatları yoğunluk sırasını anlatıyor, bu durak ise bir ROL taşıyor. */
  'scrim-72': 'rgba(21, 23, 15, 0.72)',
  'scrim-heavy': 'rgba(21, 23, 15, 0.82)', // fotoğrafın ALT kenarı, üstünde başlık okunur
} as const satisfies Record<string, string>;

/* ── KREM CAM (cream-glass) — Token Kararlari #17 ─────────────────────────────
   Yarı saydam krem: ARKASINDAKİ İÇERİĞİ ELEYEN ama tamamen kapatmayan yüzey. Rengi `sand-50`
   (#f3efe2) ile aynı mürekkeptir; taşıdığı yeni bilgi renk değil SAYDAMLIKTIR — opak `sand-50`
   ile kurulduğunda çubuk sayfadan kopuk bir şerit gibi duruyor, altından akan liste kayboluyordu.

   İKİ DURAK, iki farklı iş:
   · `.90` — fotoğrafın ÜSTÜNDE yüzen yuvarlak düğme (geri, paylaş). Altında fotoğraf var,
     biraz daha geçirgen olması düğmenin fotoğrafa ait olduğunu söylüyor.
   · `.96` — YAPIŞKAN çubuk ve alt sekme çubuğu. Altından metin akıyor; okunabilirlik için
     neredeyse opak, ama "neredeyse" kısmı kaydırmanın sürdüğünü gösteriyor.
   Tasarımdaki .92/.94 rozet zeminleri buraya DAHİL DEĞİL — onlar rozet ailesinin işi (#16). */
export const customerAppCreamGlass = {
  'cream-glass-soft': 'rgba(243, 239, 226, 0.90)', // foto üstü yüzen daire
  'cream-glass': 'rgba(243, 239, 226, 0.96)', // yapışkan çubuk, alt sekme çubuğu
} as const satisfies Record<string, string>;

/* ── VURGU YAPRAĞI + DERİN MÜREKKEP — Token Kararlari #19 ────────────────────
   "TAKİP" çipinin ikilisi. `accent-leaf` paletin zeytininden (`olive`) AYRI bir tondur: zeytin
   markanın rengi, bu ise bir DURUM işareti (kargo takibi açık) ve zeytin zeminli bir sayfada
   zeytin bir rozet görünmez olurdu. `ink-deep` ise scrim ailesinin rgb(21,23,15) mürekkebinin
   KATI hâli — örtüde zaten kullanılan renk, burada metin olarak resmî ad alıyor; `ink`
   (#343b41) yerine o seçildi çünkü açık yeşil zeminde #343b41 mavimsi duruyor. */
export const customerAppAccent = {
  'accent-leaf': '#a9c46b', // "TAKİP" çipi zemini
  'ink-deep': '#15170f', // "TAKİP" çipi metni (scrim mürekkebinin katısı)
} as const satisfies Record<string, string>;

/* ── MARKA renkleri — Token Kararlari #5 ─────────────────────────────────────
   Palete AİT DEĞİL: üçüncü tarafların kendi renkleri. Semantik ailelere karışmazlar (bir
   marka yeşili "olumlu" demek değildir) ve temayla dönmezler — döndükleri an marka olmaktan
   çıkarlar. Token olarak duruyorlar ki ham hex ikon/rozet gövdesine dağılmasın (CLAUDE §3). */
export const customerAppBrand = {
  /* AD ÇARPIŞMASI: Token Kararlari #5 bunu "brand-whatsapp" diye yazmıştı, ama o ad ZATEN
     operasyonun koyultulmuş ikon yeşiline (#128c4b) ait — aynı CSS adı iki değer taşıyamaz.
     `brand-whatsapp-pure` (WhatsApp'ın kanonik marka yeşili) Token Kararlari #21 ile RESMÎ ad
     oldu; operasyonun `brand-whatsapp`ı ayrı bir kayıt olarak yerinde kalıyor — ikisi aynı
     markanın iki farklı bağlamdaki tonudur, tek ada indirilmedi. */
  'brand-whatsapp-pure': '#25d366',
  'brand-google': '#4285f4', // Google ile giriş düğmesi
  /* Apple Pay / Apple ile giriş — ham siyah. `ink`e ÇEKİLMEZ: marka işareti paletin mürekkebi
     değildir ve Apple'ın kılavuzu tam siyah ister. */
  'brand-apple': '#000000',
  'brand-stripe': '#635bff', // ödeme sağlayıcı künyesi
  'brand-visa': '#1a1f71',
  /* Mastercard tek renk değil, iç içe iki halka: kırmızı + sarı. İkisi de token, çünkü işaret
     ancak ikisiyle birlikte doğru çizilir. */
  'brand-mastercard': '#eb001b',
  'brand-mastercard-alt': '#f79e1b',
} as const satisfies Record<string, string>;

/* Uygulamaya-özgü renklerin tam kümesi (25): 6 fark + 19 yeni. Tabanla birleştirilerek
   kullanılır — `{ ...customerColors, ...customerAppColors }`. */
export const customerAppColors = {
  ...customerAppOverrides,
  ...customerAppSand,
  ...customerAppError,
  ...customerAppScrim,
  ...customerAppCreamGlass,
  ...customerAppAccent,
  ...customerAppBrand,
} as const satisfies Record<string, string>;

/* ── TİPOGRAFİ — uygulamaya özgü kademeler (Token Kararlari #6) ──────────────
   Tabandaki ölçek olduğu gibi geçerlidir; burada yalnız uygulamanın kendi durakları var.
   `--line-height` / `--font-weight` / `--letter-spacing` sonekleri Tailwind v4'ün kademe
   alt-özellikleridir; taban dosyayla aynı yazım korunur ki iki taraf aynı dille okunsun. */
export const customerAppText = {
  /* Başlık kademeleri — Lora 600. Tabanın `card-title-sm`i (18px) ile yuvarlanMAdılar:
     kararın açık hükmü "17 resmîdir, 18'e yuvarlama yok". Gerekçe cihazda görünür — telefon
     başlık çubuğu 17'de tek satıra sığıyor, 18'de kırılıyor. `sheet-title` yüzen sayfanın
     (bottom sheet) başlığıdır; ekran başlığından bir kademe yüksek çünkü sheet açıkken
     ekranın kendisi arka plana düşer. */
  'screen-title': '17px', // uygulama ekran başlığı (Lora 600)
  'screen-title--font-weight': '600',
  'sheet-title': '19px', // yüzen sayfa başlığı (Lora 600)
  'sheet-title--font-weight': '600',

  /* Yardımcı satır — alan altı açıklaması, sayaç, "KDV dahil" gibi ikinci sesli bilgi.
     Tabanın `note` (13) ile `micro` (11.5) kademeleri arasında kendi durağı var çünkü bu rol
     dar ekranda 13'te gövdeyle karışıyor, 11.5'te okunmuyor. */
  helper: '12px',

  /* Düğme etiketi — tabanın `chip` (14) ve `control` (13.5) kademeleriyle birleştirilMEdi:
     dokunma hedefinin etiketi çipten kalın durmalı, yarım piksel burada da komşu öğeyle hizayı
     belirliyor (kontrol kademelerinde yuvarlama yok kuralı). */
  button: '14.5px',
  'button--font-weight': '700',

  /* ÜSTBAŞLIK — bu dosyanın TEK bilinçli ad çakışması, üç alt-anahtarıyla birlikte.
     Ad `eyebrow-app` iken sadeleşti: dosya zaten uygulama alanı, sonek aynı bilgiyi ikinci kez
     söylüyordu (kullanıcı kararı 07.08 — sonek yerine dosya ayrımı).
     DİKKAT — tabandaki karşılıkları: `eyebrow` 14px/600/.12em (web masaüstü) · `eyebrow-sm`
     11px/600/.1em (web'in mobil forku). Uygulamada rol farklı: daha küçük, daha kalın, daha
     aralıklı — telefonda üstbaşlık başlıkla aynı sütunda durur ve ondan ancak harf aralığıyla
     ayrışır. Kompozisyonda `eyebrow`in ÜÇ alt-anahtarı da (boyut · ağırlık · aralık) buradan
     kazanır; yarım ezme yok, yani karışık bir kademe doğmaz. `eyebrow-sm` tabandan gelmeye
     devam eder ama uygulamada kullanılmaz — web'in kendi mobil forkudur. */
  eyebrow: '10px',
  'eyebrow--font-weight': '700',
  'eyebrow--letter-spacing': '0.18em',

  /* ── ROZET kademesi — Token Kararlari #16 ──────────────────────────────────
     v3'ün EN ÇOK YİNELENEN öğesinin (~18 kullanım: fiyat çipi · TÜKENDİ · İNDİRİM · TOPTAN ·
     geri sayım · TAKİP) kendi kademesi. Daha önce `field-label` (12,5) ölçüsü + `button` (700)
     ağırlığı KARIŞTIRILARAK kuruluyordu; iki ayrı kademeden devşirilen bir üçüncü kademe, ikisi
     de kendi gerekçesiyle değiştiği gün rozeti sessizce bozardı.
     Aralık `.06em`: üstbaşlığın `.18em`i büyük harfli bir SATIR içindir; rozet tek kelimedir ve
     .18em'de harfler dağılıyordu. */
  badge: '12.5px',
  'badge--font-weight': '700',
  'badge--letter-spacing': '0.06em',
  /* Küçük rozet — fotoğrafın ÜSTÜNDEKİ durum etiketi (TÜKENDİ/İNDİRİM). Yalnız ÖLÇÜ farkıdır:
     ağırlık ve harf aralığı `badge`in kendisinden okunur, ikinci kez YAZILMAZ (CLAUDE §1) —
     iki yerde duran aynı değer bir gün ayrışır ve iki rozet farklı görünmeye başlar. */
  'badge-sm': '10px',
} as const satisfies Record<string, string>;

/* ── KÖŞE YARIÇAPLARI — Token Kararlari #7'nin RESMÎ SETİ ────────────────────
   Dört kademe: rozet 12 · buton/girdi 16 · kart 20 · hap 22. `badge` ve `control` tabanda hiç
   yok (YENİ); `card` ve `pill` tabanla aynı adı taşır ama başka değerdedir (FARK — web 18 ve
   26'da kalır, kompozisyonda uygulama kazanır).
   NOT: kompozisyonda tabandan `soft` (14px) de gelir; resmî set onu içermez, uygulama tasarımı
   kullanmaz. Tabandaki BEKLEYEN kaydı o kademenin akıbetini (12 ya da 16'ya yuvarlanıp
   silinmesi) izliyor — burada ikinci bir kayıt açmak aynı borcu iki yerde tutmak olurdu. */
export const customerAppRadius = {
  badge: '12px', // rozet, küçük etiket (YENİ)
  control: '16px', // buton, girdi, seçim kutusu (YENİ)
  card: '20px', // kart, panel, yüzen sayfa (FARK — taban 18px)
  pill: '22px', // hap düğme, çip, sayaç (FARK — taban 26px)
} as const satisfies Record<string, string>;

/* ── GÖLGELER — Token Kararlari #5 ───────────────────────────────────────────
   İki gölge var, ikisi de tasarımda ölçülmüş değerler:
   · `soft` — klasik yükseklik gölgesi (kaynak: Mobil - Musteri v2, 18 kullanım).
     NOT: rgb(58,65,71) ESKİ mürekkeptir (#3a4147); karar #1 o rengi `ink`e (#343b41) çekti ama
     gölge değerini AYNEN yazdı. %8 opaklıkta iki mürekkep ayırt edilemediği için karar metnine
     sadık kalındı — `ink`e çekilmesi ayrı görsel turun işi, sessizce değiştirilmedi.
   · `hard` — v3'ün imzası: kaydırılmış, bulanıklığı olmayan mürekkep gölge (26 kullanım).
     Değeri tabandaki `ink`ten TÜRETİLİR, ikinci kez yazılmaz: mürekkep değişirse gölge de
     değişir. Basılı durumda öğe `translate(2px,2px)` ile bu gölgeyi yutar (karar #8). */
/**
 * Sert gölgenin KAYMA MİKTARI (px) — gölge dizgesi bundan türer, sayı ikinci kez yazılmaz.
 * Ayrıca bir ölçü olarak dışarı verilir: gölge kutunun DIŞINA taşar, dolayısıyla onu çizen öğenin
 * kendi düzen kutusunda bu kadar yer ayırması gerekir. Ayırmayan öğe, kendisini sınırında kırpan
 * bir kapsayıcının (kaydırma alanı) içinde gölgesini kaybeder — ölçüldü, cihaz 09.08.
 */
export const customerAppShadowOffset = 3;

export const customerAppShadow = {
  soft: '0 1px 3px rgba(58, 65, 71, 0.08)',
  hard: `${customerAppShadowOffset}px ${customerAppShadowOffset}px 0 ${customerSurface.ink}`,
  /* · `badge` — Token Kararlari #16'nın TEK DURAĞI. Rozet fotoğrafın ya da kartın üstünde YÜZER;
     `soft`un 1 px'lik yüksekliği orada yetmiyor, rozet fotoğrafa yapışık duruyordu. Tasarımda
     .18/.20/.22/.25 dörtlüsü ölçüldü, karar hepsini .22'ye çekti — bir rozetin ne kadar
     yükseldiği içeriğine göre değişmemeli. Mürekkebi `soft`unkinden farklı (rgb 21,23,15):
     gölge fotoğrafın üstüne düşüyor ve orada mavimsi bir gri kirli duruyor. */
  badge: '0 3px 8px rgba(21, 23, 15, 0.22)',
} as const satisfies Record<string, string>;

/* ── BULANIKLIK — Token Kararlari #17'nin "blur(8px) kalır ve kurala bağlanır" hükmü ─────────
   Krem cam yüzeyin ARKASINDAKİ içeriğe uygulanan bulanıklık yarıçapı. Renk değil, ama krem camla
   birlikte TEK bir yüzey tarif ediyorlar: saydamlık olmadan bulanıklık görünmez, bulanıklık
   olmadan saydamlık altındaki metni okunur bırakır ve çubuk kirlenir. Bu yüzden token — çağıran
   "yarı saydam krem" derken ikisini birden almalı.
   Değer CSS yarıçapıdır (`backdrop-filter: blur(8px)`); RN tarafında `expo-blur` yarıçap değil
   1–100 arası bir YOĞUNLUK ister ve px↔yoğunluk için tanımlı bir dönüşüm YOKTUR — çeviri
   tüketicinin işidir ve gerekçesi orada durur (`apps/mobile/src/theme/metrics.ts`). */
export const customerAppBlur = {
  glass: '8px',
} as const satisfies Record<string, string>;

/* ── FOTOĞRAF GRADYANLARI — Token Kararlari #5 ───────────────────────────────
   Fotoğrafın üstündeki yazının okunmasını sağlayan iki skrim; kaynak Mobil - Musteri v3'teki
   ölçülmüş değerler (üstte .28 → şeffaf %32, altta şeffaf %40 → .82). Renk durakları `scrim`
   ailesiyle AYNI mürekkeptir ama token olarak ayrı durmaları gerekiyor: taşıdıkları yeni bilgi
   renk değil, DURAK YERİ (yüzde) ve yön.
   Şeffaf durak `rgba(…, 0)` yazılır, `transparent` değil — `transparent` bazı motorlarda
   "şeffaf SİYAH" demektir ve geçişin ortasını griye kirletir.
   RN tarafı bu dizgeleri doğrudan kullanamaz (expo-linear-gradient renk + durak DİZİSİ ister);
   çeviri tüketicinin işidir — bkz. başlıktaki "birim/parse dönüşümü" kuralı. */
export const customerAppGradient = {
  'photo-top': 'linear-gradient(180deg, rgba(21, 23, 15, 0.28), rgba(21, 23, 15, 0) 32%)',
  'photo-bottom': 'linear-gradient(180deg, rgba(21, 23, 15, 0) 40%, rgba(21, 23, 15, 0.82))',
} as const satisfies Record<string, string>;
