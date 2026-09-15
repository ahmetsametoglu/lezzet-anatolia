import { logger } from '@lezzet/observability';
import type { ConversationSource } from '@lezzet/types';
import { metaTokensFromEnv } from './meta-sender';

// Messenger ve Instagram webhook'u adı taşımaz, yalnız opak kişi kimliğini verir: ad Graph'tan gelmezse gelen kutusunun başlığı
// operatöre bir şey söylemeyen bir sayı olur.

// Çağrının hiçbir hâli mesaj yazımını durduramaz: "adı alamadım" bilinmeyen bir değerdir, mesajı kaybetmek gerçek arızadır.

const GRAPH = 'https://graph.facebook.com/v21.0';

interface ProfileBody {
  first_name?: string;
  last_name?: string;
  name?: string;
  username?: string;
  error?: { message?: string; code?: number };
}

/** Bulunamazsa `null`: çağıran adı boş bırakır, uydurmaz. WhatsApp bu kapıdan geçmez, adı webhook gövdesinde gelir. */
export async function fetchMetaProfileName(
  source: ConversationSource,
  personId: string,
  // Testler kapıyı ağdan koparmak için sahte geçer: koruma ortam değişkenine dayanmasın.
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (source === 'whatsapp') return null;
  // Instagram mesajlaşması bağlı Facebook Sayfası üzerinden yürür; jeton ikisinde de sayfa jetonu.
  const token = metaTokensFromEnv().pageToken;
  if (!token) return null;

  // Alanlar kanala göre: istenmeyen alan `#100` ile bütün çağrıyı düşürür.
  const fields = source === 'instagram' ? 'name,username' : 'first_name,last_name';
  try {
    const url = `${GRAPH}/${encodeURIComponent(personId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
    const response = await fetchImpl(url);
    const body = (await response.json()) as ProfileBody;

    if (!response.ok || body.error) {
      // Beklenen ret (development modunda uygulamada rolü olmayan kişi çözülmez): kapının bilinen sınırı, uygulama arızası değil.
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
    // Ağ hatası da aynı sınıf: ad bilinmiyor, mesaj yazımı durmaz.
    logger.info({ context: 'messaging/meta-profile', source, personId, err: String(err) }, 'meta profil adı okunamadı');
    return null;
  }
}
