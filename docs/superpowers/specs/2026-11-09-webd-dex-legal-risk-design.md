# webd-dex: validare testnet, DEX cu risc custodial redus, și drumul spre producție

**Data:** 2026-11-09
**Decizie user:** toate cele 3 direcții, în paralel, fiecare pe traiectoria ei.

## Intenție și de ce

`webd-dex` are deja arhitectura completă: AMM (Factory/Pair/Router tip Uniswap v2),
token `wWEBD` (wrapper ERC20 pe Polygon), bridge Express.js (mint/burn automat) și
frontend Vue. E compilat și testat local, dar nimic nu e deployat pe testnet sau
mainnet, iar bridge-ul e 100% custodial (o singură cheie privată ține fondurile
blocate pe partea WEBD și are puterea de a emite `wWEBD` pe partea Polygon).

Obiectivul: să existe un DEX funcțional pentru WEBD, fără să expunem utilizatorii
sau pe noi la un risc pe care nu l-am ales conștient.

## Goals
- Dovediți, pe bani de test, că tot fluxul (swap, lichiditate, bridge mint/burn)
  funcționează așa cum e scris.
- Reduceți riscul custodial al bridge-ului la nivel de cod, independent de orice
  decizie legală (o cheie compromisă nu trebuie să poată drena tot).
- O bază scrisă, verificabilă, pentru discuția cu un avocat specializat în cripto,
  înainte de a pune bani reali de utilizatori în joc.

## Non-goals
- Nu lansăm pe mainnet cu fonduri reale în acest pas.
- Nu înlocuim nevoia unui audit de securitate extern pentru contracte, înainte de
  mainnet.
- Nu luăm decizii legale noi — documentul e material de lucru pentru avocat, nu
  o opinie juridică.

## Anti-goals (ce ar însemna eșec, chiar dacă merge tehnic)
- Un bridge care funcționează, dar unde o singură cheie privată (a mea sau a
  user-ului) poate muta toți banii blocați, fără limite și fără a putea fi
  oprită rapid.
- Lansare pe mainnet fără ca user-ul să fi vorbit cu un avocat.
- Lichiditate reală pusă într-un pool netestat pe testnet.

---

## Track 1 — Validare funcțională pe testnet (Amoy)

**Stare la 2026-11-09:**
- Testele hardhat: **41/41 trec** (`npx hardhat test`), după reparare
  (`test/Router.test.ts` nu trimitea `trustedForwarder` la noul constructor
  ERC-2771 al `Router`; vezi Track 2 pentru restul schimbărilor de astăzi).
- Wallet deployer `0xB2747e0e881c6575398214f5Ce4119e3FEB5D26e`: **0 MATIC** pe
  Amoy (verificat pe `amoy.polygonscan.com`, are deja 1 tranzacție în istoric,
  dar balanța e zero).
- Niciun contract deployat pe Amoy sau mainnet (`deployments/` are doar
  `localhost.json`).

**Blocat pe:** finanțarea wallet-ului deployer cu MATIC de test. E un robinet
gratuit, nu o tranzacție financiară reală, dar tot userul trebuie să o facă
(regulă: nu trimit eu fonduri, nici de test, în numele userului):
- https://faucet.polygon.technology (selectează Amoy)
- https://www.alchemy.com/faucets/polygon-amoy

**Pași după finanțare** (deja scriși, doar de rulat):
```bash
cd webd-dex
npx hardhat run scripts/deploy.ts --network polygonAmoy
```
Scriptul a fost actualizat azi (Track 2) să accepte opțional
`ADMIN_ADDRESS` și `BRIDGE_HOT_WALLET_ADDRESS` din `.env`; fără ele, foloseşte
deployer-ul pentru ambele, ceea ce e suficient pentru un prim test pe Amoy.
Printează la final valorile pentru `frontend/.env` și `bridge/.env`.

