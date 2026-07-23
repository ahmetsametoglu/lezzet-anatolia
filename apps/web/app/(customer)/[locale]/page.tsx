import { brand } from '@lezzet/brand';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{brand.name}</h1>
      <p className="text-sm text-neutral-500">İskelet ayakta. Modül modül inşa başlıyor.</p>
    </main>
  );
}
