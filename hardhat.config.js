require('dotenv').config()
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-web3');
require('solidity-coverage');

// const tdly = require("@tenderly/hardhat-tenderly");
const fs = require('fs');
const path = require('path');

const deployer = process.env.DEPLOYER;
const serviceSigner = process.env.TEST_SERVICE_SIGNER;
const testAccount1 = process.env.TEST_ACCOUNT_1;
const testAccount2 = process.env.TEST_ACCOUNT_2;
const forkId = process.env.FORK_ID

// tdly.setup({
//   project: "ethereumtowers",
//   username: "d3vk0n",
//   forkNetwork: "8900a343-5a28-4b04-bd98-ad9651f7e828",
//   privateVerification: true,
//   deploymentsDir: "deployments"
// });

const polygonscanKey = process.env.POLYGONSCAN_API_KEY;
const blastApiId = process.env.BLAST_ID;
task("selectors", "Prints contract function selectors", async (_, { web3 }) => {
  const getAllAbiFiles = function (dirPath, arrayOfFiles) {
    files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
      if (fs.statSync(dirPath + "/" + file).isDirectory()) {
        arrayOfFiles = getAllAbiFiles(dirPath + "/" + file, arrayOfFiles);
      } else {
        if (!file.includes('dbg') && path.extname(file) === '.json') {
          arrayOfFiles.push(path.join(__dirname, dirPath, "/", file));
        }
      }
    })

    return arrayOfFiles
  }

  const abiFiles = getAllAbiFiles('./artifacts/contracts');

  abiFiles.forEach(function (abiPath) {
    const rawData = fs.readFileSync(abiPath);
    const contractInterface = JSON.parse(rawData);

    console.log(`Contract - ${contractInterface.contractName}`);

    let contract = new web3.eth.Contract(contractInterface.abi);
    const keys = Object.keys(contract.methods);

    var methods = [];
    for (let i = 0; i < keys.length; i += 3) {
      methods.push({ MethodName: keys[i], MethodID: keys[i + 1] });
    }

    console.table(methods);
  })
});


module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    matic: {
      url: `https://polygon-testnet.blastapi.io/${blastApiId}`,
      gas: 5100000,
      gasPrice: 20000000000,
      accounts: [deployer, serviceSigner, testAccount1, testAccount2],
    },
    mumbai: {
      url: `https://polygon-testnet.blastapi.io/${blastApiId}`,
      gasPrice: 180000000000,
      privateVerification: true,
      accounts: [deployer, serviceSigner, testAccount1, testAccount2],
    },
    hardhat: {},
    tenderly: {
      url: `https://rpc.tenderly.co/fork/${forkId}`
    }
  },
  // tenderly: {
  //   project: "ethereumtowers",
  //   username: "d3vk0n",
  //   privateVerification: true,
  // },
  solidity: {
    version: "0.8.9",
    settings: {
      optimizer: {
        enabled: true,
        runs: 500
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 20000
  },
  etherscan: {
    apiKey: polygonscanKey
  },
}
