# Chain Name DApp - Teknik Ürün ve Uygulama Şartnamesi

**Belge sürümü:** 3.0 hedefi / v2 historical baseline
**Tarih:** 12 Temmuz 2026
**Amaç:** Canlı v2 Base Sepolia sistemini tarihsel olarak korurken, Base Sepolia üzerinde mainnet disipliniyle doğrulanacak ENS-uyumlu, Unicode-normalize, commit-reveal kayıtlı, gelişmiş marketplace ve production agent-payment yüzeyli v3 sürümünü tanımlamak.

---

# V3 bağlayıcı hedef ve öncelik kuralı

Bu bölüm 12 Temmuz 2026 tarihli ürün kararıdır ve aşağıdaki v2/V1 metninde onunla çelişen bütün kapsam dışı bırakma, tek-kontrat, ASCII-only, doğrudan registration, fixed-price-only ve quote-only hükümlerini **v3 hedefi için geçersiz kılar**. Aşağıdaki eski bölümler yalnız canlı v2 davranışını, taşınması gereken invariant'ları ve tarihsel uygulama kanıtını açıklar. Bir özellik bu v3 bölümünde yer alıyor fakat `docs/IMPLEMENTATION_STATUS.md` içinde tamamlanmış olarak işaretlenmiyorsa henüz uygulanmış, deploy edilmiş veya hosted sayılmaz.

## V3.1 Bugünkü gerçek durum

- Canlı ve source-verified kontrat `ChainNameService` v2.0.0'dır; Base Sepolia adresi deployment manifestinde yayımlanır.
- V2 yalnız ASCII `a-z0-9-`, doğrudan registration, tek native/ERC-20 settlement asset ve fixed-price listing destekler.
- V2 ENS registry/resolver/Universal Resolver uyumluluğu, ENSIP-15 Unicode, commit-reveal, offer/bid/auction veya paid x402 execution sağlamaz.
- SDK/React/MCP package kaynakları workspace içinde bulunur; public npm release'i ayrıca doğrulanmadan kurulabilir diye belgelenmez.
- Agent manifesti, MCP HTTP route'u, x402 quote route'u, security/privacy sayfaları ve bu v3 dokümanları hosted origin üzerinde ayrı deployment ve final-origin smoke olmadan live sayılmaz.
- V2 metadata base URI hâlen localhost ise NFT metadata production cutover tamamlanmış değildir.
- V3 yeni bir contract suite ve yeni deployment'tır; v2 adresini veya token state'ini yerinde upgrade etmez.

## V3.2 Production-target ilkeleri

İlk v3 release adayı Base Sepolia (`84532`) üzerinde çalışır fakat mainnet standardında tasarlanır:

Bu ürünün mevcut yayın hedefi **yalnız Base Sepolia**'dır. Bu metindeki “mainnet disiplini” güvenlik, kanıt ve operasyon kalitesini ifade eder; Base mainnet deployment'ı, testnet adlarını mainnet'e taşıma veya cross-chain claim bu release'in parçası değildir. Gelecekte Base mainnet kararı verilirse chain `8453`, ayrı settlement/RPC/facilitator profili, yeni yedi kontrat adresi ve ayrı acceptance evidence ile yeni bir release açılır; Base Sepolia kontratları ya da isim state'i yeniden kullanılmaz.

- threat model, bağımsız audit, fuzz/invariant, testnet soak, incident runbook ve multisig olmadan production-ready denmez;
- bütün contract, API, SDK, MCP ve x402 sonuçları chain ID, contract/suite ID, normalized name, settlement asset ve block/confirmation bağlamı taşır;
- ekonomik state optimistic UI veya in-memory server state'e emanet edilmez;
- bütün public package ve artifact'lar exact version, checksum, provenance ve compatibility matrix yayımlar;
- final HTTPS origin, on-chain metadata URI, manifest, OpenAPI, agent discovery ve `llms.txt` aynı release'i göstermeden hosted cutover yapılmaz;
- Base Sepolia test varlıklarına garantili fiat değeri atfedilmez.

## V3.3 Contract suite ve upgrade sınırı

V2 runtime EIP-170 sınırına çok yakındır. ENS, commit-reveal ve marketplace genişlemesi `ChainNameService.sol` içine eklenmez. İlk v3 release adayı, her biri ayrı adres/ABI checksum ve `VERSION = 3.0.0` yayımlayan **altı authority/state kontratı ile bir bounded read-only MarketLens** olmak üzere toplam yedi no-proxy on-chain adrese ayrılır:

1. `ChainNameRegistryV3`: ENS-compatible registry/base-registrar ownership, lifecycle, node ve token kimliği.
2. `ChainNameControllerV3`: EIP-712 normalization attestation verification, commit-reveal, pricing, settlement ve referral accounting.
3. `ChainNameResolverV3`: address/multicoin/text/name records ve ENSIP-10 `IExtendedResolver` dispatch.
4. `ChainNameUniversalResolverV3`: registry discovery ile desteklenen on-chain kayıtlar için ayrı ENSIP-23 simple `resolve`/`reverse` helper'ı.
5. `ChainNameMarketplaceV3`: fixed listing, escrowed offer ve English auction state machine'leri.
6. `ChainNameMigrationV3`: yalnız ilan edilmiş v2→v3 claim politikası.
7. `ChainNameMarketLensV3`: marketplace enumerable storage üzerinde bounded, indexer-free listing/offer/auction pagination ve stale/terminal offer görünümü; state yazamaz, custody/approval tutamaz ve authority değildir.

Universal resolver adresi public resolver adresi değildir. İlk profil CCIP-Read veya smart multicall sağlamaz ve tam resmi ENS Universal Resolver eşdeğeri diye belgelenemez; manifest yalnız gerçekten uygulanan simple resolve/reverse capability'lerini yayınlar.

Registry'nin immutable `suiteConfigurator` adresi controller, public resolver, migration ve marketplace adreslerini `configureSuite(controller,resolver,migration,marketplace)` ile **tek kez** bağlar; sonra wiring kilitlenir. `suiteConfigurator` protocol owner/multisig rolünden ayrıdır ve kalıcı admin yetkisi değildir. Universal Resolver ayrı immutable registry referansı kullanır; MarketLens immutable marketplace referansından registry'yi türetir. Yedi adresin tamamı manifestte ayrı doğrulanır, fakat `suiteConfigured` yalnız dört stateful registry bağlantısını kanıtlar; Universal Resolver ve MarketLens binding'leri ayrıca okunup doğrulanır.

V3 implementation'ları immutable ve no-proxy'dir. Admin yetkileri reviewed multisig'e aittir; tek EOA production owner olamaz. İlk V3 profili için `owner` ve `treasury`, iki ayrı authority değil aynı reviewed 2-of-2 Safe adresidir; Safe'in imzacıları deploy/configurator EOA ile bağımsız normalization-attestor EOA'dır. Safe, attestor ve one-time suite configurator birbirinden farklı adreslerdir. Emergency pause claim/refund/withdraw yollarını kilitleyemez. Normalization attestor bir sekizinci ownership modülü değildir: controller'a constructor'da bağlanan immutable signer adresidir ve owner tarafından rotate edilemez. MarketLens de yedinci bir authority değildir; yalnız bounded view helper'dır.

## V3.4 ENS, text records ve Unicode canonicalization

V3 bir isim için tek canonical pipeline kullanır:

1. Kullanıcı girdisi UTF-8 olarak alınır.
2. Configured suffix bir kez ayrılır.
3. ENSIP-15 uyumlu normalizer ile normalize edilir; disallowed, mixed-script/confusable ve invalid sequence sonuçları typed hata üretir.
4. UI normalized sonucu kullanıcıya gösterir; raw input sessizce dönüştürülerek imzalanmaz.
5. `labelhash`, `namehash`, commitment, token ID ve resolver node yalnız normalized bytes üzerinden üretilir.

Exact profil `@adraffy/ens-normalize@1.11.1`, Unicode `17.0.0`, CLDR `47`, identifier `ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47` ve profile hash `0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638` olarak pinlenir. Başlangıç corpus'u `fixtures/name-normalization.json` dosyasıdır; release manifesti library/profile ve exact fixture byte SHA-256 değerini yayımlar.

Frontend, SDK, MCP, API ve attestation service bu exact profile/corpus ile canonicalize eder. Kontrat büyük Unicode/confusable tablolarını uyguladığını iddia etmez; bounded UTF-8/code-point kontrollerine ek olarak immutable normalization attestor'ın EIP-712 imzasını doğrular. Direct contract caller kendi label'ını canonical diye self-assert edemez.

EIP-712 domain controller address/chain'e scope edilir ve signed struct tam olarak şunları bağlar:

```text
NormalizationAttestation(
  chainId,
  controller,
  normalizationProfileHash,
  labelHash,
  recipient,
  validUntil
)
```

Controller; registry'deki immutable profile hash'i, `keccak256(normalizedLabelBytes)`, recipient ve kısa ömürlü `validUntil` değerini yeniden kurup immutable attestor adresine karşı doğrular. Forged, expired, aşırı ileri expiry, wrong-profile, wrong-chain, wrong-controller, wrong-label veya wrong-recipient attestation ödeme/state öncesinde revert eder. Attestation tek başına single-use token değildir; **commitment** exact attestation hash'ini bağlar ve commitment single-use'dır. Attestor kaybı/compromise'ı owner setter ile çözülemez; yeni reviewed controller/suite release'i ve versioned manifest cutover gerektirir.

Canonicalization version'ı manifestte yayımlanır; normalization library/profile değişikliği migration/release review gerektirir. Görsel olarak farklı raw input'lar aynı normalized isme gidiyorsa tek labelhash/node/name üretir.

ENS hedefi en az şunları kapsar:

- ERC-165 interface keşfi ve hedeflenen ENS registry/resolver interface ID'leri;
- `addr(bytes32)` ve gerekli coin-type address record davranışı;
- forward resolve ve forward-confirmed reverse/primary resolve;
- text records için `text(node,key)`/`setText`, bounded key/value bytes ve metadata events;
- public resolver üzerinde ENSIP-10 extended resolution ve ayrı Universal Resolver helper üzerinde desteklenen ENSIP-23 simple name→address/reverse→verified-name conformance;
- unsupported CCIP-Read/smart-multicall profillerinin açık capability/error davranışı; tam resmi ENS Universal Resolver iddiası yoktur;
- ilk v3 profile contenthash dahil değildir; ancak ayrı güvenlik/UX kapsamı, interface ve acceptance kararıyla sonraki release'te eklenebilir;
- “ENS-compatible” iddiası ancak conformance matrix tamamlanınca kullanılır.

Text değerleri public ve untrusted veridir. En az `avatar`, `url`, `description`, `com.twitter` ve `com.github` örneklenir; arbitrary key desteği varsa byte limit, gas ve unsafe URL rendering kuralları test edilir. Transfer/migration politikasında eski sahibin identity text'i yeni sahibin kimliği gibi kalamaz.

## V3.5 Commit-reveal registration

Public registration yalnız commit-reveal ile yapılır. Commitment en az şunları bağlar:

```text
chainId + controller + normalized name/node + owner/recipient + duration
+ resolver initialization hash + referrer + settlement asset
+ normalization attestation hash + max/expected registration amount
+ expected referral BPS + secret
```

- Minimum ve maksimum commitment age immutable veya timelocked bounded config'tir; ilk hedef profile `60 seconds <= age <= 24 hours` kullanır.
- Aynı commitment yalnız bir kez tüketilir; expired commitment yeniden kullanılamaz.
- Reveal'da attestation hâlâ geçerli olmalıdır. Attestation değişirse hash değişir ve yeni commitment gerekir; UI/SDK bunu sessiz retry olarak gizlemez.
- Reveal öncesi name/price/pause/solvency yeniden okunur ve expected-value guards tahsilattan önce doğrulanır.
- Secret browser URL, analytics, log, MCP result veya payment payload içine yazılmaz.
- Front-run, copied reveal, wrong owner, wrong duration, wrong referrer, cross-chain/cross-controller replay, early reveal ve expired reveal testleri zorunludur.
- Commit transaction'ı başarılı fakat reveal başarısızsa UI/MCP açık retry/expiry durumu gösterir; kullanıcıya registration tamamlandı denmez.

## V3.6 Marketplace state machines

V3 aynı configured settlement asset içinde üç ayrı satış mekanizması sağlar. Auction ve offer eklemek fixed-price guard'larını kaldırmaz.

### Fixed listing

- Owner ACTIVE ismi exact price, expiry ve current fee/ownership nonce snapshot'ıyla listeler.
- Update/cancel idempotent olmayan açık işlemlerdir; `expectedPrice`, `expectedFeeBps` ve listing nonce korunur.
- Buy öncesi owner, lifecycle, listing nonce, fee snapshot ve exact price yeniden okunur.
- Transfer/re-registration/migration listing'i invalid eder.

### Escrowed offer/bid

- Buyer token/name, intended recipient, amount, expiry, settlement asset ve ownership nonce'a bağlı offer açar.
- Tutar creation sırasında exact-delta ile escrow edilir; seller'a external call yapılmaz.
- Buyer offer'ı kabulden önce iptal edebilir; expiry sonrası herkes finalize/expire edebilir ve buyer refund liability kazanır.
- Seller accept ettiğinde fee snapshot uygulanır, seller proceeds pull balance'a yazılır ve NFT intended recipient'a geçer.
- Ownership/lifecycle değişimi stale offer'ı kabul edilemez yapar; escrow buyer için claimable refund olur.
- Bir buyer'ın aynı offer'ı iki kez cancel/accept/refund etmesi engellenir.

### English auction

- Seller ACTIVE isim için reserve, start/end, minimum increment ve optional anti-sniping extension ile auction açar.
- NFT auction süresince audited escrow/custody modeline girer; doğrudan transfer ile settlement atlanamaz.
- İlk bid'den önce seller cancel edebilir; ilk valid bid'den sonra keyfi cancel edemez.
- Yeni highest bid exact escrow edilir; önceki highest bidder'a doğrudan transfer yerine pull refund liability yazılır.
- End'e yakın bid yalnız bounded extension policy'ye göre süreyi uzatır; sonsuz extension ve timestamp overflow engellenir.
- Finalize permissionless ve tek-seferliktir; reserve sağlanmadıysa NFT seller'a, sağlandıysa winner recipient'a gider ve seller proceeds/fee liability yazılır.
- Auction end'i name expiry safety window'unu aşamaz; GRACE/RELEASED name finalize edilip aktif kimlik gibi satılamaz.

### Bounded MarketLens reads

- `ChainNameMarketLensV3` yalnız marketplace enumerable storage'ını okur; marketplace veya registry state'inin source of truth'u değildir ve indexer garantisi vermez.
- Listing, per-token offer ve auction sayfaları yalnız o pinned block'ta aktif/doğrulanmış kayıtları döndürür. Global, buyer ve owner offer history sayfaları `ACTIVE`, `REFUNDED` ve `ACCEPTED` state'lerini `includeTerminal` ile gösterebilir; aktif fakat lifecycle/owner/nonce nedeniyle geçersiz kayıt `stale=true` taşır.
- `limit` 1-50, tek çağrıda raw scan üst sınırı 100'dür. `nextCursor` raw enumerable index'tir; filtrelenen kayıtlar olsa bile ilerler.
- Marketplace swap-pop cleanup nedeniyle cursor snapshot değildir. Consumer bütün sayfaları aynı block'a pinler, object ID ile dedupe eder ve write öncesi marketplace/registry state'ini yeniden doğrular.

## V3.7 Unified liabilities, settlement ve güvenlik

Korunan toplam en az şunları içerir:

```text
referral rewards
+ fixed-sale seller proceeds
+ accepted-offer seller proceeds
+ cancelled/expired offer refunds
+ outbid/failed-auction refunds
+ auction seller proceeds
+ x402 refund/reconciliation liabilities
```

`settlementBalance >= totalProtectedLiability` supported asset davranışında invariant'tır. Treasury yalnız surplus çeker. Claim/refund recipient sıfır veya protocol contract olamaz; state external call'dan önce azaltılır; başarısız payout tüm state'i revert eder. Native ve 6-decimal standard ERC-20 fixture'ları zorunludur; fee-on-transfer/rebasing/exact delta bozan token reddedilir. Pause, insolvency veya incident mode yeni commit/reveal/list/offer/bid/buy/finalize aksiyonlarını ayrı policy ile durdurabilir fakat cancel, expiry cleanup, refund ve mevcut claim'leri kilitlemez.

## V3.8 Referral ve proceeds kullanıcı sözleşmesi

- İlk hedef reward oranı config-driven'dır; v2 historical profile `%10` referrer reward kullanır.
- Referral yalnız başarılı registration reveal sonucu doğar; renewal, fixed sale, offer veya auction için ayrıca onaylanmadıkça reward yoktur.
- Registrant indirimi yoksa UI bunu açık söyler; Hood veya başka ürünün discount modelini taklit etmez.
- Reward ve bütün marketplace proceeds/refund'ları pull-payment'tır.
- Account UI connected wallet'ı default recipient yapar fakat kullanıcı checksum-validated alternatif recipient seçebilir.
- Loading, unavailable ve gerçek zero birbirinden ayrılır; RPC hatası `0` claimable gibi gösterilmez.

## V3.9 SDK, npm, MCP ve runnable examples

Public release şu package'ları semver, license, repository metadata, changelog, signed tag ve npm provenance ile yayımlar:

```text
@sepbase/sdk
@sepbase/react
@sepbase/mcp
```

SDK; normalize/namehash, commit hazırlama, reveal quote/plan, resolver text/addr, fixed listings, offers, auctions, liabilities, migration ve receipt reconciliation için typed API sağlar. MCP public reads ve unsigned plan üretir; private key tutmaz. Signing/broadcast ayrı wallet/keeper authority'sidir. Dokümandaki TypeScript/Viem/Wagmi/Cast/curl örnekleri gerçek fixture dosyalarından üretilir veya CI'da typecheck/smoke edilir; yayınlanmamış package için çalışan `npm install` komutu gösterilmez.

## V3.10 Paid x402 V2 production boundary

V2 quote-only davranışı tarihsel olarak korunur. V3 paid registration ancak aşağıdaki koşulların **tamamı** sağlanınca etkinleşebilir:

İlk Base Sepolia paid-x402 deployment target'ı CAIP-2 `eip155:84532` üzerinde Circle'ın resmi standard 6-decimal test USDC'sidir: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Bu adres ve decimals deployment config/manifestinde yayımlanır ve on-chain token metadata/code ile release sırasında doğrulanır. Aynı asset controller'ın immutable ERC-20 settlement tokenı ve x402 payment asset'idir; conversion/oracle yoktur. Gas Base Sepolia test ETH ile ayrı ödenir. Test USDC ve test ETH'ye garantili fiat değer atanmaz. Canlı v2 native settlement deployment'ı değişmez ve paid route'u fail closed kalır.

- official x402 V2 core/EVM adapter'ları exact pinli ve runtime'da aktif;
- facilitator endpoint/auth policy'si reviewed ve health-monitored;
- x402 payment asset, protocol'ün immutable standard ERC-20 settlement token'ıyla bire bir aynı; conversion/oracle varsayımı yok;
- durable shared idempotency store ve unique `paymentIdentifier + requestFingerprint + quoteId` constraint'i;
- managed/external signer kullanan, raw key içermeyen, allowlisted controller ve bounded daily/per-order limitli keeper;
- commit→minimum-age wait→reveal→confirmation akışını crash-safe sürdüren durable workflow;
- payment verification, on-chain submission, confirmation, settlement ve refund/reconciliation için kalıcı state machine;
- replay, concurrent duplicate, stale quote, already-registered, partial failure ve response-loss E2E testleri;
- rate limit, abuse protection, alerting, reconciliation dashboard ve operator runbook.

Minimum order state'leri:

```text
quoted -> payment_verified -> commit_submitted -> reveal_ready
-> reveal_submitted -> confirmed -> payment_settled
                         \-> refund_pending -> refunded
                         \-> manual_review
```

HTTP timeout sonrası istemci körlemesine tekrar ödeme yapmaz; payment/order status endpoint'i ile reconcile eder. Registration gerçekleşmeden payment capture edilmemesi tercih edilir. Facilitator semantics capture-before-confirm gerektiriyorsa başarısız registration için durable refund liability ve SLA zorunludur. Paid route production'da `402` negotiation, payment verification ve status/refund semantics yayımlar; config varlığı tek başına activation değildir.

## V3.11 Hosted cutover, metadata ve observability

Cutover öncesi:

1. Final HTTPS origin kesinleşir.
2. Altı authority/state kontratı ile bounded read-only MarketLens'ten oluşan yedi v3 adres source-verified deploy edilir; registry'nin dört-argümanlı one-time suite wiring'i kilitlenir, public/Universal Resolver ayrımı ve MarketLens→marketplace→registry binding'i ayrıca doğrulanır.
3. On-chain metadata/resolver URL'leri final origin'e ayarlanır.
4. Deployment manifest, ENS discovery, agent manifest, OpenAPI, ABI checksums, `llms.txt` ve docs yeniden üretilir.
5. Browser-safe RPC ile server-only authenticated RPC ayrılır.
6. Final origin üzerinde desktop/mobile wallet, REST, SDK, MCP ve x402 smoke tamamlanır.

Observability; RPC/facilitator/keeper latency-error rate, commitment age queue, reveal failures, payment/order state, duplicate attempts, escrow/liability balance, solvency, refund age, auction finalization lag, admin changes ve manifest drift'i kapsar. Loglar secret, signed payload, raw profile content veya authenticated RPC URL içermez. Kritik alert'in owner multisig ve incident runbook karşılığı bulunur.

## V3.12 V2→V3 migration

- V2 kontratı ve bütün v2 referral/seller liabilities claim edilebilir kalır; treasury bunları taşıyamaz.
- V3 migration otomatik ownership iddiası değildir. Active/grace v2 owner, ilan edilmiş migration window içinde live v2 owner/status kontrolü veya audited Merkle proof ile aynı canonical ASCII label'ı bir kez claim eder.
- Eligible v2 label'lar public registration'a karşı migration window boyunca reserve edilir.
- V3 expiry policy v2 expiry'yi azaltmaz; ücretsiz extension varsa süresi ve finansmanı açık governance/release kararıdır.
- Profile/text/resolution yalnız kullanıcı review edip onaylarsa taşınır. Primary, listing, offer, auction, referral ve proceeds state'i otomatik taşınmaz.
- Her migrated label `sourceChainId`, v2 contract, token ID, v2 owner, v3 owner, source block ve transaction hash evidence'i yayımlar.
- Cutover öncesi resolver precedence ve v2 fallback süresi ilan edilir; iki registry aynı anda canonical diye sunulmaz.

## V3.13 Release kabul kapıları

V3 tamamlandı sayılmadan `docs/V3_ACCEPTANCE_MATRIX.md` içindeki bütün contract, browser, API/SDK/MCP, paid-x402, migration, security ve operations senaryoları kanıtlanır. En az şu kapılar zorunludur:

- ENS forward/reverse/text, bounded Universal Resolver profile ve Unicode normalization/attestation conformance;
- immutable attestor, EIP-712 domain/field binding, expiry, direct-call bypass rejection ve replacement-release drill'i;
- yedi adres/ABI checksum/`VERSION` parity'si, dört-argümanlı one-time registry wiring lock ve bağımsız Universal Resolver/MarketLens binding doğrulaması;
- commit-reveal timing, front-run/replay ve price/referral guard testleri;
- fixed listing, offer escrow/refund ve auction bid/outbid/finalize/cancel testleri;
- unified liability/solvency/reentrancy ve native/6-decimal ERC-20/FOT rejection invariant'ları;
- v2 migration eligibility, duplicate claim, expiry ve liability isolation;
- runnable package/examples ve final-origin parity;
- paid x402 duplicate/payment-loss/refund/reconciliation E2E;
- multisig, timelock/pause, monitoring, backup/restore ve incident drill;
- bağımsız audit finding'lerinin kapatılması ve Base Sepolia soak süresi.

V3 uygulama planı, threat model, web interaction contract, kullanıcı rehberi, migration, acceptance ve transaction kanıt formatı için sırasıyla `docs/V3_ARCHITECTURE.md`, `docs/THREAT_MODEL_V3.md`, `docs/V3_WEB_UX.md`, `docs/USER_MARKETPLACE_GUIDE.md`, `docs/MIGRATION_V2_TO_V3.md`, `docs/V3_ACCEPTANCE_MATRIX.md` ve `docs/TRANSACTION_EVIDENCE.md` bağlayıcı yardımcı belgelerdir. Hood karşılaştırması `docs/HOOD_COMPARISON.md` içinde evidence-qualified ürün referansıdır; release doğruluk kaynağı değildir.

