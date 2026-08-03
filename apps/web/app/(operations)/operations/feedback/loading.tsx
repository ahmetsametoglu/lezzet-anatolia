import { LoadingRegion } from '@/components/loading-region';
import { SkeletonFilterBar, SkeletonPageHeader, SkeletonRows } from '@/components/operation/ui/skeleton';

/**
 * Geri Bildirim ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana
 * geçmek tarayıcıda ESKİ sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz.
 *
 * İskelet TEK SÜTUN çiziyor çünkü ekran da tek sütun (sekmeli). Sekme şeridi `SkeletonFilterBar` ile
 * temsil ediliyor — **üç** sekme, gerçeğiyle aynı sayıda; sayı tutmazsa yüklenme bitince şerit
 * genişler/daralır ve altındaki her şey bir kez sıçrar. (Dört yazılıydı: "Ürün skorları" o sırada
 * şeritte duruyordu ama içeriği yoktu.)
 *
 * Zemin (`bg-ops-card`) burada da ŞART: iskelet ile sayfanın ayrışması bir kez yaşandı (Ayarlar,
 * 03.08 — iskelet zemini çiziyordu, sayfa çizmiyordu; yüklenirken doğru, yüklendikten sonra yanlış).
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Geri bildirim yükleniyor">
      <SkeletonPageHeader />
      <SkeletonFilterBar count={3} />
      <SkeletonRows rows={6} />
    </LoadingRegion>
  );
}
