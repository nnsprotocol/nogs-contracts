import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import dotenv from "dotenv";
import { BigNumber } from "ethers";
import "hardhat-abi-exporter";
import { HardhatUserConfig, task } from "hardhat/config";
import bridgeNOGS from "./basebridge";
import deploy from "./deploy";
import { getNNSStakingContract, getNogglesContract } from "./deployments";

dotenv.config();

function valueOrThrow<T>(v: T | undefined): T {
  if (typeof v === "undefined") {
    throw new Error("missing value");
  }
  return v;
}

task("deploy", "Deploy contracts")
  .addParam("step", "The deployment step, see files in 'deploy' folder")
  .addFlag("force", "Force a redeployment")
  .setAction(async (args, hre) => {
    const [deployer] = await hre.ethers.getSigners();
    const { deployment: cfg } =
      hre.userConfig.networks?.[hre.network.name] || {};

    switch (args.step) {
      case "01_noggles":
        return await deploy["01_noggles"](hre, {
          deployer,
          verbose: true,
          save: true,
          force: args.force,
        });
      case "02_staking":
        return await deploy["02_staking"](hre, {
          deployer,
          nftAddress: cfg?.nftAddress,
          Noggles: await getNogglesContract(hre),
          signer: valueOrThrow(cfg?.stakingSigner),
          supply: BigNumber.from("34500000000"), // 34.5B
          verbose: true,
          save: true,
          force: args.force,
        });

      case "03_vesting":
        const ONE_MONTH = 30 * 24 * 60 * 60;
        const ONE_BILLION = BigNumber.from(10).pow(9);
        const nowEpoch = Math.ceil(new Date().getTime() / 1000);
        return await deploy["03_vesting"](hre, {
          deployer,
          Noggles: await getNogglesContract(hre),
          allocations: [
            {
              name: "nns_team",
              amount: ONE_BILLION.mul(69).div(10),
              beneficiary: valueOrThrow(cfg?.nnsTeamWallet),
              start: nowEpoch + 6 * ONE_MONTH,
              cliffInSeconds: 6 * ONE_MONTH - 1,
              durationInSeconds: 30 * ONE_MONTH,
            },
            {
              name: "proliferation",
              amount: ONE_BILLION.mul(69).div(10),
              beneficiary: valueOrThrow(cfg?.proliferationWallet),
              start: nowEpoch,
              cliffInSeconds: 0,
              durationInSeconds: 24 * ONE_MONTH,
            },
            {
              name: "liquidity_pool",
              amount: ONE_BILLION.mul(69).div(10),
              beneficiary: valueOrThrow(cfg?.liquidityPoolWallet),
              start: nowEpoch + 3 * ONE_MONTH - 1,
              cliffInSeconds: 0,
              durationInSeconds: 1,
            },
            {
              name: "ecosystem_fund",
              amount: ONE_BILLION.mul(138).div(10),
              beneficiary: valueOrThrow(cfg?.ecosystemWallet),
              start: nowEpoch - 8 * ONE_MONTH,
              cliffInSeconds: 12 * ONE_MONTH - 1,
              durationInSeconds: 60 * ONE_MONTH,
            },
          ],
          verbose: true,
          save: true,
          force: args.force,
        });

      case "04_noggles_base_bridge":
        return await deploy["04_noggles_base_bridge"](hre, {
          deployer,
          Noggles: await getNogglesContract(
            hre,
            // base-goerli -> goerli, base-mainnet -> mainnet
            hre.network.name.replace("base-", "")
          ),
          verbose: true,
          save: true,
          force: args.force,
        });

      case "05_nogs_rewarder":
        return await deploy["05_nogs_rewarder"](hre, {
          deployer,
          signer: valueOrThrow(cfg?.rewarderSigner),
          Noggles: await getNogglesContract(hre),
          verbose: true,
          save: true,
          force: args.force,
        });

      case "06_nogs_tipping_pool":
        return await deploy["06_nogs_tipping_pool"](hre, {
          deployer,
          signer: valueOrThrow(cfg?.rewarderSigner),
          Noggles: await getNogglesContract(hre),
          verbose: true,
          save: true,
          force: args.force,
        });

      case "07_nns_staking_airdrop":
        return await deploy["07_nns_staking_airdrop"](hre, {
          deployer,
          signer: valueOrThrow(cfg?.rewarderSigner),
          Noggles: await getNogglesContract(hre),
          verbose: true,
          save: true,
          force: args.force,
        });

      default:
        throw new Error(`unknown step '${args.step}'`);
    }
  });

task("stakes", "Get stakes")
  .addParam("wallet", "The address of the wallet to check stakes for")
  .setAction(async (args, hre) => {
    const NNSStaking = await getNNSStakingContract(hre);
    const stakes = await NNSStaking.getStakes(args.wallet);
    const printableStakes = {
      lastWithdrawTime: stakes.lastWithdrawTime.toNumber(),
      stakes: stakes.st.map((s) => ({
        tokenId: s.tokenId.toHexString(),
        startTime: s.startTime.toNumber(),
        endTime: s.endTime.toNumber(),
      })),
    };
    console.log(printableStakes);
  });

