# Buradan Başla — Chain Name dApp

Bu repository iki gerçeği birlikte taşır: canlı Base Sepolia v2 historical implementation ve yedi kontratı/ABI'leri/draft manifesti/SDK-API-MCP kaynakları yerelde bulunan fakat henüz acceptance-complete veya deploy edilmiş sayılmayan V3 production target. V3; ENS/text/Unicode canonicalization, commit-reveal, fixed+offer+auction marketplace, durable paid x402 ve açık migration planını kapsar.

## Dosyalar

- `Chain_Name_DApp_Teknik_Sartname_TR.docx` — ilk paket sürümünün arşiv/okuma kopyası; güncel ve bağlayıcı değildir.
- `PROJECT_SPEC.md` — tek güncel, ayrıntılı ve bağlayıcı ürün/teknik şartname.
- `IDE_AI_MASTER_PROMPT.md` — IDE içindeki AI ajanına ilk mesaj olarak verilecek görev talimatı.
- `AGENTS.md` — repository kökünde kalacak sürekli ajan kuralları.
- `IMPLEMENTATION_CHECKLIST.md` — geliştirme fazlarını takip etmek için kontrol listesi.
- `project.config.example.ts` — chain, suffix, fiyat ve marka ayarlarının örnek merkezi konfigürasyonu.
- `INTEGRATION_GUIDE.md` — başka dApp'lerin resolution, settlement, referral ve marketplace entegrasyonu için geliştirici sözleşmesi.
- `docs/AGENT_INTEGRATION.md` — MCP güven sınırı, agent discovery ve `activation-gated` paid x402 sözleşmesi.
- `docs/PRODUCTION_READINESS.md` — source-ready, hosted ve value-bearing production durumlarını birbirinden ayıran release raporu.
- `docs/CLONE_CHECKLIST.md` — başka chain/suffix klonunda deployment ve agent artifact temizliği için kontrol listesi.
- `docs/V3_ARCHITECTURE.md` — altı authority/state kontratı + bounded read-only MarketLens'ten oluşan yedi-adres release, immutable attestor, bounded Universal Resolver, marketplace ve paid-agent mimarisi.
- `docs/THREAT_MODEL_V3.md` — v3 varlıkları, güven sınırları, invariant'lar, normalizasyon attestasyonu ve residual riskler.
- `docs/V3_WEB_UX.md` — normalize/commit/reveal, market, account, fresh-read ve erişilebilirlik interaction contract'ı.
- `docs/HOOD_COMPARISON.md` — hood.ag canlı yüzeyi ile v2/v3 özellik, güven ve runtime-parity karşılaştırması.
- `docs/USER_MARKETPLACE_GUIDE.md` — mevcut v2 listing/referral/proceeds kullanımı ve v3 offer/auction hedefi.
- `docs/MIGRATION_V2_TO_V3.md` — v2 ownership/liability korunarak v3 claim ve cutover planı.
- `docs/V3_ACCEPTANCE_MATRIX.md` — contract, browser, SDK/MCP, x402, migration ve operations kabul matrisi.
- `docs/TRANSACTION_EVIDENCE.md` — authorized write ve release kanıt formatı.
- `.env.example` — gizli ve açık environment değişkenleri için örnek.

Kod ajanına DOCX arşivi ile güncel Markdown şartnamesini birlikte “eşit kaynak” olarak verme. Çelişkide `PROJECT_SPEC.md` başındaki **V3 bağlayıcı hedef ve öncelik kuralı** geçerlidir. Canlı v2'nin x402 yüzeyi hâlâ quote-only'dir; v3 paid x402 yalnız acceptance matrix, audit, durable workflow ve hosted cutover tamamlanınca etkinleşebilir.

## IDE AI ile önerilen kullanım sırası

