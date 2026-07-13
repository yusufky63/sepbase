# Clone Checklist

Bu liste yeni bir chain/suffix projesi içindir. Eski deployment veya agent scope'unu yeni klona taşımayın.

> V3 notu: Bu script/checklist bugün v2 clone akışını temizler. Altı authority/state kontratı + bounded read-only MarketLens'ten oluşan yedi-adres v3 release, immutable normalization-attestor/profile, ENS normalizer corpus, marketplace modules, migration roots ve paid-x402 durable store/keeper scope'u doğrulanmadan clone-ready değildir. V2 deployment history/migration evidence yeni v3 deployment record'u ile karıştırılmaz.

## Kimlik ve ekonomi

1. Tek bir EVM chain ve tek bir suffix seçin.
2. Brand profile, logo, mark, favicon ve sosyal görseli değiştirin.
3. Native gas currency metadata'sını settlement metadata'sından bağımsız tanımlayın.
4. Chain fee-estimation modelini seçin: `standard` veya doğrulanmış OP Stack oracle adresleriyle `op-stack`.
5. Tam olarak bir immutable settlement modu seçin: `native` veya standard `erc20`.
6. İnsan-okunabilir 4-32 karakter yıllık fiyatını ve 1/2/3 karakter multiplier tuple'ını belirleyin.
7. Dated fiat reference'ı yalnız production profile için kullanın; testnet'te `null` bırakın. UI-only market reference'ı ayrıca yapılandırın veya kapatın.
8. RPC, Multicall3, explorer, required confirmations, owner, treasury, collection metadata ve final metadata origin'i doğrulayın.

## Eski scope'u temizleme

9. Hedef workspace ve absolute path'i gözden geçirdikten sonra `pnpm clone:reset -- --confirm` çalıştırın.
10. Önceki contract address, deployment block/transaction, owner, treasury, settlement token ve base-unit snapshot'larının temizlendiğini doğrulayın.
11. Yeniden üretilen deployment manifestinde `contract`, `deploymentBlock`, `owner` ve `treasury` yeni deployment öncesinde `null` olmalıdır.
12. Yeniden üretilen agent manifesti eski chain/contract scope'unu taşımamalı; chain/suffix yeni config ile eşleşmeli ve contract yeni deployment öncesinde `null` olmalıdır.
13. `.env`, hosting secrets ve local agent host config'lerinde eski `SEPBASE_MANIFEST_URL`, `SEPBASE_RPC_URL` ve bütün `X402_*` değerlerini manuel temizleyin. `clone:reset` secret store veya untracked env dosyalarını değiştirmez.
14. New clone'da `X402_REGISTRATION_ENABLED=false` bırakın. Paid source `activation-gated` olsa da live paid-enabled V3 manifest ve bütün external runtime/funded E2E kapıları olmadan availability fail-closed kalır.

## Build, deploy ve discovery

15. Fresh `ChainNameService` deploy edin; başka deployment'ın kontratını veya manifestini yeniden kullanmayın.
16. ABI, deployment manifest v3, agent discovery, OpenAPI ve `llms.txt` artifact'larını yeniden üretin.
17. `pnpm exec tsx scripts/validate-integration-artifacts.ts` ile ABI hash, deployment/agent scope, MCP tool inventory ve canonical link parity'sini doğrulayın.
18. `pnpm deployment:check` ile contract version, collection/suffix, owner/treasury, settlement, quote tiers, fees, grace period, Multicall3 ve metadata URI'yi canlı chain'den doğrulayın.
19. 1/2/3/4 karakter quote'ları, fee-estimation modelini ve native + 6-decimal ERC-20 fixture'larını release öncesinde test edin.
20. Required fmt/build/size/test/lint/typecheck/build komutlarının tamamını çalıştırın.

## Hosted release

21. Final HTTPS origin, browser-safe public RPC, ayrı server-only RPC ve WalletConnect project ID'yi hosting ortamında tanımlayın.
22. MCP Streamable HTTP için canonical/explicit Origin policy, bounded request davranışı, rate limit ve monitoring ekleyin. MCP hiçbir signer veya broadcast yetkisi almamalıdır.
23. Siteyi deploy ettikten sonra final origin üzerinde aşağıdakileri ayrı ayrı smoke edin:

```text
/.well-known/chain-name-service.json
/.well-known/chain-name-agent.json
/api/openapi.json
/llms.txt
/api/mcp                       # initialize + tools/list
/api/x402/registration/quote   # ücretsiz quote
/api/x402/registration         # fail-closed 503; ödeme gönderilmez
```

24. Hosted endpoint `404` veya eski içerik döndürüyorsa source-ready route'u "live" diye belgelemeyin; deployment/alias cutover'ı düzeltip smoke'u tekrarlayın.
25. On-chain metadata URI final HTTPS origin ile aynı olmadan release'i tamamlanmış saymayın; admin update sonrasında manifesti yeniden üretip `pnpm deployment:check` ve `pnpm release:check` çalıştırın.
26. Onaylı v3 paid x402 execution'ı clone ayarı olarak açmayın. Compatible ERC-20 deployment, official adapter, durable idempotency, managed limited signer, reconciliation, E2E ve security review tamamlanmadan fail closed bırakın.

## V3 clone gates — pending

27. Normalizer library/version/profile/fixture hash, immutable EIP-712 attestor address/expiry policy ve ENS interface matrix'i yeni suffix için yeniden doğrulayın.
28. Registry/controller/public-resolver/Universal-Resolver/marketplace/migration ve MarketLens adreslerini ayrı suite manifestinde üretin; public resolver ile bounded Universal Resolver helper'ı birleştirmeyin, MarketLens'i authority/indexer diye sunmayın veya başka clone adresini kopyalamayın.
29. Registry wiring'i yalnız `configureSuite(controller,resolver,migration,marketplace)` ile bir kez kilitleyin; Universal Resolver→registry ve MarketLens→marketplace→registry binding'lerini ayrıca doğrulayın.
30. Commit age, auction timing/extension, offer expiry, fee ve liability limitlerini contract tests ile doğrulayın.
31. V2 migration kullanılacaksa source contract/block/root/window'u clone-specific yayımlayın; SEPBASE v2 root'unu başka chain'e taşımayın.
32. Paid x402 kullanılacaksa facilitator-supported ERC-20 settlement, network identifier, payTo/keeper, durable store namespace ve spend limits tamamen yeni scope almalıdır.
33. Multisig, audit, observability, incident runbook, public packages ve full `docs/V3_ACCEPTANCE_MATRIX.md` tamamlanmadan v3 clone'u production-ready işaretlemeyin.
