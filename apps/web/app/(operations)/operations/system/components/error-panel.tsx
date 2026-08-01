'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Card } from '@/components/operation/ui/card';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { Tabs } from '@/components/operation/ui/tabs';
import { shortDate, shortDateTime } from '@/components/operation/ui/format';
import { ERROR_COLUMN_TRACKS } from '../system-columns';
import { ERROR_PAGE_SIZE, type ErrorTab } from '../system-url';
import type { ErrorRowView, SystemData } from '../system-types';
import { ErrorMetaGrid, LevelBadge, LevelDot, RegressionChip, RegressionNote, ResolvedChip } from './error-meta';
import { Segmented } from './segmented';
import { CopyButton, StackBlock } from './stack-block';

/**
 * O23 · Hata kaydı + O25 · geniş inceleme yüzeyi (18.5).
 *
 * **Satır = hata TÜRÜ, olay değil.** 212 kez olan hata tek satırdır ve sayacı 212'dir; gruplama
 * `fingerprint` ile yapılıyor (`OBSERVABILITY §2`). Gruplanmasa liste kendi kendini gömerdi ve
 * içindeki tek yeni hata görünmezdi.
 *
 * **Sıra SON GÖRÜLMEYE göre, seviyeye göre değil:** taze bir uyarı, üç gün önceki bir hatadan daha
 * çok şey söyler. Sayı ile son görülme birlikte anlam kazanır — 400 kez görülmüş ama son görülme üç
 * gün önceyse sorun bitmiş olabilir.
 *
 * **Tek aksiyon "Çözüldü", silme YOK.** Kayıt kalır, yalnız odaktan çıkar; süpürme saklama süresinin
 * işidir. Aynı hata sonra gelirse yeni satır açılır ve "geri geldi" der.
 *
 * **İki görünüm, tek durum:** Liste (tarama) ve İnceleme (okuma). Süzgeç, sekme ve sayfalama ikisinde
 * de aynı — yeni ekran açılmaz, bakılması gereken yer hâlâ tek.
 */

type PanelView = 'liste' | 'inceleme';

interface ErrorPanelProps {
  data: SystemData;
  tab: ErrorTab;
  onTab: (tab: ErrorTab) => void;
  search: string;
  onSearch: (q: string) => void;
  page: number;
  onPage: (page: number) => void;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onResolve: (id: string) => void;
  resolving: string | null;
  resolveError: string | null;
}

function errorColumns(onResolve: (id: string) => void, resolving: string | null): Column<ErrorRowView>[] {
  return withCells<ErrorRowView>(ERROR_COLUMN_TRACKS, {
    error: (r) => (
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="flex flex-wrap items-center gap-2">
          <LevelBadge level={r.level} />
          {r.regression ? <RegressionChip /> : null}
          {r.resolvedAt ? <ResolvedChip at={r.resolvedAt} by={r.resolvedByName} /> : null}
        </span>
        <span className={`font-ops-body text-ops-base font-medium leading-[1.45] ${r.level === 'fatal' ? 'text-ops-red-dark' : 'text-ops-ink'}`}>
          {r.message}
        </span>
        {r.regression ? (
          <span className="font-ops-body text-ops-xs text-ops-amber-dark">
            {shortDate(r.regression.resolvedAt)} tarihinde çözülmüştü; yeniden geldi.
          </span>
        ) : null}
        {r.path ? <span className="truncate font-ops-mono text-ops-micro text-ops-muted">{r.path}</span> : null}
      </span>
    ),
    source: (r) => <span className="truncate font-ops-mono text-ops-xs text-ops-body">{r.source}</span>,
    count: (r) => (
      <span
        className={`font-ops-mono text-ops-base font-semibold ${
          r.count >= 100 ? 'text-ops-red-dark' : r.count >= 20 ? 'text-ops-amber-dark' : 'text-ops-body'
        }`}
      >
        {r.count.toLocaleString('tr-TR')}
      </span>
    ),
    // MUTLAK zaman, göreli değil (tasarım). Göreli süre "son 3 gün önce" der ve iki hatayı
    // karşılaştırırken hangisinin önce geldiğini söyleyemez; teşhiste sorulan soru genelde "hangi
    // dağıtımdan sonra başladı" ve onun cevabı bir tarih.
    seen: (r) => (
      <span className="flex flex-col gap-0.5">
        <span className={`font-ops-mono text-ops-xs font-medium ${r.level === 'fatal' ? 'text-ops-red-dark' : 'text-ops-strong'}`}>
          son {shortDateTime(r.lastSeenAt)}
        </span>
        <span className="font-ops-mono text-ops-micro text-ops-faint">ilk {shortDateTime(r.firstSeenAt)}</span>
      </span>
    ),
    action: (r) =>
      r.resolvedAt ? (
        // Çözülmüş satırda düğme YOK ama satır boş da kalmaz: "kayıt kalır" cümlesi, silme olmadığını
        // her bakışta tekrar söyler.
        <span className="font-ops-mono text-ops-xs text-ops-muted">kayıt kalır</span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={resolving === r.id}
          onClick={(e) => {
            // Satır tıklaması detayı AÇAR; düğme kararı verir. Yayılım kesilmezse "çözüldü" demek
            // aynı anda diyaloğu da açardı.
            e.stopPropagation();
            onResolve(r.id);
          }}
          className="whitespace-nowrap px-2.5 py-1.5 text-ops-xs"
        >
          {resolving === r.id ? '…' : 'Çözüldü'}
        </Button>
      ),
  });
}

