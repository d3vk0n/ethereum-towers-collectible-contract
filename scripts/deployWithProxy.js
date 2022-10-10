require('dotenv').config()
const { ethers, upgrades } = require("hardhat")

let ETHEREUM_TOWER_ERC1155;
let SERVICE_FEE_ADDRESS = process.env.SERVICE_FEE_ADDRESS
let PAYMENT_TOKEN = process.env.ERC20_CONTRACT_ADDRESS
let SERVICE_ADDRESS = process.env.SERVICE_PUBLIC_KEY
let PAYMENT_RECEIVER = process.env.PAYMENT_RECEIVER

async function deployEthereumTowersTestERC20() {
  const TestERC20 = await hre.ethers.getContractFactory('TestERC20')
  const testerc20 = await TestERC20.deploy()

  await testerc20.deployed()
  PAYMENT_TOKEN = testerc20.address
  console.log('Test ERC20 deployed:', testerc20.address)
}

async function deployEthereumTowersCollectible() {
  const contractFactory = await ethers.getContractFactory("EthereumTowerCollectible")
  const ett = await upgrades.deployProxy(
    contractFactory,
    [
      "https://ethereumtowers.com/api/item/"
    ],
    {
      initializer: "initialize"
    }
  );
  await ett.deployed()
  console.log('Ethereum Towers Collectible deployed to:', ett.address)
  ETHEREUM_TOWER_ERC1155 = ett.address
}

async function deployEthereumTowersCollectibleMarket() {
  const EthereumTowersCollectibleFactory = await hre.ethers.getContractFactory(
    'EthereumTowerCollectibleMarket'
  );
  const ettMarket = await upgrades.deployProxy(
    EthereumTowersCollectibleFactory,
    [
      ETHEREUM_TOWER_ERC1155,
      SERVICE_FEE_ADDRESS,
      PAYMENT_TOKEN,
      SERVICE_ADDRESS
    ],
    {
      initializer: "initialize"
    }
  );
  await ettMarket.deployed()
  console.log('Ethereum Towers Collectible Market deployed to:', ettMarket.address)
}
async function deployEthereumTowersCollectibleAddon() {
  const EthereumTowersCollectibleFactory = await hre.ethers.getContractFactory(
    'EthereumTowerCollectibleAddon'
  );
  const ettMarket = await upgrades.deployProxy(
    EthereumTowersCollectibleFactory,
    [
      ETHEREUM_TOWER_ERC1155,
      SERVICE_ADDRESS
    ],
    {
      initializer: "initialize"
    }
  )
  await ettMarket.deployed()
  console.log('Ethereum Towers Collectible Addon deployed to:', ettMarket.address)
}

async function deployEthereumTowersVaultAddon() {
  const EthereumTowersCollectibleFactory = await hre.ethers.getContractFactory(
    'EthereumTowerVaultAddon'
  );
  const ettVault = await upgrades.deployProxy(
    EthereumTowersCollectibleFactory,
    [
      ETHEREUM_TOWER_ERC1155,
      SERVICE_ADDRESS,
      PAYMENT_TOKEN,
      PAYMENT_RECEIVER
    ],
    {
      initializer: "initialize"
    }
  )
  await ettVault.deployed()
  console.log('Ethereum Towers Vault Addon deployed to:', ettVault.address)
}


deployEthereumTowersTestERC20().then(() => {
  // deployEthereumTowersCollectible().then(() => {
  //   deployEthereumTowersCollectibleMarket().then(() => {
  //     deployEthereumTowersCollectibleAddon().then(() => {
  //       deployEthereumTowersVaultAddon().then(()=>{
  //         console.log('Deployment complete')
  //         process.exit(0)
  //       })
  //     })
  //   })
  })
    .catch(err => {
      console.log('Deployment failed:', err)
      process.exit(1)
    })


// })