import { staffNotificationBrief, type StaffNotificationTone } from '@lezzet/i18n';
import type { MeNotification } from '@lezzet/types';

/*
  Uçtan gelen satır → operasyon zil satırı, mobil kabuğun `notification-map`inin web eşi: başlık ve ton paylaşılan sözlükten gelir,
  yüzeye özgü olan gidilecek rotadır. Sözlüğün tanımadığı tür genel başlıkla çizilir, çünkü gizlemek eşlemesi yazılmamış türü görünmez kılardı.
*/

export interface OpsNotificationRow {
  id: string;
  title: string;
  /** Açıklayıcı ikinci satır; olgusu yoksa `null`. */
  subtitle: string | null;
  tone: StaffNotificationTone;
  /** Kısa tür etiketi ("Belge"), bir bakışta ayırt etmek için; sözlükten gelir. */
  label: string;
  /** Operasyon rotası — hedefsiz satırda null: satır tıklanmaz, yalnız haber verir. */
  href: string | null;
  createdAt: string;
}

/**
 * Hedef adresten okunur, içerikten değil: sipariş ve talep kendi kaydına açılır; hedef nesnesi ekranlaşmamış tür işin yapıldığı ekrana
 * gider (eşik düşüşü tedarik önerisine, kapanış uyuşmazlığı teslimat ekranına, kurumsal başvuru müşteri kuyruğuna).
 */
export function opsNotificationHref(row: Pick<MeNotification, 'kind' | 'targetType' | 'targetId'>): string | null {
  if (row.targetType === 'order' && row.targetId) return `/operations/orders/${row.targetId}`;
  if (row.targetType === 'ticket' && row.targetId) return `/operations/tickets?t=${row.targetId}`;
  if (row.kind === 'stock_low') return '/operations/procurement';
  if (row.kind === 'run_close_mismatch') return '/operations/deliveries';
  if (row.kind === 'b2b_application_received') return '/operations/customers';
  return null;
}

export function toOpsNotificationRow(row: MeNotification): OpsNotificationRow {
  const brief = staffNotificationBrief(row);
  return {
    id: row.id,
    // Genel başlık webde KISA: "uygulamayı güncelleyin" tavsiyesi mobile özgü (orada sürüm eskir).
    title: brief?.title ?? 'Yeni bir bildirim',
    subtitle: brief?.subtitle ?? null,
    tone: brief?.tone ?? 'quiet',
    label: brief?.label ?? 'Bildirim',
    href: opsNotificationHref(row),
    createdAt: row.createdAt,
  };
}
