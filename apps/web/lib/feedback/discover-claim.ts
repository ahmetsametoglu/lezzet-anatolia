import 'server-only';
import { ProductFeedbackService, serviceDb } from '@lezzet/database';
import type { ProductFeedback } from '@lezzet/types';
import { awardFeedbackPoints } from './points';

/**
 * Keşif turunun HESABA BAĞLANMASI (08.7 · 17.3 · DOMAIN §13) — ziyaretçinin kaydırmaları,
 * sonradan açtığı hesaba puan olarak yazılır.
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Ziyaretçi kaydırabiliyor ve sinyali ANINDA sayılıyor (kimliksiz satır). Eskiden orada bitiyordu:
 * *"puan yok"*. Karar değişti (kullanıcı, 03.08): tur bitince ziyaretçiye hesap açması önerilir ve
 * biriken puan hesabına yüklenir. Böylece hem veri hem müşteri kazanılıyor — kaydırmalar boşa
 * gitmiyor ve giriş daveti, değerin gösterildiği anda geliyor.
 *
 * ── SAHİPLİK İSTEMCİDEN GELİR AMA DOĞRULANIR ────────────────────────────────
 * Tarayıcı kendi satır kimliklerini saklıyor (uuid; tahmin edilemez). Yine de her satır burada üç
 * kapıdan geçer: **kimliksiz olmalı** (başkasının kaydını devralmak yok), **`candidate` bağlamında
 * olmalı** (alım-sonrası anket bu yoldan puan alamaz) ve **oy taşımalı**. Kimliksiz olma şartı
 * yalnız güvenlik değil, aynı zamanda ikinci kez ödemeyi de imkânsız kılıyor: bir kez bağlanan
 * satır artık kimliksiz değildir.
 *
 * ── TEKRAR TEKRAR PUAN KAPALI VE KURAL YENİ DEĞİL ───────────────────────────
 * `DOMAIN §14`: *"aynı ürüne yorum/swipe BİR KEZ puan verir"*. Girişli müşteride bunu `upsert`
 * sağlıyor (aynı satır güncellenir, yeni puan doğmaz). Ziyaretçide kimlik olmadığı için her
 * kaydırma YENİ satır açıyor — beş kez kaydıran beş satır üretir. Bu yüzden bağlama **ürün
 * başına** yapılır, satır başına değil:
 *   · aynı ürünün birden çok kaydırmasından yalnız EN YENİSİ bağlanır;
 *   · müşterinin o ürüne ait bir `candidate` kaydı ZATEN varsa hiç bağlanmaz.
 * İkincisi turu tekrarlayarak puan biriktirme yolunu kapatıyor: ikinci turda aynı ürünler zaten
 * oylanmış sayılır.
 *
 * Üstüne mevcut korumalar duruyor ve burada YENİDEN YAZILMADI: günlük tavan ve B2C sınırı
 * `awardPoints` içinde, defterin tekilliği (`müşteri, sebep, kaynak`) veritabanı indeksinde.
 *
 * ── BAĞLANMAYAN SATIRLAR SİLİNMEZ ───────────────────────────────────────────
 * Aynı ürünün fazla kaydırmaları kimliksiz kalır — yani aday panosunda tek kişinin tekrarları
 * hâlâ birden çok sayılır. Bu bugün de böyle (ziyaretçi kaydırması hiç tekilleştirilmiyordu),
 * yeni bir açık değil. Talep anında o satırların aynı kişiye ait olduğunu KESİN biliyoruz, yani
 * birleştirmek sinyali düzeltirdi — ama geri bildirim satırı silmek/birleştirmek yazma katmanının
 * sahibinin kararı. `docs/talep/not-arka-uc-kesif-mukerrer-kaydirma.md` ile bildirildi.
 */

interface DiscoverClaimResult {
  /** Hesaba bağlanan kaydırma sayısı — ekranın "N kaydırma hesabınıza işlendi" cümlesi. */
  linked: number;
  /** Gerçekten YAZILAN puan; tavana takılan ya da zaten ödenmiş olan buraya girmez. */
  points: number;
}

export async function claimDiscoverSwipes(customerId: string, feedbackIds: readonly string[]): Promise<DiscoverClaimResult> {
  if (feedbackIds.length === 0) return { linked: 0, points: 0 };

  const db = serviceDb();
  const feedback = new ProductFeedbackService(db);
  const rows = await feedback.listByIds(feedbackIds);

  const claimable = rows.filter((r) => r.customerId === null && r.context === 'candidate' && r.vote !== null);
  if (claimable.length === 0) return { linked: 0, points: 0 };

  // Müşterinin o ürüne ait kaydı zaten varsa ürün kapalıdır — hem bu turdan hem önceki turlardan.
  const already = new Set(
    (await feedback.listByCustomer(customerId)).filter((r) => r.context === 'candidate').map((r) => r.productId),
  );

  let linked = 0;
  let points = 0;
  for (const row of newestPerProduct(claimable)) {
    if (already.has(row.productId)) continue;
    // Sıradaki turda aynı ürün ikinci kez bağlanmasın diye küme anında büyür.
    already.add(row.productId);

    const attached = await feedback.update({ id: row.id, customerId });
    linked += 1;
    // Puan yazılmayabilir (günlük tavan, B2B, sıfır değerli aksiyon) — bağlama yine de geçerlidir:
    // sinyalin sahibi belli oldu, ödül ayrı bir sorudur.
    const entry = await awardFeedbackPoints(attached);
    points += entry?.points ?? 0;
  }

  return { linked, points };
}

/**
 * Ürün başına EN YENİ kaydırma — müşterinin son fikri neyse o.
 *
 * İlkini almak da bir seçenekti; sonuncusu seçildi çünkü girişli akışta `upsert` de aynısını yapıyor
 * (son oy öncekini eziyor). İki yolun aynı davranması, "ziyaretçiyken başka, girişliyken başka"
 * diyen bir fark bırakmıyor.
 */
function newestPerProduct(rows: readonly ProductFeedback[]): ProductFeedback[] {
  const byProduct = new Map<string, ProductFeedback>();
  for (const row of rows) {
    const current = byProduct.get(row.productId);
    if (!current || row.createdAt > current.createdAt) byProduct.set(row.productId, row);
  }
  return [...byProduct.values()];
}
