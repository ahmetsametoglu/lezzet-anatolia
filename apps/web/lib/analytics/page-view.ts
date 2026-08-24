import 'server-only';
import { headers } from 'next/headers';
import type { AppRoute } from '@lezzet/i18n';
import type { AnalyticsSubjectType } from '@lezzet/types';
import { recordEvent } from './record';

/**
 * Sayfa görüntülemesi (08.9) — huninin İLK adımı ve tek "render'dan atılan" olay.
 *
 * ── NEDEN HER SAYFADA AYRI ÇAĞRILIYOR ────────────────────────────────────────
 * Tek bir yere koyup hepsini kapatmak DENENDİ ve olmuyor: ortak çerçeve (`SiteFrame`) hata
 * sayfalarında da kullanılıyor ve orası `'use client'` — `server-only` bir kapı o ağaca giremez.
 * Layout da işe yaramaz: App Router yumuşak gezinmede paylaşılan layout'u YENİDEN ÇALIŞTIRMAZ,
 * yani katalogdan ürüne geçen ziyaretçi hiç sayılmazdı. Geriye sayfanın kendisi kalıyor — zaten
 * her gezinmede yeniden çalışan tek yer orası.
 *
 * ── UTM YALNIZ İNİŞ SAYFALARINDAN ────────────────────────────────────────────
 * `searchParams` yalnız sayfa bileşeninde var. Ama bu bir eksiklik değil, kampanya bağının doğası:
 * UTM oturumun İLK olayında bir kez kalıcılaşıyor (`ANALYTICS §3`) ve ziyaretçi kampanya bağına
 * **indiği** sayfada zaten ilk olayını üretiyor. Hesaba, siparişlere ya da talebe kampanyayla
 * inilmez — oralara giriş yapmış müşteri gider. Bu yüzden parametre iniş sayfalarında geçilir,
 * ötekilerde geçilmez ve geçilmemesi doğrudur.
 *
 * **Sorgu dizesi SÜZÜLMEDEN geçirilir** ve bu bilinçli: kapalı sözlüğe indirgeme kapının işi
 * (`normalizeUtm`). Burada da süzülseydi iki süzgeç bir gün ayrışırdı — nitekim ilk yazımda
 * ayrışmıştı bile (aşağıda).
 *
 * ── KAYNAK ALAN ADI, HAM ADRES DEĞİL ─────────────────────────────────────────
 * `referer` üstbilgisinin tamamı yazılsaydı sorgu dizesiyle birlikte kişisel veri taşıyabilirdi
 * (arama motorunun sorgusu, bir e-posta sağlayıcısının jetonu). Yalnız ALAN ADI alınır ve kendi
 * alanımız kaynak sayılmaz — site içi gezinme bir trafik kaynağı değildir.
 */
type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * ── ROTA KALIBINI SAYFA GEÇER, KAPI TÜRETMEZ (denetim P1, 04.08) ─────────────
 * Kapı yolu `x-invoke-path ?? referer` ile türetiyordu; `x-invoke-path` Next 15'te YOK ve müşteri
 * dalı middleware'den erken döndüğü için yol üstbilgisi de yazılmıyor. Geriye `referer` kalıyordu —
 * o da render anında **bir önceki sayfa**. Ölçüldü: `/fr/produit/…` ziyareti deftere
 * `product_view path=/catalogue` yazıyordu. Hata vermiyordu çünkü `path` hep dolu ve hep makul.
 *
 * Kalıp `AppRoute` tipinde, serbest dize DEĞİL: yanlış yazılan bir yol derlemede patlar ve
 * `PATHNAMES`'e yeni rota eklendiği an burada da geçerli olur — ikinci bir liste tutulmaz.
 * Dilsizdir (`/product/[slug]`), yoksa aynı ekran üç dilde üç satır olurdu.
 *
 * ── SUNUCU EYLEMLERİ KALIP GEÇMEZ ve bu bir eksik değil ──────────────────────
 * `path` yalnız RENDER anında yanlıştı. Sunucu eyleminde (`add_to_cart`, `place_resolved`,
 * `share`…) tarayıcı `Referer`'a **bulunulan sayfayı** yazar — kapının türetimi orada zaten doğru
 * cevabı veriyor. Eylemlere de kalıp geçirmek, istemcinin rotasını sunucuya taşımak demekti:
 * her eylem imzasına bir alan daha, unutulduğunda sessizce yanlış. Bilen taraf söyler ilkesi
 * burada da geçerli — render anında bilen SAYFA, eylem anında bilen TARAYICI.
 * (Gerekçeye dayanıyor; canlı ölçüm render tarafı için yapıldı, eylem tarafı için bekliyor.)
 */
