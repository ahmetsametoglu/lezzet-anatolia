import { type AiModel, type TranslateInput } from '@lezzet/ai';
import { translateUserText } from '@lezzet/application';
import { ProductFeedbackService, TicketMessageService, UserProfileService, serviceDb } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { TranslationBag } from '@lezzet/types';

export const TRANSLATE_USER_TEXT = 'translate_user_text';

/**
 * **Kullanıcı metinlerinin çevirisi** (20.2) — yorum · talep mesajı · B2B ret gerekçesi.
 *
 * Orijinal ASLA değişmez; çeviri yanına yazılır. Okuyucu site dilinde okur, o dil yoksa orijinale
 * düşer (`resolveUserText`). Böylece Boşnakça yazılmış bir yorum üç yüzeyde de okunabilir hâle
 * gelirken müşterinin kendi cümlesi olduğu gibi durur.
 *
 * **Üç kaynak, TEK döngü.** Tablo başına ayrı iş yazmak aynı hata işlemesini, aynı parti frenini ve
 * aynı damga kuralını üç kez yazmak olurdu (`CLAUDE §1`) — ve üçü bir gün ayrışırdı. Farklılık
 * yalnız "hangi satırlar" ve "hangi kolonlar" sorusundadır; o da aşağıdaki tanımda durur.
 */

/** Koşu başına işlenecek metin sayısı — **maliyet freni**. Kaçan satır ertesi turda telafi olur. */
const BATCH = 20;

/** Bir çeviri kaynağı: nereden okunur, ne yazılır, modele nasıl tanıtılır. */
export interface TranslationSource {
  /** Ölçüm/log satırında görünen ad. Kişisel veri taşımaz — hangi tablo olduğunu söyler. */
  name: string;
  kind: TranslateInput['kind'];
  list(limit: number): Promise<Array<{ id: string; text: string | null }>>;
  /**
   * Sonucu yazar. `language` opsiyonel: ret gerekçesinde kaynak-dil kolonu yok (operasyon tek
   * dilli), torbada olmayan dil zaten "orijinal o dilde" demeye yetiyor.
   */
  save(id: string, patch: { language: string | null; translations: TranslationBag | null; translatedAt: string }): Promise<void>;
}

function sources(): TranslationSource[] {
  const db = serviceDb();
  const feedback = new ProductFeedbackService(db);
  const messages = new TicketMessageService(db);
  const profiles = new UserProfileService(db);

  return [
    {
      name: 'product_feedback',
      kind: 'urun_yorumu',
      list: async (limit) => (await feedback.listUntranslated(limit)).map((r) => ({ id: r.id, text: r.comment })),
      save: (id, patch) => feedback.update({ id, ...patch }).then(() => undefined),
    },
    {
      name: 'ticket_message',
      kind: 'talep_mesaji',
      list: async (limit) => (await messages.listUntranslated(limit)).map((r) => ({ id: r.id, text: r.body })),
      save: (id, patch) => messages.update({ id, ...patch }).then(() => undefined),
    },
    {
      name: 'b2b_reject_reason',
      kind: 'ret_gerekcesi',
      list: async (limit) => (await profiles.listUntranslatedRejectReasons(limit)).map((r) => ({ id: r.id, text: r.b2bRejectReason })),
      save: (id, patch) =>
        profiles
          .update({
            id,
            b2bRejectReasonTranslations: patch.translations,
            b2bRejectReasonTranslatedAt: patch.translatedAt,
          })
          .then(() => undefined),
    },
  ];
}

/**
 * **İki enjeksiyon noktası da TESTİN varlık sebebidir — ve ikincisi bir hatadan doğdu (03.08).**
 *
 * `opts.model`: modeli verir, env'i ve ağı atlar (aynı desen `CheckoutSessionCreator` portunda).
 *
 * `opts.sources`: **kaynakları verir.** Başta yoktu ve test gerçek kaynaklarla koşuyordu; iş
 * KÜRESEL olduğu için sahte modelin tek cevabı sıradaki HER satıra yazıldı — yerel veritabanında
 * 29 satır (ürün yorumları + talep mesajları) bir B2B ret gerekçesinin Fransızcasıyla damgalandı.
 * Üç ajanın paylaştığı bir veritabanında bu yalnız kirlilik değil, başka bir şeridin verisini
 * bozmaktır (`CLAUDE §4b`). Ders: **küresel tarayan bir işin testi, tarayacağı kümeyi kendisi
 * vermelidir.** Cron çağrısı parametresizdir; üretimde daima gerçek kaynaklar ve env kullanılır.
 */
export async function translateUserTextJob(
  opts: { model?: AiModel; sources?: TranslationSource[] } = {},
): Promise<Record<string, unknown>> {
  const sonuc: Record<string, number> = { translated: 0, failed: 0, skipped: 0 };

  for (const source of opts.sources ?? sources()) {
    const rows = await source.list(BATCH);
    for (const row of rows) {
      const metin = row.text?.trim();
      // Metinsiz satır kuyruğa hiç düşmemeli; düştüyse damgalanır ve bir daha dönmez.
      if (!metin) {
        await stampOnly(source, row.id);
        sonuc.skipped! += 1;
        continue;
      }

      /* Çeviri kapısı `@lezzet/application`ta ve bu terfi bilinçli (17.08): aynı üç adımı
         (modeli çağır → kaynak dili ayır → torbayı kur) gönderim anındaki çeviri de yapıyor.
         İkinci nüsha, bir gün birinin torbayı başka kurması demekti (`CLAUDE §1`). */
      const res = await translateUserText(metin, source.kind, opts.model ? { model: opts.model } : {});

      if (!res.ok) {
        // **Yapılandırma eksikse damga ATILMAZ ve bu kritik:** anahtarsız bir kurulumda her satırı
        // "denendi, olmadı" diye damgalamak, anahtar geldiğinde geçmişin tamamını kalıcı olarak
        // çevirisiz bırakırdı. Öteki iki sebepte (sağlayıcı hatası / bozuk çıktı) damga atılır —
        // aksi hâlde tek bir bozuk satır kuyruğun önünü sonsuza dek tıkar.
        if (res.reason === 'not_configured') {
          logger.warn({ job: TRANSLATE_USER_TEXT, source: source.name }, 'AI yapılandırılmamış — çeviri turu atlandı');
          return sonuc;
        }
        await captureError(new Error(res.message), {
          source: SOURCES.backendCron,
          // Kimlik yazılır, İÇERİK yazılmaz (`CLAUDE §1`): hangi satır olduğu teşhis için yeter.
          context: { job: TRANSLATE_USER_TEXT, table: source.name, rowId: row.id, reason: res.reason },
        });
        await stampOnly(source, row.id);
        sonuc.failed! += 1;
        continue;
      }

      await source.save(row.id, {
        language: res.data.language,
        translations: res.data.translations,
        translatedAt: new Date().toISOString(),
      });
      sonuc.translated! += 1;
    }
  }

  return sonuc;
}

/** "Baktım, çeviri çıkmadı" damgası — satır kuyruktan düşer, orijinali göstermeye devam eder. */
function stampOnly(source: TranslationSource, id: string): Promise<void> {
  return source.save(id, { language: null, translations: null, translatedAt: new Date().toISOString() });
}
