# Arc Testnet Name Service

> Durum: Mimari taslak / uygulama başlamadı  
> Hedef ağ: Yalnız Arc Testnet  
> Hedef chain ID: `5042002`  
> Son güncelleme: 16 Temmuz 2026

Bu belge, mevcut SepBase/Base Sepolia uygulamasından bağımsız kurulacak fresh Arc
Testnet name-service projesinin başlangıç README'sidir. Buradaki hiçbir kontrat,
adres, paket, API, Blockscout/BENS entegrasyonu veya x402 akışı henüz deploy edilmiş,
hosted ya da production-ready kabul edilmez.

Yeni Arc projesi mevcut V2 veya V3 deployment'ının devamı değildir:

- yeni repository,
- yeni suffix ve marka,
- yeni kontrat adresleri,
- yeni deployment manifesti,
- yeni normalization/registration release ID,
- yeni BENS subgraph ve operasyon altyapısı,
- yeni agent, MCP ve x402 discovery yüzeyleri

ile sıfırdan başlar. Base Sepolia isimleri Arc'a taşınmaz ve iki zincir aynı
canonical namespace olarak sunulmaz.

## 1. Bağlayıcı ürün kararları

İlk Arc Testnet sürümü için kararlar:

1. Commit-reveal kullanılmaz.
2. Public, izinsiz ve çıplak bir `register(label)` fonksiyonu açılmaz.
3. Tek işlem kayıt UX'i, kısa ömürlü ve single-use EIP-712
   `RegistrationPermit` ile korunur.
4. Normalization ve permit issuance aynı exact-pinned ENSIP-15 profilini kullanır.
5. Core naming mimarisi ENS'e yakın tutulur; Blockscout BENS uyumu sonradan eklenen
   bir adapter değil, event ve veri modelinin tasarım girdisidir.
6. Core ownership ve resolver state'inin doğruluk kaynağı yalnız Arc kontratlarıdır.
   Graph Node, BENS ve Blockscout yalnız read-model/index katmanıdır.
7. Application-level bütün ekonomik değerler 6-decimal ERC-20 USDC biriminde
   tutulur. Native 18-decimal USDC yalnız gas/native execution katmanı olarak ele
   alınır.
8. `sweepUnexpectedNative` benzeri bir fonksiyon bulunmaz. Arc'ta native USDC ile
   ERC-20 USDC aynı underlying bakiyedir.
9. İlk marketplace yalnız fixed-price listing, satın alma ve pull-payment seller
   proceeds destekler. Offer ve auction ilk release'e dahil değildir.
10. Agent/MCP read ve unsigned-plan yüzeyleri ilk sınıf özelliklerdir. Signed keeper
    ve x402 execution ayrı güven sınırlarıdır.
11. Hosted ArcScan/BENS görünürlüğü, dApp deploy'u ile otomatik oluşmuş sayılmaz.
    Subgraph, BENS ve explorer operator aktivasyonu ayrıca kanıtlanır.
12. Arc Testnet ürünü Arc veya Circle'ın resmî name service'i olduğunu iddia etmez.

## 2. Kapsam dışı

İlk release şunları içermez:

- Base Sepolia → Arc isim migration'ı,
- cross-chain resolution,
- subdomain satışı,
- auction veya bid/offer,
- upgradeable proxy,
- DAO/governance token,
- birden fazla settlement asset,
- fiat değeri garantisi,
- Arc mainnet deployment'ı,
- Arc'ın henüz kullanıma açık olmayan privacy roadmap'ine dayalı kayıt güvenliği,
- BENS veya subgraph verisini ownership source of truth olarak kullanmak.

## 3. Arc Testnet ağı

