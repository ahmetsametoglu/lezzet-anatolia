/*
  SİMÜLASYON HAVUZU — yalnız GELİŞTİRME (kullanıcı kararı 22.08).

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Kamera iki yerde yok: simülatörde HİÇ, gerçek cihazda da dev-client yeniden derlenene kadar
  (yeni native modül). Tarama AKIŞI ise kameradan bağımsız: çözüm, öğrenme, satır bulma, çarpan —
  hepsi kodun KENDİSİYLE çalışır. Havuz o akışı kamerasız koşturur: çipe basmak, kameranın kodu
  okumasıyla AYNI yoldan (`onScan` + tekrar-okuma kilidi) geçer. Fark tek satırdır: kodun kaynağı.

  ── ÜRETİMDE YOKTUR ─────────────────────────────────────────────────────────
  Panel `__DEV__` arkasında: release derlemesinde dal ölü koddur ve bundler atar. Ayrı bir env
  bayrağı AÇILMADI — "production'da yanlışlıkla açık kalan simülasyon" sınıfı, derleme sabitiyle
  en baştan kapanır (dev-login'in üç kilidiyle aynı içgüdü, tek kilit yeter çünkü veri yazmıyor).

  ── ÇİPLER = ELDEKİ FİZİKSEL ETİKETLER (24.08) ──────────────────────────────
  Kodlar artık formülden türemiyor; `scripts/seed/test-labels.ts`teki SABİT test etiketi setinin
  aynası (scripts paketi mobile'a bağlanamadığı için bilinçli kopya — künyeler iki tarafta da
  birbirini gösteriyor). Yani çipe basmak ile kâğıdı okutmak AYNI kodu üretir: simülasyonla
  bulunan bir arıza cihazda da, cihazda bulunan simülasyonda da tekrarlanabilir.

  Eskiden havuz sıra tabanlı bir EAN formülünü aynalıyordu ve hangi çipin hangi ekranda işe
  yaradığı tesadüftü (ölçüldü 24.08: kutulu siparişlerin kalemleriyle kesişim BOŞTU — "koli"
  çipi toplama ekranında hep "bu siparişte yok" diyordu). Set ayrışırsa çip yine kırılmaz,
  "tanınmayan kod"a düşer ve akış anlamlı kalır.
*/

export interface DevScanCode {
  /** Çipin etiketi — hangi yolu tetiklediğini söyler, kodu değil. */
  label: string;
  code: string;
}

/**
 * Beş çip — `TEST_LABELS` ile BİREBİR aynı sıra ve kodlar.
 *
 * Kâğıtta bu kodlar EAN-13/ITF-14 olarak basılı (24.08); burada yalnız metinleri durur, çünkü
 * simge kâğıdın meselesidir, kapının değil. Çipe basmak ile kâğıdı okutmak AYNI metni üretir.
 *
 * (Kutu QR'ı burada yok: kutu kodlarını çağıran ekran kendi `devCodes`'uyla verir — elindeki
 * gerçek kutuların kodları, uydurma bir kod değil. Künye: `scan-sheet.tsx`.)
 */
export const DEV_SCAN_POOL: readonly DevScanCode[] = [
  { label: 'Paket', code: '8691000007919' },
  { label: 'Koli ×24', code: '18691000047516' },
  { label: 'Toplama', code: '8691000030009' },
  { label: 'Yabancı ürün', code: '8691000040008' },
  { label: 'Tanınmayan', code: '8691000050007' },
];
