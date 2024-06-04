import { BigNumber, Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Noggles, Vesting } from "../typechain-types";
import {
  NOGGLES_UNIT,
  ensureNotDeployed,
  logger,
  saveDeployment,
} from "./utils";

export interface VestedAllocation {
  name: string;
  beneficiary: string;
  amount: BigNumber;
  start: number; // timestamp in seconds
  cliffInSeconds: number;
  durationInSeconds: number;
}

interface Input {
  deployer: Signer;
  allocations: VestedAllocation[];
  Noggles: Noggles;
  verbose?: boolean;
  save?: boolean;
  force?: boolean;
}

export default async function vesting(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("vesting", input.verbose);

  if (!input.force) {
    for (const a of input.allocations) {
      await ensureNotDeployed(hre.network.name, deploymentName(a.name));
    }
  }

  const contracts: Record<string, Vesting> = {};
  for (const a of input.allocations) {
    l.info(`${a.name} - start deployment`);
    const Vesting = await hre.ethers.getContractFactory("Vesting");
    const contract = <Vesting>(
      await Vesting.connect(input.deployer).deploy(
        a.beneficiary,
        a.start,
        a.cliffInSeconds,
        a.durationInSeconds
      )
    );
    l.info(`${a.name} - tx: ${contract.deployTransaction.hash}`);
    await contract.deployed();
    l.info(`${a.name} - deployed: ${contract.address}`);
    if (input.save) {
      await saveDeployment(hre.network.name, deploymentName(a.name), contract);
    }

    l.info(
      `${a.name} - transferring Noggles to Vesting contract: ${contract.address}`
    );
    await input.Noggles.connect(input.deployer).transfer(
      contract.address,
      a.amount.mul(NOGGLES_UNIT)
    );

    contracts[a.name] = contract;
  }

  return contracts;
}

function deploymentName(name: string): string {
  return `Vesting_${name}`;
}