| Alan | Değer |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| CAIP-2 | `eip155:5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| Native gas currency | USDC, 18-decimal native interface |
| Application USDC | `0x3600000000000000000000000000000000000000`, 6 decimals |
| Multicall3 | Deployment öncesi resmî Arc address manifestinden doğrulanacak |
| Confirmations | Inclusion sonrası deterministic finality; uygulama yine receipt doğrular |

`viem/chains` içindeki `arcTestnet` tanımı kullanılmalıdır. WalletConnect tarafında
Arc Testnet ilk bağlantıda wallet registry'de bulunmayabilir; uygulama kontrollü bir
`wallet_addEthereumChain` akışı sağlamalıdır. Cüzdan bağlı olduğu sürece Disconnect
aksiyonu doğru/yanlış network durumundan bağımsız görünür kalmalıdır.

Kaynaklar:

- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc)
- [Arc network overview](https://docs.arc.io/arc-chain)
- [Arc transaction lifecycle](https://docs.arc.io/integrate/wallets/transaction-lifecycle)

## 4. Native USDC ve ERC-20 USDC: tek bakiye

Arc'ın en önemli uygulama farkı şudur:

```text
Native interface    18 decimals    gas, address.balance, msg.value
ERC-20 interface     6 decimals    balanceOf, approve, transferFrom
Underlying balance   one balance   iki ayrı token değildir
```

Bu nedenle:

- `address.balance + USDC.balanceOf(address)` yapılmaz;
- native ve ERC-20 bakiye iki varlık gibi gösterilmez;
- ERC-20 `balanceOf` altı ondalık altında kalan native dust'ı truncate edebilir;
- bir native transfer kontratın ERC-20 USDC bakiyesini de değiştirir;
- native sweep kullanıcıların ERC-20 settlement bakiyesini taşıyabilir;
- indexer aynı hareket için native system `Transfer` ve ERC-20 `Transfer` event'ini
  iki kez saymamalıdır;
- UI tek bir USDC bakiyesi gösterir, network fee satırını ayrıca `USDC network fee`
  olarak etiketler; ETH veya Gwei göstermez.

Core ekonomik muhasebenin canonical birimi 6-decimal ERC-20 USDC base unit'idir.
Registration price, renewal, referral, market price, proceeds ve liability bu
birimde saklanır. Gas estimate ve wallet native balance read'i 18 decimal olabilir,
fakat ekonomik muhasebeye dönüştürülmeden katılmaz.

İlk sürümde protocol ödeme yolları ERC-20 interface kullanır. Kullanıcı allowance'ı
yetersizse token authorization ve registration ayrı wallet istekleri olabilir;
commit-reveal kaldırılmış olsa da bu gerçek gizlenmez. Tek-transaction EIP-3009 veya
permit yolu ancak Arc USDC davranışı, smart-wallet fallback'i ve replay testleri
ayrıca tamamlanırsa etkinleştirilir.

Kaynaklar:

- [Stablecoin native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)
- [Port a contract to Arc](https://docs.arc.io/arc/tutorials/porting-contracts-to-arc)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)

## 5. Repository ve release izolasyonu

Hedef repository mevcut SepBase repository'sinin içinde ikinci bir uygulama değildir.
Önerilen sibling çalışma alanı:

```text
C:\Projeler\arc-name-service\
```

Mevcut repository'deki bu belge blueprint olarak tutulur; Arc repository'si
oluşturulduğunda root `README.md` ve bağlayıcı `PROJECT_SPEC.md` olarak ayrıştırılır.

Önerilen yapı:

```text
arc-name-service/
├── apps/
│   ├── web/                    # Next.js kullanıcı ve developer UI
│   ├── permit-issuer/          # EIP-712 registration permit service
│   └── x402-keeper/            # Durable paid agent execution boundary
├── contracts/
│   ├── src/
│   │   ├── ArcNameRegistry.sol
│   │   ├── ArcBaseRegistrar.sol
│   │   ├── ArcRegistrarController.sol
│   │   ├── ArcPublicResolver.sol
│   │   ├── ArcReverseRegistrar.sol
│   │   ├── ArcUniversalResolver.sol
│   │   └── ArcNameMarketplace.sol
│   ├── test/
│   └── script/
├── indexer/
│   └── bens-subgraph/          # ENS-compatible Graph Node mappings
├── ops/
│   ├── bens/                   # Version-pinned BENS config/deployment
│   ├── blockscout/             # Self-host/upstream handoff config
│   └── monitoring/
├── packages/
│   ├── config/
│   ├── normalization/
│   ├── sdk/
│   ├── react/
│   └── mcp/
├── deployments/
│   └── 5042002.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DIRECT_REGISTRATION_SECURITY.md
│   ├── BLOCKSCOUT_BENS.md
│   ├── AGENT_X402.md
│   ├── THREAT_MODEL.md
│   └── ACCEPTANCE_MATRIX.md
├── PROJECT_SPEC.md
└── README.md
```

## 6. On-chain topoloji

Fresh Arc suite no-proxy ve source-verified yedi kontrattan oluşur. Bu topoloji eski
Base V3 migration/commit yapısının kopyası değildir.

### 6.1 `ArcNameRegistry`

ENS Registry ile uyumlu minimum yüzey:

```solidity
owner(bytes32 node)
resolver(bytes32 node)
ttl(bytes32 node)
recordExists(bytes32 node)
setOwner(bytes32 node, address owner)
setSubnodeOwner(bytes32 node, bytes32 label, address owner)
setResolver(bytes32 node, address resolver)
setTTL(bytes32 node, uint64 ttl)
```

Minimum event'ler:

```solidity
event Transfer(bytes32 indexed node, address owner);
event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner);
event NewResolver(bytes32 indexed node, address resolver);
event NewTTL(bytes32 indexed node, uint64 ttl);
```

Registry owner/resolver/TTL state'inin tek on-chain source of truth'udur.

### 6.2 `ArcBaseRegistrar`

- ERC-721 name ownership,
- `tokenId == uint256(labelhash(normalizedLabel))`,
- registration expiry ve grace state,
- controller-only mint/renew,
- transfer sırasında registry ownership senkronizasyonu,
- BENS-compatible registration ve renewal event'leri

sağlar.

```solidity
event NameRegistered(uint256 indexed id, address indexed owner, uint256 expires);
event NameRenewed(uint256 indexed id, uint256 expires);
```

### 6.3 `ArcRegistrarController`

- commit/reveal içermez;
- yalnız geçerli `RegistrationPermit` ile direct register eder;
- ENSIP-15 normalized label, labelhash ve namehash parity'sini doğrular;
- exact price, duration, referral BPS, deadline ve nonce guard'larını payment öncesi
  kontrol eder;
- standard 6-decimal ERC-20 USDC exact-delta collection yapar;
- referral liability ve treasury surplus ayrımını korur;
- plaintext normalized label taşıyan BENS-compatible event yayınlar.

```solidity
event NameRegistered(
    string name,
    bytes32 indexed label,
    address indexed owner,
    uint256 baseCost,
    uint256 premium,
    uint256 expires
);