1. Boş bir Git repository oluştur.
2. `PROJECT_SPEC.md`, `INTEGRATION_GUIDE.md`, `AGENTS.md` ve `IMPLEMENTATION_CHECKLIST.md` dosyalarını repository köküne kopyala.
3. `project.config.example.ts` dosyasını referans olarak sakla. AI, gerçek dosyayı spec'e göre `apps/web/config/project.config.ts` konumunda oluşturacaktır.
4. `.env.example` dosyasını repository köküne koy; gerçek secret değerleri yalnızca `.env.local` veya deployment ortamında tut.
5. `IDE_AI_MASTER_PROMPT.md` içindeki ana prompt'u IDE ajanına gönder.
6. Ajanın önce Faz 0'ı tamamlamasını, komutları çalıştırmasını ve `docs/IMPLEMENTATION_STATUS.md` dosyasını güncellemesini bekle.
7. Her faz sonunda test sonuçlarını kontrol et. Başarısız test, lint, typecheck veya build varken sonraki faza geçmesine izin verme.
8. V2 maintenance ile v3 implementation'ı ayrı workstream/contract version olarak tut. V3'ü önce local chain'de, ardından Base Sepolia'da mainnet disipliniyle doğrula.
9. Testnet deployment'ından sonra oluşan kontrat adresini `deployments/<chainId>.json` manifest'inden frontend'e aktar; adrese source code içinde elle yer verme.
10. Manifest, agent discovery ve `llms.txt` artifact'larını aynı config/deployment kaynağından yeniden üret ve offline integration validation çalıştır.
11. Hosted alias'ın source tree ile aynı release olduğunu varsayma; well-known agent manifesti, MCP initialize ve x402 quote endpoint'ini final origin üzerinde ayrıca smoke et.
12. V3 deployment/migration sırasında v2 manifestini silme veya v2 liabilities'i taşınmış varsayma. Ayrı v3 deployment record, migration evidence ve resolver cutover planı üret.

## IDE AI'ya hangi bilgileri başlangıçta vermelisin?

İlk local geliştirme için herhangi bir gerçek chain bilgisi şart değildir; Anvil kullanılabilir. Testnet deployment aşamasında şu bilgiler gerekir:

- Chain adı
- Chain ID
- Testnet/mainnet flag
- Gerekli transaction confirmation sayısı
- Browser-safe public HTTPS RPC URL
- Hosted API için opsiyonel server-only authenticated RPC URL
- Explorer ana URL'si
- Explorer API URL'si ve gerekiyorsa API key
- Explorer verifier türü (`blockscout`, `etherscan`, `sourcify`)
- Native token adı/sembolü/decimals
- Settlement modu (`native` veya `erc20`)
- ERC-20 modunda token address/name/symbol/decimals
- Kullanılacak suffix (`example`, `chainname` vb.)
- Site adı ve motto
- ERC-721 collection adı ve sembolü
- Logo, mark ve favicon dosyaları
- Accent renk
- Owner adresi
- Treasury adresi
- 4-32 karakter için insan-okunabilir standart yıllık kayıt fiyatı; ilk test profili için `0.0005 ETH`
- 1/2/3 karakter kısa-isim çarpanları; ilk test profili için `100x / 25x / 5x`
- Opsiyonel tarihli fiat referansı; testnet profillerinde zorunlu olarak boş
- Referral ödül oranı; ilk varsayım `%10`
- Marketplace fee oranı; ilk test profili için `%0`
- Grace period gün sayısı
- Site origin ve metadata route path'i
- Chain fee-estimation modeli (`standard` veya doğrulanmış OP Stack oracle adresleri)
- MCP'nin canonical manifest origin'i ve hosted Origin/rate-limit politikası
- V3 için exact normalization profile/fixture hash, managed veya threshold attestor adresi ve bounded attestation validity policy
- V3 için owner'dan ayrı geçici suite-configurator adresi ve one-time wiring ceremony

Canlı v2 için `X402_REGISTRATION_ENABLED=false` kalır; environment doldurmak paid execution eklemez. V3 paid x402 Base Sepolia target'ı manifest-verified Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals, `eip155:84532`) kullanır; gas test ETH ile ayrıdır ve test varlıklarına fiat değer atanmaz. Facilitator, durable store/workflow, managed keeper, spend limits, monitoring ve refund/reconciliation runbook'u production girdileridir; secret değerleri yalnız hosting secret store'da tutulur.

## Temel kararlar ve sürüm ayrımı

### Canlı v2 historical

