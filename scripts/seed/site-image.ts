import { SiteImageService } from '@lezzet/database';
import { getR2 } from '@lezzet/storage';
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
// `home_hero`nun kaynağı müşteri şeridinin ekranda kullandığı fotoğrafın TA KENDİSİ. Yeni bir
// fotoğraf seçilmedi: hangi görselin kahraman olacağı ön uç şeritlerinin kararı, buranın işi o
// kararı kalıcı yola taşımak.
//
// ── KAYNAK DOSYA SEED'İN KENDİ KLASÖRÜNDE, `apps/web/public`TE DEĞİL (düzeltme 09.08) ──
// Eskiden `apps/web/public/hero-sofra.jpg`ti ve **başka bir şeridin sahibi olduğu dosyaya
// bağlıydık**. O şerit dosyayı `b581b3e` ile sildi — commit başlığı da bunu söylüyor: *"dört sayfa
// görseli operatörün kapısına bağlandı — geçici hero dosyası silindi"*. Plan doğruydu (kaynak tek
// yerde kalsın), seed güncellenmedi ve kurgu kendi kendini bozdu: `site_image` 0 satır kaldı,
// kapsam denetimi her `db:refresh`i **exit 1** ile bitirdi.
//
// Dosya BİREBİR aynısıdır (sha256 eşit, 1920×1080) — yeni bir görsel seçilmedi, yalnız fikstürün
// evi düzeltildi. Kural olarak: **seed'in ihtiyaç duyduğu fikstür seed'in klasöründe durur.** Bir
// başkasının ürün kararıyla silinebilecek bir dosyaya bağlanmak, sessizce bozulan bir bağımlılıktır.

/** Kaynağı repoda duran slotlar. Ötekiler bilerek boş — yer tutucu yolu koşsun. */
const DOLU_SLOTLAR = [
  {
    slot: 'home_hero' as const,
    kaynak: 'scripts/seed/data/hero-sofra.jpg',
    not: 'ana sayfa kahramanı (müşteri şeridinin fotoğrafı, fikstür kopyası)',
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
    // Yükleme İKİ sebeple `null` döner (R2 ayarsız · kaynak okunamadı) ve slot BOŞ kalır — seed
    // durmaz (kardeşleriyle aynı davranış).
    const key = await uploadImageFromPath(s.kaynak, r2Keys.siteImage(s.slot, dosyaAdi));
    if (!key) {
      // **Sebep AYRILARAK yazılır** ve bu bir üslup tercihi değil: mesaj eskiden koşulsuz "R2 yok"
      // diyordu, oysa gerçek sebep silinmiş kaynak dosyaydı. Yanlış teşhis koyan bir uyarı hiç
      // uyarmamaktan pahalıdır — bu satır iki ajanı birden yanılttı (09.08) ve arıza R2 ayarında
      // aranırken seed'de duruyordu.
      const sebep = getR2() ? `kaynak okunamadı (${s.kaynak})` : 'R2 ayarsız';
      console.log(`  ⚠ ${s.slot} — ${sebep}; slot boş bırakıldı`);
      continue;
    }
    await images.put(s.slot, key);
    yazilan += 1;
    console.log(`  ✓ ${s.slot} — ${s.not}`);
  }

  console.log(`✓ sayfa görseli: ${yazilan} dolu · 3 slot bilerek BOŞ (yer tutucu yolu koşsun)`);
}