event NameRenewed(
    string name,
    bytes32 indexed label,
    uint256 cost,
    uint256 expires
);
```

İlk release'te `premium` event alanı BENS mapping uyumu için bulunabilir ve `0`
olabilir. Protocol fiyatı event'ten değil controller quote/state'inden doğrulanır.

### 6.4 `ArcPublicResolver`

Minimum resolver yüzeyi:

```solidity
supportsInterface(bytes4)
addr(bytes32)
addr(bytes32,uint256)
text(bytes32,string)
name(bytes32)
contenthash(bytes32)
```

İlk release'te gerçekten desteklenmeyen interface/capability manifestte false olarak
yayımlanır. Resolver en az `AddrChanged`, `AddressChanged`, `NameChanged`,
`TextChanged`, `ContenthashChanged`, `VersionChanged` ve `InterfaceChanged` event
semantiğini BENS mapping'iyle doğrular.

### 6.5 `ArcReverseRegistrar`

Reverse node:

```text
<lowercase-address>.addr.reverse
```

Primary name yalnız forward-confirmed ise effective kabul edilir:

```text
reverse name(account) = alice.<suffix>
forward addr(alice.<suffix>) = account
```

### 6.6 `ArcUniversalResolver`

Registry ve public resolver üzerinden bounded name/address/text/reverse read sağlar.
CCIP-Read veya ENS Universal Resolver'ın tamamı uygulanmıyorsa isim ve capability
iddiası dar tutulur.

### 6.7 `ArcNameMarketplace`

İlk release:

- fixed-price listing,
- exact expected price ve fee guard,
- ACTIVE ownership/lifecycle doğrulaması,
- transferde listing invalidation,
- pull-payment seller proceeds,
- liability/solvency guard,
- pause sırasında cancel ve claim yollarının açık kalması

ile sınırlıdır.

## 7. Commit-reveal yerine `RegistrationPermit`

### 7.1 Neden çıplak direct register kullanmıyoruz?

Arc'ın sub-second finality'si transaction blok içine girdikten sonra geçerlidir.
İşlem inclusion öncesinde public mempool'da gözlenebilir. Kopyalanmış calldata ve daha
yüksek fee ile name sniping riski commit-reveal kaldırılınca kendiliğinden kaybolmaz.
Arc privacy özellikleri bu release için kullanılabilir bir güvenlik sınırı değildir.

Bu yüzden controller aşağıdaki iki durumdan biri olmadan kayıt kabul etmez:

1. wallet-bound direct permit;
2. agent/x402 order-bound keeper permit.

Kaynaklar:

- [ENS registrar ve commit-reveal gerekçesi](https://docs.ens.domains/registry/eth/)
- [Arc execution layer](https://docs.arc.io/arc/concepts/execution-layer)
- [Arc opt-in privacy durumu](https://docs.arc.io/arc/concepts/opt-in-privacy)

### 7.2 Permit şeması

Bağlayıcı alanlar:

```text
RegistrationPermit(
  chainId,
  controller,
  releaseId,
  normalizationProfileHash,
  normalizedLabelHash,
  namehash,
  requester,
  recipient,
  payer,
  authorizedExecutor,
  durationYears,
  resolverDataHash,
  referrer,
  settlementAsset,
  expectedAmount,
  expectedReferralBps,
  permitId,
  nonce,
  issuedAt,
  validAfter,
  validUntil
)
```

Controller:

- chain/controller/release/profile eşleşmesini,
- normalized label bytes → labelhash/namehash eşleşmesini,
- `msg.sender == authorizedExecutor` olmasını,
- payer/recipient/referrer kurallarını,
- permit deadline'ını,
- on-chain `usedPermit[permitId] == false` durumunu,
- current availability/price/fee/solvency state'ini

payment veya state değişiminden önce kontrol eder. Permit başarılı registration ile
tek kez tüketilir. Revert eden işlem permit'i tüketmiş gibi kalamaz.

### 7.3 Durable label lease

Permit issuer label başına atomic compare-and-set lease tutar:

```text
available
  -> leased(wallet, permitId, expiresAt)
  -> submitted(txHash)
  -> confirmed(tokenId)
  -> expired | released
