# Production Readiness Report

Tarih: 2026-07-13

## V3 production target kararı

V3; immutable EIP-712 attestor'lı ENSIP-15 canonicalization, altı authority/state kontratı + bounded read-only MarketLens'ten oluşan yedi-adres no-proxy release, commit-reveal, fixed+offer+auction marketplace, unified refund liabilities, public npm packages, paid x402 V2, migration, multisig/audit ve observability hedefler. **Source veya belge varlığı bunları acceptance-complete, deploy edilmiş ya da live yapmaz.** `docs/V3_ACCEPTANCE_MATRIX.md` içinde seçili local contract satırları artık `PASS` kanıtı taşır; browser, Base Sepolia, hosted, package-publication, audit/soak ve paid-execution runtime kapıları hâlâ `NOT RUN` durumundadır.

| V3 gate | Bugünkü durum |
|---|---|
| ENSIP-15/ENS conformance corpus | Source PASS; deployment/cross-service runtime pending |
| Immutable EIP-712 attestor/domain/expiry/replacement drill | Contract/source PASS; immutable signer provisioning and incident drill pending |
| Seven addresses: six authority/state contracts + bounded read-only MarketLens | Source/size/tests PASS; Base Sepolia deployment pending |
| One-time registry suite wiring | Source/tests PASS; deployed binding pending |
| Commit-reveal | Source/tests PASS; funded browser/Base Sepolia E2E pending |
| Offers/auctions/unified refund liabilities | Source/fuzz/invariant tests PASS; funded deployed E2E pending |
| Migration controller/dry run | Source and fixed-block 6/6 eligibility dry run PASS; deployed claim pending |
| Public npm SDK/React/MCP | Packed clean-consumer smoke PASS; `@sepbase` scope/publication pending |
| Official durable paid x402 V2 | Activation-gated source PASS; external services/funded E2E pending |
| Multisig + independent audit | Pending |
| Observability/incident drill | Pending |
| Final metadata/discovery cutover | Pending |

Canlı v2'nin test/smoke kanıtı bu v3 gate'lerini kapatmaz.

## Sonuç

Bu bölüm v2 historical/current durumu anlatır: SEPBASE v2 kontratı Base Sepolia üzerinde canlı, source-verified ve gerçek çoklu hesap write smoke'undan geçmiştir. Mevcut HTTPS web release'i `https://sepbase.vercel.app` adresinde çalışır; mevcut web, ABI, deployment manifesti ve read-only API aynı v2 registry'yi kullanır.

Repository'deki yeni agent entegrasyonu **source-ready ve protected Preview üzerinde doğrulanmış, fakat production-pending** durumundadır. 13 Temmuz 2026 denetiminde production alias aşağıdaki yeni URL'lerde hâlâ `404` döndürmüştür:

```text
/.well-known/chain-name-agent.json
/api/mcp
/api/x402/registration/quote
```

Bu nedenle agent discovery, MCP veya x402 quote production alias'a yeniden deploy edilip final-origin smoke tamamlanmadan "live" olarak tanımlanamaz.

Yeni kaynak `dpl_2pEWFeWsqSestVf7n4xkZwLicAci` Preview adayında `Ready` durumuna gelmiştir. Bu exact artifact migration-aware SDK/MCP/account UI değişikliklerini içerir. Deployment Protection normal anonim smoke'u `302` ile durdururken, Vercel-authenticated istekler `/me`, schema-4 discovery, OpenAPI `1.7.0`, `llms.txt`, origin-less server-client üzerinden 39-tool V3 MCP (account-scoped migration eligibility dahil), V3 draft ve beklenen V3/x402 fail-closed yanıtlarını doğrulamıştır; deployment error log sorgusu sıfır kayıt döndürmüştür. Preview `NEXT_PUBLIC_SITE_URL`, server-only authenticated `RPC_URL` ve quote HMAC taşımadığı için canonical/OpenAPI origin `http://localhost:3000` değerine düşer ve ücretsiz quote `QUOTE_AUTHENTICATION_NOT_CONFIGURED` döner. Bu nedenle aday production'a terfi ettirilmemiş; metadata origin, V3 deployment ve paid runtime kapıları açık bırakılmamıştır. `pnpm hosted:check` final-origin koşullarını tek komutta zorunlu kılar.

