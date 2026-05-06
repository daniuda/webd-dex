# Webd-dex: Functional Validation & Roadmap

## 1. Status actual și audit rapid
- Contracte smart: Factory, Pair, Router, wWEBD, MockUSDC (există în contracts/)
- Frontend: pagini Swap, Bridge, Liquidity, Stats (există în frontend/src/views)
- Bridge: cod sursă și scripturi (bridge/)
- Teste: există pentru Pair, Router, wWEBD (test/)
- Nu există README, TODO sau backlog explicit

## 2. Testare funcțională (checklist)
- [ ] Deploy local (hardhat, frontend)
- [ ] Rulare teste contracte: `npx hardhat test`
- [ ] Verificare UI: swap, add/remove liquidity, bridge, stats
- [ ] Verificare conectare wallet (Metamask/WalletConnect)
- [ ] Verificare interacțiune contracte din frontend
- [ ] Verificare bridge (mint/burn)

## 3. Ce funcționează / Ce nu merge / Ce lipsește
- [ ] Contracte deployabile și testabile
- [ ] Swap funcțional între wWEBD și USDC
- [ ] Adăugare/lichidare lichiditate
- [ ] Statistici pool-uri afișate corect
- [ ] Bridge funcțional (mint/burn între lanțuri)
- [ ] Integrare cu explorerul (opțional)

## 4. Roadmap & propuneri
- [ ] Documentație și README
- [ ] Automatizare deploy/test
- [ ] UI/UX polishing
- [ ] Integrare bridge cu explorerul
- [ ] Notificări/alerte pentru utilizatori
- [ ] Testare pe rețea reală (Polygon/Testnet)

## 5. Salvări și progres
- Acest fișier servește ca checklist și plan de lucru.
- Bifează fiecare task pe măsură ce este validat.
- Adaugă observații și buguri pe parcurs.
