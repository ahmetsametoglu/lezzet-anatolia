import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonFilterBar, SkeletonLine, SkeletonTable, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { PRICES_COLUMN_TRACKS } from './prices-columns';
import { PRICE_TABS, TAB_LABEL } from './prices-url';

/**
 * Fiyatlar ekranının ROTA DÜZEYİ beklemesi (09.2).
 *
 * Bu dosya olmadan sidebar'dan bu ekrana geçmek ekranı DONDURUYORDU: RSC okuması bitene kadar tarayıcıda
 * ESKİ sayfa duruyor ve hiçbir bekleme işareti yok — operatör tıklamanın işlediğini anlamıyor, ikinci
 * kez tıklıyor. Okumalar hafif de değil (bu ekranlar 5-9 paralel sorgu atıyor).
 *
 * ── STATİK KİMLİK GERÇEK, YALNIZ VERİ İSKELET (15.08) ───────────────────────
 * Başlık barı GERÇEK `PageHeader`: başlık metni bu dosya yazılırken statik olarak belli, kabuk
 * blokları (depo · ⌘K · avatar) ise SAYFANIN değil OTURUMUN verisi — layout'taki `OpsShellProvider`
 * geçişte ayakta kalıyor ve `PageHeader` onları oradan okuyor. Önceden üçü de çubuk çiziliyordu ve
 * production'da bu, hiç değişmeyen kontrollerin her geçişte bir karelik griye dönmesi demekti
 * (kullanıcı bildirimi 15.08 — "başlık kayboluyor, renklerde kayma var"; Tarifler `loading.tsx`süz
 * olduğu için bu titremeyi hiç yaşamıyordu ve fark oradan ölçüldü). Sekme adları da aynı gerekçeyle
 * gerçek metin (`SkeletonTabs labels` — `SkeletonTable`ın sütun başlığı ilkesi).
 *
 * İskelet YALNIZ gerçekten bilinmeyeni örtüyor: alt başlık sayacı, sekmeye bağlı kontroller
 * (hangi sekmede olduğumuzu URL söyler ve o bilgi burada yok), süzgeç çipleri ve tablo gövdesi.
 *
 * **Kolon ölçüleri UYDURULMUYOR, gerçek tablodan geliyor** (`PRICES_COLUMN_TRACKS`). İlk turda elle
 * yazılmıştı ve beşin dördü tutmuyordu; iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken
 * tam tersini yapıyordu (bağımsız ajan denetimi, 30.07).
 *
 * Kabuk sınıfları doğrudan `LoadingRegion`'da: araya sınıfsız bir sarmalayıcı div girince `flex-1`
 * artık flex-item üzerinde olmadığı için sessizce yok sayılıyor ve iskelet paneli kaplamıyordu.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Fiyatlar yükleniyor">
      {/* Başlık barı sekmeye bağlı kontrol taşımaz (15.08) — arama ve hizalama süzgeç şeridinde. */}
      <PageHeader title="Fiyatlar" subtitle={<SkeletonLine className="w-48" />} />
      {/* Sıra `PRICE_TABS`ten, ad `TAB_LABEL`den — ikisi de gerçek sekmelerin okuduğu kaynak. */}
      <SkeletonTabs labels={PRICE_TABS.map((t) => TAB_LABEL[t])} />
      {/* Sağ yuva: hizalama düğmesi + arama, ikisi de `sm` (32px) — gerçek şeritle birebir. */}
      <SkeletonFilterBar count={4}>
        <Skeleton className={`${CONTROL_H.sm} w-48 rounded-ops-btn`} />
        <Skeleton className={`${CONTROL_H.sm} w-[210px] rounded-ops-btn`} />
      </SkeletonFilterBar>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkeletonTable tracks={PRICES_COLUMN_TRACKS} />
      </div>
    </LoadingRegion>
  );
}
