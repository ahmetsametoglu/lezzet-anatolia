import { LoadingRegion } from '@/components/loading-region';
import { SkeletonFilterBar, SkeletonPageHeader, SkeletonTable, SkeletonTabs } from '@/components/operation/ui/skeleton';
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
      <SkeletonPageHeader actions={['w-[210px]']} />
      <SkeletonTabs count={9} />
      <SkeletonFilterBar count={6} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkeletonTable tracks={ORDERS_COLUMN_TRACKS} />
      </div>
    </LoadingRegion>
  );
}