```

Kurallar:

- aynı label için aynı anda yalnız bir aktif permit;
- aynı wallet/request aynı permit'i idempotent olarak tekrar alabilir;
- permit TTL kısa ve bounded;
- expired permit yeni permit issuance öncesi atomik olarak kapatılır;
- wallet challenge/signature veya agent identity proof olmadan permit verilmez;
- raw label URL query, analytics veya genel loglara yazılmaz;
- permit signer raw environment key yerine KMS/HSM/managed signer kullanır;
- double-issue, signer failure ve lease backlog alarm üretir;
- permit alınması registration garantisi olarak gösterilmez; yalnız confirmed receipt
  sahiplik oluşturur.

### 7.4 Kabul edilen trade-off

Bu model commit-reveal kadar trustless değildir. Permit issuer:

- yeni kayıtları sansürleyebilir,
- sıra/lease politikasını etkileyebilir,
- unavailable olduğunda yeni kayıtları fail closed durdurur.

Buna karşılık kullanıcı commit transaction'ı, secret recovery ve reveal bekleme
adımlarını yaşamaz. Bu merkezi reservation authority üründe açıkça belgelenir;
"tam permissionless registration" iddiası kullanılmaz.

## 8. Normalization ve ENS kimliği

Tek canonical pipeline:

```text
raw input
  -> exact-pinned ENSIP-15 normalization
  -> normalized UTF-8 label
  -> labelhash
  -> namehash
  -> tokenId
  -> permit
  -> contract event
  -> subgraph Domain
  -> BENS search
```

UI, SDK, permit issuer, MCP, controller test corpus ve BENS mapping aynı versioned
normalization profile/corpus hash'ini kullanır. Raw input sessizce değiştirilip
imzalanmaz. Contract dev Unicode tablolarını uyguladığını iddia etmez; signed permit
ve bounded byte/code-point kurallarıyla profile bağlanır.

Controller event'indeki `name` ile `labelhash` aynı normalized byte değerinden
üretilmelidir. Bu parity bozulursa subgraph hash formatına düşebilir veya yanlış ismi
gösterebilir.

Kaynak: [ENSIP-15](https://docs.ens.domains/ensip/15/)

## 9. Blockscout ENS/BENS entegrasyonu

BENS bir frontend API eklentisi değildir. Tam veri yolu:

```text
Arc contracts
    │ events
    ▼
Graph Node + PostgreSQL + IPFS
    │ ENS-compatible GraphQL schema
    ▼
BENS microservice
    │ HTTP API
    ▼
