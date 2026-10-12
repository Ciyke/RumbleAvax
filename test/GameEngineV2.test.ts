import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { GameEngineV2, IngredientNFT, PotionNFT } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const WATER = 1;
const CRYSTALIX = 2;
const SUNFIBER = 3;
const COPPERVEIN = 4;
const STONE = 5;
const POISON = 6;

const BOXES = 25;
const DAY = 86400;

describe("GameEngineV2", () => {
  let engine: GameEngineV2;
  let ingredients: IngredientNFT;
  let potions: PotionNFT;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  /** Opens and closes all 25 boxes for `who`, leaving the run ready to craft. */
  async function clearAllBoxes(who: HardhatEthersSigner) {
    for (let i = 0; i < BOXES; i++) {
      await engine.connect(who).openBox(i);
      await engine.connect(who).closeBox(i);
    }
  }

  /** A complete run: begin, clear the board, craft. */
  async function fullRun(who: HardhatEthersSigner) {
    await engine.connect(who).beginHunt();
    await clearAllBoxes(who);
    return engine.connect(who).createPotion();
  }

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const Ingredient = await ethers.getContractFactory("IngredientNFT");
    ingredients = await Ingredient.deploy("ipfs://ingredients/");
    await ingredients.waitForDeployment();

    const Potion = await ethers.getContractFactory("PotionNFT");
    potions = await Potion.deploy("ipfs://potions/");
    await potions.waitForDeployment();

    const Engine = await ethers.getContractFactory("GameEngineV2");
    engine = await Engine.deploy(
      await ingredients.getAddress(),
      await potions.getAddress(),
      0 // season starts now
    );
    await engine.waitForDeployment();

    await ingredients.setGameEngine(await engine.getAddress());
    await potions.setGameEngine(await engine.getAddress());
  });

  // ─── Setup ───────────────────────────────────────────────────────────────

  describe("deployment", () => {
    it("wires both token contracts", async () => {
      expect(await engine.ingredientNFT()).to.equal(await ingredients.getAddress());
      expect(await engine.potionNFT()).to.equal(await potions.getAddress());
    });

    it("has no voucher surface at all", () => {
      const fns = engine.interface.fragments
        .filter((f: any) => f.type === "function")
        .map((f: any) => f.name);

      for (const name of ["hasVoucher", "rumbleVoucher", "setRumbleVoucher"]) {
        expect(fns).to.not.include(name);
      }
    });

    it("runs a 64-day season from the given start", async () => {
      expect(await engine.SEASON_DAYS()).to.equal(64);
      const start = await engine.SEASON_START();
      expect(await engine.seasonEnd()).to.equal(start + BigInt(64 * DAY));
    });

    it("rejects zero addresses", async () => {
      const Engine = await ethers.getContractFactory("GameEngineV2");
      await expect(
        Engine.deploy(ethers.ZeroAddress, await potions.getAddress(), 0)
      ).to.be.revertedWith("GameEngineV2: zero ingredientNFT");
      await expect(
        Engine.deploy(await ingredients.getAddress(), ethers.ZeroAddress, 0)
      ).to.be.revertedWith("GameEngineV2: zero potionNFT");
    });
  });

  // ─── No session keys ─────────────────────────────────────────────────────

  describe("session keys are gone", () => {
    it("exposes no session-key surface at all", () => {
      const fns = Object.keys(engine.interface.fragments)
        .map((k) => (engine.interface.fragments as any)[k])
        .filter((f: any) => f.type === "function")
        .map((f: any) => f.name);

      for (const name of ["approveSessionKey", "revokeSessionKey", "isSessionKeyValid"]) {
        expect(fns).to.not.include(name);
      }
    });

    it("acts only on the caller, so nobody can drive another player's run", async () => {
      await engine.connect(alice).beginHunt();
      // bob opening a box advances bob's own (nonexistent) run, not alice's.
      await expect(engine.connect(bob).openBox(0)).to.be.revertedWith(
        "GameEngineV2: no run in progress"
      );
    });

    it("never accepts native value", async () => {
      await expect(
        alice.sendTransaction({ to: await engine.getAddress(), value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });

  // ─── Run lifecycle ───────────────────────────────────────────────────────

  describe("beginHunt", () => {
    it("opens run 1 and emits", async () => {
      await expect(engine.connect(alice).beginHunt())
        .to.emit(engine, "HuntBegun")
        .withArgs(alice.address, 1, 0);

      expect(await engine.currentRun(alice.address)).to.equal(1);
    });

    it("burns leftovers so an abandoned run cannot poison the next", async () => {
      await engine.connect(alice).beginHunt();
      // Walk part-way through, accumulating ingredients.
      for (let i = 0; i < 10; i++) {
        await engine.connect(alice).openBox(i);
        await engine.connect(alice).closeBox(i);
      }

      const held = await ingredients.getAllBalances(alice.address);
      expect(held.reduce((a, b) => a + b, 0n)).to.equal(10n);

      await engine.connect(alice).beginHunt();

      const afterRestart = await ingredients.getAllBalances(alice.address);
      expect(afterRestart.reduce((a, b) => a + b, 0n)).to.equal(0n);
      expect(await engine.currentRun(alice.address)).to.equal(2);
    });
  });

  describe("openBox / closeBox", () => {
    beforeEach(async () => {
      await engine.connect(alice).beginHunt();
    });

    it("mints one ingredient per box", async () => {
      await engine.connect(alice).openBox(0);
      const held = await ingredients.getAllBalances(alice.address);
      expect(held.reduce((a, b) => a + b, 0n)).to.equal(1n);
    });

    it("enforces the sequential rule", async () => {
      await expect(engine.connect(alice).openBox(1)).to.be.revertedWith(
        "GameEngineV2: must close previous box first"
      );

      await engine.connect(alice).openBox(0);
      await expect(engine.connect(alice).openBox(1)).to.be.revertedWith(
        "GameEngineV2: must close previous box first"
      );

      await engine.connect(alice).closeBox(0);
      await expect(engine.connect(alice).openBox(1)).to.emit(engine, "BoxOpened");
    });

    it("rejects reopening, double closing, closing unopened, and out-of-range", async () => {
      await engine.connect(alice).openBox(0);
      await expect(engine.connect(alice).openBox(0)).to.be.revertedWith(
        "GameEngineV2: box already opened"
      );

      await engine.connect(alice).closeBox(0);
      await expect(engine.connect(alice).closeBox(0)).to.be.revertedWith(
        "GameEngineV2: box already closed"
      );

      await expect(engine.connect(alice).closeBox(5)).to.be.revertedWith(
        "GameEngineV2: open the box first"
      );
      await expect(engine.connect(alice).openBox(25)).to.be.revertedWith(
        "GameEngineV2: invalid box index"
      );
    });

    it("tracks progress for the UI", async () => {
      for (let i = 0; i < 3; i++) {
        await engine.connect(alice).openBox(i);
        await engine.connect(alice).closeBox(i);
      }

      const p = await engine.getRunProgress(alice.address);
      expect(p.runId).to.equal(1);
      expect(p.boxesOpened).to.equal(3);
      expect(p.boxesClosed).to.equal(3);
      expect(p.begun).to.equal(true);
      expect(p.readyToCraft).to.equal(false);
    });
  });

  // ─── Board composition ───────────────────────────────────────────────────

  describe("board", () => {
    it("always contains exactly one of each useful ingredient", async () => {
      await engine.connect(alice).beginHunt();
      const board = await engine.previewRun(alice.address, 1);

      const counts = new Map<number, number>();
      for (const r of board) counts.set(Number(r), (counts.get(Number(r)) ?? 0) + 1);

      expect(counts.get(WATER)).to.equal(1);
      expect(counts.get(CRYSTALIX)).to.equal(1);
      expect(counts.get(SUNFIBER)).to.equal(1);
      expect(counts.get(COPPERVEIN)).to.equal(1);
      expect(counts.get(STONE)).to.equal(11);
      expect(counts.get(POISON)).to.equal(10);
      expect(board.length).to.equal(25);
    });

    it("deals a different board on each run — the V1 replay bug", async () => {
      await engine.connect(alice).beginHunt();
      const first = (await engine.previewRun(alice.address, 1)).map(Number);
      await engine.connect(alice).beginHunt();
      const second = (await engine.previewRun(alice.address, 2)).map(Number);

      // V1 seeded on (day, player, chainId) only, so these would be identical.
      expect(first.join()).to.not.equal(second.join());
    });

    it("deals different boards to different players", async () => {
      await engine.connect(alice).beginHunt();
      await engine.connect(bob).beginHunt();

      const a = (await engine.previewRun(alice.address, 1)).map(Number).join();
      const b = (await engine.previewRun(bob.address, 1)).map(Number).join();
      expect(a).to.not.equal(b);
    });

    it("matches what openBox actually mints", async () => {
      await engine.connect(alice).beginHunt();
      const board = (await engine.previewRun(alice.address, 1)).map(Number);

      await expect(engine.connect(alice).openBox(0))
        .to.emit(engine, "BoxOpened")
        .withArgs(alice.address, 1, 0, board[0]);
    });
  });

  // ─── Crafting ────────────────────────────────────────────────────────────

  describe("createPotion", () => {
    it("mints a potion and awards a flat 50 points", async () => {
      await expect(fullRun(alice)).to.emit(engine, "PotionCrafted");

      expect(await potions.balanceOf(alice.address)).to.equal(1);

      const stats = await engine.getSeasonStats(alice.address);
      expect(stats.points).to.equal(50);
      expect(stats.potions).to.equal(1);
    });

    it("awards the same points to every player — no multiplier exists", async () => {
      await fullRun(alice);
      await fullRun(bob);

      expect((await engine.getSeasonStats(alice.address)).points).to.equal(
        (await engine.getSeasonStats(bob.address)).points
      );
    });

    it("burns every ingredient, leaving the player empty", async () => {
      await fullRun(alice);
      const held = await ingredients.getAllBalances(alice.address);
      expect(held.reduce((a, b) => a + b, 0n)).to.equal(0n);
    });

    it("refuses to craft before the board is cleared", async () => {
      await engine.connect(alice).beginHunt();
      await expect(engine.connect(alice).createPotion()).to.be.revertedWith(
        "GameEngineV2: not all boxes have been opened"
      );

      // Open all, close all but the last.
      for (let i = 0; i < BOXES - 1; i++) {
        await engine.connect(alice).openBox(i);
        await engine.connect(alice).closeBox(i);
      }
      await engine.connect(alice).openBox(BOXES - 1);

      await expect(engine.connect(alice).createPotion()).to.be.revertedWith(
        "GameEngineV2: not all boxes have been closed"
      );
    });

    it("refuses to craft twice on one run", async () => {
      await fullRun(alice);
      await expect(engine.connect(alice).createPotion()).to.be.revertedWith(
        "GameEngineV2: potion already crafted for this run"
      );
    });

    it("refuses to craft with no run at all", async () => {
      await expect(engine.connect(bob).createPotion()).to.be.revertedWith(
        "GameEngineV2: no run in progress"
      );
    });
  });

  // ─── Unlimited runs — the headline change ────────────────────────────────

  describe("unlimited runs per day", () => {
    it("allows repeat cycles in a single day", async () => {
      await fullRun(alice);
      await fullRun(alice);
      await fullRun(alice);

      expect(await potions.balanceOf(alice.address)).to.equal(3);

      const stats = await engine.getSeasonStats(alice.address);
      expect(stats.points).to.equal(150);
      expect(stats.potions).to.equal(3);
      expect(await engine.currentRun(alice.address)).to.equal(3);
    });

    it("does not advance the day between runs", async () => {
      await fullRun(alice);
      await fullRun(alice);
      expect(await engine.currentDay()).to.equal(0);
    });

    it("keeps per-run history readable after the fact", async () => {
      await fullRun(alice);
      await engine.connect(alice).beginHunt();

      const run1 = await engine.runState(alice.address, 1);
      expect(run1.potionCrafted).to.equal(true);
      expect(run1.opened).to.equal(33554431); // ALL_BOXES

      const run2 = await engine.runState(alice.address, 2);
      expect(run2.potionCrafted).to.equal(false);
      expect(run2.opened).to.equal(0);
    });

    it("blocks play on a run that has already produced its potion", async () => {
      await fullRun(alice);
      await expect(engine.connect(alice).openBox(0)).to.be.revertedWith(
        "GameEngineV2: run already completed"
      );
    });

    it("carries points across days", async () => {
      await fullRun(alice);
      await time.increase(DAY);
      await fullRun(alice);

      expect(await engine.currentDay()).to.equal(1);
      expect((await engine.getSeasonStats(alice.address)).points).to.equal(100);
    });
  });

  // ─── Season window ───────────────────────────────────────────────────────

  describe("season", () => {
    it("refuses play before the season opens", async () => {
      const start = (await time.latest()) + DAY * 7;
      const Engine = await ethers.getContractFactory("GameEngineV2");
      const future = await Engine.deploy(
        await ingredients.getAddress(),
        await potions.getAddress(),
        start
      );
      await future.waitForDeployment();

      await expect(future.connect(alice).beginHunt()).to.be.revertedWith(
        "GameEngineV2: season has not started"
      );
      expect(await future.isSeasonActive()).to.equal(false);
    });

    it("stops new runs after day 64 but honours the grace period", async () => {
      await time.increase(64 * DAY + 60);

      expect(await engine.isSeasonActive()).to.equal(false);
      await expect(engine.connect(alice).beginHunt()).to.be.revertedWith(
        "GameEngineV2: season closed to new runs"
      );
    });

    it("locks everything once the grace period expires", async () => {
      await time.increase(64 * DAY + 48 * 3600 + 60);
      await expect(engine.connect(alice).beginHunt()).to.be.revertedWith(
        "GameEngineV2: season has ended"
      );
    });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────

  describe("admin", () => {
    it("lets the owner repoint the token contracts", async () => {
      await expect(engine.setPotionNFT(bob.address)).to.emit(engine, "PotionNFTUpdated");
      expect(await engine.potionNFT()).to.equal(bob.address);
    });

    it("keeps setters away from everyone else", async () => {
      await expect(engine.connect(alice).setPotionNFT(bob.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });
});
