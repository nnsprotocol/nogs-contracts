import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ensureNotDeployed, logger, saveDeployment } from "./utils";
import { Noggles } from "../typechain-types";

const OPTIMISM_MINTABLE_ERC20_CREATED =
  "0x52fe89dd5930f343d25650b62fd367bae47088bcddffd2a88350a6ecdd620cdb";

interface Input {
  deployer: Signer;
  Noggles: Noggles;
  verbose?: boolean;
  save?: boolean;
  force?: boolean;
}

export default async function nogglesBaseBridge(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const l = logger("nogglesBaseBridge", input.verbose);

  if (!hre.network.name.includes("base")) {
    throw new Error("network must be Base");
  }

  if (!input.force) {
    await ensureNotDeployed(hre.network.name, "Noggles");
  }

  // https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/universal/OptimismMintableERC20Factory.sol
  const ERC20Factory = new hre.ethers.Contract(
    "0x4200000000000000000000000000000000000012",
    [
      "function createOptimismMintableERC20(address _remoteToken, string _name, string _symbol)",
    ]
  );

  const name = "Noggles";
  const symbol = "NOGS";
  const address = input.Noggles.address;

  l.info("Bridge - creating bridge");
  const tx = await ERC20Factory.connect(
    input.deployer
  ).createOptimismMintableERC20(address, name, symbol);

  await tx.wait();

  const receipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);

  const created = receipt.logs.find(
    (l) => l.topics[0] === OPTIMISM_MINTABLE_ERC20_CREATED
  );
  const deployedAddress = "0x" + created!.topics[1].slice(-40);

  l.info("Bridge - deployed");
  if (input.save) {
    await saveDeployment(hre.network.name, "Noggles", {
      address: deployedAddress,
      deployTransaction: tx,
    });
  }

  return {};
}