---

## 0. Bu belge nasıl kullanılacak?

Bu belge, bir IDE içindeki AI kodlama ajanına verilecek ana teknik şartnamedir. AI ajanı projeyi kendi yorumuna göre büyütmemeli; burada belirtilen kapsam, dosya yapısı, kontrat davranışları, UI kuralları, testler ve kabul kriterleri doğrultusunda adım adım uygulamalıdır.

Bu ürünün temel modeli şudur:

```text
Bir repository
    +
Bir chain konfigürasyonu
    +
Bir marka konfigürasyonu
    +
O chain'e özel yeni kontrat deployment'ı
    =
Bağımsız bir name-service dApp projesi
```

Her yeni chain projesi ayrı olacaktır:

```text
project-alpha-names/
project-beta-names/
project-gamma-names/
```

Projeler aynı web sitesinde toplanmayacak, aynı kontratları veya aynı veritabanını paylaşmayacak ve birbirlerinin isimlerini çözümlemeyecektir. Ortak olan yalnızca geliştirdiğimiz kaynak kod şablonudur.

## 0.1 Bu proje için sabitlenen kararlar

İlk uygulama ve test profili:

```text
Network: Base Sepolia
Chain ID: 84532
Required confirmations: 1
Gas currency: ETH (18 decimals)
Settlement mode: NATIVE
Settlement asset: ETH (18 decimals)
Standard annual registration price (4-32 chars): 0.0005 ETH (500000000000000 base units)
Short-name annual multipliers (1/2/3 chars): 100x / 25x / 5x
Referral reward: %10 (1000 bps, config üzerinden değiştirilebilir)
Marketplace: fixed-price settlement-asset sales, initial fee %0
Design direction: Modular Typography
Core palette: black, white, Base Blue #0000ff
```

`0.0005 ETH` yalnızca ilk Base Sepolia deployment profilinin 4-32 karakterlik standart yıllık fiyatıdır. 1, 2 ve 3 karakterlik label'lar aynı profilde sırasıyla bu taban tutarın 100, 25 ve 5 katıdır. Şablon genelinde ETH, 18 decimals veya native ödeme varsayımı yapılmaz. Başka bir deployment aynı iş mantığını chain'in native coin'iyle (`NATIVE`) veya tek bir standart ERC-20/stablecoin ile (`ERC20`) çalıştırabilir; taban fiyat ve kısa-isim çarpanları config'ten gelir.

Gas currency ile settlement asset ayrı kavramlardır. Kullanıcı transaction gas'ını her zaman chain'in native coin'iyle öder; kayıt, yenileme, marketplace, referral ve seller proceeds ise seçilen settlement asset ile hesaplanır. Settlement asset deployment sırasında constructor'a verilir ve mevcut yükümlülüklerin para birimini değiştirmemek için o deployment'ta immutable kalır. Başka asset için yeni deployment yapılır.

`0.0005 ETH`, ürünün gelecekteki production ekonomisi için yaklaşık `$1` hedefi düşünülerek seçilmiş bir test miktarıdır; ancak Base Sepolia test ETH'sinin gerçek piyasa değeri yoktur. Bu nedenle ilk test profilinde protocol `referenceFiat` değeri `null` kalır. UI, ödeme veya expected-value guard hesabına katılmayan ve açıkça `USD REFERENCE` olarak etiketlenen config-driven bir mainnet spot market göstergesi kullanabilir; bu gösterge test ETH'sine redeemable fiat değeri atfetmez. Production deployment'ında fiat referansı kullanılacaksa currency, amount ve `asOf` tarihi config'ten gelir; oracle yokken bağlayıcı fiyat gibi sunulmaz. Stablecoin deployment'ında da tokenın peg'i garanti edilmez.

Marka adı ve suffix deployment öncesinde ayrıca seçilecektir. Proje Base'in resmi isim servisi olduğunu iddia etmemeli ve resmi Base markasıyla karışacak bir isim kullanmamalıdır.

---

# 1. Yönetici özeti

## 1.1 Ürün nedir?

Ürün; bir EVM chain üzerinde kullanıcıların aşağıdaki gibi okunabilir isimler almasını sağlayan sade bir dApp'tir:

```text
alice.example
builder.example
studio.example
```

Suffix her proje için değiştirilebilir:

```text
.example
.chainx
.nova
.rhoodtest
```

Kullanıcı:

- isim arar,
- müsait olup olmadığını görür,
- yıllık sabit fiyatı ve toplam ödemeyi görür,
- 1 ile 5 yıl arasında kayıt yapar,
- ismini yeniler,
- domain NFT'sini cüzdanında tutar,
- ismini bir EVM adresine bağlar,
- public profil bilgilerini düzenler,
- bir ismi primary name olarak seçer,
- son alınan isimleri görüntüler,
- referral linki oluşturur ve biriken ödülünü claim eder.
- sahip olduğu ismi seçili settlement asset cinsinden sabit fiyatla satışa çıkarır veya marketteki bir ismi satın alır.

## 1.2 Ürün ne değildir?

Bu V1 sürümü aşağıdakileri yapmaz:

- ENS, SPACE ID, ZNS Connect veya başka protokollere bağlanmaz.
- Birden fazla chain'i tek sitede göstermez.
- Cross-chain bridge veya mesajlaşma kullanmaz.
- Açık artırma, teklif sistemi veya domain kiralama içermez.
- Subdomain içermez.
- DAO veya governance token içermez.
- Upgradeable proxy kullanmaz.
- Unicode ve emoji domainleri desteklemez.
- Zorunlu backend, indexer veya veritabanı gerektirmez.
- Kendisini chain'in resmi name service'i olarak tanıtmaz.

## 1.3 V1 için temel teknik karar

V1'de aşırı modüler bir protokol yerine **tek bir akıllı kontrat** kullanılacaktır:

```text
ChainNameService.sol
```

Buradaki “tek kontrat”, projenin deploy ettiği protocol contract sayısını ifade eder. ERC-20 settlement seçilirse configured ödeme tokenı harici ve önceden deploy edilmiş bir dependency'dir; proje yeni token deploy etmez.

Bu kontrat şunları birlikte yönetir:

- ERC-721 domain sahipliği,
- kayıt ve yenileme,
- expiration ve grace period,
- sabit yıllık fiyat,
- domain -> adres çözümleme,
- adres -> primary name çözümleme,
- public profil alanları,
- reserved isimler,
- son kayıt geçmişi,
- referral attribution ve claim edilebilir ödül bakiyesi,
- fixed-price marketplace listing ve satıcı bakiyesi,
- treasury ve temel yönetim.

Bu kararın nedeni, ürünün üçüncü taraf name-service standartlarıyla uyumluluk hedeflememesi ve yeni chain'lerde hızlıca bağımsız dApp olarak çıkarılmasının ana hedef olmasıdır.

## 1.4 Public sayfalar

Public uygulamada beş ana route bulunacaktır:

```text
/                 Ana sayfa, arama, fiyatlar, son alınan isimler
/name/[label]     Müsaitlik, kayıt veya public profil ve yönetim
/me               Names, Referrals ve Listings & Proceeds hesap görünümü
/market           Aktif satış ilanları ve marketplace keşfi
/developers       Kontrat, SDK, API ve entegrasyon dokümantasyonu
```

Yetkili operasyon route'u public navigasyonun parçası değildir:

```text
/admin            Allowlist-gated contract health, activity, statistics and owner controls
```

`/admin` linki yalnız bağlı cüzdan canlı contract owner/pending owner veya configured viewer allowlist içindeyse görünür. Yetkisiz doğrudan route isteği dashboard verisini mount etmez; connect, wrong-network veya access-denied gate'i gösterir.

Kayıt, yenileme ve profil düzenleme ayrı sayfalar değil; dialog veya drawer içinde tamamlanır.

Destekleyici route'lar:

```text
/r/[referrer]                         Referral attribution girişi
/api/name/[label]                     Read-only lifecycle/availability/quote state
/api/resolve/[label]                  Read-only name resolution
/api/reverse/[address]                Read-only primary-name lookup
/api/market                           Read-only marketplace listings
/api/metadata/[tokenId]               NFT metadata
/api/image/[tokenId]                  NFT görseli
/api/openapi.json                     API sözleşmesi
/.well-known/chain-name-service.json  Makine-okunabilir entegrasyon manifesti
/llms.txt                             AI araçları için kısa dokümantasyon indeksi
```

---

# 2. Ürün ilkeleri

## 2.1 Tek chain, tek suffix, tek proje

Her deployment yalnızca bir chain ve bir suffix için çalışır.

Örnek:

```text
Chain: Base Sepolia
Chain ID: 84532
Suffix: .example
Site: not selected
Contract: not deployed
```

Yeni bir chain bulunduğunda mevcut proje klonlanır, konfigürasyon değiştirilir ve kontrat o chain'e yeniden deploy edilir.

## 2.2 Bağımsızlık

Her klon:

- kendi Git repository'sine,
- kendi kontrat adresine,
- kendi frontend deployment'ına,
- kendi marka dosyalarına,
- kendi RPC ve explorer ayarlarına,
- kendi owner ve treasury adresine

sahip olabilir.

## 2.3 Sadelik

Bir özelliğin V1'in ana kullanıcı akışına katkısı yoksa eklenmemelidir. Kod ajanı “ileride lazım olabilir” gerekçesiyle yeni servisler, protokoller veya soyutlama katmanları eklememelidir.

## 2.4 Tasarım kalitesi

Teknik kapsam sade olsa da UI sıradan bir Web3 template'i gibi görünmemelidir. Marka hissi; `Modular Typography`, güçlü boşluk kullanımı, net bir isim plakası objesi, siyah-beyaz temel palet ve configured accent (ilk profilde Base Blue) üzerinden kurulmalıdır. Tipografi yalnızca metin stili değil, grid'i ve bilgi hiyerarşisini kuran ana görsel sistemdir.

## 2.5 Konfigürasyonla yeniden markalama

Aşağıdakiler merkezi konfigürasyondan değişmelidir:

- proje adı,
- suffix,
- motto,
- açıklama,
- logo ve favicon,
- tema/composition mode,
- vurgu rengi,
- chain ID/name/testnet flag/required confirmations,
- RPC,
- explorer browser URL/verifier ayarları,
- native currency,
- collection name ve symbol,
- site origin ve metadata path,
- fiyatlar,
- kayıt süreleri,
- grace period,
- referral ödül oranı ve attribution süresi,
- marketplace fee oranı ve sayfalama limiti,
- admin viewer allowlist'i, event log chunk aralığı ve activity sayfa boyutu,
- settlement modu (`NATIVE` veya `ERC20`),
- settlement token adresi, name, symbol ve decimals,
- opsiyonel ve tarihli fiat referansı,
- opsiyonel UI market-reference provider/asset/currency/cache ayarları,
- owner,
- treasury.

Kontratın ana iş mantığı ve sayfa yapısı her klonda mümkün olduğunca değişmeden kalmalıdır.

---

# 3. V1 fonksiyonel kapsam

## 3.1 Kullanıcı özellikleri

| Özellik | V1 davranışı |
|---|---|
| Cüzdan bağlama | Injected wallet zorunlu; WalletConnect opsiyonel |
| Ağ kontrolü | Kullanıcı yanlış ağdaysa tek tıkla doğru ağa geçiş |
| İsim arama | Label yazar; suffix otomatik görünür |
| Müsaitlik | Doğrudan kontrattan okunur |
| Fiyat | Her geçerli label için deployment config'inde belirlenen sabit yıllık settlement tutarı |
| Kayıt süresi | 1, 2, 3, 4 veya 5 yıl |
| Kayıt | Native settlement'ta tek contract transaction'ı; ERC-20 allowance yetersizse approval + register; commit-reveal yok |
| Yenileme | Expiration + grace period bitmeden yapılabilir |
| Sahiplik | ERC-721 NFT |
| Adres çözümleme | İsim bir EVM adresine bağlanır |
| Primary name | Kullanıcı sahip olduğu ve kendi adresine çözülen bir ismi primary seçer |
| Public profil | Display name, bio, avatar, website, X, GitHub |
| Profil düzenleme | Domain sahibi veya onaylı operator |
| Account Names | ERC-721 enumeration üzerinden okunur |
| Son alınan isimler | Kontratın bounded recent-registration ring buffer'ından okunur |
| Explorer bağlantısı | Transaction, adres ve kontrat linkleri |
| Referral linki | Referrer adresiyle configured süreli attribution; ilk profil 30 gün |
| Referral ödülü | Her başarılı `register` işleminde (released re-registration dahil) ilk profil oranı `%10`; on-chain bakiyeye yazılır |
| Referral claim | Kullanıcı seçili settlement asset cinsindeki ödülünü kendisi çeker |
| Marketplace keşfi | Aktif listing'ler doğrudan kontrattan sayfalı okunur |
| Satışa çıkarma | Owner aktif ismini settlement asset cinsinden listeler veya fiyatı günceller |
| Satın alma | Alıcı onayladığı exact listing fiyatını öder; buy çağrısında NFT transfer olur, ERC-20 allowance yetersizse önce approval gerekir |
| Satıcı geliri | Pull-payment bakiyesine yazılır ve satıcı tarafından claim edilir |
| Geliştirici entegrasyonu | SDK, ABI, REST read API, OpenAPI ve örnekler |

## 3.2 Yönetici özellikleri

V1 `/admin` workspace'i doğrudan canlı kontrat reads ve event loglarıyla çalışır; backend database veya indexer eklemez. Üç görünüm sağlar:

- Overview: solvency, pause state, supply/listing sayıları, settlement balance, protected liabilities, treasury available, pricing ve deployment identity.
- Activity: deployment block'tan itibaren isim, market, referral, treasury ve configuration event'leri; kategori/arama filtresi, block ve transaction explorer linki.
- Controls: kontratın owner yönetim fonksiyonları için input validation, review dialog, transaction simulation, wallet confirmation, receipt ve error state.

Canlı contract owner ve pending owner otomatik erişim alır. Ek read-only viewer adresleri merkezi config/`NEXT_PUBLIC_ADMIN_ADDRESSES` üzerinden tanımlanır. Viewer allowlist istemci tarafında görünür bir UI erişim sınırıdır; public blockchain verisini gizli yapmaz. Owner-only write butonları viewer için disabled kalır ve kontrat access control'ü nihai güvenlik sınırıdır. Pending owner yalnız `acceptOwnership()` aksiyonunu kullanabilir.

Owner şunları değiştirebilir veya çalıştırabilir:

- yıllık sabit fiyat,
- referral ödül oranı,
- marketplace fee oranı,
- reserved isimler,
- treasury adresi,
- metadata base URI,
- yeni kayıtların geçici olarak durdurulması,
- yeni listing ve buy işlemlerinin geçici olarak durdurulması,
- kontrat ownership transferi.
- yalnız protected liabilities dışındaki treasury bakiyesini çekme,
- configured settlement token dışındaki yanlışlıkla gönderilmiş ERC-20'yi recovery,
- ERC-20 settlement deployment'ında beklenmeyen native bakiyeyi sweep.

Yenilemeler, yeni kayıtlar durdurulsa bile çalışmaya devam etmelidir. Marketplace pause sırasında listing ve buy kapanır; cancel, invalidate ve bütün claim işlemleri açık kalır.

Annual price, fee, treasury, owner veya metadata değişikliklerinden sonra manifest/config release sync zorunludur. Admin paneli private key tutmaz veya server-side signer gibi davranmaz; bütün write'lar bağlı owner wallet tarafından imzalanır. Foundry/Cast admin akışı emergency fallback olarak korunur.

---

# 4. İsim kuralları

## 4.1 Desteklenen karakterler

V1 yalnızca şu karakterleri kabul eder:

```text
a-z
0-9
-
```

## 4.2 Normalizasyon

Frontend kullanıcı girdisini:

1. baştaki ve sondaki boşluklardan temizler,
2. küçük harfe çevirir,
3. kullanıcı tam olarak `.<configuredSuffix>` ile bitirdiyse bu eki bir kez kaldırır; başka bir noktalı suffix'i dönüştürmez,
4. izin verilmeyen karakterleri gösterir ancak sessizce değiştirmez,
5. normalize edilmiş label'ı kontrata gönderir.

Kontrat frontend'e güvenmez ve aynı kuralları tekrar doğrular.

## 4.3 Geçerlilik kuralları

- Minimum uzunluk: 1 karakter.
- Maksimum uzunluk: 32 karakter.
- Tire ilk veya son karakter olamaz.
- Arka arkaya iki tire kullanılamaz.
- Nokta kullanılamaz; suffix kontrata gönderilmez.
- Unicode, Türkçe karakter ve emoji V1'de kabul edilmez.

Suffix config ve contract state içinde başında nokta olmadan tutulur (`example`). `fullName` yalnızca gösterim sırasında `label + "." + suffix` üretir. Frontend suffix'i iki kez eklememelidir.

Geçerli örnekler:

```text
a
ab
abc
alice
alice-01
web3builder
studio7
```

Geçersiz örnekler:

```text
<empty>
-alice
alice-
al--ice
alice.example
ali_ce
ali ce
```

## 4.4 Token ID

Token ID label'dan deterministik üretilir:

```solidity
uint256 tokenId = uint256(keccak256(bytes(label)));
```

Suffix her kontratta tek olduğu için token ID hesaplamasına suffix eklenmesi zorunlu değildir. Her proje zaten ayrı chain ve ayrı kontrat deployment'ıdır.

---

# 5. Settlement, fiyatlandırma ve süre modeli

## 5.1 Tek settlement asset

Her deployment bütün ekonomik akışlar için tek bir settlement asset kullanır:

```solidity
enum SettlementKind {
    NATIVE,
    ERC20
}

enum NameStatus {
    UNREGISTERED,
    ACTIVE,
    GRACE,
    RELEASED
}
```

| Mod | Contract değeri | Tahsilat | Ödeme/claim |
|---|---|---|---|
| `NATIVE` | `settlementToken == address(0)` | `msg.value` | native coin transferi |
| `ERC20` | doğrulanmış token contract adresi | `SafeERC20.safeTransferFrom` | `SafeERC20.safeTransfer` |

Settlement asset; registration, renewal, referral reward, marketplace fiyatı, seller proceeds ve treasury geliri için aynıdır. Gas ücreti ise her zaman chain'in native currency'siyle ödenir ve settlement asset'ten bağımsızdır.

Settlement kind ve token adresi deployment sırasında belirlenir ve immutable kalır. Mevcut bakiyelerin ve claim yükümlülüklerinin para birimini sonradan değiştirmek yasaktır. Başka settlement asset için yeni contract deployment yapılır.

ERC-20 modunda yalnızca standart balance/allowance/transfer davranışına sahip tokenlar desteklenir. Fee-on-transfer, rebasing ve transfer miktarını değiştiren tokenlar V1'de desteklenmez. Pre-deployment check token adresinde bytecode bulunduğunu ve configured symbol/decimals ile `IERC20Metadata` sonucunun eşleştiğini doğrular; post-deployment smoke test küçük bir gerçek işlemle exact balance delta davranışını doğrular.

## 5.2 Standart yıllık fiyat ve kısa-isim katmanları

Her deployment 4-32 karakterlik label'lar için bir standart yıllık fiyat ve 1/2/3 karakterlik label'lar için üç sabit premium çarpanı tanımlar. Config taban fiyatı insan-okunabilir decimal string, çarpanları ise descending pozitif integer tuple olarak tutar:

```ts
type ProjectPaymentConfig = {
  settlement: {
    kind: 'native' | 'erc20';
    tokenAddress: null | `0x${string}`;
    name: string;
    symbol: string;
    decimals: number;
  };
  pricing: {
    annual: string;
    shortNameMultipliers: readonly [number, number, number];
    referenceFiat: null | {
      currency: string;
      amount: string;
      asOf: string;
      maxAgeDays: number;
    };
    marketReference: null | {
      provider: 'coinbase';
      asset: string;
      currency: string;
      cacheSeconds: number;
    };
  };
};
```

Örnekler:

```text
Base Sepolia native: annual = "0.0005", decimals = 18
USDC deployment:     annual = "1",      decimals = 6
18-decimal altcoin:  annual = "25",     decimals = 18
```

İlk Base Sepolia profili için yıllık tarife:

| Label uzunluğu | Çarpan | Yıllık tutar |
|---:|---:|---:|
| 1 | 100x | `0.05 ETH` |
| 2 | 25x | `0.0125 ETH` |
| 3 | 5x | `0.0025 ETH` |
| 4-32 | 1x | `0.0005 ETH` |

Deployment script'i her durumda `parseUnits(pricing.annual, settlement.decimals)` kullanır. `parseEther`, `formatEther`, `wei` etiketi veya 18-decimal varsayımı ortak kodda kullanılmaz. Kontrat settlement asset'in en küçük birimindeki `uint256 annualPrice` standart taban değerini ve 1/2/3 karakter çarpanlarını packed immutable `uint24` olarak saklar. `quote(label, years)` label byte uzunluğuna göre doğru katmanı seçer; register ve renew aynı hesap yolunu kullanır. `setAnnualPrice` taban fiyatı değiştirir ve bütün katmanlar aynı oranda ölçeklenir; çarpanlar deployment boyunca immutable kalır.

Çarpanların her biri `1..255` içinde, `one >= two >= three >= 1` olmalıdır. Maksimum annual-price guard'ı en yüksek olası çarpan ve beş yıllık süreyi hesaba katar. Manifest çarpan tuple'ını açık biçimde yayınlar; consumer tutarı kendi başına tahmin etmek yerine kritik write öncesinde kontrat `quote` sonucunu yeniden okur.

Fiat referansı opsiyoneldir, yalnızca display amaçlıdır ve ödeme hesabına katılmaz. `currency` ISO 4217 kodu, `amount` pozitif decimal string, `asOf` ISO `YYYY-MM-DD` tarihi, `maxAgeDays` pozitif integer olmalıdır. Base Sepolia gibi testnet deployment'larında `referenceFiat` zorunlu olarak `null` kalır. Oracle olmayan production profillerinde referans tarihi görünür; `asOf + maxAgeDays` geçmişse fiat satırı otomatik gizlenir.

`marketReference`, protocol manifest fiyatı veya oracle değildir. Configured settlement symbol ile aynı `asset`, display currency ve kısa cache süresiyle server-side public spot endpoint'i okur; yalnız UI'da `~ USD ... REFERENCE` biçiminde gösterilir. Fetch hatası registration/market/write akışını engellemez. Bu veri quote, allowance, expected amount, reward, fee, proceeds veya contract write argümanına hiçbir zaman katılmaz.

## 5.3 Kayıt süresi

Desteklenen süre:

```text
1, 2, 3, 4 veya 5 yıl
```

Fiyat formülü:

```text
annualPriceBaseUnits * durationYears
```

Oracle veya dinamik piyasa fiyatı kullanılmaz. Owner yıllık fiyatı aynı settlement asset'in base unit'i cinsinden güncelleyebilir.

Bir protocol year tam `365 days` olarak tanımlanır; takvim/leap-year hesabı yapılmaz. UI yeni expiration tarihini contract quote ve timestamp kurallarıyla aynı şekilde hesaplar.

## 5.4 Tahsilat, payout ve allowance davranışı

Native mod:

```text
msg.value == requiredAmount
```

ERC-20 mod:

```text
msg.value == 0
allowance(payer, contract) >= requiredAmount
balanceBefore/After delta == requiredAmount
```

ERC-20 tahsilatı `SafeERC20.safeTransferFrom` ile yapılır. Balance delta tam tutarı vermiyorsa işlem revert eder; bu kontrol fee-on-transfer tokenların accounting invariant'larını bozmasını engeller. Payout ve claim işlemleri native modda güvenli native transfer, ERC-20 modda `SafeERC20.safeTransfer` kullanır.

ERC-20 collection hem payer azalmasını hem contract artışını, payout ise contract azalmasını ve recipient artışını exact amount ile doğrular. Claim recipient sıfır adres veya contract'ın kendisi olamaz.

Native modda kayıt/renewal/buy tek contract transaction'ıdır. ERC-20 modunda yeterli allowance yoksa kullanıcı önce token approval transaction'ı, ardından ana işlemi imzalar. UI varsayılan olarak yalnızca gereken tutar kadar approval ister; sınırsız approval varsayılan olamaz. Permit entegrasyonu opsiyoneldir ve permit desteklemeyen smart-contract wallet'lar için normal approval yolu her zaman kalır.

