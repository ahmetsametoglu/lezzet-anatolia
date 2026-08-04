'use server';

import { AnalyticsSubjectTypeEnum } from '@lezzet/types';
import { z } from 'zod';
import { recordEvent } from './record';

/**
 * Paylaşma olayının SUNUCU ucu (08.9 · `ANALYTICS §3`).
 *
 * **Neden bir eylem var:** paylaşma, ölçüm haritasındaki tek "istemcide olup biten" iş. Kullanıcı
 * kararı (04.08) istemciden çağrılabilir bir yazma ucu AÇILMAMASINI istiyordu; model istisnasız
 * kalsın diye olay da öteki dokuzu gibi sunucudan yazılıyor. Kapı zaten tek (`recordEvent`); bu
 * dosya yalnız onu istemciye açan ince kabuk.
 *
 * **Sayfa klasöründe değil `lib/` altında** (`CLAUDE §2`): iki detay sayfası ve ortak çerçeve
 * kullanıyor, hiçbirinin malı değil.
 *
 * **Girdi ŞEMADAN geçer.** İstemciden gelen her şey şüphelidir ve bu uç guard'sız (paylaşmak
 * ziyaretçiye de açık); doğrulanmayan bir `subjectId` deftere serbest metin sokmanın yoluydu.
 * Hata YUTULUR: ölçüm akışı kesmez, paylaşma yine olur.
 */
const ShareInputSchema = z.object({
  subjectType: AnalyticsSubjectTypeEnum,
  subjectId: z.string().uuid(),
  productId: z.string().uuid().nullish(),
  /**
   * `whatsapp` BU YÜZEYDEN GELMEZ ve bu bir eksiklik değil ölçülmüş bir sınır: düğme işletim
   * sisteminin paylaşım menüsünü açıyor, tarayıcı hangi uygulamanın seçildiğini söylemiyor
   * (`navigator.share` boş çözülür). Enum değeri kalıyor — bir gün doğrudan `wa.me` bağı konursa
   * karşılığı olsun; bugün üreteni yok.
   */
  method: z.enum(['copy', 'native']),
});

export async function shareProductAction(input: z.input<typeof ShareInputSchema>): Promise<void> {
  const parsed = ShareInputSchema.safeParse(input);
  if (!parsed.success) return;
  await recordEvent({ type: 'share', ...parsed.data });
}
