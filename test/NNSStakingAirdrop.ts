import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, ContractTransaction, Signer } from "ethers";
import { ethers, network } from "hardhat";
import {
  DummyERC20,
  NNSStakingAirdrop,
  NogsTippingPool,
} from "../typechain-types";

async function setup() {
  const [owner, w1, w2, w3] = await ethers.getSigners();

  const erc20Factory = await ethers.getContractFactory("DummyERC20");
  const DummyERC20 = <DummyERC20>await erc20Factory.connect(owner).deploy();

  const poolFactory = await ethers.getContractFactory("NNSStakingAirdrop");
  const NNSStakingAirdrop = <NNSStakingAirdrop>(
    await poolFactory.connect(owner).deploy(DummyERC20.address)
  );

  return {
    owner,
    w1,
    w2,
    w3,
    DummyERC20,
    NNSStakingAirdrop,
  };
}

describe("NNSStakingAirdrop", () => {
  describe("erc20", () => {
    it("returns the erc20 contract address", async () => {
      const ctx = await setup();
      const addr = await ctx.NNSStakingAirdrop.erc20();
      expect(addr).to.eq(ctx.DummyERC20.address);
    });
  });

  describe("add", () => {
    it("reverts when called not by the owner", async () => {
      const ctx = await setup();
      const op = ctx.NNSStakingAirdrop.connect(ctx.w2).add([], []);
      await expect(op).to.be.revertedWith(/not the owner/);
    });

    it("reverts when called with invalid inputs", async () => {
      const ctx = await setup();
      const op = ctx.NNSStakingAirdrop.connect(ctx.owner).add(
        [ctx.w1.address],
        [100, 100]
      ); // same length is required
      await expect(op).to.be.revertedWith(/must be the same length/);
    });

    describe("successful tx", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;

      before(async () => {
        ctx = await setup();
      });

      it("does not revert", async () => {
        await ctx.DummyERC20.mint(ctx.owner.address, 1000);
        await ctx.DummyERC20.connect(ctx.owner).approve(
          ctx.NNSStakingAirdrop.address,
          1000
        );

        await ctx.NNSStakingAirdrop.connect(ctx.owner).add(
          [ctx.w1.address, ctx.w2.address],
          [150, 200]
        );
      });

      it("transfers the sum of airdrops from the owners balance", async () => {
        const ownerBalance = await ctx.DummyERC20.balanceOf(ctx.owner.address);
        const contractBalance = await ctx.DummyERC20.balanceOf(
          ctx.NNSStakingAirdrop.address
        );

        expect(ownerBalance).to.eq(1000 - 150 - 200);
        expect(contractBalance).to.eq(150 + 200);
      });

      it("sets the amount for each wallet", async () => {
        const amount1 = await ctx.NNSStakingAirdrop.available(ctx.w1.address);
        const amount2 = await ctx.NNSStakingAirdrop.available(ctx.w2.address);

        expect(amount1).to.eq(150);
        expect(amount2).to.eq(200);
      });

      it("does not set amounts for other wallets", async () => {
        const amount = await ctx.NNSStakingAirdrop.available(ctx.w3.address);
        expect(amount).to.eq(0);
      });
    });
  });

  describe("claim", () => {
    it("reverts when no amount is available", async () => {
      const ctx = await setup();
      const op = ctx.NNSStakingAirdrop.connect(ctx.w1).claim();
      await expect(op).to.be.revertedWith(/nothing to claim/);
    });

    describe("successful tx", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let tx: ContractTransaction;

      before(async () => {
        ctx = await setup();

        await ctx.DummyERC20.mint(ctx.owner.address, 1000);
        await ctx.DummyERC20.connect(ctx.owner).approve(
          ctx.NNSStakingAirdrop.address,
          1000
        );

        await ctx.NNSStakingAirdrop.connect(ctx.owner).add(
          [ctx.w1.address, ctx.w2.address],
          [150, 200]
        );
      });

      it("does not revert", async () => {
        tx = await ctx.NNSStakingAirdrop.connect(ctx.w1).claim();
      });

      it("transfer the available amount to the caller", async () => {
        const ownerBalance = await ctx.DummyERC20.balanceOf(ctx.w1.address);
        expect(ownerBalance).to.eq(150);
      });

      it("resets the available amount", async () => {
        const amount = await ctx.NNSStakingAirdrop.available(ctx.w1.address);
        expect(amount).to.eq(0);
      });

      it("does not reset other amounts", async () => {
        const amount = await ctx.NNSStakingAirdrop.available(ctx.w2.address);
        expect(amount).to.eq(200);
      });

      it("emits AirdropClaimed", async () => {
        expect(tx)
          .to.emit(ctx.NNSStakingAirdrop, "AirdropClaimed")
          .withArgs(ctx.w1.address, 150);
      });
    });
  });

  describe("reclaim", () => {
    it("reverts the caller is not the onwer", async () => {
      const ctx = await setup();
      const op = ctx.NNSStakingAirdrop.connect(ctx.w1).reclaim();
      await expect(op).to.be.revertedWith(/not the owner/);
    });

    describe("successful tx", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;

      before(async () => {
        ctx = await setup();
        await ctx.DummyERC20.mint(ctx.NNSStakingAirdrop.address, 1234);
      });

      it("does not revert", async () => {
        await ctx.NNSStakingAirdrop.connect(ctx.owner).reclaim();
      });

      it("transfer the whole balance amount to the caller", async () => {
        const ownerBalance = await ctx.DummyERC20.balanceOf(ctx.owner.address);
        expect(ownerBalance).to.eq(1234);

        const contractBalance = await ctx.DummyERC20.balanceOf(
          ctx.NNSStakingAirdrop.address
        );
        expect(contractBalance).to.eq(0);
      });
    });
  });
});
