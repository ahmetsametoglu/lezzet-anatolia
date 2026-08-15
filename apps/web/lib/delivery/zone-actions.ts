'use server';

import { revalidatePath } from 'next/cache';
import { DeliveryZonePostalCodeService, DeliveryZoneService, serviceDb } from '@lezzet/database';
import { CountryEnum } from '@lezzet/types';
import { z } from 'zod';
import { requireAdmin } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';

const DELIVERIES_PATH = '/operations/deliveries';

/** İnsan diline çevrilmiş kısıt ihlali — rota ekranının sözlüğüyle aynı kayıt. */
const CONSTRAINT_MESSAGE: Record<string, string> = {
  delivery_zone_postal_code_pkey:
    'Eklemek istediğiniz posta kodlarından biri başka bir rotada tanımlı. Bir kod yalnız tek rotada olabilir.',
};

const InputSchema = z.object({
  zoneId: z.string().uuid(),
  codes: z.array(z.object({ country: CountryEnum, postalCode: z.string().min(1) })).min(1),
  proposalId: z.string().uuid(),
});

/**
 * **ÖNERİDEN BÖLGEYE KOD EKLEME** — kuyruğun kendi kapısı (22.36).
 *
 * ── NEDEN AYRI BİR KAPI, `saveZoneAction` DEĞİL ─────────────────────────────
 * Rota ekranının kapısı bölgenin TAMAMINI yazıyor (ad, günler, aktiflik ve kod kümesinin son hâli;
 * kodlar sil-yaz ile değişiyor). Kuyruğun işi ise dar: **var olan bir bölgeye kod EKLEMEK.** O
 * kapıyı buradan çağırmak, taşımadığımız üç alanı da göndermeyi gerektirirdi ve gönderilmeyen her
 * alan bölgenin bugünkü değerini ezme riski taşırdı — patron kod eklerken teslim günlerini
 * kaybedebilirdi. Üstelik kapı kardeş sayfa klasöründe yaşıyor ve oradan ithal edilemez
 * (`STACK §7`).
 *
 * ── EKLER, DEĞİŞTİRMEZ ──────────────────────────────────────────────────────
 * Mevcut kodlar önce OKUNUYOR, seçilenler üstüne biniyor. `zone_extend` bir EKLEME önerisidir;
 * gelen kümeyi bölgenin kümesi yerine yazmak, onaylayan operatörün haberi olmadan rotadan kod
 * düşürürdü. Aynı kural rota ekranının ön dolgusunda da yazılı (*"önce okur, üstüne ekler — 'ekle'
 * sessizce 'değiştir' olmasın"*), ikinci kez uygulanıyor çünkü ikisi ayrı yazma yolu.
 *
 * ── BİLDİRİMİ BU KAPI GÖNDERMEZ ─────────────────────────────────────────────
 * Kod bölgeye girince `zone_available` uzlaştırma işi (saatte bir) "kapsanmış ve haberi gitmemiş"
 * bekleyişleri bulup gönderiyor (14.10 · 19.21). Buradan ikinci bir gönderim yolu açmak aynı mesajı
 * iki kez yollardı. Ekranın uyarısı yine de doğru ve şart: onaydan sonra mesaj GİDECEK ve geri
 * alınamayacak — yalnız birkaç dakika gecikmeli.
 */
export async function addZoneCodesFromProposalAction(input: unknown): Promise<ActionResult<{ added: number }>> {
  try {
    const staff = await requireAdmin();
    const { zoneId, codes, proposalId } = InputSchema.parse(input);

    const db = serviceDb();
    const zoneSvc = new DeliveryZoneService(db);

    const added = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const zone = await zoneSvc.getById(zoneId);
        if (!zone) throw new Error('Bölge bulunamadı — silinmiş olabilir.');

        const existing = await new DeliveryZonePostalCodeService(db).listByZones([zoneId]);
        const have = new Set(existing.map((row) => `${row.country}:${row.postalCode}`));
        // Zaten bölgede olan kod ikinci kez yazılmıyor: kısıt onu reddederdi ve tüm yazım
        // düşerdi — oysa operatörün seçimi geçerli, yalnız bir kısmı zaten yapılmış.
        const fresh = codes.filter((code) => !have.has(`${code.country}:${code.postalCode}`));
        if (fresh.length === 0) return 0;

        await zoneSvc.replacePostalCodes(zoneId, [...existing.map((r) => ({ country: r.country, postalCode: r.postalCode })), ...fresh]);
        return fresh.length;
      },
      (count) => ({ codesAdded: String(count) }),
    );

    revalidatePath(DELIVERIES_PATH);
    revalidatePath('/operations/assistant');
    return { data: { added }, error: null };
  } catch (error) {
    // `constraintMessage` adı bilinmeyen hatada zaten `getErrorMessage`e düşüyor — ikinci bir
    // yedek yazmak, hiç çalışmayacak bir dal bırakmak olurdu.
    return { data: null, error: constraintMessage(error, CONSTRAINT_MESSAGE) };
  }
}