Fazla native ödeme veya yanlışlıkla gönderilen `msg.value` kabul edilmez. Doğrudan contract adresine yapılan native transferler explicit payable entry point dışında reddedilir. Contract'a doğrudan gönderilen ERC-20 settlement tokenları payer'a bağlanamaz; liability üstündeki surplus olarak görünür ve treasury tarafından çekilebilir. UI kullanıcıyı contract adresine manuel token göndermemesi konusunda uyarmalıdır.

Geçerli referral varsa registration ücretinin configured basis-point kısmı referrer'ın aynı settlement asset cinsindeki claimable bakiyesine yazılır. Referral ödülü renewal veya marketplace satışında oluşmaz.

Marketplace listing fiyatı seller tarafından settlement asset base unit'i cinsinden belirlenir. Fee değişirse seller bakiyesine `price - fee`, treasury payına `fee` ayrılır.

Korunan yükümlülük:

```text
totalProtectedLiability = totalReferralLiability + totalMarketplaceLiability
isSolvent = settlementBalance(contract) >= totalProtectedLiability
treasuryAvailableBalance = isSolvent ? settlementBalance(contract) - totalProtectedLiability : 0
```

## 5.5 Expiration ve grace period

Varsayılan grace period:

```text
30 gün
```

Durumlar:

```text
ACTIVE     block.timestamp <= expiresAt
GRACE      expiresAt < block.timestamp <= expiresAt + gracePeriod
RELEASED   block.timestamp > expiresAt + gracePeriod
```

Davranış:

- ACTIVE: isim çalışır, transfer edilebilir, listelenebilir ve yenilenebilir.
- GRACE: isim başka kullanıcı tarafından alınamaz; resolution ve mevcut ownership devam eder, transfer mümkündür, fakat marketplace listing/buy kapalıdır. Herhangi biri renewal ücretini ödeyebilir.
- RELEASED: grace bitmiştir; label reserved değilse yeniden kayıt için müsaittir. Eski ERC-721 token yeni kayıt gerçekleşene kadar teknik olarak mevcut olabilir; ancak resolution, transfer, profile update, primary seçimi, listing ve buy kapalıdır. Yeni registration eski tokenı burn eder, bütün ilişkili state'i temizler ve aynı token ID'yi yeni recipient'a mint eder.

Resolution grace period sonuna kadar çalışır. UI GRACE durumunu “Expired - renewal grace period”, reserved olmayan RELEASED durumunu ise “Released - available for registration” olarak açıkça gösterir. Reserved released label ayrı “Reserved” state'ine gider. `ownerOf()` sonucunun RELEASED durumda kayıt hakkı anlamına gelmediği dokümante edilir.

---

# 6. Akıllı kontrat mimarisi

## 6.1 Dosya

```text
contracts/src/ChainNameService.sol
```

## 6.2 Kullanılacak temel kütüphaneler

- OpenZeppelin ERC721Enumerable
- OpenZeppelin IERC20 ve SafeERC20
- OpenZeppelin Address
- OpenZeppelin SafeCast
- OpenZeppelin Math
- OpenZeppelin Ownable2Step
- OpenZeppelin ReentrancyGuard
- ERC-4906 metadata update event desteği

Upgradeable proxy kullanılmaz.

## 6.3 Kalıtım önerisi

```solidity
contract ChainNameService is
    ERC721Enumerable,
    Ownable2Step,
    ReentrancyGuard,
    IERC4906
{
    // ...
}
```

`IERC4906` kullanılan OpenZeppelin sürümünde hazır değilse EIP-4906'daki minimal interface yerel olarak tanımlanır. `supportsInterface(0x49064906)` true dönmelidir. `MetadataUpdate` yalnızca metadata JSON'unda görünen veri değiştiğinde emit edilir; mint ve burn için ayrıca emit edilmez.

`supportsInterface` override'ı `ERC721Enumerable`/ERC-721 sonuçlarını korur ve ERC-4906 interface ID'sini ekler; ERC-165, ERC-721 ve ERC-721 Metadata desteğini yanlışlıkla düşürmez.

Kod ajanı pinlenmiş OpenZeppelin API'sine göre doğru override'ları kullanmalıdır. OpenZeppelin 5.x ailesinde ownership, enumeration, listing cleanup ve lifecycle kısıtları tek `_update(to, tokenId, auth)` override'ında, `super._update` ile uyumlu biçimde uygulanır. İnternetten eski `_beforeTokenTransfer` örneği kopyalanmaz.

Timestamp değerleri `SafeCast.toUint64` ile yazılır; kontrolsüz downcast kullanılmaz.

## 6.4 Ana sabitler

```solidity
string public constant VERSION = "2.0.0";
uint64 internal constant YEAR = 365 days;
uint8 internal constant MIN_DURATION_YEARS = 1;
uint8 internal constant MAX_DURATION_YEARS = 5;
uint8 internal constant MIN_LABEL_LENGTH = 1;
uint8 internal constant MAX_LABEL_LENGTH = 32;
uint8 internal constant MAX_SUFFIX_LENGTH = 16;
uint8 internal constant MAX_COLLECTION_NAME_BYTES = 64;
uint8 internal constant MAX_COLLECTION_SYMBOL_BYTES = 16;
uint8 internal constant MAX_RECENT_QUERY = 20;
uint16 internal constant RECENT_CAPACITY = 100;
uint8 internal constant MAX_LISTING_QUERY = 50;
uint16 internal constant MAX_RESERVED_BATCH = 100;
uint64 internal constant MIN_GRACE_PERIOD = 1 days;
uint64 internal constant MAX_GRACE_PERIOD = 90 days;
uint16 internal constant BPS_DENOMINATOR = 10_000;
uint16 internal constant MAX_REFERRAL_REWARD_BPS = 2000;
uint16 internal constant MAX_MARKETPLACE_FEE_BPS = 500;
uint256 internal constant MAX_ANNUAL_PRICE =
    type(uint256).max / (uint256(type(uint8).max) * MAX_DURATION_YEARS);
```

Yalnızca `VERSION` public getter üretir. Diğer limitler runtime bytecode'u EIP-170 sınırı altında tutmak için internal kalır; public entegrasyon bunları manifest `nameRules`, documented protocol limits ve contract behavior üzerinden doğrular.

## 6.5 Ana veri yapıları

```solidity
struct Profile {
    string displayName;
    string bio;
    string avatar;
    string website;
    string twitter;
    string github;
}

struct RecentRegistration {
    uint256 tokenId;
    string label;
    address owner;
    uint64 registeredAt;
    uint64 expiresAt;
}

struct Listing {
    uint256 tokenId;
    address seller;
    uint256 price;
    uint64 listedAt;
    uint16 feeBps;
}

enum SettlementKind {
    NATIVE,
    ERC20
}
```

State önerisi:

```solidity
string public suffix;
address public treasury;
uint64 public gracePeriod;
bool public registrationsPaused;
bool public marketplacePaused;

SettlementKind public immutable settlementKind;
IERC20 public immutable settlementToken;
uint24 private immutable _shortNamePriceMultipliers;
uint256 public annualPrice;
uint16 public referralRewardBps;
uint256 public totalReferralLiability;
uint16 public marketplaceFeeBps;
uint256 public totalMarketplaceLiability;

string public metadataBaseURI;

mapping(uint256 => string) private _labels;
mapping(uint256 => uint64) public expiresAt;
mapping(uint256 => address) public resolvedAddress;
mapping(uint256 => Profile) private _profiles;
mapping(address => uint256) public primaryTokenId;
mapping(address => bool) public hasPrimary;
mapping(bytes32 => bool) public reservedLabels;
mapping(address => uint256) public referralBalance;
mapping(uint256 => Listing) public listings;
mapping(address => uint256) public sellerBalance;
mapping(uint256 => uint256) private _listingIndexPlusOne;

RecentRegistration[RECENT_CAPACITY] private _recentRegistrations;
uint16 private _recentCount;
uint16 private _recentCursor;
uint256[] private _listingTokenIds;
```

## 6.6 Constructor parametreleri

```solidity
constructor(
    string memory collectionName,
    string memory collectionSymbol,
    string memory suffix_,
    address initialOwner,
    address treasury_,
    uint64 gracePeriod_,
    SettlementKind settlementKind_,
    address settlementToken_,
    uint256 annualPrice_,
    uint24 shortNamePriceMultipliers_,
    uint16 referralRewardBps_,
    uint16 marketplaceFeeBps_,
    string memory metadataBaseURI_
)
```

Constructor şunları doğrular:

- suffix 1..MAX_SUFFIX_LENGTH byte, lowercase `a-z0-9` ve noktasız,
- owner sıfır veya contract'ın kendi adresi değil,
- treasury sıfır veya contract adresi değil,
- grace period `MIN_GRACE_PERIOD..MAX_GRACE_PERIOD` içinde,
- `NATIVE` modda settlement token sıfır adres,
- `ERC20` modda settlement token sıfır adres değil ve contract bytecode içeriyor,
- annual price `1..MAX_ANNUAL_PRICE` içinde,
- packed 1/2/3 karakter çarpanları `one >= two >= three >= 1` ve her biri `uint8` içinde,
- referral reward `MAX_REFERRAL_REWARD_BPS` sınırını aşmıyor,
- marketplace fee `MAX_MARKETPLACE_FEE_BPS` sınırını aşmıyor,
- collection name/symbol sırasıyla 1..MAX_COLLECTION_NAME_BYTES ve 1..MAX_COLLECTION_SYMBOL_BYTES içinde,
- metadata base URI boş değil ve `/` ile bitiyor.

`Ownable2Step`, `Ownable(initialOwner)` constructor'ını açıkça çağırmalıdır. Settlement token address immutable'dır; owner tarafından değiştirilebilen bir setter bulunmaz.

## 6.7 Public read fonksiyonları

Beklenen API:

```solidity
function tokenIdFor(string calldata label)
    public
    pure
    returns (uint256);

function isValidLabel(string calldata label)
    public
    pure
    returns (bool);

function isAvailable(string calldata label)
    public
    view
    returns (bool);

function statusOf(uint256 tokenId)
    public
    view
    returns (NameStatus);

function quote(string calldata label, uint8 durationYears)
    public
    view
    returns (uint256);

function fullName(uint256 tokenId)
    public
    view
    returns (string memory);

function resolve(string calldata label)
    external
    view
    returns (address);

function profileOf(uint256 tokenId)
    external
    view
    returns (Profile memory);

function primaryNameOf(address account)
    external
    view
    returns (string memory);

function getRecentRegistrations(uint256 limit)
    external
    view
    returns (RecentRegistration[] memory);

function getListings(uint256 offset, uint256 limit)
    external
    view
    returns (Listing[] memory page, uint256 total);

function treasuryAvailableBalance()
    public
    view
    returns (uint256);

function totalProtectedLiability()
    public
    view
    returns (uint256);

function isSolvent()
    public
    view
    returns (bool);

function settlementBalance()
    public
    view
    returns (uint256);

function metadataBaseURI()
    external
    view
    returns (string memory);
```

`resolve(label)` yalnızca token ACTIVE/GRACE ise stored resolution'ı döndürür; bulunmayan, RELEASED veya bilerek resolution'ı temizlenmiş isimlerde revert etmek yerine `address(0)` döner. `statusOf` bütün frontend, metadata ve contract kontrollerinin tek lifecycle kaynağıdır. Convenience `isInGrace` ve `isResolvable` getter'ları ABI'de yoktur; consumer bunları `statusOf` ve `resolvedAddress` ile türetir.

`isAvailable(label)` label/lifecycle/reservation semantiğidir; registration pause veya protocol solvency'yi içine katmaz. UI/API transaction yapılabilirliğini ayrıca `canRegister = isAvailable && !registrationsPaused && isSolvent()` ile türetir.

Read hata davranışı:

- `tokenIdFor(label)` hash üretir, label validity kontrol etmez.
- `isAvailable(invalidLabel)` false döner.
- Reservation read'i `reservedLabels(keccak256(bytes(label)))` public mapping getter'ı üzerinden yapılır; consumer önce canonical label validity kontrolü yapar.
- `quote(invalidLabel, ...)` veya geçersiz duration custom error ile revert eder.
- `quote(validLabel, ...)` yalnızca fiyat hesaplar; availability/reservation kontrolü yapmaz. Register öncesi bu kontroller ayrıca uygulanır.
- `resolve(invalidLabel)` custom error ile revert eder; valid fakat bulunmayan/released isim `address(0)` döndürür.
- `statusOf` hiç mint edilmemiş/burn edilmiş token için reservation'dan bağımsız olarak `UNREGISTERED` döner. Effective availability için frontend/SDK ayrıca `reservedLabels(labelHash)` ve `isAvailable` okur.
- `fullName` ve `profileOf` mevcut olmayan token için custom error ile revert eder.
- RELEASED tokenın profile verisi re-registration'a kadar read edilebilir, fakat UI/API bunu aktif kimlik gibi sunmaz.
- `getListings(offset, limit)` limit 1..MAX_LISTING_QUERY dışında revert eder; offset >= length ise boş page ve current total döndürür.
- `getRecentRegistrations(limit)` limit 1..MAX_RECENT_QUERY dışında revert eder.

## 6.8 Kayıt fonksiyonu

```solidity
function register(
    string calldata label,
    uint8 durationYears,
    address recipient,
    address referrer,
    uint256 expectedAmount,
    uint16 expectedReferralRewardBps
)
    external
    payable
    nonReentrant
    returns (uint256 tokenId);
```

Sıra:

1. `registrationsPaused` false olmalı.
2. `isSolvent()` true olmalı; false ise ödeme alınmadan revert etmeli.
3. Recipient sıfır veya contract adresi olmamalı.
4. Label kontrat kurallarına uygun olmalı.
5. Label reserved olmamalı.
6. Süre 1-5 yıl arasında olmalı.
7. İsim müsait olmalı.
8. Referrer sıfır adres değilse `msg.sender` ve recipient'tan farklı olmalı.
9. Referrer varsa `expectedReferralRewardBps == referralRewardBps` olmalı; oran confirm sonrasında değiştiyse ödeme alınmadan revert etmeli. Referrer yoksa frontend `0` gönderir ve oran kontrolü atlanır.
10. Contract `requiredAmount = quote(label, durationYears)` hesaplamalı ve `expectedAmount == requiredAmount` doğrulamalı; fiyat işlem hazırlanırken değiştiyse ödeme almadan revert etmeli.
11. `_collectPayment(msg.sender, requiredAmount)` settlement moduna göre tam tutarı tahsil etmeli.
12. Eski token RELEASED durumundaysa listing, eski owner primary/hasPrimary, profile, resolution ve expiry temizlenmeli; ardından token burn edilmeli.
13. Label, expiration ve default resolved address internal state'e yazılmalı; profile boş olmalı.
14. Geçerli referral ödülü `referralBalance[referrer]` ve `totalReferralLiability` değerlerine eklenmeli.
15. Recent registration ring buffer internal state'e eklenmeli; full history yalnızca event loglarda kalmalı.
16. Aynı token ID recipient'a `_safeMint` ile mint edilmeli; receiver callback bu sırada tamamlanmış name state'ini okuyabilmeli.
17. `NameRegistered` ve gerekiyorsa `ReferralAttributed` event'leri emit edilmeli.

Native settlement modunda registration tek transaction'dır. ERC-20 modunda yeterli allowance önceden yoksa approval + registration olmak üzere iki wallet transaction'ı gerekir. Commit-reveal V1'de yoktur.

Frontend referral linkini `https://site.example/r/0xReferrer` biçiminde üretir. Route geçerli adresi `referrals.attributionDays` süreli first-party attribution cookie'sinde tutar (ilk profil 30 gün), kayıt dialogunda kullanıcıya açıkça gösterir ve `register()` çağrısına geçirir. Kontrat tarayıcıdaki attribution süresine güvenmez; yalnızca kendisine gönderilen referrer adresini ve self-referral kurallarını doğrular.

Referral reward `Math.mulDiv(requiredAmount, referralRewardBps, BPS_DENOMINATOR)` ile floor rounding kullanır. Sonuç sıfırsa liability artırılmaz; ancak geçerli attribution'ın ölçülebilmesi için `ReferralAttributed(reward=0)` yine emit edilir. Released bir ismin yeniden kaydı da yeni bir başarılı `register` işlemidir ve geçerli referrer varsa attribution/reward üretir; renewal ve marketplace üretmez.

## 6.9 Yenileme fonksiyonu

```solidity
function renew(
    uint256 tokenId,
    uint8 durationYears,
    uint256 expectedAmount
)
    external
    payable
    nonReentrant;
```

Kurallar:

- Token mevcut olmalı.
- `isSolvent()` true olmalı; false ise ödeme alınmamalı.
- Grace period henüz bitmemiş olmalı.
- Herhangi biri başkasının domainini yenileyebilir; sahiplik değişmez.
- Fiyat sabit yıllık fiyat ile yıl sayısına göre hesaplanır.
- Contract güncel quote'u `expectedAmount` ile karşılaştırmalı; uyuşmazlıkta tahsilattan önce revert etmelidir.
- `_collectPayment(msg.sender, requiredAmount)` settlement moduna göre tam tutarı tahsil etmelidir.
- Yeni expiration tabanı `max(current expiresAt, block.timestamp)` olmalıdır.
- Token yenileme öncesinde GRACE durumundaysa eski listing temizlenmelidir; renewal eski satış fiyatını otomatik yeniden etkinleştirmez.
- `NameRenewed` ve `MetadataUpdate` emit edilmelidir.

Yeni kayıtlar pause durumundayken bile renewal çalışmalıdır.

## 6.10 Profil ve resolution güncellemesi

Tek işlemde profil ve hedef adres güncellemek için:

```solidity
function updateNameData(
    uint256 tokenId,
    address newResolvedAddress,
    Profile calldata newProfile
) external;
```

Yetki:

- token owner,
- token için approved address,
- owner'ın approved operator'ü.

Token ACTIVE veya GRACE olmalıdır. RELEASED tokenın eski owner'ı profile veya resolution güncelleyemez.

Limitler:

| Alan | Maksimum byte |
|---|---:|
| displayName | 64 |
| bio | 280 |
| avatar | 256 |
| website | 256 |
| twitter | 64 |
| github | 64 |

Kontrat string uzunluklarını byte bazında kontrol eder. Alanlar isteğe bağlı ve boş olabilir.

Güncellemede:

- `resolvedAddress` değiştirilir,
- profil struct'ı değiştirilir,
- `NameDataUpdated` emit edilir,
- `MetadataUpdate(tokenId)` emit edilir.

`newResolvedAddress == address(0)` resolution'ı bilerek temizlemek anlamına gelir. Forward-confirmed reverse lookup için bir primary name her zaman owner adresine çözülmelidir. Bu nedenle token ilgili owner'ın primary name'i ise ve `newResolvedAddress != ownerOf(tokenId)` olursa primary ve `hasPrimary` aynı işlemde temizlenir; yalnızca sıfır adres kontrolü yeterli değildir.

## 6.11 Primary name

```solidity
function setPrimaryName(uint256 tokenId) external;
function clearPrimaryName() external;
function clearInvalidPrimary(address account) external;
```

Kurallar:

- `msg.sender` token'ın sahibi olmalıdır.
- Token grace period bitimine kadar resolvable olmalı ve `resolvedAddress[tokenId] == msg.sender` olmalıdır.
- Transfer sırasında eski sahibin primary mapping'i otomatik temizlenmelidir.
- Bir cüzdanın aynı anda tek primary name'i olabilir.
- `hasPrimary[account]` ayrı tutulmalıdır; `primaryTokenId == 0` sentinel olarak kullanılamaz çünkü keccak tabanlı token ID teorik olarak sıfır olabilir.
- `primaryNameOf(account)` mapping stale ise, token artık account'a ait değilse, RELEASED ise veya `resolvedAddress[tokenId] != account` ise boş string döndürmelidir.
- Zaman geçişi storage'ı otomatik değiştiremediği için expiry sonrasında `hasPrimary` geçici olarak stale kalabilir. `clearInvalidPrimary(account)` yalnızca effective primary artık geçersizse herkes tarafından çağrılabilir; sağlıklı primary'yi temizleyemez.
- `clearPrimaryName()` için caller'ın `hasPrimary` değeri true olmalıdır; kayıt yoksa revert eder. `clearInvalidPrimary(account)` da storage kaydı yoksa revert eder.
- Aynı sağlıklı tokenı tekrar primary seçmek `PrimaryAlreadySet` ile revert eder; gereksiz event üretilmez.
- Set, explicit clear, resolution mismatch cleanup, transfer/re-registration cleanup ve permissionless invalidation başarılı olduğunda `PrimaryNameChanged` tam bir kez emit edilir. Clear event'inde `hasPrimary=false`, `tokenId=0`, `fullName=""` kullanılır; bool alanı token ID 0 belirsizliğini kaldırır.

## 6.12 Transfer davranışı

NFT standardı korunur. Transfer olduğunda:

- Normal transfer yalnızca ACTIVE veya GRACE token için mümkündür; RELEASED token transferi revert eder. Mint ve burn bu kontrolden muaftır.
- Normal transfer recipient'ı sıfır adres veya `address(this)` olamaz; protocol NFT'si contract içinde kilitlenemez.
- Token için aktif listing varsa temizlenir.
- Eski sahibin primary name'i bu token ise `primaryTokenId` ve `hasPrimary` temizlenir.
- `resolvedAddress` otomatik olarak yeni owner'a ayarlanır.
- Eski profile temizlenir; yeni owner eski sahibin display name, avatar veya sosyal linkleriyle görünmez.
- `MetadataUpdate` emit edilir.

Bu davranış domaini yeni sahibine güvenli ve temiz bir kimlik state'iyle geçirir. UI transfer ve market buy confirmation içinde profile'ın sıfırlanacağını açıkça gösterir.

Bu kurallar OpenZeppelin 5.x `_update` override'ında uygulanır. State değişiklikleri ve listing/primary cleanup, `super._update` sonucundaki gerçek `from` adresiyle tutarlı olmalıdır; mint, burn ve normal transfer ayrı dallarda test edilir.

## 6.13 Fixed-price marketplace

```solidity
function listForSale(
    uint256 tokenId,
    uint256 price,
    uint16 expectedFeeBps
) external;
function cancelListing(uint256 tokenId) external;
function invalidateListing(uint256 tokenId) external;

function buyListedName(uint256 tokenId, uint256 expectedPrice)
    external
    payable
    nonReentrant;

function claimSaleProceeds(address recipient)
    external
    nonReentrant;
```

Listeleme kuralları:

- `marketplacePaused` false olmalıdır.
- `isSolvent()` true olmalıdır; insolvency sırasında yeni listing/update oluşturulmaz, cancel/invalidate açık kalır.
- Yalnızca token owner listeleyebilir; approved operator liste oluşturamaz.
- Token ACTIVE olmalıdır; GRACE veya RELEASED isim listelenemez.
- Fiyat sıfırdan büyük ve settlement asset'in base unit'i cinsindedir.
- `expectedFeeBps` güncel `marketplaceFeeBps` ile aynı olmalıdır; oran kullanıcı confirm'inden sonra değiştiyse listing state'i yazılmadan revert eder.
- Mevcut listing tekrar `listForSale()` çağrısıyla güncellenebilir; price, `listedAt` ve fee snapshot yenilenir, token ID array'e ikinci kez eklenmez.
- `cancelListing()` yalnızca listing seller tarafından çağrılır; marketplace pause veya lifecycle durumu iptali engellemez.
- Listing oluşturma/güncelleme anındaki `marketplaceFeeBps` listing'e snapshot edilir; sonradan yapılan admin fee değişikliği mevcut listing'in seller net tutarını değiştirmez.
- Owner normal ERC-721 transferi yaparsa listing aynı transaction içinde temizlenir.
- Listing token ID'leri swap-and-pop dizisiyle enumerable tutulur; UI sıra garantisi varsaymaz.
- Offset pagination snapshot değildir. List/cancel/buy/transfer işlemleri sayfalar arasında diziyi yeniden sıralayabilir; client token ID bazında dedupe eder ve her sonucu yeniden doğrular. V1 eksiksiz tarihsel/global enumeration garantisi vermez.
- Zamanın geçmesiyle GRACE durumuna giren listing storage'da kalabilir; market UI/API her kayıtta ACTIVE durumunu yeniden doğrular ve stale kayıtları göstermez.
- `getListings(...).total` storage'daki listing sayısını verir; permissionless invalidation tamamlanana kadar bu değer satın alınabilir ACTIVE listing sayısı olarak etiketlenmez. Ayrı `listingCount()` convenience getter'ı yoktur.

