# Production Readiness Report

Tarih: 2026-07-13

## V3 production target kararı

V3; immutable EIP-712 attestor'lı ENSIP-15 canonicalization, altı authority/state kontratı + bounded read-only MarketLens'ten oluşan yedi-adres no-proxy release, commit-reveal, fixed+offer+auction marketplace, unified refund liabilities, public npm packages, paid x402 V2, migration, multisig/audit ve observability hedefler. Yedi kontrat Base Sepolia'ya deploy ve source-verify edildi; zincir kanıtlı manifest `candidate` durumundadır. **Deployment kanıtı tek başına acceptance-complete veya live anlamına gelmez.** Funded browser, live-V3 hosted cutover, audit/soak ve paid-execution runtime kapıları hâlâ `NOT RUN` durumundadır.

| V3 gate | Bugünkü durum |
|---|---|
| ENSIP-15/ENS conformance corpus | Source PASS; deployment/cross-service runtime pending |
| Immutable EIP-712 attestor/domain/expiry/replacement drill | Contract/source PASS; immutable signer provisioning and incident drill pending |
| Seven addresses: six authority/state contracts + bounded read-only MarketLens | Base Sepolia deploy + source verification + candidate runtime-hash validation PASS |
| One-time registry suite wiring | `configureSuite` receipt and pinned-block binding verification PASS |
| Commit-reveal | Source/tests PASS; funded browser/Base Sepolia E2E pending |
| Offers/auctions/unified refund liabilities | Source/fuzz/invariant tests PASS; funded deployed E2E pending |
| Migration controller/dry run | Controller deployed; fixed-block 6/6 eligibility dry run PASS; claim window/transaction pending |
| Public npm SDK/React/MCP | `0.1.0` public + SLSA provenance + anonymous exact-version clean-consumer smoke PASS |
| Official durable paid x402 V2 | Activation-gated source PASS; external services/funded E2E pending |
| Multisig + independent audit | Safe 1.4.1 2-of-2 is immutable V3 owner/treasury; independent audit pending |
| Observability/incident drill | Pending |
| Final metadata/discovery cutover | V2 metadata and hosted draft discovery PASS; live-V3 cutover pending |

Canlı v2'nin test/smoke kanıtı bu v3 gate'lerini kapatmaz.

## Sonuç

Bu bölüm v2 historical/current durumu anlatır: SEPBASE v2 kontratı Base Sepolia üzerinde canlı, source-verified ve gerçek çoklu hesap write smoke'undan geçmiştir. Metadata URI transaction `0x80a501b33c00e93e2bb6b87f0623b53ed3a42d054cdaa64d37097d3d11032c4b` ile final HTTPS API'ye taşınmış ve beş confirmation sonrasında doğrulanmıştır.

