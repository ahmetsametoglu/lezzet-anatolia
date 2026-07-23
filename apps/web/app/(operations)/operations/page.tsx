import { redirect } from 'next/navigation';
import { serviceDb, StaffRoleService } from '@lezzet/database';
import { AuthError, requireStaff } from '@/lib/guard';

// Operasyon karşılama noktası — yalnız personel. Tam yüzey (Veri Masası) sonraki dilimde;
// şimdilik yönlendirme kapısının hedefi olarak asgari, guard'lı bir stub.
export default async function OperationsPage() {
  let user;
  try {
    user = await requireStaff();
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === 'auth_required') redirect('/connexion?next=/operations');
      redirect('/'); // müşteri Operasyon'a giremez → market'e
    }
    throw e;
  }

  const roles = await new StaffRoleService(serviceDb()).getRoles(user.id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#dedbd3] p-8 font-sans text-[#22251f]">
      <div className="w-full max-w-md rounded-lg border border-[#e6e7e1] bg-[#fbfbf9] p-8">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-olive">Operasyon</span>
        <h1 className="mt-2 text-2xl font-semibold">Hoş geldin</h1>
        <p className="mt-1 text-sm text-[#6a7065]">{user.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {roles.map((r) => (
            <span key={r} className="rounded-md bg-[#eef4e2] px-2.5 py-1 text-[11px] font-semibold uppercase text-[#4a6121]">
              {r}
            </span>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-[#8b9086]">Operasyon yüzeyi (panel, siparişler, rotalar…) sonraki dilimde kurulacak.</p>
      </div>
    </main>
  );
}
