import { SiteImageService } from '@lezzet/database';
import { r2Keys, tabloDolu, uploadImageFromPath, type Db } from './shared';

// ── Sayfa görselleri (`site_image`, 09.16 · 0043) ────────────────────────────────────────────────
//
// Ürün/kategori görselinden farkı sahibi: bunlar bir VARLIĞA değil bir SAYFA YERİNE ait. "Boş
// sepet çizimi"nin karşılık geldiği bir satır yok ve olmayacak.
//
// ── DÖRT SLOTUN BİRİ DOLU, ÜÇÜ BOŞ — VE BU BİLİNÇLİ ─────────────────────────
// Hepsi doldurulsaydı **boş slot yolu hiç koşmazdı**: ekranların yer tutucuya düşme dalı, kova
// erişilemediğinde kırılmama davranışı ve operasyonun "bu slot henüz boş" satırı yerelde hiç
// görünmezdi. Seed'in işi gerçeği taklit etmek, en iyi hâli göstermek değil.
//
// ── GÖRSEL SEÇİMİ BU ŞERİDİN KARARI DEĞİL ───────────────────────────────────
// `home_hero`nun kaynağı müşteri şeridinin bugün ekranda kullandığı geçici dosyanın TA KENDİSİ
// (`apps/web/public/hero-sofra.jpg`). Yeni bir fotoğraf seçilmedi: hangi görselin kahraman olacağı
// ön uç şeritlerinin kararı, buranın işi o kararı kalıcı yola taşımak. Slot bağlandığında geçici
// dosya silinir ve kaynak tek yerde kalır.

/** Kaynağı repoda duran slotlar. Ötekiler bilerek boş — yer tutucu yolu koşsun. */
const DOLU_SLOTLAR = [
  {
    slot: 'home_hero' as const,
    kaynak: 'apps/web/public/hero-sofra.jpg',
    not: 'ana sayfa kahramanı (müşteri şeridinin geçici dosyası kalıcı yola taşındı)',
  },
];

export async function seedSiteImages(db: Db): Promise<void> {
  if (await tabloDolu(db, 'site_image')) {
    console.log('▸ sayfa görselleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ SAYFA GÖRSELLERİ seed');

  const images = new SiteImageService(db);
  let yazilan = 0;

  for (const s of DOLU_SLOTLAR) {
    const dosyaAdi = s.kaynak.split('/').pop() || 'hero.jpg';
    // R2 ayarsızsa `null` döner ve slot BOŞ kalır — seed durmaz (kardeşleriyle aynı davranış).
    const key = await uploadImageFromPath(s.kaynak, r2Keys.siteImage(s.slot, dosyaAdi));
    if (!key) {
      console.log(`  ⚠ ${s.slot} — R2 yok, slot boş bırakıldı`);
      continue;
    }
    await images.put(s.slot, key);
    yazilan += 1;
    console.log(`  ✓ ${s.slot} — ${s.not}`);
  }

  console.log(`✓ sayfa görseli: ${yazilan} dolu · 3 slot bilerek BOŞ (yer tutucu yolu koşsun)`);
}
