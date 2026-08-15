import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonFilterBar, SkeletonLine, SkeletonTable, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { ORDERS_COLUMN_TRACKS } from './orders-columns';
import { ORDER_TABS, tabLabel } from './orders-url';

/**
 * Siparişler ekranının ROTA DÜZEYİ beklemesi (09.2).
 *
 * Bu dosya olmadan sidebar'dan bu ekrana geçmek ekranı DONDURUYORDU: RSC okuması bitene kadar tarayıcıda
 * ESKİ sayfa duruyor ve hiçbir bekleme işareti yok — operatör tıklamanın işlediğini anlamıyor, ikinci
 * kez tıklıyor. Okumalar hafif de değil (bu ekranlar 5-9 paralel sorgu atıyor).
 *
 * ── STATİK KİMLİK GERÇEK, YALNIZ VERİ İSKELET (15.08 — emsal: fiyatlar) ─────
 * Başlık barı GERÇEK `PageHeader`: başlık statik, kabuk blokları (depo · ⌘K · avatar) oturumun
 * verisi ve layout'taki `OpsShellProvider` geçişte ayakta — çubuklaştırmak, hiç değişmeyen
 * kontrolleri her geçişte bir karelik griye çevirmekti (production'da ölçülen titreme, 15.08).
 * Sekme adları da gerçek: sıra `ORDER_TABS`ten, ad `tabLabel`dan — gerçek sekmelerin okuduğu tek
 * kaynak (`ORDER_STATUS_LABELS`). Sekme SAYILARI çizilmez: onlar veridir ve henüz okunmadı —
 * okunmamış sayıyı çubukla bile vaat etmemek, "0 ve null çizilmez" kuralının bekleme hâli.
 * İskelet yalnız gerçekten bilinmeyende: özet satırı, arama kutusu, süzgeç çipleri, tablo gövdesi.
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
      {/* Arama kutusunun yerini aynı ölçüde çubuk tutar (gerçek bar `search` yuvasında w-[210px]). */}
      <PageHeader title="Siparişler" subtitle={<SkeletonLine className="w-48" />}>
        <Skeleton className={`${CONTROL_H.md} w-[210px] rounded-ops-btn`} />
      </PageHeader>
      <SkeletonTabs labels={ORDER_TABS.map((t) => tabLabel(t))} />
      <SkeletonFilterBar count={6} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkeletonTable tracks={ORDERS_COLUMN_TRACKS} />
      </div>
    </LoadingRegion>
  );
}
