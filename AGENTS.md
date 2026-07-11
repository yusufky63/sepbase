# Agent rules

Bu repository'de çalışan bütün kodlama ajanları önce `PROJECT_SPEC.md` dosyasını okumalıdır.

## Scope

- İlk test deployment'ı Base Sepolia (chain ID `84532`).
- Tek chain, tek suffix, tek standalone dApp.
- Tek `ChainNameService.sol` kontratı.
- Ana public route'lar: `/`, `/name/[label]`, `/me`, `/market`, `/developers`.
- Gated operasyon route'u: `/admin`; canlı owner/pending owner ve configured viewer allowlist dışında içerik göstermez.
- `/me`; Names, Referrals ve Listings & Proceeds sekmelerini tek hesap görünümünde birleştirir.
- İlk Base Sepolia profili 4-32 karakter için yıllık `0.0005 ETH`, 1/2/3 karakter için `100x/25x/5x`; ortak kod fiyatı configured settlement asset/base unit olarak işler.
- Settlement deployment başına `native` veya tek standart `erc20` olabilir; gas currency ile settlement asset ayrıdır.
- On-chain referral attribution, pull-payment ödülü ve claim akışı zorunludur.
- Fixed-price settlement-asset marketplace, seller pull-payment ve başlangıçta `%0` market ücreti zorunludur.
- Diğer dApp'ler için SDK, ABI, read-only API, OpenAPI, `llms.txt` ve well-known manifest sağlanır.
- Backend database ve indexer yok.
- Admin istatistik ve activity verileri deployment block'tan başlayan chunked contract read/event sorgularıyla üretilir.
- Admin UI allowlist'i gizlilik sınırı değildir; on-chain veriler public kalır. Contract write yetkisi her zaman canlı `owner`/`pendingOwner` kontrolüne ve kontrat access control'üne bağlıdır.
- Harici name-service entegrasyonu yok.
- Cross-chain, subdomain, auction, offer sistemi ve proxy yok.

## Engineering

- Stable dependency sürümlerini exact pinle.
- TypeScript strict.
- Solidity custom errors ve NatSpec.
- Marka/chain/contract adreslerini hardcode etme.
- ETH, wei, 18 decimals, token symbol/address, `parseEther` veya `formatEther` varsayma; config + manifest + `parseUnits/formatUnits` kullan.
- Gas currency ile settlement metadata'sını ayrı tut; testnet tokenına fiat değeri atfetme.
- Register/renew'de expected amount, referral'da expected reward BPS, list/update'te expected fee ve buy'da expected price guard'ını kaldırma.
- Forward-confirmed primary, reserved-name semantics ve liability solvency guard'larını koru.
- Native ve 6-decimal ERC-20 fixture'larını test et; fee-on-transfer settlement tokenını reddet.
- Private key veya secret commit etme.
- Her fazdan sonra test ve build çalıştır.
- `docs/IMPLEMENTATION_STATUS.md` güncel tutulmalı.

## UI

- CSS Modules + design tokens + açık tipografik ölçek.
- Tasarım yönü `Modular Typography`; tipografi sayfanın yapısal öğesidir.
- Siyah/beyaz ana palet + configured accent; ilk Base Sepolia profili resmi Base Blue `#0000ff` kullanır.
- Gradient, glassmorphism, 3D orb ve generic dashboard yasak.
- Hazır landing page, bento-card ve vibecoding estetiği yasak.
- Sayfalar 12 kolonlu modüler grid, 1px ayırıcılar ve güçlü boşluk ritmi kullanır.
- Tanıdık icon aksiyonlarında Lucide kullan; icon-only button'a accessible name ve tooltip ekle.
- Mobil ve erişilebilirlik zorunlu.

## Required checks

```bash
forge fmt --check
forge build
forge build --sizes
forge test -vvv
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
