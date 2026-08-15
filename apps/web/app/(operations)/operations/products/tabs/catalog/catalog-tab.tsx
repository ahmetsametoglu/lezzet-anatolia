'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Table, type Column } from '@/components/operation/ui/table';
import { Toggle } from '@/components/operation/form/toggle';
import { FramedImage } from '@/components/media/framed-image';
import { ImageIcon } from '@/components/operation/ui/icons';
import { cropOf, IMAGE_ROLES, pickCropFields, resolveLocalizedText, type ImageRole } from '@lezzet/types';
import { slugify } from '@lezzet/helper';
import { FEATURED_SLOTS } from '@lezzet/types';
import { reorderCatalogAction, setCatalogFeaturedAction } from './actions';
import { CatalogFormDialog } from './catalog-form-dialog';
import { matchesCatalogFilter, type CatalogKind, type CatalogRow, type CollectionView } from '../../products-types';

// Katalog sekmesi — Kategoriler VE Koleksiyonlar. İkisi de aynı düz/sıralı desen (çok dilli ad · slug ·
// sortOrder · isActive + ürün sayısı): tek tablo, tek sıralama akışı, tek dialog; yalnız `kind` ve
// metinler ayrışır (no-duplication). Oluştur/düzenle dialogu bu modülün İÇİNDE — kabuk bilmez.

/** Koleksiyon satırı mı? Açıklama ve üyelik YALNIZ koleksiyonda vardır (kategoride bu alanlar yok). */
function isCollectionRow(r: CatalogRow): r is CollectionView {
  return 'productIds' in r;
}

function catalogStatus(r: CatalogRow): { label: string; tone: 'olive' | 'neutral' } {
  if (r.count === 0) return { label: 'Boş', tone: 'neutral' };
  return r.isActive ? { label: 'Aktif', tone: 'olive' } : { label: 'Pasif', tone: 'neutral' };
}

function catalogColumns(
  kind: CatalogKind,
  header: string,
  /** İyimser örtüyü de hesaba katan okuma — ham `r.isFeatured` DEĞİL (gerekçe `handleFeature`da). */
  isFeatured: (r: CatalogRow) => boolean,
  onFeature: (r: CatalogRow, next: boolean) => void,
): Column<CatalogRow>[] {
  // Satır görseli kaynağın ORANINDA gösterilir (kategori 3:2 · koleksiyon 16:9 bant) ve kaydın odak/
  // zoom künyesiyle kırpılır → operatör listede gerçekte ne göründüğünü görür.
  const role: ImageRole = kind === 'collection' ? 'collection' : 'category';
  return [
    {
      key: 'image',
      header: '',
      width: '82px',
      cell: (r) => (
        <div className="w-16">
          <FramedImage
            src={r.imageUrl}
            alt=""
            ratio={IMAGE_ROLES[role].ratio}
            crop={cropOf(r)}
            placeholder={<ImageIcon size={14} />}
            className="!rounded-[7px] border border-ops-line-strong"
          />
        </div>
      ),
    },
    {
      key: 'name',
      header,
      width: 'minmax(160px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{resolveLocalizedText(r.name)}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">slug: {r.slug}</span>
        </div>
      ),
    },
    { key: 'count', header: 'Ürün', width: '78px', align: 'right', cell: (r) => <span className="font-ops-mono text-ops-sm text-ops-body">{r.count}</span> },
    {
      key: 'featured',
      header: 'Vitrinde',
      width: '80px',
      align: 'right',
      // Satırın kendisi çift tıklamayla formu açıyor; anahtar o davranışı YUTMALI, yoksa vitrine
      // işaret koymak isteyen her tıklama diyaloğu da açardı.
      cell: (r) => (
        <span onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Toggle size="sm" on={isFeatured(r)} onChange={(next) => onFeature(r, next)} label="Vitrinde" />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      width: '90px',
      align: 'right',
      cell: (r) => {
        const st = catalogStatus(r);
        return <Badge tone={st.tone}>{st.label}</Badge>;
      },
    },
  ];
}


// Oluşturma etiketi burada DEĞİL: düğme sekme çubuğunda, kabukta yaşıyor (products.desktop).
// `filtered`: arama açıkken ipucu değişir, çünkü o hâlde sürükleme kapalıdır — "sürükle-sırala" yazan
// bir satırın altında sürüklenemeyen bir liste bırakmak sessiz bir yalan olurdu.
const CATALOG_COPY: Record<CatalogKind, { hint: string; filtered: string; empty: string }> = {
  category: {
    hint: 'Düz liste · iç içe yok · sürükle-sırala · düzenlemek için çift tıkla',
    filtered: 'Arama açık · sıralama için aramayı temizle · düzenlemek için çift tıkla',
    empty: 'Henüz kategori yok.',
  },
  collection: {
    hint: 'Esnek pazarlama grubu · bir ürün birçok koleksiyonda · slug = paylaşım linki',
    filtered: 'Arama açık · sıralama için aramayı temizle · düzenlemek için çift tıkla',
    empty: 'Henüz koleksiyon yok.',
  },
};