Blockscout backend + frontend / hosted explorer
```

Core web ve SDK kritik reads için doğrudan Arc RPC + verified manifest kullanır.
BENS search/discovery için kullanılabilir fakat ownership kararının kaynağı olamaz.

### 9.1 Blockscout gereksinimleri

Blockscout'un resmî entegrasyon akışı:

1. ENS yapısına yakın bir subgraph üretmek.
2. Zorunlu BENS GraphQL schema alanlarını doldurmak.
3. Subgraph'ı Graph Node'a deploy etmek.
4. `blockscout-rs` için protocol config/PR veya kendi Blockscout fork'una config
   eklemek.
5. Blockscout backend'de BENS'i etkinleştirmek.
6. Frontend name-service API host'unu BENS'e bağlamak.

Blockscout v6 veya daha yeni bir sürüm minimum hedeflenir. `latest` image tag'i
production config'inde kullanılmaz; release version ve digest pinlenir.

Kaynaklar:

- [Blockscout BENS integration](https://docs.blockscout.com/setup/microservices/blockscout-ens-bens-name-service-integration)
- [Subgraph writer](https://github.com/blockscout/blockscout-rs/blob/main/blockscout-ens/graph-node/subgraph-writer/README.md)
- [Required GraphQL schema](https://github.com/blockscout/blockscout-rs/blob/main/blockscout-ens/graph-node/subgraphs/ens-subgraph/schema.graphql)
- [BNS example](https://github.com/blockscout/blockscout-rs/tree/main/blockscout-ens/graph-node/subgraphs/bns-subgraph)

### 9.2 Zorunlu subgraph alanları

En az:

```text
Domain.id              = namehash
Domain.name            = full normalized name
Domain.labelName       = normalized label
Domain.labelhash       = keccak256(normalized label)
Domain.owner           = registry owner
Domain.registrant      = registrar NFT owner
Domain.resolvedAddress = resolver address record
Domain.expiryDate
Domain.tokenId
Registration.cost
```

`Domain`, `Registration`, `Account`, `Resolver`, `DomainEvent`,
`RegistrationEvent` ve `ResolverEvent` entity'leri BENS schema beklentisine göre
korunur. Owner ve registrant aynı kavram gibi birleştirilmez.

### 9.3 Human-readable name event'i

Subgraph yalnız labelhash görürse isim:

```text
[91be3f...].<suffix>
```

biçiminde kalabilir. Controller'ın normalized string taşıyan `NameRegistered` ve
`NameRenewed` event'leri mapping tarafından `maybeSaveDomainName()` eşdeğeriyle
kaydedilir. Rainbow table birincil çözüm olarak kullanılmaz.

### 9.4 Grace period parity

Hazır BNS mapping'i 90 günlük grace period varsayabilir. Arc kontratının grace
period'u farklıysa mapping ve test fixture'ı değiştirilmelidir. Explorer expiry,
contract expiry ve web lifecycle aynı değeri göstermeden entegrasyon tamamlanmaz.

### 9.5 Protocol config örneği

Değerler deployment sonrası gerçek adres ve block ile üretilir:

```yaml
network: arc-testnet
registry_address: 0xREGISTRY
registry_start_block: DEPLOYMENT_BLOCK
resolver_address: 0xRESOLVER
resolver_start_block: DEPLOYMENT_BLOCK
controller_address: 0xCONTROLLER
controller_start_block: DEPLOYMENT_BLOCK
base_address: 0xBASE_REGISTRAR
base_start_block: DEPLOYMENT_BLOCK
base_tld: ".<suffix>"
base_tld_hash: "0x..."
```

`start_block: 0` kullanılmaz. Her contract'ın gerçek deployment block'u manifestten
alınır.

### 9.6 BENS service config özeti

```env
BENS__CONFIG=/config/arc.json
BENS__DATABASE__CONNECT__URL=postgresql://...
BENS__DATABASE__RUN_MIGRATIONS=true
BENS__SERVER__HTTP__ADDR=0.0.0.0:8050
BENS__SERVER__HTTP__ENABLED=true
BENS__SUBGRAPHS_READER__REFRESH_CACHE_DISABLED=false
```

```json
{
  "subgraphs_reader": {
    "networks": {
      "5042002": {
        "blockscout": { "url": "https://testnet.arcscan.app" },
        "use_protocols": ["arc-name"],
        "rpc_url": "https://rpc.testnet.arc.network"
      }
    },
    "protocols": {
      "arc-name": {
        "tld_list": ["<suffix>"],
        "network_id": 5042002,
        "subgraph_name": "arc-name-subgraph",
        "address_resolve_technique": "reverse_registry",
        "specific": {
          "type": "ens_like",
          "native_token_contract": "0xBASE_REGISTRAR",
          "registry_contract": "0xREGISTRY"
        }
      }
    }
  }
}
```

Buradaki `native_token_contract`, Arc USDC kontratı değildir; BENS terminolojisinde
name registrar NFT kontratıdır.

Blockscout backend:

```env
MICROSERVICE_BENS_ENABLED=true
MICROSERVICE_BENS_URL=https://<bens-host>
```

Blockscout frontend:

```env
NEXT_PUBLIC_NAME_SERVICE_API_HOST=https://<bens-host>
```

Hosted ArcScan environment'ı bizim kontrolümüzde değildir. Hosted explorer'da isim
görünürlüğü için subgraph/BENS kanıtlarıyla Blockscout/ArcScan operator aktivasyonu
gerekir. Bu onay alınamazsa kendi Blockscout+BENS deployment'ımız kurulur ve resmî
ArcScan için yalnız transaction/contract linkleri kullanılır.

### 9.7 BENS acceptance

- Subgraph `synced` ve fatal error'suz.
- Kayıtlı isimler hash placeholder olarak görünmüyor.
- Owner/registrant/expiry/cost doğru.
- Renew ve ERC-721 transfer mapping'i doğru.
- Resolver/text/reverse event'leri doğru.
- Reverse result forward-confirmed.
- Expired isim primary gösterilmiyor.
- BENS health, domain, address ve lookup endpoint'leri çalışıyor.
- Blockscout search name → address ve address → name gösteriyor.
- Contract ve BENS sonucu aynı pinned block fixture'ında karşılaştırılıyor.

## 10. Agent, MCP ve x402

### 10.1 Agent kimliği

Arc Testnet'teki ERC-8004 identity/reputation/validation altyapısı opsiyonel agent
identity katmanı olarak kullanılabilir. Name ownership bunun yerine geçmez:

```text
Agent ERC-8004 identity
    +
