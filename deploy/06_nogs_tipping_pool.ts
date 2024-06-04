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
  const l = logger("nogsTippingPool", input.verbose);

  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "NogsTippingPool");
  }

  l.info("NogsTippingPool - start deployment");
  const NogsTippingPool = await hre.ethers.getContractFactory(
    "NogsTippingPool"
  );
  const rewarder = await hre.upgrades.deployProxy(
    NogsTippingPool.connect(input.deployer),
    [input.Noggles.address, input.signer]
  );
  l.info(`NogsTippingPool - tx: ${rewarder.deployTransaction.hash}`);
  await rewarder.deployed();
  l.info(`NogsTippingPool - deployed: ${rewarder.address}`);
  if (input.save) {
    await saveDeployment(hre.network.name, "NogsTippingPool", rewarder);
  }

  return;
}
