import { expect } from "chai";
import { BigNumber, BigNumberish, ContractTransaction, Signer } from "ethers";
import { ethers, network } from "hardhat";
import { DummyERC20, NogsRewarder } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

async function setup() {
  const [owner, signer, w1, w2] = await ethers.getSigners();

  const erc20Factory = await ethers.getContractFactory("DummyERC20");
  const DummyERC20 = <DummyERC20>await erc20Factory.connect(owner).deploy();

  const vestingFactory = await ethers.getContractFactory("NogsRewarder");
  const NogsRewarder = <NogsRewarder>(
    await vestingFactory.connect(owner).deploy()
  );
  await NogsRewarder.initialize(DummyERC20.address, signer.address);

  await DummyERC20.mint(NogsRewarder.address, BigNumber.from("1000000000"));

  return {
    owner,
    signer,
    w1,
    w2,
    DummyERC20,
    NogsRewarder,
  };
}

async function signClaim(
  signer: Signer,
  data: {
    sender: string;
    chainId: number;
    amount: BigNumberish;
    claimId: BigNumberish;
    expiry: number;
  }
) {
  const hash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256"],
    [data.sender, data.chainId, data.claimId, data.amount, data.expiry]
  );
  return await signer.signMessage(ethers.utils.arrayify(hash));
}

describe("NogsRewarder", () => {
  describe("erc20", () => {
    it("returns the erc20 contract address", async () => {
      const ctx = await setup();
      const addr = await ctx.NogsRewarder.erc20();
      expect(addr).to.eq(ctx.DummyERC20.address);
    });
  });

  describe("updateClaimSigner", () => {
    it("reverts when called not by the owner", async () => {
      const ctx = await setup();
      const op = ctx.NogsRewarder.connect(ctx.w1).updateClaimSigner(
        ctx.w2.address
      );
      await expect(op).to.be.revertedWith(/not the owner/);
    });

    it("updates the signer when called by the owner", async () => {
      const ctx = await setup();
      await ctx.NogsRewarder.connect(ctx.owner).updateClaimSigner(
        ctx.w2.address
      );

      const newSigner = await ctx.NogsRewarder.claimSigner();
      expect(newSigner).to.eq(ctx.w2.address);
    });
  });

  describe("claiming", () => {
    describe("invalid signatures", () => {
      type ClaimData = Parameters<typeof signClaim>[1];
      const signTests = [
        {
          name: "wrong sender",
          modifyClaim: (data: ClaimData) => ({
            ...data,
            sender: ethers.constants.AddressZero,
          }),
        },
        {
          name: "wrong chain",
          modifyClaim: (data: ClaimData) => ({ ...data, chainId: 666 }),
        },
        {
          name: "wrong claim id",
          modifyClaim: (data: ClaimData) => ({ ...data, claimId: 666 }),
        },
        {
          name: "wrong amount",
          modifyClaim: (data: ClaimData) => ({ ...data, amount: 666 }),
        },
        {
          name: "wrong expiry",
          modifyClaim: (data: ClaimData) => ({ ...data, expiry: 666 }),
        },
      ];

      for (const st of signTests) {
        it(st.name, async () => {
          const ctx = await setup();
          const data: ClaimData = {
            sender: ctx.w1.address,
            chainId: network.config.chainId!,
            amount: 999,
            claimId: 33,
            expiry: 5555,
          };

          const claimData = st.modifyClaim(data);
          const signature = await signClaim(ctx.signer, claimData);

          const tx = ctx.NogsRewarder.connect(ctx.w1).claim(
            data.claimId,
            data.amount,
            data.expiry,
            signature
          );

          await expect(tx).to.be.revertedWith(/invalid signature/);
        });
      }
    });

    it("reverts when the claim is expired", async () => {
      const ctx = await setup();
      const timestamp = await time.latest();

      const data = {
        sender: ctx.w1.address,
        chainId: network.config.chainId!,
        amount: 999,
        claimId: 33,
        expiry: timestamp - 100,
      };

      const signature = await signClaim(ctx.signer, data);

      const tx = ctx.NogsRewarder.connect(ctx.w1).claim(
        data.claimId,
        data.amount,
        data.expiry,
        signature
      );

      await expect(tx).to.be.revertedWith(/claim expired/);
    });

    it("revents when the claim is already claimed", async () => {
      const ctx = await setup();
      const timestamp = await time.latest();

      const data = {
        sender: ctx.w1.address,
        chainId: network.config.chainId!,
        amount: 999,
        claimId: 33,
        expiry: timestamp + 100,
      };

      const signature = await signClaim(ctx.signer, data);

      await ctx.NogsRewarder.connect(ctx.w1).claim(
        data.claimId,
        data.amount,
        data.expiry,
        signature
      );

      const tx = ctx.NogsRewarder.connect(ctx.w1).claim(
        data.claimId,
        data.amount,
        data.expiry,
        signature
      );

      await expect(tx).to.be.revertedWith(/already claimed/);
    });

    describe("successful claim", () => {
      let tx: ContractTransaction;
      let ctx: Awaited<ReturnType<typeof setup>>;
      const claimId = 33;
      const claimAmount = 999;

      before(async () => {
        ctx = await setup();
      });

      it("does not revert", async () => {
        const timestamp = await time.latest();
        const data = {
          sender: ctx.w1.address,
          chainId: network.config.chainId!,
          amount: claimAmount,
          claimId,
          expiry: timestamp + 100,
        };

        const signature = await signClaim(ctx.signer, data);

        const pendingTx = ctx.NogsRewarder.connect(ctx.w1).claim(
          data.claimId,
          data.amount,
          data.expiry,
          signature
        );

        await expect(pendingTx).to.not.be.reverted;

        tx = await pendingTx;
      });

      it("emits an event", async () => {
        await expect(tx)
          .to.emit(ctx.NogsRewarder, "RewardClaimed")
          .withArgs(ctx.w1.address, claimId, claimAmount);
      });

      it("transfers the amount to the claimer", async () => {
        const balance = await ctx.DummyERC20.balanceOf(ctx.w1.address);
        expect(balance).to.eq(claimAmount);
      });

      it("marks the claim as used", async () => {
        const used = await ctx.NogsRewarder.claimUsed(claimId);
        expect(used).to.be.true;
      });
    });

    describe("claimUsed", () => {
      it("returns false for unused claims", async () => {
        const ctx = await setup();
        const used = await ctx.NogsRewarder.claimUsed(4);
        expect(used).to.be.false;
      });
    });
  });
});
