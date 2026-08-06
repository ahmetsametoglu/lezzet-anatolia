import { ErrorLogService, SystemHealthService, UserProfileService, serviceDb } from '@lezzet/database';
import { guarded, requireAdmin } from '@/lib/guard';
import { SystemClient } from './system-client';
import { ageMinutesOf, toErrorRows, toHealthView, toTrendCharts, windowCutoff } from './system-read';
import { ERROR_PAGE_SIZE, parseSystemUrl } from './system-url';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';

// Sistem — sağlık ve hatalar (18.5). YALNIZ admin.
//
// **Bu ekran bir alarmın yerini tutuyor.** Kritik hatada e-posta/itme bildirimi gönderilmiyor
// (kullanıcı kararı, `OBSERVABILITY §4.1`): buraya bakılmazsa hiçbir yerden haber gelmiyor. Tasarımın
// birinci işi bu yüzden estetik değil — kötü durum, bakmayan gözü yakalayacak kadar yüksek sesle
// görünmeli. Kabuğun ilk öğesi hüküm şeridi, listenin içinde saklı bir satır değil.
//
// **TEK ekran, iki panel** (`OBSERVABILITY §4.4`): sağlık ve hatalar aynı soruyu yanıtlıyor — "her
// şey yolunda mı?". İkiye bölmek, alarmın olmadığı bir kurulumda bakılması gereken yer sayısını ikiye
// çıkarırdı; bakılmayan ikinci ekran, olmayan ekrandır.
//
// **Sayfalama, sonsuz kaydırma değil** (bilinçli sapma — CLAUDE.md §1 varsayılanı keyset der):
// `error_log` hacimle değil HATA TÜRÜ sayısıyla büyüyor (aynı parmak izi tek satır, `count++`) ve
// çözülmüşler 90 günde süpürülüyor — kümenin doğal bir tavanı var. Üstelik sıra `lastSeenAt`'e göre
// ve o damga sürekli oynuyor; imleçli bir listede aynı satır iki sayfada birden görünürdü.

interface SystemPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SystemPage({ searchParams }: SystemPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) return <NoAccessPane title="Sistem" reason="Sunucu metrikleri, süreç durumları ve hata kayıtları operasyonun geri kalanına kapalıdır. Bir arıza olduğunu düşünüyorsanız yöneticinize iletin." />;

  const urlState = parseSystemUrl(await searchParams);
  const db = serviceDb();
  const health = new SystemHealthService(db);
  const errors = new ErrorLogService(db);
  // Zaman TEK yerde okunur: yaş, kesme noktası ve satır yaşları aynı ana göre hesaplansın. İki ayrı
  // `Date.now()` arasında geçen milisaniyeler "0 dk önce" ile "1 dk önce" farkını doğurabiliyor.
  const now = Date.now();

  const [snapshot, trendPoints, page, counts, firstError] = await Promise.all([
    health.latest(),
    health.trendSince(windowCutoff(urlState.win, now)),
    errors.listRecent({
      resolved: urlState.tab === 'cozulmus',
      search: urlState.q || undefined,
      limit: ERROR_PAGE_SIZE,
      offset: urlState.page * ERROR_PAGE_SIZE,
    }),
    errors.statusCounts(urlState.q || undefined),
    errors.oldest(),
  ]);

  // Regresyon geçmişi İKİNCİ turda okunur çünkü SAYFANIN parmak izlerine bağlı: aynı izin daha önce
  // kapatılmış satırı var mı? Satır başına sorgu açmak N+1 olurdu; sayfa geldikten sonra tek tur.
  const resolvedHistory = await errors.resolvedHistoryOf(page.rows.map((r) => r.fingerprint));

  // İsimler ÜÇÜNCÜ turda ve TEK sorguda: hem sayfadaki kapanışları hem geçmiştekileri yapan personel.
  // İkiye bölünseydi aynı tabloya iki kez gidilirdi ve kesişen kimlikler iki kez okunurdu.
  const staffIds = [...new Set([...page.rows, ...resolvedHistory].map((r) => r.resolvedBy).filter((v): v is string => v !== null))];
  const staff = staffIds.length ? await new UserProfileService(db).listByIds(staffIds) : [];
  const names = new Map(staff.map((p) => [p.id, p.name]));

  const trend = toTrendCharts(trendPoints, urlState.win);

  return (
    <SystemClient
      data={{
        health: toHealthView(snapshot, now),
        charts: trend.charts,
        trendEmpty: trend.empty,
        errors: toErrorRows(page.rows, resolvedHistory, names),
        errorTotal: page.total,
        counts,
        loggingSince: firstError?.firstSeenAt ?? null,
      }}
      // Yaş SUNUCUDA hesaplanıp geçiyor: istemcide `Date.now()` ile yeniden hesaplansaydı ilk boyama
      // sunucununkinden farklı çıkar ve hidrasyon uyuşmazlığı doğardı. İstemci bu sayıyı ilerletir.
      serverAgeMinutes={snapshot ? ageMinutesOf(snapshot.createdAt, now) : null}
      urlState={urlState}
    />
  );
}

