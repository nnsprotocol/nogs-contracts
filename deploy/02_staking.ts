import { BigNumber, Signer } from "ethers";
import {
  NOGGLES_UNIT,
  ensureNotDeployed,
  logger,
  saveDeployment,
} from "./utils";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Noggles } from "../typechain-types";

interface Input {
  signer: string;
  deployer: Signer;
  Noggles: Noggles;
  supply: BigNumber;
  nftAddress?: string;
  verbose?: boolean;
  save?: boolean;
  force?: boolean;
}

export default async function staking(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("staking", input.verbose);
  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "NNSStaking");
  }

  const NNSStaking = await hre.ethers.getContractFactory("NNSStaking");
  let { nftAddress } = input;
  if (!nftAddress) {
    l.info("DummyNFT - start deployment");
    const DummyNFT = await hre.ethers.getContractFactory("DummyNFT");
    const nft = await DummyNFT.connect(input.deployer).deploy();
    l.info(`DummyNFT - tx: ${nft.deployTransaction.hash}`);
    await nft.deployed();
    nftAddress = nft.address;
    l.info(`DummyNFT - deployed: ${nft.address}`);
    if (input.save) {
      await saveDeployment(hre.network.name, "DummyNFT", nft);
    }
  }

  l.info("NNSStaking - start deployment");
  const staking = await hre.upgrades.deployProxy(
    NNSStaking.connect(input.deployer),
    [nftAddress, input.Noggles.address, input.signer]
  );
  l.info(`NNSStaking - tx: ${staking.deployTransaction.hash}`);
  await staking.deployed();
  l.info(`NNSStaking - deployed: ${staking.address}`);
  if (input.save) {
    await saveDeployment(hre.network.name, "NNSStaking", staking);
  }

  l.info("transferring Noggles to NNSStaking");
  await input.Noggles.connect(input.deployer).transfer(
    staking.address,
    input.supply.mul(NOGGLES_UNIT)
  );

  return {
    NNSStaking: staking.address,
    NFT: nftAddress,
  };
}
