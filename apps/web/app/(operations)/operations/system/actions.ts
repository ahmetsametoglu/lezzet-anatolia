'use server';

import { revalidatePath } from 'next/cache';
import { ErrorLogService, serviceDb } from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SYSTEM_PATH } from './system-url';

// Sistem ekranı server action'ları (18.5) — `requireAdmin` ilk, `{ data, error }` döner, throw yok.
//
// **Tek yazma var ve olmalı: "çözüldü" işareti.** Ekranın geri kalanı okumadır ve öyle kalmalı:
//  · Hata SİLİNMEZ — süpürme saklama süresinin işidir, elin değil (`OBSERVABILITY §4.2`). Silme
//    düğmesi, açık bir sorunu görünmez yapmanın en kolay yolunu ekranın ortasına koyardı.
//  · Eşik AYARLANMAZ — sabit ve testli. Ayar kutusu, kimsenin ayarlamayacağı bir ayarın bakım
//    borcunu doğurur (`data-model/operasyon.md`).
//  · Ölçüm TETİKLENMEZ — görüntüyü backend cron'u yazıyor ve web'in backend'e çağrı kanalı yok.
//    "Şimdi yenile" düğmesi son görüntüyü yeniden OKUR (`router.refresh`), yeni ölçüm aldırmaz;
//    ekran bunu açıkça yazar. Ölçüm tetikleyen bir uç, bir tazeleme düğmesi için orantısız bir
//    yüzey (ve dışarıdan zorlanabilir bir iş) olurdu.

/**
 * "Çözüldü" işareti — satır SİLİNMEZ, odaktan çıkar ve kimin kapattığı kaydedilir.
 *
 * Aynı hata sonra tekrar gelirse kısmi unique indeks YENİ satır açar (`resolved_at is null` üzerine
 * kurulu) ve ekran onu "geri geldi" diye gösterir: çözülmüş bir hatanın geri gelmesi, hiç çözülmemiş
 * olmasından farklı bir haberdir (`OBSERVABILITY §2`).
 */
export async function resolveErrorAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin();
    await new ErrorLogService(serviceDb()).resolve(id, user.id);
    revalidatePath(SYSTEM_PATH);
    return { data: { id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
