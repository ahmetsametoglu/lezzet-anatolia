import type { AssistantProposalKind, AssistantProposalStatus } from '@lezzet/types';
import type { ProposalEconomics } from './economics';

/**
 * Asistan onay kuyruğu — EKRANIN SÖZLEŞMESİ (22.3).
 *
 * **Bu dosya bilerek DB'siz ve `server-only` DEĞİL:** ekran şeridi (operasyon) ile okuma kapısı
 * (denetim) PARALEL yazılıyor ve ikisinin ortak dili bu. Tipler önce, veri sonra — ekran fikstürle
 * başlayıp kapı gelince tek satırla bağlanabilsin diye.
 *
 * Kurgu ve sınırlar: `docs/architecture/AI_ADMIN_ASSISTANT.md §5` ·
 * ekran sözleşmesi: `docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md`.
 */

/** Panelin üç sekmesi. `expired` AYRI çünkü süre dolması karar değil, kararın kaçırılmasıdır. */
export type QueueTab = 'pending' | 'expired' | 'decided';

/**
 * Kuyruk satırı — liste ve karar kartı AYNI satırdan beslenir (iki ayrı okuma, iki ayrı gerçek
 * demekti; kartta görünenle listede görünen ayrışırdı).
 *
 * **Ekran `payload`ın içine girip kendi hesabını YAPMAZ.** Tutar, etiket, etki cümlesi ve hedef
 * tablolar burada hazır gelir; `payload` yalnız "Teknik döküm" bölümünde ham basılır. Sebebi
 * tek kaynak: aynı türetme iki yerde yazılırsa biri bir gün ötekinden ayrılır ve panelde görünen
 * ile uygulanan farklı olur — onay ekranının tek vaadi tam olarak bunun olmaması.
 */
export interface AssistantQueueRow {
  /** uuid. Ekranda ilk 8 hane BÜYÜK harf (`3F9A21C4`) — insan-okunur referans kolonu yok. */
  id: string;
  kind: AssistantProposalKind;
  /** Türkçe rozet metni: 'Paket' · 'Vitrin' · 'Tedarik' · 'Stok' · 'Para' · 'Bölge' · 'Ürün'. */
  kindLabel: string;
  /** Patronun okuyacağı tek cümle — listede ve kartın başlığında aynen. */
  summary: string;
  /** "Neden bu öneri". `null` ise tasarımın soluk/kesikli hâli çizilir — uydurulmaz. */
  reason: string | null;
  /** "Uygulanınca ne olur" — `kind`'dan türer, sabit metin. Yeri KART değil onay diyaloğu (10.08). */
  impact: string;
  /**
   * Geri alma YOLU (`KIND_META.undoHint`) — yalnız onay diyaloğunda, tanımlıysa.
   *
   * **Sunucudan gelir, istemci `KIND_META`ya BAKMAZ:** o sözlük `@lezzet/application` içinde ve o
   * paket `node:crypto` taşıyan sunucu bağımlılıklarına açılıyor — istemci komponentinden import
   * edilirse derleme "Reading from node:crypto is not handled" ile kırılır (yaşandı 10.08).
   * `impact` de aynı sebeple burada taşınıyor; desen tek.
   */
  undoHint: string | null;
  /** Teknik dökümün "hedef tablolar" satırı (`['bundle', 'bundle_item']`). */
  targetTables: string[];
  /** Ham dilekçe — YALNIZ teknik dökümde, olduğu gibi. Şekli `kind`'a göre değişir. */
  payload: unknown;
  /** Listede ve kartta gösterilecek tutar; tipinde tutar kavramı yoksa `null`. */
  amountCents: number | null;
  /**
   * KÂRLILIK — yalnız paket ve fırsat önerilerinde dolu, ötekilerde `null`.
   *
   * Ekran bu bloğu HESAPLAMAZ, çizer: maliyet KDV hariç, satış fiyatı dahil ve çevrim kapıda
   * yapılmış durumda (`lib/assistant/economics.ts`). Marj negatifse uyarı tonu — ama YOL
   * KAPATILMAZ: zararına satmak bir karardır (elde kalıp imha edilecek maldan iyidir) ve
   * `offer-dialog` da aynı şekilde davranıyor.
   *
   * Maliyet `null` = alış hiç girilmemiş; ekran "kâr hesaplanamıyor" der. Sıfır YAZILMAZ —
   * sıfır maliyet "%100 kâr" gösterirdi.
   */
  economics: ProposalEconomics | null;
  createdAt: string;
  expiresAt: string;
  /** Tazelik rozeti — eşiği KAPI bilir (6 saat), ekran bilmez. */
  freshness: 'ok' | 'soon' | 'gone';
  status: AssistantProposalStatus;
  /** Kararı veren personelin adı; personel silinmişse `null` (karar yine geçerlidir). */
  decidedByName: string | null;
  decidedAt: string | null;
  decidedNote: string | null;
  /** `status === 'failed'` ise MOTORUN sebebi — "reddedildi"den ayrı gösterilir. */
  error: string | null;
  /** Uygulanınca doğan kayıtların kimlikleri (`{ bundleId: '…' }`) — köprü linki buradan. */
  result: Record<string, string> | null;
}

/** `applyProposalAction` sonucu. `gone` = yarış kaybedildi (hata DEĞİL, bilgi). */
export type ApplyOutcome =
  | { status: 'applied'; result: Record<string, string> }
  | { status: 'failed'; error: string }
  | { status: 'gone' }
  /**
   * Bu tip kuyruktan uygulanmaz, ilgili ekrana DEVREDİLİR (22.5). Hata değil yönlendirme: öneri
   * `pending` kalır, ekran kullanıcıyı `target` ekranına götürür. Ekran düğmeyi gizlese bile kapı
   * sunucuda durur — eski bir sekme geri alınamaz bir eylemi düzenlenmeden koşturamasın.
   */
  | { status: 'handoff'; target: string };

/** `rejectProposalAction` sonucu. */
export type RejectOutcome = { status: 'rejected' } | { status: 'gone' };
