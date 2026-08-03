import 'server-only';
import type { UserProfileService } from '@lezzet/database';
import { STAFF_ROLES, type UserProfile } from '@lezzet/types';

/**
 * Operasyon rolü taşıyan TÜM profiller.
 *
 * Rol başına bir sorgu (`listByRole`) ve sonra birleştirme: servis "tüm personel" diye bir uç
 * SUNMUYOR ve kimliği rol dizisinde arayan sorgu GIN indekslidir — dört küçük turun bedeli,
 * indekssiz bir tarama yazmaktan azdır. Tek turluk bir uç arka uç şeridinden istendi
 * (`operasyon-ekranlari-arka-uc-talebi.md §5`); inince bu dosya tek satıra iner.
 *
 * Aynı kişi birden çok rol taşıyabilir (depocu + muhasebeci) → kimliğe göre tekilleştirilir.
 *
 * `lib`'te duruyor çünkü iki ekran birden soruyor: Depolar personeli tesise bağlamak için, Ayarlar
 * rolü yönetmek için. İkinci kopyası yazılacakken buraya taşındı (`CLAUDE.md §1`).
 */
export async function readStaff(svc: UserProfileService): Promise<UserProfile[]> {
  const lists = await Promise.all(STAFF_ROLES.map((role) => svc.listByRole(role)));
  return [...new Map(lists.flat().map((p) => [p.id, p])).values()];
}