Arc human-readable name
    +
forward-confirmed resolver address
    =
verified agent display identity
```

Kaynaklar:

- [Register an AI agent](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent)
- [Agentic economy](https://docs.arc.io/build/agentic-economy)

### 10.2 MCP sınırı

Name-service MCP:

- public name/owner/resolver/market reads,
- manifest ve release discovery,
- unsigned registration/renew/profile/market transaction plan,
- permit request payload hazırlama

sağlar. Private key tutmaz, imzalamaz ve transaction broadcast etmez.

Arc'ın doküman MCP'si ayrı bir servistir; name-service MCP'mizin yerine geçmez.

### 10.3 Circle Gateway x402

Arc Testnet Circle Gateway Nanopayments tarafından desteklenir. Hedef profil:

```text
chain: arcTestnet
network: eip155:5042002
asset: 0x3600000000000000000000000000000000000000
scheme: exact
SDK: @circle-fin/x402-batching
```

Kaynaklar:

- [Gateway supported blockchains](https://developers.circle.com/gateway/references/supported-blockchains)
- [x402 nanopayment seller quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)

x402 payment ve on-chain registration atomik değildir. Durable workflow:

```text
quoted
  -> permit_issued
  -> payment_authorized
  -> registration_submitted
  -> registration_confirmed
  -> payment_settled
                    \-> refund_pending -> refunded
                    \-> manual_review
