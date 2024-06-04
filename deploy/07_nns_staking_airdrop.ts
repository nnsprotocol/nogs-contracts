import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ensureNotDeployed, logger, saveDeployment } from "./utils";
import { Noggles } from "../typechain-types";

interface Input {
  deployer: Signer;
  Noggles: Noggles;
  signer: string;
  verbose?: boolean;
  save?: boolean;
  force?: boolean;
}

export default async function nogsTippingPool(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("nnsStakingAirdrop", input.verbose);

  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "NNSStakingAirdrop");
  }

  l.info("NNSStakingAirdrop - start deployment");
  const NNSStakingAirdrop = await hre.ethers.getContractFactory(
    "NNSStakingAirdrop"
  );
  const airdrop = await NNSStakingAirdrop.connect(input.deployer).deploy(
    input.Noggles.address
  );
  l.info(`NNSStakingAirdrop - tx: ${airdrop.deployTransaction.hash}`);
  await airdrop.deployed();
  l.info(`NNSStakingAirdrop - deployed: ${airdrop.address}`);
  if (input.save) {
    await saveDeployment(hre.network.name, "NNSStakingAirdrop", airdrop);
  }

  return;
}
