# Chain Name DApp - Entegrasyon Rehberi

Bu belge insan-okunabilir entegrasyon rehberidir. Makine sözleşmesinin doğruluk kaynakları generated deployment/agent manifestleri ile `/api/openapi.json`; bu belge onların yerine geçmez ve release doğrulamasında birlikte kontrol edilir.

**Guide version:** 4.0 target / v2 runtime reference
**Current-v2 deployment manifest schema:** 3
**V3 draft manifest / agent discovery schema:** 4
**Current live contract version:** 2.0.0

> Hosted durum: agent manifest, MCP, x402 quote boundary ve bu rehberdeki yeni alanlar bu branch'te source-ready durumdadır; `https://sepbase.vercel.app` alias'ına henüz deploy edilmemiştir. Canlı entegrasyon, ayrı web deployment ve endpoint smoke tamamlanmadan varsayılmamalıdır.

> V3 durum: Yedi kontrat, per-module ABI'ler, schema-4 address-free draft manifest, V3 SDK/read-API ve ayrı opt-in MCP kaynağı yerelde mevcuttur. Bunlar canlı v2 ABI'sine eklenmemiştir ve V3 deployment kanıtı değildir. Consumer gerçek V3 adresleri, runtime hash'leri ve binding kanıtı yayımlanana kadar V3 write/read sonucunu live saymamalı; current-v2 için aşağıdaki schema-3 deployment yüzeylerini kullanmalıdır. Public npm release ve paid x402 execution da hâlâ yoktur.

## Sürüm seçimi

| İhtiyaç | Bugün kullanılabilir yol | V3 source / release target |
|---|---|---|
| ASCII resolve/profile | V2 SDK/HTTP/direct contract | ENSIP-10 public resolver + separate bounded ENSIP-23 simple resolve/reverse helper |
| Registration | V2 direct guarded `register` | Normalize + commit + reveal |
| Marketplace | V2 fixed listing/buy | Fixed + offer + English auction |
| Referral/proceeds | V2 pull claims | Unified referral/seller/refund claims |
| MCP | Current-v2 `/api/mcp`; workspace source, hosted rollout pending | Opt-in `/api/v3/mcp` source with 38 bounded read/unsigned-plan tools; deployment-dependent calls fail closed while draft, npm/hosted release pending |
| x402 | Free quote; paid POST always `503` | Official V2 paid durable workflow after activation gates |

Do not point a v3-shaped client at the v2 contract. V3 discovery must advertise a new schema/contract-suite version and explicit compatibility matrix.

V3 has seven on-chain addresses: six authority/state contracts for registry, controller, public resolver, Universal Resolver helper, marketplace and migration, plus bounded read-only MarketLens. Universal Resolver is not the public resolver and is not a full official ENS Universal Resolver equivalent; MarketLens is not authority or an indexer. Capability discovery must publish both helper bindings and exactly which resolver/lens reads and cursor bounds are supported.

Full ENSIP-15 transformation remains in the exact-pinned client/attestation service. The controller enforces bounded label checks plus an immutable EIP-712 attestor statement over profile hash, chain, controller, normalized label hash, recipient and expiry. Direct contract callers cannot self-assert canonicality, and the registration commitment binds the exact attestation hash.

## Mevcut durum

İlk hedef ağ Base Sepolia'dır.

