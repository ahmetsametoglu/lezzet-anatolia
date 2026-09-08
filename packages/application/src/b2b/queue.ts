import type { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileService } from '@lezzet/database';
import type { B2bApplicationStatus, SignalTone } from '@lezzet/domain-core';
import type { Country, KeysetCursor, Page, UserProfile } from '@lezzet/types';
import { readB2bCheck } from './check';

/*
  B2B ONAY KUYRUĞU (21.217) — mobil listenin okuması.

  ── BAYRAK KARTLA AYNI HESAPTAN ─────────────────────────────────────────────
  Satırın bayrağı `readB2bCheck` üzerinden geliyor, yani kartın okuduğu hesabın TA KENDİSİ. İkinci
  bir "ucuz bayrak" yazmak seçenekti ve elendi (kullanıcı kararı 07.09): mükerrer girdisi olmayan
  bir hesap listede "Temiz" derken kart "Mükerrer" diyebilirdi — ve operatör listeden açmadan
  onayladığında ekran onu YANLIŞ EYLEME davet etmiş olurdu. Aynı soruya iki hesap bir gün mutlaka
  ayrışır (CLAUDE §1).

  ── DIŞ SERVİSE GİDİLMEZ ────────────────────────────────────────────────────
  `refreshExternal: false`. Resmî kayıt ve VIES sorgusu KARTIN açılışına ait (künyesi `check.ts`te:
  ölçü yüzeye değil okumanın SIRASINA bağlı). Liste onları sormaz — profilde duran son cevabı okur.
  Sorsaydı bir kuyruk çizimi satır sayısı kadar dış çağrı yakardı ve tasarımın dipnotu da bunu
  yazıyor: *"Bayrak listede hesaplanır (dış servise gidilmez)"*.

  ── MALİYET: SATIR BAŞINA DÖRT YEREL OKUMA, TAVANI SAYFA ────────────────────
  `readB2bCheck` satır başına profil + adres + rota + mükerrer okuyor. Toplu hâle getirmek
  mümkündü ve YAPILMADI: montajı ikinci kez yazmak demekti (yukarıdaki ayrışma riski). N sayfa
  boyuyla tavanlı, tablo boyuyla değil. Ölçülebilir bir yavaşlık çıkarsa çare `readB2bCheck`i
  bölüp sayfa için toplu bir okuma açmaktır — bugün ölçülmüş bir yavaşlık yok (CLAUDE §0).
*/

/** Kuyruk satırı — tasarımın çizdiği dört alan + karar rozeti (`şehir · ülke · yaş`). */
export interface B2bQueueRowView {
  customerId: string;
  name: string;
  city: string | null;
  country: Country;
  appliedAt: string | null;
  flag: { label: string; tone: SignalTone; reason: string };
  status: B2bApplicationStatus;
}

export interface B2bQueueView {
  rows: B2bQueueRowView[];
  nextCursor: KeysetCursor | null;
  /** İki sekmenin sayacı — süzgeç ne olursa olsun ikisi de dolu (tasarım ikisini de yazıyor). */
  counts: { pending: number; decided: number };
  /**
   * Tek bekleyen başvurunun kimliği — ekran listeyi atlayıp doğrudan açsın diye (kullanıcı 07.09).
   *
   * **Sayfadan türetilemez:** `rows.length === 1` yalnız ilk sayfa doluysa doğru cevabı verir.
   * Ölçüt kümenin sayacı. `decided` süzgecinde daima `null` — orası bir arşiv, tek kayıt olması
   * bir kestirme sebebi değil.
   */
  single: string | null;
}

export async function readB2bQueue(
  db: SupabaseClient,
  opts: { decided?: boolean; cursor?: KeysetCursor; limit?: number } = {},
): Promise<B2bQueueView> {
  const decided = opts.decided ?? false;
  const profiles = new UserProfileService(db);

  const [page, pending, decidedCount] = await Promise.all([
    profiles.listB2bQueue({ decided, cursor: opts.cursor, limit: opts.limit }),
    profiles.countB2bPending(),
    profiles.countB2bDecided(),
  ]);

  const rows = await rowsOf(db, page);

  return {
    rows,
    nextCursor: page.nextCursor,
    counts: { pending, decided: decidedCount },
    /* Tek bekleyende ilk satır zaten O satırdır (kuyruk başvuru sırasına göre ve tek elemanlı). */
    single: !decided && pending === 1 ? (rows[0]?.customerId ?? null) : null,
  };
}

/**
 * Satırları kurar. Kart okuması `null` dönerse (profil aradaki anda silindi) satır DÜŞÜRÜLÜR —
 * yarım bir satır çizmek, operatöre dokunduğunda hiçbir yere gitmeyen bir kayıt göstermektir.
 */
async function rowsOf(db: SupabaseClient, page: Page<UserProfile>): Promise<B2bQueueRowView[]> {
  const kartlar = await Promise.all(page.rows.map((profile) => readB2bCheck(db, profile.id, { refreshExternal: false })));

  return kartlar.flatMap((kart, i) => {
    if (kart === null) return [];
    const profile = page.rows[i]!;
    return [
      {
        customerId: kart.customerId,
        name: kart.name,
        city: kart.city,
        country: kart.country,
        appliedAt: profile.b2bAppliedAt,
        flag: kart.flag,
        status: kart.status,
      },
    ];
  });
}
