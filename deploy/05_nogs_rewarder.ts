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

export default async function nogsRewarder(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("nogsRewarder", input.verbose);

  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "NogsRewarder");
  }

  l.info("NogsRewarder - start deployment");
  const NogsRewarder = await hre.ethers.getContractFactory("NogsRewarder");
  const rewarder = await hre.upgrades.deployProxy(
    NogsRewarder.connect(input.deployer),
    [input.Noggles.address, input.signer]
  );
  l.info(`NogsRewarder - tx: ${rewarder.deployTransaction.hash}`);
  await rewarder.deployed();
  l.info(`NogsRewarder - deployed: ${rewarder.address}`);
  if (input.save) {
    await saveDeployment(hre.network.name, "NogsRewarder", rewarder);
  }

  return;
}
