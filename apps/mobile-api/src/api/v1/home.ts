import { Hono } from 'hono';
import type { z } from 'zod';
import { countDiscoverDeck } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { HomeSchema, PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readHomeBands, readHomeFeatured, readHomeOffers } from '../../lib/home';
// Tarif/paket KARTI iki yüzeyin ortak kapısından gelir (`lib/ideas.ts`): vitrin şeridi ile Fikirler
// listesi aynı kartı çiziyor, fark yalnız sınır ve süzgeçte.
import { HOME_PACKAGE_LIMIT, HOME_RECIPE_LIMIT, readPackageCards, readRecipeCards } from '../../lib/ideas';
import { readPlace, readViewer } from './catalog';

/**
 * Vitrin ucu (21.14 bağlanma etabı) — ana ekranın MÜŞTERİDEN BAĞIMSIZ bölümleri TEK turda.
 *
 * Katalogla aynı iki karar geçerli ve gerekçeleri `catalog.ts` başlığında:
 *   · **Oturumsuz gezilir** — `router.ts`te `bearerAuth`tan ÖNCE bağlıdır; Bearer varsa yalnız
 *     fırsat FİYATINI kişiselleştirir (B2B/özel fiyat), erişimi değiştirmez. 401 yok.
 *   · **`locale` zorunlu ve varsayılansız** — eksikse 400 (sessizce Türkçeye düşmek gizli arıza;
 *     `catalog.ts` `LocaleSchema` künyesi).
 *
 * BU DOSYA KURAL HESAPLAMAZ: bölüm seçimi/sayımı/daraltması okuma kapısında (`lib/home.ts`),
 * fiyat-stok kararları `@lezzet/application`da. Burada yalnız sorgu çözümü, kimlik çözümü ve zarf.
 *
 * Selamlama · puan · rozet · süren sipariş BİLEREK YOK (kullanıcı kararı 08.08): kimlikli bölümler
 * bu etapta kapsam dışı; ekran onları kimlikli uçlardan alacak. Sözleşmede olmayan bölümlerin
 * (flash · seçki · paket) gerekçesi `home-api.schema.ts` başlığında — uç dolduramayacağını taşımaz.
 */
export const home = new Hono<AppEnv>();

home.get('/home', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  /* Yer artık İSTEKTEN çözülür (09.08): istemci posta kodunu gönderir, sunucu depoyu bulur.
     Kimlikle birlikte tek turda okunur — biri ötekini bekletmez. Gerekçe `catalog.ts` `readPlace`
     künyesinde; kod yoksa iki `null` döner ve okuma depo-üstüne düşer. */
  const [viewer, place] = await Promise.all([
    readViewer(db, c.req.header('authorization')),
    readPlace(db, c.req.query('postalCode')),
  ]);
  // Bölümler birbirinden bağımsız okunur; biri ötekini bekletmez. `limit` sorgusu yok: raylar
  // editoryal seçkidir, sınırlar okuma kapısında sabittir (CLAUDE §1).
  const [bands, offers, featured, recipes, packages, discoverCards] = await Promise.all([
    readHomeBands(db, locale.data),
    readHomeOffers(db, locale.data, place, viewer),
    readHomeFeatured(db, locale.data, place, viewer),
    readRecipeCards(db, locale.data, HOME_RECIPE_LIMIT),
    // Vitrin YALNIZ işaretli paketleri taşır — işaret bir seçimdir, yedeği yoktur (sözleşme künyesi).
    // Yer BURAYA DA geçer (10.08): vitrindeki paket kartı ile Fikirler sekmesindeki kart AYNI
    // karttır; birinin yeri bilip ötekinin bilmemesi aynı paketi iki ekranda farklı gösterirdi.
    readPackageCards(db, locale.data, { featuredOnly: true, limit: HOME_PACKAGE_LIMIT, place }),
    /* KEŞİF DAVETİNİN ŞARTI (MB-58b): kalan kart sayısı. Destenin KENDİSİ değil sayısı okunur ve
       kural desteyi kuran fonksiyonun aynısından gelir (`countDiscoverDeck` künyesi) — iki ayrı
       sayım bir gün ayrı düşer ve vitrin, açtığında boş çıkan bir tura davet ederdi.

       BEDELİ ÖLÇÜLDÜ, GECİKMEYE EKLENMİYOR: bu okuma yukarıdaki demetin İÇİNDE koşuyor, yani
       ucun süresi en yavaş bölümün süresidir — yenisi onlardan hızlı. Ziyaretçide tek sorgu
       (eleyecek geçmiş yok), girişlide iki. Backlog'da "sıcak yola iki sorgu" diye askıya
       alınmıştı; askının dayanağı SIRAYLA koşacağı varsayımıydı, oysa vitrin zaten yedi okumayı
       paralel yapıyor. */
    countDiscoverDeck(db, viewer.customerId),
  ]);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: okuma kapısının döndürdüğü şekiller sözleşmeye alan alan
  // uymak zorunda ve uymadığı gün burası DERLENMEZ; `parse` da süzgeçtir — fazla alan zarfa sızamaz.
  const body: z.input<typeof HomeSchema> = { bands, offers, featured, recipes, packages, discoverCards };
  return ok(c, HomeSchema.parse(body));
});
