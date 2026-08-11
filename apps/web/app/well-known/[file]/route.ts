import { NextResponse } from 'next/server';

/**
 * **Mobil uygulama ilişkilendirme dosyaları** (17.9) — `/.well-known/apple-app-site-association`
 * ve `/.well-known/assetlinks.json`.
 *
 * Davet bağlantısı bir web adresidir ve olması gereken de budur: uygulaması olmayan davetli onu
 * tarayıcıda açar. Uygulaması OLAN davetli ise bu iki dosya sayesinde doğrudan uygulamada açar —
 * işletim sistemi adresi alan adının sahibine sorar, cevabı burası verir.
 *
 * ── DEĞERLER ENV'DEN, ÇÜNKÜ HENÜZ YOKLAR ─────────────────────────────────────
 * iOS `TAKIM_KİMLİĞİ.paket.kimliği` ister (takım kimliği Apple hesabından), Android imzalayan
 * sertifikanın SHA-256 parmak izini ister (mağaza imzasından). İkisi de mağaza başvurusuyla
 * doğar; bugün ne biri var ne öteki.
 *
 * **Eksikken 404 dönüyor, uydurma bir dosya DEĞİL** — ve bu kural gereği: ölçülemeyen değer sıfır
 * değildir (CLAUDE §1). Yer tutuculu bir dosya yayımlamak daha kötüdür çünkü işletim sistemi
 * doğrulamayı bir kez yapar ve BAŞARISIZ sonucu uzun süre önbelleğe alır — gerçek değerler
 * geldiğinde bağlantı hâlâ tarayıcıda açılır ve sebebi bulunmayan bir arıza olur.
 *
 * **Yerelde de 404 ve bu doğru:** `localhost` bir alan adı değildir, ilişkilendirilemez. Davet
 * bağlantısı geliştirme ortamında tarayıcıda açılır — akışın web yarısı zaten orada sınanıyor.
 */

/** iOS: `TEAMID.com.lezzetanatolia.app`. Tek değer, çünkü tek uygulama var. */
const IOS_APP_ID = process.env.MOBILE_IOS_APP_ID;
/** Android paket adı — `app.config.ts` ile aynı olmalı; ilişkilendirme aksi hâlde kurulmaz. */
const ANDROID_PACKAGE = process.env.MOBILE_ANDROID_PACKAGE;
/** Android imza sertifikasının SHA-256 parmak izi (iki nokta ayraçlı, büyük harf). */
const ANDROID_FINGERPRINT = process.env.MOBILE_ANDROID_SHA256;

/**
 * Uygulamanın karşılayacağı yollar. **Davet TEK BAŞINA değil**: derin bağlantı bir kez kurulunca
 * ürün ve sipariş sayfaları da uygulamada açılmalı, yoksa müşteri aynı markanın iki farklı
 * davranışını görür. Liste dile göre değil, `*` ile: yol tablosu üç dilde üç ayrı segment
 * üretiyor ve burada onları tek tek saymak, `PATHNAMES` değiştiğinde sessizce eskiyen dördüncü
 * bir kopya olurdu.
 */
const DEEP_LINK_PATHS = ['*/parrainage/*', '*/einladung/*', '*/davet/*'];

function appleAssociation(appId: string): unknown {
  return {
    applinks: {
      details: [{ appID: appId, paths: DEEP_LINK_PATHS }],
    },
  };
}

function androidAssociation(pkg: string, fingerprint: string): unknown {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [fingerprint] },
    },
  ];
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }): Promise<NextResponse> {
  const { file } = await context.params;

  if (file === 'apple-app-site-association') {
    if (!IOS_APP_ID) return new NextResponse(null, { status: 404 });
    // Uzantısız servis edilir ve içerik türü YİNE de JSON olmalı: iOS uzantıya değil başlığa bakar.
    return NextResponse.json(appleAssociation(IOS_APP_ID), { headers: { 'content-type': 'application/json' } });
  }

  if (file === 'assetlinks.json') {
    if (!ANDROID_PACKAGE || !ANDROID_FINGERPRINT) return new NextResponse(null, { status: 404 });
    return NextResponse.json(androidAssociation(ANDROID_PACKAGE, ANDROID_FINGERPRINT));
  }

  return new NextResponse(null, { status: 404 });
}