```

Her order:

- permit ID,
- normalized labelhash,
- recipient,
- chain/controller/release,
- exact amount,
- payment identifier,
- request fingerprint,
- idempotency key

ile bağlanır. Registration receipt görülmeden isim başarılı gösterilmez. Payment
settlement tek başına registration başarısı değildir. Duplicate request, response
loss, stale permit, already-registered race ve refund E2E kanıtlanmadan paid route
fail closed kalır.

## 11. Kullanıcı deneyimi

### 11.1 Ana route'lar

```text
/                  Search ve son isimler
/name/[label]      Availability, direct registration veya public profile
/me                Names, referrals, listings ve proceeds
/market            Fixed-price active listings
/developers        Contract, SDK, MCP, BENS ve x402 dokümanı
/admin             Gated operations
```

### 11.2 Registration UX

Commit/reveal jargon'u veya iki aşamalı `Review` → `Prepare` butonları bulunmaz.

Akış:

1. Kullanıcı ismi arar.
2. Sayfa normalization ve availability sonucunu gösterir.
3. Büyük nameplate içinde tam isim görünür.
4. Duration, exact USDC price, network fee ve recipient tek özet yüzeyinde görünür.
5. Arka planda wallet-bound permit alınır.
6. Tek primary CTA `Register <name>` olur.
7. Token authorization gerekiyorsa wallet'ın ayrıca approval isteyeceği açıkça yazılır.
8. Registration receipt sonrası success gösterilir.

Permit servisi unavailable ise wallet isteği veya payment başlatılmaz:

```text
Secure registration is temporarily unavailable.
No wallet request or payment was made.
```

Kullanıcıya CAS, attestation hash, network ID veya raw base unit gösterilmez. Bu
bilgiler yalnız `/developers` ve debug/evidence yüzeylerinde bulunur.

### 11.3 Nameplate

Name sayfasının ana objesi büyük full-name plakasıdır:

```text
┌─────────────────────────────────────────────┐
│ ARC TESTNET                                 │
│                                             │
│ alice.<suffix>                              │
│                                             │
│ AVAILABLE                         1 YEAR    │
└─────────────────────────────────────────────┘
```

Status, owner ve expiry nested card'lar yerine aynı nameplate/grid içinde yer alır.

### 11.4 Market

Generic NFT card grid veya iç içe border kullanılmaz. Desktop 12-column, mobil
4-column typographic rows:

```text
NAME                 PRICE        SELLER        EXPIRES
alice.<suffix>       1.00 USDC    0x12…89       JUL 2027
```

Kullanıcıya ABI hash, CAIP-2, raw nonce veya `EIP155:5042002` gösterilmez.

## 12. Arc uyumlu ama bağımsız görsel sistem

Tasarım Arc'ın canlı sitesindeki koyu lacivert, mavi/teal ve kum tonlu finansal
hissinden yararlanır; Arc sitesini veya layout'unu kopyalamaz. Bu değerler resmî Arc
design token'ları olarak sunulmaz, implementation başlangıç paletidir.

```css
--arc-night: #000b24;
--arc-deep: #0b223e;
--arc-blue: #326796;
--arc-teal: #4197a1;
--arc-sand: #e2d0aa;
--arc-paper: #f5ecda;
--arc-ice: #acc6e9;
--arc-white: #ffffff;
--arc-ink: #071018;
--arc-line: rgba(7, 16, 24, 0.22);
```

Kurallar:

- gradient yok; renkler düz section/surface geçişleri olarak kullanılır;
- glassmorphism, glow, 3D orb, bento dashboard ve nested cards yok;
- 12-column modular grid ve 1px separators korunur;
- büyük tipografi gerçek name/status/price verisi taşır;
- ince arc/yarım çember çizgileri yalnız yapısal motif olarak kullanılır;
- display: Space Grotesk;
- body: DM Sans;
- technical: IBM Plex Mono;
- teknik ayrıntı yalnız developer/admin alanında;
- mobilde bilgi sırası değişmeden 4-column düzene iner;
- reduced-motion ve WCAG AA zorunludur.

Önerilen kompozisyon:

```text
Night header/search
Paper availability/nameplate
Sand pricing rail
White activity/market rows
Deep developer footer
```

Arc logosu ürün logosu olarak kullanılmaz. Kullanılırsa yalnız `Built for Arc
Testnet` network badge'i içinde, resmî light/dark asset değiştirilmeden kullanılır.
Circle Brand Kit'e göre Arc logosu dijitalde minimum 50px yüksekliğe ve inner-arch
yüksekliği kadar clearspace'e sahip olmalıdır. Ürün Arc/Circle tarafından onaylanmış
izlenimi vermez.

Kaynaklar:

- [Arc public site](https://www.arc.io/)
- [Circle/Arc brand assets and logo rules](https://www.circle.com/pressroom)
- [Arc terms](https://docs.arc.io/terms)

## 13. Manifest ve discovery

Public manifest en az:

```text
schemaVersion
releaseId
chainId / caip2 / testnet
RPC / explorer / confirmations
native USDC metadata
ERC-20 USDC address and decimals
suffix / normalization profile and corpus hashes
seven contract addresses and deployment blocks
ABI URLs and SHA-256 hashes
permit issuer public key/address and policy version
resolver capabilities
BENS protocol/API/subgraph status
agent manifest / MCP / OpenAPI URLs
x402 availability and facilitator profile
```

alanlarını yayımlar. `BENS: configured` ile `BENS: hosted ArcScan active` ayrı
capability'lerdir. Deployment öncesi adresler null kalır; sahte örnek adres
yayımlanmaz.

## 14. Environment sınırları

Örnek isimler; gerçek secret eklenmez:

```bash
# Browser-safe
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_BENS_API_URL=

# Server-only RPC and deployment
ARC_RPC_URL=
DEPLOYER_KEYSTORE=
OWNER_ADDRESS=
TREASURY_ADDRESS=

# Permit issuer
DATABASE_URL=
REGISTRATION_PERMIT_SIGNER_KMS_ID=
REGISTRATION_PERMIT_TTL_SECONDS=

# x402 keeper
CIRCLE_GATEWAY_URL=https://gateway-api-testnet.circle.com
X402_KEEPER_SIGNER_KMS_ID=
X402_MAX_ORDER_BASE_UNITS=

