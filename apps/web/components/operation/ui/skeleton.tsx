import type { ReactNode } from 'react';
import { COLUMN_SELF as SELF, templateOf, type ColumnTrack } from './table-columns';
import { CONTROL_H } from './control';

/**
 * Operasyon yükleme iskeleti — Komponent Envanteri O#, "yükleniyor" hâli (09.2).
 *
 * **Neden boş kutu ya da "Yükleniyor…" değil.** Bekleyen bir ekranın üç yanlış cevabı var ve operasyon
 * yüzeyinde üçü de vardı:
 *  1. **Boşluk** — kutu hiç çizilmiyor. Kullanıcı ekranın bittiğini ya da bozulduğunu sanır.
 *  2. **Çıplak metin** — `Yükleniyor…`. Gelecek içeriğin ŞEKLİ yok; içerik gelince yerleşim zıplar ve
 *     operatörün tıklamak üzere olduğu düğme yer değiştirir.
 *  3. **Yanlış boş hâl** — `—` / `0` / "kayıt yok". En tehlikelisi: ölçülemeyen değeri sıfır göstermek
 *     (CLAUDE.md §1 kırmızı çizgisi). "0 sipariş" ile "henüz okumadım" aynı şey değil.
 * İskelet dördüncü ve doğru cevabı verir: **birazdan burada şu şekilde bir şey olacak.**
 *
 * **Müşteri kitinden AYRI SET, bilinçli** (`components/customer/ui/skeleton.tsx`): o kit `kum-*`
 * paletine gömülü ve operasyonun karanlık modu yok sayılırsa çubuklar koyu zeminde beyaz lekelere
 * dönüşür (CLAUDE.md §3: Tailwind'in sabit renkleri operasyonda kullanılmaz). Ortak olan tek parça ARIA
 * sarmalayıcısıdır ve o `components/loading-region.tsx`'te tek nüsha duruyor. Buton/rozet/girdinin
 * iki-set deseni aynen geçerli.
 *
 * `animate-pulse` bilinçli olarak sönük: iskelet bir bekleme göstergesidir, ekranın ilgi merkezi değil.
 */

/** Çubuk — metin satırı, rozet, sayı yerine geçen temel parça. Ölçüyü çağıran verir. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-[6px] bg-ops-gray-100 ${className}`} aria-hidden="true" />;
}

/**
 * Blok — avatar, görsel, ikon kutusu gibi DOLU alanlar. Çubuktan farkı yatay geçiş taşıması: dolu bir
 * alan tek düz tonda "kırık kutu" gibi duruyor.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-ops-card bg-gradient-to-r from-ops-gray-100 via-ops-gray-50 to-ops-gray-100 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Kart kabuğu — panelin/diyaloğun gerçek kartıyla AYNI çerçeve, ped ve zemin.
 *
 * Ayrı bir kutu yazmak yerine burada durması bilinçli: iskeletin gelen içerikle aynı kabuğu paylaşması
 * gerekiyor, yoksa yükleme bitince kart bir kez görünüp kaybolan bir çerçeve gibi sıçrıyor. Sayfalar
 * yalnız İÇİNİ tarif eder.
 */
export function SkeletonCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Metin bloğu — `lines` satır, sonuncusu KISA.
 *
 * Son satırın kısalığı küçük ama önemli: eşit uzunlukta çubuklar tablo gibi okunuyor, kısalan son satır
 * ise paragraf gibi. İskeletin işi "burada ne gelecek" sorusuna cevap vermek.
 */
export function SkeletonText({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/5' : 'w-full'}`} />
      ))}
    </div>
  );
}

/**
 * Etiket + değer iskeleti — `InlineMetric` ve `Metric`in beklerken aldığı hâl.
 *
 * Sayının yerine `—` ya da `…` yazmak yerine bu var: `—` "ölçülemedi" demektir ve o ekranlarda GERÇEK
 * bir anlam taşıyor (tahsilat hareketi yok). Beklerken aynı işareti göstermek, iki farklı durumu tek
 * görüntüye indirmek olurdu.
 */
export function SkeletonMetric({ boxed = true }: { boxed?: boolean }) {
  const govde = (
    <>
      <Skeleton className="h-2.5 w-14" />
      <Skeleton className="h-4 w-20" />
    </>
  );
  return boxed ? (
    <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5" aria-hidden="true">
      {govde}
    </div>
  ) : (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {govde}
    </div>
  );
}

/**
 * Liste satırı iskeleti — kart biçimli satırların (sipariş kartı, adres, kupon) beklerken hâli.
 *
 * `rows` kadar satır çizer ve sayı ÖNEMLİ: gelecek içerikten belirgin biçimde fazla satır çizmek,
 * yükleme bitince listenin küçülmesi demek — ekran bir kez uzayıp sonra toparlanıyor. Çağıran gerçekten
 * beklediği sayıyı verir (ör. son siparişler tavanı 5 ise 3 makul bir orta).
 */
