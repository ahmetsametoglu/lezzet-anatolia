import { LOCALES, localizedPath } from '@lezzet/i18n';

/*
  GELEN BAĞLANTININ İÇ ROTAYA ÇEVRİLMESİ (21.43) — expo-router'ın `+native-intent` kancası.

  ── NİYE GEREKLİ ────────────────────────────────────────────────────────────
  Davet bağlantısı bir WEB adresidir ve olması gereken de budur: uygulaması olmayan davetli onu
  tarayıcıda açar (`apps/web` well-known künyesi). Ama adresin ŞEKLİ web'in şeklidir —
  `https://…/fr/parrainage/AB12CD34`: dil öneki var ve davet segmenti üç dilde üç ayrı sözcük.
  Uygulamanın rota ağacında ne dil öneki var (dil bir CİHAZ tercihi, adresin parçası değil) ne de
  üç ayrı davet klasörü. Bu kanca aradaki çeviriyi yapar: gelen adres `/invite/<kod>`a indirilir.

  ── SEGMENTLER YAZILMIYOR, TÜRETİLİYOR ──────────────────────────────────────
  Üç sözcüğü ("davet", "parrainage", "einladung") buraya elle yazmak, `PATHNAMES`in dördüncü
  kopyası olurdu (CLAUDE §1) — ve sessizce eskiyen türden: rota adı web'de değişse bu dosya
  derlenmeye devam eder, yalnız bağlantı bir gün uygulamayı açmaz olur. `localizedPath` aynı
  tablodan üretiyor; tablo değişirse eşleme kendiliğinden değişir.

  ── TANIMADIĞI ADRESE DOKUNMAZ ──────────────────────────────────────────────
  Kanca gelen HER derin bağlantıyı görür (uygulama şeması dâhil). Davet olmayan her adres olduğu
  gibi geri verilir; burada bir yönlendirme tablosu kurulmaz. `null` döndürmek de yanlış olurdu —
  o "yönlendirme yok" demek ve uygulamayı bulunduğu yerde bırakmak anlamına gelir.

  ── HATA UYGULAMAYI ÇÖKERTİR ────────────────────────────────────────────────
  expo-router'ın kendi uyarısı: bu fonksiyonda fırlatılan hata çökmeye yol açabilir. Bozuk bir URL
  (`new URL` fırlatır) yüzünden uygulamanın açılmaması, davetin hiç çalışmamasından beterdir — bu
  yüzden gövde tek bir `try` içinde ve düşerse adres olduğu gibi geri verilir.
*/

/** `/invite/[code]` rotasının bir dildeki karşılığı — `/davet/` gibi, kodsuz ve eğik çizgili. */
function invitePrefix(locale: (typeof LOCALES)[number]): string {
  // Yer tutucuyu boş geçiriyoruz: geriye segmentin kendisi kalıyor ("/davet/").
  return localizedPath('/invite/[code]', locale, { code: '' });
}

/**
 * Gelen yolun davet bağlantısı olup olmadığına bakar; öyleyse uygulamanın iç rotasını döner.
 * Değilse `null` — çağıran adrese dokunmaz.
 */
function inviteRouteOf(pathname: string): string | null {
  for (const locale of LOCALES) {
    const prefix = `/${locale}${invitePrefix(locale)}`;
    if (!pathname.startsWith(prefix)) continue;
    // Segmentin kalanı koddur; sondaki eğik çizgi ve fazlalık yol parçaları atılır.
    const code = pathname.slice(prefix.length).split('/')[0]?.trim();
    if (code) return `/invite/${code}`;
  }
  return null;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Gelen değer TAM URL de olabilir (`https://…`), yol da (`/fr/parrainage/…`). İkinci parametre
    // yalnız göreli yolun ayrıştırılabilmesi için var; kökeni burada kullanılmıyor.
    const pathname = new URL(path, 'https://placeholder.invalid').pathname;
    return inviteRouteOf(pathname) ?? path;
  } catch {
    /* Ayrıştırılamayan adres olduğu gibi geçer: expo-router onu kendi kurallarıyla ele alır ve
       tanımıyorsa "sayfa yok"a düşer — uygulamayı çökertmekten iyidir (üstteki künye). */
    return path;
  }
}