Satın alma sırası:

1. `marketplacePaused` false olmalı.
2. `isSolvent()` true olmalı; false ise ödeme alınmamalı.
3. Listing mevcut olmalı.
4. Token ACTIVE olmalı ve owner listing seller ile aynı olmalı.
5. Buyer seller'dan farklı olmalı.
6. `expectedPrice == listing.price` olmalı; seller ilan fiyatını kullanıcı işlemi hazırladıktan sonra değiştirdiyse tahsilattan önce revert etmeli.
7. `_collectPayment(msg.sender, listing.price)` settlement moduna göre tam tutarı tahsil etmeli.
8. Listing external call öncesinde temizlenmeli.
9. Fee `Math.mulDiv(price, listing.feeBps, BPS_DENOMINATOR)` ile floor rounding kullanarak hesaplanmalı.
10. `price - fee`, seller balance ve `totalMarketplaceLiability` değerlerine eklenmeli.
11. NFT buyer'a safe transfer edilmeli; primary/resolution transfer kuralları uygulanmalı.
12. `NameSold` emit edilmeli; normal transfer hook'u metadata değişimi için tam bir kez `MetadataUpdate` emit etmeli.

Satıcıya satın alma sırasında doğrudan payout yapılmaz. `claimSaleProceeds(recipient)` yalnızca `msg.sender` bakiyesini sıfırlar ve seçili settlement asset'i sıfır veya contract adresi olmayan recipient'a checks-effects-interactions sırasıyla gönderir. UI recipient olarak varsayılan bağlı cüzdanı kullanır; contract wallet veya payout sorunu yaşayan hesap farklı recipient seçebilir. Referral sistemi marketplace satışına uygulanmaz.

`invalidateListing()` yalnızca token artık ACTIVE değilse veya listing seller artık owner değilse herkes tarafından çağrılabilir. Bu fonksiyon sağlıklı bir listing'i silemez ve başarılı olduğunda `ListingInvalidated` emit eder.

Event semantiği nettir: list/update `NameListed`, seller'ın explicit cancel'ı `ListingCancelled`, regular transfer/re-registration/GRACE renewal/permissionless cleanup `ListingInvalidated`, başarılı buy ise yalnızca listing lifecycle için `NameSold` emit eder. Aynı cleanup için iki listing event'i üretilmez.

## 6.14 Referral claim

```solidity
function claimReferralRewards(address recipient)
    external
    nonReentrant;
```

Kurallar:

- Claim edilecek tutar sıfırdan büyük olmalıdır.
- State dış çağrıdan önce sıfırlanır.
- `totalReferralLiability` aynı tutarda azaltılır.
- Ödeme `msg.sender` tarafından seçilen, sıfır veya contract adresi olmayan recipient'a aynı settlement asset ile yapılır.
- Başarılı işlemde `ReferralRewardClaimed` emit edilir.
- Başarısız native veya ERC-20 transferinde bütün state değişiklikleri revert olur.

## 6.15 Admin fonksiyonları

```solidity
function setAnnualPrice(uint256 newAnnualPrice)
    external
    onlyOwner;

function setReferralRewardBps(uint16 newRewardBps)
    external
    onlyOwner;

function setMarketplaceFeeBps(uint16 newFeeBps)
    external
    onlyOwner;

function setReservedLabels(
    string[] calldata labels,
    bool reserved
) external onlyOwner;

function setTreasury(address newTreasury)
    external
    onlyOwner;

function setMetadataBaseURI(string calldata newBaseURI)
    external
    onlyOwner;

function setRegistrationsPaused(bool paused)
    external
    onlyOwner;

function setMarketplacePaused(bool paused)
    external
    onlyOwner;

function withdrawTreasury()
    external
    onlyOwner
    nonReentrant;

function recoverUnsupportedERC20(address token)
    external
    onlyOwner
    nonReentrant;

function sweepUnexpectedNative()
    external
    onlyOwner
    nonReentrant;

function renounceOwnership()
    public
    pure
    override;
```

`withdrawTreasury()` yalnızca `treasuryAvailableBalance()` tutarını tanımlı treasury adresine seçili settlement asset ile yollar. Referral ve seller kullanıcılarına ayrılmış `totalReferralLiability + totalMarketplaceLiability` hiçbir koşulda treasury'ye gönderilemez. Owner keyfi recipient belirleyemez; önce event üreten `setTreasury` çağrısı gerekir.

Available tutar sıfırsa withdrawal revert eder; sıfır tutarlı başarı event'i üretilmez.

`isSolvent()` false ise withdrawal `ProtocolInsolvent(balance, liability)` ile açıkça revert eder; bu durum sıradan “çekilecek treasury bakiyesi yok” sonucuyla karıştırılmaz.

```text
treasuryAvailableBalance =
    max(
        settlementBalance() - totalProtectedLiability(),
        0
    )
```

Uygulama subtraction'ı yalnızca `settlementBalance() >= totalProtectedLiability()` kontrolünden sonra yapar; pseudocode'daki `max` Solidity'de önce underflow oluşturacak bir expression olarak yazılmaz.

`settlementBalance()` NATIVE modda `address(this).balance`, ERC20 modda `settlementToken.balanceOf(address(this))` döndürür.

`totalProtectedLiability()` referral + seller liabilities toplamını verir. `isSolvent()` settlement balance bu toplamı karşılıyorsa true döner. Desteklenmeyen harici token davranışı nedeniyle balance liability altına düşerse `treasuryAvailableBalance()` underflow/revert yerine `0` döner ve treasury withdrawal kapalı kalır; bu durum kullanıcı claim garantisi olarak sunulmaz, kritik protocol-health hatasıdır.

`recoverUnsupportedERC20(token)` yalnızca configured settlement token dışındaki yanlışlıkla gönderilmiş ERC-20 bakiyesini treasury'ye aktarabilir. `sweepUnexpectedNative()` yalnızca ERC20 settlement modunda çalışır ve kontrata zorla/yanlışlıkla gelen native bakiyeyi treasury'ye yollar. Bu rescue fonksiyonları settlement yükümlülüklerine erişemez.

`renounceOwnership()` her zaman `OwnershipRenounceDisabled` ile revert eder. Ownership yalnızca `Ownable2Step` transfer/accept akışıyla değişir.

Admin input kuralları:

- `setAnnualPrice(0)` reddedilir.
- `setAnnualPrice` ve constructor değeri `MAX_ANNUAL_PRICE` üstüne çıkamaz; 1-5 yıllık quote çarpımı overflow üretmez.
- Reserved batch `MAX_RESERVED_BATCH` sınırını aşamaz; her label normalize edilmiş contract formatında valid olmalıdır.
- Bir label'ı sonradan reserved yapmak mevcut tokenı burn etmez veya owner haklarını değiştirmez; yalnızca gelecekteki re-registration'ı engeller.
- Treasury ve metadata URI setter'ları constructor ile aynı doğrulamaları kullanır.

## 6.16 Settlement helper'ları

Tek internal ödeme katmanı kullanılmalıdır:

```solidity
function _collectPayment(address payer, uint256 amount) internal;
function _payout(address recipient, uint256 amount) internal;
function _settlementBalance() internal view returns (uint256);
function _requireSolvent() internal view;
```

- `register`, `renew` ve `buyListedName` kendi ödeme mantığını tekrar yazmaz.
- `register`, `renew`, `listForSale` ve `buyListedName` `_requireSolvent()` çağırır; payment entry point'leri bunu collection öncesinde yapar. Claim/cancel/invalidate/primary cleanup açık kalır.
- NATIVE collection exact `msg.value` kontrolü yapar.
- ERC20 collection `msg.value == 0`, `SafeERC20.safeTransferFrom` ve payer/contract before-after balance delta kontrolü yapar.
- NATIVE payout düşük seviyeli güvenli value call kullanır; ERC20 payout `SafeERC20.safeTransfer` ve contract/recipient exact balance delta kontrolü kullanır.
- Delta hesabı yön kontrolünü subtraction'dan önce yapar (`senderBefore >= senderAfter`, `recipientAfter >= recipientBefore`); sıra dışı token davranışı arithmetic panic yerine `SettlementTransferMismatch` üretir.
- `_payout` yalnızca state yükümlülüğü azaltıldıktan sonra çağrılır.
- `receive()` ve `fallback()` doğrudan native transferi reddeder; payable işlevler explicit entry point'tir.

## 6.17 Event'ler

```solidity
event NameRegistered(
    uint256 indexed tokenId,
    string label,
    address indexed owner,
    address indexed payer,
    uint64 registeredAt,
    uint64 expiresAt,
    uint256 price
);

event NameRenewed(
    uint256 indexed tokenId,
    address indexed payer,
    uint64 oldExpiresAt,
    uint64 newExpiresAt,
    uint256 price
);

event NameDataUpdated(
    uint256 indexed tokenId,
    address indexed owner,
    address resolvedAddress
);

event PrimaryNameChanged(
    address indexed account,
    bool hasPrimary,
    uint256 indexed tokenId,
    string fullName
);

event AnnualPriceUpdated(uint256 previousPrice, uint256 newPrice);
event SettlementConfigured(SettlementKind kind, address indexed token);

event ReferralRewardBpsUpdated(uint16 previousBps, uint16 newBps);

event ReferralAttributed(
    uint256 indexed tokenId,
    address indexed referrer,
    address indexed payer,
    uint256 reward
);

event ReferralRewardClaimed(
    address indexed referrer,
    address indexed recipient,
    uint256 amount
);

event NameListed(
    uint256 indexed tokenId,
    address indexed seller,
    uint256 price,
    uint16 feeBps
);

event ListingCancelled(uint256 indexed tokenId, address indexed seller);
event ListingInvalidated(uint256 indexed tokenId, address indexed previousSeller);

event NameSold(
    uint256 indexed tokenId,
    address indexed seller,
    address indexed buyer,
    uint256 price,
    uint256 fee
);

event SaleProceedsClaimed(
    address indexed seller,
    address indexed recipient,
    uint256 amount
);
event MarketplaceFeeBpsUpdated(uint16 previousBps, uint16 newBps);

event ReservedLabelUpdated(bytes32 indexed labelHash, string label, bool reserved);
event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
event RegistrationsPauseChanged(bool paused);
event MarketplacePauseChanged(bool paused);
event MetadataBaseURIUpdated(string previousBaseURI, string newBaseURI);
event TreasuryWithdrawal(address indexed treasury, uint256 amount);
event UnsupportedTokenRecovered(address indexed token, uint256 amount);
event UnexpectedNativeSwept(uint256 amount);
```

Bütün event `price`, `reward`, `fee` ve `amount` alanları deployment settlement asset base unit'indedir; timestamp alanları Unix seconds, BPS alanları `BPS_DENOMINATOR=10_000` ölçeğindedir. Consumer event değerlerinden ETH/18-decimal varsayımı çıkarmaz.

## 6.18 Custom error'lar

String revert mesajları yerine custom error kullanılmalıdır:

```solidity
error InvalidLabel();
error InvalidSuffix();
error InvalidCollectionMetadata();
error InvalidDuration();
error InvalidGracePeriod();
error InvalidAnnualPrice();
error InvalidMetadataURI();
error BatchTooLarge();
error NameNotAvailable();
error NameReserved();
error IncorrectPayment(uint256 expected, uint256 received);
error PriceChanged(uint256 expected, uint256 actual);
error UnexpectedNativeValue(uint256 received);
error InvalidSettlementConfig();
error SettlementTransferMismatch(
    uint256 expected,
    uint256 senderDelta,
    uint256 recipientDelta
);
error SettlementTokenRecoveryForbidden();
error NoRecoverableBalance();
error ZeroAddress();
error InvalidRecipient();
error SelfTransferToContractForbidden();
error RegistrationPaused();
error MarketplacePaused();
error RenewalWindowClosed();
error NotAuthorized();
error FieldTooLong();
error TransferFailed();
error InvalidQueryLimit(uint256 limit, uint256 max);
error InvalidReferrer();
error ReferralRateTooHigh();
error ReferralRateChanged(uint16 expected, uint16 actual);
error NoReferralRewards();
error InsufficientTreasuryBalance();
error ProtocolInsolvent(uint256 balance, uint256 liability);
error InvalidListingPrice();
error ListingNotFound();
error ListingNotInvalidatable();
error NameNotActive();
error SellerMismatch();
error BuyerIsSeller();
error NoSaleProceeds();
error MarketplaceFeeTooHigh();
error MarketplaceFeeChanged(uint16 expected, uint16 actual);
error ReleasedTokenLocked();
error OwnershipRenounceDisabled();
error NameDoesNotExist(uint256 tokenId);
error NoPrimaryName();
error PrimaryAlreadySet();
error PrimaryStillValid();
error PrimaryResolutionMismatch();
```

## 6.19 Kontrat invariant'ları

Aşağıdakiler configured asset desteklenen standard transfer davranışını koruduğu sürece daima doğru kalmalıdır:

1. Aynı label aynı token ID'yi üretir.
2. ACTIVE veya GRACE durumundaki isim yeniden register edilemez.
3. Yenileme expiration tarihini azaltamaz.
4. `primaryNameOf(account)` boş değilse token ilgili adresin sahip olduğu, aynı adrese çözülen resolvable token olmalıdır. `hasPrimary` zaman bazlı expiry sonrası permissionless cleanup yapılana kadar stale olabilir.
5. Sadece owner veya onaylı operator profil değiştirebilir.
6. Reserved label register edilemez.
7. Fiyat `annualPriceBaseUnits * durationYears` ile hesaplanır; label uzunluğu ve settlement decimals hesabı değiştirmez.
8. Protocol entry point'leri `totalReferralLiability + totalMarketplaceLiability` değerini `settlementBalance()` üstüne çıkaramaz; harici issuer balance kaybı ayrı insolvency health-state'idir.
9. Treasury withdrawal referral veya seller yükümlülüğüne ayrılmış bakiyeyi azaltamaz.
10. Referrer ve seller yalnızca kendi bakiyelerini claim edebilir.
11. Sağlıklı bir listing'in seller adresi token owner ile aynı olmalıdır.
12. ACTIVE olmayan isim satın alınamaz.
13. Normal transfer ve başarılı market satışı eski listing'i temizler.
14. Re-registration eski owner'ın primary kaydını temizler.
15. Transfer eski owner'ın primary kaydını temizler.
16. Settlement kind ve settlement token deployment sonrasında değişmez.
17. ERC-20 tahsilatında contract balance delta'sı required amount'a tam eşittir.
18. RELEASED token resolution, transfer, profile update, primary ve market işlemlerinde kullanılamaz.
19. Listing token ID dizisinde duplicate bulunmaz ve indexPlusOne mapping diziyle tutarlıdır; zamanla stale hale gelen kayıtlar bu dizinin “satın alınabilir” olduğu anlamına gelmez.
20. Recent ring buffer `RECENT_CAPACITY` üstüne çıkmaz ve newest-first query sırası korunur.

---

# 7. NFT metadata

## 7.1 Token URI

Kontrat şu modeli kullanır:

```text
metadataBaseURI + tokenId
```

Örnek:

```text
https://names.example/api/metadata/123456...
```

`tokenURI(tokenId)` hiç mint edilmemiş veya burn edilmiş token için ERC-721 standardıyla uyumlu biçimde revert eder. RELEASED fakat henüz re-registration ile burn edilmemiş token mevcut sayılır ve metadata endpoint'i tarafından gösterilebilir; ancak metadata açıkça `Status = Released` olmalıdır.

## 7.2 Metadata route

```text
GET /api/metadata/[tokenId]
```

Route kontrattan okur ve şu JSON'u döndürür:

```json
{
  "name": "alice.example",
  "description": "An onchain name on Example Chain.",
  "image": "https://names.example/api/image/123456...",
  "external_url": "https://names.example/name/alice",
  "properties": {
    "resolvedAddress": "0x...",
    "profile": {
      "displayName": "Alice",
      "bio": "",
      "avatar": "",
      "website": "",
      "twitter": "",
      "github": ""
    }
  },
  "attributes": [
    { "trait_type": "Chain", "value": "Example Chain" },
    { "trait_type": "Suffix", "value": ".example" },
    { "trait_type": "Length", "value": 5 },
    { "trait_type": "Status", "value": "Active" },
    { "display_type": "date", "trait_type": "Expires", "value": 1810000000 }
  ]
}
```

HTTP davranışı:

- Hiç mint edilmemiş veya burn edilmiş token: `404`.
- ACTIVE/GRACE/RELEASED mevcut token: `200`, doğru status trait'i.
- ACTIVE/GRACE durumda sıfır resolution `properties.resolvedAddress: null` olarak gösterilir. RELEASED durumda stored profile tarihsel veri olabilir; `resolvedAddress` effective olarak null döner ve consumer `Status` alanını esas alır.
- Contract deploy edilmemiş veya RPC erişilemiyor: `503`; `404` olarak maskelenmez.
- Dinamik expiry/status nedeniyle kısa cache kullanılır; immutable cache header verilmez.
- `name`, `description`, URL ve SVG metinleri güvenli biçimde escape edilir.

## 7.3 Dinamik görsel

```text
GET /api/image/[tokenId]
```

V1'de branded SVG üretmek yeterlidir. Görsel “dijital isim plakası” hissi vermelidir:

```text
┌──────────────────────────────────┐
│                                  │
│          alice.example           │
│                                  │
│        EXAMPLE CHAIN NAMES       │
│                                  │
└──────────────────────────────────┘
```

Görselde chain rengi yalnızca küçük vurgu olarak kullanılmalı; gradient ve karmaşık 3D efekt kullanılmamalıdır.

SVG name, configured collection/chain ve ACTIVE/GRACE/RELEASED status etiketini aynı pinned-block read'inden üretir; RELEASED görsel aktif kimlik izlenimi vermez. Remote font/image fetch etmez, bütün dinamik XML metnini escape eder ve doğru `image/svg+xml` content type, `X-Content-Type-Options: nosniff` ve SVG'ye özel dar CSP ile kısa cache döndürür.

## 7.4 Metadata update kuralları

- Profile, resolution, renewal ve transfer metadata çıktısını etkiliyorsa `MetadataUpdate(tokenId)` emit edilir.
- `metadataBaseURI` değiştiğinde `MetadataBaseURIUpdated(previous, next)` ve `BatchMetadataUpdate(0, type(uint256).max)` emit edilir.
- Listing fiyatı metadata JSON'una dahil edilmez; listing değişikliğinde ERC-4906 event'i gerekmez.
- Mint ve burn için EIP-4906 event'i ayrıca emit edilmez; ERC-721 `Transfer` event'i yeterlidir.
- ACTIVE→GRACE→RELEASED zaman geçişi transaction üretmediği için ERC-4906 event'i emit edemez. `Expires` timestamp canonical veridir; `Status` trait'i convenience alanıdır ve consumer gerektiğinde yeniden fetch etmelidir.

---

# 8. Uygulama mimarisi

## 8.1 Genel akış

```text
Browser
  │
  ▼
Next.js App Router
  │
  ├── Wagmi: wallet state ve React hooks
  ├── Viem: public client, chain ve contract calls
  ├── TanStack Query: read cache ve transaction invalidation
  │
  ▼
Chain RPC
  │
  ▼
ChainNameService.sol
```

Metadata, image, name-state, resolve, reverse, market, OpenAPI ve well-known route handler'ları stateless'tir. Ayrı uygulama backend'i, login servisi, database veya indexer gerekmez.

Bir route response'u birden fazla chain read gerektiriyorsa önce güncel block number alınır ve bütün ilişkili read'ler aynı block'a pinlenir. Response mümkün olduğunda bu block number'ı decimal string olarak yayınlar; karışık-block owner/status/profile çıktısı üretilmez.

## 8.2 Teknoloji seçimi

- Node.js LTS
- pnpm
- TypeScript strict mode
- Next.js App Router, stable release
- React
- Wagmi, current stable
- Viem, current stable
- TanStack Query
- Zod, konfigürasyon ve form doğrulaması
- Lucide React, tanıdık UI ikonları
- CSS Modules + global design tokens
- Foundry stable
- Solidity'nin güncel stable 0.8.x sürümü
- OpenZeppelin Contracts 5.x stable

Paketler `package.json` ve lockfile içinde tam olarak kilitlenmelidir. `latest` aralığı üretim branch'inde bırakılmamalıdır.

## 8.3 Neden backend/indexer yok?

V1'de ihtiyaç duyulan tüm bilgiler kontrattan okunabilir:

- availability,
- fiyat,
- expiration,
- profile,
- resolution,
- primary name,
- owner names (`ERC721Enumerable`),
- recent registrations,
- marketplace listings ve seller proceeds.

Bu nedenle veritabanı ve indexer yalnızca gereksiz operasyon yükü getirir. İleride yüksek hacim veya gelişmiş arama gerekirse V2 modülü olarak eklenebilir.

## 8.4 Entegrasyon katmanı

Başka dApp'ler üç yöntemle entegre olabilir:

1. Export edilen ABI ile doğrudan kontrat read çağrısı.
2. `packages/sdk` içindeki küçük TypeScript SDK.
3. Wallet veya RPC kurmak istemeyen istemciler için stateless read-only HTTP API.

SDK manifest-first bir factory ve en az şu read API'yi sağlamalıdır:

```ts
type NameLifecycle = 'unregistered' | 'active' | 'grace' | 'released';

declare function createChainNameClient(options: {
  manifestUrl: string;
  rpcUrl?: string;
}): Promise<ChainNameClient>;

interface ChainNameClient {
  resolveName(label: string): Promise<Address | null>;
  reverseLookup(account: Address): Promise<string | null>;
  getNameProfile(label: string): Promise<NameProfile | null>;
  getNameState(label: string): Promise<{
    lifecycle: NameLifecycle;
    reserved: boolean;
    available: boolean;
    registrationsPaused: boolean;
    solvent: boolean;
    canRegister: boolean;
  }>;
  isNameAvailable(label: string): Promise<boolean>;
  quoteName(label: string, durationYears: 1 | 2 | 3 | 4 | 5): Promise<bigint>;
  createReferralUrl(referrer: Address): string;
  getActiveListings(cursor?: bigint, limit?: number): Promise<MarketPage>;
  getListing(tokenId: bigint): Promise<MarketListing | null>;
  getSettlementAsset(): Promise<SettlementAsset>;
  getNativeCurrency(): NativeCurrency;
  getProtocolHealth(): Promise<{
    settlementBalance: bigint;
    protectedLiability: bigint;
    solvent: boolean;
  }>;
}
```

Factory production'da HTTPS manifest ister, schema/address/ABI hash/contract version doğrulamalarını tamamlamadan client döndürmez. Consumer browser-safe RPC override verebilir; verilmezse manifest public RPC'si kullanılır.

Server-side SDK kullanımı manifest/RPC/ABI URL'lerini trusted config veya explicit allowlist ile sınırlar; untrusted request parametresini doğrudan fetch ederek SSRF yüzeyi oluşturmaz.

SDK null semantiği yalnızca valid input için “effective result yok” anlamındadır: `resolveName` unregistered/released/zero-resolution durumda, `getNameProfile` unregistered/released durumda null döner. Geçersiz input typed validation error, RPC sorunu typed transport error üretir; ikisi null'a çevrilmez. Raw released profile'a yalnızca açık direct-contract read ile erişilir ve aktif kimlik olarak sunulmaz.

SDK en az `InvalidInputError`, `RpcUnavailableError`, `NotDeployedError`, `ManifestMismatchError` ve `UnsupportedSchemaError` typed error'larını export eder.

Read-only API:

```text
GET /api/resolve/[label]
GET /api/name/[label]?durationYears=1
GET /api/reverse/[address]
GET /api/market
GET /api/metadata/[tokenId]
GET /api/image/[tokenId]
GET /api/openapi.json
```

`GET /api/name/[label]?durationYears=1` valid label için lifecycle/availability state'ini `200` ile döndürür; UNREGISTERED, RESERVED ve RELEASED sonuçları `404` yapılmaz. Yanıt; `tokenId`, `lifecycle`, `tokenExists`, `reserved`, `available`, `registrationsPaused`, `solvent`, türetilmiş `canRegister`, nullable `nftOwner`, nullable `effectiveOwner`, nullable `resolvedAddress`, nullable `expiresAt`, nullable effective `profile`, güncel `quoteBaseUnits`, settlement metadata ve pinned `blockNumber` içerir. `available` yalnızca label/lifecycle/reservation sonucudur; `canRegister = available && !registrationsPaused && solvent` olur. RELEASED durumda eski ERC-721 sahibi yalnızca `nftOwner` alanında görünebilir; `effectiveOwner` null kalır. `durationYears` verilmezse 1, geçersizse `400` kullanılır.

