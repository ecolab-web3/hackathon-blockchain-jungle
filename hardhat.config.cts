import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

// Load environment variables from the .env file
const FUJI_RPC_URL = process.env.FUJI_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  networks: {
    // Configuration for the Avalanche Fuji testnet
    fuji: {
      url: FUJI_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 43113,
    },
    hardhat: {
      hostname: "0.0.0.0",
      forking: {
        url: FUJI_RPC_URL,        
      },      
    },
  },
  
  etherscan: {
    apiKey: {
      avalancheFujiTestnet: "snowtrace",
    },
  },
};

export default config;