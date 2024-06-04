import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import deploy from "../deploy";
import { DummyNFT, NNSStaking, Noggles } from "../typechain-types";

export async function setup() {
  const [owner, signer, w1, w2] = await ethers.getSigners();

  const { Noggles: noggles } = await deploy["01_noggles"](hre, {
    deployer: owner,
  });
  const Noggles = <Noggles>await ethers.getContractAt("Noggles", noggles);
  const { NFT: nft, NNSStaking: staking } = await deploy["02_staking"](hre, {
    deployer: owner,
    Noggles: Noggles,
    signer: signer.address,
    supply: BigNumber.from("1000000"),
  });

  const DummyNFT = <DummyNFT>await ethers.getContractAt("DummyNFT", nft);
  const NNSStaking = <NNSStaking>(
    await ethers.getContractAt("NNSStaking", staking)
  );

  return { DummyNFT, Noggles, NNSStaking, signer, owner, w1, w2 };
}
