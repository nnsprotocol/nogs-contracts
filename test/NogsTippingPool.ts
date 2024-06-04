import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, ContractTransaction, Signer } from "ethers";
import { ethers, network } from "hardhat";
import { DummyERC20, NogsTippingPool } from "../typechain-types";

async function setup() {
  const [owner, signer, w1, w2] = await ethers.getSigners();

  const erc20Factory = await ethers.getContractFactory("DummyERC20");
  const DummyERC20 = <DummyERC20>await erc20Factory.connect(owner).deploy();

  const poolFactory = await ethers.getContractFactory("NogsTippingPool");
  const NogsTippingPool = <NogsTippingPool>(
    await poolFactory.connect(owner).deploy()
  );
  await NogsTippingPool.initialize(DummyERC20.address, signer.address);
  await DummyERC20.mint(NogsTippingPool.address, 10000);

  return {
    owner,
    signer,
    w1,
    w2,
    DummyERC20,
    NogsTippingPool,
  };
}

async function signWithdrawal(
  signer: Signer,
  data: {
    sender: string;
    chainId: number;
    amount: BigNumberish;
    withdrawalId: BigNumberish;
    expiry: number;
  }
) {
  const hash = ethers.utils.solidityKeccak256(
    ["address", "uint256", "uint256", "uint256", "uint256"],
    [data.sender, data.chainId, data.withdrawalId, data.amount, data.expiry]
  );
  return await signer.signMessage(ethers.utils.arrayify(hash));
}

