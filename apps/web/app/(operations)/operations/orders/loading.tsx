import { LoadingRegion } from '@/components/loading-region';
import { Skeleton, SkeletonTable } from '@/components/operation/ui/skeleton';
import { ORDERS_COLUMN_TRACKS } from './orders-columns';

/**
 * Siparişler ekranının ROTA DÜZEYİ beklemesi (09.2).
 *
 * Bu dosya olmadan sidebar'dan bu ekrana geçmek ekranı DONDURUYORDU: RSC okuması bitene kadar tarayıcıda
 * ESKİ sayfa duruyor ve hiçbir bekleme işareti yok — operatör tıklamanın işlediğini anlamıyor, ikinci
 * kez tıklıyor. Okumalar hafif de değil (bu ekranlar 5-9 paralel sorgu atıyor).
 *
 * **Kolon ölçüleri UYDURULMUYOR, gerçek tablodan geliyor** (`ORDERS_COLUMN_TRACKS`). İlk turda elle
 * yazılmıştı ve beşin dördü tutmuyordu; iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken
 * tam tersini yapıyordu (bağımsız ajan denetimi, 30.07).
 *
 * Kabuk sınıfları doğrudan `LoadingRegion`'da: araya sınıfsız bir sarmalayıcı div girince `flex-1`
 * artık flex-item üzerinde olmadığı için sessizce yok sayılıyor ve iskelet paneli kaplamıyordu.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Siparişler yükleniyor">
      {/* Başlık şeridi — `PageHeader` ölçüsü (px-6 py-4, başlık `ops-title`). */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="mr-auto flex flex-col gap-px">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-48" />
        </span>
        <Skeleton className="h-9 w-[210px] rounded-ops-btn" />
      </header>

      {/* Sekme çubuğu — 9 sekme, `Tabs` ölçüsü (px-3.5 py-[11px], text-ops-sm).
          Hangi sekmenin seçili olduğu URL'den gelir ve o bilgi henüz elimizde yok; hepsi eşit çizilir. */}
      <div className="flex gap-0.5 border-b border-ops-line bg-ops-subtle px-6">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="px-3.5 py-[11px]">
            <Skeleton className="h-4 w-20" />
          </span>
        ))}
      </div>

      {/* Süzgeç şeridi — 6 kontrol. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={`h-7 rounded-ops-chip ${i === 0 ? 'w-16' : 'w-24'}`} />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkeletonTable tracks={ORDERS_COLUMN_TRACKS} />
      </div>
    </LoadingRegion>
  );
}
