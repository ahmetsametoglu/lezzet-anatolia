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

  ── KODLAR SEED'İN AYNASI ───────────────────────────────────────────────────
  `eanBenzeri` formülü `scripts/seed/barcode.ts`tekiyle AYNI (oradan import edilemez — scripts
  paketi mobile'a bağlanmaz; formül tek satır ve bilinçli kopya, künyesi iki tarafta da birbirini
  gösteriyor). Seed değişir de kodlar tutmazsa çipler "tanınmayan kod"a düşer — akış yine anlamlı
  kalır (öğrenme daveti), sessiz bir kırılma doğmaz. SKU çipi katalog-lezza'nın ilk kodudur; aynı
  tolerans onun için de geçerli.
*/

/** `scripts/seed/barcode.ts` › `eanBenzeri`nin aynası — iki taraf birlikte değişir. */
const eanBenzeri = (n: number): string => `869${String(1000000000 + n * 7919).slice(-10)}`;

export interface DevScanCode {
  /** Çipin etiketi — hangi hâli tetiklediğini söyler, kodu değil. */
  label: string;
  code: string;
}

/**
 * Dört çip dört ayrı yolu tetikler: paket (çarpan 1) · koli (çarpan kadar öner) · SKU (zincirin
 * ikinci halkası, cümlesi "SKU eşleşmesi" der) · tanınmayan (öğrenen eşleme ekranı).
 */
export const DEV_SCAN_POOL: readonly DevScanCode[] = [
  { label: 'Paket barkodu', code: eanBenzeri(0) },
  { label: 'Koli barkodu', code: `1${eanBenzeri(0)}` },
  { label: 'SKU', code: '700404' },
  { label: 'Tanınmayan kod', code: 'DEV-TANINMAYAN-01' },
];