| Alan | Değer |
|---|---|
| Network | Base Sepolia |
| Chain ID | `84532` |
| Required confirmations | `1` |
| Native currency | ETH, 18 decimals |
| Settlement kind | `native` |
| Settlement asset | ETH, 18 decimals |
| Public RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia-explorer.base.org` |
| Standart yıllık fiyat (4-32 karakter) | `0.0005 ETH` |
| Kısa isim çarpanları (1/2/3 karakter) | `100x / 25x / 5x` |
| Marketplace fee | `0 bps` (`%0`) |
| Contract | `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945` |
| Deployment block | `44011800` |

Public RPC rate-limited olabilir. Production entegrasyonları kendi authenticated RPC provider'ını kullanmalıdır.

## Entegrasyon yöntemleri

Başka bir dApp ihtiyacına göre şu yüzeylerden birini seçebilir:

1. TypeScript SDK: React, Next.js ve Node.js projeleri için önerilen yol.
2. Direct contract read: Viem, Ethers veya Foundry kullanan Web3 uygulamaları için.
3. Read-only HTTP API: Wallet veya RPC client kurmak istemeyen uygulamalar için.
4. MCP: AI agent'ların public read ve unsigned guarded transaction preparation yapması için.

x402 registration quote endpoint'i ücretsiz bir makine sınırıdır. Bu release'teki paid POST uygulanmamıştır ve her zaman fail closed olur; environment configuration bunu aktif hale getiremez.

İsim sahipliği ve çözümleme için doğruluk kaynağı her zaman Base Sepolia üzerindeki doğrulanmış kontrattır. HTTP API ve SDK aynı kontratı okuyan kolaylık katmanlarıdır.

## Settlement portability

Her deployment tek settlement asset kullanır:

- `native`: tokenAddress null; ödeme contract call içindeki native `value` ile yapılır.
- `erc20`: tokenAddress configured contract; ödeme allowance + `transferFrom` ile yapılır.

Gas currency ile settlement asset karıştırılmamalıdır. Bir chain'in gas tokenı ETH, BNB, POL veya başka bir coin olabilir; uygulama ödemesi aynı coin veya USDC benzeri standart bir ERC-20 olabilir. Entegrasyonlar symbol/decimals değerlerini asla tahmin etmez ve well-known manifestten okur.

ERC-20 settlement; fee-on-transfer, rebasing veya transfer amount'ını değiştiren tokenları desteklemez. Contract transfer öncesi/sonrası balance delta'sını doğrular. Settlement asset mevcut deployment'ta immutable'dır; farklı token için yeni deployment gerekir.

Entegrasyon kritik write öncesinde `isSolvent()` okur. False durumda register, renew, list/update ve buy göndermez; claim/cancel/invalidate yollarını açık tutar. Bu state sıradan RPC hatası değildir.

## Makine-okunabilir keşif

Her deployment şu endpoint'i yayınlar:

```text
GET /.well-known/chain-name-service.json
```

Aşağıdaki JSON, nullable deployment alanlarını da gösteren pre-deployment şekil örneğidir; mevcut Base Sepolia deployment değerleri için generated well-known artifact kullanılmalıdır:

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
  "suffix": "sepbase",
  "nameRules": {
    "minLength": 1,
    "maxLength": 32,
    "allowedYears": [1, 2, 3, 4, 5]
  },
  "collection": {
    "name": "Sepbase Names",
    "symbol": "SEPBASE"
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

`contract`, `deploymentBlock`, `deployedAt`, `owner` ve `treasury` deployment tamamlanmadan önce `null` kalabilir. Consumer uygulamalar null contract ile write veya contract read başlatmamalıdır. `nativeCurrency` yalnızca gas etiketlemesi, `settlement` ise protocol payment'ları içindir; değerler aynı görünse bile iki alan ayrı işlenir. Write consumer'ı success state'e geçmeden önce en az `requiredConfirmations` kadar confirmation bekler.

Deploy sonrasında `deploymentBlock` decimal string olur; JavaScript number'a çevrilmez. Deployment manifestindeki `deployedAt` alanı varsa UTC ISO-8601 string kullanır.

Pre-build örneğinde `abiSha256` null olabilir; public release'te null olamaz. ABI deterministic minified UTF-8 JSON olarak servis edilir. SDK parse etmeden önce fetched exact byte'ların SHA-256 hash'ini lowercase hex olarak doğrular ve contract `VERSION()` sonucunu `contractVersion` ile karşılaştırır.

Hash `0x` prefix'i olmayan tam 64 lowercase hex karakterdir. Unsupported contract major version veya hash mismatch entegrasyonu fail closed eder.

Manifest generator bütün non-null EVM adreslerini EIP-55 checksum biçiminde yazar. Consumer karşılaştırmadan önce adresleri normalize eder; casing'i kimlik farkı saymaz.

`gitCommit` yalnız release sistemi `SOURCE_COMMIT`, `VERCEL_GIT_COMMIT_SHA` veya `GITHUB_SHA` ile açık bir 40 karakterlik SHA sağlarsa yayınlanır; local/dirty worktree'den otomatik tahmin edilmez ve aksi halde `null` kalır. Bu alan tek başına artifact güven kanıtı değildir.

Slash ile başlayan `abiUrl`, `docsUrl`, `nameApiUrl`, `resolveApiUrl`, `reverseApiUrl`, `marketApiUrl` ve `openApiUrl` değerleri manifestin origin'ine göre resolve edilir; consumer kendi uygulama origin'ine göre birleştirmez. Bilinmeyen `schemaVersion` destekleniyor varsayılmaz ve güvenli hata ile reddedilir.

Well-known manifest, static deployment manifest, ABI, `llms.txt`, OpenAPI ve read-only API yüzeyleri public cross-origin GET kullanımını destekler. Browser consumer'ı ABI'yi kendi bundle'ına kopyalamak zorunda değildir; yine de fetched exact byte hash'ini manifestteki `abiSha256` ile doğrular.

Template URL placeholder'ları yalnızca canonical değerin `encodeURIComponent` sonucu ile değiştirilir; consumer path'i raw user input ile string-concatenate etmez.

`collection`, `suffix`, owner/treasury ve `metadataBaseURI` on-chain değerlerle eşleşir. Owner, treasury, `metadataBaseURI`, `annualPriceBaseUnits`, `referralRewardBps` ve `marketplaceFeeBps` değişebilen contract parametrelerinin yayınlanan snapshot'ıdır. `shortNamePriceMultipliers` immutable deployment tarifesidir; 1/2/3/4-karakter contract quote smoke check'iyle doğrulanır. Consumer kritik bir write öncesinde ekonomik değerleri contract'tan yeniden okur; manifest mismatch durumunda write'ı fail closed eder.

`referenceFiat` yalnızca tarihli, yaklaşık display metadata'sıdır. `null` veya stale ise fiat satırı gösterilmez; ödeme, approval ve slippage guard hesaplarında hiçbir zaman kullanılmaz. Base Sepolia test ETH'sine USD değeri atanmaz.

## TypeScript SDK

Monorepo içindeki SDK package adı `@sepbase/sdk`'dir. Package build edilmeye hazırdır ancak henüz public npm registry'ye yayınlanmamıştır. Monorepo consumer'ı `workspace:*` dependency kullanır; aşağıdaki registry komutu ilk public SDK release'inden sonra geçerli olacaktır.

Kurulum:

```bash
# Public package release'inden sonra
pnpm add @sepbase/sdk @sepbase/react
```

Başlatma ve temel kullanım:

```ts
import { createSepbaseClient } from '@sepbase/sdk';

const names = await createSepbaseClient({
  manifestUrl: 'https://names.example/.well-known/chain-name-service.json',
});

const state = await names.getNameState('alice');
const resolved = await names.resolveName('alice');
```

`createSepbaseClient` manifest schema/version/address alanlarını doğrular, ABI byte hash'ini kontrol eder, configured Multicall3 bytecode'unu ve contract `VERSION()` değerini okur ve ancak bundan sonra client döndürür. Production manifest URL'si HTTPS olmalıdır. `rpcUrl` verilmezse manifestteki public endpoint kullanılır; server veya yüksek trafikli consumer kendi provider'ını tercih eder.

Server-side kullanımda `manifestUrl` ve manifestten gelen RPC/ABI origin'leri trusted application config veya explicit allowlist'ten gelir; son kullanıcı request parametresi doğrudan fetch edilmez. Bu, SDK'nın SSRF proxy'sine dönüşmesini engeller.

Minimum public API:

```ts
export type NameLifecycle = 'unregistered' | 'active' | 'grace' | 'released';

