-- Modül 06 — Atomik rezervasyon (06.3). DOMAIN §4 "Eşzamanlılık".
--
-- NEDEN RPC: iki müşteri aynı anda son birimi isteyebilir. Uygulamada "önce oku, sonra yaz" arası
-- başkası araya girer ve ikisi de ayırır (aşırı-satış). Kontrol ile yazım TEK transaction'da,
-- kilitli olmalı. Yazma RPC eşiği: STACK §13 — RPC yalnız (a) eşzamanlılık yarışı ya da
-- (b) bölünemez çok-tablolu yazım için ödenir; bu (a).
--
-- FONKSİYON KARAR VERMEZ, koşullu yazar: TTL süresi, teklif miktar tavanı, kısmi ayırma politikası
-- gibi kurallar motordadır (domain-core/stock/reservation.ts). Buradaki tek kural fiziksel gerçektir:
-- kullanılabilirden fazlası ayrılamaz.
--
-- Kilit: varyantın parti satırları `for update` ile kilitlenir → aynı varyanta gelen ikinci istek
-- birincinin yazımını görene kadar bekler. Eşzamanlı yeni parti girişi kilitlenmez; o yalnız
-- kullanılabiliri ARTIRIR, aşırı-satış doğurmaz.
--
-- ── DEPO SÜZGECİ (DOMAIN §17) ───────────────────────────────────────────────
-- `p_warehouse_id` ZORUNLU ve varsayılanı YOK: unutulan bir süzgeç burada sessizce çalışır ve
-- sistem OLMAYAN MALI SATAR — STR'de duran 3 adede bakıp KEHL'in siparişini ayırır. Tek depolu bir
-- veri setinde bu hata hiçbir testi kırmaz, o yüzden panzehiri imzanın kendisidir: parametresiz
-- çağrı derlenmez/çalışmaz.
-- Yan fayda: kilit depoya daralır — iki deponun eşzamanlı siparişi artık birbirini beklemez.

create or replace function public.reserve_stock(
  p_order_id uuid,
  p_variant_id uuid,
  p_warehouse_id uuid,
  p_qty int,
  p_ttl_minutes int default null,
  p_stock_id uuid default null                     -- dolu → partiye çıpalı (near-expiry teklif satırı)
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_physical int;
  v_reserved int;
  v_available int;
  v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'reserve_stock: qty pozitif olmalı (gelen: %)', p_qty;
  end if;

  if p_warehouse_id is null then
    raise exception 'reserve_stock: depo zorunlu — varsayılan depo kavramı yoktur (DOMAIN §17)';
  end if;

  if p_stock_id is null then
    -- Varyant toplamı seviyesinde ayırma (normal hâl): partiyi hazırlık FEFO ile seçer.
    -- Hesap DEPO İÇİNDE: başka deponun malı bu siparişe ayrılamaz.
    perform 1 from public.stock
      where variant_id = p_variant_id and warehouse_id = p_warehouse_id for update;
    select coalesce(sum(physical_qty), 0) into v_physical
      from public.stock where variant_id = p_variant_id and warehouse_id = p_warehouse_id;
    select coalesce(sum(qty), 0) into v_reserved
      from public.reservation
      where variant_id = p_variant_id and warehouse_id = p_warehouse_id
        and (expires_at is null or expires_at > now());
  else
    -- Partiye çıpalı ayırma: yalnız O partinin kullanılabiliri sayılır — teklife söz verilen stok
    -- normal hazırlığa görünmez, normal rezervasyon da teklifin partisini yiyemez (DOMAIN §4/§5).
    -- Parti zaten bir depodadır; istenen depoyla çelişiyorsa bu bir çağrı hatasıdır, sessiz geçilmez.
    perform 1 from public.stock where id = p_stock_id for update;
    select coalesce(physical_qty, 0) into v_physical
      from public.stock where id = p_stock_id and warehouse_id = p_warehouse_id;
    if v_physical is null then
      raise exception 'reserve_stock: parti % istenen depoda (%) değil', p_stock_id, p_warehouse_id;
    end if;
    select coalesce(sum(qty), 0) into v_reserved
      from public.reservation
      where stock_id = p_stock_id and (expires_at is null or expires_at > now());
  end if;

  v_available := greatest(coalesce(v_physical, 0) - coalesce(v_reserved, 0), 0);

  -- Kısmi ayırma YOK: yetmezse hiç yazılmaz, müşteriye o an bildirilir (yarım sipariş sürprizi yok).
  if p_qty > v_available then
    return jsonb_build_object('ok', false, 'reservation_id', null, 'available', v_available);
  end if;

  insert into public.reservation (order_id, variant_id, warehouse_id, stock_id, qty, expires_at)
  values (
    p_order_id,
    p_variant_id,
    p_warehouse_id,
    p_stock_id,
    p_qty,
    case when p_ttl_minutes is null then null else now() + make_interval(mins => p_ttl_minutes) end
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reservation_id', v_id, 'available', v_available - p_qty);
end;
$$;

-- Erişim yalnız sunucudan (service_role). Tarayıcıya çıkan roller çağıramaz — çift kat savunma.
revoke execute on function public.reserve_stock(uuid, uuid, uuid, int, int, uuid) from public, anon, authenticated;
