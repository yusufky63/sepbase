# Production Readiness Report

Tarih: 2026-07-11

## Sonuc

SEPBASE, Base Sepolia test release'i icin hazirdir. V2 kontrati canli, source-verified ve gercek coklu hesap write smoke'undan gecmistir. Web, SDK source, ABI, manifest, OpenAPI ve read-only API ayni deployment'i kullanir.

Deger tasiyan production/mainnet release'i henuz hazir sayilmaz. Bunun nedeni uygulama veya test hatasi degil; final HTTPS origin, metadata URI cutover, authenticated RPC, SDK package release, multisig operasyonu ve bagimsiz audit gibi deployment disi release gate'lerinin tamamlanmamis olmasidir.

## Hazir olanlar

| Alan | Durum | Kanit |
|---|---|---|
| Contract v2 | Hazir | Base Sepolia `0xe000de3efe798Aa4F834fd952Bef35BAE1B16945`, verified source |
| Name lifecycle | Hazir | 1-32 karakter, premium tiers, register/renew/release/grace testleri |
| Referral | Hazir | On-chain attribution, expected BPS guard, pull-payment claim smoke |
| Marketplace | Hazir | Fixed price, expected price/fee guard, list/cancel/buy/seller claim smoke |
| Solvency | Hazir | Native + 6-decimal ERC-20, fee-on-transfer reject, invariant testleri |
| UI | Hazir | Bes route, responsive, transaction completion, account tabs, wallet-in-modal |
| Home platform ozeti | Hazir | `totalSupply` + registration/market/payment state; global Multicall cache'ini paylasir, polling eklemez |
| Fiat display mimarisi | Hazir | Config-driven, dated, stale-safe; testnet profilde bilerek kapali |
| Entegrasyon | Hazir | CORS-enabled manifest/ABI/API, OpenAPI, `llms.txt`, SDK source |
| HTTP/SEO hardening | Hazir | Hata yanitlari `no-store`, public artifact cache/CORS, gercek 404, robots, sitemap ve guvenlik header'lari |
| Release gate | Hazir | `pnpm release:check` final HTTPS, server RPC, WalletConnect ve metadata-origin tutarliligini zorunlu kilar |
| Testnet operasyonu | Hazir | Deployment check ve Base Sepolia multi-account smoke |

## Production oncesi zorunlu

1. **Final HTTPS origin:** `NEXT_PUBLIC_SITE_URL` final domain ile build edilmeli ve tum manifest/API URL'leri hosted release'te tekrar dogrulanmali.
2. **Metadata URI cutover:** Kontrattaki localhost metadata base URI final HTTPS API'ye admin islemiyle alinmali; manifest yeniden uretilmeli ve `pnpm deployment:check` tekrar kosmali.
3. **Authenticated RPC:** Kod server-only `RPC_URL` ile public browser RPC'sini ayirir; hosted ortamda rate limit ve availability SLA'si olan provider degeri halen tanimlanmalidir. Secret provider URL'si `NEXT_PUBLIC_*` icine konmamalidir.
4. **Package release:** `@sepbase/sdk` ve `@sepbase/react` semver, provenance ve changelog ile npm'e yayinlanmali. Bugun iki package da workspace/source olarak hazirdir.
5. **Yetki operasyonu:** Owner ve treasury deger tasiyan release'te multisig adreslerine alinmali; raw deployer key rutin admin araci olarak kullanilmamali.
6. **Bagimsiz audit:** Mainnet veya ekonomik deger oncesi kontrat ve deployment/admin runbook'u bagimsiz guvenlik incelemesinden gecmeli.
7. **Hosted smoke:** Final domain uzerinde wallet connect, register, referral deep link, list/buy/claim, metadata ve cross-origin SDK akisi yeniden kosmali.

Final HTTPS hostname, server-only `RPC_URL`, WalletConnect project ID ve final metadata origin tamamlanana kadar `pnpm release:check` bilerek basarisiz olur.

## Olsa daha iyi olurdu

### P1, release kalitesi

1. **CI release gate:** Her pull request'te zorunlu Foundry/web testleri, contract size diff, ABI/manifest checksum diff ve production build calissin.
2. **Observability:** RPC hata orani, API latency, failed simulation, stale manifest ve solvency read'leri icin privacy-preserving metrik/alert eklenmeli.
3. **Wallet coverage:** WalletConnect project ID eklenip QR/mobile deep-link akislari gercek iOS ve Android cuzdanlariyla test edilmeli.
4. **Admin runbook:** Pause, price update, fee update, metadata URI, treasury withdrawal ve ownership transfer islemleri icin multisig checklist'i ve rollback karari dokumante edilmeli.
5. **Package trust:** SDK release'ine signed tag, npm provenance, generated API reference ve compatibility matrix eklenmeli.

### P2, urun gelisimi

1. **Activity view:** Name bazli register/renew/transfer/list/sale gecmisi eklenebilir. Trafik buyuyene kadar RPC event pagination kullanilmali; indexer ancak olculebilir ihtiyac olursa eklenmeli.
2. **Watchlist:** Kullaniciya ait olmayan adlari tarayici-local favorilere ekleme ve expiry hatirlatma eklenebilir; wallet profiline gizli veri yazilmamali.
3. **Shareable profile:** Name sayfasi icin richer Open Graph metadata ve deterministic sosyal paylasim karti eklenebilir.
4. **Production fiat adapter:** Gercek production profilde tarihli fiat snapshot'ini guvenli release/config sureciyle yenileyen adapter eklenebilir. Fiat degeri hicbir zaman settlement veya guard hesabi olmamali.
5. **Read scale:** Public API talebi RPC limitlerini asarsa event indexer/read replica ayri bir servis olarak eklenebilir; kontrat dogruluk kaynagi olmaya devam etmeli.

## V2'ye eklenmemesi gerekenler

- Contract runtime boyutu `24,502 B` ve EIP-170 marji yalnizca `74 B`'dir. Yeni on-chain ozellik v2'ye eklenmemeli; kod bolunmus yeni bir major contract version'i tasarlanmalidir.
- Auction, offer, subdomain, cross-chain routing, proxy upgrade ve harici name-service entegrasyonu mevcut urun sozlesmesine eklenmemelidir.
- Testnet ETH icin sahte USD degeri veya oracle olmayan "canli fiyat" gosterilmemelidir.
- Indexer, database veya queue olculebilir ihtiyac olmadan mimariye eklenmemelidir.

## Bilinen release notlari

- V1 deployment canli kalir fakat v1 isimleri v2'ye migrate edilmemistir. Current app ve manifest yalnizca v2'yi cozer.
- Test smoke isimleri zincirde public test verisi olarak kalir; private key veya secret artifact uretilmez.
- Foundry timestamp lint uyarilari expiration/grace mantiginin bilincli `block.timestamp` kullanimidir.