task("configuration", "Prints deployment config").setAction(
  async (args, hre) => {
    const [deployer] = await hre.ethers.getSigners();
    const { deployment: cfg } =
      hre.userConfig.networks?.[hre.network.name] || {};

    console.log("deployer", deployer.address);
    console.log("stakingSigner", cfg?.stakingSigner);
    console.log("nftAddress", cfg?.nftAddress);
    console.log("nnsTeamWallet", cfg?.nnsTeamWallet);
    console.log("proliferationWallet", cfg?.proliferationWallet);
    console.log("liquidityPoolWallet", cfg?.liquidityPoolWallet);
    console.log("ecosystemWallet", cfg?.ecosystemWallet);
    console.log("rewarderSigner", cfg?.rewarderSigner);
  }
);

task("base-bridge", "Bridge NOGS to Base")
  .addParam("amount", "Amount of NOGS to bridge")
  .addParam("signer", "Address of the signer")
  .setAction(async (args, hre) => {
    const signer = await hre.ethers.getSigner(args.signer);
    const { l1BaseBridge } = hre.userConfig.networks?.[hre.network.name] || {};
    if (!l1BaseBridge) {
      throw new Error(`missing l1BaseBridge for ${hre.network.name}`);
    }

    await bridgeNOGS(hre, {
      l1StandardBridge: l1BaseBridge.address,
      signer,
      Noggles: await getNogglesContract(hre),
      BaseNoggles: await getNogglesContract(hre, `base-${hre.network.name}`),
      amount: hre.ethers.utils.parseEther(args.amount),
    });
  });

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
      deployment: {
        stakingSigner: "0x0000000000000000000000000000000000000000",
      },
    },
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: [
        process.env.GANACHE_DEPLOYER_PRIVATE_KEY!,
        process.env.GANACHE_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        stakingSigner: process.env.GANACHE_STAKING_SIGNER!,
        nnsTeamWallet: process.env.GANACHE_STAKING_SIGNER!,
        proliferationWallet: process.env.GANACHE_STAKING_SIGNER!,
        liquidityPoolWallet: process.env.GANACHE_STAKING_SIGNER!,
        ecosystemWallet: process.env.GANACHE_STAKING_SIGNER!,
        rewarderSigner: process.env.GOERLI_REWARDER_SIGNER!,
      },
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 5,
      accounts: [
        process.env.GOERLI_DEPLOYER_PRIVATE_KEY!,
        process.env.GOERLI_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        stakingSigner: process.env.GOERLI_STAKING_SIGNER!,
        nftAddress: "0x8f701658C32FC0Eb2B9e3ec536910739169b06bc",
        nnsTeamWallet: process.env.GOERLI_STAKING_SIGNER!,
        proliferationWallet: process.env.GOERLI_STAKING_SIGNER!,
        liquidityPoolWallet: process.env.GOERLI_STAKING_SIGNER!,
        ecosystemWallet: process.env.GOERLI_STAKING_SIGNER!,
      },
      l1BaseBridge: {
        address: "0xfA6D8Ee5BE770F84FC001D098C4bD604Fe01284a",
      },
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 11155111,
      accounts: [
        process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY!,
        process.env.SEPOLIA_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        stakingSigner: process.env.SEPOLIA_STAKING_SIGNER!,
        nnsTeamWallet: process.env.SEPOLIA_STAKING_SIGNER!,
        proliferationWallet: process.env.SEPOLIA_STAKING_SIGNER!,
        liquidityPoolWallet: process.env.SEPOLIA_STAKING_SIGNER!,
        ecosystemWallet: process.env.SEPOLIA_STAKING_SIGNER!,
        rewarderSigner: process.env.SEPOLIA_REWARDER_SIGNER!,
      },
      l1BaseBridge: {
        address: "0xfd0Bf71F60660E2f608ed56e1659C450eB113120",
      },
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 1,
      accounts: [
        process.env.MAINNET_DEPLOYER_PRIVATE_KEY!,
        process.env.MAINNET_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        stakingSigner: process.env.MAINNET_STAKING_SIGNER!,
        nnsTeamWallet: process.env.MAINNET_NNS_TEAM_WALLET!,
        proliferationWallet: process.env.MAINNET_PROLIFERATION_WALLET!,
        liquidityPoolWallet: process.env.MAINNET_LIQUIDITY_POOL_WALLET!,
        ecosystemWallet: process.env.MAINNET_ECOSYSTEM_WALLET!,
        nftAddress: process.env.MAINNET_NFT_ADDRESS!,
      },
      l1BaseBridge: {
        address: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35",
      },
    },
    "base-mainnet": {
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [
        process.env.MAINNET_DEPLOYER_PRIVATE_KEY!,
        process.env.MAINNET_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        rewarderSigner: process.env.MAINNET_REWARDER_SIGNER!,
      },
    },
    "base-goerli": {
      url: "https://goerli.base.org",
      accounts: [
        process.env.GOERLI_DEPLOYER_PRIVATE_KEY!,
        process.env.GOERLI_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        rewarderSigner: process.env.GOERLI_REWARDER_SIGNER!,
      },
    },
    "base-sepolia": {
      url: "https://sepolia.base.org",
      accounts: [
        process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY!,
        process.env.SEPOLIA_FUNDS_PRIVATE_KEY!,
      ],
      deployment: {
        rewarderSigner: process.env.SEPOLIA_REWARDER_SIGNER!,
      },
    },
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY!,
      mainnet: process.env.ETHERSCAN_API_KEY!,
      sepolia: process.env.ETHERSCAN_API_KEY!,
      "base-mainnet": process.env.BASESCAN_API_KEY!,
      "base-sepolia": process.env.BASESCAN_API_KEY!,
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org/",
        },
      },
    ],
  },
  abiExporter: {
    except: ["@openzeppelin", "dummy"],
  },
};

export default config;