`reverseLookup` yalnızca token account'a ait, ACTIVE/GRACE ve `resolvedAddress == account` ise sonuç döndürür. Resolve yanıtı en az `label`, `fullName`, `owner`, nullable `resolvedAddress`, `expiresAt`, `lifecycle`, `profile` ve okumanın decimal-string `blockNumber` değerini içerir. İlişkili contract read'leri aynı block'a pinlenir. Bulunamayan veya released isim için tutarlı `404`, geçersiz input için `400`, rate limit için `429`, RPC sorunu için `503` dönülür. ACTIVE/GRACE fakat resolution'ı bilerek temizlenmiş isim `200` ve `resolvedAddress: null` döner. RPC hatası hiçbir zaman “name not found” olarak maskelenmez.

Market yanıtı cursor/limit kabul eder ve owner/status doğrulamasından geçen ACTIVE listing'leri döndürür. Stale listing'ler response'a eklenmez. Response-level `marketplacePaused`, `solvent` ve her item'da türetilmiş `purchasable = !marketplacePaused && solvent` bulunur; pause/insolvency sırasında listing'ler read-only kaybolmaz. Tek request en fazla 200 raw listing veya dört contract page'i tarar ve decimal-string `blockNumber`, `nextCursor`, `hasMore`, `scanned` döndürür; istenen aktif sonuç sayısına ulaşılamaması global marketin bittiği anlamına gelmez. Yanıt en az `tokenId`, `label`, `fullName`, `seller`, `priceBaseUnits`, `feeBps`, `listedAt` ve `expiresAt` alanlarını içerir.

HTTP API JSON içinde token ID, base-unit tutarlar ve timestamp'ler güvenli decimal string olarak taşınır; JavaScript number ile hassasiyet kaybı oluşturulmaz. NFT metadata standardındaki `display_type: "date"` trait'i bu kuralın bilinçli istisnasıdır ve Unix timestamp number kullanır. SDK API string'lerini `bigint` olarak döndürür. Formatlama consumer'a bırakılır veya ayrıca `formattedPrice`, `settlementSymbol` ve `settlementDecimals` sağlanır.

GET endpoint'leri cross-origin kullanım için açık CORS header'ları ve kısa public cache header'ları kullanabilir. `400`, `404`, `429` ve `503` dahil hata yanıtları shared cache'e girmez ve `private, no-store` döner. Bunlar veritabanı veya indexer değildir; her yanıt doğrulanmış deployment manifesti ve chain RPC üzerinden üretilir. Market API ilk listing/pause/health okumalarını tek Multicall ile aynı block'a pinler.

API input limitleri zorunludur: market `limit` 1-50, cursor/token ID decimal veya destekleniyorsa hex string olarak uzunluk-sınırlı, address checksum-normalized ve label contract kurallarıyla doğrulanmış olmalıdır. Production'da platform/edge rate limiting kullanılabilir; limit aşımı `429`, upstream RPC veya not-deployed durumu `503` döner. API sınırsız event/log taraması yapmaz.

Hata yanıtları ham RPC nesnesi döndürmez; `{ "error": { "code": "RPC_UNAVAILABLE", "message": "..." } }` biçiminde stabil machine code kullanır. `429` mümkünse `Retry-After` header'ı taşır. Contract manifestte null ise contract-dependent route'lar `503` + `NOT_DEPLOYED`, well-known manifest ise `200` döndürür.

Makine-okunabilir manifest en az şu alanları döndürür:

```json
{
  "schemaVersion": 3,
  "contractVersion": "2.0.0",
  "abiSha256": null,
  "chainId": 84532,
  "chainName": "Base Sepolia",
  "testnet": true,
  "requiredConfirmations": 1,
  "nativeCurrency": {
    "name": "Ether",
    "symbol": "ETH",
    "decimals": 18
  },
  "multicall3": {
    "address": "0xca11bde05977b3631167028862be2a173976ca11",
    "blockCreated": 1059647
  },
  "suffix": "example",
  "nameRules": {
    "minLength": 1,
    "maxLength": 32,
    "allowedYears": [1, 2, 3, 4, 5]
  },
  "collection": {
    "name": "Chain Name",
    "symbol": "CNAME"
  },
  "contract": null,
  "deploymentBlock": null,
  "owner": null,
  "treasury": null,
  "settlement": {
    "kind": "native",
    "tokenAddress": null,
    "name": "Ether",
    "symbol": "ETH",
    "decimals": 18
  },
  "annualPriceBaseUnits": "500000000000000",
  "shortNamePriceMultipliers": [100, 25, 5],
  "referenceFiat": null,
  "gracePeriodSeconds": "2592000",
  "referralRewardBps": 1000,
  "referralAttributionSeconds": "2592000",
  "marketplaceFeeBps": 0,
  "metadataBaseURI": "https://names.example/api/metadata/",
  "rpcUrl": "https://sepolia.base.org",
  "explorerUrl": "https://sepolia-explorer.base.org",
  "abiUrl": "/abi/ChainNameService.json",
  "docsUrl": "/developers",
  "nameApiUrl": "/api/name/{label}",
  "resolveApiUrl": "/api/resolve/{label}",
  "reverseApiUrl": "/api/reverse/{address}",
  "marketApiUrl": "/api/market",
  "openApiUrl": "/api/openapi.json"
}
```

Deployment öncesinde `contract`, `deploymentBlock`, `owner` ve `treasury` null kalabilir. `nativeCurrency` gas etiketlemesi, `settlement` ise uygulama ödemeleri içindir; aynı symbol'e sahip olsalar bile consumer bunları birleştirmez. Build veya deploy script'i manifest, ABI, `/developers`, OpenAPI ve `llms.txt` içindeki sürüm bilgilerinin aynı deployment'ı göstermesini doğrular.

Manifestteki relative URL'ler manifest origin'ine göre resolve edilir. Consumer bilinmeyen `schemaVersion` için tahmin yürütmez; desteklenmeyen schema'yı açık entegrasyon hatasıyla reddeder.

---

# 9. Sayfalar ve kullanıcı akışları

Uygulama global protocol health olarak `isSolvent()` okur. False ise kalıcı/kritik banner gösterir; register, renew, list/update ve buy aksiyonlarını kapatır. Claims, listing cancel/invalidate, profile/primary cleanup ve read akışları açık kalır. UI insolvency'yi sıradan RPC hatası veya pause durumu gibi göstermez.

## 9.1 Ana sayfa `/`

Bölümler:

1. Header
2. Hero ve name search
3. Canlı platform özeti
4. 1/2/3/4-32 karakter yıllık fiyat tarifesi
5. Name object ve protocol akışı
6. Recently registered
7. Structured footer

Wireframe:

```text
[Logo]                         [Market] [Account] [Developers] [Connect]


                 Your name. Your place onchain.

             [ alice________________ ] .example
                          [ Search ]


STANDARD / 4-32                    {annual} {SETTLEMENT_SYMBOL}
1 CHAR / 100x                  {oneCharAnnual} {SETTLEMENT_SYMBOL}
2 CHARS / 25x                 {twoCharAnnual} {SETTLEMENT_SYMBOL}
3 CHARS / 5x                {threeCharAnnual} {SETTLEMENT_SYMBOL}
FIAT REFERENCES                   {optionalAmountsAndAsOf}


NAMES ONCHAIN        REGISTRATIONS        MARKETPLACE        PAYMENTS
{totalSupply}        {OPEN|PAUSED}         {OPEN|PAUSED}      {READY|REVIEW}


Recently registered
alice.example                                              2m
studio.example                                            11m
builder.example                                           18m
```

Arama submit edildiğinde:

```text
/name/alice
```

route'una gidilir.

Recently registered listesi history'nin son kayıtlarını okur, aynı token ID için en yeni kaydı tutar ve current status/owner değerini multicall ile doğrular. Released/stale history kaydı aktif ownership gibi gösterilmez.

Platform özeti `totalSupply`, registration pause, marketplace pause ve payment-health değerlerini global protocol-health Multicall'ı üzerinden okur. Ana sayfa aynı query key/cache'i paylaşır; bu bölüm için ikinci bir RPC sorgusu veya periyodik polling başlatılmaz. `totalSupply` süresi geçmiş fakat yeniden kaydedilmemiş ERC-721 nesnelerini de içerebildiği için metrik “active names/users” değil, açıkça “Names onchain” olarak etiketlenir. RPC hatası gerçek `0` sayısı gibi gösterilmez.

02-06 bölüm başlıkları desktop 12-kolon gridinde dönüşümlü hizalanır: çift numaralarda bölüm kodu solda ve başlık sağda, tek numaralarda başlık solda ve bölüm kodu sağdadır. Mobilde bütün başlıklar kod-önce tek kolona iner; metin sırası veya erişilebilir heading yapısı değişmez.

Global footer kısa sayfalarda viewport tabanında kalır fakat `position: fixed` kullanarak içeriğin üstünü kapatmaz. Marka, network, settlement ve developer resources modülleri 1px ayırıcılarla düzenlenir. Docs ve manifest linkleri merkezi integration config'inden, `llms.txt` canonical public artifact yolundan gelir.

`registrationsPaused == true` ise search/read çalışmaya devam eder; available name ekranı kayıtların geçici olarak kapalı olduğunu gösterir ve register transaction başlatmaz. Renewal ve claim akışları etkilenmez.

`referenceFiat` null veya `asOf + maxAgeDays` geçmişse tarihli protocol fiat satırı tamamen kaldırılır. Ayrı `marketReference` configured ise kısa canlı `USD REFERENCE` satırı gösterilebilir; provider hatasında protocol fiyatı, quote veya transaction availability değişmez.

## 9.2 Name sayfası `/name/[label]`

Bu route beş ana duruma göre davranır. Reservation lifecycle'dan ayrıdır; ACTIVE/GRACE ownership'i etkilemez, fakat UNREGISTERED/RELEASED bir label'ın yeniden kaydını engeller.

### A. Müsait

```text
alice.example
Available

Duration       1  2  3  4  5 years
Name price     {annual} {SETTLEMENT_SYMBOL} / year
Total          {total} {SETTLEMENT_SYMBOL}

[ Register name ]
```

### B. Aktif ve başkasına ait

```text
alice.example
0x71a4...b920

Alice
Builder and onchain explorer.

Website   alice.xyz
X         @alice
GitHub    alice

Registered ...
Expires ...

Listed price    {price} {SETTLEMENT_SYMBOL}
[ Buy name ]
```

`Buy name` yalnızca doğrulanmış aktif listing varsa görünür. Sayfa açılışında ve transaction simülasyonu öncesinde owner, status ve listing fiyatı yeniden okunur.

### C. Aktif ve bağlı cüzdana ait

Aynı public profil görünür. Ek actions:

```text
[ Edit profile ] [ Renew ] [ Set as primary ] [ Transfer ] [ List for sale ]
```

İsim zaten listelenmişse son aksiyon `Edit listing` olur ve fiyat güncelleme/iptal dialogunu açar.

### D. Grace period

```text
alice.example
Expired - renewal grace period

This name cannot be registered by another user yet.
Anyone may fund renewal until 10 August 2027; ownership does not change.

[ Renew ] [ Edit profile — owner/operator only ]
```

Grace sona ermişse sayfa reserved değilse “Available”, reserved ise “Reserved” görünümüne döner.
GRACE veya RELEASED durumda listing ve buy aksiyonları gösterilmez.

Bağlı cüzdan owner ise GRACE görünümünde `Renew`, `Edit profile`, `Set as primary` ve `Transfer` aksiyonları sunulur; başka bir kullanıcı yalnızca `Renew` görebilir. Set-primary aksiyonu yalnızca name halen owner adresine çözülüyorsa aktiftir.

### E. Reserved

```text
protocol.example
Reserved

This name is not available for public registration.
```

UNREGISTERED veya RELEASED label reserved ise register aksiyonu ve fiyat confirm'i gösterilmez. Mevcut ACTIVE/GRACE token sonradan reserved yapılmışsa sahiplik, renewal, profile ve transfer çalışmaya devam eder; reservation yalnızca gelecekteki re-registration'ı etkiler.

## 9.3 Account `/me`

Cüzdan bağlı değilse sade connect state gösterilir. Bağlı hesapta tek sayfa içinde üç tab bulunur:

```text
[ Names ] [ Referrals ] [ Listings & Proceeds ]
```

Tab seçimi URL ile paylaşılabilir:

```text
/me?tab=names
/me?tab=referrals
/me?tab=listings
```

### Names tab

```text
alice.example          Primary       Expires Jul 2027
builder.example                      Grace period
studio.example                       Expires Dec 2028
```

Her satır name sayfasına link, status, expiration, primary badge, renew ve uygun durumda list-for-sale aksiyonu içerir.

ERC721Enumerable, henüz re-registration ile burn edilmemiş RELEASED tokenı eski wallet altında döndürebilir. Bu satır `Released` olarak gösterilir; ownership/renew/profile/market aksiyonları sunulmaz ve label reserved değilse yeniden public registration'a açık olduğu belirtilir.

Liste ERC721Enumerable üzerinden alınır:

1. `balanceOf(account)`
2. Yalnızca mevcut 24-item UI page aralığı için `tokenOfOwnerByIndex`
3. Multicall ile label, expiry, status ve listing

İlk `balanceOf` read'inin block number'ı kaydedilir ve index/multicall read'leri mümkünse aynı block'a pinlenir. Arada transfer nedeniyle index read'i başarısız olursa ekran crash etmez; tek bounded retry yapar.

Account bütün balance'ı tek request'te enumerate etmez. Page size varsayılan 24, maksimum 50'dir; `Load more` veya sayfalama kullanılır ve token ID bazında dedupe edilir.

### Referrals tab

```text
Your referral link
https://site.example/r/0x71a4...b920     [Copy]

Registrations referred       12
Claimable rewards       {amount} {SETTLEMENT_SYMBOL}
Lifetime rewards        {amount} {SETTLEMENT_SYMBOL}

[ Claim rewards ]
```

Claimable balance doğrudan kontrattan okunur. Kayıt sayısı ve lifetime toplamı sınırlı event log sorgusundan okunabilir; public RPC sınırları sorun olursa bu tarihsel metrikler opsiyoneldir. Claimable balance hiçbir zaman tahmin edilmez.

Referral linki referrer adresini içerir, configured süre boyunca tarayıcıda tutulur, registration dialogunda görünür, kullanıcı tarafından temizlenebilir ve self-referral ise kontrat tarafından reddedilir.

### Listings & Proceeds tab

```text
Claimable sale proceeds          {amount} {SETTLEMENT_SYMBOL}
                                            [ Claim ]

alice.example          Listed       {price} {SYMBOL}   [ Edit ] [ Cancel ]
studio.example         Not listed               [ List ]
```

Bu tab kullanıcının sahip olduğu isimlerle listing mapping'lerini multicall ile birleştirir. Fiyat güncelleme, listing iptali ve seller proceeds claim burada tamamlanır.

## 9.4 Market `/market`

Market yalnızca zincirde yeniden doğrulanmış ACTIVE listing'leri gösterir:

```text
MARKET / ACTIVE LISTINGS

[ Search names ]      [ Newest ] [ Price low-high ]

alice.example          {price} {SYMBOL}       Expires Jul 2027
studio.example         {price} {SYMBOL}       Expires Dec 2028
builder.example        {price} {SYMBOL}        Expires Mar 2029
```

Filtreler:

- label search,
- newest,
- price low-high / high-low,
- label length,
- expiration.

V1 pagination `getListings(offset, limit)` ve multicall doğrulamasıyla çalışır. Backend database veya indexer kullanılmaz. Swap-and-pop nedeniyle pagination snapshot değildir; UI yüklenen token ID'leri dedupe eder. Listing seçildiğinde `/name/[label]` sayfasına gidilir; satın alma dialogu burada açılır.

Testnet V1'de sort/filter yüklenmiş ve doğrulanmış listing seti üzerinde çalışır; `Load more` yeni sayfaları ekler. UI bütün global market taranmış gibi yanıltıcı sonuç sayısı göstermemelidir.

`marketplacePaused == true` ise mevcut listing'ler read-only görülebilir; buy/list aksiyonları kapanır ve açıklayıcı banner gösterilir. Cancel, invalidate ve proceeds claim hesap ekranında açık kalır.

## 9.5 Developers `/developers`

Bu sayfa başka web sitelerinin isim servisini entegre etmesi için ürünün birinci sınıf parçasıdır. Pazarlama metni yerine çalışan örnekler ve kopyalanabilir kod sunar.

Bölümler:

1. Quickstart ve configured network/settlement bilgileri; ilk profilde Base Sepolia.
2. Contract adresi, version, deployment block, suffix, settlement ve explorer bağlantısı.
3. TypeScript SDK kurulumu.
4. Viem ile direct contract read örnekleri.
5. Name state, resolve, reverse lookup, profile, availability ve quote.
6. Read-only REST API ve OpenAPI.
7. Referral deep-link entegrasyonu.
8. Marketplace listing read, list, cancel, buy ve proceeds claim.
9. Contract event'leri ve hata kodları.
10. ABI, well-known manifest, `llms.txt` ve GitHub bağlantıları.

Dokümandaki bütün kod bloklarında copy butonu bulunur. Network ve contract değerleri deployment manifestinden üretilir; dokümanda elle tekrar edilmez. Henüz deployment yoksa açıkça `Not deployed` gösterilir, sahte adres kullanılmaz.

Genel kullanıcı rotaları RPC, manifest mismatch, liability, base-unit, raw record, token ID veya deployment operasyonu gibi iç uygulama terimlerini göstermemelidir. Bu ayrıntılar gerektiğinde log, test ve repository dokümanında kalır. `/developers` bu kuralın entegratör odaklı istisnasıdır; SDK, ABI, manifest, OpenAPI, endpoint ve güvenli write parametreleri görünür kalır. Owner, treasury ve ABI hash gibi makine tarafından keşfedilebilen fakat quickstart için gerekli olmayan alanlar public manifestte kalır, ana geliştirici özet kartlarında tekrarlanmaz.

## 9.6 Admin `/admin`

Admin sayfası normal dashboard template'i kullanmaz; public uygulamanın 12 kolonlu Modular Typography sistemi, 1px ayırıcıları, siyah/beyaz yüzeyi ve configured accent'iyle aynı tasarım ailesinde kalır. Ana sekmeler `Overview`, `Activity` ve `Controls` olur.

Erişim modeli:

1. Cüzdan bağlı değilse yalnız connect gate gösterilir.
2. Yanlış chain'de switch gate gösterilir.
3. Bağlı adres canlı `owner`, `pendingOwner` veya configured viewer listesinde değilse access denied gösterilir ve admin veri hook'ları mount edilmez.
4. Viewer overview/activity görür; bütün owner write input ve butonları disabled olur.
5. Owner bütün owner-only kontrolleri review dialogundan çalıştırabilir.
6. Pending owner yalnız iki adımlı ownership akışının accept adımını çalıştırabilir.
7. Admin linki yalnız yetkili bağlı cüzdanda header navigasyonuna eklenir; route `noindex` metadata yayınlar.

Activity log sorguları public RPC block-range limitine uyacak configured non-overlapping chunk'lara bölünür. Event başına ek block timestamp request'i yapılmaz; block ve transaction explorer linkleri korunur. Activity manuel refresh edilebilir ve başarılı transaction query cache'ini invalidate eder.

Controls şu kontrat fonksiyonlarını kapsar:

- `setAnnualPrice`, `setReferralRewardBps`, `setMarketplaceFeeBps`,
- `setRegistrationsPaused`, `setMarketplacePaused`,
- `setReservedLabels`,
- `setTreasury`, `withdrawTreasury`,
- `setMetadataBaseURI`,
- `transferOwnership`, `acceptOwnership`,
- `recoverUnsupportedERC20`,
- yalnız ERC-20 settlement modunda `sweepUnexpectedNative`.

`renounceOwnership()` kontratta bilinçli olarak kapalı olduğu için UI aksiyonu sunulmaz. Treasury withdrawal partial amount almaz; o anda `treasuryAvailableBalance()` ile dönen tutarın tamamını configured treasury'ye yollar. Tüm tutarlar manifest settlement precision/symbol ile parse/format edilir; ETH/18-decimal varsayımı admin kodunda da yapılmaz.

## 9.7 Registration dialog

Dialog alanları:

- full name,
- duration stepper veya segmented control,
- label uzunluğuna göre yıllık fiyat katmanı ve çarpanı,
- toplam fiyat,
- settlement asset ve payment mode,
- ERC-20 modunda balance/allowance durumu,
- ERC-20 approval gerekiyorsa checksum token ve spender contract adresleri ile explorer linkleri,
- estimated network fee,
- aktif referral varsa referrer kimliği ve contract'tan okunan `{referralRewardPercent}` bilgisi,
- wallet/network status,
- confirm button.

Dialog son quote sonucunu base unit `expectedAmount` olarak transaction argümanına koyar. Quote veya config/contract consistency değişirse eski confirm state'i geçersizleşir ve kullanıcı yeni tutarı yeniden onaylar.

Geçerli referral varsa dialog gösterdiği oranı `expectedReferralRewardBps` olarak, referrer yoksa `0` olarak gönderir. Oran değişikliği eski confirm state'ini geçersiz kılar.

Transaction state'leri:

```text
Ready
Approval required (ERC-20 only)
Awaiting token approval
Approval confirming
Awaiting wallet confirmation
Submitted
Confirming
Success
Failed
```

Success ekranı transaction explorer linkini ve bağlamsal sonraki aksiyonları gösterir:

```text
alice.example is yours.
[Open my names] [View name]
```

## 9.8 Renewal dialog

- mevcut expiration,
- uzatma yılı,
- yeni expiration,
- toplam fiyat,
- confirm.

Renewal da güncel quote'u `expectedAmount` olarak gönderir; fiyat mismatch'i otomatik olarak yeni tutarı kabul etmez.

## 9.9 Profile edit dialog

Alanlar:

- resolved EVM address,
- display name,
- bio,
- avatar URL,
- website,
- X username,
- GitHub username.

Frontend, kontrat limitleriyle aynı byte limitlerini kontrol eder ve karakter sayısı göstermek yerine UTF-8 byte sayısını dikkate alır.

Dialog transaction onayı öncesinde profile alanlarının public on-chain data olduğunu, current value temizlense bile geçmiş transaction/state erişiminin kalabileceğini açıkça belirtir. Kullanıcıdan secret, e-posta, telefon veya hassas kişisel veri istenmez.

## 9.10 Marketplace dialogları

List/update dialog:

- full name,
- current listing durumu,
- settlement asset satış fiyatı,
- contract'tan okunan marketplace fee (`%0` ilk profil),
- seller'ın claimable net tutarı,
- confirm veya cancel listing aksiyonu.

List/update confirm'i gösterilen fee BPS değerini `expectedFeeBps` olarak gönderir. Fee değişirse eski confirm state'i invalid olur; UI yeni net proceeds değerini gösterip yeniden onay ister. İlk listing başarı ekranının primary aksiyonu `Open market`, mevcut listing güncellemesinin sonucu `Listing updated` olur; modal başarıdan sonra doğrudan yeni bir update formuna dönmez. Kullanıcı markete yönlendirildiğinde işlem sonucu erişilebilir, dismiss edilebilir ve otomatik kapanan tek-seferlik toast ile tekrar belirtilir.

Buy dialog:

- full name,
- seller,
- listing fiyatı,
- marketplace fee bilgisi,
- network fee tahmini,
- yeni owner/resolution davranışı,
- wallet/network status,
- confirm buy.

Satın alma öncesinde listing, owner, ACTIVE status ve exact price yeniden okunur. UI okuduğu base-unit fiyatı `expectedPrice` olarak gönderir ve transaction'ı bu argümanla simüle eder; fiyat değişmişse kullanıcı yeni fiyatı açıkça onaylamadan işlem ilerlemez. Başarı ekranı transaction linki ile `Open my names` aksiyonunu gösterir ve seller proceeds cache'i invalidate edilir. Destination route açıldığında satın alma sonucu aynı tek-seferlik toast sistemiyle gösterilir.

Market işlem toast'ı URL query parametresi kullanmaz. Notice; schema/chain/contract scope'lu `sessionStorage` key'inde en fazla 10 dakika tutulur, route değişiminde bir kez okunup storage'dan hemen silinir, 6 saniyede kapanır ve kullanıcı tarafından erken dismiss edilebilir. Storage erişimi kapalıysa işlem ve yönlendirme yine tamamlanır; toast yalnız ek geri bildirimdir. `role=status`, `aria-live=polite`, reduced-motion ve mobil safe-area davranışı zorunludur.