x402 kaynak durumu **activation-gated**'dir. Official x402 `2.18.0` adapter, encrypted external CAS, payment/authorization uniqueness, server-side secret plan persistence, managed signer, on-chain calldata/receipt/post-state doğrulaması ve Workflow `4.6.0` continuation route'a bağlanmıştır. Buna rağmen mevcut V3 manifest address-free draft olduğu ve gerçek facilitator/store/signer/attestor/keeper altyapısı ile funded E2E bulunmadığı için hosted paid availability hâlâ `false` ve route `503` kalır. Environment değerlerinin varlığı tek başına readiness sağlamaz.

V3 Base Sepolia target settlement/payment profile `eip155:84532`, Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals'dır. Aynı asset immutable protocol settlement ve x402 payment tarafında kullanılmadan paid execution açılamaz. Gas test ETH ile ayrı kalır; test USDC/test ETH'ye fiat değeri atanmaz. Canlı V2 native profile değişmez.

Değer taşıyan production/mainnet release'i hazır değildir. Metadata URI cutover, authenticated RPC, WalletConnect, package publication, multisig operasyonu, hosted rate limiting/monitoring ve bağımsız audit tamamlanmalıdır.

## Durum matrisi

| Alan | Durum | Kanıt / sınır |
|---|---|---|
| Contract v2 | Hazır ve canlı | Base Sepolia `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`, verified source |
| Name lifecycle | Hazır | 1-32 karakter, premium tiers, register/renew/release/grace testleri |
| Referral | Hazır | On-chain attribution, expected BPS guard, pull-payment claim smoke |
| Marketplace | Hazır | Fixed price, expected price/fee guard, list/cancel/buy/seller claim smoke |
| Solvency | Hazır | Native + 6-decimal ERC-20, fee-on-transfer reject, invariant testleri |
| Existing hosted web | Preview current / production stale | Current source is `Ready` on protected Preview `dpl_2pEWFeWsqSestVf7n4xkZwLicAci`; Preview canonical origin env is missing and production was not promoted |
| Agent discovery + MCP | Preview-verified / production-pending | Preview exposes schema-4 discovery, OpenAPI `1.7.0`, `llms.txt`, origin-less 39-tool V3 MCP and fail-closed V3/x402 routes; canonical-origin full smoke and production cutover remain |
| x402 quote | Activation-config pending | Preview paid/status routes fail closed correctly, but the free quote is `503 QUOTE_AUTHENTICATION_NOT_CONFIGURED` until server-only quote authentication and authenticated `RPC_URL` are provisioned |
| x402 paid execution | Source-ready / activation-gated | Runtime wiring ve local failure/replay tests mevcut; live V3, external services, funded E2E ve audit yok |
| Entegrasyon | Kısmen hazır | Manifest/ABI/API/OpenAPI/`llms.txt` mevcut; package publication ve hosted agent cutover bekliyor |
| CI tanımı | Source-ready | SHA-pinned GitHub Actions workflow mevcut; commit/push, başarılı run ve branch protection ayrıca doğrulanmalı |
| Release gate | Hazır | `pnpm release:check` environment/deployment girdilerini; `pnpm hosted:check` final-origin page/manifest/ABI/OpenAPI/llms/MCP/x402 parity'sini kontrol eder |

## Production öncesi zorunlu