describe("NogsTippingPool", () => {
  describe("erc20", () => {
    it("returns the erc20 contract address", async () => {
      const ctx = await setup();
      const addr = await ctx.NogsTippingPool.erc20();
      expect(addr).to.eq(ctx.DummyERC20.address);
    });
  });

  describe("updateSigner", () => {
    it("reverts when called not by the owner", async () => {
      const ctx = await setup();
      const op = ctx.NogsTippingPool.connect(ctx.w1).updateSigner(
        ctx.w2.address
      );
      await expect(op).to.be.revertedWith(/not the owner/);
    });

    it("updates the signer when called by the owner", async () => {
      const ctx = await setup();
      await ctx.NogsTippingPool.connect(ctx.owner).updateSigner(ctx.w2.address);

      const newSigner = await ctx.NogsTippingPool.withdrawalSigner();
      expect(newSigner).to.eq(ctx.w2.address);
    });
  });

  describe("withdraw", () => {
    describe("invalid signatures", () => {
      type WithdrawalData = Parameters<typeof signWithdrawal>[1];
      const signTests = [
        {
          name: "wrong sender",
          modifyWithdrawal: (data: WithdrawalData) => ({
            ...data,
            sender: ethers.constants.AddressZero,
          }),
        },
        {
          name: "wrong chain",
          modifyWithdrawal: (data: WithdrawalData) => ({
            ...data,
            chainId: 666,
          }),
        },
        {
          name: "wrong withdrawal id",
          modifyWithdrawal: (data: WithdrawalData) => ({
            ...data,
            withdrawalId: 666,
          }),
        },
        {
          name: "wrong amount",
          modifyWithdrawal: (data: WithdrawalData) => ({
            ...data,
            amount: 666,
          }),
        },
        {
          name: "wrong expiry",
          modifyWithdrawal: (data: WithdrawalData) => ({
            ...data,
            expiry: 666,
          }),
        },
      ];

      for (const st of signTests) {
        it(st.name, async () => {
          const ctx = await setup();
          const data: WithdrawalData = {
            sender: ctx.w1.address,
            chainId: network.config.chainId!,
            amount: 999,
            withdrawalId: 33,
            expiry: 5555,
          };

          const withdrawalData = st.modifyWithdrawal(data);
          const signature = await signWithdrawal(ctx.signer, withdrawalData);

          const tx = ctx.NogsTippingPool.connect(ctx.w1).withdraw(
            data.withdrawalId,
            data.amount,
            data.expiry,
            signature
          );

          await expect(tx).to.be.revertedWith(/invalid signature/);
        });
      }
    });

    it("reverts when the withdrawal is expired", async () => {
      const ctx = await setup();
      const timestamp = await time.latest();

      const data = {
        sender: ctx.w1.address,
        chainId: network.config.chainId!,
        amount: 999,
        withdrawalId: 33,
        expiry: timestamp - 100,
      };

      const signature = await signWithdrawal(ctx.signer, data);

      const tx = ctx.NogsTippingPool.connect(ctx.w1).withdraw(
        data.withdrawalId,
        data.amount,
        data.expiry,
        signature
      );

      await expect(tx).to.be.revertedWith(/withdraw expired/);
    });

    it("revents when the claim is already claimed", async () => {
      const ctx = await setup();
      const timestamp = await time.latest();

      const data = {
        sender: ctx.w1.address,
        chainId: network.config.chainId!,
        amount: 999,
        withdrawalId: 33,
        expiry: timestamp + 100,
      };

      const signature = await signWithdrawal(ctx.signer, data);

      await ctx.NogsTippingPool.connect(ctx.w1).withdraw(
        data.withdrawalId,
        data.amount,
        data.expiry,
        signature
      );

      const tx = ctx.NogsTippingPool.connect(ctx.w1).withdraw(
        data.withdrawalId,
        data.amount,
        data.expiry,
        signature
      );

      await expect(tx).to.be.revertedWith(/already withdrawn/);
    });

    describe("successful withdrawal", () => {
      let tx: ContractTransaction;
      let ctx: Awaited<ReturnType<typeof setup>>;
      const withdrawalId = 33;
      const withdrawalAmount = 999;

      before(async () => {
        ctx = await setup();
      });

      it("does not revert", async () => {
        const timestamp = await time.latest();
        const data = {
          sender: ctx.w1.address,
          chainId: network.config.chainId!,
          amount: withdrawalAmount,
          withdrawalId,
          expiry: timestamp + 100,
        };

        const signature = await signWithdrawal(ctx.signer, data);

        const pendingTx = ctx.NogsTippingPool.connect(ctx.w1).withdraw(
          data.withdrawalId,
          data.amount,
          data.expiry,
          signature
        );

        await expect(pendingTx).to.not.be.reverted;

        tx = await pendingTx;
      });

      it("emits an event", async () => {
        await expect(tx)
          .to.emit(ctx.NogsTippingPool, "Withdrawal")
          .withArgs(ctx.w1.address, withdrawalId, withdrawalAmount);
      });

      it("transfers the amount to the claimer", async () => {
        const balance = await ctx.DummyERC20.balanceOf(ctx.w1.address);
        expect(balance).to.eq(withdrawalAmount);
      });

      it("marks the claim as used", async () => {
        const used = await ctx.NogsTippingPool.withdrawalUsed(withdrawalId);
        expect(used).to.be.true;
      });
    });

    describe("withdrawalUsed", () => {
      it("returns false for unused claims", async () => {
        const ctx = await setup();
        const used = await ctx.NogsTippingPool.withdrawalUsed(4);
        expect(used).to.be.false;
      });
    });
  });

  describe("deposit", () => {
    it("transfers ERC20 to the contract", async () => {
      const ctx = await setup();
      const initalBalance = await ctx.DummyERC20.balanceOf(
        ctx.NogsTippingPool.address
      );

      const amount = 1000;
      await ctx.DummyERC20.connect(ctx.owner).mint(ctx.w2.address, amount);
      await ctx.DummyERC20.connect(ctx.w2).approve(
        ctx.NogsTippingPool.address,
        amount
      );
      await ctx.NogsTippingPool.connect(ctx.w2).deposit(amount);

      const balance = await ctx.DummyERC20.balanceOf(
        ctx.NogsTippingPool.address
      );
      expect(balance).to.eq(initalBalance.add(amount));
    });
  });

  describe("balance", () => {
    let ctx: Awaited<ReturnType<typeof setup>>;

    async function deposit(amount: number) {
      await ctx.DummyERC20.connect(ctx.owner).mint(ctx.w2.address, amount);
      await ctx.DummyERC20.connect(ctx.w2).approve(
        ctx.NogsTippingPool.address,
        amount
      );

      const txTime = (await time.latest()) + 1000;
      await time.setNextBlockTimestamp(txTime);
      await ctx.NogsTippingPool.connect(ctx.w2).deposit(amount);
      return txTime;
    }

    before(async () => {
      ctx = await setup();
    });

    it("is initially zero", async () => {
      const b = await ctx.NogsTippingPool.balance(ctx.w2.address);
      expect(b.balance).to.eq(0);
      expect(b.lastWithdrawalTimestamp).to.eq(0);
    });

    it("is increased every time ERC20 are deposited - lastWithdrawalTimestamp does not change - first time", async () => {
      await deposit(1453);
      const b = await ctx.NogsTippingPool.balance(ctx.w2.address);
      expect(b.balance).to.eq(1453);
      expect(b.lastWithdrawalTimestamp).to.eq(0);
    });

    it("is increased every time ERC20 are deposited - lastWithdrawalTimestamp does not change - second time", async () => {
      await deposit(5645);
      const b = await ctx.NogsTippingPool.balance(ctx.w2.address);
      expect(b.balance).to.eq(1453 + 5645);
      expect(b.lastWithdrawalTimestamp).to.eq(0);
    });

    it("is reset on withdrawal - lastWithdrawalTimestamp is updated", async () => {
      const data = {
        sender: ctx.w2.address,
        chainId: network.config.chainId!,
        amount: 1,
        withdrawalId: 33,
        expiry: (await time.latest()) + 100,
      };

      const signature = await signWithdrawal(ctx.signer, data);
      const txTimestamp = (await time.latest()) + 4;
      await time.setNextBlockTimestamp(txTimestamp);
      await ctx.NogsTippingPool.connect(ctx.w2).withdraw(
        data.withdrawalId,
        data.amount,
        data.expiry,
        signature
      );

      const b = await ctx.NogsTippingPool.balance(ctx.w2.address);
      expect(b.balance).to.eq(0);
      expect(b.lastWithdrawalTimestamp).to.eq(txTimestamp);
    });

    it("lastWithdrawalTimestamp does not change on deposit", async () => {
      const original = await ctx.NogsTippingPool.balance(ctx.w2.address);

      await deposit(10);
      const b = await ctx.NogsTippingPool.balance(ctx.w2.address);
      expect(b.balance).to.eq(Number(original.balance) + 10);
      expect(b.lastWithdrawalTimestamp).to.eq(original.lastWithdrawalTimestamp);
    });
  });
});
