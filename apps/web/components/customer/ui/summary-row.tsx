import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import summaryMessages from './summary-messages.json';

/**
 * **Sipariş özetinin ORTAK SÖZCÜKLERİ — nötr zemin** (08.20).
 *
 * Bu blok ÜÇ ekranda çiziliyor (checkout · sipariş onayı · sipariş detayı) ve kelimeleri üç ayrı
 * sözlükte kopyalanmıştı. Aile içi kopya 07.08'de kapandı (onay ekranı checkout'un sözlüğünü
 * okuyor), ama **aileler arası** kopya kaldı: `orders` ile `checkout` aynı beş kelimeyi ayrı ayrı
 * taşıyordu.
 *
 * ── NEDEN `orders`'I `checkout`A BAĞLAMADIM ─────────────────────────────────
 * En kısa yol oydu ve YANLIŞ olurdu: sipariş geçmişi, ödeme akışının sözlüğüne bağımlı hâle
 * gelirdi. Sipariş detayı checkout'un devamı DEĞİL — biri satın almanın son adımı, öteki aylar
 * sonra bakılan bir kayıt. Bağımlılık yönü anlamı takip etmeli.
 *
 * ── SÖZLÜK ÇİZEN KOMPONENTİN YANINDA ────────────────────────────────────────
 * Yeri burası çünkü bu kelimeleri çizen şey `SummaryRow`'un kendisi (`site-frame-messages.json` ve
 * `reorder-messages.json` emsali). Ayrı bir "ortak sözlük" klasörü açmak, `CLAUDE §2`'nin
 * "global JSON yok" kuralını dolambaçlı yoldan kırmak olurdu.
 *
 * ── ⚠ KOPYALAR ZATEN AYRIŞMIŞTI (ölçüldü 08.08) ────────────────────────────
 * Görev satırı riski teorik anlatıyordu; ölçünce **gerçekleşmiş** hâlini bulduk. Türkçede dört
 * ekran da "Genel toplam" diyor, ama:
 *
 *   Fransızca:  checkout/sepet **"Total"**            · sipariş detayı **"Total général"**
 *   Almanca:    checkout **"Gesamtsumme"** · sepet **"Gesamt"** · detay **"Gesamtbetrag"**
 *
 * Yani aynı satır Almancada ÜÇ ayrı kelimeyle yazılıyordu ve hiçbir yerde hata vermiyordu — dört
 * dosya da kendi içinde geçerliydi. Türkçeye bakan biri de sorunu göremezdi. Birleştirmede
 * checkout'un sözcükleri alındı (en yoğun ekran) ve "Sous-total / Total" ile
 * "Zwischensumme / Gesamtsumme" çiftleri kendi içinde tutarlı kalıyor.
 *
 * ── İNDİRİM SÖZCÜKLERİ DE BURADA ────────────────────────────────────────────
 * `discountLabel` (`lib/cart/discount-label.ts`) indirim satırının metnini kuran saf fonksiyon ve
 * sözlüğünü ÇAĞIRANDAN alıyor — sepet ile checkout aynı dört kelimeyi ayrı ayrı taşıyordu (üç dilde
 * 24 satır). Artık ikisi de bu sözlüğü geçiriyor. Fonksiyonun kendisi JSON'u okumuyor: `lib`in
 * `components`e uzanması katman yönünü tersine çevirirdi.
 *
 * **Taşınmayanlar ve sebepleri:** `subtotal` yalnız sipariş detayında var (checkout'ta ara toplam
 * satırı yok) · `deliveryDay` iki ekranda AYNI kelime ama farklı rol (checkout'ta adım başlığı,
 * detayda satır etiketi) · `status`/`milestone` sözlükleri metin olarak çakışıyor ama anlamları
 * ayrı ("Hazırlanıyor" ≠ "Hazırlandı") — bu ayrım 07.08'de ölçülmüştü, tekrar sınanmadı.
 */
/**
 * Ortak sözcükleri dile göre verir. Prop olarak taşınmıyor: bu kelimeler çağıranın kararı değil,
 * blokun kendi sözlüğü — dört ekranın dördü de `locale`i zaten elinde tutuyor.
 *
 * Dönüş tipi ADLANDIRILMADI ve bilerek: `LocalizedCopy<typeof summaryMessages>` zaten JSON'dan
 * türüyor, ayrıca dışa verilen bir ad hiçbir çağıran tarafından yazılmıyordu (knip ölü gösterdi).
 * Tip gerekirse `ReturnType<typeof summaryCopy>` ile alınır — tek kaynak yine JSON.
 */
export function summaryCopy(locale: Locale): LocalizedCopy<typeof summaryMessages> {
  return summaryMessages[locale];
}

/**
 * Özet satırı — solda etiket, sağda tutar (denetim bulgusu M2, 02.08).
 *
 * Üç yerde ayrı ayrı yazılmıştı (checkout özeti, sipariş onayı, sipariş detayı) ve **üçü de birbirinden
 * sapmıştı**: tutar bir yerde `font-bold` bir yerde `font-semibold`, yeşil bir yerde `olive` bir yerde
 * `olive-dark`, tonun etikete de uygulanıp uygulanmadığı her yerde başka. Aynı satır, üç görünüm.
 *
 * Tasarım tek ve net (`Musteri - Checkout.dc.html:91-95` · `Musteri - Siparis Detay.dc.html:76-77`):
 * tutar **700**, yeşil **#5f7a2c** (`olive`, `olive-dark` değil) ve **iki ton hâli var** —
 *   `olive`      → İNDİRİM satırı: etiket de tutar da yeşil (tasarımda renk satırın kendisinde).
 *   `oliveValue` → ÜCRETSİZ teslimat: yalnız tutar yeşil, etiket gövde tonunda kalır.
 * İkisini tek bir "yeşil" hâline indirmek, tasarımın ayırdığı iki cümleyi birleştirmek olurdu:
 * indirim satırın tamamı bir kazançtır, ücretsiz teslimatta kazanç yalnız tutardır.
 *
 * Ürün kalemleri de aynı satırdır (tasarım onları da aynı blokta, aynı ağırlıkla çiziyor) — ayrı bir
 * "kalem satırı" yok.
 */
type SummaryRowTone = 'default' | 'olive' | 'oliveValue';

interface SummaryRowProps {
  label: string;
  value: string;
  tone?: SummaryRowTone;
}

export function SummaryRow({ label, value, tone = 'default' }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-body-sm">
      <span className={tone === 'olive' ? 'text-olive' : 'text-body'}>{label}</span>
      <span className={['font-bold', tone === 'default' ? 'text-ink' : 'text-olive'].join(' ')}>{value}</span>
    </div>
  );
}