interface CatalogTabProps {
  kind: CatalogKind;
  rows: CatalogRow[];
  /** Üyelik bölmesi çizilsin mi — yalnız koleksiyonda. Ürün havuzu form içinde SUNUCUDAN aranır. */
  withMembers?: boolean;
  /** Sekme çubuğundaki arama terimi. Süzme BURADA (client): bu liste sayfalı değil, bütün geliyor. */
  filter: string;
  /**
   * Oluşturma diyalogu açık mı. NİYET kabuktan gelir (sekme çubuğundaki "+ Kategori"), DİYALOG burada
   * kalır: kabuk hangi formun açıldığını bilmez, sekme kendi formunu bilir.
   */
  creating: boolean;
  onCreateClose: () => void;
}

export function CatalogTab({ kind, rows, withMembers, filter, creating, onCreateClose }: CatalogTabProps) {
  const router = useRouter();
  const copy = CATALOG_COPY[kind];
  // Düzenlenen kayıt KİMLİKLE tutulur, verisi her render'da TAZE listeden türetilir (products-client'ın
  // `selectedId` deseni). Satır nesnesinin kopyası tutulursa dialog içindeki görsel yüklemesi
  // `router.refresh()` sonrası görünmez: sunucu verisi tazelenir ama elde eski nesne (imageUrl: null)
  // kalır ve yeni görsel yalnız sayfa yenilenince belirir.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId !== null ? (rows.find((r) => r.id === editingId) ?? null) : null;

  // İyimser sıra YALNIZ kimlik listesi olarak tutulur — satır VERİSİ asla aynalanmaz. Kopya tutulursa
  // yeni kayıt/güncelleme (revalidate + router.refresh) ekrana yansımaz: elde eski liste kalır.
  // Sunucudan taze veri gelince (rows referansı değişir) iyimser sıra bırakılır — gerçek sıra sunucuda.
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  useEffect(() => setOptimisticIds(null), [rows]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Bilinmeyen id atılır, iyimser listede OLMAYAN taze satırlar sona eklenir (yeni kayıt kaybolmasın).
  const displayed = optimisticIds
    ? [
        ...optimisticIds.map((id) => byId.get(id)).filter((r): r is CatalogRow => Boolean(r)),
        ...rows.filter((r) => !optimisticIds.includes(r.id)),
      ]
    : rows;

  // Arama SÜZGECİ en sonda uygulanır (iyimser sıranın üstüne): sıra gerçek listenin sırasıdır, süzgeç
  // yalnız ne göründüğünü değiştirir.
  const filtering = slugify(filter).length > 0;
  const visible = filtering ? displayed.filter((r) => matchesCatalogFilter(r, filter)) : displayed;

  const handleReorder = async (ids: string[]) => {
    setOptimisticIds(ids);
    const { error } = await reorderCatalogAction(kind, ids);
    if (error) setOptimisticIds(null); // başarısızsa sunucu sırasına dön
  };

  /**
   * Vitrin işareti (05.18) — **iyimser, ve iki kez ölçülerek buraya gelindi (08.08).**
   *
   * İlk hâlde küresel bir `featuring` kilidi vardı: süren bir yazım varken gelen tıklamayı
   * yutuyordu. Ekranda denendi — yedi kategoriye ard arda basıldı, ALTISI yazıldı; yedincisi
   * hiçbir iz bırakmadan düştü. Kilit kalktı.
   *
   * İkinci ölçümde yedisi de yazıldı ama **sayaç ekranda 5/6'da kaldı**: hızlı tıklamalarda
   * `router.refresh()` turları birbirini geçiyor ve son gelen render daha eski bir gerçeği
   * taşıyabiliyor. Sayaç kürasyonun okuduğu TEK sayıdır; bayat göstermesi operatöre sekizinciyi
   * işaretletir. O yüzden anahtarın ve sayacın kaynağı artık iyimser örtü: `rows` tazelenince
   * bırakılır (dosyanın kendi `optimisticIds` deseni), yani son söz yine sunucunun.
   *
   * **Başarısız yazım SESSİZ DÖNMEZ** — iyimser güncellemenin klasik tuzağı budur ve kapatıldı:
   * örtü geri alınır VE hata satırı yazılır. Sessiz geri dönüş, operatöre işaretlediğini
   * sandırırdı.
   */
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  useEffect(() => setPending(new Map()), [rows]);
  const [featureError, setFeatureError] = useState<string | null>(null);

  const handleFeature = async (row: CatalogRow, next: boolean) => {
    setFeatureError(null);
    setPending((prev) => new Map(prev).set(row.id, next));
    const { error } = await setCatalogFeaturedAction(kind, row.id, next);
    if (error) {
      setPending((prev) => {
        const copy = new Map(prev);
        copy.delete(row.id);
        return copy;
      });
      setFeatureError(error);
      return;
    }
    router.refresh();
  };

  const isFeatured = (r: CatalogRow) => pending.get(r.id) ?? r.isFeatured;

  const columns = catalogColumns(kind, kind === 'category' ? 'Kategori' : 'Koleksiyon', isFeatured, (r, next) => {
    void handleFeature(r, next);
  });

  // Sayaç TÜM listeden çıkar, süzülmüş görünenden değil: arama açıkken "vitrinde 2" yazması,
  // aramanın dışında kalan işaretlileri yok saymak olurdu.
  /**
   * **Sayaç "kaç tanesi VİTRİNDE GÖRÜNECEK" sorusunu cevaplar — "kaç tanesi işaretli"yi değil.**
   *
   * İki eksen ayrı (`isActive` = yayında mı · `isFeatured` = ana sayfada mı) ve işaret pasif bir
   * kayda da konabilir: kampanya hazırlanırken işaret önceden konur, yayına alınınca vitrine düşer.
   * Ama pasif kayıt ana sayfada ÇİZİLMEZ. İkisini tek sayıda toplasaydık "6/6 dolu" diyen bir
   * başlığın altında vitrinde dört kart olurdu ve operatör eksiği ancak müşteri sayfasına bakarak
   * görürdü.
   *
   * Pasif-işaretliler yok SAYILMIYOR, AYRI söyleniyor: sayı hiç oynamayınca operatör anahtarın
   * çalışmadığını sanardı.
   */
  const slots = FEATURED_SLOTS[kind];
  const featured = rows.filter((r) => isFeatured(r));
  const visibleCount = featured.filter((r) => r.isActive).length;
  const passiveCount = featured.length - visibleCount;
  const overflowing = visibleCount > slots;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Yalnız ipucu satırı — "+ Kategori" düğmesi sekme çubuğuna taşındı (kabuk). */}
      <div className="flex items-center gap-3 border-b border-ops-line-soft px-6 py-[11px]">
        <span className="font-ops-body text-ops-sm text-ops-muted">{filtering ? copy.filtered : copy.hint}</span>
        {/* Vitrin sayacı SAĞDA ve daima görünür: "kaç tanesi işaretli" sorusu kürasyonun tek
            sorusudur ve listeyi taramakla cevaplanmamalı. Aşım hâlinde amber — ama engel yok. */}
        <span
          className={`ml-auto flex-none font-ops-body text-ops-xs ${
            overflowing ? 'font-semibold text-ops-amber-dark' : 'text-ops-faint'
          }`}
        >
          {overflowing
            ? `Vitrinde ${visibleCount} işaretli — ana sayfada sıradan ilk ${slots} görünür`
            : `Vitrinde ${visibleCount}/${slots}`}
          {passiveCount > 0 ? ` · ${passiveCount} işaretli kayıt pasif, vitrine çıkmaz` : ''}
        </span>
      </div>
      {/* Yazılamayan işaret GÖRÜNÜR: anahtar iyimser döndüğü için hata söylenmezse operatör
          işaretlediğini sanır ve vitrin sessizce eksik kalır. */}
      {featureError ? (
        <p className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2 font-ops-body text-ops-sm text-ops-red">
          Vitrin işareti yazılamadı: {featureError}
        </p>
      ) : null}
      <Table
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        // Süzgeç açıkken sürükleme KAPALI: görünen alt kümeyi taşımak, sunucuya listenin tamamı
        // sanılan yanlış bir sıra yazardı (gizli satırlar sıradan düşerdi).
        onReorder={filtering ? undefined : handleReorder}
        onRowDoubleClick={(r) => setEditingId(r.id)}
        empty={
          <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-ops-base text-ops-faint">
            {filtering ? 'Bu aramada kayıt yok.' : copy.empty}
          </div>
        }
      />

      {creating ? <CatalogFormDialog kind={kind} withMembers={withMembers} onClose={onCreateClose} /> : null}
      {editing ? (
        <CatalogFormDialog
          kind={kind}
          withMembers={withMembers}
          edit={{
            id: editing.id,
            name: editing.name,
            slug: editing.slug,
            isActive: editing.isActive,
            // İyimser örtüden okunuyor: satırdaki anahtarı çevirip hemen formu açan operatör,
            // sunucu turu bitmemişse eski hâli görürdü.
            isFeatured: isFeatured(editing),
            // Görsel künyesi İKİ türde de var (kategori görseli + koleksiyon OG kapağı).
            imageUrl: editing.imageUrl,
            ...pickCropFields(editing),
            // İkinci metin alanı türe göre: koleksiyonda açıklama, kategoride alt yazı (05.17).
            description: isCollectionRow(editing) ? editing.description : null,
            productIds: isCollectionRow(editing) ? editing.productIds : [],
            tagline: isCollectionRow(editing) ? null : editing.tagline,
          }}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}
