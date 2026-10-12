import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { PredictionMarket, MockERC20 } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const TEAM_A = 0;
const TEAM_B = 1;
const RAKE_BPS = 300; // 3%
const NATIVE = ethers.ZeroAddress;

const HOUR = 3600;
const DAY = 86400;

describe("PredictionMarket", () => {
  let pm: PredictionMarket;
  let usdc: MockERC20;
  let owner: HardhatEthersSigner;
  let resolver: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  /** Opens a market closing in 1h with a 1-day resolve window. Returns its id. */
  async function openMarket(token = NATIVE) {
    const now = await time.latest();
    const closesAt = now + HOUR;
    const deadline = closesAt + DAY;
    await pm.createMarket(token, closesAt, deadline);
    return { id: await pm.marketCount(), closesAt, deadline };
  }

  beforeEach(async () => {
    [owner, resolver, treasury, alice, bob, carol] = await ethers.getSigners();

    const PM = await ethers.getContractFactory("PredictionMarket");
    pm = await PM.deploy(resolver.address, treasury.address, RAKE_BPS);
    await pm.waitForDeployment();

    const Mock = await ethers.getContractFactory("MockERC20");
    usdc = await Mock.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
  });

  // ─── Deployment ──────────────────────────────────────────────────────────

  describe("deployment", () => {
    it("stores resolver, treasury and rake", async () => {
      expect(await pm.resolver()).to.equal(resolver.address);
      expect(await pm.treasury()).to.equal(treasury.address);
      expect(await pm.rakeBps()).to.equal(RAKE_BPS);
    });

    it("rejects a rake above the hard cap", async () => {
      const PM = await ethers.getContractFactory("PredictionMarket");
      const max = await pm.MAX_RAKE_BPS();
      await expect(
        PM.deploy(resolver.address, treasury.address, Number(max) + 1)
      ).to.be.revertedWith("PM: rake exceeds max");
    });

    it("rejects zero resolver or treasury", async () => {
      const PM = await ethers.getContractFactory("PredictionMarket");
      await expect(
        PM.deploy(ethers.ZeroAddress, treasury.address, RAKE_BPS)
      ).to.be.revertedWith("PM: zero resolver");
      await expect(
        PM.deploy(resolver.address, ethers.ZeroAddress, RAKE_BPS)
      ).to.be.revertedWith("PM: zero treasury");
    });
  });

  // ─── Market creation ─────────────────────────────────────────────────────

  describe("createMarket", () => {
    it("lets owner and resolver create, and nobody else", async () => {
      const now = await time.latest();
      await expect(pm.createMarket(NATIVE, now + HOUR, now + DAY)).to.emit(pm, "MarketCreated");
      await expect(pm.connect(resolver).createMarket(NATIVE, now + HOUR, now + DAY)).to.emit(
        pm,
        "MarketCreated"
      );
      await expect(
        pm.connect(alice).createMarket(NATIVE, now + HOUR, now + DAY)
      ).to.be.revertedWith("PM: not authorised");
    });

    it("rejects a close time in the past and a deadline before close", async () => {
      const now = await time.latest();
      await expect(pm.createMarket(NATIVE, now - 1, now + DAY)).to.be.revertedWith(
        "PM: closesAt in the past"
      );
      await expect(pm.createMarket(NATIVE, now + DAY, now + HOUR)).to.be.revertedWith(
        "PM: deadline must follow close"
      );
    });

    it("snapshots the rake so later changes cannot alter existing terms", async () => {
      const { id } = await openMarket();
      await pm.setRakeBps(1000);

      expect((await pm.markets(id)).rakeBps).to.equal(RAKE_BPS);

      const { id: newer } = await openMarket();
      expect((await pm.markets(newer)).rakeBps).to.equal(1000);
    });
  });

  // ─── Betting ─────────────────────────────────────────────────────────────

  describe("bet", () => {
    it("escrows the stake and credits the pool", async () => {
      const { id } = await openMarket();
      const amount = ethers.parseEther("10");

      await expect(pm.connect(alice).bet(id, TEAM_A, 0, { value: amount }))
        .to.emit(pm, "BetPlaced")
        .withArgs(id, alice.address, TEAM_A, amount);

      expect((await pm.markets(id)).poolA).to.equal(amount);
      expect(await ethers.provider.getBalance(await pm.getAddress())).to.equal(amount);

      const [onA, onB] = await pm.stakesOf(id, alice.address);
      expect(onA).to.equal(amount);
      expect(onB).to.equal(0);
    });

    it("accumulates repeat bets from the same wallet", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("2") });

      const [onA] = await pm.stakesOf(id, alice.address);
      expect(onA).to.equal(ethers.parseEther("3"));
    });

    it("rejects an invalid side, a zero stake, and an unknown market", async () => {
      const { id } = await openMarket();
      await expect(
        pm.connect(alice).bet(id, 2, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("PM: invalid side");
      await expect(pm.connect(alice).bet(id, TEAM_A, 0, { value: 0 })).to.be.revertedWith(
        "PM: no AVAX sent"
      );
      await expect(
        pm.connect(alice).bet(999, TEAM_A, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("PM: no such market");
    });

    it("rejects bets once betting has closed", async () => {
      const { id, closesAt } = await openMarket();
      await time.increaseTo(closesAt);
      await expect(
        pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("PM: betting closed");
    });
  });

  // ─── Resolution ──────────────────────────────────────────────────────────

  describe("resolve", () => {
    it("is restricted to the resolver", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("1") });
      await time.increaseTo(closesAt);

      await expect(pm.connect(alice).resolve(id, TEAM_A)).to.be.revertedWith("PM: not resolver");
      await expect(pm.connect(owner).resolve(id, TEAM_A)).to.be.revertedWith("PM: not resolver");
      await expect(pm.connect(resolver).resolve(id, TEAM_A)).to.emit(pm, "MarketResolved");
    });

    it("cannot resolve before betting closes or after the deadline", async () => {
      const { id, closesAt, deadline } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });

      await expect(pm.connect(resolver).resolve(id, TEAM_A)).to.be.revertedWith(
        "PM: betting still open"
      );

      await time.increaseTo(deadline + 1);
      await expect(pm.connect(resolver).resolve(id, TEAM_A)).to.be.revertedWith(
        "PM: past resolve deadline"
      );
      expect(closesAt).to.be.lessThan(deadline);
    });

    it("computes rake from the losing pool only", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("300") });
      await time.increaseTo(closesAt);

      await pm.connect(resolver).resolve(id, TEAM_A);

      // 3% of the 300 losing pool.
      expect((await pm.markets(id)).rakeAmount).to.equal(ethers.parseEther("9"));
    });

    it("falls back to refunds when nobody backed the winner", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("5") });
      await time.increaseTo(closesAt);

      await expect(pm.connect(resolver).resolve(id, TEAM_A))
        .to.emit(pm, "RefundsEnabled")
        .withArgs(id, "no stake on winning side");

      expect((await pm.markets(id)).status).to.equal(2); // Refunding

      const before = await ethers.provider.getBalance(bob.address);
      await pm.connect(bob).claim(id);
      expect(await ethers.provider.getBalance(bob.address)).to.be.greaterThan(before);
    });

    it("cannot be resolved twice", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("1") });
      await time.increaseTo(closesAt);

      await pm.connect(resolver).resolve(id, TEAM_A);
      await expect(pm.connect(resolver).resolve(id, TEAM_B)).to.be.revertedWith(
        "PM: already settled"
      );
    });
  });

  // ─── Payout math ─────────────────────────────────────────────────────────

  describe("payouts", () => {
    it("pays stake plus a pro-rata share of the losing pool", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("300") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      // lose 300, rake 9, profit 291, alice owns the whole winning pool.
      const expected = ethers.parseEther("391");
      expect(await pm.previewClaim(id, alice.address)).to.equal(expected);

      const before = await ethers.provider.getBalance(alice.address);
      const tx = await pm.connect(alice).claim(id);
      const rc = await tx.wait();
      const gas = rc!.gasUsed * rc!.gasPrice;

      expect(await ethers.provider.getBalance(alice.address)).to.equal(before + expected - gas);
    });

    it("splits winnings across multiple winners and conserves the pot", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(carol).bet(id, TEAM_A, 0, { value: ethers.parseEther("300") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("400") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      // lose 400, rake 12, profit 388, winning pool 400.
      const aliceOwed = await pm.previewClaim(id, alice.address);
      const carolOwed = await pm.previewClaim(id, carol.address);
      const rake = (await pm.markets(id)).rakeAmount;

      expect(aliceOwed).to.equal(ethers.parseEther("197")); // 100 + 97
      expect(carolOwed).to.equal(ethers.parseEther("591")); // 300 + 291
      expect(rake).to.equal(ethers.parseEther("12"));

      // Everything paid out equals everything staked — no dust left behind.
      expect(aliceOwed + carolOwed + rake).to.equal(ethers.parseEther("800"));
    });

    it("returns only the stake when the losing pool is empty", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("50") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      expect((await pm.markets(id)).rakeAmount).to.equal(0);
      expect(await pm.previewClaim(id, alice.address)).to.equal(ethers.parseEther("50"));
    });

    it("pays a loser nothing", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("100") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      expect(await pm.previewClaim(id, bob.address)).to.equal(0);
      await expect(pm.connect(bob).claim(id)).to.be.revertedWith("PM: nothing to claim");
    });

    it("blocks a second claim", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("100") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      await pm.connect(alice).claim(id);
      await expect(pm.connect(alice).claim(id)).to.be.revertedWith("PM: already claimed");
    });

    it("refuses to pay out before settlement", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await expect(pm.connect(alice).claim(id)).to.be.revertedWith("PM: not settled yet");
    });

    it("settles a hedged position across both sides", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(alice).bet(id, TEAM_B, 0, { value: ethers.parseEther("100") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      // Alice is the entire market: she wins back her 100 plus 97 of her own
      // losing 100, having forfeited 3 to rake.
      expect(await pm.previewClaim(id, alice.address)).to.equal(ethers.parseEther("197"));
      expect((await pm.markets(id)).rakeAmount).to.equal(ethers.parseEther("3"));
    });
  });

  // ─── Rake ────────────────────────────────────────────────────────────────

  describe("rake", () => {
    it("pays the treasury once and only once", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("300") });
      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      const before = await ethers.provider.getBalance(treasury.address);
      await pm.connect(alice).withdrawRake(id); // permissionless
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(
        before + ethers.parseEther("9")
      );

      await expect(pm.connect(alice).withdrawRake(id)).to.be.revertedWith(
        "PM: rake already withdrawn"
      );
    });

    it("takes no rake from a refunded market", async () => {
      const { id, deadline } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await time.increaseTo(deadline + 1);
      await pm.enableRefunds(id);

      await expect(pm.withdrawRake(id)).to.be.revertedWith("PM: not resolved");
    });

    it("caps what the owner can set", async () => {
      await expect(pm.setRakeBps(1001)).to.be.revertedWith("PM: rake exceeds max");
      await pm.setRakeBps(1000);
      expect(await pm.rakeBps()).to.equal(1000);
    });
  });

  // ─── Refund safety valve ─────────────────────────────────────────────────

  describe("refunds", () => {
    it("lets anyone force refunds once the deadline passes", async () => {
      const { id, deadline } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("10") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("20") });

      await expect(pm.connect(carol).enableRefunds(id)).to.be.revertedWith(
        "PM: deadline not reached"
      );

      await time.increaseTo(deadline + 1);
      // carol has no stake here — the point is that recovery needs no insider.
      await expect(pm.connect(carol).enableRefunds(id))
        .to.emit(pm, "RefundsEnabled")
        .withArgs(id, "resolve deadline passed");

      expect(await pm.previewClaim(id, alice.address)).to.equal(ethers.parseEther("10"));
      expect(await pm.previewClaim(id, bob.address)).to.equal(ethers.parseEther("20"));
    });

    it("returns every wei staked, leaving the contract empty", async () => {
      const { id, deadline } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("10") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("20") });
      await time.increaseTo(deadline + 1);
      await pm.enableRefunds(id);

      await pm.connect(alice).claim(id);
      await pm.connect(bob).claim(id);

      expect(await ethers.provider.getBalance(await pm.getAddress())).to.equal(0);
    });

    it("lets the owner cancel an open market early", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("10") });

      await expect(pm.connect(alice).cancelMarket(id)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      await expect(pm.cancelMarket(id))
        .to.emit(pm, "RefundsEnabled")
        .withArgs(id, "cancelled by owner");
      expect(await pm.previewClaim(id, alice.address)).to.equal(ethers.parseEther("10"));
    });

    it("cannot resolve a market that already went to refunds", async () => {
      const { id, closesAt, deadline } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await time.increaseTo(deadline + 1);
      await pm.enableRefunds(id);

      await expect(pm.connect(resolver).resolve(id, TEAM_A)).to.be.revertedWith(
        "PM: already settled"
      );
      expect(closesAt).to.be.lessThan(deadline);
    });
  });

  // ─── ERC-20 settlement ───────────────────────────────────────────────────

  describe("ERC-20 markets", () => {
    const M = (n: string) => ethers.parseUnits(n, 6);

    beforeEach(async () => {
      for (const who of [alice, bob]) {
        await usdc.mint(who.address, M("10000"));
        await usdc.connect(who).approve(await pm.getAddress(), ethers.MaxUint256);
      }
    });

    it("runs the whole lifecycle in USDC", async () => {
      const now = await time.latest();
      const closesAt = now + HOUR;
      await pm.createMarket(await usdc.getAddress(), closesAt, closesAt + DAY);
      const id = await pm.marketCount();

      await pm.connect(alice).bet(id, TEAM_A, M("100"));
      await pm.connect(bob).bet(id, TEAM_B, M("300"));

      expect(await usdc.balanceOf(await pm.getAddress())).to.equal(M("400"));

      await time.increaseTo(closesAt);
      await pm.connect(resolver).resolve(id, TEAM_A);

      const before = await usdc.balanceOf(alice.address);
      await pm.connect(alice).claim(id);
      expect(await usdc.balanceOf(alice.address)).to.equal(before + M("391"));

      await pm.withdrawRake(id);
      expect(await usdc.balanceOf(treasury.address)).to.equal(M("9"));
      expect(await usdc.balanceOf(await pm.getAddress())).to.equal(0);
    });

    it("rejects AVAX sent to an ERC-20 market", async () => {
      const now = await time.latest();
      await pm.createMarket(await usdc.getAddress(), now + HOUR, now + DAY);
      const id = await pm.marketCount();

      await expect(
        pm.connect(alice).bet(id, TEAM_A, M("100"), { value: 1 })
      ).to.be.revertedWith("PM: AVAX sent to ERC20 market");
    });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────

  describe("admin", () => {
    it("can hand resolution to a new address without touching open markets", async () => {
      const { id, closesAt } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("1") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("1") });

      // Stand in for the oracle contract shipping later.
      await pm.setResolver(carol.address);
      await time.increaseTo(closesAt);

      await expect(pm.connect(resolver).resolve(id, TEAM_A)).to.be.revertedWith("PM: not resolver");
      await expect(pm.connect(carol).resolve(id, TEAM_A)).to.emit(pm, "MarketResolved");
    });

    it("restricts admin setters to the owner", async () => {
      await expect(pm.connect(alice).setResolver(alice.address)).to.be.reverted;
      await expect(pm.connect(alice).setTreasury(alice.address)).to.be.reverted;
      await expect(pm.connect(alice).setRakeBps(100)).to.be.reverted;
    });
  });

  // ─── Odds view ───────────────────────────────────────────────────────────

  describe("impliedPayoutRatio", () => {
    it("reports break-even with no opposing stake", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      expect(await pm.impliedPayoutRatio(id, TEAM_A)).to.equal(ethers.parseEther("1"));
    });

    it("reports the multiplier a winning side would earn", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      await pm.connect(bob).bet(id, TEAM_B, 0, { value: ethers.parseEther("300") });

      // 1 + (300 - 9)/100 = 3.91x
      expect(await pm.impliedPayoutRatio(id, TEAM_A)).to.equal(ethers.parseEther("3.91"));
    });

    it("returns zero for a side nobody has backed", async () => {
      const { id } = await openMarket();
      await pm.connect(alice).bet(id, TEAM_A, 0, { value: ethers.parseEther("100") });
      expect(await pm.impliedPayoutRatio(id, TEAM_B)).to.equal(0);
    });
  });
});