export type CreateSepbaseClientOptions = {
  manifestUrl: string | URL;
  rpcUrl?: string;
  fetcher?: typeof fetch;
  allowedManifestOrigins?: readonly string[];
  allowedRpcOrigins?: readonly string[];
};

export declare function createSepbaseClient(
  options: CreateSepbaseClientOptions,
): Promise<SepbaseClient>;

export interface SepbaseClient {
  resolveName(label: string): Promise<`0x${string}` | null>;
  reverseLookup(account: `0x${string}`): Promise<string | null>;
  getNameProfile(label: string, options?: { blockNumber?: bigint }): Promise<NameProfile | null>;
  getNameState(label: string, options?: { blockNumber?: bigint }): Promise<NameState>;
  isNameAvailable(label: string): Promise<boolean>;
  quoteName(label: string, years: 1 | 2 | 3 | 4 | 5): Promise<bigint>;
  createReferralUrl(referrer: `0x${string}`): string;
  getActiveListings(cursor?: bigint, limit?: number): Promise<ActiveMarketPage>;
  getListing(tokenId: bigint, options?: { blockNumber?: bigint }): Promise<ActiveMarketListing | null>;
  getSettlementAsset(): Promise<SettlementMetadata>;
  getNativeCurrency(): { name: string; symbol: string; decimals: number };
  getProtocolHealth(options?: { blockNumber?: bigint }): Promise<ProtocolHealth>;
  verifyAddress(account: `0x${string}`): Promise<VerifiedAddressIdentity>;
  verifyName(label: string, expectedAccount?: `0x${string}`, options?: { blockNumber?: bigint }): Promise<VerifiedNameResolution>;
}
```

SDK:

- ABI ve adresi deployment manifestinden alır.
- Label normalizasyonunda frontend ile aynı kuralları kullanır.
- RPC hatasını `not found` sonucuna dönüştürmez.
- Write fonksiyonlarını zorunlu kılmaz; V1 SDK önce güvenli read entegrasyonuna odaklanır.
- BigInt değerlerini number'a zorlamaz.
- Settlement kind, token address, name, symbol ve decimals değerlerini manifestten alır.
- Gas currency metadata'sını ayrı `nativeCurrency` alanından alır.
- İnsan-okunabilir amount için `parseUnits/formatUnits` kullanır; 18 decimals veya ETH varsaymaz.

Null yalnızca valid input için effective sonuç yok anlamına gelir: `resolveName` unregistered/released/zero-resolution, `getNameProfile` unregistered/released durumda null döner. Invalid input ve RPC/provider hataları typed error olarak kalır. Stored released profile ancak açık raw contract read ile alınır ve aktif kimlik kabul edilmez.

Minimum SDK error sınıfları: `InvalidInputError`, `RpcUnavailableError`, `NotDeployedError`, `ManifestMismatchError`, `UnsupportedSchemaError`.

## Verified identity display

Address yerine isim gosteren consumer `reverseLookup()` sonucunu tek basina render etmez. `verifyAddress()` owner, effective lifecycle, `primaryNameOf`, `fullName`, resolution ve expiry degerlerini ayni block'a pinleyerek kontrol eder. Yalnizca `verified=true` ise primary isim gosterilir; diger butun durumlarda checksummed address fallback'i kullanilir.

```ts
const identity = await names.verifyAddress(account);
const display = identity.verified ? identity.primaryName : identity.account;

