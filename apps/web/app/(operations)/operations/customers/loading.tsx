import { LoadingRegion } from '@/components/loading-region';
import { Skeleton, SkeletonBlock, SkeletonTable } from '@/components/operation/ui/skeleton';
import { CUSTOMERS_COLUMN_TRACKS } from './customers-columns';

/**
 * Müşteriler ekranının ROTA DÜZEYİ beklemesi (09.9).
 *
 * **İki katmanlı bir bekleme var:** rota düzeyi (sunucu liste + sayaçlar + gecikme kümesini okurken —
 * üç paralel sorgu) ve veri düzeyi (müşteri seçilince panelin istemcide okunması, bkz.
 * `customer-preview`). Bu dosya olmadan ilki bomboştu: sidebar duruyor, pane bomboş.
 *
 * **Kolon ölçüleri gerçek tablodan** (`CUSTOMERS_COLUMN_TRACKS`) — iskelet ile tablo tek kaynağı
 * paylaşıyor, elle senkron tutulmuyor.
 *
 * **SENKRON ve cihaz forku CSS ile — ikisi de bilinçli sapma.** Bir tur bu dosya `async` idi ve
 * `detectDevice()` (UA) ile karar veriyordu; iki ayrı arıza üretiyordu:
 *  1. *Fallback'in kendisi await ediyordu.* React, Suspense sınırını basmadan önce fallback'i çözmek
 *     zorunda — yani "anında görünmesi" gereken iskelet bir tur gecikiyordu. Beklemeyi gösteren şeyin
 *     kendisi bekliyordu.
 *  2. *Kesin uyuşmazlık.* İskelet UA'ya bakıyor, gerçek ekran mount'ta `matchMedia('(max-width:767px)')`
 *     ile YENİDEN karar veriyor (`useDevice`). Dar pencereli bir masaüstünde iskelet masaüstü kabuğunu,
 *     hemen ardından sayfa mobil kabuğu çiziyordu — ekran tamamen değişiyordu.
 * İkisini birden çözen tek yol: iki kabuğu da basıp **`useDevice` ile AYNI eşiği** kullanan bir CSS
 * forkuyla seçmek (`md` = 768px = hook'un eşiğinin bir üstü). ADR Sapma 3 (`md:` ile akışkan responsive
 * YAPMA) gerçek arayüzün YETENEK forkuna dair bir kuraldır; burada yetenek yok, yalnız bir bekleme
 * göstergesi var ve tek doğru davranışı "sayfanın seçeceği kabuğun aynısını seçmek".
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Müşteriler yükleniyor">
      <DesktopShell />
      <MobileShell />
    </LoadingRegion>
  );
}

function DesktopShell() {
  return (
    <div className="hidden min-h-0 flex-1 flex-col md:flex">
      {/* Başlık şeridi — `PageHeader` ölçüsü (px-6 py-4). */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="mr-auto flex flex-col gap-px">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-48" />
        </span>
        <Skeleton className="h-9 w-[210px] rounded-ops-btn" />
      </header>

      {/* Çip şeridi — Tümü + iki tip + üç daraltma = 6. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-gray-100 px-6 py-2.5">
        {['w-16', 'w-14', 'w-14', 'w-16', 'w-16', 'w-32'].map((w, i) => (
          <Skeleton key={i} className={`h-7 rounded-ops-chip ${w}`} />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <SkeletonTable tracks={CUSTOMERS_COLUMN_TRACKS} />
        </div>
        {/* Sağ panel İSKELET DEĞİL, kendi BOŞ hâli: ilk açılışta seçim yok, yani panelin gerçek hâli
            de bu metin (bkz. `customer-preview`). İskelet çizmek "birazdan burada bir müşteri olacak"
            demek olurdu — olmayacak, seçilmesi gerekiyor. */}
        <div className="flex flex-1 items-center justify-center bg-ops-subtle p-10 text-center font-ops-body text-ops-base text-ops-faint">
          Soldan bir müşteri seçin.
        </div>
      </div>
    </div>
  );
}

function MobileShell() {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:hidden">
      <div className="flex items-center border-b border-ops-line px-4 py-3.5">
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="px-4 py-3">
        <Skeleton className="h-9 w-full rounded-ops-btn" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-ops-line-soft px-4 py-3">
            {/* Avatar mobil LİSTEDE var (tasarım); DOLU bir alan olduğu için çubuk değil blok. */}
            <SkeletonBlock className="h-10 w-10 flex-none rounded-[10px]" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className={`h-3.5 ${i % 2 === 0 ? 'w-3/5' : 'w-2/5'}`} />
              <Skeleton className="h-2.5 w-28" />
            </span>
            <Skeleton className="h-5 w-16 flex-none rounded-[7px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