**Checklist de validat pe Amoy, după deploy** (din `PLAN.md`, neschimbat):
- [ ] Swap wWEBD ↔ USDC (MockUSDC, deployat automat pe testnet) din frontend
- [ ] Add/remove liquidity din frontend
- [ ] Bridge: depunere WEBD nativ pe un nod de test → mint `wWEBD` pe Amoy
- [ ] Bridge: `burnForWithdrawal` → eliberare WEBD nativ
- [ ] Verificare caps on-chain (Track 2): mint peste cap respins, `pause()` blochează mintul

---

## Track 2 — Reducerea riscului custodial al bridge-ului (făcut azi, independent de orice decizie legală)

Bridge-ul rămâne arhitectural custodial (nu există o variantă non-custodială
rezonabilă fără ca WebDollar nativ să suporte el însuși multisig sau light
clients pe EVM — verificat: `Node-WebDollar` nu are tranzacții multisig). Dar
puterea unei singure chei compromise poate fi limitată **pe contract**, nu doar
în configurarea bridge-ului (care putea fi ignorată dacă atacatorul controlează
și serverul bridge-ului):

**Modificat în `contracts/wWEBD.sol`:**
- `PAUSER_ROLE` nou, separat de `MINTER_ROLE`: poate opri instant `mint()`
  (`pause()`/`unpause()`), fără să poată el însuși minta.
- `maxMintPerTx` și `maxMintPerDay`, impuse în `mint()`: un cap per-tranzacție
  și un cap cumulat pe fereastră de 24h, setabile **doar** de
  `DEFAULT_ADMIN_ROLE` (`setMintCaps`), niciodată de minter.
- Dacă hot wallet-ul bridge-ului (care are doar `MINTER_ROLE`) e compromis,
  pierderea maximă e limitată la cap-ul zilnic, nu la tot supply-ul.

**Modificat în `scripts/deploy.ts`:**
- `ADMIN_ADDRESS` (opțional): ține `DEFAULT_ADMIN_ROLE` + `PAUSER_ROLE`. Implicit
  deployer-ul, dar **înainte de mainnet cu bani reali trebuie să fie un
  multisig** (de exemplu un Gnosis Safe cu 2-din-3 semnatari), nu o cheie unică.
- `BRIDGE_HOT_WALLET_ADDRESS` (opțional): primeşte doar `MINTER_ROLE`, capat.
  Dacă diferă de admin, deploy-ul revocă automat `MINTER_ROLE` de la deployer.
- Caps implicite la deploy: 10.000 wWEBD/tranzacție, 100.000 wWEBD/zi
  (`MAX_MINT_PER_TX_WEBD` / `MAX_MINT_PER_DAY_WEBD` în `.env`, suprascriu
  implicitul).

**Teste noi** în `test/wWEBD.test.ts` (6 cazuri): cap per-tranzacție, cap zilnic
cumulat pe tranzacții mici, resetarea ferestrei după 24h, faptul că minter-ul
simplu nu poate schimba cap-urile, `pause()`/`unpause()` cu rol separat.
Toate cele 41 de teste trec.

**Ce NU rezolvă asta:**
- Partea WEBD nativă a bridge-ului (`bridge/src/burn.ts`): cheia care ține
  fondurile blocate (`BRIDGE_WALLET_SECRET_HEX`) rămâne o cheie unică, pentru
  că WebDollar nu are multisig nativ. Reducerea de risc aici e operaţională,
  nu pe contract — vezi Track 3 (rezerve mici în hot wallet, restul în cold
  storage, limite de retragere zilnică și în `bridge/src/config.ts`
  `BRIDGE_MAX_AMOUNT_WEBD`, monitorizare).
- Asta nu înlocuiește un audit extern înainte de mainnet.

---

## Track 3 — Drumul spre producție (bani reali), condiționat de avocat + audit

### Analiza legală (material pentru avocat, nu concluzie)

Relevant mai ales pentru UE/România: regulamentul **MiCA** (Markets in
Crypto-Assets), în vigoare din 2024-2025.

