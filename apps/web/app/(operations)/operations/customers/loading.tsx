import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonLine, SkeletonTable } from '@/components/operation/ui/skeleton';
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
 * **SENKRON — bilinçli.** Bir tur bu dosya `async` idi ve `detectDevice()` bekliyordu; React,
 * Suspense sınırını basmadan önce fallback'i çözmek zorunda — yani "anında görünmesi" gereken
 * iskelet bir tur gecikiyordu. Operasyon web'i artık masaüstü-yalnız (mobil deneyim native
 * uygulamada — `docs/uygulama`), tek kabuk senkron çizilir.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Müşteriler yükleniyor">
      {/* Başlık GERÇEK `PageHeader` (15.08, emsal: fiyatlar): eski elle dizilmiş şerit kabuk
          bloklarını (depo · ⌘K · avatar) HİÇ çizmiyordu — gerçek bar gelince sağ taraf birden
          doluyor, başlık sola kayıyordu. Alt satır sayaçtır (veri), arama kutusunun yerini aynı
          genişlikte çubuk tutar. */}
      <PageHeader title="Müşteriler" subtitle={<SkeletonLine className="w-48" />}>
        <Skeleton className={`${CONTROL_H.md} w-[210px] rounded-ops-btn`} />
      </PageHeader>

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
    </LoadingRegion>
  );
}
