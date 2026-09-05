/**
 * `2026-08-26T13:27:41Z` → `26.08 · 15:27` (cihaz saatiyle) — sözleşmeler dil-bağımsız ISO taşır,
 * cümleyi yüzey kurar. Üçüncü tüketiciyle (21.12 şikâyet/istisna) tek dosyaya indi; ilk ev
 * `sale-history-screen`di (21.119).
 */
export function stampOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `2026-08-26T13:27:41Z` → `26.08.2026 15:27` — **fişin** damgası. Kısa hâlden ayrı duruyor çünkü
 * soru farklı: listede "bugünün hangi saati" sorulur (yıl gürültüdür), fişte "hangi gün" sorulur ve
 * fiş bir belgedir — yılsız bir belge, altı ay sonra hangi yılın satışı olduğunu söylemez.
 */
export function stampFullOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `2026-08-26T15:42:00Z` → `17:42` (cihaz saatiyle) — **günü zaten belli olan** bir olayın damgası.
 *
 * `stampOf`tan ayrı çünkü soru farklı: orada "hangi gün, hangi saat" sorulur (listede dünün kaydı
 * da olabilir), burada gün BAŞLIKTA yazılı ve tekrarı gürültüdür — gün sonu özeti tanımı gereği
 * tek bir günün fotoğrafıdır, uyuşmazlığın künyesinde ikinci kez tarih yazmak satırı uzatır.
 */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* AY ADLARI TEK YERDE. Kurye üstbaşlığı BÜYÜK harf ister ("8 AĞUSTOS"), para ekranı düz yazar
   ("28 Ağustos"); ikisi de aynı listeden türer — liste iki dosyada olsaydı, biri bir gün
   ötekinden ayrılır ve iki ekran aynı günü iki farklı ay adıyla yazardı. */
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/**
 * `2026-08-28` → `28 Ağustos`. Biçim tanınmazsa **`null`** — uydurma bir gün adı yazmaktansa
 * üstbaşlık kuyruksuz kalır (CLAUDE §1: ölçülemeyen değer varsayılan değildir).
 */
export function dateLabelOf(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) return null;
  return `${Number(match[3])} ${month}`;
}

/**
 * Göreli zaman, Türkçe: `şimdi` · `9 dk` · `3 sa` · `3 g`. Dakika altı "şimdi" — saniye saymak,
 * operatöre yanlış bir aciliyet ritmi dayatmak olurdu.
 *
 * EVİ 05.09'DA DEĞİŞTİ: `notification-map.ts`te doğmuştu, ama bildirim satırı artık MUTLAK saat
 * yazıyor (gün grupları gelince "DÜN" başlığının altında "19 sa" aynı şeyi iki kez ve ikincisini
 * daha kötü söylüyordu). Geriye tek tüketici kaldı — yönetim hub'ının "son hareket" künyesi — ve
 * bir biçimleyicinin evi, onu kullanmayan bir çeviri katmanı olamaz. Kardeşleriyle aynı dosyada.
 */
export function agoOf(createdAt: string, now: Date): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  const dk = Math.floor(ms / 60_000);
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa`;
  return `${Math.floor(sa / 24)} g`;
}

/**
 * Bir damganın gün GRUBU başlığı, cihazın yerel takvimiyle: `BUGÜN` · `DÜN` · `3 EYLÜL` ·
 * `3 EYLÜL 2025`. Bildirim akışının gün ayracı (v3 `bg.baslik`).
 *
 * YIL, YALNIZ BAŞKA YILDA yazılır ve yazılması şart: okunmamış personel bildirimi hiç süpürülmüyor
 * (`notification-retention` yalnız GÖRÜLMÜŞ satırı siliyor), yani bir yıl önceki satır listenin
 * kuyruğunda gerçekten durabiliyor ve "3 EYLÜL" hangi yılın olduğunu söylemez.
 *
 * Grup anahtarı ISO'dan değil YEREL takvimden kesiliyor: `toISOString()` Fransa'da yaz saatiyle
 * 22:00'den sonra günü kaydırır ve gece vardiyasındaki personel "bugün"ü dünde görürdü
 * (`day-tag.ts` künyesindeki ders).
 *
 * `Intl` KULLANILMIYOR: Hermes'in ICU kapsamı platforma göre değişiyor ve `toLocaleDateString`
 * Android'de İngilizce ay adı döndürebiliyor — ay adları bu dosyanın kendi listesinden gelir.
 */
export function dayGroupLabelOf(iso: string, now: Date): string {
  const d = new Date(iso);
  const gun = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (gun(d) === gun(now)) return 'BUGÜN';
  const dun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (gun(d) === gun(dun)) return 'DÜN';
  const ay = MONTHS[d.getMonth()] ?? '';
  const yil = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return turkishUpper(`${d.getDate()} ${ay}${yil}`);
}

/**
 * TÜRKÇE BÜYÜK HARF — `toUpperCase` tek başına YANLIŞTIR: JS'in dil-bağımsız dönüşümü `i` → `I`
 * verir, Türkçede ise `İ` olmalı ("Nisan" → "NISAN" değil "NİSAN").
 *
 * EVİ 05.09'DA BURAYA GELDİ: `courier-format.ts`te doğmuştu, ama ikinci tüketici bildirim akışının
 * gün ayracı oldu ve bir dil kuralının evi tek bir bölümün biçimleyicisi olamaz. Kurye dosyası
 * artık buradan alıyor; iki kopya olsaydı biri bir gün ötekinden ayrılırdı (CLAUDE §1).
 *
 * Not: tasarımın kendi şablonu bu tuzağa DÜŞÜYOR — `n.bolum.toUpperCase()` ile rozette "YÖNETIM"
 * yazıyor (noktasız I). Kod onu birebir kopyalamıyor; sapma bilinçli.
 */
export function turkishUpper(value: string): string {
  return value.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/**
 * Bugünün gün adı, **cihazın yerel takvimiyle** (`28 Ağustos`). UTC'den kesilmiş bir ISO metni
 * gece yarısına yakın saatlerde bir gün kayar; personelin "bugün" dediği gün cihazının günüdür.
 */
export function todayLabel(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return dateLabelOf(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`) ?? '';
}