Production deployment `dpl_c1d5EAPfeCZTqMkXfXfHn32Tt1in` [sepbase.vercel.app](https://sepbase.vercel.app) üzerinde `Ready` durumundadır ve temiz Git commit'i `6fd142c82fa7eb05bc8cf7c8cc21232c513ebc37` üzerinden üretilmiştir. Canonical-origin candidate smoke dört sayfayı, sekiz ABI artifact'ını, OpenAPI/`llms.txt`, exact 8+39 MCP tool envanterini, populated V3 manifesti ve V3 market read yüzeyini doğrulamıştır. Neon/CAS production env ve schema deployment'a alınmıştır; unauthenticated internal istek `401 CAS_UNAUTHORIZED` ile reddedilir. Paid route candidate durumunda `503 X402_PAID_EXECUTION_AWAITING_V3` kalır. On beş dakikalık error-log sorgusu sıfır kayıt döndürmüştür. Kanıt `evidence/hosted-release/2026-07-13-v3-candidate-production.json` içindedir. Bu hosted candidate kanıtıdır; funded wallet, authenticated CAS mutation ve live/paid kabul satırlarını kapatmaz.

`@sepbase/sdk`, `@sepbase/react` ve `@sepbase/mcp` `0.1.0`, public GitHub source'tan workflow `29246721839` ile public npm'e SLSA provenance taşıyarak yayınlanmıştır. Exact sürümler authorization header olmadan isolated strict-NodeNext consumer'a kurulmuş, type/runtime smoke geçmiştir. Integrity ve attestation kanıtı `evidence/npm-release/2026-07-13-v0.1.0.json` içindedir.

x402 kaynak durumu **activation-gated**'dir. Official x402 `2.18.0` adapter, encrypted external CAS, payment/authorization uniqueness, server-side secret plan persistence, managed signer, on-chain calldata/receipt/post-state doğrulaması ve Workflow `4.6.0` continuation route'a bağlanmıştır. V3 manifest artık deployed `candidate` olsa da managed signer/attestor/keeper, funded E2E, monitoring ve bağımsız inceleme tamamlanmadığı için paid availability `false` ve route fail closed kalır. Environment değerlerinin varlığı tek başına readiness sağlamaz.

V3 Base Sepolia target settlement/payment profile `eip155:84532`, Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals'dır. Aynı asset immutable protocol settlement ve x402 payment tarafında kullanılmadan paid execution açılamaz. Gas test ETH ile ayrı kalır; test USDC/test ETH'ye fiat değeri atanmaz. Canlı V2 native profile değişmez.

Base Sepolia V3 release'i henüz live değildir. Suite deployment/source verification ve CAS provisioning tamamlandı; managed attestor/keeper, hosted candidate smoke, Safe operasyon runbook'u, rate limiting/monitoring, bağımsız audit ve funded desktop/mobile E2E tamamlanmalıdır. Base mainnet bu release'in hedefi değildir.

## Durum matrisi

| Alan | Durum | Kanıt / sınır |
|---|---|---|
| Contract v2 | Hazır ve canlı | Base Sepolia `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`, verified source |
| Name lifecycle | Hazır | 1-32 karakter, premium tiers, register/renew/release/grace testleri |
| Referral | Hazır | On-chain attribution, expected BPS guard, pull-payment claim smoke |
| Marketplace | Hazır | Fixed price, expected price/fee guard, list/cancel/buy/seller claim smoke |
| Solvency | Hazır | Native + 6-decimal ERC-20, fee-on-transfer reject, invariant testleri |
| Existing hosted web | Production candidate hazır | `dpl_c1d5EAPfeCZTqMkXfXfHn32Tt1in` canonical origin, 4 page + 8 ABI + 8/39 MCP + V3 market ve zero-error log smoke PASS; live-V3 değil |
| V3 contract candidate | Zincirde hazır | Yedi source-verified adres, locked wiring, 8 başarılı receipt ve pinned-block candidate doğrulaması PASS; live cutover değil |
| Agent discovery + MCP | Production candidate hazır | Schema-4 discovery, OpenAPI, `llms.txt`, 8 current-v2 + 39 V3 tool final-origin smoke PASS; signing/broadcast yok |
| x402 quote | Ücretsiz quote hazır | Production HMAC key ID `sepbase-quote-2026-07-13-v1` ile short-lived quote PASS; paid execution unavailable |
| x402 paid execution | Source-ready / activation-gated | Runtime wiring ve local failure/replay tests mevcut; live V3, external services, funded E2E ve audit yok |
| Entegrasyon | Kısmen hazır | Candidate manifest/ABI/API/OpenAPI/`llms.txt`, hosted agent routes ve public/provenanced packages hazır; funded runtime kanıtı bekliyor |
| CI tanımı | Doğrulandı | SHA-pinned GitHub Actions release gates ve npm publish workflow `29246721839` başarılı; branch protection ayrıca yönetilmeli |
| Release gate | Hazır | `pnpm release:check` environment/deployment girdilerini; `pnpm hosted:check` final-origin page/manifest/ABI/OpenAPI/llms/MCP/x402 parity'sini kontrol eder |

## Production öncesi zorunlu

1. **V3 live cutover:** Hosted candidate tamamlandı; live promotion ancak audit/soak/incident/funded-E2E kanıtlarından sonra yapılmalı ve final-origin parity yeniden doğrulanmalıdır.
2. **Authenticated RPC:** Server-only `RPC_URL` hosted ortamda tanımlanmıştır; sohbette açığa çıkan credential rotate edilmeli, ardından rate-limit/availability monitoring eklenmelidir. Provider URL'si hiçbir `NEXT_PUBLIC_*`, manifest, hata veya log alanına yazılmamalıdır.
3. **WalletConnect:** Project ID production deployment'tadır; gerçek iOS/Android connect, chain-switch, disconnect-all ve funded transaction smoke'u çalışmalıdır.
4. **Funded V3 hosted E2E:** External normalization attestation, commit/reveal, resolver/primary, fixed/offer/auction ve bütün claim/refund yolları desktop/mobile wallet'larla final origin üzerinde receipt/post-state ile doğrulanmalıdır.
5. **MCP edge güvenliği:** Streamable HTTP Origin doğrulaması, bounded body/timeouts, rate limiting ve abuse monitoring production trafiğine açılmadan tamamlanmalıdır.
6. **Trusted publishing:** Üç npm package için `publish-packages.yml` + `npm-production` GitHub OIDC trusted publisher tanımlanmalı; doğrulandıktan sonra bootstrap granular token revoke edilmelidir.
7. **Yetki operasyonu:** Base Sepolia 2-of-2 Safe V3 owner/treasury olarak bağlıdır; admin/cutover runbook'u doğrulanmalı, raw deployer key rutin admin aracı olmamalıdır.
8. **Bağımsız audit:** Mainnet veya ekonomik değer öncesi kontrat, deployment/admin runbook'u ve agent/payment trust boundary bağımsız güvenlik incelemesinden geçmelidir.
9. **Hosted write smoke:** V3 cutover sonrasında final domain üzerinde wallet connect, register, referral deep link, resolver, primary, list/offer/auction/buy/claim/refund ve cross-origin SDK akışı çalıştırılmalıdır.

Deployed/live V3 manifest ve diğer release kanıtları tamamlanana kadar `pnpm release:check` bilerek başarısız olabilir. Paid x402 yalnız environment değişkeniyle açılamaz; provisioned durable store, managed signer, facilitator, reconciliation, monitoring ve funded E2E birlikte kanıtlanmalıdır.

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
