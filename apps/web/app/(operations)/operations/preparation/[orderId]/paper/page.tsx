import { notFound } from 'next/navigation';
import { listPreparationQueue } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { AuthError } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { PaperSheet } from './paper-sheet';

/**
 * **Hazırlık kâğıdı** (10.1) — `design/project/Belge - Hazirlik Kagidi.dc.html`.
 *
 * ── NEDEN AYRI ROTA, EKRANIN İÇİNDE GİZLİ BİR BÖLÜM DEĞİL ───────────────────
 * Belge kuyruk ekranının bir parçası değil, ayrı bir çıktı: kendi düzeni, kendi kâğıt ölçüsü ve
 * ekranın hiç taşımadığı alanları (elle işaretlenecek boşluklar) var. Kuyruğun DOM'una gizli bir
 * bölüm olarak konsaydı, her açılışta çizilir ve hiç basılmayan bir belge her operatörün
 * tarayıcısına yüklenirdi.
 *
 * ── YENİ BAĞIMLILIK YOK: TARAYICININ KENDİ YAZDIRMASI ───────────────────────
 * Bir PDF kütüphanesi eklenmedi (`STACK §2` beyanı gerektirirdi) ve gerekmiyor: belge A4 bir
 * tablo, tarayıcı onu hem basıyor hem PDF'e kaydediyor. Sayfa açılır açılmaz yazdırma penceresi
 * DE açılmıyor — operatör önce kâğıdı görmeli; otomatik açılan bir pencere, doğru siparişi
 * bastığını doğrulamadan onay isterdi.
 *
 * ── GUARD AYNI, KAPSAM AYNI ─────────────────────────────────────────────────
 * Kâğıt kuyruğun kendi kapısından geçiyor (`listPreparationQueue` + `orderId`): başka deponun ya
 * da kapanmış bir siparişin kimliği adrese yazılsa liste boş döner ve sayfa 404 olur. Yani belge,
 * ekranda görülemeyen bir siparişi basamaz.
 *
 * ── FİYAT YOK, MÜŞTERİ İLETİŞİMİ YOK ────────────────────────────────────────
 * Kapı zaten para taşımıyor (`PreparationOrder` künyesi) — belge de taşıyamaz. Tasarımın altbilgisi
 * bunu kâğıdın üstüne de yazıyor: *"İç belge · fiyat bilgisi içermez."*
 */
interface PaperPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function PreparationPaperPage({ params }: PaperPageProps) {
  const { orderId } = await params;

  let workplace;
  try {
    workplace = await readWorkWarehouse();
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Hazırlık kâğıdı"
        reason="Hazırlık masası depo personeline açıktır. Bir depoya atanmamış hesap bu belgeyi göremez."
      />
    );
  }
  // Depo seçilmemişken kâğıt basılamaz: hangi deponun kuyruğundan geldiği belli olmayan bir belge,
  // yanlış depoda toplanmaya yol açardı. Kuyruğa dönmek tek adım.
  if (workplace.status !== 'ok') notFound();

  const [order] = await listPreparationQueue(serviceDb(), { warehouseId: workplace.warehouseId, orderId });
  if (!order) notFound();

  return <PaperSheet order={order} warehouseName={workplace.name} />;
}
