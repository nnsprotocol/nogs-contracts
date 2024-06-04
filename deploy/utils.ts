import { BigNumber, Contract } from "ethers";
import fs from "fs/promises";
import path from "path";

export const NOGGLES_UNIT = BigNumber.from(10).pow(18);

export function logger(scope: string, verbose?: Boolean) {
  if (!verbose) {
    return {
      info(msg: string) {},
    };
  }
  return {
    info(msg: string) {
      console.log(`[${scope}]: ${msg}`);
    },
  };
}

export async function saveDeployment(
  network: string,
  name: string,
  contract: Pick<Contract, "address" | "deployTransaction">
) {
  const folder = path.join(__dirname, "..", "deployments", network);
  if (!(await fsExists(folder))) {
    await fs.mkdir(folder, { recursive: true });
  }

  await fs.writeFile(
    path.join(folder, `${name}.json`),
    JSON.stringify(
      {
        address: contract.address,
        tx: contract.deployTransaction,
      },
      null,
      2
    )
  );
}

async function fsExists(p: string) {
  const stat = await fs.stat(p).catch(() => false);
  return stat ? true : false;
}

export async function loadDeployment(network: string, name: string) {
  const file = path.join(
    __dirname,
    "..",
    "deployments",
    network,
    `${name}.json`
  );
  const data = await fs.readFile(file, "utf8").catch(() => null);
  if (data) {
    return JSON.parse(data).address;
  }
  return null;
}

export async function ensureNotDeployed(network: string, name: string) {
  const addr = await loadDeployment(network, name);
  if (addr) {
    throw new Error(`${name} already deployed at ${addr} on ${network}`);
  }
}
