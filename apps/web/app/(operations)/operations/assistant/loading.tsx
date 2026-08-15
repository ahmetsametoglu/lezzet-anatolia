import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SkeletonLine, SkeletonRows, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Asistan kuyruğunun ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz.
 *
 * Başlık GERÇEK `PageHeader` (15.08, emsal: fiyatlar — statik kimlik çubuklaştırılmaz; kabuk
 * blokları `OpsShellProvider`'dan). Alt satır VERİDİR (bekleyen sayısı + yaş aralığı) — çubuk kalır.
 *
 * İskelet ekranın gerçek yerleşimini çiziyor — İKİ SÜTUN: solda kuyruk, sağda karar çerçevesi.
 * Tek sütunluk bir iskelet, yüklenme bitince yerleşimin sıçramasına yol açardı.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Asistan kuyruğu yükleniyor">
      <PageHeader title="Asistan Onay Kuyruğu" subtitle={<SkeletonLine className="w-64" />} />
      <div className="grid min-h-0 flex-1 grid-cols-[326px_1fr] overflow-hidden">
        <div className="min-h-0 overflow-hidden border-r border-ops-line">
          <SkeletonRows rows={6} />
        </div>
        <div className="flex min-h-0 flex-col gap-3 bg-ops-subtle px-6 py-4">
          <SkeletonText lines={2} />
          <SkeletonText lines={3} />
          <SkeletonText lines={5} />
        </div>
      </div>
    </LoadingRegion>
  );
}