- Her repository yalnızca bir chain ve bir suffix içindir.
- İlk test deployment'ı Base Sepolia'dır (`84532`).
- Her deployment bağımsızdır.
- Canlı v2, V1'den devralınan tek `ChainNameService.sol` kontratını kullanır.
- Her deployment native coin veya tek standart ERC-20 settlement asset seçer; gas currency ile payment asset ayrıdır.
- Native currency ve settlement name/symbol/decimals manifestte ayrı alanlardır; UI bunları hardcode etmez.
- Label uzunluğu 1-32'dir; 1/2/3 karakter premium schedule'ı manifestten keşfedilir ve contract `quote` ile doğrulanır.
- V2 core dApp backend database, indexer, queue veya microservice kullanmaz.
- Recent names ve Account/Names verileri kontrattan okunur.
- Referral attribution ve ödül bakiyesi on-chain tutulur; ödül kullanıcı tarafından claim edilir.
- Referral ve seller liabilities treasury surplus'ından korunur; solvency bozulursa yeni ekonomik aksiyonlar fail closed olur.
- `/me`, isimler, referral ve satış yönetimini tek hesap görünümünde birleştirir.
- Marketplace configured settlement asset ile sabit fiyatlı satış, on-chain listing enumeration ve seller claim kullanır.
- `/developers`, SDK, OpenAPI ve makine-okunabilir manifest diğer projelerin entegrasyonu için zorunludur.
- MCP public read ve unsigned guarded transaction preparation sağlar; signer, wallet veya broadcast yetkisi yoktur.
- x402 kaynak runtime'ı official V2 negotiation, encrypted CAS, managed signer, on-chain commit/reveal reconciliation ve Workflow `4.6.0` continuation ile bağlanmıştır. Mevcut address-free V3 draft yine `503` döner; `402/202/200` paid akışı ancak live paid-enabled manifest, authenticated RPC, facilitator, store, attestor, pre-funded keeper ve operasyon kapılarının tamamıyla açılır.
- `/admin`; live owner/pending owner ve configured viewer allowlist için gated health, event activity, statistics ve owner controls workspace'idir. Viewer erişimi write yetkisi vermez.
- V2 ENS, Unicode, commit-reveal, offer veya auction sağlamaz; bu bir v2 historical sınırıdır.
- UI beyaz/siyah temel palet ve Base Blue `#0000ff` ile, `Modular Typography` yönünde özgün biçimde hazırlanır.
- Subdomain, cross-chain, DAO ve account abstraction ayrıca onaylanmadıkça v3 dışında kalır.

### V3 source mevcut — deployment ve acceptance pending

- Base Sepolia (`84532`) ilk production-like validation network'üdür.
- Registry, controller, public resolver, bounded Universal Resolver helper, marketplace ve migration için altı authority/state kontratı ile ayrı bounded read-only MarketLens olmak üzere yedi no-proxy adres kullanılır; v2 bytecode'a özellik eklenmez veya v2 proxy ile upgrade edilmez. MarketLens authority/indexer değildir ve write öncesi authoritative state revalidation gerektirir.
- Registry wiring'i immutable suite configurator tarafından `configureSuite(controller,publicResolver,migration,marketplace)` ile bir kez yapılıp kilitlenir; configurator owner değildir. Universal Resolver→registry ve MarketLens→marketplace→registry binding'leri ayrıca doğrulanır.
- ENSIP-15 normalized Unicode, resolver address/text ve forward-confirmed reverse zorunludur. Public resolver ENSIP-10 extended calls, ayrı helper yalnız desteklenen ENSIP-23 simple resolve/reverse profilini sağlar; ilk profilde contenthash/CCIP-Read/smart multicall/full-official-UR iddiası yoktur.
- Registration commit-reveal'dır. Controller'ın immutable EIP-712 attestor'ı profile hash + chain + controller + normalized label hash + recipient + expiry bağını doğrular; commitment exact attestation hash'ini bağlar.
- Fixed listings yanında escrowed offers ve English auctions bulunur.
- Referral, seller, offer refund, outbid refund ve x402 refund liabilities treasury'den korunur.
- SDK/React/MCP public npm release ve runnable examples CI gate'idir.
- Paid x402 V2 durable idempotency/workflow, official adapter, facilitator ve limited keeper olmadan açılamaz.
- V2→v3 migration açık claim, reservation, expiry ve evidence politikası kullanır; v2 claims açık kalır.
- Multisig, audit, observability, incident drill ve final metadata/discovery cutover release gate'idir.

