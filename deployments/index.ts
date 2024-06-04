import fs from "fs/promises";
import path from "path";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  DummyNFT,
  NNSStaking,
  NNSStakingAirdrop,
  Noggles,
} from "../typechain-types";

export async function getContract<T>(
  hre: HardhatRuntimeEnvironment,
  name: string,
  network?: string
): Promise<T> {
  const file = await fs.readFile(
    path.join(
      __dirname,
      "..",
      "deployments",
      network || hre.network.name,
      `${name}.json`
    ),
    "utf8"
  );
  const d = JSON.parse(file);
  if (!("address" in d)) {
    throw new Error(`contract deployment not found for ${name}`);
  }
  return <T>await hre.ethers.getContractAt(name, d.address);
}

export async function getDummyNFTContract(
  hre: HardhatRuntimeEnvironment
): Promise<DummyNFT> {
  return await getContract<DummyNFT>(hre, "DummyNFT");
}

export async function getNogglesContract(
  hre: HardhatRuntimeEnvironment,
  network?: string
): Promise<Noggles> {
  return await getContract<Noggles>(hre, "Noggles", network);
}

export async function getNNSStakingContract(
  hre: HardhatRuntimeEnvironment
): Promise<NNSStaking> {
  return await getContract<NNSStaking>(hre, "NNSStaking");
}

export async function getNNSStakingAirdropContract(
  hre: HardhatRuntimeEnvironment
): Promise<NNSStakingAirdrop> {
  return await getContract<NNSStakingAirdrop>(hre, "NNSStakingAirdrop");
}
