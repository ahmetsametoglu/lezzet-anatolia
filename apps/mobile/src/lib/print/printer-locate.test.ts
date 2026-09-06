import { locatePrinter, printHealing, printTargetOf } from './printer-locate';
import { findNetworkPrinters } from './brother';

jest.mock('./brother', () => ({ findNetworkPrinters: jest.fn() }));
const mockScan = findNetworkPrinters as jest.MockedFunction<typeof findNetworkPrinters>;

const kanal = (address: string, serialNumber: string | null, modelName = 'QL-820NWB') => ({
  address,
  modelName,
  serialNumber,
});
const yazici = (address: string, serialNumber: string | null) => ({
  address,
  serialNumber,
  model: 'QL-820NWB',
  labelSize: 'RollW62',
});

beforeEach(() => mockScan.mockReset());

describe('locatePrinter', () => {
  it('serisi olan satır ADRESİ değişmiş olsa da bulunur — 05.09 arızasının kendisi', () => {
    // Envanterde `.91`, gerçek yazıcı `.169`: eski kural burada "ağda görünmüyor" diyordu.
    const bulundu = locatePrinter(yazici('192.168.1.91', 'E75432'), [kanal('192.168.1.169', 'E75432')]);
    expect(bulundu?.address).toBe('192.168.1.169');
  });

  it('serisi olan satır ADRESTEN eşleşmez: o adreste artık başka yazıcı olabilir', () => {
    expect(locatePrinter(yazici('192.168.1.91', 'E75432'), [kanal('192.168.1.91', 'BASKA')])).toBeNull();
  });

  it('serisi olmayan satır adresten eşleşir — elle tanıtılmış kayıtların dalı', () => {
    expect(locatePrinter(yazici('192.168.1.90', null), [kanal('192.168.1.90', 'E11111')])?.address).toBe('192.168.1.90');
  });

  it('yazıcı ağda yoksa null — "bulamadım" ile "başka adreste" ayrı cevaplar', () => {
    expect(locatePrinter(yazici('192.168.1.91', 'E75432'), [])).toBeNull();
  });
});

describe('printTargetOf', () => {
  it('ağda bulunduysa GÜNCEL adrese basar', () => {
    expect(printTargetOf(yazici('192.168.1.91', 'E75432'), [kanal('192.168.1.169', 'E75432')]).address).toBe(
      '192.168.1.169',
    );
  });

  it('bulunamadıysa son bilinen adres denenir — tarama düştü diye basım durmaz', () => {
    expect(printTargetOf(yazici('192.168.1.91', 'E75432'), []).address).toBe('192.168.1.91');
  });
});

describe('printHealing', () => {
  it('ilk deneme tutarsa hiç taramaz — mutlu yolda 4 sn bedel ödenmiyor', async () => {
    const send = jest.fn(async () => undefined);
    await expect(printHealing(yazici('192.168.1.90', 'E11111'), send)).resolves.toEqual({ healedAddress: null });
    expect(mockScan).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('eski adres tutmazsa seriden güncelini bulup BİR kez daha dener', async () => {
    mockScan.mockResolvedValue([kanal('192.168.1.169', 'E75432')]);
    const send = jest.fn(async (t: { address: string }) => {
      if (t.address === '192.168.1.91') throw new Error('ulaşılamadı');
    });

    await expect(printHealing(yazici('192.168.1.91', 'E75432'), send)).resolves.toEqual({
      healedAddress: '192.168.1.169',
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ address: '192.168.1.169' }));
  });

  it('kimliği olmayan satır onarılmaz — neyi arayacağını bilmiyor', async () => {
    const send = jest.fn(async () => {
      throw new Error('ulaşılamadı');
    });
    await expect(printHealing(yazici('192.168.1.90', null), send)).rejects.toThrow('ulaşılamadı');
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('yazıcı aynı adreste ama basım düştüyse İLK hata fırlar — onarım arızayı gizlemez', async () => {
    mockScan.mockResolvedValue([kanal('192.168.1.91', 'E75432')]);
    const send = jest.fn(async () => {
      throw new Error('SetLabelSizeError');
    });
    await expect(printHealing(yazici('192.168.1.91', 'E75432'), send)).rejects.toThrow('SetLabelSizeError');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('tarama da düşerse İLK hata fırlar, taramanınki değil', async () => {
    mockScan.mockRejectedValue(new Error('keşif düştü'));
    const send = jest.fn(async () => {
      throw new Error('ulaşılamadı');
    });
    await expect(printHealing(yazici('192.168.1.91', 'E75432'), send)).rejects.toThrow('ulaşılamadı');
  });
});