## V3 ana geliştirme sırası

```text
Faz V3-0  Threat model, ENSIP-15/ENS conformance corpus ve API freeze
Faz V3-1  Yedi-adres release (altı authority/state + MarketLens), immutable attestor, dört-argümanlı one-time wiring, helper binding'leri, public+Universal resolver ve commit-reveal Foundry testleri
Faz V3-2  Fixed/offer/auction marketplace + unified liabilities
Faz V3-3  V2 migration controller, snapshot/dry run ve liability isolation
Faz V3-4  Web wallet UX, SDK/React, API/OpenAPI ve compiled examples
Faz V3-5  MCP read/preparation tools ve public npm release hazırlığı
Faz V3-6  Durable official x402 V2 service, facilitator ve limited keeper
Faz V3-7  Audit/remediation, full E2E matrix ve Base Sepolia soak
Faz V3-8  Multisig/observability/final metadata+hosted cutover
```

Bugünkü kanıt Faz V3-1/V3-2 kaynaklarının önemli bölümünü ve V3 SDK/read-API/opt-in MCP adaptörlerini kapsar: `pnpm contracts:test` 91/91 (62 V3 + 29 historical v2), SDK 55/55, MCP 34/34, React 4/4 ve web 229/229 geçer; V3 artifact validator yedi modülü, bir positive ve on fail-closed drift senaryosuyla doğrular. `@sepbase/sdk`, `@sepbase/react` ve `@sepbase/mcp` `0.1.0` public npm'de SLSA provenance taşır ve anonymous clean-consumer smoke geçer. `V3_MIGRATION_SOURCE_BLOCK=44054186 pnpm migration:v3:dry-run` komutu 6/6 aktif v2 adı içeren sabit-blok preflight raporunu yeniden üretir; bu bir V3 deployment/claim/cutover kanıtı değildir. Bu sonuçlar fazları bütünüyle kapatmaz; V3 Base Sepolia deployment, funded browser-wallet/paid-x402 E2E, bağımsız audit ve soak hâlâ yoktur. Current-v2 MCP `/api/mcp`, 39 araçlık opt-in V3 MCP ise `/api/v3/mcp` yolundadır.

## Tamamlanma kontrolü

Ajanın proje tamamlandı demesinden önce aşağıdaki komutların tamamı başarılı olmalıdır:

```bash
forge fmt --check
forge build
forge build --sizes
forge test -vvv
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec tsx scripts/validate-integration-artifacts.ts
```

Ayrıca v3 local chain ve Base Sepolia acceptance ortamında şu akışlar kanıtlanmalıdır; ayrıntı `docs/V3_ACCEPTANCE_MATRIX.md` içindedir:

```text
Unicode normalize edilen isim aranır
→ exact profile/chain/controller/labelHash/recipient/expiry attestasyonu doğrulanır
→ commitment gönderilir
→ minimum age sonrası reveal ve exact fiyat/referral guards ile isim kaydedilir
→ success state görünür
→ public name/profile sayfası açılır
→ profil güncellenir
→ /me içinde isim görünür
→ primary name ayarlanır
→ isim transferinde profile/listing/primary cleanup doğrulanır
→ referral linkiyle ikinci cüzdan kayıt yapar
→ referral reward claim edilir
→ isim fixed markette listelenir, alınır ve seller proceeds alternatif recipient'a claim edilir
→ escrowed offer create/cancel/expire/accept ve buyer refund denenir
→ English auction bid/outbid/refund/extension/finalize/cancel denenir
→ süre ileri alınarak renewal ve grace senaryoları denenir
```

Aynı ekonomik matrix native ve 6-decimal mock ERC-20 ile çalıştırılır; fee-on-transfer reddedilir. Migration duplicate/non-owner/expiry/liability isolation ve paid x402 duplicate/crash/refund/reconciliation senaryoları ayrıca kanıtlanır.
Fiyat, referral oranı, marketplace fee veya ilan değişikliği senaryolarında bütün expected-value guard'larının state/tahsilat öncesinde revert ettiği ayrıca doğrulanmalıdır.
