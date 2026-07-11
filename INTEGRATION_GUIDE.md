# Chain Name DApp - Entegrasyon Rehberi

Bu belge gelecekte sitedeki `/developers` sayfasının ve yayınlanacak SDK dokümantasyonunun kaynak sözleşmesidir.

**Guide version:** 3.0
**Manifest schema:** 3
**Contract version:** 2.0.0

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

Başka bir dApp üç seviyeden birini seçebilir:

1. TypeScript SDK: React, Next.js ve Node.js projeleri için önerilen yol.
2. Direct contract read: Viem, Ethers veya Foundry kullanan Web3 uygulamaları için.
3. Read-only HTTP API: Wallet veya RPC client kurmak istemeyen uygulamalar için.

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

Beklenen yanıt:

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
  manifestUrl: string;
  rpcUrl?: string;
  allowedManifestOrigins?: readonly string[];
};

export declare function createSepbaseClient(
  options: CreateSepbaseClientOptions,
): Promise<SepbaseClient>;

export interface SepbaseClient {
  resolveName(label: string): Promise<`0x${string}` | null>;
  reverseLookup(account: `0x${string}`): Promise<string | null>;
  getNameProfile(label: string): Promise<NameProfile | null>;
  getNameState(label: string): Promise<NameState>;
  isNameAvailable(label: string): Promise<boolean>;
  quoteName(label: string, years: 1 | 2 | 3 | 4 | 5): Promise<bigint>;
  createReferralUrl(referrer: `0x${string}`): string;
  getActiveListings(cursor?: bigint, limit?: number): Promise<ActiveMarketPage>;
  getListing(tokenId: bigint): Promise<ActiveMarketListing | null>;
  getSettlementAsset(): Promise<SettlementMetadata>;
  getNativeCurrency(): { name: string; symbol: string; decimals: number };
  getProtocolHealth(): Promise<ProtocolHealth>;
  verifyAddress(account: `0x${string}`): Promise<VerifiedAddressIdentity>;
  verifyName(label: string, expectedAccount?: `0x${string}`): Promise<VerifiedNameResolution>;
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
| `429` | Rate limit aşıldı |
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

Ham provider/RPC nesnesi veya secret içeren detail döndürülmez. `400`, `404`, `429` ve `503` hata yanıtları shared cache'e alınmaz ve `private, no-store` döner. `429` yanıtı mümkünse `Retry-After` header'ı taşır.

Minimum stabil error code seti: `INVALID_INPUT`, `NOT_FOUND`, `RATE_LIMITED`, `RPC_UNAVAILABLE`, `NOT_DEPLOYED`.

Token ID, block/count, timestamp ve base-unit tutarlar HTTP JSON'da decimal string olarak taşınır. Consumer bunları JavaScript number'a çevirmemeli; SDK `bigint` döndürür.

Bir response içindeki ilişkili contract read'leri aynı block'a pinlenir ve `blockNumber` decimal string olarak yayınlanır. Consumer farklı response'ların aynı chain snapshot'ı olduğunu varsaymaz.

ACTIVE/GRACE bir name bilerek sıfır adrese resolve edilmişse name kaydı vardır; endpoint `200` döner ve `resolvedAddress` alanını `null` verir. Tam sözleşme:

```text
GET /api/openapi.json
```

## Marketplace entegrasyonu

Marketplace deployment'ın tek settlement asset'iyle sabit fiyatlı satış kullanır. İlk Base Sepolia profili native ETH, başka bir deployment standart ERC-20/stablecoin olabilir. Başlangıç marketplace ücreti `%0`'dır; auction, bid veya off-chain order bulunmaz.

```text
GET /api/market?cursor=0&limit=24
```

Her listing en az `tokenId`, `label`, `fullName`, `seller`, `priceBaseUnits`, `feeBps`, `listedAt`, `expiresAt` ve `purchasable` alanlarını içerir. Token ID, price, cursor, block ve timestamp alanları decimal string'dir. Endpoint her request'te en fazla 200 raw listing veya dört contract page'i tarar; aynı-block validation ile response-level `marketplacePaused`, `solvent`, `blockNumber`, `nextCursor`, `hasMore` ve `scanned` alanları döndürür. Pause/insolvency sırasında ACTIVE listing kaybolmaz; `purchasable=false` olur. Endpoint stale kayıtlar yüzünden bütün marketi taradığı iddiasında bulunmaz. Entegrasyon yapan istemci satın alma öncesinde listing'i ve token owner'ını yeniden okumalıdır. Fee listing oluşturulduğu veya güncellendiği anda snapshot edilir.

Contract swap-and-pop enumeration kullandığı için cursor snapshot değildir; eşzamanlı list/cancel/buy işlemleri sayfalar arasında tekrar veya atlama oluşturabilir. Consumer token ID ile dedupe eder. Eksiksiz tarihsel/global feed isteyen entegrasyon kendi event indexer'ını kullanmalıdır; V1 API böyle bir garanti vermez.

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

## AI ve otomasyon keşfi

Site kökünde `/llms.txt` yayınlanır. Dosya kısa tutulur ve şunlara link verir:

- `/developers`
- `/api/name/{label}` ve `/api/resolve/{label}`
- `/market` ve `/api/market`
- well-known manifest
- OpenAPI
- ABI
- explorer contract page
- GitHub repository

`llms.txt` talimat kaynağı değil, doküman indeksidir. Secret, private RPC veya deployment key içermez.

## Sürüm ve tutarlılık

Build ve release kontrolleri şunları doğrular:

- SDK/exported ABI SHA-256 hash'i manifest ile aynı; contract `VERSION` manifest version ile aynı.
- `/developers` contract adresi manifest ile aynı.
- OpenAPI endpoint'leri gerçek route'larla aynı.
- `llms.txt` kırık link içermiyor.
- Well-known chain ID, suffix ve deployment block doğru.
- Chain ID, chain name, testnet flag, required confirmations ve native currency metadata'sı config/manifest/SDK arasında aynı; owner/treasury, collection/suffix/metadata URI ve settlement kind/token/name/symbol/decimals contract veya token read'leri, manifest ve SDK arasında aynı.
- Base-unit amount örnekleri 6 ve 18 decimals ile test ediliyor.
- 1/2/3/4-karakter quote sonuçları manifestteki premium schedule ile aynı.
- Multicall3 adresinde configured creation block sonrasında runtime bytecode bulunuyor.
- Örnek TypeScript kodu typecheck oluyor.
- Bağımsız fixture uygulaması en az bir forward ve reverse lookup yapabiliyor.

## Referanslar

- Base network bilgileri: https://docs.base.org/base-chain/quickstart/connecting-to-base
- Base renk sistemi: https://brand.base.org/color
- Ürün ve developer-docs referansı: https://tempoid.xyz/
- Chain-specific domain ürünü referansı: https://www.hood.domains/
- OpenZeppelin ERC-20 ve SafeERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
- OpenZeppelin ERC-721: https://docs.openzeppelin.com/contracts/5.x/api/token/erc721
- OpenZeppelin access control: https://docs.openzeppelin.com/contracts/5.x/access-control
- ERC-4906 metadata update standardı: https://eips.ethereum.org/EIPS/eip-4906
- Viem amount utilities: https://viem.sh/docs/ethers-migration