1. **Metadata URI cutover:** Kontrattaki `http://localhost:3000/api/metadata/` değeri final HTTPS API'ye owner işlemiyle alınmalı; manifest yeniden üretilmeli ve `pnpm deployment:check` tekrar çalışmalıdır.
2. **Authenticated RPC:** Hosted ortamda rate-limit ve availability hedefi olan server-only `RPC_URL` tanımlanmalıdır. Secret provider URL'si hiçbir `NEXT_PUBLIC_*`, manifest, hata veya log alanına yazılmamalıdır.
3. **WalletConnect:** Production mobile/QR coverage için project ID eklenmeli ve gerçek iOS/Android wallet smoke'u çalışmalıdır.
4. **Agent hosted cutover:** Source değişiklikleri Vercel production alias'a deploy edilmeli; agent manifest `200`, MCP initialize/tool list, ücretsiz x402 quote ve fail-closed paid `POST` final origin üzerinde doğrulanmalıdır.
5. **MCP edge güvenliği:** Streamable HTTP Origin doğrulaması, bounded body/timeouts, rate limiting ve abuse monitoring production trafiğine açılmadan tamamlanmalıdır.
6. **Package release:** `@sepbase/sdk`, `@sepbase/react` ve `@sepbase/mcp`; README, license, repository metadata, semver, changelog, signed tag ve npm provenance ile yayınlanmalıdır. Bugün package'lar yalnız workspace/source kullanımına hazırdır.
7. **Yetki operasyonu:** Owner ve treasury değer taşıyan release'te reviewed multisig adreslerine alınmalı; raw deployer key rutin admin aracı olmamalıdır.
8. **Bağımsız audit:** Mainnet veya ekonomik değer öncesi kontrat, deployment/admin runbook'u ve agent/payment trust boundary bağımsız güvenlik incelemesinden geçmelidir.
9. **Hosted write smoke:** Metadata cutover sonrasında final domain üzerinde wallet connect, register, referral deep link, list/buy/claim ve cross-origin SDK akışı yeniden çalıştırılmalıdır.

Server-only `RPC_URL`, WalletConnect project ID ve final metadata origin tamamlanana kadar `pnpm release:check` bilerek başarısız olur. `X402_REGISTRATION_ENABLED=true` de bu release'te ayrıca başarısızdır; paid execution environment ile açılamaz.

## Mevcut otomasyon ve sonraki kalite adımları

SHA-pinned CI workflow frozen install, project/integration artifact validation, build, lint, typecheck, test, production dependency audit ve Foundry fmt/build/size/test adımlarını tanımlar. Canlı deployment check opt-in'dir; funded write smoke CI içinde otomatik çalışmaz. Workflow ancak source commit edilip GitHub'a push edildikten ve başarılı run görüldükten sonra aktif kanıt sayılır.

Önerilen sonraki adımlar:

1. CI workflow'u protected branch için required check yap; contract-size ve generated artifact diff'lerini review'da görünür tut.
2. RPC/API/MCP hata oranı, latency, failed simulation, stale manifest ve solvency reads için privacy-preserving metric/alert ekle.
3. Pause, price/fee update, metadata URI, treasury withdrawal ve ownership transfer için multisig runbook ve rollback kararı yayınla.
4. Name sayfaları için label-specific Open Graph görseli ve canonical metadata doğrulaması ekle.
5. Public API talebi RPC sınırını aşarsa önce cache/rate policy ölç; indexer/read replica'yı yalnız ölçülebilir ihtiyaçla ayrı servis olarak değerlendir.

## Canlı v2'ye eklenmemesi gerekenler ve v3 ayrımı

- Contract runtime boyutu `24,502 B` ve EIP-170 marjı yalnızca `74 B`'dir. Yeni on-chain özellik v2'ye eklenmemeli; kodu bölünmüş yeni major contract version tasarlanmalıdır.
- Auction, offer, subdomain, cross-chain routing, proxy upgrade ve harici name-service entegrasyonu mevcut v2 ürün sözleşmesine eklenmemelidir. Onaylı v3 target içindeki offer/auction ve ENS uyumluluğu; altı authority/state kontratı ile bounded read-only MarketLens'ten oluşan yedi-adres no-proxy release olarak teslim edilmelidir.
- Testnet ETH için sahte USD değeri veya oracle olmayan bağlayıcı "canlı fiyat" gösterilmemelidir.
- V2 core dApp'e database, indexer, queue veya microservice eklenmemelidir. Onaylı ve implementation'ı devam eden v3 paid-x402 target için durable idempotency yalnız ayrı ve denetlenmiş execution boundary içinde kullanılabilir.

## Bilinen release notları

- V1 deployment canlı kalır fakat v1 isimleri v2'ye migrate edilmemiştir. Current app ve manifest yalnızca v2'yi çözer.
- Test smoke isimleri zincirde public test verisi olarak kalır; private key veya secret artifact üretilmez.
- Foundry timestamp lint uyarıları expiration/grace mantığının bilinçli `block.timestamp` kullanımıdır.
- Source-ready bir route'un repository'de bulunması hosted availability kanıtı değildir; her release'te final-origin artifact ve endpoint smoke tekrarlanır.
