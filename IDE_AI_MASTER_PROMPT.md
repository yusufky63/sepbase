# IDE AI için ana uygulama prompt'u

Aşağıdaki prompt'u IDE içindeki AI ajanına, `PROJECT_SPEC.md` dosyası repository kökünde olacak şekilde ver.

---

Sen bu repository'nin lead full-stack Web3 mühendisisin. Repository kökündeki `PROJECT_SPEC.md` belgesini eksiksiz oku ve oradaki mimariyi değiştirmeden uygula.

## Ana hedef

Tek bir EVM chain ve tek bir suffix için çalışan, bağımsız, klonlanabilir bir Web3 name dApp geliştir:

- public ana route'lar: `/`, `/name/[label]`, `/me`, `/market`, `/developers`,
- canlı owner/pending owner ve configured viewer allowlist için gated `/admin` operations workspace,
- tek ERC-721 Enumerable name-service kontratı,
- isim arama ve müsaitlik,
- deployment config'inden gelen 4-32 karakter standart yıllık settlement fiyatı ve 1/2/3 karakter premium schedule'ı; ilk Base Sepolia profili `0.0005 ETH` ile `100x/25x/5x`,
- 1-5 yıllık kayıt,
- renewal, expiration ve grace period,
- name -> EVM address resolution,
- forward-confirmed wallet -> primary name,
- on-chain public profil,
- son alınan isimler,
- ana sayfada global health Multicall cache'ini paylaşan, polling eklemeyen doğru-semantiğe sahip platform özeti,
- on-chain referral attribution, reward balance ve claim akışı,
- fixed-price settlement-asset marketplace, listing, buy ve seller proceeds claim akışı,
- admin health/statistics, chunked contract event activity ve owner-authorized controls,
- SDK, name-state/resolve/reverse/market read-only API, OpenAPI, `llms.txt` ve well-known entegrasyon manifesti,
- siyah/beyaz + Base Blue `#0000ff`, `Modular Typography` yönünde özgün UI,
- config ve brand asset'leri değiştirerek başka chain için klonlanabilir yapı.

## Değiştirilemez kapsam kuralları

Şunları ekleme:

- ENS, SPACE ID, ZNS veya başka name-service entegrasyonu,
- cross-chain sistem,
- auction,
- teklif/offer sistemi,
- subdomain,
- DAO/token,
- upgradeable proxy,
- backend database,
- indexer,
- microservice,
- Unicode domain,
- commit-reveal,
- account abstraction,
- gas sponsorship,
- Tailwind/shadcn dashboard görünümü,
- generic bento-card landing page ve vibecoding estetiği.

V1'de yalnızca `PROJECT_SPEC.md` içindeki kapsamı uygula.

## Teknoloji

- Node.js LTS
- pnpm workspace
- Next.js App Router + strict TypeScript
- Wagmi + Viem + TanStack Query
- Zod
- CSS Modules ve CSS design tokens
- Lucide React icons
- Foundry stable
- güncel stable Solidity 0.8.x sürümü, tam pinlenmiş
- OpenZeppelin Contracts 5.x stable, tam pinlenmiş
- OpenZeppelin IERC20 + SafeERC20 ile opsiyonel ERC-20 settlement

Kurulum anındaki stable sürümleri seç, exact version olarak lockfile'a yaz. Floating `latest` bırakma.

## Çalışma biçimi

1. `PROJECT_SPEC.md` dosyasını oku.
2. `docs/IMPLEMENTATION_STATUS.md` oluştur.
3. Spec'teki Faz 0'dan başla ve sırasıyla ilerle.
4. Bir fazı tamamlamadan sonraki faza geçme.
5. Her faz sonunda ilgili lint, typecheck, build ve test komutlarını çalıştır.
6. Hata varsa düzelt; başarısız kontrollerle fazı tamamlandı işaretleme.
7. Her faz sonunda `IMPLEMENTATION_STATUS.md` içine:
   - tamamlanan işleri,
   - değişen ana dosyaları,
   - çalıştırılan komutları,
   - test sonuçlarını,
   - kalan işleri
   yaz.
