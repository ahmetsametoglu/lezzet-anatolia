// Kalıcı Cloudflare tüneli — `pnpm tunnel` (09.09).
//
// Quick tunnel (`cloudflared tunnel --url …`) her ölümünde yeni bir rastgele adres veriyordu ve Meta
// webhook'u her seferinde yeniden kaydediliyordu (`meta:register`, 15.7 tünel notu). Zone Cloudflare'e
// geçince hesaba bağlı ADLANDIRILMIŞ tünel açıldı (`lezzet-dev`, MCP ile 09.09): sabit alan adı
// `api-dev.lezzetanatolie.com` → yerel backend :8787, cloudflared kopunca kendisi yeniden bağlanır,
// adres bir daha değişmez. Bağlayıcı jeton `apps/backend/.env.local`ta (`CLOUDFLARE_TUNNEL_TOKEN`);
// komut satırına ve kabuk geçmişine girmesin diye buradan okunuyor — değer hiçbir yerde basılmaz.
import { spawn } from 'node:child_process';

try {
  process.loadEnvFile('apps/backend/.env.local');
} catch {
  // Dosya yoksa ortam değişkeni de olabilir; eksikse aşağıda adıyla söylenir.
}

const token = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
if (!token) {
  console.error('CLOUDFLARE_TUNNEL_TOKEN yok — apps/backend/.env.local (künyesi .env.example). Jeton: Zero Trust → Networks → Tunnels → lezzet-dev.');
  process.exit(1);
}

const child = spawn('cloudflared', ['tunnel', 'run', '--token', token], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
