import { logger } from '@lezzet/observability';
import type { ConversationSource } from '@lezzet/types';
import { metaTokensFromEnv } from './meta-sender';

/**
 * **Messenger / Instagram profil adı çözümü** (15.7 · canlı ölçüm 22.08).
 *
 * ── `server-only` KALKTI, KORUMA KALKMADI (29.08 · `courier/proof.ts` emsali) ─
 * Web kopyasında `import 'server-only'` vardı; o bir **Next paketleyici koruması**dır ve bu paketin
 * bağımlısı değil. Dosya `apps/backend`'e taşınan webhook'un yolunda olduğu için ilk çalıştırmada
 * `ERR_MODULE_NOT_FOUND` verdi — Node'da öyle bir paket yok. Koruma paketin İÇİNDE değil, onu
 * çağıran yüzeyin sunucu dosyasında durur: bu modül yalnız webhook işleyicisinden çağrılıyor ve o
 * da hiçbir istemci paketine girmiyor.
 *
 * **Not:** `typecheck` bunu görmedi (tip çözümü monorepo'da web'in bağımlılığını buluyor); ancak
 * gerçekten koşturunca ortaya çıktı. Taşıma turunun ikinci Next kalıntısı — ilki `fetch`in
 * `cache: 'no-store'` seçeneğiydi.
 *
 * ── NEDEN AYRI BİR ÇAĞRI ────────────────────────────────────────────────────
 * WhatsApp webhook'u gönderenin adını gövdede taşır (`contacts[].profile.name`) — Messenger ve
 * Instagram TAŞIMAZ, yalnız opak kişi kimliğini verir (`sender.id` = PSID/IGSID). Canlı turda
 * ölçüldü: gerçek bir Messenger mesajında `profile_name` boş kaldı ve gelen kutusunun başlığı
 * `38324983613781600` oldu — operatöre hiçbir şey söylemeyen bir sayı. Ad yalnız Graph'tan gelir.
 *
 * ── AD KOZMETİK DEĞİL, AMA MESAJDAN DA ÖNEMLİ DEĞİL ─────────────────────────
 * Bu çağrının HİÇBİR hâli mesaj yazımını durduramaz. Jeton yoksa, çağrı düşerse, Meta kişiyi
 * çözemezse (development modunda uygulamada rolü olmayan kişiyi çözmüyor — bu da ölçüldü) sonuç
 * `null`'dur ve konuşma adsız açılır. "Adı alamadım" bir arıza değil, bilinmeyen bir değerdir;
 * mesajı kaybetmek ise gerçek arızadır (0039'un kuralı).
 *
 * ── ALAN ADLARI KANALA GÖRE FARKLI ──────────────────────────────────────────
 * Messenger kişi düğümü `first_name`/`last_name` verir; Instagram düğümü `name`/`username`. Tek
 * alan listesi ikisine birden sorulamaz — istenmeyen alan `#100` ile tüm çağrıyı düşürür.
 *
 * Jeton İKİSİ İÇİN DE SAYFA jetonudur: Instagram mesajlaşması bağlı Facebook Sayfası üzerinden
 * yürür, ayrı bir IG jetonu yoktur.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

interface ProfileBody {
  first_name?: string;
  last_name?: string;
  name?: string;
  username?: string;
  error?: { message?: string; code?: number };
}

/**
 * Kişi kimliğinden okunabilir ad. Bulunamazsa `null` — çağıran o zaman adı BOŞ bırakır, uydurmaz.
 *
 * WhatsApp bu kapıdan geçmez: adı zaten webhook gövdesinde gelir, ikinci bir tur israf olurdu.
 */
export async function fetchMetaProfileName(
  source: ConversationSource,
  personId: string,
  /*
    DİKİŞ (07.09 · kullanıcı sorusundan çıktı: *"testler Meta'ya çağrı atıyor olabilir mi"*).

    Ölçüldü: ATMIYORDU, ve koruma tesadüf DEĞİLDİ — `meta-webhook.test.ts` jetonu `beforeAll`da
    siliyor, `afterAll`da geri koyuyor (deponun "önce oku, sonra geri koy" deseni). Yani kapı zaten
    bilerek susturulmuştu; bu parametre bir arızayı kapatmıyor.

    Yine de eklendi, çünkü koruma ORTAM DEĞİŞKENİNE dayanıyordu: kapıyı ağdan koparan şey testin
    env'i düzenlemesiydi, bağımlılığın kendisi değil. `sendCloudApiMessage` bu dikişi baştan
    taşıyor (`fetchImpl` + `FakeMeta`) ve deponun kuralı da yazılı (`whatsapp/testing.ts`):
    *"vi.mock YOK — gerçeğe vur ya da bağımlılığı enjekte et."* İki kapı artık aynı desende.

    Varsayılan küresel `fetch` — üretim davranışı değişmiyor.
  */
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (source === 'whatsapp') return null;
  // Sayfa jetonu — gönderimin okuduğu kapıdan (`metaTokensFromEnv`); yoksa ad çözümü sessizce atlanır.
  const token = metaTokensFromEnv().pageToken;
  if (!token) return null;

  const fields = source === 'instagram' ? 'name,username' : 'first_name,last_name';
  try {
    const url = `${GRAPH}/${encodeURIComponent(personId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
    /* `cache: 'no-store'` KALDIRILDI (29.08, dosya `apps/web`'den taşınırken): o seçenek Next.js'in
       genişlettiği `fetch`e aitti ve standart Node `fetch`inde yok — tip hatası verdi. Kayıp yok:
       önbellek Next'in kendi eklentisiydi, Node hiçbir yanıtı zaten önbelleklemiyor. Bu satır,
       taşımanın gerçekten Next'ten koptuğunun da kanıtı. */
    const response = await fetchImpl(url);
    const body = (await response.json()) as ProfileBody;

    if (!response.ok || body.error) {
      /* Beklenen ret: development modunda uygulamada rolü OLMAYAN kişi çözülemez (ölçüldü 22.08).
         `captureError` DEĞİL — kapının bilinen sınırı, uygulama arızası değil. Kimlik loglanır,
         içerik loglanmaz (CLAUDE §1). */
      logger.info(
        { context: 'messaging/meta-profile', source, personId, code: body.error?.code ?? response.status },
        'meta profil adı çözülemedi — konuşma adsız kalır',
      );
      return null;
    }

    const name =
      source === 'instagram'
        ? (body.name?.trim() || body.username?.trim() || '')
        : [body.first_name?.trim(), body.last_name?.trim()].filter(Boolean).join(' ');
    return name || null;
  } catch (err) {
    // Ağ hatası da aynı sınıf: ad bilinmiyor. Mesaj yazımı bu yüzden ASLA durmaz.
    logger.info({ context: 'messaging/meta-profile', source, personId, err: String(err) }, 'meta profil adı okunamadı');
    return null;
  }
}