const recipient = await names.verifyName('alice', expectedRecipient);
if (!recipient.verified) throw new Error(recipient.reason);
```

React consumer `@sepbase/react` paketindeki `SepbaseProvider`, `useSepbaseIdentity` ve `SepbaseIdentity` export'larini kullanir. Component loading sirasinda isim gostermez, unverified veya error durumunu address fallback'ine indirger ve `data-sepbase-state` ile `loading|verified|unverified|error` state'ini yayinlar.

Address-sensitive bir transaction confirmation acilmadan hemen once dogrulama yeniden yapilir. Daha once render edilmis isim veya cache edilmis API cevabi payment recipient olarak kabul edilmez.

## Blockscout BENS handoff

Blockscout BENS, deployment manifestini veya SEPBASE REST API'sini dogrudan consume etmez. Explorer-native isim arama icin BENS-compatible GraphQL schema uygulayan ayri bir Graph Node subgraph, BENS microservice ve hedef Blockscout instance konfigurasyonu gerekir. Bu altyapi standalone dApp runtime'ina eklenmez.

Public `/integrations/blockscout-bens.md` handoff dosyasi `NameRegistered`, `NameRenewed`, `NameDataUpdated`, `PrimaryNameChanged` ve ERC-721 `Transfer` event mapping'ini; deployment-block replay ve semantic parity release gate'ini tanimlar. Adapter generic "first unexpired name" fallback'i kullanmaz; SEPBASE'in user-selected ve forward-confirmed primary semantigini korur.

## Direct contract read

Entegrasyon yapan dApp aşağıdaki read fonksiyonlarını kullanabilir:

```solidity
resolve(string label) returns (address)
VERSION() returns (string)
primaryNameOf(address account) returns (string)
profileOf(uint256 tokenId) returns (Profile)
name() returns (string)
symbol() returns (string)
suffix() returns (string)
metadataBaseURI() returns (string)
owner() returns (address)
treasury() returns (address)
gracePeriod() returns (uint64)
isAvailable(string label) returns (bool)
isValidLabel(string label) returns (bool)
reservedLabels(bytes32 labelHash) returns (bool)
quote(string label, uint8 durationYears) returns (uint256)
tokenIdFor(string label) returns (uint256)
fullName(uint256 tokenId) returns (string)
expiresAt(uint256 tokenId) returns (uint64)
statusOf(uint256 tokenId) returns (uint8)
resolvedAddress(uint256 tokenId) returns (address)
hasPrimary(address account) returns (bool)
primaryTokenId(address account) returns (uint256)
getRecentRegistrations(uint256 limit) returns (RecentRegistration[])
getListings(uint256 offset, uint256 limit) returns (Listing[], uint256)
listings(uint256 tokenId) returns (uint256, address, uint256, uint64, uint16)
totalSupply() returns (uint256)
tokenOfOwnerByIndex(address owner, uint256 index) returns (uint256)
settlementKind() returns (uint8)
settlementToken() returns (address)
annualPrice() returns (uint256)
settlementBalance() returns (uint256)
totalProtectedLiability() returns (uint256)
treasuryAvailableBalance() returns (uint256)
isSolvent() returns (bool)
registrationsPaused() returns (bool)
marketplacePaused() returns (bool)
referralRewardBps() returns (uint16)
marketplaceFeeBps() returns (uint16)
referralBalance(address account) returns (uint256)
sellerBalance(address account) returns (uint256)
```

Label/duration/query limitleri runtime bytecode boyutunu EIP-170 altında tutmak için public constant getter olarak yayınlanmaz. Manifest `nameRules` ve OpenAPI sınırları consumer sözleşmesidir. Reservation için canonical label önce doğrulanır, ardından `keccak256(bytes(label))` ile `reservedLabels` okunur. 1/2/3 karakter çarpanları ayrıca public getter değildir; manifestten keşfedilir ve `quote("a"|"aa"|"aaa"|"aaaa", 1)` sonuçlarıyla doğrulanır.

ABI şu adreste yayınlanır:

```text
/abi/ChainNameService.json
```

Contract adresi source code'a kopyalanmamalı; dış consumer her zaman well-known manifestten okumalıdır. Repository içindeki `deployments/<chainId>.json` broadcast kaydı release tooling içindir.

## Read-only HTTP API

### Name state

```text
GET /api/name/alice?durationYears=1
```

Valid label her lifecycle durumunda `200` döner:

```json
{
  "data": {
    "label": "alice",
    "fullName": "alice.sepbase",
    "tokenId": "123456789",
    "status": "UNREGISTERED",
    "statusCode": 0,
    "lifecycle": "unregistered",
    "tokenExists": false,
    "reserved": false,
    "available": true,
    "registrationsPaused": false,
    "solvent": true,
    "canRegister": true,
    "nftOwner": null,
    "effectiveOwner": null,
    "resolvedAddress": null,
    "expiresAt": null,
    "profile": null,
    "listing": null,
    "quote": {
      "years": 1,
      "amountBaseUnits": "500000000000000"
    },
    "blockNumber": "12345678"
  },
  "context": {
    "contractVersion": "2.0.0",
    "chainId": 84532,
    "chainName": "Base Sepolia",
    "contract": "0x...",
    "suffix": "sepbase",
    "nameRules": {
      "minLength": 1,
      "maxLength": 32,
      "allowedYears": [1, 2, 3, 4, 5]
    },
    "settlement": {
      "kind": "native",
      "tokenAddress": null,
      "name": "Ether",
      "symbol": "ETH",
      "decimals": 18
    },
    "pricing": {
      "standardAnnualPriceBaseUnits": "500000000000000",
      "shortNamePriceMultipliers": [100, 25, 5],
      "referenceFiat": null
    }
  }
}
```

UNREGISTERED, RESERVED ve RELEASED state'leri `404` yapılmaz. `available` label/lifecycle/reservation sonucudur; `canRegister = available && !registrationsPaused && solvent` olur. RELEASED token varsa eski ERC-721 sahibi `nftOwner` olabilir, fakat `effectiveOwner`, effective resolution ve profile null kalır. `durationYears` yoksa 1 kabul edilir; 1-5 dışı değer `400` döner.

HTTP quote read-only bilgilendirmedir. Write yapan wallet uygulaması transaction hazırlarken contract quote'u yeniden okur, `expectedAmount` olarak geçirir ve simüle eder.

`annualPriceBaseUnits` 4-32 karakter standart yıllık fiyatıdır. Bir karakter için `100x`, iki karakter için `25x`, üç karakter için `5x` uygulanır; manifestteki tuple deployment'a göre değişebilir. Entegrasyon `label.length * annualPrice` gibi bir tahmin yapmaz, `quote(label, years)` kullanır. Production manifestinde güncel `referenceFiat` varsa approximate fiat display exact base-unit tutarın standart yıllık tutara oranından türetilir; bu değer transaction hesabına katılmaz.

### Name resolution

```text
GET /api/resolve/alice
```

Başarılı yanıt:

```json
{
  "data": {
    "label": "alice",
    "fullName": "alice.sepbase",
    "status": "ACTIVE",
    "owner": "0x...",
    "resolvedAddress": "0x...",
    "expiresAt": "1810000000",
    "blockNumber": "12345678",
    "profile": {
      "displayName": "Alice",
      "bio": "",
      "avatar": "",
      "website": "",
      "twitter": "",
      "github": ""
    }
  },
  "context": "<same ApiContext shape as above>"
}
```

### Reverse lookup

```text
GET /api/reverse/0x1234...
```

Yanıt `{ data, context }` envelope'u içinde checksum `address`, nullable `primaryName`, nullable `label`, `forwardConfirmed` ve pinned `blockNumber` döndürür. Sonuç yalnızca token ilgili hesaba aitse, ACTIVE/GRACE ise ve name aynı hesaba resolve oluyorsa geçerlidir. Geçerli fakat primary name'i olmayan adres `200` ve null alanlar döndürür.

### Hata modeli

| HTTP | Anlam |
|---:|---|
| `400` | Geçersiz label veya adres |
| `404` | Effective resolve sonucu veya metadata tokenı yok; name-state ve reverse endpoint'leri valid input için `200` kullanır |
| `503` | Chain RPC okunamadı veya contract henüz deploy edilmedi |

API `Access-Control-Allow-Origin: *` ile public GET kullanımına açılabilir. Kısa cache süresi kullanılmalı; expiration ve ownership verisi uzun süre cache edilmemelidir.

Contract henüz deploy edilmemişse contract-dependent endpoint'ler `503` ve `NOT_DEPLOYED` code'u döndürür; well-known manifest yine `200` ve null contract yayınlar. Hata envelope'u stabildir:

```json
{
  "error": {
    "code": "RPC_UNAVAILABLE",
    "message": "Chain data could not be read."
  },
  "context": "<ApiContext>"
}
```

Ham provider/RPC nesnesi veya secret içeren detail döndürülmez. `400`, `404` ve `503` hata yanıtları shared cache'e alınmaz ve `private, no-store` döner. Hosted edge rate limiting release öncesi ayrıca eklenmelidir; bu source release henüz stabil bir `429`/`Retry-After` uygulama sözleşmesi yayınlamaz.

Mevcut stabil HTTP error code seti: `INVALID_INPUT`, `NOT_FOUND`, `RPC_UNAVAILABLE`, `NOT_DEPLOYED`.

Token ID, block/count, timestamp ve base-unit tutarlar HTTP JSON'da decimal string olarak taşınır. Consumer bunları JavaScript number'a çevirmemeli; SDK `bigint` döndürür.

Bir response içindeki ilişkili contract read'leri aynı block'a pinlenir ve `blockNumber` decimal string olarak yayınlanır. Consumer farklı response'ların aynı chain snapshot'ı olduğunu varsaymaz.

ACTIVE/GRACE bir name bilerek sıfır adrese resolve edilmişse name kaydı vardır; endpoint `200` döner ve `resolvedAddress` alanını `null` verir. Tam sözleşme:

```text
GET /api/openapi.json
```

## Marketplace entegrasyonu

Canlı v2 marketplace deployment'ın tek settlement asset'iyle sabit fiyatlı satış kullanır. İlk Base Sepolia profili native ETH, başka bir deployment standart ERC-20/stablecoin olabilir. Başlangıç marketplace ücreti `%0`'dır; v2'de auction, bid veya off-chain order bulunmaz. Offer ve English-auction lifecycle'ları yalnız pending v3 hedefidir; v3 acceptance kanıtı olmadan bu v2 endpoint'lerinden türetilemez.

```text
GET /api/market?cursor=0&limit=24
```

Her listing en az `tokenId`, `label`, `fullName`, `seller`, `priceBaseUnits`, `feeBps`, `listedAt`, `expiresAt` ve `purchasable` alanlarını içerir. Token ID, price, cursor, block ve timestamp alanları decimal string'dir. Endpoint her request'te en fazla 200 raw listing veya dört contract page'i tarar; aynı-block validation ile response-level `marketplacePaused`, `solvent`, `blockNumber`, `nextCursor`, `hasMore` ve `scanned` alanları döndürür. Pause/insolvency sırasında ACTIVE listing kaybolmaz; `purchasable=false` olur. Endpoint stale kayıtlar yüzünden bütün marketi taradığı iddiasında bulunmaz. Entegrasyon yapan istemci satın alma öncesinde listing'i ve token owner'ını yeniden okumalıdır. Fee listing oluşturulduğu veya güncellendiği anda snapshot edilir.

Contract swap-and-pop enumeration kullandığı için cursor snapshot değildir; eşzamanlı list/cancel/buy işlemleri sayfalar arasında tekrar veya atlama oluşturabilir. Consumer token ID ile dedupe eder. Eksiksiz tarihsel/global feed isteyen entegrasyon kendi event indexer'ını kullanmalıdır; v2 API böyle bir garanti vermez.

Write fonksiyonları:

```solidity
listForSale(uint256 tokenId, uint256 price, uint16 expectedFeeBps)
cancelListing(uint256 tokenId)
invalidateListing(uint256 tokenId)
buyListedName(uint256 tokenId, uint256 expectedPrice) payable
claimSaleProceeds(address recipient)
```

Satış geliri doğrudan seller'a gönderilmez; `sellerBalance` içine yazılır ve satıcı tarafından seçilen recipient'a claim edilir. Referral reward marketplace satışına uygulanmaz.

Seller list/update öncesinde güncel `marketplaceFeeBps` değerini okur ve `expectedFeeBps` olarak geçirir. Fee confirm ile execution arasında değişirse listing yazılmadan revert eder.

`marketplacePaused == true` veya `isSolvent() == false` iken list/update/buy gönderilmez. Cancel, permissionless invalidation ve seller proceeds claim açık kalır.

### Write payment akışı

Native settlement:

- `buyListedName` request'i listing tutarını hem `expectedPrice` hem native `value` olarak taşır.

ERC-20 settlement:

1. Consumer ERC-20 `balanceOf` ve `allowance` okur.
2. Allowance yetersizse kullanıcı exact listing tutarı için `approve` transaction'ı gönderir.
3. Approval receipt ve allowance yeniden doğrulanır.
4. `buyListedName(tokenId, expectedPrice)` native value olmadan gönderilir; contract fiyatın değişmediğini doğruladıktan sonra `safeTransferFrom` ile tahsil eder.

Registration ve renewal aynı settlement kurallarını kullanır:

```solidity
register(string label, uint8 durationYears, address recipient, address referrer, uint256 expectedAmount, uint16 expectedReferralRewardBps) payable
renew(uint256 tokenId, uint8 durationYears, uint256 expectedAmount) payable
```

Consumer güncel quote'u `expectedAmount` olarak geçirir; quote değişirse contract ödeme almadan revert eder. Gas ücreti her iki modda da chain native currency'siyle ödenir.

`registrationsPaused` yalnızca register'ı durdurur; renew çalışmaya devam eder. `isSolvent() == false` ise her ikisi de ödeme alınmadan reddedilir.

## Referral entegrasyonu

Referral URL biçimi:

```text
https://<site>/r/0xReferrerAddress
```

Akış:

1. Route geçerli EVM adresini doğrular.
2. Attribution first-party, `SameSite=Lax`, configured süreli (ilk profil 30 gün), versioned ve chain/contract-scope edilmiş cookie'de saklanır; production'da `Secure` kullanılır.
3. Registration dialogu referrer'ı kullanıcıya gösterir.
4. Kullanıcı referral bilgisini kaldırabilir.
5. Güncel quote ve gösterilen reward BPS ile `register(label, durationYears, recipient, referrer, expectedAmount, expectedReferralRewardBps)` çağrısı yapılır; referrer yoksa son argüman `0` olur.
6. Kontrat kayıt ücretinin configured `referralRewardBps` kısmını referrer bakiyesine yazar; ilk profil oranı `%10`'dur. Floor-rounded reward sıfırsa liability artmaz ama attribution event'i yine yayınlanır.
7. Referrer `/me?tab=referrals` görünümünden `claimReferralRewards(recipient)` çağırır.

Kurallar:

- Sıfır adres referral yok anlamına gelir.
- Payer veya recipient kendisini doğrudan refer edemez.
- Geçerli referrer varsa reward BPS confirm ile execution arasında değişirse registration ödeme alınmadan revert eder.
- Reward her başarılı `register` için oluşabilir; released name re-registration buna dahildir. Renewal ve marketplace reward üretmez.
- Registration sırasında referrer'a doğrudan asset gönderilmez.
- Treasury referral yükümlülüğüne ayrılmış bakiyeyi çekemez.
- İkinci cüzdanla yapılan dolaylı self-referral permissionless V1'de tamamen önlenemez.

## MCP ve x402 agent sınırı

Agent discovery şu generated artifact üzerinden başlar:

```text
GET /.well-known/chain-name-agent.json
```

Agent discovery schema v4'tür. Current-v2 MCP için `mcp.endpoint=/api/mcp`, ayrı V3 source yüzeyi için `discovery.v3Mcp=/api/v3/mcp` yayınlanır; iki endpoint birbirinin yerine kullanılmaz. Her ikisi MCP `2025-11-25` stateless Streamable HTTP kurallarını uygular. POST client hem `application/json` hem `text/event-stream` kabul ettiğini bildirmeli; browser `Origin` header'ı varsa configured canonical site origin ile tam eşleşmelidir. Origin göndermeyen server/CLI client'ları kabul edilir. Body limiti 64 KiB'dir. Hiçbir MCP yüzeyi key tutmaz, sign veya broadcast yapmaz.

Current-v2 MCP sonuçlarında identity, name info, registration quote ve protocol solvency ile ilişkili read'ler raporlanan tek block'a pinlenir. `/api/mcp` üzerindeki `prepare_registration` yalnız guarded args, calldata ve gerektiğinde native `value` üretir. `/api/v3/mcp` ise opt-in 38 araçlık V3 read/unsigned-plan envanteridir; `owned_names` bounded owner enumeration, `account_balances` referral/marketplace balances ile forward-confirmed primary identity, `prepare_listing_invalidate` stale listing için guarded cleanup planı ve `prepare_marketplace_approval` yalnız bir token ID için marketplace `approve` planı sağlar. Bu approval ayrı bir cüzdan transaction'ıdır; agent imzalamaz/broadcast etmez ve blanket `setApprovalForAll` üretmez. SDK/MCP list, offer-accept ve auction-start planları token-bazlı approval aynı pinned block'ta aktif değilse fail eder; update/buy planları da stale listing state'ini kullanmaz. Registration için yalnız `registration_requirements` sunulur ve commitment secret, attestation signature, wallet credential veya payment payload kabul edilmez. Draft manifestte adresler null iken deployment-dependent çağrılar fail closed olur. Caller her iki sürümde de chain/contract/recipient/amount/referral BPS/settlement değerlerini yeniden doğrular, simulate eder ve açık authority olmadan ekonomik işlem göndermez.

x402 tarafında:

- `GET /api/x402/registration/quote` ücretsiz ve kısa ömürlü canonical quote üretir.
- `POST /api/x402/registration` paid-route availability olarak `fail-closed`'dur ve canlı v2 release'te her zaman `503` döner; implementation milestone `v3-contract-pending`'dir.
- `X402_REGISTRATION_ENABLED=true` dahil hiçbir environment değeri canlı v2'de paid execution'ı etkinleştiremez; v3 paid execution yalnız durable workflow, facilitator, limited keeper ve acceptance kanıtıyla ayrı sürüm olarak açılabilir.
- Official `@x402/core`, `@x402/evm`, `@x402/extensions` `2.18.0` ve `workflow` `4.6.0` exact-pinned source dependency olarak kuruludur; bu, facilitator/store/signer/V3 plan binding veya settlement runtime'ının operational olduğu anlamına gelmez.

Registration scope; chain, network, contract, resource, quote ID, canonical request, expected amount/referral BPS ve expiry'yi bağlar. Payment acceptance scope ayrıca x402 version, scheme, network, asset, amount ve `payTo` eşleşmesini gerektirir. Durable idempotency scope payment identifier, request fingerprint ve quote ID'yi ayrı bağlar. Standard payment payload ile application request fingerprint aynı kavram değildir.

Gas currency, x402 payment ve protocol settlement ayrı muhasebe kavramlarıdır. V3 Base Sepolia target profile `eip155:84532` üzerinde Circle'ın resmi 6-decimal test USDC'sini (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) hem immutable protocol settlement tokenı hem x402 asset olarak kullanır; `payTo` limited keeper olmalıdır. Bu değer deployment manifest/config'inden okunur ve on-chain metadata ile doğrulanır. Gas test ETH ile ayrı ödenir; test USDC/test ETH'ye fiat değeri atanmaz. Canlı v2 native settlement profili değişmez, native conversion veya oracle kuru türetilmez.

Detaylı threat model ve activation checklist için `docs/AGENT_INTEGRATION.md` kullanılır. Bu repository dokümanı hosted public sayfa değildir; public consumer `/developers`, agent manifest ve OpenAPI üzerinden aynı mevcut-release sınırını görür.

## AI ve otomasyon keşfi

Site kökünde `/llms.txt` yayınlanır. Dosya kısa tutulur ve şunlara link verir:

- `/developers`
- well-known manifest
- agent discovery manifest
- MCP endpoint
- x402 quote endpoint
- OpenAPI
- ABI
- Blockscout handoff

`llms.txt` talimat kaynağı değil, doküman indeksidir. Secret, private RPC veya deployment key içermez.

## Sürüm ve tutarlılık

### V3 source contract and draft discovery

Canonical source discovery is `GET /deployment-manifest.v3.json`; OpenAPI `1.6.0` documents the fail-closed `/api/v3/*` routes, including the candidate/live-only normalization-attestation proxy and the account snapshot endpoint. The current artifact is deliberately address-free and has this abbreviated shape:

```json
{
  "schemaVersion": 4,
  "suiteVersion": "3.0.0",
  "releaseStatus": "draft",
  "contracts": {
    "registry": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameRegistryV3.json" },
    "controller": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameControllerV3.json" },
    "resolver": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameResolverV3.json" },
    "universalResolver": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameUniversalResolverV3.json" },
    "marketplace": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameMarketplaceV3.json" },
    "marketLens": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameMarketLensV3.json" },
    "migration": { "address": null, "version": "3.0.0", "abiUrl": "/abi/v3/ChainNameMigrationV3.json" }
  },
  "wiring": {
    "suiteConfigured": false,
    "configureSuiteSelector": "0x3d229c48"
  },
  "normalization": {
    "profileId": "ensip15:@adraffy/ens-normalize@1.11.1:unicode-17.0.0:cldr-47",
    "profileHash": "0xdce87d511a5ad02a3ee50057259547c744098a0da6207c4dcea41f2a7cbea638",
    "fixtureSha256": "d912fe8e376a22b9e67483afc2fa8fac2cc42244ca4993046843d6693d8c7e49",
    "attestor": null,
    "maxAttestationValiditySeconds": "900"
  },
  "marketplace": {
    "maxPageSize": 50,
    "maxPageScan": 100
  },
  "capabilities": {
    "ensip10": true,
    "ensip15": true,
    "ensip23SimpleResolve": true,
    "fixedListings": true,
    "offers": true,
    "englishAuctions": true,
    "contenthash": false,
    "ccipRead": false,
    "smartMulticall": false,
    "paidX402": false
  },
  "x402": {
    "protocolVersion": 2,
    "network": "eip155:84532",
    "paymentAsset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "assetDecimals": 6,
    "paidExecutionAvailable": false
  },
  "endpoints": {
    "mcp": "/api/v3/mcp",
    "normalizationAttestation": "/api/v3/normalization-attestation",
    "accountApi": "/api/v3/account/{address}",
    "marketApi": "/api/v3/market"
  }
}
```

Every module also carries an exact ABI SHA-256 field in the real artifact. Null addresses, null attestor, `suiteConfigured: false` and `releaseStatus: "draft"` prove that this is source/config discovery only. Consumer yedi adresin `VERSION`/ABI/runtime hash parity'sini; registry'nin controller/resolver/migration/marketplace binding'lerini; Universal Resolver→registry ve MarketLens→marketplace→registry binding'lerini ayrı doğrular. `suiteConfigured !== true` veya `releaseStatus !== "live"` iken V3 write başlatılmaz; `paidExecutionAvailable !== true` iken paid execution başlatılmaz. Lens yokluğu yalnız lens-backed discovery'yi kapatır, marketplace state'ini yok saydırmaz.

### V3 normalization attestation flow

1. Consumer raw input'u manifestteki exact profile ve corpus sürümüyle normalize eder; değişen canonical output kullanıcıya gösterilir.
2. Recipient seçildikten sonra attestation service'e yalnız gerekli canonical scope gönderilir.
3. Dönen EIP-712 imzası manifest attestor adresine, current chain/controller'a, registry profile hash'ine, `keccak256(normalizedLabelBytes)` değerine, recipient'a ve bounded `validUntil` değerine karşı local doğrulanır.
4. `validUntil` ile signature hash'inden üretilen exact attestation hash, resolver initialization ve bütün ekonomik guard'larla birlikte commitment'a bağlanır.
5. Reveal sırasında attestation geçerliliği tekrar kontrol edilir. Attestation süresi dolmuş veya değişmişse yeni commitment gerekir; consumer eski commitment'ı sessizce yeniden kullanmaz.

Attestation kullanıcı transaction imzası değildir, name ownership vermez ve tek başına single-use ödeme yetkisi sayılmaz. Attestor private key'i MCP, web, manifest veya consumer'a verilmez. Attestor owner-setter ile rotate edilemez; replacement yeni reviewed controller/suite release'i ve manifest cutover gerektirir.

### V3 resolver address separation

- `suite.resolver`, supported address/multicoin/text/name records ve ENSIP-10 `resolve(bytes,bytes)` için public resolver'dır.
- `suite.universalResolver`, registry discovery ve forward-confirmed EVM reverse içeren bounded ENSIP-23 simple resolve/reverse helper'ıdır.
- Consumer bu iki adresi birbiri yerine kullanmaz. İlk profile contenthash dahil değildir; CCIP-Read veya smart multicall sonucu da beklenmez. Unsupported profile typed integration error'dır.

### V3 MarketLens address and cursor semantics

- `suite.marketLens` bounded read-only helper'dır; marketplace authority, custody, indexer veya historical completeness servisi değildir.
- Listing, per-token offer ve auction sayfaları pinned block'ta aktif kalan kayıtları filtreler. Global/buyer/owner offer sayfaları `includeTerminal` ile `REFUNDED`/`ACCEPTED` state'lerini taşıyabilir; lifecycle/owner/transfer nonce artık eşleşmeyen `ACTIVE` offer `stale=true` döner.
- `limit` 1-50, raw scan üst sınırı 100'dür. `nextCursor` filtrelenen kayıtlar olsa bile ilerleyen raw index'tir. Swap-pop nedeniyle consumer tek block pinler, object ID ile dedupe eder ve write öncesi authoritative state'i yeniden okur.
- Lens adresi, `VERSION`, ABI checksum, immutable marketplace binding ve derived registry binding manifestle eşleşmezse lens read'i fail closed olur; consumer bunu “empty market” diye yorumlamaz.

### V3 account snapshot

`GET /api/v3/account/{address}`; en fazla 78 haneli decimal `nameCursor`/`offerCursor`/opsiyonel `blockNumber`, `limit` (1-50) ve yalnız absent/`true`/`false` biçimindeki `includeTerminal` değerini kabul eder; başka boolean metni `400 INVALID_BOOLEAN` üretir. Yanıt, aynı pinned block üzerinde bounded owned-name sayfasını, referral rewards ile marketplace proceeds/refunds bakiyelerini, forward-confirmed primary identity'yi ve buyer/owner offer sayfalarını birleştirir. RPC/deployment hatası gerçek sıfır bakiye veya boş isim listesi gibi gösterilmez; draft manifestte route `503 V3_NOT_DEPLOYED` ile fail closed kalır. SDK karşılıkları `getOwnedNames` ve `getAccountBalances`, MCP karşılıkları `owned_names` ve `account_balances` araçlarıdır.

V3 SDK source'u normalized name/namehash, manifest/attestation helper'ları, attestation-hash-bound commit/reveal planı, public/Universal resolver ayrımı, resolver text, fixed/offer/auction reads ve write preparation, unified balances/refunds, migration ve receipt reconciliation API'lerini içerir. Adressiz draft manifestten operational client kurulması bilinçli olarak reddedilir. `/api/v3/mcp` aynı V3 read/unsigned-plan katmanını opt-in olarak sunar fakat registration'da secret/signature almaz; hiçbir MCP yüzeyi attestor/private transaction signer veya broadcast yetkisi almaz.

Paid x402 V2; quote/request fingerprint/payment identifier scope'larını ayırır, durable unique constraint ile replay'i durdurur ve commit→wait→reveal akışını crash-safe order state'inde sürdürür. Facilitator verification, keeper submission, receipt confirmation, payment settlement ve refund her biri ayrı kanıt/state'tir. Config varlığı activation değildir.

Marketplace/referral/proceeds kullanıcı adımları, boş/hata state'leri ve mevcut v2 safe-write örneği `docs/USER_MARKETPLACE_GUIDE.md` içindedir. V3 migration `docs/MIGRATION_V2_TO_V3.md`, acceptance rows `docs/V3_ACCEPTANCE_MATRIX.md`, authorized broadcast kanıtı `docs/TRANSACTION_EVIDENCE.md` ile yönetilir.

### Runnable example policy

- Public package release'inden önce registry install komutu çalışır diye sunulmaz; monorepo `workspace:*` kullanır.
- Her copy/paste verified TypeScript/Viem/Wagmi/Cast/curl örneği CI fixture'ından üretilir veya test komutuyla birlikte yayımlanır.
- `publicClient`, `walletClient`, `manifest`, `account`, `tokenId` gibi dış bağlama ihtiyaç duyan parçalar “plan fragment/pseudocode” olarak etiketlenir.
- Simulation transaction değildir; tx hash receipt+confirmation+post-state olmadan success evidence sayılmaz.
- Yetkili test transaction'ları `docs/TRANSACTION_EVIDENCE.md` formatında kaydedilir.

Build ve release kontrolleri şunları doğrular:

- SDK/exported ABI SHA-256 hash'i manifest ile aynı; contract `VERSION` manifest version ile aynı.
- `/developers` contract adresi manifest ile aynı.
- OpenAPI'de canonical configured route'lar ve agent-facing paths yayınlanıyor; route-parity için bu listedeki her snippet'in otomatik generated client testi olduğu iddia edilmez.
- `llms.txt` required canonical artifact linklerini içeriyor.
- Well-known chain ID, suffix ve deployment block doğru.
- Chain ID, chain name, testnet flag, required confirmations ve native currency metadata'sı config/manifest/SDK arasında aynı; owner/treasury, collection/suffix/metadata URI ve settlement kind/token/name/symbol/decimals contract veya token read'leri, manifest ve SDK arasında aynı.
- Base-unit amount örnekleri 6 ve 18 decimals ile test ediliyor.
- 1/2/3/4-karakter quote sonuçları manifestteki premium schedule ile aynı.
- Multicall3 adresinde configured creation block sonrasında runtime bytecode bulunuyor.
- SDK, MCP ve React package testleri yerelde sırasıyla 52/31/4 geçiyor; web toplamı devam eden V3 UI entegrasyonunun final required-gate rerun'ından sonra kaydedilecek ve burada eski bir sayı korunmayacaktır. `pnpm examples:v3:typecheck` workspace SDK/Viem/Wagmi/React/MCP consumer fixture'ını derliyor ve V3 artifact validator yedi modülü doğruluyor. Bu local source kanıtı Cast/runtime davranışı, public npm provenance veya temiz dış-consumer smoke değildir. Placeholder snippet'ler compile fixture sayılmaz ve V3 release kapısını tek başına karşılamaz.
- Hosted deployment sonrası forward/reverse ve agent endpoint smoke ayrıca çalıştırılır; source artifact validation bunun yerine geçmez.

## Referanslar

- Base network bilgileri: https://docs.base.org/base-chain/quickstart/connecting-to-base
- Base renk sistemi: https://brand.base.org/color
- Ürün ve developer-docs referansı: https://tempoid.xyz/
- Chain-specific domain ve docs ürün referansı: https://www.hood.ag/docs
- OpenZeppelin ERC-20 ve SafeERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
- OpenZeppelin ERC-721: https://docs.openzeppelin.com/contracts/5.x/api/token/erc721
- OpenZeppelin access control: https://docs.openzeppelin.com/contracts/5.x/access-control
- ERC-4906 metadata update standardı: https://eips.ethereum.org/EIPS/eip-4906
- Viem amount utilities: https://viem.sh/docs/ethers-migration