Bütün fiyat, reward ve proceeds etiketleri configured `settlement.symbol` ve `settlement.decimals` ile formatlanır. Güncel `referenceFiat` bulunan production profilinde kayıt/renewal toplamı, listing fiyatı, buy toplamı, referral reward ve seller proceeds aynı exact base-unit oranından türetilen yaklaşık fiat referansını ve `asOf` tarihini gösterir. Ayrı `marketReference` configured ise settlement tutarları kısa canlı `USD REFERENCE` satırını gösterebilir. Network fee ayrı satırda chain native currency ile ve chain config'inin `standard` veya `op-stack` fee modeliyle tahmin edilir; OP Stack modelinde L1 data, L2 execution ve mevcutsa operator fee birlikte hesaplanır. ERC-20 settlement modunda allowance yetersizse dialog approval ve ana işlem adımlarını ayrı transaction olarak gösterir; tek işlem izlenimi vermez.

Approval ekranı exact human amount yanında raw base-unit amount'ı expandable detail olarak gösterir; token/spender adresini yalnızca symbol ile gizlemez. Unlimited approval hiçbir CTA'nın varsayılanı değildir.

## 9.11 Transfer dialog

- full name,
- current owner,
- checksum-validated recipient,
- listing/primary/profile cleanup özeti,
- “profile will be cleared” açık uyarısı,
- network fee,
- confirm transfer.

UI `safeTransferFrom` kullanır. Recipient sıfır adres olamaz; contract recipient ERC721Receiver desteklemiyorsa simulation başarısız olur ve transaction gönderilmez.

---

# 10. UI ve marka sistemi

## 10.1 Tasarım hedefi

UI şu hissi vermelidir:

```text
Sakin
Net
Editoryal
Modern
Kendine ait
Güvenilir
Tipografik
Kesin
```

Şu hissi vermemelidir:

```text
Hazır shadcn dashboard
AI ile hızlı üretilmiş landing page
Neon Web3 template
Glassmorphism
Mor-pembe gradient
3D blockchain küresi
Her şeyin kart içinde olduğu arayüz
Generic bento grid
Vibecoding / AI starter görünümü
```

Referans sınırı:

- TempoID'den yalnızca doğrudan arama akışı, kısa fiyat anlatımı ve geliştirici dokümantasyonunun ürün içinde yer alması öğrenilir.
- HoodDomains'ten chain'e özel güçlü kimlik ve domaini bir sahiplik objesi olarak sunma yaklaşımı öğrenilir.
- Bu sitelerin layout'u, component yapısı, tipografi seçimi, metinleri veya görsel efektleri kopyalanmaz.
- İlk ekran pazarlama landing page'i değil, çalışan name-search deneyimidir.

## 10.2 Ana görsel nesne

Her projenin ana görsel objesi “dijital isim plakası”dır. Name page, success state, metadata NFT görseli ve sosyal paylaşım görseli aynı objenin varyasyonlarını kullanır.

## 10.3 Tema

İlk Base Sepolia sürümü tek bir yüksek-kontrast kompozisyon kullanır. Ayrı light/dark toggle zorunlu değildir; beyaz ana tuval ve siyah bölümler aynı sayfa içinde ritmik biçimde kullanılır.

```css
--background: #ffffff;
--foreground: #0a0b0d;
--surface: #ffffff;
--surface-inverse: #0a0b0d;
--foreground-inverse: #ffffff;
--surface-muted: #eef0f3;
--muted: #5b616e;
--line: #b1b7c3;
--accent: #0000ff;
--accent-foreground: #ffffff;
--focus: #0000ff;
```

Base Blue resmi `#0000ff` değerinde tutulur ve ana aksiyonlar, focus, aktif durumlar ve küçük veri vurguları için kullanılır. Grayscale ve boşluk, mavi renkten görsel olarak daha baskın olmalıdır. Gradient veya mavinin türetilmiş tonları kullanılmaz.

## 10.4 Tipografi

İlk sürüm tipografi üçlüsü:

- Display ve büyük isimler: Archivo Variable
- UI ve uzun metin: IBM Plex Sans
- Adres, hash, fiyat ve teknik etiket: IBM Plex Mono

Tasarım yönü `Modular Typography` olarak uygulanır:

```text
01 / SEARCH
02 / AVAILABILITY
03 / REGISTER
04 / IDENTITY
```

- Bölüm numaraları, durum metinleri, fiyat ve isim aynı grid üzerinde ayrı tipografik modüllerdir.
- Büyük yazı dekorasyon değildir; arama, durum veya isim gibi gerçek ürün bilgisini taşır.
- Font boyutları viewport genişliğiyle sürekli ölçeklenmez; mobil, tablet ve desktop için sabit type-step'ler kullanılır.
- Letter spacing `0` olmalıdır; negatif tracking kullanılmaz.
- En uzun label mobil ve desktop görünümde taşmadan sığmalıdır.
- Tipografik modüller birbirini örtmez ve dinamik içerik geldiğinde layout kaydırmaz.

Fontlar `next/font` üzerinden self-host edilir. Bir klonda farklı font seçilirse yalnızca `apps/web/lib/fonts.ts` ve type token'ları değişmelidir.

## 10.5 Layout token'ları

```css
--content-max: 1120px;
--reading-max: 680px;
--grid-columns: 12;
--grid-gutter: 16px;
--baseline: 8px;
--radius-small: 4px;
--radius-medium: 8px;
--control-height: 52px;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-18: 72px;
```

## 10.6 UI kuralları

- Ana içerik birden fazla nested card içine konulmamalıdır.
- Sayfa iskeleti 12 kolonlu grid, 1px ayırıcı çizgiler ve tam genişlik modüllerle kurulmalıdır.
- Border radius 0-8px aralığında kalmalıdır; pill kontroller kullanılmamalıdır.
- Primary button dışında yoğun vurgu rengi kullanılmamalıdır.
- Available durumu yalnızca renk ile anlatılmamalı; metin ve ikon da olmalıdır.
- Hareketler 120-220ms arası ve işlevsel olmalıdır.
- Parallax, sürekli dönen obje ve cursor-follow animasyonu yoktur.
- Skeleton yükleme sade olmalıdır.
- Mobil görünüm en baştan uygulanmalıdır.
- Klavye focus stilleri görünür olmalıdır.
- Copy, external-link, close, back ve transaction-link gibi tanıdık aksiyonlarda Lucide icon kullanılır; icon-only button'larda accessible name ve hover/focus tooltip zorunludur.
- Duration için segmented control, sayısal fiyat/yıl için uygun input veya stepper, binary durum için checkbox/toggle kullanılır; metinli rounded rectangle her kontrolün yerine geçirilmez.
- Dialog focus trap, Escape ile kapanma, focus return ve screen-reader başlık/açıklama ilişkisini uygular. Kritik transaction confirm dialogu backdrop click ile yanlışlıkla kapanmaz.
- Interactive target en az 44x44 CSS px olur; disabled/loading durumu yalnızca opacity ile anlatılmaz.
- `prefers-reduced-motion` hareketleri kapatır veya anlık hale getirir; text ve UI contrast WCAG AA hedefini karşılar.
- Kontrast WCAG AA hedeflemelidir.
- Hero içinde gerçek arama kontrolü bulunmalı; ayrı pazarlama CTA kartı kullanılmamalıdır.
- Marketplace generic NFT card grid kullanmamalıdır; isim, seller, fiyat ve expiry 12 kolonlu tipografik satırlarda karşılaştırılmalıdır.
- Mobilde modüller 4 kolona yeniden akar, içerik sırası ve bilgi hiyerarşisi korunur.
- İşlem toast'ı yalnız doğrulanmış success state'inden sonra gösterilir; aynı bilgiyi kalıcı URL parametresinde, sayfa yenilemelerinde veya süresi geçmiş session'da tekrarlamaz.

## 10.7 Motto

Default:

```text
Name your place onchain.
```

Motto konfigürasyondan değişir ve hero alanında kullanılır.

---

# 11. Konfigürasyon modeli

## 11.1 Public proje konfigürasyonu

Dosya:

```text
apps/web/config/project.config.ts
```

Örnek:

```ts
export const projectConfig = {
  brand: {
    name: 'Chain Name',
    shortName: 'Chain Name',
    suffix: 'example',
    motto: 'Name your place onchain.',
    description: 'A readable identity on Base Sepolia.',
    theme: 'contrast' as const,
    accent: '#0000ff',
    logo: '/brand/logo.svg',
    mark: '/brand/mark.svg',
    favicon: '/brand/favicon.svg',
  },

  collection: {
    name: 'Chain Name',
    symbol: 'CNAME',
  },

  chain: {
    id: 84532,
    name: 'Base Sepolia',
    testnet: true,
    requiredConfirmations: 1,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
    explorerUrl: 'https://sepolia-explorer.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },

  settlement: {
    kind: 'native' as const,
    tokenAddress: null,
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  names: {
    minLength: 1,
    maxLength: 32,
    allowedYears: [1, 2, 3, 4, 5] as const,
    gracePeriodDays: 30,
  },

  pricing: {
    annual: '0.0005',
    shortNameMultipliers: [100, 25, 5] as const,
    referenceFiat: null,
  },

  referrals: {
    rewardBps: 1000,
    attributionDays: 30,
  },

  marketplace: {
    feeBps: 0,
    listingsPerPage: 24,
  },

  integration: {
    docsPath: '/developers',
    metadataPath: '/api/metadata/',
    nameApiPath: '/api/name/{label}',
    resolveApiPath: '/api/resolve/{label}',
    reverseApiPath: '/api/reverse/{address}',
    wellKnownPath: '/.well-known/chain-name-service.json',
    marketApiPath: '/api/market',
    openApiPath: '/api/openapi.json',
  },

  links: {
    website: '',
    x: '',
    discord: '',
  },
} as const;
```

ERC-20/stablecoin deployment örneği settlement ve pricing override'ını birlikte tanımlar:

```ts
const erc20ProfileOverride = {
  settlement: {
    kind: 'erc20' as const,
    tokenAddress: process.env.NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS! as `0x${string}`,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  pricing: {
    annual: '1',
    referenceFiat: {
      currency: 'USD',
      amount: '1.00',
      asOf: '2026-07-11',
      maxAgeDays: 7,
    },
  },
} as const;
```

Konfigürasyon Zod discriminated union ile uygulama açılırken doğrulanmalıdır. Kurallar:

- `collection.name` 1-64, collection symbol 1-16 UTF-8 byte içindedir. Bütün integration path'leri `/` ile başlar, `..`, query veya hash içermez; metadata path ayrıca `/` ile biter. Absolute metadata base URI, validated `NEXT_PUBLIC_SITE_URL` origin'i ile bu path'ten üretilir. Name/resolve path'leri tam bir `{label}`, reverse path tam bir `{address}` placeholder'ı içerir.
- `chain`: positive safe-integer chain ID, non-empty name, boolean testnet, 1-100 arası required confirmations, valid RPC/explorer URL ve 0-36 arası native decimals; production URL'leri HTTPS olmalıdır.
- Native/settlement asset name 1-64, symbol 1-16 UTF-8 byte içindedir ve control character içermez.
- `native`: tokenAddress null; name/symbol/decimals chain native currency ile aynı.
- `erc20`: geçerli ve sıfır olmayan token address; decimals 0-36; symbol/name on-chain metadata ile aynı.
- `pricing.annual`: pozitif decimal string, configured decimals içinde temsil edilebilir ve base-unit sonucu `MAX_ANNUAL_PRICE` değerini aşmaz.
- `pricing.referenceFiat`: `chain.testnet == true` iken null; doluysa üç uppercase ISO currency code, pozitif decimal amount, gelecekte olmayan `YYYY-MM-DD` ve 1-365 arası integer `maxAgeDays` içerir.
- `names`: min/max ve allowed-year değerleri contract sabitleriyle tam eşleşir; grace period constructor sınırları içindedir.
- `referrals.attributionDays` 1-90, `marketplace.listingsPerPage` 1-50 aralığındadır.
- Referral/marketplace basis point sınırları aşılmaz.
- Eksik RPC, hatalı chain ID veya geçersiz suffix uygulamayı sessizce çalıştırmaz.
- UI hiçbir yerde `ETH`, `USDC`, `18`, `wei`, `parseEther` veya `formatEther` hardcode etmez.

## 11.2 Deployment manifest

Dosya:

```text
deployments/84532.json
```

Örnek:

```json
{
  "contract": null,
  "contractVersion": "2.0.0",
  "deploymentBlock": null,
  "deployedAtTimestamp": null,
  "owner": null,
  "treasury": null,
  "transactionHash": null
}
```

Bu dosya minimal broadcast kaydıdır; public manifest değildir. Foundry broadcast sonrası contract address, receipt block, block timestamp, owner, treasury ve transaction hash ile doldurulur. `generate-manifest.ts` bu kayıt ile project config'i birleştirir; ABI'yi deterministic minified UTF-8 JSON olarak export eder ve `abiSha256` alanına servis edilen exact file byte'larının lowercase hex SHA-256 değerini yazar. Frontend contract/owner/treasury, settlement token veya deployment block değerini source code içinde hardcode etmez; public manifestten okur. Base-unit tutarlar, block/count değerleri ve duration/timestamp'ler JSON number değil decimal string olarak saklanır; bounded basis-point/confirmation değerleri JSON number olabilir. Public manifestte `deploymentBlock` decimal string, `deployedAt` UTC ISO-8601 string olur.

`abiSha256` public release'te `0x` prefix'i olmayan tam 64 lowercase hex karakterdir; `contractVersion` SemVer string'i contract `VERSION()` ile aynıdır.

Manifestteki bütün non-null EVM adresleri Viem `getAddress` ile EIP-55 checksum biçiminde üretilir. Karşılaştırma normalize edilmiş address byte değeriyle yapılır; raw string casing farkı deployment mismatch sayılmaz.

Uygulama başlangıcında manifest/config ile ABI/chain/contract/token read değerleri (`abiSha256`, `VERSION`, `chainId`, chain name/testnet/required-confirmations değerleri, native currency metadata, Multicall3 bytecode, collection name/symbol, owner/treasury, `suffix`, metadata base URI, settlement kind/token/name/symbol/decimals, standard `annualPrice`, 1/2/3/4-karakter quote sonuçları, grace period ve fee oranları) karşılaştırılır. Kritik mismatch varsa write aksiyonları fail closed olur ve deployment/configuration error gösterilir.

Owner/treasury, `annualPrice`, `referralRewardBps`, `marketplaceFeeBps` veya `metadataBaseURI` değiştirildiğinde admin workflow işlem receipt'ini bekler, chain'den yeni değerleri okuyarak manifesti yeniden üretir ve frontend release'i tamamlanana kadar ilgili UI mismatch nedeniyle fail closed kalır. Config/manifest güncellenmeden zincir parametresi değiştirilmiş haliyle bırakılmaz.

## 11.3 Environment değişkenleri

`.env.example`:

```bash
# Web - public; never place secret provider credentials in NEXT_PUBLIC_* values
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
# Comma-separated read-only admin workspace viewers
NEXT_PUBLIC_ADMIN_ADDRESSES=
# Required only when settlement.kind is "erc20"
NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS=

# Deployment - never expose to browser
# Optional server-only authenticated provider for hosted API reads
RPC_URL=
PRIVATE_KEY=
OWNER_ADDRESS=
TREASURY_ADDRESS=
EXPLORER_API_URL=
EXPLORER_API_KEY=
EXPLORER_VERIFIER=blockscout
```

Kurallar:

- `PRIVATE_KEY` hiçbir zaman `NEXT_PUBLIC_` ile başlamaz.
- `NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS` yalnızca ERC-20 modunda zorunlu; native modda boş kalır.
- `NEXT_PUBLIC_SITE_URL` absolute origin olmalı; production'da HTTPS ve path/query/hash içermemelidir. Metadata/external URL'ler bu origin'den üretilir.
- Bütün `NEXT_PUBLIC_*` değerleri browser bundle'ında görünür. `NEXT_PUBLIC_RPC_URL` yalnızca public veya origin/domain-restricted browser credential kullanır; gizli provider key bu alana yazılmaz.
- Hosted read-only API, `RPC_URL` tanımlıysa server-side zincir okumalarında bu endpoint'i; tanımlı değilse public manifest RPC'sini kullanır. `RPC_URL` hiçbir public manifest/API context alanına kopyalanmaz.
- Gerçek `.env` commit edilmez.
- `EXPLORER_VERIFIER` desteklenen `blockscout`, `etherscan`, `sourcify` veya `none` değerlerinden biridir; wrapper yalnızca seçilen verifier'ın gerektirdiği URL/key argümanlarını geçirir.
- `.env.example` public Base Sepolia/local-development default'ları içerebilir; private key, owner-specific secret veya gerçek API key alanları boş kalır.
- Production RPC browser kullanımı için public veya origin/domain-restricted provider endpoint'i kullanır; server-only secret gerektiren bir URL `NEXT_PUBLIC_RPC_URL` içine konmaz.
- `pnpm release:check`; final HTTPS hostname, ayrı server-only `RPC_URL`, WalletConnect project ID, deployed contract ve final origin ile eşleşen metadata base URI tamamlanmadan hosted release'i fail closed durdurur.

---

# 12. Repository yapısı

