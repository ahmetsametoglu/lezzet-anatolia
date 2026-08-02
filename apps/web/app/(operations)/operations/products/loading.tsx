import { LoadingRegion } from '@/components/loading-region';
import { SkeletonFilterBar, SkeletonPageHeader, SkeletonTable, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { PRODUCTS_COLUMN_TRACKS } from './products-columns';

/**
 * Ürünler ekranının ROTA DÜZEYİ beklemesi (09.2).
 *
 * Bu dosya olmadan sidebar'dan bu ekrana geçmek ekranı DONDURUYORDU: RSC okuması bitene kadar tarayıcıda
 * ESKİ sayfa duruyor ve hiçbir bekleme işareti yok — operatör tıklamanın işlediğini anlamıyor, ikinci
 * kez tıklıyor. Okumalar hafif de değil (bu ekranlar 5-9 paralel sorgu atıyor).
 *
 * **Kolon ölçüleri UYDURULMUYOR, gerçek tablodan geliyor** (`PRODUCTS_COLUMN_TRACKS`). İlk turda elle
 * yazılmıştı ve beşin dördü tutmuyordu; iskeletin tek işi "içerik gelince hiçbir şey kaymasın" iken
 * tam tersini yapıyordu (bağımsız ajan denetimi, 30.07).
 *
 * Kabuk sınıfları doğrudan `LoadingRegion`'da: araya sınıfsız bir sarmalayıcı div girince `flex-1`
 * artık flex-item üzerinde olmadığı için sessizce yok sayılıyor ve iskelet paneli kaplamıyordu.
 *
 * Arama kutusu ve "+ Ürün" düğmesi gerçek ekranda BAŞLIKTA DEĞİL, sekme çubuğunun `action`
 * yuvasında duruyor — iskelet de öyle yapıyor.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Ürünler yükleniyor">
      <SkeletonPageHeader />
      <SkeletonTabs count={4} actions={['w-[210px]', 'w-24']} />
      <SkeletonFilterBar count={4} />

      <div className="grid min-h-0 flex-1 grid-cols-[1.95fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <SkeletonTable tracks={PRODUCTS_COLUMN_TRACKS} />
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
