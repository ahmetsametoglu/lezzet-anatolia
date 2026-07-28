'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Table, type Column } from '@/components/operation/ui/table';
import { money, percent, shortDate } from '@/components/operation/ui/format';
import type { CustomerPriceRow, PricesViewProps } from '../prices-types';

// Müşteriye özel fiyatlar + genel indirim oranları.
//
// İkisi AYNI sekmede, çünkü fiyat çözümünde arka arkaya gelen iki basamaktır: önce özel fiyat, sonra
// indirim oranı, sonra kanal listesi. Ayrı ekranlara bölünseydi "bu müşteri neden bu fiyatı ödüyor"
// sorusu iki ekran gezmeden yanıtlanamazdı.
//
// Liste SAYFALANMAZ: küme veriyle değil admin'in eliyle büyür (her satır ayrı bir pazarlık).

export function CustomersTab({ data }: PricesViewProps) {
  const columns: Column<CustomerPriceRow>[] = [
    {
      key: 'customer',
      header: 'Müşteri',
      width: 'minmax(140px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.customerName}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {r.isCompany ? 'B2B' : 'B2C'} · {shortDate(r.validFrom)}'den beri
          </span>
        </div>
      ),
    },
    {
      key: 'variant',
      header: 'Varyant',
      width: 'minmax(140px,1fr)',
      cell: (r) => <span className="truncate font-ops-body text-ops-sm text-ops-body">{r.variantTitle}</span>,
    },
    {
      key: 'channel',
      header: 'Kanal',
      width: '68px',
      cell: (r) => <Badge tone={r.channel === 'b2b' ? 'blue' : 'neutral'}>{r.channel === 'b2b' ? 'B2B' : 'B2C'}</Badge>,
    },
    {
      key: 'special',
      header: 'Özel',
      width: '86px',
      align: 'right',
      cell: (r) => (
        <span className="font-ops-mono text-ops-base font-semibold text-ops-olive-dark">{money(r.specialCents)}</span>
      ),
    },
    {
      key: 'list',
      header: 'Liste',
      width: '86px',
      align: 'right',
      cell: (r) => (
        // Liste fiyatı ÜSTÜ ÇİZİLİ: özel fiyatın neyin yerine geçtiği tek bakışta okunur. Liste yoksa
        // tire — "özel fiyat var ama kanal fiyatı yok" gerçek bir durumdur ve gizlenmemeli.
        <span
          className={`font-ops-mono text-ops-sm ${r.listCents === null ? 'text-ops-faint' : 'text-ops-faint line-through'}`}
          title={r.listCents === null ? 'Bu kanalda liste fiyatı girilmemiş' : 'Kanalın liste fiyatı'}
        >
          {money(r.listCents)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Çözüm sırası şeridi (tasarım): kural ekranda YAZILI dursun — "özel fiyat mı indirim mi kazandı"
          sorusu, fiyatı açıklarken en sık sorulan şey. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line bg-ops-subtle px-6 py-2.5">
        <span className="mr-1 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Fiyat çözüm sırası
        </span>
        <Step order={1} label="Müşteriye özel fiyat" note={`${data.customerPrices.length} tanımlı`} active />
        <Step order={2} label="Müşteri indirim oranı" note={`${data.discountCustomers.length} müşteride`} />
        <Step order={3} label="Kanal liste fiyatı" note="taban" />
      </div>

      <Table
        columns={columns}
        rows={data.customerPrices}
        rowKey={(r) => r.priceId}
        empty={
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Özel fiyat tanımlı değil</span>
            <span className="max-w-[440px] text-center font-ops-body text-ops-sm leading-relaxed text-ops-muted">
              Herkes kanal liste fiyatından alıyor. Sürekli aynı pazarlığı yaptığınız müşteri için kalıcı özel
              fiyat doğru araçtır; tek seferlik pazarlık siparişin kendi işidir.
            </span>
          </div>
        }
        footer={<DiscountStrip rows={data.discountCustomers} />}
      />
    </div>
  );
}

interface StepProps {
  order: number;
  label: string;
  note: string;
  active?: boolean;
}

function Step({ order, label, note, active = false }: StepProps) {
  return (
    <span
      className={`flex items-center gap-2 rounded-ops-btn border px-[11px] py-[5px] ${
        active ? 'border-ops-olive-line bg-ops-olive-bg' : 'border-ops-line bg-ops-white'
      }`}
    >
      <span className={`font-ops-mono text-ops-xs font-semibold ${active ? 'text-ops-olive-dark' : 'text-ops-muted'}`}>
        {order}
      </span>
      <span className="font-ops-body text-ops-xs font-medium text-ops-ink">{label}</span>
      <span className="font-ops-body text-ops-micro text-ops-muted">{note}</span>
    </span>
  );
}

/**
 * Genel indirim oranı taşıyan müşteriler — tablonun altında bir şerit. Oran BURADA YAZILMAZ: sahibi
 * müşteri kaydıdır (`user_profiles.discount_percent`), fiyat ekranı yalnız kimlerde olduğunu izler.
 * Yazma yeri iki olsaydı hangisinin kazandığı belirsizleşirdi.
 */
function DiscountStrip({ rows }: { rows: PricesViewProps['data']['discountCustomers'] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ops-line bg-ops-subtle px-6 py-3">
      <span className="mr-1 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        Genel indirim oranı
      </span>
      {rows.map((r) => (
        <span
          key={r.customerId}
          className="rounded-ops-btn border border-ops-line bg-ops-white px-[11px] py-[5px] font-ops-body text-ops-xs font-medium text-ops-ink"
          title="Oran müşteri kaydında tutulur — buradan değiştirilmez"
        >
          {r.customerName} · <strong className="font-ops-mono text-ops-olive-dark">{percent(r.discountPercent)}</strong>
        </span>
      ))}
    </div>
  );
}
