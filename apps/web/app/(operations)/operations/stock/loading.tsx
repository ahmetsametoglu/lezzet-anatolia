import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { buttonClass } from '@/components/operation/ui/button';
import { SearchIcon } from '@/components/operation/ui/icons';
import { Skeleton, SkeletonFilterBar, SkeletonTable, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { STOCK_COLUMN_TRACKS } from './stock-columns';
import { STOCK_TABS, STOCK_TAB_LABEL } from './stock-url';

/**
 * Stok ekranının ROTA DÜZEYİ beklemesi (09.2).
 *
 * Bu dosya olmadan sidebar'dan bu ekrana geçmek ekranı DONDURUYORDU: RSC okuması bitene kadar tarayıcıda
 * ESKİ sayfa duruyor ve hiçbir bekleme işareti yok — operatör tıklamanın işlediğini anlamıyor, ikinci
 * kez tıklıyor. Okumalar hafif de değil (bu ekranlar 5-9 paralel sorgu atıyor).
 *
 * **Kolon ölçüleri UYDURULMUYOR, gerçek tablodan geliyor** (`STOCK_COLUMN_TRACKS`). İlk turda elle
 * yazılmıştı ve beşin dördü tutmuyordu; iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken
 * tam tersini yapıyordu (bağımsız ajan denetimi, 30.07).
 *
 * Kabuk sınıfları doğrudan `LoadingRegion`'da: araya sınıfsız bir sarmalayıcı div girince `flex-1`
 * artık flex-item üzerinde olmadığı için sessizce yok sayılıyor ve iskelet paneli kaplamıyordu.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Stok yükleniyor">
      {/* Başlık ve "Lot / geri çağırma" eylemi GERÇEK (15.08, emsal: fiyatlar/para) — ikisi de
          statik; eylem tıklanmaz süs (`buttonClass`lı span), davranışı sayfayla gelir. Alt satır
          sayaçtır (veri), çubuk. Sekme adları gerçek ve `stock-url.ts` tek kaynağından — eski hâl
          3 çubuk çiziyordu, gerçek çubukta 4 sekme vardı ("Çıkışlar" 22.26'da eklenmişti). */}
      <PageHeader title="Stok" subtitle={<Skeleton className="h-3 w-72" />}>
        <span className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <SearchIcon />
          Lot / geri çağırma
        </span>
      </PageHeader>
      <SkeletonTabs labels={STOCK_TABS.map((t) => STOCK_TAB_LABEL[t])} />
      <SkeletonFilterBar count={3} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <SkeletonTable tracks={STOCK_COLUMN_TRACKS} />
        </div>
        {/* Sağ panel İSKELET DEĞİL, kendi BOŞ hâli: ilk açılışta seçim yok, yani panelin gerçek hâli
            de bu metin. İskelet "birazdan burada bir kayıt olacak" sözü verirdi — seçilmesi gerekiyor. */}
        <div className="flex flex-1 items-center justify-center bg-ops-subtle p-10 text-center font-ops-body text-ops-base text-ops-faint">
          Soldan bir satır seçin.
        </div>
      </div>
    </LoadingRegion>
  );
}
