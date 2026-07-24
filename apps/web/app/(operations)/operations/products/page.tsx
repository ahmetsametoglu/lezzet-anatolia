import { CategoryService, ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { Badge } from '@/components/operation/badge';
import { Button } from '@/components/operation/button';
import { Card } from '@/components/operation/card';
import { PackageIcon, PlusIcon, SearchIcon } from '@/components/operation/icons';
import { Table, type Column } from '@/components/operation/table';

// Admin katalog yönetimi — Ürünler (Envanter O1 sidebar + O4 tablo + O6 rozet). Servis katmanının
// (ProductService/CategoryService) ilk gerçek tüketicisi; uçtan uca doğrulama. Seçili-ürün paneli,
// oluştur/düzenle dialogu (O9), sekmeler ve mobil kabuk sonraki dilimlerde.

type Status = 'active' | 'passive' | 'candidate';

interface ProductRow {
  id: string;
  name: string;
  category: string;
  variantCount: number;
  langs: string[];
  status: Status;
}

// LocalizedText içinde dolu dilleri (üst dizide) verir — "hangi diller dolu" göstergesi.
function filledLangs(text: LocalizedText): string[] {
  const langs: string[] = [];
  if (text.tr) langs.push('TR');
  if (text.fr) langs.push('FR');
  if (text.de) langs.push('DE');
  return langs;
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'candidate') return <Badge tone="blue" dot>Aday</Badge>;
  if (status === 'passive') return <Badge tone="neutral" dot>Pasif</Badge>;
  return <Badge tone="olive" dot>Aktif</Badge>;
}

function LangBadge({ langs }: { langs: string[] }) {
  if (langs.length === 0) return <Badge tone="amber">—</Badge>;
  return <Badge tone={langs.length === 3 ? 'olive' : 'amber'}>{langs.join('·')}</Badge>;
}

function EmptyState() {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-ops-card border border-dashed border-ops-line-strong bg-ops-card p-10 text-center text-ops-faint">
      <PackageIcon />
      <span className="font-ops-display text-[17px] font-semibold text-ops-ink">Henüz ürün yok</span>
      <span className="font-ops-body text-[13px] text-ops-body">
        Kataloğa ilk ürünü ekleyerek başlayın. Ürün ekleme akışı (oluştur dialogu) sonraki dilimde bağlanacak.
      </span>
    </div>
  );
}

// Tablo kolonları — O4 deseni: sol ada/kategori (esner), ortada/sağda sayı ve rozetler.
const COLUMNS: Column<ProductRow>[] = [
  {
    key: 'name',
    header: 'Ürün',
    width: 'minmax(120px,1fr)',
    cell: (r) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-ops-body text-[13px] font-semibold text-ops-ink">{r.name}</span>
        <span className="font-ops-body text-[11px] text-ops-muted">{r.category}</span>
      </div>
    ),
  },
  {
    key: 'variants',
    header: 'Varyant',
    width: '64px',
    align: 'center',
    cell: (r) => <span className="font-ops-mono text-[12.5px] text-ops-strong">{r.variantCount}</span>,
  },
  { key: 'langs', header: 'Diller', width: '82px', align: 'center', cell: (r) => <LangBadge langs={r.langs} /> },
  { key: 'status', header: 'Durum', width: '84px', align: 'right', cell: (r) => <StatusBadge status={r.status} /> },
];

export default async function ProductsPage() {
  const db = serviceDb();
  const [products, categories] = await Promise.all([new ProductService(db).listAll(), new CategoryService(db).list()]);

  const variantSvc = new ProductVariantService(db);
  const categoryName = new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)]));

  const rows: ProductRow[] = await Promise.all(
    products.map(async (p) => {
      const variants = await variantSvc.listByProduct(p.id);
      return {
        id: p.id,
        name: resolveLocalizedText(p.name),
        category: p.categoryId ? (categoryName.get(p.categoryId) ?? '—') : '—',
        variantCount: variants.length,
        langs: filledLangs(p.name),
        status: p.isCandidate ? 'candidate' : p.isActive ? 'active' : 'passive',
      };
    }),
  );

  const candidateCount = rows.filter((r) => r.status === 'candidate').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Başlık barı (sabit) */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <div className="mr-auto flex flex-col gap-0.5">
          <h1 className="font-ops-display text-[22px] font-semibold text-ops-ink">Ürünler</h1>
          <span className="font-ops-body text-xs text-ops-muted">
            {rows.length} ürün · {candidateCount} aday
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-mono text-[12.5px] text-ops-strong">
          <SearchIcon />
          Ara
        </span>
        <Button variant="dark">
          <PlusIcon />
          Ürün
        </Button>
      </header>

      {/* İçerik */}
      <div className="min-h-0 flex-1 p-6">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Card className="flex h-full flex-col">
            <Table columns={COLUMNS} rows={rows} rowKey={(r) => r.id} />
          </Card>
        )}
      </div>
    </div>
  );
}
