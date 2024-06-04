import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Noggles, Vesting } from "../typechain-types";
import { ensureNotDeployed, logger, saveDeployment } from "./utils";

interface Input {
  deployer: Signer;
  verbose?: boolean;
  save?: boolean;
  force?: boolean;
}

export default async function noggles(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("noggles", input.verbose);

  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "Noggles");
  }

  const Noggles = await hre.ethers.getContractFactory("Noggles");

  l.info("Noggles - start deployment");
  const coin = <Noggles>await Noggles.connect(input.deployer).deploy();
  l.info(`Noggles - tx: ${coin.deployTransaction.hash}`);
  await coin.deployed();
  l.info(`Noggles - deployed: ${coin.address}`);
  if (input.save) {
    await saveDeployment(hre.network.name, "Noggles", coin);
  }

  return {
    Noggles: coin.address,
  };
}