# BENS / Graph Node
BENS_CONFIG_PATH=
BENS_DATABASE_URL=
GRAPH_NODE_POSTGRES_URL=
GRAPH_NODE_IPFS_URL=
```

Arc için tek-wallet testnet istisnası ayrıca açıkça onaylanıp chain `5042002` ile
guard edilmeden kullanılmaz. Base Sepolia için verilmiş `84532` istisnası Arc'a
taşınmış sayılmaz.

## 15. Test ve kabul kapıları

### 15.1 Contract

- ENS Registry interface/event conformance.
- ERC-721 registrar ownership/expiry/grace.
- Direct registration permit signature, expiry, nonce ve executor binding.
- Copied calldata saldırgan adına registration yapamıyor.
- Double-issued permit invariant ve used-permit replay rejection.
- Wrong chain/controller/release/profile/recipient/payer rejection.
- Expected price/referral guard payment öncesi çalışıyor.
- Native/ERC-20 shared-balance senaryoları live Arc RPC üzerinde test ediliyor.
- Native sweep yolu bulunmuyor.
- Liability, treasury surplus, referral ve seller proceeds solvent kalıyor.
- Blocklisted recipient/payer revert'i state'i bozmayacak şekilde ele alınıyor.
- Resolver, reverse ve forward-confirmation conformance.

### 15.2 Permit issuer

- Atomic per-label lease.
- Concurrent request race.
- Idempotent retry.
- Expiry/release.
- Managed signer failure.
- Backup/restore.
- Double-issue alert.
- Raw label log/analytics leakage test.

### 15.3 BENS

- Subgraph codegen, mapping tests ve build.
- Hash/name/token ID parity.
- Register/renew/transfer/resolver/reverse fixtures.
- Grace/expiry parity.
- Full replay from exact deployment block.
- BENS API health/domain/address/batch endpoints.
- Self-hosted Blockscout veya hosted ArcScan search smoke.

### 15.4 Web/SDK/MCP

- Desktop/mobile wallet add/switch/disconnect.
- MetaMask ve Rabby provider coexistence.
- Availability/RPC/permit errors birbirine karışmıyor.
- Large nameplate ve direct registration UX.
- Approval gerekiyorsa iki wallet isteği doğru gösteriliyor.
- Market rows, fixed buy ve proceeds claim.
- SDK manifest/hash/version enforcement.
- MCP yalnız unsigned plan üretir.

### 15.5 x402

- Facilitator supported-profile discovery.
- Payment/permit/order binding.
- Duplicate, timeout, response-loss ve stale permit.
- Registration failure → refund/reconciliation.
- Receipt → settlement state parity.
- Keeper allowlist, spend limits ve emergency pause.
- Monitoring, alert ve operator runbook.

## 16. Uygulama fazları

```text
Phase 0  Spec, suffix/brand, threat model, exact dependencies
Phase 1  Registry/registrar/controller/resolver/reverse contracts
Phase 2  Permit issuer + durable lease + direct registration E2E
Phase 3  Web, SDK, React, manifest and developer docs
Phase 4  Fixed marketplace and account flows
Phase 5  BENS subgraph, BENS server and Blockscout integration
Phase 6  MCP and ERC-8004 agent identity display
Phase 7  Circle Gateway x402 keeper and reconciliation
Phase 8  Source verification, funded browser E2E, soak and release evidence
```

Bir fazın acceptance evidence'i olmadan sonraki faz “complete” veya “live” olarak
belgelenmez.

## 17. Mevcut SepBase ile ilişki

Mevcut SepBase uygulaması ayrı bir Base Sepolia V2 ürünü olarak geri alınacaktır.
Arc projesi:

- SepBase V2 kontratını import etmez,
- Base V3 deployment adreslerini kullanmaz,
- `.sepbase` isimlerini migration ile claim ettirmez,
- Base x402 CAS/order kayıtlarını paylaşmaz,
- Base manifests veya attestor imzalarını kabul etmez,
- aynı site içinde network toggle ile sunulmaz.

Bu ayrım kullanıcıların aynı suffix'i iki zincirde aynı canonical kimlik sanmasını ve
Arc'ın shared-USDC davranışının Base kontratlarına sızmasını önler.

## 18. Açık ürün kararları

Uygulama başlamadan şu değerler kesinleştirilmelidir:

- marka ve suffix,
- yıllık 6-decimal USDC test fiyatı,
- 1/2/3 karakter premium schedule,
- grace period ve BENS mapping parity,
- permit TTL ve lease fairness politikası,
- immutable veya governance-rotatable permit signer modeli,
- owner/treasury/multisig rolleri,
- self-hosted Blockscout mu hosted ArcScan upstream entegrasyonu mu,
- direct EIP-3009/permit desteğinin ilk release'e girip girmeyeceği,
- x402'nin ilk release'te fail-closed mı yoksa funded beta mı olacağı,
- ERC-8004 agent identity'nin zorunlu mu opsiyonel mi olacağı.

Bu kararlar verilmeden kontrat adresi, fiyat, suffix veya “live” entegrasyon bilgisi
placeholder olarak yayımlanmaz.

