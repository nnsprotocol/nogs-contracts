import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import l1BridgeAbi from "./abi/l1standardbridge.json";
import { Noggles } from "../typechain-types";
import { BigNumber } from "ethers";

interface Input {
  signer: SignerWithAddress;
  l1StandardBridge: string;
  amount: BigNumber;
  Noggles: Noggles;
  BaseNoggles: Noggles;
}

export default async function bridgeNOGS(
  hre: HardhatRuntimeEnvironment,
  input: Input
) {
  const bridgeContract = new hre.ethers.Contract(
    input.l1StandardBridge,
    l1BridgeAbi,
    input.signer
  );

  const allowance = await input.Noggles.connect(input.signer).allowance(
    await input.signer.getAddress(),
    input.l1StandardBridge
  );
  if (allowance < input.amount) {
    console.log(`[BASE-BRIDGE]: approving transfer`);
    const approveResult = await input.Noggles.connect(input.signer).approve(
      input.l1StandardBridge,
      input.amount
    );
    console.log(`[BASE-BRIDGE]: approving transfer tx ${approveResult.hash}`);
    await approveResult.wait();
    console.log(`[BASE-BRIDGE]: approving transfer done`);
  }

  const bridgeResult = await bridgeContract
    .connect(input.signer)
    .depositERC20(
      input.Noggles.address,
      input.BaseNoggles.address,
      input.amount,
      100000,
      "0x"
    );

  console.log(`[BASE-BRIDGE]: tx ${bridgeResult.hash}`);
  await bridgeResult.wait();
  console.log(`[BASE-BRIDGE]: done`);
}