export function SkeletonRows({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
          <span className="ml-auto flex items-center gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-16 rounded-[7px]" />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Rota iskeletinin TABLO kabuğu — başlık satırı gerçek, gövde iskelet.
 *
 * Şeritleri (`ColumnTrack[]`) gerçek tablonun kullandığı diziden alır: kolon genişlikleri, sıra ve
 * hizalama **tek kaynaktan**. Bir tur beş `loading.tsx` bu ölçüleri elle yazmıştı ve dördü tutmuyordu
 * — iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken tam tersini yapıyordu (CLAUDE.md §1;
 * bağımsız ajan denetimi, 30.07).
 *
 * **Sütun başlıkları GERÇEK metin.** Statik oldukları için bekleyen bir şey yok; onları da çubuk
 * yapmak elde olan bilgiyi saklamak olurdu — operatör hangi ekranda olduğunu başlıktan anlıyor.
 */
export function SkeletonTable({ tracks, rows = 12 }: { tracks: readonly ColumnTrack[]; rows?: number }) {
  const template = templateOf(tracks);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        style={{ gridTemplateColumns: template }}
        className="grid gap-x-2.5 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted"
      >
        {tracks.map((t) => (
          <span key={t.key} className={SELF[t.align ?? 'left']}>
            {t.header}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            style={{ gridTemplateColumns: template }}
            className="grid items-center gap-x-2.5 border-b border-ops-line-soft px-5 py-3"
          >
            {tracks.map((t, ci) => (
              <div key={t.key} className={t.align && t.align !== 'left' ? SELF[t.align] : 'min-w-0'}>
                {/* İlk kolon genelde iki satırlık kimliktir (ad + kod/telefon); gerisi tek çubuk.
                    Genişlik dönüşümlü: eşit çubuklar tabloyu bir tarama deseni gibi gösteriyor. */}
                {ci === 0 ? (
                  <span className="flex flex-col gap-1">
                    <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-3/5' : 'w-2/5'}`} />
                    <Skeleton className="h-2.5 w-2/5" />
                  </span>
                ) : (
                  <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-4/5' : 'w-3/5'} max-w-[80px]`} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ── Ekran kabuğunun iskelet parçaları (denetim O3) ────────────────────────────
 *
 * Dört `loading.tsx` (siparişler · fiyatlar · ürünler · stok) docblock dahil kopyala-yapıştırdı;
 * değişen yalnız dört parametreydi. Ama tek bir "her ekranı çizen" iskelet komponenti yerine
 * PARÇALAR duruyor: beşinci ekran (tedarik) kart tabanlı, tabloya benzemiyor — tek konfigürasyon
 * nesnesine bağlanan bir bileşen onu ya dışarıda bırakırdı ya da kendi içinde ikinci bir düzen
 * dalı açardı. Parçalar birleşince tekrar ölüyor, düzen serbest kalıyor.
 *
 * Ölçüler GERÇEK bileşenlerden gelir ve buradaki yorumlar o bağı söyler; iskeletin tek işi
 * "içerik gelince hiçbir şey kaymasın".
 */

/** `PageHeader` ölçüsü (px-6 py-4): başlık + alt bilgi satırı, sağda ekran aksiyonları. */
export function SkeletonPageHeader({ actions = [] }: { actions?: readonly string[] }) {
  return (
    <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
      <span className="mr-auto flex flex-col gap-px">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-48" />
      </span>
      {/* Yükseklik `CONTROL_H.md` — iskeletin ölçüsü gerçek kontrolün ölçüsüdür, elle yazılmaz. */}
      {actions.map((width, i) => (
        <Skeleton key={i} className={`${CONTROL_H.md} rounded-ops-btn ${width}`} />
      ))}
      {/* Kabuk blokları (depo · ⌘K · kullanıcı) barın SABİT parçasıdır ve yüklenirken de yer tutar —
          çizilmezse gerçek bar geldiğinde sağ taraf bir anda dolar ve başlık sola kayar (09.19). */}
      <span className="flex items-center gap-2.5 border-l border-ops-line-soft pl-2.5">
        <Skeleton className={`${CONTROL_H.md} w-[150px] rounded-ops-btn`} />
        <Skeleton className={`${CONTROL_H.md} w-[132px] rounded-ops-btn`} />
        {/* Avatar YUVARLAK: iskelet de öyle olmalı, yoksa yükleme bitince biçim değişir. */}
        <Skeleton className={`${CONTROL_H.md} w-9 rounded-full`} />
      </span>
    </header>
  );
}

/**
 * `Tabs` ölçüsü (px-3.5 py-[11px]). Hangi sekmenin seçili olduğu URL'den gelir ve o bilgi henüz
 * elimizde YOK — hepsi eşit çizilir; birini vurgulamak yanlış sekmeyi işaretlemek olurdu.
 */
export function SkeletonTabs({ count, actions = [] }: { count: number; actions?: readonly string[] }) {
  return (
    <div className="flex gap-0.5 border-b border-ops-line bg-ops-subtle px-6">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="px-3.5 py-[11px]">
          <Skeleton className="h-4 w-20" />
        </span>
      ))}
      {/* Sekmeye BAĞLI kontroller (arama, "+ Kategori") çubuğun sağında yaşıyor — `Tabs.action`
          yuvası (09.4 kararı); iskelet de onları orada tutar, yoksa sayfa gelince bar zıplar. */}
      {actions.length > 0 ? (
        <span className="ml-auto flex items-center gap-2 py-[7px]">
          {actions.map((width, i) => (
            <Skeleton key={i} className={`${CONTROL_H.md} rounded-ops-btn ${width}`} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Çip süzgeci şeridi — ilki dar ("Tümü"), gerisi geniş. */
export function SkeletonFilterBar({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`h-7 rounded-ops-chip ${i === 0 ? 'w-16' : 'w-24'}`} />
      ))}
    </div>
  );
}
