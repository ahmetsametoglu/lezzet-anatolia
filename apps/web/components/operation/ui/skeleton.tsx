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

/**
 * Çubuk — metin satırı, rozet, sayı yerine geçen temel parça. Ölçüyü çağıran verir.
 *
 * Dolgu `ops-skeleton` (15.08): önceki `gray-100` beyaz kart ÜSTÜ dolgusuydu, çubuk ise `ops-card`
 * zeminine çiziliyor — açık modda fark görünmez kalıyordu (token künyesindeki ölçüm). Takma ad iki
 * modu ayrı ayarlar: açıkta koyulaştı, koyu bugünkü görünümünde kaldı.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-[6px] bg-ops-skeleton ${className}`} aria-hidden="true" />;
}

/**
 * Blok — avatar, görsel, ikon kutusu gibi DOLU alanlar. Çubuktan farkı yatay geçiş taşıması: dolu bir
 * alan tek düz tonda "kırık kutu" gibi duruyor.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-ops-card bg-gradient-to-r from-ops-skeleton via-ops-skeleton-soft to-ops-skeleton ${className}`}
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
                    Hücre ölçüsü `SkeletonCell`de — gerçek satır kutusuyla birebir (15.08). */}
                <SkeletonCell twoLine={ci === 0} wide={i % 2 === 0} />
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

/*
 * `SkeletonPageHeader` SİLİNDİ (15.08): başlık barı artık her `loading.tsx`'te GERÇEK `PageHeader`
 * ile çizilir (09-admin O3 REVİZE notu) — statik kimlik çubuklaştırılmaz, kabuk blokları
 * `OpsShellProvider`'dan gelir. Son kullanıcı taşınınca komponent ölü koda düştü.
 */

/**
 * Tek METİN SATIRI yer tutucusu — çubuğu, çevresindeki metnin TAM BİR SATIRI kadar yer kaplayan
 * kutuya sarar (`h-[1lh]`), çubuk içinde dikey ortalı.
 *
 * Çıplak `Skeleton h-3` (12px) bir metin satırının yerine geçemez: gerçek satır font + satır
 * yüksekliğiyle ~20px'tir ve içerik gelince kap 8px uzar — bar sayfanın EN ÜSTÜNDE olduğu için
 * altındaki her şey topluca kayar (kullanıcı bildirimi 15.08, başlık altı açıklama satırı).
 * `1lh` birimi kutuyu tam bir satır yapar ve ölçü elle yazılmaz: font ya da satır yüksekliği
 * değişse de yükseklik gerçek metinle birebir kalır. `PageHeader subtitle` yuvasının bekleme hâli
 * budur; başka metin satırı yer tutucuları da bunu kullanmalı.
 */
export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span className="flex h-[1lh] items-center" aria-hidden="true">
      <Skeleton className={`h-3 ${className}`} />
    </span>
  );
}

/**
 * Tablo HÜCRESİ iskeleti — `SkeletonLine` ilkesinin hücre hâli: çubuk, gerçek yazı kademesinin
 * satır kutusunda durur (`h-[1lh]` + `text-ops-base`/`text-ops-xs`).
 *
 * Çıplak çubuk satır yüksekliğini tutturamıyordu (fiyatlar ölçümü 15.08): gerçek kimlik hücresi
 * iki metin satırıdır (~40px), çubuklar 26px kalıyordu — iskelet satırı ~50px, gerçek satır ~64px.
 * İskelet gerçeğinden SIK ritimli görünüyor, içerik gelince tablo seyrekleşiyordu. Satır kutusu
 * fonttan türediği için ölçü elle yazılmaz; yazı kademesi değişirse iskelet kendiliğinden uyar.
 *
 * TEK KAYNAK: `SkeletonTable` (rota iskeleti) ve `Table busy` (satırsız yeniden okuma) aynı hücreyi
 * buradan çizer — önceden iki kopyaydı ve ayrışmıştı bile (`max-w-[80px]` ↔ `max-w-[90px]`).
 *
 * `twoLine` kimlik hücresi (ad + alt satır, gerçek desendeki `gap-px` ile); `wide` genişlik
 * dönüşümü — eşit çubuklar tabloyu bir tarama deseni gibi gösteriyor, çağıran satır sırasına göre
 * değiştirir.
 */
export function SkeletonCell({ twoLine = false, wide = false }: { twoLine?: boolean; wide?: boolean }) {
  return twoLine ? (
    <span className="flex flex-col gap-px" aria-hidden="true">
      <span className="flex h-[1lh] items-center text-ops-base">
        <Skeleton className={`h-3 ${wide ? 'w-3/5' : 'w-2/5'}`} />
      </span>
      <span className="flex h-[1lh] items-center text-ops-xs">
        <Skeleton className="h-2.5 w-2/5" />
      </span>
    </span>
  ) : (
    <span className="flex h-[1lh] items-center text-ops-base" aria-hidden="true">
      <Skeleton className={`h-3 ${wide ? 'w-4/5' : 'w-3/5'} max-w-[90px]`} />
    </span>
  );
}

/**
 * `Tabs` ölçüsü (px-3.5 py-[11px]). Hangi sekmenin seçili olduğu URL'den gelir ve o bilgi henüz
 * elimizde YOK — hepsi eşit çizilir; birini vurgulamak yanlış sekmeyi işaretlemek olurdu.
 *
 * **`labels` verilirse sekme adları GERÇEK metin** — `SkeletonTable`ın sütun başlığı ilkesi
 * (yukarıda): `loading.tsx` rota başına bir dosyadır, sekme adları o dosya yazılırken statik olarak
 * bellidir; onları çubuk yapmak elde olan bilgiyi saklamak olurdu. Production'da bu fark GÖRÜNÜR bir
 * titremeydi: geçiş hızlı olduğu için çubuklar bir karelik gri flaş gibi algılanıyordu (kullanıcı
 * bildirimi 15.08 — "başlık kayboluyor, renklerde kayma var"). Tipografi gerçek `Tabs`tan birebir;
 * seçili göstergesi yine YOK (üstteki gerekçe geçerli). `count` yalnız etiketi taşınmamış eski
 * çağıranlar için duruyor.
 */
export function SkeletonTabs({
  count,
  labels,
  actions = [],
}: {
  count?: number;
  labels?: readonly string[];
  actions?: readonly string[];
}) {
  return (
    <div className="flex gap-0.5 border-b border-ops-line bg-ops-subtle px-6">
      {labels
        ? labels.map((label) => (
            <span
              key={label}
              className="-mb-px border-b-2 border-transparent px-3.5 py-[11px] font-ops-display text-ops-sm font-semibold text-ops-muted"
            >
              {label}
            </span>
          ))
        : Array.from({ length: count ?? 0 }, (_, i) => (
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

/**
 * Çip süzgeci şeridi — ilki dar ("Tümü"), gerisi geniş. `children` şeridin SAĞ yuvası: sekmeye
 * bağlı kontrollerin (arama, toplu eylem) yer tutucuları — gerçek şeritteki `ml-auto` grubun eşi
 * (fiyatlar 15.08); çizilmezse içerik gelince şeridin sağı bir anda dolar.
 */
export function SkeletonFilterBar({ count, children }: { count: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`h-7 rounded-ops-chip ${i === 0 ? 'w-16' : 'w-24'}`} />
      ))}
      {children ? <span className="ml-auto flex items-center gap-2">{children}</span> : null}
    </div>
  );
}
