import { opsNotificationHref, staffNotificationBrief, type StaffNotificationTone } from '@lezzet/i18n';
import type { MeNotification } from '@lezzet/types';

/*
  Uçtan gelen satır → operasyon zil satırı, mobil kabuğun `notification-map`inin web eşi: başlık, ton ve web rotası paylaşılan sözlükten
  gelir. Sözlüğün tanımadığı tür genel başlıkla çizilir, çünkü gizlemek eşlemesi yazılmamış türü görünmez kılardı.
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