export function ErrorPanel(props: ErrorPanelProps) {
  const { data, tab, onTab, search, onSearch, page, onPage, busy } = props;
  const { selectedId, onSelect, onOpen, onResolve, resolving, resolveError } = props;
  const [view, setView] = useState<PanelView>('liste');

  const sayfaAdedi = Math.max(1, Math.ceil(data.errorTotal / ERROR_PAGE_SIZE));
  const bos = data.errors.length === 0;

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3.5 px-[22px] py-4">
        <div className="mr-auto flex flex-col gap-0.5">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Hatalar</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Satır = hata türü, olay değil. Sıra son görülmeye göre — seviyeye göre değil.
          </span>
        </div>
        <Segmented
          label="Hata görünümü"
          value={view}
          onChange={setView}
          items={[
            { value: 'liste' as PanelView, label: 'Liste' },
            { value: 'inceleme' as PanelView, label: 'İnceleme' },
          ]}
        />
        <SearchInput value={search} onChange={onSearch} placeholder="mesaj · kaynak · yol ara…" className="w-[250px]" />
      </div>

      <Tabs
        items={[
          // "Açık" sayacı ROZET: senden bir şey bekleniyor demek. "Çözülmüş" yalnız kapsam sayısı.
          { key: 'acik' as ErrorTab, label: 'Açık', badge: data.counts.open },
          { key: 'cozulmus' as ErrorTab, label: 'Çözülmüş', count: data.counts.resolved },
        ]}
        active={tab}
        onSelect={onTab}
      />

      {resolveError ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-[22px] py-2.5 font-ops-body text-ops-sm text-ops-red-dark">
          {resolveError}
        </div>
      ) : null}

      {view === 'inceleme' && !bos ? (
        <ErrorInspector
          rows={data.errors}
          selectedId={selectedId}
          onSelect={onSelect}
          onResolve={onResolve}
          resolving={resolving}
          total={data.errorTotal}
        />
      ) : (
        <Table
          busy={busy}
          busyRows={6}
          columns={errorColumns(onResolve, resolving)}
          rows={data.errors}
          rowKey={(r) => r.id}
          onRowClick={(r) => onOpen(r.id)}
          isRowActive={(r) => r.id === selectedId}
          empty={<ErrorEmpty data={data} tab={tab} search={search} />}
        />
      )}

      {data.errorTotal > 0 ? (
        <Pagination page={page} pages={sayfaAdedi} total={data.errorTotal} onPage={onPage} busy={busy} />
      ) : null}
    </Card>
  );
}

/**
 * Boş hâl DÖRT ayrı metin taşır ve bu bir incelik değil zorunluluk: "hata yok" ile "kayıt yeni
 * başladı" aynı görünürse, dört saatlik bir sessizlik sistemin sağlam olduğuna dair kanıt sanılır.
 */
