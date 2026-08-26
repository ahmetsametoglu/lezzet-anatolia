import { ageMinutesOf } from '@/components/operation/ui/format';
import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { KIND_META, modeOf } from '@lezzet/application';
import { countPendingProposals, readAssistantQueue } from '@/lib/assistant/read';
import { readAssistantFormOptions } from '@/lib/assistant/form-options';
import { AssistantClient } from './assistant-client';
import { parseAssistantUrl, proposalTargetUrl } from './assistant-url';
import type { AssistantData } from './assistant-types';

// Asistan Onay Kuyruğu (22.3) — AI yönetici asistanının yazma NİYETLERİ burada onaylanır.
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// `design/pages/admin-asistan-kuyrugu.md §1`: kullanıcı yalnız admin. Depo ve kurye görmez — buradan
// verilen tek bir onay katalogda paket kurar, stok yazar, para hareketi açar.
//
// ── ONAY BAŞKA HİÇBİR YERDEN VERİLEMEZ ───────────────────────────────────────
// Asistanın kendi yüzeyinde onay aracı yok (`AI_ADMIN_ASSISTANT §5`): kaçak bir asistanın
// yapabileceği en kötü şey reddedilecek bir liste üretmektir. Bu ekran o devrin TEK kapısı.
//
// ── DEPO BAĞLAMI BU SAYFAYI DARALTMAZ ────────────────────────────────────────
// Öneri kuyruğu depo-üstüdür: aynı kuyrukta D1'e stok girişi ile depoyla hiç ilgisi olmayan bir
// vitrin işareti yan yana durur. Depo süzgeci konsaydı, deposu olmayan öneriler sessizce yutulurdu.
//
// ── SEÇİLİ ÖNERİ SUNUCUDA OKUNUR ─────────────────────────────────────────────
// Seçim adreste (`?p=`), yani okuması burada. İstemcide tutulsaydı bir önerinin bağlantısı
// paylaşılamazdı ve her tıklama bir istemci turuna kalırdı.

interface AssistantPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Asistan Onay Kuyruğu"
        reason="Asistanın önerileri yalnız yönetim tarafından uygulanabilir. Bekleyen bir öneri varsa yöneticiye bildirin."
      />
    );
  }

  const urlState = parseAssistantUrl(await searchParams);

  // Sayaç sekmeden BAĞIMSIZ okunur: rozet "bekleyen iş" der ve arşive bakarken de doğru olmalı.
  // Seçenek havuzu da burada: kuyruğun içindeki formlar (indirim kapsamı) listesiz açılamaz.
  const [queue, pendingCount] = await Promise.all([readAssistantQueue(urlState.tab), countPendingProposals()]);

  // Seçenek havuzu KUYRUK OKUNDUKTAN sonra: ürün taslağı önerilerinin konusu olan ürünlerin tam
  // kaydı da havuza giriyor (22.14) ve hangi ürünler olduğu ancak kuyruk elde olunca bilinir.
  // Kataloğun tamamını indirmek yerine yalnız kuyruğun ihtiyacı okunuyor.
  const options = await readAssistantFormOptions(
    queue.flatMap((row) => {
      if (row.kind !== 'product_draft') return [];
      const id = (row.payload as { productId?: unknown } | null)?.productId;
      return typeof id === 'string' ? [id] : [];
    }),
    // Paket önerilerinin kalem kimlikleri (22.18): havuz olmadan kalem editörü adsız satırlarla
    // açılır ve mutabakat şeridi hesaplanamaz. Kimlikler yine yalnız KUYRUKTAKİLERDEN toplanıyor —
    // katalogun tamamı indirilmiyor.
    queue.flatMap((row) => {
      if (row.kind !== 'bundle_draft') return [];
      const items = (row.payload as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) return [];
      return items.flatMap((i) => {
        const id = (i as { variantId?: unknown } | null)?.variantId;
        return typeof id === 'string' ? [id] : [];
      });
    }),
    // Bölge önerilerinin bölgesi ve önerdiği kodlar (22.36): gövde haritayı bunlarla çiziyor.
    // Kodlar ayrıca toplanıyor çünkü henüz hiçbir bölgede değiller — bölge okumasından gelmezler.
    queue.flatMap((row) => {
      if (row.kind !== 'zone_extend') return [];
      const payload = row.payload as { zoneId?: unknown; postalCodes?: unknown } | null;
      if (typeof payload?.zoneId !== 'string') return [];
      const codes = Array.isArray(payload.postalCodes)
        ? payload.postalCodes.flatMap((c) => {
            const code = (c as { postalCode?: unknown } | null)?.postalCode;
            return typeof code === 'string' ? [code] : [];
          })
        : [];
      return [{ zoneId: payload.zoneId, postalCodes: codes }];
    }),
  );

  // Tek an, tüm yaşlar: kuyruk satırları ve kart künyesi aynı `now`'a göre hesaplanır — ayrı ayrı
  // okunsaydı aynı damga listede ve kartta farklı yaş gösterebilirdi.
  const now = Date.now();
  const rows = queue.map((row) => ({
    ...row,
    // Damgayı veritabanı yazıyor, yani okunamaz olması beklenmez; yine de olursa yaş 0'a düşer ve
    // "az önce" der — kartın künyesi zaten tam damgayı gösteriyor.
    ageMinutes: ageMinutesOf(row.createdAt, now) ?? 0,
    // Mod ve hedef adres BURADA türetilir: `modeOf`/`KIND_META` uygulama katmanında ve o paketi bir
    // istemci bileşeninden çağırmak sunucu modüllerini tarayıcı paketine sokuyor (`AssistantRowView`
    // künyesi — ölçülen 500). Sunucuda bir kez hesaplanıp satırla birlikte iner.
    mode: modeOf(row.kind),
    bridge: proposalTargetUrl(KIND_META[row.kind].target),
  }));

  /**
   * **Seçim yoksa HİÇBİR şey açılmaz** (10.08, ızgara kurgusu).
   *
   * Bir tur burada "seçim yoksa ilk satırı aç" vardı ve iki sütunlu düzende doğruydu: karar panosu
   * ekranın yarısıydı, boş bırakmak her sekme geçişinde "önce bir şey seç" adımı dayatırdı. Izgarada
   * o gerekçe düştü — kartlar zaten görünüyor. Dahası varsayılan seçim artık bir ARIZA olurdu:
   * karar diyalogla veriliyor ve sayfa her açılışta kendiliğinden bir öneri diyaloğu açardı;
   * kapatmak da imkânsızlaşırdı, çünkü kapanış boş `p` demek ve boş `p` yine ilk satırı seçerdi.
   */
  const selected = urlState.p ? (rows.find((row) => row.id === urlState.p) ?? null) : null;

  const data: AssistantData = { rows, selected, pendingCount, options };

  return <AssistantClient data={data} urlState={{ ...urlState, p: selected?.id ?? '' }} />;
}
