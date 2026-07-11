# Buradan Başla — Chain Name dApp

Bu paket, tek bir EVM chain üzerinde bağımsız bir Web3 isim dApp'i geliştirmek ve daha sonra aynı projeyi başka bir chain için klonlayıp yeniden markalamak amacıyla hazırlanmıştır.

## Dosyalar

- `Chain_Name_DApp_Teknik_Sartname_TR.docx` — ilk paket sürümünün arşiv/okuma kopyası; güncel ve bağlayıcı değildir.
- `PROJECT_SPEC.md` — tek güncel, ayrıntılı ve bağlayıcı ürün/teknik şartname.
- `IDE_AI_MASTER_PROMPT.md` — IDE içindeki AI ajanına ilk mesaj olarak verilecek görev talimatı.
- `AGENTS.md` — repository kökünde kalacak sürekli ajan kuralları.
- `IMPLEMENTATION_CHECKLIST.md` — geliştirme fazlarını takip etmek için kontrol listesi.
- `project.config.example.ts` — chain, suffix, fiyat ve marka ayarlarının örnek merkezi konfigürasyonu.
- `INTEGRATION_GUIDE.md` — başka dApp'lerin resolution, settlement, referral ve marketplace entegrasyonu için geliştirici sözleşmesi.
- `.env.example` — gizli ve açık environment değişkenleri için örnek.

Kod ajanına DOCX arşivi ile güncel Markdown şartnamesini birlikte “eşit kaynak” olarak verme. Çelişkide ve uygulamada yalnızca `PROJECT_SPEC.md` bağlayıcıdır; entegrasyon yüzeyi için onunla sürüm eşlenmiş `INTEGRATION_GUIDE.md` kullanılır.

## IDE AI ile önerilen kullanım sırası

1. Boş bir Git repository oluştur.
2. `PROJECT_SPEC.md`, `INTEGRATION_GUIDE.md`, `AGENTS.md` ve `IMPLEMENTATION_CHECKLIST.md` dosyalarını repository köküne kopyala.
3. `project.config.example.ts` dosyasını referans olarak sakla. AI, gerçek dosyayı spec'e göre `apps/web/config/project.config.ts` konumunda oluşturacaktır.
4. `.env.example` dosyasını repository köküne koy; gerçek secret değerleri yalnızca `.env.local` veya deployment ortamında tut.
5. `IDE_AI_MASTER_PROMPT.md` içindeki ana prompt'u IDE ajanına gönder.
6. Ajanın önce Faz 0'ı tamamlamasını, komutları çalıştırmasını ve `docs/IMPLEMENTATION_STATUS.md` dosyasını güncellemesini bekle.
7. Her faz sonunda test sonuçlarını kontrol et. Başarısız test, lint, typecheck veya build varken sonraki faza geçmesine izin verme.
8. İlk olarak Local Anvil üzerinde tüm akışı bitir. Ardından seçtiğin chain testnet'ine deploy et.
9. Testnet deployment'ından sonra oluşan kontrat adresini `deployments/<chainId>.json` manifest'inden frontend'e aktar; adrese source code içinde elle yer verme.
10. Yeni bir chain projesi için repository'yi klonla, eski deployment dosyalarını temizle, merkezi config/brand asset'lerini değiştir ve kontratı yeniden deploy et.

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

## Temel kararlar

- Her repository yalnızca bir chain ve bir suffix içindir.
- İlk test deployment'ı Base Sepolia'dır (`84532`).
- Her deployment bağımsızdır.
- V1'de tek `ChainNameService.sol` kontratı kullanılır.
- Her deployment native coin veya tek standart ERC-20 settlement asset seçer; gas currency ile payment asset ayrıdır.
- Native currency ve settlement name/symbol/decimals manifestte ayrı alanlardır; UI bunları hardcode etmez.
- Label uzunluğu 1-32'dir; 1/2/3 karakter premium schedule'ı manifestten keşfedilir ve contract `quote` ile doğrulanır.
- Backend, database ve indexer zorunlu değildir.
- Recent names ve Account/Names verileri kontrattan okunur.
- Referral attribution ve ödül bakiyesi on-chain tutulur; ödül kullanıcı tarafından claim edilir.
- Referral ve seller liabilities treasury surplus'ından korunur; solvency bozulursa yeni ekonomik aksiyonlar fail closed olur.
- `/me`, isimler, referral ve satış yönetimini tek hesap görünümünde birleştirir.
- Marketplace configured settlement asset ile sabit fiyatlı satış, on-chain listing enumeration ve seller claim kullanır.
- `/developers`, SDK, OpenAPI ve makine-okunabilir manifest diğer projelerin entegrasyonu için zorunludur.
- `/admin`; live owner/pending owner ve configured viewer allowlist için gated health, event activity, statistics ve owner controls workspace'idir. Viewer erişimi write yetkisi vermez.
- ENS, SPACE ID, ZNS veya başka name-service entegrasyonu yapılmaz.
- UI beyaz/siyah temel palet ve Base Blue `#0000ff` ile, `Modular Typography` yönünde özgün biçimde hazırlanır.
- Subdomain, cross-chain, auction, offer sistemi, DAO, proxy ve account abstraction V1 dışında kalır.

## Ana geliştirme sırası

```text
Faz 0  Repository ve araçlar
Faz 1  Kontrat + unit testler
Faz 2  Fuzz ve invariant testleri
Faz 3  Deployment, manifest, ABI ve explorer verification
Faz 4  Statik UI ve tasarım sistemi
Faz 5  Wallet ve contract read akışları
Faz 6  Register, renew, profile, referral ve marketplace write akışları
Faz 7  NFT metadata, SVG image ve geliştirici entegrasyonları
Faz 8  Frontend testleri, E2E ve erişilebilirlik
Faz 9  Clone/reset araçları ve dokümantasyon
Faz 10 Testnet deployment ve release
```

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
```

Ayrıca local Anvil üzerinde şu akış elle doğrulanmalıdır:

```text
Ana sayfa açılır
→ bir label aranır
→ fiyat görünür
→ isim kaydedilir
→ success state görünür
→ public name/profile sayfası açılır
→ profil güncellenir
→ /me içinde isim görünür
→ primary name ayarlanır
→ isim transferinde profile/listing/primary cleanup doğrulanır
→ referral linkiyle ikinci cüzdan kayıt yapar
→ referral reward claim edilir
→ isim markette listelenir, alınır ve seller proceeds claim edilir
→ süre ileri alınarak renewal ve grace senaryoları denenir
```

Aynı smoke akışı ayrıca 6-decimal mock ERC-20 settlement ile approval adımı dahil çalıştırılmalıdır.
Fiyat, referral oranı, marketplace fee veya ilan değişikliği senaryolarında bütün expected-value guard'larının state/tahsilat öncesinde revert ettiği ayrıca doğrulanmalıdır.
