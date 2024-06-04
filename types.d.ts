import "hardhat/types/config";

interface DeploymentConfig {
  nftAddress?: string;
  stakingSigner?: string;
  nnsTeamWallet?: string;
  proliferationWallet?: string;
  liquidityPoolWallet?: string;
  ecosystemWallet?: string;

  rewarderSigner?: string;
}

interface BaseBridge {
  address: string;
}

declare module "hardhat/types/config" {
  interface HttpNetworkUserConfig {
    deployment?: DeploymentConfig;
    l1BaseBridge?: BaseBridge;
  }

  interface HardhatNetworkUserConfig {
    deployment?: DeploymentConfig;
    l1BaseBridge?: BaseBridge;
  }
}
