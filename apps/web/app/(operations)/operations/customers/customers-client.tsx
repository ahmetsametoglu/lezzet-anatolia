'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerType } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import type { OrderSummaryView } from '@/lib/order/summary';
import {
  loadMoreCustomersAction,
  readCustomerDetailAction,
  readOrderSummaryAction,
  setCustomerCreditAction,
  updateCustomerAction,
} from './actions';
import { CreditDialog } from './components/credit-dialog';
import { CustomerEditDialog } from './components/customer-edit-dialog';
import { OrderDialog } from './components/order-dialog';
import { CustomersDesktop } from './customers.desktop';
import { CustomersMobile } from './customers.mobile';
import { customersUrl, type CustomerScope, type CustomersUrlState } from './customers-url';
import type { CreditFormInput, CustomerDetail, CustomerEditInput, CustomerRow, CustomersData } from './customers-types';

// Müşteri ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
//
// SÜZGEÇ AKIŞI: süzgeç bir client durumu DEĞİL, URL durumudur — kullanıcı değiştirince URL yazılır →
// RSC yeniden okur → süzülmüş İLK SAYFA gelir. **Burada client-side filtreleme YOK** ve bu, fiyat/stok
// ekranlarının 09.17'de teşhis edilen hatasından bilinçli sapma: orada client süzgeci `router.replace`
// ile yazılıyor ve yüklenmiş sayfaları siliyor. Buradaki her süzgeç bir KOLON, yani sunucuya ait.

/** Arama kutusunun URL'e yazılma gecikmesi (ms) — yazarken her tuşta sunucuya gidilmesin. */
const SEARCH_DEBOUNCE_MS = 350;

interface CustomersClientProps {
  data: CustomersData;
  device: Device;
  urlState: CustomersUrlState;
}