/**
 * ── ÖZNE İSTEĞE BAĞLI, ÇÜNKÜ HER SAYFANIN ÖZNESİ YOK (08.57) ─────────────────
 * `path` rota kalıbı olduğu için "hangi sayfa türü" cevaplanıyor ama "hangi KAYIT" cevaplanmıyordu.
 * Ürün sayfası bunu kendi `product_view` olayıyla çözüyor; tarifin öyle bir olayı yok ve olması da
 * gerekmiyor — ölçülen şey aynı: bir içerik sayfasına bakıldı.
 *
 * Alan opsiyonel ve varsayılanı YOK: özne taşımayan sayfalar (katalog, hesap, sepet) bugünkü
 * çağrılarını bit bazında koruyor. Zorunlu yapmak, öznesi olmayan her sayfaya uydurma bir kimlik
 * yazdırmak olurdu.
 */
export async function recordPageView(
  path: AppRoute,
  searchParams?: RawSearchParams,
  subject?: { subjectType: AnalyticsSubjectType; subjectId: string },
): Promise<void> {
  const params = flatten(searchParams);
  void recordEvent({ type: 'page_view', utm: params, source: params ? null : await externalReferrer(), ...subject }, { path });
}

/**
 * Sorgu parametrelerini düzleştirir — **süzmez.**
 *
 * Süzme KAPININ işi (`normalizeUtm`): beş alanlık kapalı sözlüğe indiriyor, `gclid`/`fbclid` gibi
 * tıklama kimliklerini düşürüyor ve üç yazımı birden tanıyor (`utm_source` · `utmSource` ·
 * `source`). Burada ikinci bir süzgeç yazmak yalnız kopya olmazdı, **daraltırdı**: bir süre yalnız
 * `utm_` öneklileri geçiriyordum ve elle yazılmış `?source=bulten` biçimindeki bir kampanya bağı
 * kapıya hiç ulaşmıyordu (04.08 · `CLAUDE §1`).
 *
 * Tek iş dizileri tekile indirmek: aynı etiketin iki kez gelmesi bir kampanya değil bir kaza, ilki
 * alınır.
 */
function flatten(searchParams?: RawSearchParams): Record<string, string> | null {
  if (!searchParams) return null;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) flat[key] = single;
  }
  return Object.keys(flat).length > 0 ? flat : null;
}

/**
 * Dışarıdan geldiyse yönlendirenin alan adı, yoksa `null`.
 *
 * **Etiketli kampanyada okunmaz:** UTM zaten kaynağı söylüyor ve ikisini birden yazmak aynı
 * ziyareti iki kaynağa saydırabilirdi (Instagram bağı `l.instagram.com` üzerinden gelir).
 */
async function externalReferrer(): Promise<string | null> {
  const referer = (await headers()).get('referer');
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname;
    const self = (await headers()).get('host')?.split(':')[0];
    return host && host !== self ? host : null;
  } catch {
    // Bozuk `referer` bir arıza değil, tarayıcının gönderdiği bir çöp — kaynak "bilinmiyor" kalır.
    return null;
  }
}
