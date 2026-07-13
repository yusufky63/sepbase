# Agent rules

Bu repository'de çalışan bütün kodlama ajanları önce `PROJECT_SPEC.md` dosyasını okumalıdır.

## V3 binding override — 12 Temmuz 2026

Bu bölüm aşağıdaki v2 `Scope` ve `Approved integration deviation` metinleriyle çeliştiğinde v3 çalışması için önceliklidir. Eski maddeler canlı `ChainNameService` v2.0.0 davranışını ve korunacak invariant'ları belgeler; yeni v3 kapsamını daraltmaz.

- V3 Base Sepolia (`84532`) üzerinde mainnet release disipliniyle geliştirilen yeni, no-proxy ve source-verified bir contract suite/deployment'tır. Canlı v2 kontratı yerinde değiştirilmez veya sahte biçimde v3 diye sunulmaz.
- Suite; ENS-compatible registry/registrar ownership, commit-reveal controller, resolver/reverse/text records, advanced marketplace ve açık migration sorumluluklarına bölünebilir. EIP-170 sınırı uğruna güvenlik davranışı çıkarılmaz.
- Onaylı V3 topolojisi altı authority/state kontratı ve bir bounded read-only `ChainNameMarketLensV3` olmak üzere yedi no-proxy adrestir. Registry `configureSuite(controller,resolver,migration,marketplace)` çağrısıyla dört stateful binding'i tek kez kilitler; Universal Resolver ve MarketLens binding'leri ayrıca manifest/ABI ile doğrulanır. Lens authority, custody veya source of truth değildir.
- Bütün kullanıcı girdileri tek exact-pinned ENSIP-15 normalizer ve ortak conformance corpus ile canonicalize edilir. Labelhash, namehash, token identity, commitment, API, SDK ve UI aynı normalized byte değerini kullanır; doğrudan contract çağrısının canonicalization trust boundary'si belgelenir ve test edilir.
- Fixed listing korunur; escrowed offer/bid ve English auction eklenir. Expected price/fee/nonce/deadline guard'ları, ownership/lifecycle bağları, pull-payment proceeds/refunds ve unified liability/solvency invariant'ları zorunludur.
- Paid x402 yalnız matching standard 6-decimal ERC-20 Base Sepolia settlement profile'ında, resmi x402 V2 adapter, CAIP-2, durable shared idempotency/lease state, managed signer, facilitator verify/settle ayrımı, confirmation/reconciliation ve refund runbook'u ile etkinleşebilir. Mevcut native v2 deployment'ta fail closed kalır.
- İlk V3 paid-x402 Base Sepolia target asset'i config/manifestten doğrulanan Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals ve network `eip155:84532`'dir. Gas test ETH ile ayrıdır; test tokenlarına fiat değer atanmaz ve canlı v2 native profile değiştirilmez.
- Paid execution boundary için durable store/workflow ve monitoring kullanımı onaylıdır; bu istisna core name ownership veya market state'inin source of truth'unu backend'e taşımaz.
- `@sepbase/sdk`, `@sepbase/react` ve `@sepbase/mcp` license, semver, provenance, changelog ve runnable consumer smoke ile npm'e yayınlanmadan dokümanda kurulabilir/live denmez.
- Hosted cutover; final HTTPS metadata, v3 manifest/ABI checksum, ENS discovery, OpenAPI, agent manifest, MCP/x402, security headers, rate limits, logs/alerts ve desktop/mobile funded E2E aynı release'i doğrulamadan tamamlanmış sayılmaz.
- `docs/V3_ACCEPTANCE_MATRIX.md` içindeki kanıtı olmayan hiçbir v3 özelliği tamamlandı, production-ready veya live işaretlenmez.

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

## Approved integration deviation

- `docs/IMPLEMENTATION_STATUS.md` altındaki 12 Temmuz 2026 tarihli Architecture Deviation uyarınca MCP entegrasyonu kapsam içindedir. MCP yalnız public read ve unsigned transaction preparation yapabilir; private key tutamaz, imzalayamaz, ödeme başlatamaz veya transaction broadcast edemez.
- Remote MCP stateless Streamable HTTP, local agent host ise stdio kullanır. HTTP transport, MCP Origin güvenlik kuralını ve hosted rate-limit/abuse sınırlarını korumalıdır.
- Bu release'in x402 paid-route availability durumu kesin olarak `fail-closed`/`quote-only`, implementation milestone'ı `v3-contract-pending`'dir. Ücretsiz quote/readiness yüzeyi bulunur; paid registration `POST` her zaman fail closed kalır ve environment değişkenleriyle etkinleştirilemez.
- Paid x402 execution, keeper veya ödeme settlement'ı varmış gibi belgelenemez. Gelecekte bunların eklenmesi ayrı onay, ERC-20 settlement uyumluluğu, resmi adapter, durable idempotency, managed signer, monitoring, reconciliation, E2E ve security review gerektirir.
- Core dApp için backend database, indexer, queue veya microservice yasağı devam eder. Gelecekte açıkça onaylanan paid x402 execution boundary dışında durable store eklenemez.
- Source tree'de bulunan agent route'ları hosted alias'a deploy edilmiş sayılmaz. `/.well-known/chain-name-agent.json`, `/api/mcp` ve `/api/x402/registration/quote` production origin üzerinde smoke edilmeden dokümanda "live" denemez.

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
