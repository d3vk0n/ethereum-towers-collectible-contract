const { ethers } = require("ethers")
const { EIP712Signer, EthereumTowerVoucherType, InstantMintMultiVoucherType, AirdropMintMultiVoucherType, getRandomInt } = require('../utils')
const DEFAULT_ADMIN_ROLE = ethers.constants.AddressZero;
const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"));

const SIGNING_DOMAIN = "ETT_VOUCHER";
const SIGNATURE_VERSION = "1";


const CONTRACT_ADDRESS = "0x656dBb49dc4cA7b18fefAEBC00f9A557bd6Ab3dE"
const MINTER_PRIVATE_KEY = "a7981403fd3da66e6753dbee7e7fc09e145d98cd15098f67147bc66872070b00"
const MARKET = require("../artifacts/contracts/marketplace/EthereumTowerMultipleMarketplace.sol/EthereumTowerCollectibleMarket.json")
const provider = new ethers.providers.JsonRpcProvider("https://polygon-testnet.blastapi.io/5035d571-8e70-4984-9a58-86158b46fa78")
const signer = new ethers.Wallet(MINTER_PRIVATE_KEY, provider)

const serviceSigner = new ethers.Wallet("f3d805a4ef5ce42fcd55de8cf11c6ca7cc6a813509447cb426ef669ecad53a00", provider)

let contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    MARKET.abi,
    signer // provider
);

let eip712Signer

const seller = new ethers.Wallet("a7981403fd3da66e6753dbee7e7fc09e145d98cd15098f67147bc66872070b00", provider)
const taker = new ethers.Wallet("74e5065a36b813d57e86bcc47279918fb3c5ffbc597dd02428ac87953f27ac26", provider)
console.log(seller.privateKey)
// const database = require('../utils/database')
// database()

// const Token = require("./tokenModel")

// eip712Signer = new EIP712Signer({
//     signing_domain: SIGNING_DOMAIN,
//     signature_version: SIGNATURE_VERSION,
//     contract: contract,
//     serviceAddress: serviceSigner
// });

// async function prepareSignatures(i) {
//     console.log(`Token ${i} generated and saved to DB`)
//     const tokensAmount = 10
//     let price = ethers.utils.parseEther("0.001")

//     const voucherData = {
//         target: contract.address,
//         tokenId: getRandomInt(),
//         fixPrice: price,
//         amount: tokensAmount,
//         author: seller.address,
//         tokenOwner: seller.address,
//         royaltyFee: 0,
//         isFirstSale: true,
//         serviceAddress: serviceSigner.address,
//     };
//     const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
//     const takerVoucher = await eip712Signer.signTakerVoucher(
//         signedVoucher.tokenId,
//         taker.address,
//         getRandomInt(),
//         signedVoucher.signature
//     );
//     let newRecord = await new Token({
//         voucher: signedVoucher,
//         takerVoucher: takerVoucher
//     })
//     await newRecord.save()
// }

// const counter = 10000



// async function start() {
//     for (let i = 0; i <= counter; i++) {
//         await prepareSignatures(i)
//         if (i == counter) {
//             console.log("Done!")
//             process.exit(0)
//         }
//     }
// }

// start()