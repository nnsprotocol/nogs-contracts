import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import deploy from "../deploy";
import { VestedAllocation } from "../deploy/03_vesting";
import { Noggles, Vesting } from "../typechain-types";

const NOGGLES_UNIT = BigNumber.from(10).pow(18); // decimals
const ONE_BILLION = BigNumber.from(10).pow(9);
const ONE_MONTH = 30 * 24 * 60 * 60;

async function setup() {
  const [owner, w1, w2] = await ethers.getSigners();

  const { Noggles: noggles } = await deploy["01_noggles"](hre, {
    deployer: owner,
  });
  const Noggles = <Noggles>await ethers.getContractAt("Noggles", noggles);

  const start = await time.latest();
  const vestingContracts = await deploy["03_vesting"](hre, {
    deployer: owner,
    Noggles,
    allocations: [
      {
        name: "cliff",
        amount: ONE_BILLION,
        beneficiary: w1.address,
        start,
        cliffInSeconds: 1000,
        durationInSeconds: 10000,
      },
      {
        name: "no-cliff",
        amount: ONE_BILLION.mul(2),
        beneficiary: w2.address,
        start,
        cliffInSeconds: 0,
        durationInSeconds: 20000,
      },
      {
        // all released at the same time, using cliff
        name: "lock-with-cliff",
        amount: ONE_BILLION,
        beneficiary: w2.address,
        start,
        cliffInSeconds: 10000,
        durationInSeconds: 10000,
      },
      {
        // all released at the same time, using delayed start
        name: "lock-with-delay",
        amount: ONE_BILLION,
        beneficiary: w2.address,
        start: start + 10000,
        cliffInSeconds: 0,
        durationInSeconds: 0,
      },
    ],
  });
  return {
    Noggles,
    owner,
    w1,
    w2,
    vestingContracts,
    start,
  };
}

