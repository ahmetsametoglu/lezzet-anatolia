import { SiteImageService } from '@lezzet/database';
import { getR2 } from '@lezzet/storage';
import { SITE_IMAGE_SLOTS } from '@lezzet/types';
import { r2Keys, uploadImageFromPath, type Db } from './shared';

// ── Sayfa görselleri (`site_image`, 09.16 · 0043) ────────────────────────────────────────────────
//
// Ürün/kategori görselinden farkı sahibi: bunlar bir VARLIĞA değil bir SAYFA YERİNE ait. "Boş
// sepet çizimi"nin karşılık geldiği bir satır yok ve olmayacak.
//
// ── DÖRT SLOTUN İKİSİ DOLU, İKİSİ BOŞ — VE BU BİLİNÇLİ ──────────────────────
// Hepsi doldurulsaydı **boş slot yolu hiç koşmazdı**: ekranların yer tutucuya düşme dalı, kova
// erişilemediğinde kırılmama davranışı ve operasyonun "bu slot henüz boş" satırı yerelde hiç
// görünmezdi. Seed'in işi gerçeği taklit etmek, en iyi hâli göstermek değil.
// (19.08'e dek biri doluydu; `professionals_hero` kullanıcı kararıyla eklendi — gerekçe aşağıda.
// İki slot boş kaldığı için o kapsam korunuyor.)
//
// ── GÖRSEL SEÇİMİ BU ŞERİDİN KARARI DEĞİL ───────────────────────────────────
// `home_hero`nun kaynağı müşteri şeridinin ekranda kullandığı fotoğrafın TA KENDİSİ. Yeni bir
// fotoğraf seçilmedi: hangi görselin kahraman olacağı ön uç şeritlerinin kararı, buranın işi o
// kararı kalıcı yola taşımak. `professionals_hero` bu kuralın İSTİSNASI ve kullanıcının açık
// talebiyle (19.08): sayfada hiç fotoğraf yoktu, yer tutucunun gri kutusu duruyordu.
//
// ── ASIL KAPI OPERATÖRÜN, SEED FİKSTÜRDÜR ───────────────────────────────────
// Dört slotu da operatör kendi ekranından yüklüyor (Operasyon → Ayarlar → Sayfa görselleri,
// `site-images-tab.tsx`) ve üretimde doğru yol odur — seed üretim veritabanına atılmıyor.
// Buradaki iki dosya yalnız YERELİN fikstürü: ekranı fotoğrafsız görmemek için.
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
  {
    slot: 'professionals_hero' as const,
    kaynak: 'scripts/seed/data/hero-profesyonel-mutfak.jpg',
    /*
      Kurumsal sayfanın kahramanı (kullanıcı isteği 19.08 — *"tıpkı ana sayfada olduğu gibi uygun
      bir resim"*). Konusu sayfanın kendi sözleşmesinden geldi, uydurulmadı: `messages.json`
      → `hero.imageAlt` = *"Cuisine de restaurant et véhicule de livraison"*, üst başlık
      *"Pour restaurants & épiceries"*. Tek karede hem mutfak hem araç bulunmadığı için baskın
      özne seçildi — çalışan bir profesyonel mutfak.

      KAYNAK VE LİSANS — kalıcı olarak burada dursun ki sonradan "bu nereden geldi" sorusu
      cevapsız kalmasın:
        Unsplash · Pylyp Sukhenko (@novokayn)
        https://unsplash.com/photos/chef-chopping-vegetables-in-restaurant-kitchen-y-XZf_TNRms
        Unsplash License — ticari kullanım serbest, izin gerekmez. Künye zorunlu DEĞİL; yine de
        yazıldı: bir fotoğrafın sahibi vardır ve provenance'ı kaybetmek, bir gün onu değiştirmek
        gerektiğinde nereye bakılacağını da kaybetmektir.
      1920×1080, `home_hero` ile aynı ölçü (çerçeve `RATIO_BAND` ile kırpıyor).
    */
    not: 'kurumsal sayfa kahramanı (Unsplash · Pylyp Sukhenko, Unsplash License)',
  },
];

/*
  ── NÖBET SLOT BAŞINA, TABLO BAŞINA DEĞİL (19.08) ───────────────────────────────────────────────
  Eskiden `tabloDolu(db,'site_image')` ile TÜM bölüm atlanıyordu: tabloda tek satır varsa (ki
  `home_hero` yüzünden hep vardı) seed hiç koşmuyordu. Bunun görünmeyen bedeli, listeye YENİ bir
  slot eklemenin yerelde hiç işe yaramamasıydı — `professionals_hero` eklenince ortaya çıktı:
  `db:seed` "zaten dolu" deyip geçiyordu ve görseli görmenin tek yolu `db:refresh` (yani kullanıcının
  elle girdiği her şeyi silmek) oluyordu.

  Slot başına bakmak idempotentliği de daraltıyor: operatörün kendi yüklediği bir görselin üstüne
  seed YAZMAZ. Eski hâlde de yazmıyordu ama sebebi tesadüftü (tablo doluydu); şimdi kural.
*/
export async function seedSiteImages(db: Db): Promise<void> {
  console.log('▸ SAYFA GÖRSELLERİ seed');

  const images = new SiteImageService(db);
  let yazilan = 0;
  let atlanan = 0;

  for (const s of DOLU_SLOTLAR) {
    // Doluysa DOKUNULMAZ: bu satır operatörün kendi yüklediği görsel olabilir ve seed onu ezmemeli.
    if (await images.getSlot(s.slot)) {
      atlanan += 1;
      continue;
    }
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

  const bosSlot = SITE_IMAGE_SLOTS.length - DOLU_SLOTLAR.length;
  console.log(
    `✓ sayfa görseli: ${yazilan} yeni / ${atlanan} zaten dolu · ${bosSlot} slot bilerek BOŞ (yer tutucu yolu koşsun)`,
  );
}
