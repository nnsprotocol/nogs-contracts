import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, BigNumberish, ContractTransaction, Signer } from "ethers";
import { ethers } from "hardhat";
import { setup } from "./utils";

async function signWithdraw(
  signer: Signer,
  data: {
    sender: string;
    value: BigNumberish;
    nonce: BigNumberish;
    expiry: BigNumberish;
  }
) {
  const hash = ethers.utils.solidityKeccak256(
    // sender, value, nonce, expiry
    ["address", "uint256", "uint256", "uint256"],
    [data.sender, data.value, data.nonce, data.expiry]
  );
  return await signer.signMessage(ethers.utils.arrayify(hash));
}

describe("NNSStaking", () => {
  describe("stake", () => {
    it("reverts when a token doesn't exist", async () => {
      const ctx = await setup();

      await expect(ctx.NNSStaking.stake([0])).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
    });

    it("reverts when sender is not the owner", async () => {
      const ctx = await setup();
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);

      await expect(
        ctx.NNSStaking.connect(ctx.w2).stake([333])
      ).to.be.revertedWith("you do not own this nft");
    });

    it("reverts when staking contract is not approved for transfer", async () => {
      const ctx = await setup();
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);

      await expect(
        ctx.NNSStaking.connect(ctx.w1).stake([333])
      ).to.be.revertedWith("ERC721: caller is not token owner or approved");
    });

    it("reverts when staking twice", async () => {
      const ctx = await setup();
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.w1).approve(ctx.NNSStaking.address, 333);

      await ctx.NNSStaking.connect(ctx.w1).stake([333]);
      const op = ctx.NNSStaking.connect(ctx.w1).stake([333]);

      await expect(op).to.be.revertedWith("you do not own this nft");
    });

    it("reverts when multiple tokens and one fails", async () => {
      const ctx = await setup();
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.w1).approve(ctx.NNSStaking.address, 333);

      const op = ctx.NNSStaking.connect(ctx.w1).stake([333, 666]);

      await expect(op).to.be.revertedWith("ERC721: invalid token ID"); // 666 does not exist
      expect(await ctx.DummyNFT.ownerOf(333)).to.eq(ctx.w1.address); // NFT hasn't been transferred
      const [stakes] = await ctx.NNSStaking.getStakes(ctx.w1.address);
      expect(stakes).to.have.lengthOf(0);
    });

    describe("on success", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let stakeTx: ContractTransaction;
      let stakeTime: number;

      beforeEach(async () => {
        ctx = await setup();
        await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
        await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 666);
        await ctx.DummyNFT.connect(ctx.w1).setApprovalForAll(
          ctx.NNSStaking.address,
          true
        );

        await time.increase(1000);

        stakeTx = await ctx.NNSStaking.connect(ctx.w1).stake([333, 666]);
        stakeTime = await time.latest();
      });

      it("transfers nfts to contract", async () => {
        expect(await ctx.DummyNFT.ownerOf(333)).to.eq(ctx.NNSStaking.address);
        expect(await ctx.DummyNFT.ownerOf(666)).to.eq(ctx.NNSStaking.address);
      });

      it("saves one stake with start time per nft", async () => {
        const [stakes] = await ctx.NNSStaking.getStakes(ctx.w1.address);

        expect(stakes).to.have.lengthOf(2);
        expect(stakes[0].tokenId).to.eq(333);
        expect(stakes[0].startTime).to.eq(stakeTime);
        expect(stakes[0].endTime).to.eq(0);
        expect(stakes[1].tokenId).to.eq(666);
        expect(stakes[1].startTime).to.eq(stakeTime);
        expect(stakes[1].endTime).to.eq(0);
      });

      it("emits a Staked event per nft", async () => {
        await expect(stakeTx)
          .to.emit(ctx.NNSStaking, "Staked")
          .withArgs(ctx.w1.address, 333, BigNumber.from(stakeTime));

        await expect(stakeTx)
          .to.emit(ctx.NNSStaking, "Staked")
          .withArgs(ctx.w1.address, 666, BigNumber.from(stakeTime));
      });
    });
  });

  describe("unstake", () => {
    it("reverts when unstaking a token that is not staked", async () => {
      const ctx = await setup();

      const op = ctx.NNSStaking.unstake([0]);

      await expect(op).to.be.revertedWith("no stake to withdraw");
    });

    it("reverts when unstaking someone else's stake", async () => {
      const ctx = await setup();
      // w1 stakes 333
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.w1).approve(ctx.NNSStaking.address, 333);
      await ctx.NNSStaking.connect(ctx.w1).stake([333]);

      // w2 tries to unstake
      const op = ctx.NNSStaking.connect(ctx.w2).unstake([333]);

      await expect(op).to.be.revertedWith("no stake to withdraw");
    });

    it("reverts when unstaking twice", async () => {
      const ctx = await setup();

      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.w1).approve(ctx.NNSStaking.address, 333);
      await ctx.NNSStaking.connect(ctx.w1).stake([333]);

      await ctx.NNSStaking.connect(ctx.w1).unstake([333]);
      const op = ctx.NNSStaking.connect(ctx.w1).unstake([333]);

      await expect(op).to.be.revertedWith("stake already withdrawn");
    });

    it("reverts when one unstaking fails", async () => {
      const ctx = await setup();

      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.w1).approve(ctx.NNSStaking.address, 333);
      await ctx.NNSStaking.connect(ctx.w1).stake([333]);

      const op = ctx.NNSStaking.connect(ctx.w1).unstake([333, 666]); // 666 doesn't exist

      await expect(op).to.be.revertedWith("no stake to withdraw");
      expect(await ctx.DummyNFT.ownerOf(333)).to.eq(ctx.NNSStaking.address); // no transfer
    });

    describe("on success", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let stakeTime: number;
      let unstakeTx: ContractTransaction;
      let unstakeTime: number;

      beforeEach(async () => {
        ctx = await setup();
        await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
        await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 666);
        await ctx.DummyNFT.connect(ctx.w1).setApprovalForAll(
          ctx.NNSStaking.address,
          true
        );
        await ctx.NNSStaking.connect(ctx.w1).stake([333, 666]);
        stakeTime = await time.latest();

        await time.increase(10000);
        unstakeTx = await ctx.NNSStaking.connect(ctx.w1).unstake([333, 666]);
        unstakeTime = await time.latest();
      });

      it("transfers nft back to original owner", async () => {
        expect(await ctx.DummyNFT.ownerOf(333)).to.eq(ctx.w1.address);
        expect(await ctx.DummyNFT.ownerOf(666)).to.eq(ctx.w1.address);
      });

      it("updates the stake with end time", async () => {
        const [stakes] = await ctx.NNSStaking.getStakes(ctx.w1.address);

        expect(stakes).to.have.lengthOf(2);
        expect(stakes[0].tokenId).to.eq(333);
        expect(stakes[0].startTime).to.eq(stakeTime);
        expect(stakes[0].endTime).to.eq(unstakeTime);
        expect(stakes[1].tokenId).to.eq(666);
        expect(stakes[1].startTime).to.eq(stakeTime);
        expect(stakes[1].endTime).to.eq(unstakeTime);
      });

      it("emits a Unstaked event", async () => {
        await expect(unstakeTx)
          .to.emit(ctx.NNSStaking, "Unstaked")
          .withArgs(
            ctx.w1.address,
            333,
            BigNumber.from(stakeTime),
            BigNumber.from(unstakeTime)
          );

        await expect(unstakeTx)
          .to.emit(ctx.NNSStaking, "Unstaked")
          .withArgs(
            ctx.w1.address,
            666,
            BigNumber.from(stakeTime),
            BigNumber.from(unstakeTime)
          );
      });
    });
  });

  describe("withdraw", () => {
    it("reverts on bad signature", async () => {
      const ctx = await setup();

      const op = ctx.NNSStaking.withdraw(123, 999, Date.now(), "0x00");

      await expect(op).to.be.revertedWith("ECDSA: invalid signature length");
    });

    it("reverts when value has been tampered with", async () => {
      const ctx = await setup();
      let data = {
        expiry: Date.now() + 100000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 999,
      };
      const signature = await signWithdraw(ctx.signer, data);

      data.value = 5;
      const op = ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      await expect(op).to.be.revertedWith("invalid signature");
    });

    it("reverts when nonce has been tampered with", async () => {
      const ctx = await setup();
      let data = {
        expiry: Date.now() + 100000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 999,
      };
      const signature = await signWithdraw(ctx.signer, data);

      data.nonce = 5;
      const op = ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      await expect(op).to.be.revertedWith("invalid signature");
    });

    it("reverts when the sender is different", async () => {
      const ctx = await setup();
      let data = {
        expiry: Date.now() + 100000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 999,
      };
      const signature = await signWithdraw(ctx.signer, data);

      const op = ctx.NNSStaking.connect(ctx.w2).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      await expect(op).to.be.revertedWith("invalid signature");
    });

    it("reverts when expired", async () => {
      const ctx = await setup();
      let data = {
        expiry: (await time.latest()) - 1000000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 999,
      };
      const signature = await signWithdraw(ctx.signer, data);

      const op = ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      await expect(op).to.be.revertedWith("expired");
    });

    it("reverts when differnt signer", async () => {
      const ctx = await setup();
      let data = {
        expiry: Date.now() + 1000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 999,
      };
      const signature = await signWithdraw(ctx.w2, data);

      const op = ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      await expect(op).to.be.revertedWith("invalid signature");
    });

    it("reverts when using the same nonce twice", async () => {
      const ctx = await setup();
      const data = {
        expiry: Date.now() + 1000,
        nonce: 123,
        sender: ctx.w1.address,
        value: 100,
      };
      const signature = await signWithdraw(ctx.signer, data);
      await ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );

      const op = ctx.NNSStaking.connect(ctx.w1).withdraw(
        data.value,
        data.nonce,
        data.expiry,
        signature
      );
      await expect(op).to.revertedWith("nonce already used");
    });

    describe("on success", () => {
      let ctx: Awaited<ReturnType<typeof setup>>;
      let tx: ContractTransaction;
      let originalContractBalance: BigNumber;
      const value = 999666333;

      beforeEach(async () => {
        ctx = await setup();

        originalContractBalance = await ctx.Noggles.balanceOf(
          ctx.NNSStaking.address
        );

        const data = {
          expiry: Date.now() + 1000,
          nonce: 123,
          sender: ctx.w1.address,
          value,
        };
        const signature = await signWithdraw(ctx.signer, data);
        tx = await ctx.NNSStaking.connect(ctx.w1).withdraw(
          data.value,
          data.nonce,
          data.expiry,
          signature
        );
      });

      it("tranfers value to the sender", async () => {
        expect(await ctx.Noggles.balanceOf(ctx.w1.address)).to.eq(value);
        expect(await ctx.Noggles.balanceOf(ctx.NNSStaking.address)).to.eq(
          originalContractBalance.sub(value)
        );
      });

      it("emits a Rewarded event", async () => {
        await expect(tx)
          .to.emit(ctx.NNSStaking, "Rewarded")
          .withArgs(ctx.w1.address, BigNumber.from(value));
      });

      it("sets the lastWithdraw time", async () => {
        const [_, lastWithdraw] = await ctx.NNSStaking.getStakes(
          ctx.w1.address
        );
        expect(lastWithdraw).to.eq(await time.latest());
      });
    });
  });

  describe("scenarios", () => {
    it("stake, unstake and withdraw", async () => {
      const ctx = await setup();
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 333);
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 666);
      await ctx.DummyNFT.connect(ctx.owner).safeMint(ctx.w1.address, 999);
      await ctx.DummyNFT.connect(ctx.w1).setApprovalForAll(
        ctx.NNSStaking.address,
        true
      );

      const times: number[] = [];

      // Stake/unstake the first time.
      await ctx.NNSStaking.connect(ctx.w1).stake([333, 666]);
      times.push(await time.latest());
      await time.increase(10000);
      await ctx.NNSStaking.connect(ctx.w1).unstake([333, 666]);
      times.push(await time.latest());
      await time.increase(10000);

      // Stake/unstake the second time.
      await ctx.NNSStaking.connect(ctx.w1).stake([333, 999]);
      times.push(await time.latest());
      await time.increase(10000);
      await ctx.NNSStaking.connect(ctx.w1).unstake([333]);
      times.push(await time.latest());

      let [stakes, lastWithdraw] = await ctx.NNSStaking.getStakes(
        ctx.w1.address
      );
      expect(stakes).to.have.lengthOf(4);
      // 333 and 666 have been staked times[0]->times[1]
      expect(stakes[0].tokenId).to.eq(333);
      expect(stakes[0].startTime).to.eq(times[0]);
      expect(stakes[0].endTime).to.eq(times[1]);
      expect(stakes[1].tokenId).to.eq(666);
      expect(stakes[1].startTime).to.eq(times[0]);
      expect(stakes[1].endTime).to.eq(times[1]);
      // 333 has been staked again from times[2]->times[3]
      expect(stakes[2].tokenId).to.eq(333);
      expect(stakes[2].startTime).to.eq(times[2]);
      expect(stakes[2].endTime).to.eq(times[3]);
      /// 999 has been staked from times[2] and never unstaked
      expect(stakes[3].tokenId).to.eq(999);
      expect(stakes[3].startTime).to.eq(times[2]);
      expect(stakes[3].endTime).to.eq(0);
      // Never withdraw so far.
      expect(lastWithdraw).to.eq(0);

      // Withdraw
      const expiry = Date.now() + 1000;
      await ctx.NNSStaking.connect(ctx.w1).withdraw(
        100,
        999,
        expiry,
        await signWithdraw(ctx.signer, {
          sender: ctx.w1.address,
          expiry: expiry,
          nonce: 999,
          value: 100,
        })
      );
      [, lastWithdraw] = await ctx.NNSStaking.getStakes(ctx.w1.address);
      expect(lastWithdraw).to.eq(await time.latest());
      expect(await ctx.Noggles.balanceOf(ctx.w1.address)).to.eq(100);
    });
  });
});