describe("Vesting", () => {
  describe("Initial state", () => {
    it("has the given cliff value", async () => {
      const ctx = await setup();

      const cliffW1 = await ctx.vestingContracts["cliff"].cliff();
      expect(cliffW1).to.eq(1000);

      const cliffW2 = await ctx.vestingContracts["no-cliff"].cliff();
      expect(cliffW2).to.eq(0);
    });

    it("has the given duration value", async () => {
      const ctx = await setup();

      const durationW1 = await ctx.vestingContracts["cliff"].duration();
      expect(durationW1).to.eq(10000);

      const durationW2 = await ctx.vestingContracts["no-cliff"].duration();
      expect(durationW2).to.eq(20000);
    });

    it("has the given start time", async () => {
      const ctx = await setup();

      const startW1 = await ctx.vestingContracts["cliff"].start();
      expect(startW1).to.eq(ctx.start);

      const startW2 = await ctx.vestingContracts["no-cliff"].start();
      expect(startW2).to.eq(ctx.start);
    });

    it("has the given beneficiary", async () => {
      const ctx = await setup();

      const beneficiaryW1 = await ctx.vestingContracts["cliff"].beneficiary();
      expect(beneficiaryW1).to.eq(ctx.w1.address);

      const beneficiaryW2 = await ctx.vestingContracts[
        "no-cliff"
      ].beneficiary();
      expect(beneficiaryW2).to.eq(ctx.w2.address);
    });

    it("has the given $NOGGLES balance", async () => {
      const ctx = await setup();

      const balanceW1 = await ctx.Noggles.balanceOf(
        ctx.vestingContracts["cliff"].address
      );
      expect(balanceW1).to.eq(ONE_BILLION.mul(NOGGLES_UNIT));

      const balanceW2 = await ctx.Noggles.balanceOf(
        ctx.vestingContracts["no-cliff"].address
      );
      expect(balanceW2).to.eq(ONE_BILLION.mul(NOGGLES_UNIT).mul(2));
    });
  });

  describe("With Cliff", () => {
    const CLIFF = 1000;
    const DURATION = 10000;
    const SUPPLY = ONE_BILLION.mul(NOGGLES_UNIT);

    let vesting: Vesting;
    let ctx: Awaited<ReturnType<typeof setup>>;
    beforeEach(async () => {
      ctx = await setup();
      vesting = ctx.vestingContracts["cliff"];
    });

    async function releasableTokens(): Promise<BigNumber> {
      await time.latest(); // ensure times moves forward
      return vesting["releasable(address)"](ctx.Noggles.address);
    }

    it("does not release before cliff time", async () => {
      const tokens = await releasableTokens();
      expect(tokens).to.eq(0);
    });

    it("releases 'now - start' value at cliff end", async () => {
      time.increaseTo(ctx.start + CLIFF);

      const tokens = await releasableTokens();

      const expValue = SUPPLY.mul(CLIFF).div(DURATION);
      expect(tokens).to.eq(expValue);
    });

    it("releases linearly after cliff", async () => {
      time.increaseTo(ctx.start + DURATION / 2);

      const tokens = await releasableTokens();

      const expValue = SUPPLY.div(2); // 50% of duration -> 50% of supply releasable
      expect(tokens).to.eq(expValue);
    });

    it("releases all at the end", async () => {
      time.increaseTo(ctx.start + DURATION);

      const tokens = await releasableTokens();

      expect(tokens).to.eq(SUPPLY);
    });

    it("releases all after the end", async () => {
      time.increaseTo(ctx.start + DURATION * 2);

      const tokens = await releasableTokens();

      expect(tokens).to.eq(SUPPLY);
    });
  });

  describe("No Cliff", () => {
    const DURATION = 20000;
    const SUPPLY = ONE_BILLION.mul(NOGGLES_UNIT).mul(2);

    let vesting: Vesting;
    let ctx: Awaited<ReturnType<typeof setup>>;
    beforeEach(async () => {
      ctx = await setup();
      vesting = ctx.vestingContracts["no-cliff"];
    });

    async function releasableTokens(): Promise<BigNumber> {
      await time.latest(); // ensure times moves forward
      return vesting["releasable(address)"](ctx.Noggles.address);
    }

    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach((step) => {
      it(`releases linearly at ${step}%`, async () => {
        time.increaseTo(ctx.start + (DURATION * step) / 100);

        const tokens = await releasableTokens();

        const expValue = SUPPLY.mul(step).div(100);
        expect(tokens).to.eq(expValue);
      });
    });

    it("releases all after the end", async () => {
      time.increaseTo(ctx.start + DURATION * 2);

      const tokens = await releasableTokens();

      expect(tokens).to.eq(SUPPLY);
    });
  });

  describe("All released at the same time", () => {
    ["lock-with-cliff", "lock-with-delay"].forEach((name) => {
      describe(name, () => {
        const DURATION = 10000;
        const SUPPLY = ONE_BILLION.mul(NOGGLES_UNIT);

        let vesting: Vesting;
        let ctx: Awaited<ReturnType<typeof setup>>;
        beforeEach(async () => {
          ctx = await setup();
          vesting = ctx.vestingContracts[name];
        });

        async function releasableTokens(): Promise<BigNumber> {
          await time.latest(); // ensure times moves forward
          return vesting["releasable(address)"](ctx.Noggles.address);
        }

        [0, 25, 50, 75, 99].forEach((percentage) => {
          it(`doesn't release tokens until the end - ${percentage}%`, async () => {
            time.increaseTo(ctx.start + (DURATION * percentage) / 100);
            const tokens = await releasableTokens();
            expect(tokens).to.eq(0);
          });
        });

        it("releases all tokens at the end", async () => {
          time.increaseTo(ctx.start + DURATION + 1);
          const tokens = await releasableTokens();
          expect(tokens).to.eq(SUPPLY);
        });
      });
    });
  });

  describe("Withdraw", () => {
    const DURATION = 20000;
    const SUPPLY = ONE_BILLION.mul(NOGGLES_UNIT).mul(2);

    let vesting: Vesting;
    let ctx: Awaited<ReturnType<typeof setup>>;
    beforeEach(async () => {
      ctx = await setup();
      vesting = ctx.vestingContracts["no-cliff"];
    });

    it("transfers the vested amount to the beneficiary", async () => {
      time.increaseTo(ctx.start + DURATION / 2);

      await vesting["release(address)"](ctx.Noggles.address);

      const expAmount = SUPPLY.div(2);
      const balance = await ctx.Noggles.balanceOf(ctx.w2.address);
      expect(balance).to.eq(expAmount);
    });

    it("takes withdrawn amount into account when computing releasable amount", async () => {
      // Withdraw one fourth
      time.increaseTo(ctx.start + DURATION / 4);
      await vesting["release(address)"](ctx.Noggles.address);
      // Check available at the end
      time.increaseTo(ctx.start + DURATION);
      await time.latest(); // ensure times moves forward
      const amount = await vesting["releasable(address)"](ctx.Noggles.address);

      const expAmount = SUPPLY.mul(3).div(4);
      expect(amount).to.eq(expAmount);
    });
  });

  describe("Planned Allocations", () => {
    async function setup(
      allocation: Omit<VestedAllocation, "beneficiary" | "name">
    ) {
      const [owner, w1] = await ethers.getSigners();

      const { Noggles: noggles } = await deploy["01_noggles"](hre, {
        deployer: owner,
      });
      const Noggles = <Noggles>await ethers.getContractAt("Noggles", noggles);

      const beneficiary = w1.address;
      const vestingContracts = await deploy["03_vesting"](hre, {
        deployer: owner,
        Noggles,
        allocations: [
          {
            ...allocation,
            name: "allocation",
            beneficiary,
          },
        ],
      });

      const Vesting = vestingContracts["allocation"];
      return {
        Noggles,
        beneficiary,
        Vesting,
        releasable: () => Vesting["releasable(address)"](Noggles.address),
      };
    }

    async function increaseToMonth(now: number, months: number) {
      await time.increaseTo(now + months * ONE_MONTH);
    }

    describe("NNS Team", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let now: number;
      let start: number;
      const cliff = 6 * ONE_MONTH - 1;
      const duration = 30 * ONE_MONTH;
      const SUPPLY = ONE_BILLION.mul(69).div(10).mul(NOGGLES_UNIT);
      const RATE = BigNumber.from(1e6).mul(230).mul(NOGGLES_UNIT);

      before(async () => {
        now = await time.latest();
        start = now + 6 * ONE_MONTH;
        ctx = await setup({
          amount: SUPPLY.div(NOGGLES_UNIT),
          start,
          cliffInSeconds: cliff,
          durationInSeconds: duration,
        });
      });

      it("should have 0 at end of month 11 - before cliff", async () => {
        await increaseToMonth(now, 11);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(0);
      });

      it("should have 6*RATE at end of month 12 - end of cliff", async () => {
        await increaseToMonth(now, 12);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(6));
      });

      it("should have 7*RATE at end of month 13", async () => {
        await increaseToMonth(now, 13);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(7));
      });

      it("should have 29*RATE at end of month 35", async () => {
        await increaseToMonth(now, 35);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(29));
      });

      it("should have all supply at end of month 36", async () => {
        await increaseToMonth(now, 36);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });

      it("should have all supply after month 36", async () => {
        await increaseToMonth(now, 50);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });
    });

    describe("Proliferation", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let now: number;
      let start: number;
      const cliff = 0;
      const duration = 24 * ONE_MONTH;
      const SUPPLY = ONE_BILLION.mul(69).div(10).mul(NOGGLES_UNIT);
      const RATE = BigNumber.from(1e5).mul(2875).mul(NOGGLES_UNIT);

      before(async () => {
        now = await time.latest();
        start = now;
        ctx = await setup({
          amount: SUPPLY.div(NOGGLES_UNIT),
          start,
          cliffInSeconds: cliff,
          durationInSeconds: duration,
        });
      });

      it("should have 1*RATE at end of month 1", async () => {
        await increaseToMonth(now, 1);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(1));
      });

      it("should have 23*RATE at end of month 23", async () => {
        await increaseToMonth(now, 23);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(23));
      });

      it("should have all supply at end of month 24", async () => {
        await increaseToMonth(now, 24);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });

      it("should have all supply after month 24", async () => {
        await increaseToMonth(now, 30);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });
    });

    describe("Liquidity Pool", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let now: number;
      let start: number;
      const cliff = 0;
      const duration = 1;
      const SUPPLY = ONE_BILLION.mul(69).div(10).mul(NOGGLES_UNIT);

      before(async () => {
        now = await time.latest();
        start = now + 3 * ONE_MONTH - 1;
        ctx = await setup({
          amount: SUPPLY.div(NOGGLES_UNIT),
          start,
          cliffInSeconds: cliff,
          durationInSeconds: duration,
        });
      });

      it("should have 0 at end of month 2", async () => {
        await increaseToMonth(now, 2);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(0);
      });

      it("should have all supply at end of month 3", async () => {
        await increaseToMonth(now, 3);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });

      it("should have all supply after month 3", async () => {
        await increaseToMonth(now, 10);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });
    });

    describe("Ecosystem Fund", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let now: number;
      let start: number;
      const cliff = 12 * ONE_MONTH - 1;
      const duration = 60 * ONE_MONTH;
      const SUPPLY = ONE_BILLION.mul(138).div(10).mul(NOGGLES_UNIT);
      const RATE = BigNumber.from(1e6).mul(230).mul(NOGGLES_UNIT);

      before(async () => {
        now = await time.latest();
        start = now - 8 * ONE_MONTH;
        ctx = await setup({
          amount: SUPPLY.div(NOGGLES_UNIT),
          start,
          cliffInSeconds: cliff,
          durationInSeconds: duration,
        });
      });

      it("should have 0 at end of month 3 - before cliff", async () => {
        await increaseToMonth(now, 3);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(0);
      });

      it("should have 12*RATE at end of month 4 - end of cliff", async () => {
        await increaseToMonth(now, 4);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(12));
      });

      it("should have 15*RATE at end of month 7", async () => {
        await increaseToMonth(now, 7);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(15));
      });

      it("should have 59*RATE at end of month 51", async () => {
        await increaseToMonth(now, 51);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(RATE.mul(59));
      });

      it("should have all supply at end of month 52", async () => {
        await increaseToMonth(now, 52);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });

      it("should have all supply after month 52", async () => {
        await increaseToMonth(now, 60);
        const tokens = await ctx.releasable();
        expect(tokens).to.eq(SUPPLY);
      });
    });
  });
});
