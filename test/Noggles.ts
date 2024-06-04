import hre, { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import deploy from "../deploy";
import { Noggles } from "../typechain-types";
import { BigNumber } from "ethers";
import { expect } from "chai";

async function setup() {
  const [owner, w1, w2] = await ethers.getSigners();

  const { Noggles: noggles } = await deploy["01_noggles"](hre, {
    deployer: owner,
  });
  return {
    Noggles: <Noggles>await ethers.getContractAt("Noggles", noggles),
    owner,
    w1,
    w2,
  };
}

const NOGGLES_UNIT = BigNumber.from(10).pow(18); // decimals
const ONE_BILLION = BigNumber.from(10).pow(9);

describe("Noggles", () => {
  describe("initial state", () => {
    it("has initial supply of 69B", async () => {
      const ctx = await setup();
      const supply = await ctx.Noggles.totalSupply();
      expect(supply).to.eq(
        BigNumber.from(69).mul(ONE_BILLION).mul(NOGGLES_UNIT)
      );
    });

    it("transfers all supply to owner", async () => {
      const ctx = await setup();
      const ownerSupply = await ctx.Noggles.balanceOf(ctx.owner.address);
      expect(ownerSupply).to.eq(
        BigNumber.from(69).mul(ONE_BILLION).mul(NOGGLES_UNIT)
      );
    });

    it("is called Noggles ($NOGS)", async () => {
      const ctx = await setup();
      const name = await ctx.Noggles.name();
      const symbol = await ctx.Noggles.symbol();
      expect(name).to.eq("Noggles");
      expect(symbol).to.eq("NOGS");
    });
  });

  describe("inflation", () => {
    it("reverts when a non-onwer tries to mint", async () => {
      const ctx = await setup();

      const op = ctx.Noggles.connect(ctx.w2).mint(ctx.w1.address);
      await expect(op).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts when minting less than one year before last time", async () => {
      const ctx = await setup();

      const op = ctx.Noggles.mint(ctx.w1.address);
      await expect(op).to.be.revertedWith("already inflated");
    });

    it("mints 1.69% and transfers it to the given address", async () => {
      const ctx = await setup();
      await time.increase(400 * 24 * 60 * 60);

      const oldSupply = await ctx.Noggles.totalSupply();
      const newSupply = oldSupply
        .mul(1.69 * 100)
        .div(100)
        .div(100);
      await ctx.Noggles.mint(ctx.w2.address);

      expect(await ctx.Noggles.totalSupply()).to.eq(oldSupply.add(newSupply));
      expect(await ctx.Noggles.balanceOf(ctx.w2.address)).to.eq(newSupply);

      await expect(ctx.Noggles.mint(ctx.w2.address)).to.be.revertedWith(
        "already inflated"
      );
    });

    it("allows minting once per year", async () => {
      const ctx = await setup();

      const mint = () => ctx.Noggles.mint(ctx.w1.address);

      // just created, not ok
      await expect(mint()).to.be.revertedWith("already inflated");

      // 1y ahead, ok
      await time.increase(365 * 24 * 60 * 60);
      await expect(mint()).not.to.be.reverted;

      // just minted, not ok
      await expect(mint()).to.be.revertedWith("already inflated");

      // 1y-1d, not ok
      await time.increase(364 * 24 * 60 * 60);
      await expect(mint()).to.be.revertedWith("already inflated");

      // 1y, ok
      await time.increase(24 * 60 * 60);
      await expect(mint()).not.to.be.reverted;
    });
  });
});