function ErrorEmpty({ data, tab, search }: { data: SystemData; tab: ErrorTab; search: string }) {
  const yeniKayit =
    data.loggingSince !== null && Date.parse(data.loggingSince) > Date.now() - 24 * 60 * 60 * 1000;

  const icerik = search
    ? {
        title: 'Aramaya uyan kayıt yok',
        body: `“${search}” için mesaj, kaynak ve yol alanlarında eşleşme bulunamadı. Arama kutusunu temizleyip listeye dönebilirsiniz.`,
        meta: `${tab === 'acik' ? data.counts.open : data.counts.resolved} kayıt gizlendi`,
        tone: 'neutral' as const,
      }
    : tab === 'cozulmus'
      ? {
          title: 'Çözüldü işaretlenmiş kayıt yok',
          body: 'Bir hatayı kapattığınızda burada, kimin kapattığıyla birlikte durur. Silinmez.',
          // 90 gün — `OBSERVABILITY §4.2`. Tasarımın taslağında 30 yazıyordu; kararımız 90 ve kod haklı.
          meta: 'saklama süresi 90 gün',
          tone: 'ok' as const,
        }
      : data.loggingSince === null
        ? {
            title: 'Hata kaydı henüz hiç yazılmadı',
            body: 'Tablo boş: ya sistem hiç hata üretmedi ya kayıt akışı hiç başlamadı. Backend çalışmıyorsa ikincisi geçerlidir — sessizlik burada bilgi taşımaz.',
            meta: 'ilk kayıt bekleniyor',
            tone: 'new' as const,
          }
        : yeniKayit
          ? {
              title: 'Kayıt yeni başladı',
              body: 'Şu an açık hata yok, ama bu “sistem sağlam” demek için yeterli süre değil — ilk tam gün dolmadan sessizlik bilgi taşımaz.',
              meta: `kayıt başlangıcı: ${shortDateTime(data.loggingSince)}`,
              tone: 'new' as const,
            }
          : {
              title: 'Açık hata yok',
              body: 'Sessizlik burada bilgi: kayıt kesintisiz tutuluyor ve çözülmemiş hiçbir hata türü kalmadı.',
              meta: `kayıt başlangıcı: ${shortDate(data.loggingSince)} · ${data.counts.resolved} kayıt arşivde`,
              tone: 'ok' as const,
            };

  const ton =
    icerik.tone === 'ok'
      ? 'bg-ops-olive-bg text-ops-olive-dark'
      : icerik.tone === 'new'
        ? 'bg-ops-blue-bg text-ops-blue'
        : 'bg-ops-gray-100 text-ops-body';

  return (
    <div className="flex flex-col items-center gap-2.5 px-[22px] py-[34px] text-center">
      <span className={`grid h-[42px] w-[42px] place-items-center rounded-[11px] ${ton}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icerik.tone === 'ok' ? (
            <path d="M20 6 9 17l-5-5" />
          ) : icerik.tone === 'new' ? (
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l3 2" />
            </>
          ) : (
            <>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </>
          )}
        </svg>
      </span>
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{icerik.title}</span>
      <span className="max-w-[440px] font-ops-body text-ops-sm leading-[1.6] text-ops-body">{icerik.body}</span>
      <span className="font-ops-mono text-ops-xs font-medium text-ops-muted">{icerik.meta}</span>
    </div>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPage,
  busy,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
  busy: boolean;
}) {
  const ilk = page * ERROR_PAGE_SIZE + 1;
  const son = Math.min(total, (page + 1) * ERROR_PAGE_SIZE);
  return (
    <div className="flex items-center gap-3 border-t border-ops-line bg-ops-subtle px-[22px] py-3">
      <span className="mr-auto font-ops-mono text-ops-xs font-medium text-ops-body">
        {ilk}–{son} / {total} kayıt · sayfa {page + 1}/{pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page === 0 || busy} onClick={() => onPage(page - 1)}>
        ← Önceki
      </Button>
      <Button size="sm" variant="secondary" disabled={page >= pages - 1 || busy} onClick={() => onPage(page + 1)}>
        Sonraki →
      </Button>
    </div>
  );
}

/**
 * O25 · Geniş hata inceleme yüzeyi — solda 352px liste, sağda tam genişlikte okuma sütunu.
 *
 * Stack okumak dar satır işi değil: dialog her hatada açılıp kapanıyor ve iki hatayı karşılaştırmak
 * imkânsız hâle geliyordu. Burada seçim solda kalır, okuma sağda büyür — yeni ekran açılmaz.
 */
function ErrorInspector({
  rows,
  selectedId,
  onSelect,
  onResolve,
  resolving,
  total,
}: {
  rows: ErrorRowView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResolve: (id: string) => void;
  resolving: string | null;
  total: number;
}) {
  // Seçim listeden TÜRETİLİR: sayfa değişince eski seçim kaybolur ve ilk satır okunur. Kopya
  // tutulsaydı sağdaki sütun, solda artık olmayan bir hatayı gösterirdi.
  const sel = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  if (!sel) return null;

  return (
    <div className="flex min-h-[560px] flex-wrap items-stretch">
      <div className="flex min-w-[264px] max-w-[352px] flex-1 basis-[296px] flex-col border-b border-r border-ops-line bg-ops-card">
        <div className="flex items-center gap-2 border-b border-ops-line bg-ops-subtle px-4 py-2.5">
          <span className="mr-auto font-ops-display text-[10px] font-semibold uppercase tracking-[0.09em] text-ops-muted">Hata türü</span>
          <span className="font-ops-mono text-[10.5px] font-medium text-ops-muted">{total} kayıt</span>
        </div>
        <div className="flex max-h-[620px] flex-col overflow-y-auto">
          {rows.map((r) => {
            const on = r.id === sel.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                className={[
                  'flex cursor-pointer flex-col gap-1.5 border-b border-l-2 border-ops-line-soft px-3.5 py-3 text-left transition-colors',
                  on ? 'border-l-ops-olive bg-ops-gray-100' : 'border-l-transparent hover:bg-ops-subtle',
                ].join(' ')}
              >
                <span className="flex items-center gap-[7px]">
                  <LevelDot level={r.level} />
                  <span className="font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ops-body">{r.level}</span>
                  {r.regression ? <RegressionChip /> : null}
                  <span
                    className={`ml-auto font-ops-mono text-ops-micro font-semibold ${
                      r.count >= 100 ? 'text-ops-red-dark' : r.count >= 20 ? 'text-ops-amber-dark' : 'text-ops-body'
                    }`}
                  >
                    {r.count.toLocaleString('tr-TR')}×
                  </span>
                </span>
                <span className={`font-ops-body text-ops-sm font-medium leading-[1.45] ${r.level === 'fatal' ? 'text-ops-red-dark' : 'text-ops-ink'}`}>
                  {r.message}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-ops-mono text-[10.5px] text-ops-muted">
                    {r.source}
                    {r.path ? ` · ${r.path}` : ''}
                  </span>
                  <span className="flex-none font-ops-mono text-[10.5px] font-medium text-ops-strong">{shortDateTime(r.lastSeenAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-[6] basis-[460px] flex-col gap-4 px-6 py-5">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={sel.level} />
            <span className="font-ops-mono text-ops-xs text-ops-body">{sel.source}</span>
            {sel.path ? <span className="font-ops-mono text-ops-xs text-ops-muted">{sel.path}</span> : null}
            {sel.resolvedAt ? <ResolvedChip at={sel.resolvedAt} by={sel.resolvedByName} /> : null}
          </div>
          <span className={`font-ops-display text-[19px] font-semibold leading-[1.35] ${sel.level === 'fatal' ? 'text-ops-red-dark' : 'text-ops-ink'}`}>
            {sel.message}
          </span>
        </div>

        <RegressionNote row={sel} />
        <ErrorMetaGrid row={sel} />

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Stack</span>
            <span className="font-ops-body text-ops-micro text-ops-faint">satır kırılmaz — iki eksende kaydırılır</span>
            <CopyButton text={sel.stack ?? ''} label="Stack’i kopyala" />
          </div>
          <StackBlock stack={sel.stack} size="wide" />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-ops-line-soft pt-3.5">
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {sel.resolvedAt
              ? 'Kayıt kalır, yalnız odaktan çıkar — silme yok.'
              : 'Bağlamda kimlik var, içerik yok: sipariş numarası görünür, müşteri verisi görünmez.'}
          </span>
          {!sel.resolvedAt ? (
            <Button variant="primary" disabled={resolving === sel.id} onClick={() => onResolve(sel.id)}>
              {resolving === sel.id ? 'İşaretleniyor…' : 'Çözüldü'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