8. Secret, private key veya gerçek API anahtarı yazma.
9. Sahte kontrat adresi üretme. Deployment yapılana kadar address alanını boş veya açıkça `not deployed` tut.
10. Chain ID, suffix, logo, motto, explorer, contract ve settlement değerlerini bileşenlere dağıtma; config ve manifest kaynaklarını kullan.
11. ETH, wei, 18 decimals, token symbol, `parseEther` veya `formatEther` hardcode etme; `parseUnits/formatUnits` ve configured decimals kullan.
12. Gerekmedikçe yeni dependency ekleme.
13. Kodda gereksiz abstraction, factory, adapter veya generic plugin sistemi oluşturma.
14. Browser-visible `NEXT_PUBLIC_RPC_URL` ile server-only `RPC_URL` değerini ayır; secret provider URL'sini manifest, API context veya client bundle'a taşıma.

## İlk uygulama sırası

### Faz 0

- pnpm workspace
- `apps/web` Next.js App Router
- `contracts` Foundry
- root scripts
- strict TS, ESLint
- env example
- AGENTS.md
- status docs

Kontroller:

```bash
pnpm install
pnpm lint
pnpm typecheck
forge build
```

### Faz 1

`contracts/src/ChainNameService.sol` ve unit testleri:

- ERC721Enumerable
- Ownable2Step
- ReentrancyGuard
- ERC4906
- ASCII lowercase label validation
- deterministic token ID
- configured 4-32 character annual base pricing and immutable 1/2/3 character multipliers
- NATIVE ve ERC20 settlement helper'ları
- SafeERC20 exact balance-delta tahsilat/payout
- protected liabilities, solvency health ve insolvency write guard
- register/renew `expectedAmount`, referral register `expectedReferralRewardBps`, list/update `expectedFeeBps` ve buy `expectedPrice` koruması
- register
- renew
- expiry + grace
- re-register after grace
- resolution
- profile
- primary name
- primary name için owner ile resolved address eşitliği
- transfer cleanup
- reserved names
- treasury/withdrawTreasury
- referral attribution, pull-payment reward ve claim
- fixed-price settlement listing, cancel, buy ve seller proceeds claim
- metadata base URI
- contract version + deterministic ABI SHA-256 manifest
- custom errors/events

Kontroller:

```bash
forge fmt --check
forge build
forge build --sizes
forge test -vvv
```

### Sonraki fazlar

`PROJECT_SPEC.md` içindeki Faz 2-Faz 10 sırasını uygula.

## UI için katı kurallar

- Beyaz/siyah temel palet, tek chain accent rengi.
- Base Sepolia profili: chain ID `84532`, native token `ETH`, Base Blue `#0000ff`.
- Base profili native settlement kullanır; template native veya tek standart ERC-20 settlement destekler.
- Gas currency ve settlement metadata'sını config/manifestte ayrı tut; test ETH'sine fiat değeri gösterme.
- Tasarım yönü `Modular Typography`; 12 kolonlu grid ve tipografik modüller.
- Gradient yok.
- Glassmorphism yok.
- 3D blockchain küresi yok.
- Her içeriği karta koyma.
- Sidebar dashboard yok.
- Aşırı radius yok.
- Hazır şablon görünümü yok.
- Vibecoding, bento-card ve generic AI landing page görünümü yok.
- Ana obje “dijital isim plakası”.
- Archivo Variable + IBM Plex Sans + IBM Plex Mono tipografi üçlüsü.
- Mobil görünümü baştan uygula.
- Motion kısa ve işlevsel.
- Focus ve erişilebilirlik durumları görünür.

## Definition of Done

Aşağıdakilerin tümü çalışmadan projeyi tamamlandı sayma:

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

Ayrıca:

- tüm ana route'lar tamam,
- search/availability tamam,
- register/renew tamam,
- public profile/edit tamam,
- recent names tamam,
- Account Names tab tamam,
- metadata ve image route tamam,
- `/me` içindeki referral ve listings/proceeds sekmeleri tamam,
- marketplace listing, cancel, buy ve proceeds claim tamam,
- native ve 6-decimal ERC-20 payment/approval E2E tamam,
- fiyat/referral/fee değişikliğinde expected amount/BPS/fee/price koruması E2E tamam,
- developer docs, SDK, OpenAPI, `llms.txt` ve well-known manifest tamam,
- chain config ve deployment manifest tamam,
- clone/reset dokümantasyonu tamam,
- local Anvil smoke flow tamam.
- hosted release öncesinde `pnpm release:check` final HTTPS origin, server RPC, WalletConnect ve metadata-origin tutarlılığıyla geçer.

Şimdi Faz 0 ile başla. Önce mevcut repository durumunu incele, sonra dosyaları oluştur ve kontrolleri çalıştır. Gereksiz soru sorma; yalnızca uygulanmayı gerçekten engelleyen eksik bir bilgi varsa bunu açıkça bildir.