```text
chain-name-dapp/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── api/
│       │   │   ├── image/[tokenId]/route.ts
│       │   │   ├── metadata/[tokenId]/route.ts
│       │   │   ├── name/[label]/route.ts
│       │   │   ├── resolve/[label]/route.ts
│       │   │   ├── reverse/[address]/route.ts
│       │   │   ├── market/route.ts
│       │   │   └── openapi.json/route.ts
│       │   ├── .well-known/chain-name-service.json/route.ts
│       │   ├── developers/page.tsx
│       │   ├── name/[label]/page.tsx
│       │   ├── me/page.tsx
│       │   ├── market/page.tsx
│       │   ├── r/[referrer]/route.ts
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── error.tsx
│       │   └── not-found.tsx
│       ├── components/
│       │   ├── layout/
│       │   ├── ui/
│       │   └── wallet/
│       ├── features/
│       │   ├── search/
│       │   ├── registration/
│       │   ├── renewal/
│       │   ├── profile/
│       │   ├── account/
│       │   ├── referrals/
│       │   ├── marketplace/
│       │   ├── developer-docs/
│       │   ├── recent-names/
│       │   └── owned-names/
│       ├── config/
│       │   ├── project.config.ts
│       │   └── project-config.schema.ts
│       ├── lib/
│       │   ├── chain.ts
│       │   ├── deployment-manifest.schema.ts
│       │   ├── fonts.ts
│       │   ├── name-normalization.ts
│       │   ├── settlement.ts
│       │   ├── wagmi.ts
│       │   ├── contract/
│       │   │   ├── abi.ts
│       │   │   ├── address.ts
│       │   │   ├── reads.ts
│       │   │   └── writes.ts
│       │   └── formatting/
│       ├── public/
│       │   ├── abi/
│       │   │   └── ChainNameService.json
│       │   ├── llms.txt
│       │   └── brand/
│       │       ├── logo.svg
│       │       ├── mark.svg
│       │       ├── favicon.svg
│       │       └── social-card.png
│       └── styles/
│           ├── globals.css
│           └── tokens.css
│
├── packages/
│   └── sdk/
│       ├── src/
│       │   ├── client.ts
│       │   ├── contract.ts
│       │   ├── errors.ts
│       │   ├── manifest.ts
│       │   ├── marketplace.ts
│       │   ├── referrals.ts
│       │   ├── types.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── contracts/
│   ├── src/
│   │   └── ChainNameService.sol
│   ├── test/
│   │   ├── ChainNameService.unit.t.sol
│   │   ├── ChainNameService.fuzz.t.sol
│   │   ├── ChainNameService.invariant.t.sol
│   │   └── mocks/
│   │       ├── MockERC20.sol
│   │       ├── MockFeeOnTransferERC20.sol
│   │       └── MockAdminBurnERC20.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── Admin.s.sol
│   ├── foundry.toml
│   └── remappings.txt
│
├── deployments/
│   └── .gitkeep
│
├── scripts/
│   ├── chain-check.ts
│   ├── export-abi.ts
│   ├── generate-manifest.ts
│   ├── validate-project.ts
│   └── reset-clone.ts
│
├── docs/
│   ├── IMPLEMENTATION_STATUS.md
│   ├── DEPLOYMENT.md
│   └── CLONE_CHECKLIST.md
│
├── .env.example
├── .gitignore
├── AGENTS.md
├── PROJECT_SPEC.md
├── INTEGRATION_GUIDE.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

Turborepo zorunlu değildir. pnpm workspace yeterlidir.

`PROJECT_SPEC.md` ve `INTEGRATION_GUIDE.md` için ikinci bir kopya oluşturulmaz. `/developers` sayfası ve generated API dokümanı bu canonical dosyalardan/manifestten beslenir; duplicate Markdown dosyaları drift kaynağı olamaz.

---

# 13. Frontend teknik kuralları

## 13.1 Chain tanımı

Chain, Viem `defineChain` ile public config'ten oluşturulur. Chain ID veya explorer linkleri bileşenlerde tekrar hardcode edilmez.

## 13.2 Wagmi config

Zorunlu connector:

```text
injected
```

Opsiyonel connector:

```text
walletConnect
```

WalletConnect project ID yoksa uygulama hata vermeden yalnızca injected connector ile çalışır.

## 13.3 Contract reads

Sık read'ler:

- `VERSION` (label, duration ve query limitleri manifest/dokümandan gelir)
- `name`, `symbol`, `suffix`, `metadataBaseURI`
- `owner`, `treasury`
- `isAvailable`
- `reservedLabels(keccak256(bytes(label)))`
- `statusOf`
- `quote`
- `annualPrice`
- `fullName`
- `expiresAt`
- `resolvedAddress`
- `profileOf`
- `primaryTokenId`
- `hasPrimary`
- `getRecentRegistrations`
- `getListings`
- `listings`
- `sellerBalance`
- `referralBalance`
- `settlementKind`
- `settlementToken`
- `settlementBalance`
- `totalProtectedLiability`, `isSolvent`, `treasuryAvailableBalance`
- `registrationsPaused`
- `marketplacePaused`
- `referralRewardBps`
- `marketplaceFeeBps`
- ERC-20 modunda `balanceOf` ve `allowance`
- `balanceOf`
- `tokenOfOwnerByIndex`

Aynı ekranda birden fazla read mümkünse multicall kullanılmalıdır.

## 13.4 Contract writes

Write akışı:

1. Form validation.
2. Correct chain check.
3. Settlement mode ve required base-unit amount doğrulama; register/renew için güncel quote, referrer'lı register için reward BPS, buy için güncel listing price, list/update için güncel marketplace fee beklenen değer olarak sabitlenir.
4. ERC-20 modunda balance/allowance kontrolü; yetersiz allowance varsa exact-amount approval.
5. Approval receipt sonrası allowance re-read.
6. Ana işlem için ilgili `expectedAmount`/`expectedReferralRewardBps`/`expectedPrice`/`expectedFeeBps` argümanıyla `simulateContract`.
7. Wallet confirmation ve transaction submit.
8. Receipt ve `chain.requiredConfirmations` kadar confirmation bekleme.
9. İlgili query'leri invalidate etme.
10. Success state ve explorer linki.

Native modda write request `value: requiredAmount` içerir. ERC-20 modda write request native value taşımaz. Payment ve gas tutarları UI'da ayrı gösterilir.

Her write işleminde kullanıcıya ham RPC hata nesnesi gösterilmemelidir. Bilinen hata türleri anlaşılır mesaja çevrilmelidir.

## 13.5 Name normalization utility

Tek kaynak:

```text
apps/web/lib/name-normalization.ts
```

Fonksiyonlar:

```ts
export declare function normalizeLabel(input: string, suffix: string): string;
export declare function validateLabel(label: string): ValidationResult;
export declare function getUtf8ByteLength(value: string): number;
```

Search, route param, registration form ve profile edit aynı utility'yi kullanmalıdır.

Public page route'u normalize edilebilir input'u canonical lowercase label URL'sine `308` redirect eder (`/name/Alice.example` → `/name/alice`); geçersiz karakteri sessizce silmez ve `404` + `noindex` döndürür. Valid name sayfası canonical metadata taşır. Machine API'ler canonical label bekler, uppercase/suffix içeren input'a `400 INVALID_INPUT` ve opsiyonel `normalizedSuggestion` döndürür; redirect ile cache/signature semantiğini gizlemez. `/admin`, `/me`, `/api/*` ve referral attribution route'ları crawl dışıdır; public ana route'lar final origin ile `sitemap.xml` içinde yayınlanır.

## 13.6 Settlement utility

Tek kaynak:

```text
apps/web/lib/settlement.ts
```

Fonksiyonlar:

```ts
export declare function parseSettlementAmount(value: string, decimals: number): bigint;
export declare function formatSettlementAmount(value: bigint, decimals: number): string;
export declare function formatSettlementLabel(value: bigint, asset: SettlementAsset): string;
```

- `parseUnits` ve `formatUnits` kullanılır; `parseEther/formatEther` ortak kodda yasaktır.
- Decimal tutarlar hiçbir zaman JavaScript `number` üzerinden hesaplanmaz.
- UI configured symbol'ü gösterir; token symbol'ünü string birleştirmeyle varsaymaz.
- ERC-20 runtime metadata manifest ile uyuşmazsa ödeme aksiyonları fail closed olur.
- Gas estimate chain native symbol ile, application payment settlement symbol ile etiketlenir.

## 13.7 Loading ve error davranışı

- Availability kontrolünde debounce 250-350ms olabilir.
- Kullanıcı submit'e bastığında yeniden availability ve quote okunmalıdır.
- RPC başarısızsa “Name unavailable” gösterilmemeli; açıkça “Could not check availability” denmelidir.
- Transaction receipt beklenirken button yeniden tıklanamaz.
- Route param geçersizse 404 yerine name validation error gösterilebilir.
- Yetersiz settlement balance/allowance, approval rejection, changed price/fee, protocol insolvency, settlement transfer mismatch ve gas yetersizliği ayrı hata mesajlarıdır.

## 13.8 Referral attribution

- `/r/[referrer]` yalnızca geçerli EVM adreslerini kabul eder.
- Route geçerli adres için first-party, `referrals.attributionDays` süreli, versioned ve chain/contract-scope edilmiş attribution cookie'si yazar; `SameSite=Lax`, production'da `Secure` ve `Path=/` kullanır, ardından ana sayfaya redirect eder.
- Cookie referral adresi dışında kişisel veri taşımaz. Client'ın göstermesi/temizlemesi gerektiği için V1'de `HttpOnly` değildir; değer her kullanımda yeniden address validation'dan geçer.
- Kayıt dialogu referrer'ı kısaltılmış adres veya primary name ile görünür gösterir.
- Kullanıcı referral bilgisini kayıt öncesinde temizleyebilir.
- `referrer === connectedAccount` veya `referrer === recipient` ise değer kontrata gönderilmez ve UI self-referral uyarısı gösterir.
- Referral linki açmak tek başına wallet bağlantısı veya kişisel veri aktarımı gerektirmez.
- Başarılı registration sonrasında kullanılan attribution temizlenir; aynı link tekrar ziyaret edilirse yeniden oluşabilir.
- Geçersiz, süresi dolmuş, farklı chain/contract scope'lu veya eski schema version'lı attribution sessizce ödeme çağrısına eklenmez ve storage'dan temizlenir.

## 13.9 Geliştirici dokümantasyonu

- `/developers` statik pazarlama metni değil, deployment manifestinden beslenen çalışan dokümandır.
- Kod örnekleri TypeScript/Viem, React/Wagmi ve Foundry/Cast için ayrı sekmelerde verilir.
- Her kod örneği typecheck edilebilen source fixture'dan üretilir veya testte derlenir; elle yazılmış ve zamanla bozulan snippet bırakılmaz.
- ABI hash'i, contract adresi, chain ID ve deployment block doküman ile manifest arasında test edilir.
- SDK ve HTTP API hata davranışları açıkça belgelenir.
- Native ve ERC-20 settlement entegrasyonları, allowance akışı ve base-unit JSON formatı ayrı örneklenir.
- Name-state endpoint örneği available/reserved/released ve `nftOwner`/`effectiveOwner` farkını gösterir.
- Base Sepolia public RPC'nin rate-limited olduğu belirtilir; production entegrasyonlarında özel RPC önerilir.

## 13.10 Marketplace frontend kuralları

- Listing kartındaki fiyat, seller ve ACTIVE durumu satın alma dialogu açılırken yeniden okunur.
- `simulateContract` başarısızsa wallet transaction'ı istenmez.
- Buy receipt sonrası listing, owner, `/market`, `/me`, profile ve balance query'leri invalidate edilir.
- Market sort/filter işlemleri yalnızca doğrulanmış ACTIVE sonuçlar üzerinde uygulanır.
- Stale listing kullanıcıya satılık gösterilmez; uygun durumda permissionless `invalidateListing()` cleanup aksiyonu arka planda önerilebilir ancak kullanıcı onayı olmadan transaction gönderilmez.
- Fiyat input'u decimal string olarak doğrulanır ve yalnızca `parseUnits(value, settlement.decimals)` ile base unit'e çevrilir; JavaScript number kullanılmaz.
- Seller proceeds ve referral rewards farklı bakiyeler olarak açıkça etiketlenir; tek toplam altında anlamı gizlenmez.

## 13.11 On-chain içerik güvenliği

- Profile string'leri tamamen untrusted input kabul edilir; `dangerouslySetInnerHTML` kullanılmaz.
- Chain/token/collection metadata ve manifest string'leri de untrusted text gibi escape edilir; symbol/name değerleri HTML olarak render edilmez.
- Bio ve display name plain text render edilir.
- Website/avatar URL'leri `URL` parser ile doğrulanır; yalnızca açıkça desteklenen `https:` ve configured decentralized-storage gateway şemaları link/render edilir.
- Avatar URL'si server-side image optimizer/proxy'ye sınırsız aktarılmaz. `next/image` remote patterns explicit host allowlist kullanır; localhost, private/link-local IP ve credential içeren URL'ler reddedilir. Allowlist dışı avatar için güvenli fallback gösterilir.
- Dış linkler `rel="noopener noreferrer"` kullanır.
- X/GitHub handle alanları trusted path kabul edilmez; izin verilen handle pattern'iyle doğrulanır ve URL segmenti encode edilir, aksi halde plain text gösterilir.
- Metadata JSON serializer ve SVG image route bütün dinamik metni escape eder.
- Uygulama CSP header'larıyla script, frame, image ve connect kaynaklarını mümkün olduğunca daraltır.

---

# 14. Test planı

## 14.1 Kontrat unit testleri

Zorunlu testler:

### Label validation

- boş label reddedilir.
- 1 karakter kabul edilir.
- 2 karakter kabul edilir.
- 3 karakter kabul edilir.
- 32 karakter kabul edilir.
- 33 karakter reddedilir.
- uppercase reddedilir.
- underscore, space, dot ve Unicode reddedilir.
- başta/sonda tire reddedilir.
- çift tire reddedilir.

### Pricing

- 1/2/3 karakter sırasıyla configured `100x/25x/5x`, 4 ve 32 karakter `1x` yıllık fiyat döndürür.
- Base Sepolia native fixture fiyatı `500000000000000` base unit'tir.
- 6-decimal ERC-20 fixture fiyatı doğru base unit ile deploy edilir.
- 1-5 yıl doğru çarpılır.
- 0 ve 6 yıl reddedilir.
- fiyat değişikliği hemen quote'a yansır.
- annual-price değişikliği bütün kısa-isim katmanlarını oransal olarak günceller.
- sıfır veya ascending kısa-isim çarpan schedule'ı constructor'da reddedilir.
- register/renew işlemi hazırlanırken yıllık fiyat değişirse `expectedAmount` uyuşmazlığı ödeme öncesinde revert eder.

### Registration

- ERC-165/ERC-721/ERC-721 Metadata/ERC-721 Enumerable/ERC-4906 interface ID'leri doğru döner.
- native modda doğru `msg.value` ile mint.
- native modda eksik/fazla ödeme revert.
- ERC-20 modda `msg.value > 0` revert.
- ERC-20 modda allowance/balance yetersizliği revert.
- ERC-20 modda exact transferFrom ile mint.
- fee-on-transfer mock token balance delta mismatch ile revert.
- aktif isim tekrar alınamaz.
- grace içindeki isim tekrar alınamaz.
- grace sonrası burn + re-mint yapılır.
- reserved isim reddedilir.
- pause sırasında register reddedilir.
- recipient sıfır adres reddedilir.
- recipient protocol contract adresiyse reddedilir.
- payer ve recipient farklıysa owner/resolution recipient olur; event payer'ı ayrıca kaydeder.
- ERC721Receiver callback'i label, expiry, resolution ve owner state'ini initialize edilmiş görür.
- geçerli referral reward bakiyesine yazılır.
- sıfır referrer referralsız kayıt olarak çalışır.
- payer veya recipient self-referral olarak reddedilir.
- referrer varsa reward oranı hazırlık ile execution arasında değişirse state/tahsilat öncesinde revert eder.

### Renewal

- aktif isim yenilenir.
- grace içindeki isim yenilenir.
- grace bittikten sonra renew reddedilir.
- başkası bir domaini yenileyebilir.
- third-party renewal event'i payer'ı doğru kaydeder; ownership değişmez.
- pause renewal'ı engellemez.
- expiration hiçbir zaman azalmaz.

### Settlement

- NATIVE config yalnızca sıfır token adresiyle deploy olur.
- ERC20 config yalnızca bytecode içeren sıfır olmayan token adresiyle deploy olur.
- Settlement kind/token deployment sonrası değiştirilemez.
- Native payout ve ERC-20 SafeERC20 payout doğru recipient'a gider.
- ERC-20 collection ve payout payer/contract/recipient exact balance delta'larını doğrular.
- Claim recipient sıfır adres olamaz.
- ERC-20 modda doğrudan native value reddedilir.
- Settlement dışı ERC-20 rescue edilebilir; settlement token rescue edilemez.
- ERC-20 modda beklenmeyen native balance treasury'ye sweep edilebilir.

### Profile ve resolution

- owner güncelleyebilir.
- approved address güncelleyebilir.
- operator güncelleyebilir.
- yetkisiz hesap reddedilir.
- field limitleri uygulanır.
- metadata event emit edilir.
- primary name'in resolution'ını owner dışındaki sıfır veya başka adrese değiştirmek primary mapping'i temizler.
- RELEASED token update yapamaz.

### Primary name

- owner primary seçebilir.
- owner yalnızca kendisine forward-resolve olan ismi primary seçebilir.
- başka hesap seçemez.
- transferde eski primary temizlenir.
- re-registration'da eski primary temizlenir.
- clear çalışır.
- clear için primary kaydı yoksa ve aynı healthy token tekrar set edilirse revert eder.
- bütün set/cleanup yolları tek ve doğru `PrimaryNameChanged` event'i üretir.
- `hasPrimary` false iken `primaryTokenId` sentinel olarak yorumlanmaz.
- stale/released veya başka adrese resolve olan primary lookup boş döner.
- permissionless clearInvalidPrimary stale kaydı temizler, sağlıklı primary'yi temizleyemez.

### Treasury

- sadece tanımlı treasury alır.
- sıfır/contract-self owner ve treasury reddedilir.
- transfer başarısızsa revert.
- treasury withdrawal event doğru.
- referral ve seller liability treasury tarafından çekilemez.
- treasury balance hesabı native ve ERC-20 settlement için doğrudur.
- insolvency fixture'ında treasury available sıfır, `isSolvent` false ve treasury withdrawal kapalıdır.
- insolvency register/renew/list/buy'ı tahsilat veya state değişiminden önce durdurur; claim/cancel/invalidate çalışmaya devam eder.
- ownership iki adımda transfer olur ve renounce ownership reddedilir.

### Admin validation

- invalid suffix/collection metadata, grace bounds, zero/overflowing annual price ve invalid metadata URI reddedilir.
- metadata base URI değişikliği custom event ve tek bir batch event emit eder.
- reserved batch limiti uygulanır ve invalid label reddedilir.
- existing tokenı reserved yapmak mevcut ownership'i etkilemez, sonraki re-registration'ı engeller.
- `isReserved` invalid label için false, valid reserved label için true döner; reserved UNREGISTERED/RELEASED label available değildir.

### Referrals

- reward doğru basis-point hesabıyla oluşur.
- valid referrer için rounded reward sıfır olsa da attribution event'i emit edilir, liability artmaz.
- referral ve marketplace fee hesapları floor rounding ve düşük tutar sınırlarında doğrudur.
- reward yalnızca registration için oluşur, renewal için oluşmaz.
- referrer yalnızca kendi bakiyesini claim eder.
- referrer payout recipient seçebilir, başka hesabın bakiyesini claim edemez.
- sıfır bakiyeyle claim reddedilir.
- claim state'i external call öncesinde günceller.
- başarısız claim transferi state'i revert eder.
- referral rate maksimum sınırı aşamaz.

### Marketplace

- yalnızca owner ACTIVE ismi listeleyebilir.
- approved operator listing oluşturamaz.
- sıfır fiyat reddedilir.
- listing fiyatı güncellenebilir ve iptal edilebilir.
- list/update sırasında marketplace fee değişmişse `expectedFeeBps` guard state yazılmadan revert eder.
- listing update `listedAt`/fee snapshot'ını yeniler ve enumeration duplicate üretmez.
- yalnızca listing seller iptal edebilir; pause ve lifecycle durumu iptali engellemez.
- normal transfer listing'i temizler.
- GRACE veya RELEASED isim satın alınamaz.
- GRACE içinden renewal eski listing'i temizler.
- buyer seller olamaz.
- eksik veya fazla ödeme reddedilir.
- listing fiyatı hazırlık ile execution arasında değişirse `expectedPrice` uyuşmazlığı tahsilattan önce revert eder.
- başarılı buy owner/resolution ve primary cleanup davranışını doğru uygular.
- normal transfer ve buy eski profile'ı temizler.
- normal transfer ve buy tam bir `MetadataUpdate` emit eder; duplicate event üretmez.
- protocol contract adresine transfer reddedilir.
- seller proceeds doğru hesaplanır ve yalnızca seller claim eder.
- seller payout recipient seçebilir, başka seller bakiyesini claim edemez.
- fee `0 bps` iken seller tam fiyatı alır.
- admin fee değişikliği mevcut listing'in snapshot fee değerini değiştirmez.
- maksimum market fee sınırı uygulanır.
- stale listing permissionless invalidate edilebilir, sağlıklı listing edilemez.
- marketplace pause list ve buy'ı engeller; cancel/invalidate/claim çalışmaya devam eder.
- explicit cancel, automatic invalidation ve buy doğru ve tek listing lifecycle event'ini üretir.

## 14.2 Fuzz testleri

- Rastgele byte string'lerde validation hiçbir zaman beklenmeyen panic üretmemeli.
- Geçerli label üreticisi ile token ID deterministik olmalı.
- Price sonucu yıl ile lineer olmalı ve label uzunluğundan bağımsız kalmalı.
- Settlement tahsilat/payout accounting'i native ve ERC-20 modlarında aynı liability denklemini korumalı.
- Renewal expiration'ı monoton artırmalı.
- Profile field limit sınırları fuzz edilmeli.
- Listing fiyatı, fee ve seller net geliri fuzz edilmeli.

## 14.3 Invariant testleri

- ACTIVE/GRACE isim iki owner'a ait olamaz.
- Primary mapping owner ile tutarlı kalır.
- Recent ring buffer yalnızca başarılı register'da ilerler ve kapasiteyi aşmaz.
- Settlement bakiyesi, payout/claim/treasury withdrawal dışında başarılı kayıt ve yenilemelerle azalmaz.
- Supported token behavior altında `totalReferralLiability + totalMarketplaceLiability <= settlementBalance()` daima korunur.
- supported-path invariant'ta `isSolvent()` daima true kalır.
- treasury withdrawal referral ve seller bakiyelerini değiştirmez.
- Sağlıklı listing seller'ı token owner ile aynıdır.
- Listing token array/index mapping duplicate içermez ve swap-and-pop sonrası tutarlıdır.
- Successful transfer sonrası token listing'i kalmaz.
- Released re-registration sonrası yeni owner `ownerOf(tokenId)` olur.
- RELEASED token transfer/profile/primary/market işlevlerinde kullanılamaz.

## 14.4 Frontend testleri

### Unit

- name normalization,
- label validation,
- fiyat formatlama,
- expiration status hesaplama,
- explorer URL üretme,
- project config validation,
- configured confirmation-count receipt handling,
- referral URL parse/serialize ve configured expiration,
- integration manifest validation,
- unsupported manifest schema rejection and manifest-origin URL resolution,
- server-side manifest/RPC origin allowlist and avatar private-network rejection,
- exact ABI byte-hash and contract-version mismatch rejection,
- native currency ile settlement metadata'sının ayrı manifest alanlarında doğrulanması,
- testnet fiat reference null ve tarihli production reference validation,
- settlement amount parse/format için 6, 8 ve 18 decimals,
- marketplace sort/filter ve stale-listing exclusion.
- marketplace token-ID dedupe under swap-and-pop pagination changes.
- untrusted profile URL/scheme ve JSON/SVG escaping.
- recent registrations dedupe ve stale-status exclusion.
- forward-confirmed reverse lookup and null-resolution API semantics.
- `available`/`canRegister` and ACTIVE-listing/`purchasable` derivation under pause/insolvency.
- bounded market scanning, cursor serialization and stable API error envelope.
- admin role resolution for owner, pending owner, configured viewer and unauthorized wallet.
- exact percentage-to-BPS, reserved-label batch, admin recipient and metadata URL validation.
- settlement-aware admin event descriptions and lifetime event aggregation.

### Component

- search input suffix davranışı,
- available/taken/reserved/error state,
- duration selector,
- register dialog,
- profile limit mesajları,
- disconnected/wrong-network state,
- protocol-insolvent banner and write gating,
- referral attribution ve clear state,
- claimable reward ve claim state,
- account tabs ve URL state,
- owned-name bounded pagination and transfer-race retry,
- market listing, buy, edit ve cancel dialogları,
- seller proceeds claim state,
- transfer dialog validation ve profile-cleanup warning,
- developer docs code tabs ve copy controls.
- disconnected, wrong-network, unauthorized, viewer and owner admin states.
- admin activity filter/search/load-more ve owner control confirmation dialogları.

### E2E smoke

Local Anvil üzerinde:

E2E suite iki fixture ile çalışır:

```text
Fixture A: NATIVE, 18 decimals
Fixture B: ERC20 MockUSD, 6 decimals
```

1. Ana sayfa açılır.
2. Geçerli isim aranır.
3. Fiyat görünür.
4. Test cüzdanı isim kaydeder.
5. Success ekranı görünür.
6. Name page owner ve expiry gösterir.
7. Profil güncellenir.
8. Account Names tabında görünür.
9. Yenileme expiration'ı artırır.
10. Transfer flow profile/listing/primary cleanup davranışını doğrular.
11. Referral linki açılır ve attribution görünür.
12. Referral ile ikinci cüzdan kayıt yapar.
13. Referrer `/me?tab=referrals` görünümünde ödülü görür ve claim eder.
14. Owner ismi satışa çıkarır ve `/market` içinde görür.
15. İkinci cüzdan ismi satın alır.
16. Listing temizlenir, sahiplik ve resolution alıcıya geçer.
17. Seller `/me?tab=listings` görünümünde geliri görür ve claim eder.
18. ERC-20 fixture'da approval + registration/buy akışları doğrulanır.
19. `/developers`, well-known manifest, OpenAPI, name-state, resolve ve market endpoint'leri doğrulanır.
20. Not-deployed/RPC/rate-limit API hata envelope'ları fixture düzeyinde doğrulanır.
21. `/admin` link visibility, viewer read-only controls, owner enabled controls ve event-log chunking doğrulanır; QA write broadcast etmez.

## 14.5 Zorunlu komutlar

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

Release branch bu komutlardan biri başarısızken hazırlanmış kabul edilmez.

`ChainNameService` deployed bytecode standard EIP-170 limiti 24,576 byte'ın altında ve tercihen en az 1 KiB payla `<= 23,552` byte olmalıdır. `forge build --sizes` limit aşımını CI'da fail eder. Optimizer ayarları ve exact compiler version `foundry.toml` içinde pinlenir; size problemi test/güvenlik kontrolünü kapatarak çözülmez.

---

# 15. Güvenlik kararları

## 15.1 V1 güvenlik yaklaşımı

- Güncel stable Solidity compiler pinlenir.
- OpenZeppelin Contracts 5.x stable kullanılır.
- ERC-20 akışları `SafeERC20` ve exact balance-delta kontrolü kullanır.
- Upgradeable proxy kullanılmaz.
- Custom error kullanılır.
- Exact-payment modeli uygulanır.
- Register, renew, buy, claim ve withdrawTreasury reentrancy guard kullanır.
- Referral claim pull-payment modeli kullanır ve reentrancy guard ile korunur.
- Registration sırasında referrer'a external call yapılmaz.
- Marketplace seller proceeds pull-payment modeli kullanır; buy sırasında seller'a external call yapılmaz.
- Treasury withdrawal, `totalReferralLiability + totalMarketplaceLiability` tutarına dokunamaz.
- Owner transferi iki aşamalıdır.
- `renounceOwnership` override edilerek devre dışı bırakılır; owner tercihen multisig olmalıdır.
- Private key frontend'e girmez.
- Kullanıcı girdisi hem frontend hem kontratta doğrulanır.
- Profile string'leri limitlidir.
- External call yüzeyi; ERC-721 safe mint/transfer receiver callback'i, configured ERC-20 transferFrom/transfer ve native payout recipient'larından oluşur.
- Claim ve treasury payout'larında yükümlülük state'i dış transferden önce azaltılır. Payment collection ekonomik state credit edilmeden önce tamamlanır; external-call içeren ekonomik entry point'ler `nonReentrant` olur ve safe-mint receiver callback'i yalnızca tamamen initialize edilmiş name state'i görür.
- Registration ve marketplace pause birbirinden ayrıdır; cancel ve claim hiçbir pause ile kilitlenmez.

## 15.2 Bilinen V1 trade-off'ları

### Commit-reveal yok

Popüler kısa isimler mempool'da kopyalanabilir. Bu risk, basit UX ve yeni chain odaklı MVP lehine kabul edilir. İleride gerçek front-running gözlenirse opsiyonel V2 modülü eklenir.

### ERC721Enumerable kullanımı

Mint ve transfer gas'ını artırır; ancak V1'de backend/indexer ihtiyacını kaldırır ve `/me` sayfasını doğrudan chain'den sağlar. Hacim büyürse indexer tabanlı V2'ye geçilebilir.

### Profil on-chain

String güncellemeleri gas tüketir. Buna karşılık backend, login ve veritabanı gerekmez. Ucuz yeni chain'ler için bu trade-off kabul edilir. On-chain veri geçmişten tamamen silinemez; UI hassas veri girmeme uyarısı verir ve mevcut alanları temizlemenin geçmişi yok etmediğini açıklar.

### Settlement asset ve fiyat riski

Protocol pricing oracle'ı yoktur. Configured yıllık fiyat settlement asset cinsindendir ve owner tarafından manuel güncellenir. Native coin volatil olabilir; stablecoin ise depeg, blacklist veya issuer riski taşır. UI tarihli `referenceFiat` değerini bağlayıcı fiyat gibi sunmaz. Opsiyonel canlı `marketReference` yalnız display verisidir; testnet veya production fark etmeksizin settlement/guard hesabına katılmaz ve hata vermesi write akışını kapatmaz.

Fee-on-transfer, rebasing veya transfer amount'ını değiştiren tokenlar desteklenmez. ERC-20 settlement tokenı güvenilir, standart ve mümkünse yaygın kullanılan bir contract olmalıdır. Settlement tokenın sonradan değiştirilememesi mevcut referral/seller yükümlülüklerini farklı para birimlerine karıştırmayı engeller.

Issuer clawback, forced burn veya upgrade ile contract balance'ının dışarıdan azaltılması desteklenen davranış değildir ve kullanıcı claim'lerini eksik teminatlı bırakabilir. `isSolvent()` bu durumu görünür kılar ve treasury withdrawal'ı kapatır; kaybolan tokenı protokol kendiliğinden geri oluşturamaz. Production token seçimi bu yetkileri ayrıca incelemelidir.

### ERC-20 approval

İlk işlem iki transaction gerektirebilir. UI exact-amount approval kullanır ve sınırsız allowance'ı varsayılan yapmaz. Permit yalnızca opsiyonel hızlandırmadır; permit desteklemeyen smart-contract wallet'lar için normal approval yolu korunur.

### Referral suistimali

Doğrudan self-referral kontratta engellenir; ancak bir kullanıcının ikinci bir cüzdanla kendisini refer etmesini tamamen önlemek permissionless bir sistemde mümkün değildir. V1 kimlik doğrulama veya backend fraud engine eklemez. Reward oranı bu risk göz önünde bulundurularak düşük ve owner tarafından sınır içinde ayarlanabilir tutulur.

### On-chain marketplace enumeration

Aktif listing dizisi list/update/cancel/transfer işlemlerine ek gas maliyeti getirir; buna karşılık V1 `/market` sayfası için indexer ihtiyacını kaldırır. Zamanla GRACE durumuna geçen listing'ler permissionless invalidation ve read-time doğrulama ile temizlenir. Hacim büyürse event-indexed marketplace V2 olarak değerlendirilebilir.

### Fixed-price satış modeli

V1 yalnızca deployment'ın tek settlement asset'i ile exact-price satış destekler. Off-chain signed order, bid, auction, royalty, çoklu payment token ve kısmi ödeme yoktur. Bu sınırlama approval ve settlement saldırı yüzeyini küçük tutar.

## 15.3 Production notu

Akıllı kontratlar için “kusursuz” garantisi verilmemelidir. Mainnet ve anlamlı para değeri öncesinde:

- bağımsız code review,
- kapsamlı fuzz/invariant test,
- testnet kullanım dönemi,
- mümkünse dış güvenlik denetimi

yapılmalıdır.

---

# 16. Yeni chain'e deployment

## 16.1 İlk test profili

```text
Network name: Base Sepolia
Chain ID: 84532
Required confirmations: 1
RPC: https://sepolia.base.org
Native currency: ETH
Native decimals: 18
Explorer: https://sepolia-explorer.base.org
Settlement kind: NATIVE
Settlement token: address(0)
Settlement symbol/decimals: ETH / 18
Standard annual price (4-32 chars): 0.0005 ETH = 500000000000000 base units
Short-name multipliers (1/2/3 chars): 100x / 25x / 5x
Base Blue: #0000ff
```

Public Base RPC rate-limited olabilir; local geliştirme ve smoke test için uygundur, yayınlanan test sitesi için mümkünse özel RPC provider kullanılır. Deployment cüzdanı ve test kullanıcıları faucet üzerinden Base Sepolia ETH ile fonlanır. Test ETH'sine gerçek USD değeri atfedilmez.

## 16.2 Ön koşullar

- EVM uyumlu RPC.
- Chain ID.
- Native gas tokeni.
- Explorer URL'si.
- Settlement kind (`NATIVE` veya `ERC20`).
- ERC-20 modunda token address, name, symbol, decimals ve contract verification.
- İnsan-okunabilir yıllık fiyat ve hesaplanmış base-unit karşılığı.
- Deployer cüzdanında gas.
- Owner adresi.
- Treasury adresi.
- Suffix ve marka ayarları.

## 16.3 Chain kontrol script'i

```bash
pnpm chain:check
```

Kontroller:

```text
RPC erişimi
RPC chain ID ile config chain ID eşleşmesi
Son blok okunabiliyor mu?
Gas price okunabiliyor mu?
Deployer balance yeterli mi?
Explorer URL formatı
Explorer verifier enum/API URL/key gereksinimi
Settlement config discriminated-union doğrulaması
ERC20 modunda token bytecode + symbol + decimals doğrulaması
Annual price parseUnits sonucu, `MAX_ANNUAL_PRICE` sınırı ve constructor değeri eşleşmesi
Testnet profilde fiat reference değerinin null olması
Kontrat deployment tahmini
```

Script herhangi bir chain özelliğini varsaymamalıdır. `block.number` veya chain'e özel precompile üzerine protokol mantığı kurulmaz.

## 16.4 Deployment

Önerilen komut:

```bash
pnpm contracts:deploy
```

Wrapper script:

1. Project config'i doğrular.
2. Foundry build ve test çalıştırır.
3. Deploy script'i broadcast eder.
4. Broadcast çıktısından kontrat adresini bulur.
5. `deployments/<chainId>.json` üretir.
6. Chain/testnet/required-confirmations/native currency, collection/suffix/metadata URI, settlement kind/token metadata, grace/fee oranları ve base-unit fiyatını manifest'e yazar.
7. ABI'yi deterministic minified UTF-8 JSON olarak web uygulamasına export eder, exact file-byte SHA-256 hash'ini manifest'e yazar ve contract `VERSION` ile eşleştirir.
8. Explorer verify komutunu çalıştırır veya ayrı komut verir.

## 16.5 Explorer source doğrulaması

Verifier deployment'a göre seçilir; protocol code içinde Blockscout/Etherscan varsayımı yoktur. İlk Base Sepolia profili `EXPLORER_VERIFIER=blockscout` kullanır ve Foundry komutu şu modeli izler:

```bash
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url "$NEXT_PUBLIC_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify \
  --verifier "$EXPLORER_VERIFIER" \
  --verifier-url "$EXPLORER_API_URL"
```

`EXPLORER_API_URL` biçimi verifier'a göre chain-check tarafından doğrulanır; çoğu Blockscout instance'ında `/api/` ile biter. Etherscan/Sourcify için wrapper resmi Foundry argüman modelini kullanır ve gereksiz API key/URL istemez. `none` yalnızca local/private test chain'lerinde kabul edilir; public release source verification olmadan tamamlanmış sayılmaz.

Yukarıdaki raw private-key komutu yalnızca izole/fon-limited testnet deployer örneğidir. Değer shell history'ye yazılmaz veya loglanmaz. Değerli production deployment'ında encrypted Foundry keystore/hardware signer ve multisig owner tercih edilir.

## 16.6 Deployment sonrası kontroller

- Contract source verified.
- Constructor argümanları doğru.
- Owner doğru.
- Treasury doğru.
- Suffix doğru.
- Fiyatlar doğru.
- Native gas currency ile settlement kind/token/name/symbol/decimals ayrı ayrı doğru; base-unit fiyat doğru.
- Testnet profilde fiat reference null; production referansı varsa date/max-age doğrulaması doğru.
- ERC-20 modunda allowance, exact transfer delta ve payout smoke testleri başarılı.
- Referral reward oranı doğru.
- Marketplace fee oranı doğru (`0 bps` başlangıç).
- Metadata base URI doğru.
- Registration açık.
- Marketplace açık.
- Test isim kaydı başarılı.
- Renewal başarılı.
- Profil güncellemesi başarılı.
- Referral attribution ve claim başarılı.
- Listing, buy, seller proceeds ve claim başarılı.
- `/developers`, SDK, ABI, OpenAPI ve well-known manifest aynı deployment'ı gösteriyor.
- Contract `VERSION` ve exact ABI file hash'i manifest ile eşleşiyor.
- Explorer transaction linkleri çalışıyor.

---

# 17. Projeyi klonlama ve yeniden markalama

## 17.1 Klon akışı

```bash
git clone <template-repo> new-chain-names
cd new-chain-names
rm -rf .git
git init
pnpm install
cp .env.example .env.local
pnpm clone:reset
```

`clone:reset`:

- eski deployment manifest'lerini siler,
- eski broadcast/cache dosyalarını siler,
- kontrat adresi bulunuyorsa sıfırlar,
- eski settlement token adresi ve asset metadata'sını yeni config doğrulanana kadar unset duruma getirir,
- eski native currency/testnet flag ve fiat reference değerlerini yeni config doğrulanana kadar unset duruma getirir,
- generated ABI'yi yeniden üretilecek duruma getirir,
- proje slug'ını değiştirmeden önce uyarı verir.

## 17.2 Her klonda değiştirilecekler

1. `apps/web/config/project.config.ts`
2. `.env.local`
3. `apps/web/public/brand/logo.svg`
4. `apps/web/public/brand/mark.svg`
5. `apps/web/public/brand/favicon.svg`
6. Sosyal paylaşım görseli
7. Collection name ve symbol
8. Owner ve treasury
9. Chain ID/name/testnet flag/required confirmations ve native currency name/symbol/decimals
10. Settlement kind, token address, name, symbol ve decimals
11. İnsan-okunabilir fiyat, opsiyonel tarihli fiat referansı ve base-unit doğrulaması
12. Referral/marketplace bps ve grace period
13. Metadata base URL

## 17.3 Değiştirilmemesi gerekenler

- Contract core logic
- Route yapısı
- Transaction state modeli
- Name validation kuralları
- Test yaklaşımı
- ABI export mekanizması
- Deployment manifest şeması
- UI temel layout'u

## 17.4 Arama-değiştirme yasağı

Tüm repository'de eski proje adını global search/replace ile değiştirmek ana yöntem olmamalıdır. Marka ve chain bilgileri merkezi config ve brand asset'lerinden gelmelidir.

---

# 18. V2 historical uygulama aşamaları

IDE AI aşağıdaki sırayı takip etmelidir.

## Faz 0 - Repository iskeleti

Yapılacaklar:

- pnpm workspace.
- Next.js App Router app.
- Foundry project.
- root scripts.
- strict TypeScript.
- ESLint.
- `.env.example`.
- AGENTS.md.
- PROJECT_SPEC.md.
- IMPLEMENTATION_STATUS.md.

Kabul kriteri:

```bash
pnpm install
pnpm lint
pnpm typecheck
forge build
```

çalışır.

## Faz 1 - Kontrat ve unit testler

Yapılacaklar:

- `ChainNameService.sol`.
- Constructor ve state.
- Validation.
- Flat annual pricing.
- Native/ERC-20 settlement helpers ve exact accounting.
- Register.
- Renew.
- Profile.
- Resolution.
- Primary name.
- Admin functions.
- Referral attribution, balances ve claim.
- Fixed-price marketplace, listing enumeration, buy ve seller claim.
- Metadata URI.
- Events ve custom errors.
- Unit testler.

Kabul kriteri:

```bash
forge fmt --check
forge build
forge build --sizes
forge test -vvv
```

başarılı.

## Faz 2 - Fuzz ve invariant testleri

Yapılacaklar:

- Fuzz label validation.
- Fuzz price/duration.
- Expiration monotonicity.
- Ownership/primary invariants.
- Re-registration testleri.
- Referral liability ve treasury invariants.
- Marketplace listing ve seller liability invariants.
- Native ve 6-decimal ERC-20 fixture testleri.

Kabul kriteri: Testler deterministik ve yeşil.

## Faz 3 - Deployment ve ABI export

Yapılacaklar:

- `Deploy.s.sol`.
- `Admin.s.sol`.
- `chain-check.ts`.
- `generate-manifest.ts`.
- `export-abi.ts`.
- SDK contract metadata export.
- Settlement metadata ve base-unit manifest export.
- Well-known manifest ve OpenAPI metadata üretimi.
- Blockscout/Etherscan/Sourcify verifier seçenekleri.

Kabul kriteri: Local Anvil deploy olur ve web uygulaması manifest ile adresi okur.

## Faz 4 - Tasarım sistemi ve statik ekranlar

Yapılacaklar:

- Design tokens.
- Archivo, IBM Plex Sans ve IBM Plex Mono fontları.
- Modular Typography grid ve type scale.
- Header/footer.
- Home.
- Name page statik state'leri.
- Account names/referrals/listings tab state'leri.
- Market statik state.
- Developers statik state.
- Dialog sistemi.
- Responsive tasarım.

Bu fazda blockchain entegrasyonu mock data ile olabilir.

Kabul kriteri:

- Mobil ve desktop kırılmaz.
- UI kurallarına aykırı gradient/glass/dashboard görünümü yoktur.
- Beş public ana route ve gated `/admin` route'u tamamdır.
- Ekran generic landing page veya vibecoding çıktısı gibi görünmez.

## Faz 5 - Wallet ve contract read entegrasyonu

Yapılacaklar:

- Viem custom chain.
- Wagmi config.
- Injected connector.
- Opsiyonel WalletConnect.
- Network guard.
- Availability.
- Quote.
- Recent names.
- Name profile reads.
- Owned names enumeration.
- Referral balance read.
- Marketplace listings ve seller proceeds read.
- Admin health/statistics reads ve chunked contract event activity.
- ERC-20 balance/allowance ve settlement metadata read.

Kabul kriteri: Local Anvil ve deploy edilmiş testnet kontratıyla reads çalışır.

## Faz 6 - Write akışları

Yapılacaklar:

- Register.
- Renew.
- ERC-20 exact approval flow.
- Update profile.
- Set/clear primary.
- Safe transfer UI.
- Referral attribution.
- Referral reward claim.
- List/update/cancel sale.
- Buy listed name.
- Seller proceeds claim.
- Owner admin controls ve pending-owner acceptance.
- Transaction states.
- Receipt sonrası cache invalidation.
- Explorer links.
- Anlaşılır hata metinleri.

Kabul kriteri: Tüm ana kullanıcı akışları wallet üzerinden tamamlanabilir.

## Faz 7 - Metadata, branded image ve integrations

Yapılacaklar:

- Metadata route.
- SVG image route.
- Base URI config.
- ERC-4906 event davranışını doğrulama.
- TypeScript SDK.
- Resolve/reverse HTTP route'ları.
- Market HTTP route'u.
- `/developers` canlı dokümanı.
- OpenAPI, ABI, `llms.txt` ve well-known manifest.

Kabul kriteri: Token URI geçerli JSON döndürür, görsel açılır ve bağımsız bir örnek uygulama SDK veya HTTP API ile isim çözümleyebilir.

## Faz 8 - Frontend testleri ve QA

Yapılacaklar:

- Unit/component tests.
- Local E2E smoke.
- Accessibility kontrolleri.
- Loading/error states.
- Referral E2E.
- Marketplace E2E.
- Native ve ERC-20 settlement E2E.
- Developer docs ve integration contract testleri.
- Build test.

Kabul kriteri:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

başarılı.

## Faz 9 - Klonlama araçları ve dokümantasyon

Yapılacaklar:

- `clone:reset`.
- README quick start.
- DEPLOYMENT.md.
- CLONE_CHECKLIST.md.
- Proje konfigürasyon kontrolü.

Kabul kriteri: Temiz bir klasörde dokümanı takip ederek ikinci bir chain konfigürasyonu hazırlanabilir.

## Faz 10 - Testnet release

Yapılacaklar:

- Seçilen chain testnet'e deployment.
- Explorer verification.
- Site deployment.
- Gerçek wallet smoke test.
- Release checklist.

---

# 19. V2 historical Definition of Done

Proje ancak aşağıdaki koşulların tümü sağlandığında V1 tamamlanmış sayılır:

## Contract

- Tüm unit/fuzz/invariant testleri geçiyor.
- Source verified.
- Owner ve treasury doğru.
- Register, renew, profile, primary name çalışıyor.
- Configured standard annual settlement pricing ve 1/2/3 karakter premium schedule çalışıyor.
- Expected amount/referral-BPS/fee/price guards state veya tahsilat öncesinde çalışıyor.
- Solvency guard yeni economic action'ları kapatırken claims/cleanup açık kalıyor.
- Native ve standart ERC-20 settlement fixture'ları geçiyor.
- Referral attribution, liability ve claim çalışıyor.
- Marketplace listing, buy, seller liability ve claim çalışıyor.
- Re-registration grace sonrası çalışıyor.
- Forward-confirmed primary ve permissionless stale-primary cleanup çalışıyor.
- Contract upgradeable değil.

## Frontend

- `/`, `/name/[label]`, `/me`, `/market`, `/developers` tamam.
- `/admin` wallet allowlist gate, overview, activity ve owner controls tamam.
- Search ve availability çalışıyor.
- Reserved name state public registration'ı engeller ve mevcut owner haklarını doğru korur.
- Label uzunluğuna göre configured fiyat katmanı ve 1-5 yıl toplamı doğru.
- Payment ve gas currency ayrı ve doğru etiketleniyor.
- ERC-20 allowance/approval akışı doğru.
- 1-5 yıl kayıt ve yenileme çalışıyor.
- Public profile ve edit çalışıyor.
- Transfer dialog ve profile/listing/primary cleanup çalışıyor.
- Recent names çalışıyor.
- Account Names tab çalışıyor.
- Wrong-network state çalışıyor.
- Referral linki, attribution görünümü ve claim akışı çalışıyor.
- `/me` Names, Referrals ve Listings & Proceeds tablarını birleştiriyor.
- Market listing, filter, list/update/cancel, buy ve proceeds claim çalışıyor.
- SDK, ABI, resolve/reverse API, OpenAPI, `llms.txt` ve well-known manifest çalışıyor.
- API bounded pagination ve stabil error envelope kullanıyor.
- Mobil görünüm kullanılabilir.
- Tasarım config'ten rebrand edilebilir.
- UI `Modular Typography` yönünü uygular ve generic template gibi görünmez.

## Project portability

- Chain ID hardcode dağınık değil.
- Contract address manifest'ten geliyor.
- Collection name/symbol ve metadata base URI config/manifest/contract arasında eşleşiyor.
- Native gas currency ve settlement kind/token/name/symbol/decimals ile base-unit fiyat manifest/config'ten ayrı alanlardan geliyor.
- Transaction confirmation sayısı chain config/manifest'ten geliyor.
- Testnet protocol `referenceFiat` değeri null; opsiyonel UI `marketReference` protocol fiyatından ayrıdır ve production fiat referansı tarihli/süre-sınırlıdır.
- Logo/motto/suffix tek merkezden değişiyor.
- Eski deployment adresleri clone sırasında temizleniyor.
- Eski settlement token address/base-unit fiyatı clone sırasında yanlışlıkla taşınmıyor.
- Yeni chain için ayrıntılı deployment dokümanı var.
- Entegrasyon dokümanı başka bir dApp tarafından takip edilip doğrulanmış.

## Quality

- Lint, typecheck, tests ve build geçiyor.
- Placeholder metin kalmamış.
- Secret commit edilmemiş.
- RPC error ile “name taken” birbirine karışmıyor.
- Common code içinde ETH, 18 decimals, wei, parseEther veya formatEther varsayımı bulunmuyor.
- UI hazır dashboard template'i gibi görünmüyor.
- Admin UI allowlist'i on-chain confidentiality iddiasında bulunmuyor; write authorization canlı owner/pending owner ve contract access control ile yeniden doğrulanıyor.

---

# 20. V2 historical kapsam dışında bırakılan opsiyonlar

Aşağıdaki liste ilk V1/V2 planlama kararının historical kaydıdır. Üstteki bağlayıcı v3 bölümü commit-reveal, offer/auction ve ENS uyumluluğunu artık onaylı v3 hedefi yapar; bu liste onları yeniden yasaklamaz:

- commit-reveal,
- subdomain,
- auction,
- bid/offer sistemi,
- off-chain signed marketplace orders,
- royalties,
- aynı deployment'ta birden fazla settlement asset,
- fee-on-transfer veya rebasing settlement token,
- oracle fiyatlandırması,
- indexer ve PostgreSQL,
- full-text search,
- off-chain profile,
- multi-chain dashboard,
- cross-chain resolution,
- DNS entegrasyonu,
- ENS/SPACE ID/ZNS entegrasyonu,
- account abstraction,
- gas sponsorship,
- upgradeable contract.

Kod ajanı V1 sırasında bu özellikler için placeholder servis, interface veya boş klasör oluşturmamalıdır.

---

# 21. IDE AI çalışma protokolü

IDE AI şu kurallara uymalıdır:

1. Önce bu belgenin tamamını oku.
2. `docs/IMPLEMENTATION_STATUS.md` oluştur.
3. En küçük çalışan fazdan başla.
4. Bir faz bitmeden sonraki faza geçme.
5. Her faz sonunda test ve build komutlarını çalıştır.
6. Başarısız testleri düzeltmeden “tamamlandı” yazma.
7. Kapsam dışı özellik ekleme.
8. Paket sürümlerini mevcut stable sürümlere pinle ve lockfile üret.
9. Private key veya gerçek secret yazma.
10. Chain ve marka değerlerini bileşenlere hardcode etme.
11. UI için Tailwind/shadcn dashboard üretme; CSS Modules ve design token kullan.
12. Kontrat adresi bilinmiyorsa sahte adres yazma; deployment manifest bekle.
13. Her değişiklik grubundan sonra değiştirdiğin dosyaları ve çalıştırdığın kontrolleri status dosyasına yaz.
14. Mimariyi değiştirmek zorunda kalırsan önce `Architecture Deviation` başlığı altında nedeni kaydet.
15. Kod okunabilir, küçük ve test edilebilir olmalı; gereksiz abstraction kullanma.

---

# 22. Kaynaklar ve teknik dayanaklar

Canlı v2 başka name-service protokollerine entegrasyon hedeflemez. Bağlayıcı v3 bölümü ENSIP-15 ve resolver uyumluluğunu yeni major suite hedefi olarak ayrıca tanımlar. Aşağıdaki kaynaklar genel EVM geliştirme standartları, araçları ve ürün karşılaştırmaları için referanstır:

1. Solidity Documentation - güncel released compiler kullanımı ve security considerations
   https://docs.soliditylang.org/en/latest/

2. Foundry Documentation - Solidity testleri, fuzz ve deployment workflow
   https://getfoundry.sh/forge/tests/overview/

3. OpenZeppelin Contracts 5.x - ERC-721 ve access-control bileşenleri
   https://docs.openzeppelin.com/contracts/5.x/api/token/erc721
   https://docs.openzeppelin.com/contracts/5.x/access-control
   https://docs.openzeppelin.com/contracts/5.x/api/token/erc20

4. ERC-721 - Non-Fungible Token Standard
   https://eips.ethereum.org/EIPS/eip-721

5. ERC-4906 - NFT metadata update event standardı
   https://eips.ethereum.org/EIPS/eip-4906

6. ERC-20 - Fungible Token Standard
   https://eips.ethereum.org/EIPS/eip-20

7. EIP-170 - Contract code size limit
   https://eips.ethereum.org/EIPS/eip-170

8. Next.js App Router
   https://nextjs.org/docs/app

9. Wagmi React
   https://wagmi.sh/react/getting-started

10. Viem
   https://viem.sh/docs/getting-started
   https://viem.sh/docs/ethers-migration

11. Blockscout Foundry contract verification
   https://docs.blockscout.com/devs/verification/foundry-verification

12. Base network bilgileri
    https://docs.base.org/base-chain/quickstart/connecting-to-base

13. Base renk ve marka sistemi
    https://brand.base.org/color

14. TempoID - kısa arama akışı ve geliştirici dokümantasyonu ürün referansı
    https://tempoid.xyz/

15. Hood - chain'e özel domain kimliği ve agent/payment entegrasyonu ürün referansı
    https://www.hood.ag/docs

---

# 23. V2 historical son karar özeti

```text
Proje tipi:        Bağımsız, tek-chain name dApp
İlk network:       Base Sepolia (84532)
Her klon:          Ayrı repository, ayrı site, ayrı kontrat
Kontrat sayısı:    V1'de tek kontrat
Token modeli:      ERC-721 Enumerable
Sayfa sayısı:      5 public ana route + 1 gated admin route
Backend:           Yalnızca stateless read/metadata route'ları
Veritabanı:        Yok
Indexer:           Yok
Settlement:        Deployment başına NATIVE veya tek standart ERC-20
Fiyatlandırma:     Configured asset/base units, 4-32 taban + 1/2/3 premium
Kayıt süresi:      1-5 yıl
Grace period:      Varsayılan 30 gün
Profil:            On-chain, limitli alanlar
Referral:          On-chain attribution, 1000 bps ilk oran, pull-payment claim
Account:           Names + Referrals + Listings & Proceeds tek `/me` route'u
Marketplace:       Fixed-price settlement asset, %0 başlangıç fee, seller pull-payment
Entegrasyon:       SDK + React adapter + ABI + REST + OpenAPI + well-known + llms.txt
Kimlik display:    Single-block forward-confirmed verification, address fallback
Renewal watch:     Device-local in-app warning + 30/7/1-day ICS alarms
Explorer handoff:  BENS runbook hazir; harici subgraph/microservice deploy edilmez
Tema:              Siyah/beyaz + Base Blue #0000ff
UI:                Modular Typography, minimal, nameplate merkezli
Cross-chain:       Yok
Harici name servis: Yok
Klonlama:          Config + brand assets + yeni deployment
```

Bu dokümanın ana hedefi, ilk projeyi iyi ve güvenli biçimde kurduktan sonra başka bir EVM chain bulunduğunda aynı repository'yi klonlayıp birkaç merkezi ayarı değiştirerek yeni, bağımsız ve görsel olarak güçlü bir name dApp'i tekrar çıkarabilmektir.
