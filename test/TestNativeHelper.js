const { expect } = require('chai');
const { ethers } = require('hardhat');
const { EIP712Signer, NativeRequestType, getRandomInt } = require('../utils')
const contractName = "NativeHelper"

let deployedContractAddress
let deployedContract
const SIGNING_DOMAIN = "ETT_VOUCHER";
const SIGNATURE_VERSION = "1";

describe(`${contractName} contract`, function () {
    let eip712Signer
    let testUsers

    it(`should deploy new ${contractName} smart contract`, async function () {
        testUsers = await ethers.getSigners()
        const contractFactory = await ethers.getContractFactory(contractName);
        const Contract = await contractFactory.deploy(testUsers[0].address)
        await Contract.deployed()
        deployedContractAddress = Contract.address
        expect(await Contract.NAME()).to.equal(contractName);
    })
    it(`Should add balances to addresses`, async function(){
        const params = [
            testUsers[0].address,
            ethers.utils.hexValue(10000) // hex encoded wei amount
        ]
        let balanceBefore = await ethers.provider.getBalance(testUsers[0].address)
        await ethers.provider.send('tenderly_addBalance', params)
        expect(await ethers.provider.getBalance(testUsers[0].address)).to.equal(balanceBefore.add(ethers.utils.hexValue(10000)))
    })
    it(`should deposit MATIC to ${contractName}`, async function () {
        const contractFactory = await ethers.getContractFactory(contractName);
        deployedContract = await contractFactory.attach(deployedContractAddress)
        const contractBalanceBefore = await deployedContract.withdrawable()
        await deployedContract.deposit({
            value: ethers.utils.parseUnits("10", "ether")
        })
        expect(await deployedContract.withdrawable()).to.equal(contractBalanceBefore.add(ethers.utils.parseUnits("10", "ether")))
    })

    it(`should send MATIC from ${contractName} to `, async function () {
        const contractFactory = await ethers.getContractFactory(contractName);
        deployedContract = await contractFactory.attach(deployedContractAddress)
        const userBalanceBefore = await ethers.provider.getBalance(testUsers[1].address)

        eip712Signer = new EIP712Signer({
            signing_domain: SIGNING_DOMAIN,
            signature_version: SIGNATURE_VERSION,
            contract: deployedContract,
            serviceAddress: testUsers[0]
        });
        // struct Request {
        //     address receiverAddress;
        //     uint256 receiverValue;
        //     uint256 nonce;
        //     bytes signature;
        // }
        // let contractBalance = await deployedContract.withdrawable()

        // expect(await deployedContract.withdrawable()).to.equal(contractBalanceBefore.add(ethers.utils.parseUnits("10", "ether")))
        const voucherData = {
            receiverAddress: testUsers[1].address,
            receiverValue: ethers.utils.parseUnits("1", "ether"),
            nonce: getRandomInt()
        }

        let signedVoucher = await eip712Signer.signVoucher(voucherData, NativeRequestType, testUsers[0])
        console.log('Signed', signedVoucher)
        await deployedContract.request(signedVoucher)
        // expect(await deployedContract.withdrawable()).to.equal(contractBalanceBefore.add(ethers.utils.parseUnits("10", "ether")))
        expect(await ethers.provider.getBalance(testUsers[1].address)).to.equal(userBalanceBefore.add(ethers.utils.parseUnits("1", "ether")))
    })
})