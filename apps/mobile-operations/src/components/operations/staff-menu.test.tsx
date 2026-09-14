import { fireEvent, render, screen } from '@testing-library/react-native';

import type { StaffWarehouse } from '@lezzet/types';

import { chooseWarehouse, chosenWarehouseId, resetWarehouseChoice } from '@/lib/operations/warehouse-choice';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { OperationsStaffMenu } from './staff-menu';

/*
  KİMLİK MENÜSÜ — menünün müşteri köprüsü (ve onun ertelenmiş yönlendirme testi) iki ayrı
  uygulamayla kalktı (21.310); burada menünün depo işi sınanır.
*/

// signOut supabase'e uzanır; bu testin konusu değil.
jest.mock('@lezzet/mobile-kit/src/lib/auth/sign-out', () => ({ signOut: jest.fn() }));

async function renderMenu(warehouses: StaffWarehouse[] = []) {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['management'],
        userName: 'Selin Kaya',
        userEmail: 'yonetim@lezzetanatolia.fr',
        warehouses,
        resolvedWarehouseId: null,
      }}
    >
      <OperationsStaffMenu testID="staff-avatar" />
    </OperationsSessionProvider>,
  );
}

/*
  DEPO DEĞİŞTİR (30.08) — menünün yan işi, ama YALNIZ seçilecek bir şey varken.

  Tek tesisli depocuda düğmenin çizilmemesi bir titizlik değil dürüstlük: değiştirilecek bir şey
  yokken sunulan bir seçenek, basıldığında hiçbir şey yapmayan (ya da ekranı kilitleyen) bir
  kontroldür.
*/
describe('OperationsStaffMenu · depo değiştir', () => {
  const STR: StaffWarehouse = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' };
  const KEHL: StaffWarehouse = { id: 'w-kehl', code: 'KEHL', name: 'Kehl Depo', kind: 'facility' };
  const VAN: StaffWarehouse = { id: 'w-van', code: 'VAN', name: 'Panelvan', kind: 'vehicle' };

  beforeEach(() => {
    resetWarehouseChoice();
  });

  it('birden çok TESİS varsa düğme çizilir ve seçimi bırakır', async () => {
    chooseWarehouse(KEHL.id);
    await renderMenu([STR, KEHL]);

    await fireEvent.press(screen.getByTestId('staff-avatar'));
    await fireEvent.press(screen.getByTestId('operations-staff-change-warehouse'));

    // Seçim bırakıldı: kapsam ekranı yeniden sorar (menü listeyi kendisi çizmez).
    expect(chosenWarehouseId()).toBeNull();
  });

  it('tek tesisli personelde düğme HİÇ doğmaz', async () => {
    await renderMenu([STR]);

    await fireEvent.press(screen.getByTestId('staff-avatar'));

    expect(screen.queryByTestId('operations-staff-change-warehouse')).toBeNull();
  });

  it('tesis + ARAÇ kapsamı "birden çok depo" SAYILMAZ — araç bir depo değil', async () => {
    await renderMenu([STR, VAN]);

    await fireEvent.press(screen.getByTestId('staff-avatar'));

    expect(screen.queryByTestId('operations-staff-change-warehouse')).toBeNull();
  });
});
