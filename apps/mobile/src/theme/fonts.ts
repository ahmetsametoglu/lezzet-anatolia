import { Karla_400Regular, Karla_600SemiBold, Karla_700Bold } from '@expo-google-fonts/karla';
import { Lora_400Regular, Lora_600SemiBold } from '@expo-google-fonts/lora';

/*
  FONT VARLIKLARI — Token Kararlari #24.

  İKİ AİLE, BEŞ AĞIRLIK: başlık Lora 400·600, gövde Karla 400·600·700. İTALİK YÜKLENMEZ —
  tasarımın 2067 satırında tek bir `font-style:italic` yok (yalnız VISA logosunun kendi metni,
  o da bir marka işareti). Yüklenmeyen her varyant açılış süresinden ve paket boyundan düşer.

  NEDEN `@expo-google-fonts/*` PAKETLERİ, `assets/fonts/*.ttf` DEĞİL: paket sürümlü ve kilitli
  (`pnpm-lock.yaml`), yani aynı commit her makinede AYNI dosyayı verir. Repoya elle atılan bir
  `.ttf`in sürümü yoktur — "hangi Lora?" sorusunun cevabı dosyanın kendisinde durmaz ve bir gün
  güncellenmesi gerektiğinde kimse hangi sürümden geldiğini bilemez.

  ── AĞIRLIK AİLE ADININ İÇİNDEDİR (RN gerçeği) ──────────────────────────────
  Web'de `font-family:'Lora'` + `font-weight:600` yeter; tarayıcı aynı ailenin doğru kesitini
  seçer. RN'de böyle bir aile kavramı YOK: `expo-font` her dosyayı VERİLEN ADLA tek bir aile
  olarak kaydeder, `fontWeight` ise özel bir ailede ya yok sayılır ya da (Android) sahte kalınlık
  üretir — 700'lük Karla'nın 18 kullanımı sahte kalınla çirkin görünürdü.

  Bu yüzden seam AĞIRLIKLA İNDEKSLENİR: `theme.font.body[700]`. Çağıran ağırlığı zaten token'dan
  okuyor (`theme.text['button--font-weight']`), aileyi de aynı değerle indeksliyor — yani aile ile
  ağırlığın AYRIŞMASI mümkün değil. İkisini iki ayrı satırda seçmek ("`font.bodyStrong` + 700"),
  bir gün birinin değişip ötekinin kalmasına açık kapı bırakırdı.

  FOUT KABUL (kararın açık hükmü): yükleme AÇILIŞI ENGELLEMEZ. Fontlar gelene kadar RN bilinmeyen
  aileyi sistem fontuna düşürür ve `fontWeight` orada normal şekilde çalışır — yani ilk kare
  fontsuz değil, sistem fontunun doğru ağırlığıyla çizilir. Metrik yakın yedekler (Georgia /
  system-ui) RN'de ayrıca yazılMAZ: platformun kendi düşüşü zaten odur.

  ── STİLLERE `fontWeight` YAZILMAZ (cihaz kanıtı 09.08) ─────────────────────
  Yukarıdaki "ağırlık aile adının içindedir" kuralının İKİNCİ yarısı: `fontFamily` bu seam'den
  gelirken stile AYRICA `fontWeight` yazmak, RN yeni mimarisinde aile çözümlemesine karışıyor —
  motor 'Karla_700Bold' ailesinin '700' kesitini arıyor, tek kesitlik kayıtta bulamıyor ve İKİ
  platformda da sessizce sistem fontuna düşüyor (Android'de Roboto bastığı için gözle yakalandı:
  ürün detayında tek satırlık kaldır-karşılaştır deneyiyle kanıtlandı, 285 satır tek geçişte
  söküldü). Kalınlık zaten ailenin adında; `fontWeight` yalnız fontFamily'siz (sistem fontu)
  metinlerde meşrudur ve bugün öyle bir kullanım yok.
*/

/**
 * `expo-font`e verilen harita — ANAHTAR, kaydedilen ailenin adı olur.
 * Google Fonts paketlerinin ihraç adları aynen anahtar olarak kullanılıyor: ikinci bir adlandırma
 * ("LoraSemiBold") kaynağı ile kaydı arasına çeviri koyar ve o çeviri bir gün yanlış olur.
 */
export const appFontAssets = {
  Lora_400Regular,
  Lora_600SemiBold,
  Karla_400Regular,
  Karla_600SemiBold,
  Karla_700Bold,
} as const;

/** Yüklenen aile adlarının birliği — seam bunun DIŞINA çıkamaz (aşağıdaki `satisfies` zorlar). */
type LoadedFontFamily = keyof typeof appFontAssets;

/**
 * Tema seam'i: ROL → AĞIRLIK → aile adı.
 *
 * `satisfies` bağı load-bearing: bir varlık haritadan çıkarsa ya da adı değişirse burası
 * DERLEMEDE kırılır — yüklenmemiş bir aileye stil bağlayıp cihazda sessizce sistem fontuna
 * düşmek yerine, hata makinede çıkar.
 */
export const appFont = {
  /** Başlık ailesi — Lora (tasarımda 88 kullanım; yalnız başlık ve ürün adı). */
  display: {
    400: 'Lora_400Regular',
    600: 'Lora_600SemiBold',
  },
  /** Metin ailesi — Karla (gövde, etiket, düğme, rozet). */
  body: {
    400: 'Karla_400Regular',
    600: 'Karla_600SemiBold',
    700: 'Karla_700Bold',
  },
} as const satisfies Record<string, Record<number, LoadedFontFamily>>;