- **Contractele AMM în sine** (Factory/Pair/Router, fără pauză sau control
  administrativ asupra swap-urilor userilor) sunt de obicei tratate ca
  software neutru, nu ca serviciu furnizat de o entitate. Nu e however o
  certitudine legală — interpretările diferă pe jurisdicții.
- **Bridge-ul** e diferit: tu (sau entitatea din spate) ții efectiv fondurile
  blocate ale utilizatorilor pe partea WEBD, într-un wallet pe care-l
  controlezi. Asta se aseamănă cu custodia de active cripto pentru terți, ceea
  ce în MiCA poate încadra operatorul ca **CASP (Crypto-Asset Service
  Provider)** — autorizare, capital minim, obligații AML/KYC, raportare.
- **Fee-uri încasate** (bridge are deja `BRIDGE_TX_FEE_WEBD`) înseamnă venit,
  cu obligații fiscale normale în România.
- **Sancțiuni / liste OFAC-echivalente:** un DEX public poate fi folosit de
  adrese sancționate; răspunderea depinde de cât control păstrezi tu asupra
  fluxului.

### Opțiuni, de la cel mai sigur la cel mai expus
1. **Doar DEX, fără bridge propriu** — `wWEBD` ar trebui să intre prin punţi
   deja existente/terțe, sau pur și simplu nu există lichiditate inițială decât
   prin alte căi. Reduce drastic expunerea legală (nu mai eşti custode), dar
   elimină și motivul principal de a avea DEX (schimbul WEBD ↔ stablecoin).
2. **Bridge cu custodie redusă** — admin pe multisig (Track 2, deja făcut la
   nivel de contract), rezerve WEBD ţinute majoritar în cold storage, limite
   zilnice de retragere pe partea WEBD impuse și operaţional (nu doar în
   `config.ts`), publicare periodică a unei dovezi de rezervă (reserve
   attestation). Reduce, nu elimină, riscul de clasificare drept CASP.
3. **Produs complet, cu lichiditate reală** — doar după (a) consult cu avocat
   cripto din România/UE, (b) audit de securitate extern al contractelor,
   (c) decizie explicită despre opțiunea 1 vs. 2 de mai sus.

### Checklist pentru avocat (de luat la întâlnire)
- [ ] Ne încadrăm ca CASP conform MiCA, dat fiind bridge-ul custodial?
- [ ] Ce autorizare/capital minim ar fi necesare, și cât durează procesul?
- [ ] Ce obligații AML/KYC pentru userii bridge-ului (sume mici vs. mari)?
- [ ] Obligații fiscale pentru fee-urile încasate de bridge (`BRIDGE_TX_FEE_WEBD`)?
- [ ] E suficientă opțiunea 1 (fără bridge propriu) ca să evităm autorizarea?

### Checklist pentru audit de securitate (înainte de mainnet, oricare opțiune)
- [ ] Review extern al `Factory.sol`, `Pair.sol`, `Router.sol`, `wWEBD.sol`,
      `MinimalForwarder.sol`.
- [ ] Review al `bridge/src/*.ts` — în special semnarea tranzacțiilor WEBD
      (`burn.ts`) și gestionarea cheii (`BRIDGE_WALLET_SECRET_HEX`,
      `BRIDGE_HOT_WALLET_PRIVATE_KEY`).
- [ ] Testare de penetrare / fuzzing pe caps-urile din Track 2 (ex: reentrancy
      pe `mint`, manipulare `block.timestamp` pentru fereastra zilnică).

---

## Ce rămâne de decis doar de user
- Semnatarii multisig-ului pentru `ADMIN_ADDRESS` (Track 2) — adrese concrete,
  nu pot fi generate de mine fără instrucțiune.
- Finanțarea wallet-ului deployer cu MATIC de test (Track 1) — robinet, nu
  tranzacție reală, dar tot user-ul trebuie să o facă.
- Programarea discuției cu avocatul (Track 3) și bugetul pentru audit extern.
- Care opțiune (1/2/3 din Track 3) se alege pentru lansarea reală.
