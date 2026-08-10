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
  const [queue, pendingCount, options] = await Promise.all([
    readAssistantQueue(urlState.tab),
    countPendingProposals(),
    readAssistantFormOptions(),
  ]);

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
    bridge: proposalTargetUrl(KIND_META[row.kind].target, row.id, modeOf(row.kind)),
  }));

  /**
   * **Seçim yoksa ilk satır açılır.** Karar çerçevesi ekranın büyük yarısı: boş bırakmak operatöre
   * her sekme geçişinde "önce bir şey seç" adımı dayatırdı.
   */
  const selectedId = urlState.p || (rows[0]?.id ?? '');
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const data: AssistantData = { rows, selected, pendingCount, options };

  return <AssistantClient data={data} urlState={{ ...urlState, p: selected?.id ?? '' }} />;
}