export function CustomersClient({ data, device, urlState }: CustomersClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();

  /** Süzgeç değişimi: URL'e yaz + RSC'yi yeniden okut (süzülmüş ilk sayfa gelir). */
  const applyFilters = (patch: Partial<CustomersUrlState>) => {
    router.replace(customersUrl({ ...urlState, ...patch }), { scroll: false });
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli. Sunucu değeri değişince yerel giriş eşitlenir.
  const [search, setSearch] = useState(urlState.q);
  useEffect(() => setSearch(urlState.q), [urlState.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ── Liste: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin
  // satırları yeni listede kalır.
  const [extra, setExtra] = useState<CustomerRow[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Yazma sonrası yerelde güncellenen satır alanları — kimlik → yama (bkz. aşağıdaki `runWrite`).
   *
   * Bildirimi BURADA, `rows`'tan önce: `rows` bir `.map` ile hemen hesaplanıyor ve yamayı okuyor.
   * Aşağıda dursa çalışma zamanında `Cannot access 'rowPatch' before initialization` verirdi —
   * tip denetimi bunu görmedi çünkü okuma bir kapanışın (`.map` geri çağrısı) içindeydi ve TS
   * kapanışları "sonra çalışabilir" sayıp geçiyor. Yaşandı (30.07).
   */
  const [rowPatch, setRowPatch] = useState<Record<string, Partial<CustomerRow>>>({});
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
    setRowPatch({});
  }, [data.rows, data.nextCursor]);

  // Sunucu satırları + eklenen sayfalar, üstüne yerel yamalar. Yama SUNUCU verisi gelince düşer
  // (`rowPatch` sıfırlanır) — kalıcı bir gölge kopya tutulmuyor.
  const rows = [...data.rows, ...extra].map((r) => (rowPatch[r.id] ? { ...r, ...rowPatch[r.id] } : r));

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreCustomersAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        // BEKLEYEN(18.5): düşen sayfa isteği loglanacak — sessiz kalması 09.17'de bir imleç hatasını
        // aylarca gizledi.
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  // ── Seçim ve seçilinin türetilmiş bilgisi ──
  // Seçim KİMLİKLE tutulur; kayıt taze listeden türetilir (kopya tutulursa güncelleme yansımaz).
  // İlk satır kendiliğinden seçilmez: web'de panel "seç" der, mobilde liste kartlara açılır — bir
  // müşterinin ödeme bilgisini istemeden ekrana getirmek bu ekranda uygun değil.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    // Seçim değişince ESKİ detay hemen düşer: kalması, yeni müşterinin altında başkasının cirosunu
    // göstermek olurdu — bir an için bile kabul edilemez.
    setDetail(null);
    setDetailLoading(true);
    let iptal = false;
    void readCustomerDetailAction(selectedId)
      .then(({ data: d }) => {
        // Hızlı tıklamada yarış: yalnız SON seçimin cevabı yazılır.
        if (iptal || !d) return;
        setDetail(d);
      })
      .finally(() => {
        if (!iptal) setDetailLoading(false);
      });
    return () => {
      iptal = true;
    };
  }, [selectedId]);

  // Seçili satır listeden düştüyse (süzgeç değişti) seçim de düşer — boş panele bakılmaz.
  useEffect(() => {
    if (selectedId && !rows.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [selectedId, rows]);

  // Seçili KAYIT taze listeden türetilir, kopya tutulmaz: düzenleme sonrası RSC tazelendiğinde
  // diyalog eski adı göstermez.
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // ── Sipariş özeti diyaloğu ──
  // Kimlik tutulur, kopya değil; referans karttan gelir ki başlık okuma bitmeden de doğru yazsın.
  const [orderDialog, setOrderDialog] = useState<{ id: string; referenceNo: string | null } | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummaryView | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderDialog) {
      setOrderSummary(null);
      return;
    }
    setOrderSummary(null);
    setOrderError(null);
    let iptal = false;
    void readOrderSummaryAction(orderDialog.id).then(({ data: s, error }) => {
      if (iptal) return;
      // Hata YUTULMAZ: yutulsa diyalog sonsuza kadar "Yükleniyor…" kalır ve kullanıcı ne olduğunu
      // hiç öğrenmez (bu oturumda tam bu desen bir imleç hatasını aylarca gizledi).
      if (s) setOrderSummary(s);
      else setOrderError(error ?? 'Sipariş özeti okunamadı.');
    });
    return () => {
      iptal = true;
    };
  }, [orderDialog]);

  // ── Yazma akışı ──
  // Yazmadan sonra seçili müşterinin detayı yeniden okunur ve SATIR YERELDE yamalanır.
  //
  // **`router.refresh()` BİLİNÇLİ OLARAK ÇAĞRILMIYOR.** Çağrılsaydı RSC yeni bir `data.rows` üretir,
  // sıfırlama etkisi yüklenmiş sayfaları siler ve seçili müşteri ilk 30 satırda değilse SEÇİM DE
  // düşerdi: üçüncü sayfadaki bir müşterinin kapıda ödeme iznini kapatan operatör panelini kaybedip
  // listenin başına dönerdi. 09.17'de teşhis edilen hatanın aynısı, bu kez süzgeç değil yazma
  // tetikleyicisiyle.
  //
  // Karşılığında sayaçlar bayatlamıyor: başlıktaki üç sayı (toplam · taslak · gecikmiş vade) bu
  // ekrandan yazılan hiçbir alana bağlı değil — vade yetkisi, kapıda ödeme ve indirim oranı üçünü de
  // oynatmaz. Satırda değişebilen tek şey "Vadeli" rozeti; onu taze detaydan yamalıyoruz.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runWrite = async (fn: () => Promise<{ error: string | null }>, onDone?: () => void) => {
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await fn();
      if (error) {
        // Hata SESSİZ DEĞİL: düşen bir kaydetme, operatörün yazdığını sandığı bir limittir.
        setSaveError(error);
        return;
      }
      if (selectedId) {
        const { data: fresh } = await readCustomerDetailAction(selectedId);
        if (fresh) {
          setDetail(fresh);
          // Satırın rozetini besleyen alanlar taze detaydan gelir; liste yeniden okunmadan doğru olur.
          setRowPatch((prev) => ({ ...prev, [selectedId]: { creditEnabled: fresh.creditEnabled } }));
        }
      }
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const [creditOpen, setCreditOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const onOpenOrder = (orderId: string) => {
    const row = detail?.lastOrders.find((o) => o.id === orderId);
    setOrderDialog({ id: orderId, referenceNo: row?.referenceNo ?? null });
  };

  const view = {
    data,
    rows,
    urlState,
    search,
    onSearch,
    onScope: (scope: CustomerScope) => applyFilters({ scope }),
    onType: (type: CustomerType | 'all') => applyFilters({ type }),
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    selectedId,
    onSelect: setSelectedId,
    detail,
    detailLoading,
    onOpenOrder,
    onEditCredit: () => {
      setSaveError(null);
      setCreditOpen(true);
    },
    onEdit: () => {
      setSaveError(null);
      setEditOpen(true);
    },
    // Mobilin satır-içi adımlayıcısı: yalnız LİMİT değişir. Yetki ve süre mevcut hâliyle geri
    // yazılıyor — action üçünü tek karar sayıyor ve eksik alan geçilse temizlerdi.
    onSaveCreditLimit: (cents: number | null) => {
      if (!selectedId || !detail) return;
      void runWrite(() =>
        setCustomerCreditAction(selectedId, {
          creditEnabled: detail.creditEnabled,
          creditLimitCents: cents,
          paymentTermDays: detail.customTermDays,
        }),
      );
    },
    saving,
    saveError,
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <CustomersMobile {...view} /> : <CustomersDesktop {...view} />}
      {creditOpen && selected && detail ? (
        <CreditDialog
          key={`credit-${selected.id}`}
          customerName={selected.name}
          detail={detail}
          saving={saving}
          error={saveError}
          onSave={(input: CreditFormInput) =>
            void runWrite(() => setCustomerCreditAction(selected.id, input), () => setCreditOpen(false))
          }
          onClose={() => setCreditOpen(false)}
        />
      ) : null}
      {editOpen && selected && detail ? (
        <CustomerEditDialog
          key={`edit-${selected.id}`}
          row={selected}
          vatNumber={selected.vatNumber}
          preferredLanguage={selected.preferredLanguage}
          codAllowed={detail.codAllowed}
          discountPercent={detail.discountPercent}
          saving={saving}
          error={saveError}
          onSave={(input: CustomerEditInput) =>
            void runWrite(
              async () => {
                const sonuc = await updateCustomerAction(selected.id, input);
                if (!sonuc.error) {
                  // Kimlik alanları detayda taşınmıyor (satırın malı) — yamayı buradan yazıyoruz ki
                  // liste yeniden okunmadan yeni ad görünsün.
                  setRowPatch((prev) => ({
                    ...prev,
                    [selected.id]: { ...prev[selected.id], name: input.name.trim(), phone: input.phone, email: input.email, type: input.type, country: input.country, preferredLanguage: input.preferredLanguage, vatNumber: input.vatNumber },
                  }));
                }
                return sonuc;
              },
              () => setEditOpen(false),
            )
          }
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      {orderDialog ? (
        <OrderDialog
          key={orderDialog.id}
          summary={orderSummary}
          error={orderError}
          referenceNo={orderDialog.referenceNo}
          onClose={() => setOrderDialog(null)}
        />
      ) : null}
    </>
  );
}
