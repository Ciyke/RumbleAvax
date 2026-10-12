# Rumble on Avalanche

Ingredient Hunt and a parimutuel Predictions Market, on Avalanche C-Chain.
Contracts plus a static frontend — **no backend, no indexer, no database.**

Built as a separate project from `C:\BatchNFTMint` (Somnia/Arc) so deploys here
never touch `playrumble.xyz`.

---

## What is here

| Contract | Purpose | Runtime size |
|---|---|---|
| `GameEngineV2.sol` | The hunt: 25 boxes → recipe → potion | 9,465 / 24,576 |
| `PredictionMarket.sol` | Parimutuel betting with a rake | 9,126 |
| `IngredientNFT.sol` | ERC-1155, 6 ingredient types | 7,945 |
| `PotionNFT.sol` | ERC-721, the crafted potion | 6,080 |

All well under the 24,576-byte EIP-170 limit that C-Chain enforces.

**There is no voucher contract and no access gate.** The hunt is open to any
wallet. The voucher's only function was doubling points from 50 to 100, and with
the leaderboard removed nothing consumes points — so it was deleted rather than
left as a token that did nothing. Points are now a flat 50 per potion, kept for
display only.

---

## How the hunt differs from the Somnia version

| | V1 (Somnia) | V2 (Avalanche) |
|---|---|---|
| Signing | Session key auto-signs 51 of 52 txs | **Every tx signed manually** |
| Gas | Operator funded each session key (0.3 SOMI/player/day) | **Player pays their own** |
| Runs | One hunt, one potion per day | **Unlimited runs per day** |
| Board seed | `keccak256(day, player, chainId)` | `keccak256(day, player, chainId, runId)` |
| Leaderboard | Backend-served | **Removed** |
| Season | Hardcoded, expired | Constructor argument, 64 days |

**Why the seed changed:** V1's seed was constant for a player within a day. With
repeat runs allowed, that would have dealt an identical board every time. The run
id makes each run differ.

**Why gas funding is gone:** removing session keys removes the subsidy. Unlimited
runs would otherwise let one wallet drain the treasury; when the player pays,
unlimited is self-limiting and costs the operator nothing.

---

## Measured gas

From `npx hardhat run scripts/measure-gas.ts` — real executed transactions, not
estimates.

| Step | Gas |
|---|---|
| `beginHunt` | 95,414 |
| `openBox` ×25 | 1,783,733 (avg 71,349) |
| `closeBox` ×25 | 852,713 (avg 34,108) |
| `createPotion` | 198,381 |
| **Full run (52 txs)** | **2,930,241** |

Cost per run, paid by the player:

| Gas price | AVAX | at $30/AVAX |
|---|---|---|
| 1 nAVAX (floor) | 0.002930 | $0.09 |
| 25 nAVAX | 0.073256 | $2.20 |
| 50 nAVAX | 0.146512 | $4.40 |

Deploying all four contracts: **7,624,401 gas** (~0.0076 AVAX at the floor).

Market operations: `bet` 75,905 · `resolve` 60,245 · `claim` 69,606.

---

## Predictions market

Parimutuel. Bettors stake into one of two pools; at resolution the losing pool,
minus rake, is split across the winning pool pro rata:

```
rake   = losingPool × rakeBps / 10000
payout = stake + stake × (losingPool − rake) / winningPool
```

Rake is charged only on winnings, so **a winner always gets at least their stake
back**. The protocol takes no position and carries no price risk.

### Resolution before the oracle exists

The oracle is not built yet, so `resolver` is a plain address that reports
winners, swappable by the owner. To make that safe:

- Every market has a **`resolveDeadline`**. If it passes unresolved, **anyone**
  may call `enableRefunds` and every bettor withdraws in full.
- If nobody backed the winning side, the market **falls back to refunds** rather
  than handing the pot to the treasury.
- The rake is **snapshotted at market creation**, so changing `rakeBps` later
  cannot alter terms people already bet into.
- `MAX_RAKE_BPS = 1000` caps the rake at 10% permanently.

Funds can never be stranded waiting on a resolver that has gone away.

---

## Setup

```bash
npm install
cp .env.example .env     # fill in the values below
npx hardhat compile
npx hardhat test         # 69 tests
```

### Required before deploying

| Variable | Notes |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Must hold AVAX. Keep separate from the treasury. |
| `SEASON_START` | Unix seconds. Blank/0 starts at deploy time. **Immutable.** |
| `RAKE_BPS` | 300 = 3%. Capped at 1000. |
| `TREASURY_ADDRESS` | Receives rake. Should not be the deployer. |
| `RESOLVER_ADDRESS` | Decides who wins every market — **prefer a multisig.** |
| `INGREDIENT_NFT_URI`, `POTION_NFT_BASE_URI` | Metadata bases |

---

## Deploying

```bash
npm run deploy:dry                    # local rehearsal
npm run deploy:fuji                   # testnet
CONFIRM_MAINNET=yes npm run deploy:avalanche
```

Mainnet refuses to run without `CONFIRM_MAINNET=yes`. The script deploys all five
contracts, authorises the engine on both NFTs, verifies every wiring link, and
writes `deployments.json` (read-merge-write, so one network never erases
another's record).

Then verify on Snowtrace — the command is printed at the end of the deploy.

---

## Frontend

```bash
cd frontend
npm install
cp .env.example .env      # paste addresses from deployments.json
npm run dev
```

One Vite build serves two custom domains from a single Cloudflare Pages project:

| Domain | Renders |
|---|---|
| `hunt.playrumble.xyz` | Ingredient Hunt |
| `bet.playrumble.xyz` | Predictions |

`src/main.jsx` picks the app from `window.location.hostname`. The `/hunt` and
`/bet` paths do the same thing, which is what makes local dev and Pages preview
URLs work — those only ever have one hostname.

Every figure in the UI comes from a contract view call. `marketCount` lets the
market list be enumerated without an indexer, which is what allows the whole
thing to be a static page.

### Cloudflare

```bash
cd frontend && npm run deploy
```

Create the Pages project once, then add both subdomains as custom domains
pointing at it. `playrumble.xyz` and its project are untouched by any of this.

---

## Still outstanding

- **NFT artwork.** `metadata/ingredients/*.json` in the old repo points at
  `playrumble.xyz/ingredients/*.jpg`, which does not exist in that repo or its
  build. Potion metadata was never written at all. Six ingredient images and one
  potion image are needed, plus re-hosting and a season rename.
- **The oracle**, to replace the manual resolver.
- **Season start date**, rake %, treasury and resolver addresses.
- **Points are decorative.** A flat 50 accrues per potion and nothing reads it.
  Harmless to leave, but it can be stripped entirely if you want the state gone.
