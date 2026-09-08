import { toOperationsNotification } from './notification-map';

/*
  OPERASYON EŞLEMESİ (14.13) — uçtan gelen satır → kabuğun bildirimi. Çivilenenler:
  · BÖLÜM = HEDEF EKRANIN BÖLÜMÜ (05.09 kararı): `stock_low` bir STOK olayı ama bölümü YÖNETİM,
    çünkü hedefi tedarik önerisi. Eski eşleme onu üreten modüle göre yazıyordu ve hem tasarımla
    hem webin rotasıyla çelişiyordu; ekran o yüzden yalnız-yönetici olan kişiye YAZILAN satırı
    hiç çizmiyordu.
  · Hedefi OLMAYAN tür `destination: null` verir — satır haber verir, tıklanmaz.
  · Başlık ile ALT SATIR ayrı alanlar (sözlüğün 05.09 bölmesi).
  · Bilinmeyen tür SESSİZCE DÜŞMEZ: yönetim/quiet + genel başlık.
*/

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'document_undeliverable',
  targetType: 'order' as const,
  targetId: 'o-1',
  payload: { referenceNo: 'LA-26-X1' } as Record<string, unknown>,
  createdAt: '2026-08-26T11:58:00Z',
  readAt: null,
  ...over,
});

describe('toOperationsNotification', () => {
  it('ulaştırılamayan belge: yönetim · alert · başlıkta referans, sebep alt satırda', () => {
    const sonuc = toOperationsNotification(row());
    expect(sonuc).toMatchObject({ section: 'management', tone: 'alert', readAt: null });
    expect(sonuc.title).toContain('LA-26-X1');
    expect(sonuc.sub).toContain('e-postası yok');
  });

  it('mobilde açılacak ekranı OLMAYAN tür hedefsizdir — satır tıklanmaz', () => {
    // Belge sınıfının hedefi sipariş detayı; operasyon kabuğunda öyle bir ekran YOK (BEKLEYEN 21.284).
    expect(toOperationsNotification(row()).destination).toBeNull();
    expect(toOperationsNotification(row({ kind: 'run_close_pending', payload: {} })).destination).toBeNull();
  });

  it('KURUMSAL BAŞVURU artık başvurunun KENDİSİNE açılıyor (21.217)', () => {
    /*
      07.09'a kadar bu tür hedefsizler tablosundaydı: bildirim listede görünüyor ama dokunulamıyordu.
      Ekran doğdu, tür oradan düştü. İki yönlü sınanıyor — hedefin VARLIĞI ve kimliğin YOLA girmesi:
      bildirim hangi başvuruyu kastettiğini biliyor, araya liste konmuyor (brief §2b).
    */
    const hedef = toOperationsNotification(row({ kind: 'b2b_application_received', payload: {} })).destination;
    expect(hedef).toMatchObject({ href: '/b2b-application?id=o-1', section: 'management' });
  });

  it('kimliksiz kurumsal başvuru bildirimi TIKLANMAZ — ölü düğme doğmaz', () => {
    /* Hedef `targetId`den kuruluyor; kimlik yoksa "aç" düğmesi dokunulunca hiçbir yere gitmezdi. */
    const hedef = toOperationsNotification(row({ kind: 'b2b_application_received', payload: {}, targetId: null })).destination;
    expect(hedef).toBeNull();
  });

  it('BÖLÜM hedef ekrandan gelir: eşik düşüşü DEPO olayı ama YÖNETİM satırı', () => {
    const sonuc = toOperationsNotification(row({ kind: 'stock_low', payload: { sku: 'BKL-500' } }));
    expect(sonuc.section).toBe('management');
    expect(sonuc.destination).toMatchObject({ href: '/supply-suggestion', section: 'management' });
  });

  it('transferin iki yüzü aynı ekrana ve aynı etikete gider — etiket TÜR başına değil HEDEF başına', () => {
    const eksik = toOperationsNotification(row({ kind: 'transfer_shortfall', payload: { shortQty: 3 } }));
    const fazla = toOperationsNotification(row({ kind: 'transfer_excess', payload: { excessQty: 2 } }));
    expect(eksik.destination).toEqual(fazla.destination);
    expect(eksik.destination).toMatchObject({ section: 'warehouse' });
  });

  it('talep hedefi KAYDA açılır; kimlik yoksa hedef doğmaz (uydurma adres yazılmaz)', () => {
    const kimlikli = toOperationsNotification(row({ kind: 'ticket_opened', targetId: 't-9', payload: {} }));
    expect(kimlikli.destination?.href).toBe('/complaint?id=t-9');
    const kimliksiz = toOperationsNotification(row({ kind: 'ticket_opened', targetId: null, payload: {} }));
    expect(kimliksiz.destination).toBeNull();
  });

  it('bilinmeyen tür genel satıra düşer — sessizce kaybolmaz', () => {
    const sonuc = toOperationsNotification(row({ kind: 'yeni_personel_turu', payload: {} }));
    expect(sonuc).toMatchObject({ section: 'management', tone: 'quiet', destination: null });
    expect(sonuc.title.length).toBeGreaterThan(5);
    expect(sonuc.sub).toBeNull();
  });

  it('okunmuşluk uçtan aynen taşınır — nokta bu alandan çizilir', () => {
    expect(toOperationsNotification(row({ readAt: '2026-08-26T12:00:00Z' })).readAt).not.toBeNull();
  });
});
