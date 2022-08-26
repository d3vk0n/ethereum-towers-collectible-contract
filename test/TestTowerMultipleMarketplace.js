const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { EIP712Signer, EthereumTowerVoucherType, InstantMintMultiVoucherType, AirdropMintMultiVoucherType, getRandomInt } = require('../utils')
const DEFAULT_ADMIN_ROLE = ethers.constants.AddressZero;
const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"));
const collectibleContractName = "EthereumTowerCollectible";
const collectibleMarketName = "EthereumTowerCollectibleMarket";
const erc20ContractName = "TestERC20";
const erc165ContractName = "TestERC165";
const SIGNING_DOMAIN = "ETT_VOUCHER";
const SIGNATURE_VERSION = "1";
const BASE_TOKEN_URI = "https://ethereumtowers.com/api/item/";
let erc20ContractAddress;
let collectibleContractAddress;
describe(`${collectibleMarketName} contract`, function () {
  it(`should deploy new ${collectibleMarketName} smart contract`, async function () {
    const testUsers = await ethers.getSigners();
    const projectFeeAddress = testUsers[10].address;
    const serviceSigner = testUsers[2].address;
    const contractFactory = await ethers.getContractFactory(collectibleContractName);
    const ett = await upgrades.deployProxy(
      contractFactory,
      [
        "https://ethereumtowers.com/api/item/"
      ],
      {
        initializer: "initialize"
      }
    );
    await ett.deployed();
    collectibleContractAddress = ett.address;
    const erc20ContractFactory = await ethers.getContractFactory(erc20ContractName);
    const erc20 = await erc20ContractFactory.deploy();
    await erc20.deployed();
    erc20ContractAddress = erc20.address;
    const collectibleMarketFactory = await ethers.getContractFactory(collectibleMarketName);
    const ettMarket = await upgrades.deployProxy(
      collectibleMarketFactory,
      [
        collectibleContractAddress,
        projectFeeAddress,
        erc20ContractAddress,
        serviceSigner
      ],
      {
        initializer: "initialize"
      }
    );
    await ettMarket.deployed();
    expect(await ettMarket.deployed());
    expect(await erc20.name()).to.equal(erc20ContractName);
  });
  describe("Contract functions", function () {
    let collectibleContract;
    let collectibleMarket;
    let erc165Contract;
    let erc20Contract;
    let testUsers;
    let projectFeeAddress;
    let eip712Signer;
    let serviceSigner;
    let newServiceSigner;
    let tokenAuthor;
    const projectFeePercent = 2;
    before(async () => {
      testUsers = await ethers.getSigners();
      projectFeeAddress = testUsers[10].address;
      tokenAuthor = testUsers[19];
      newProjectFeeAddress = testUsers[2].address;
      serviceSigner = testUsers[3];
      newServiceSigner = testUsers[18];
      const collectibleContractFactory = await ethers.getContractFactory(collectibleContractName);
      collectibleContract = await upgrades.deployProxy(
        collectibleContractFactory,
        [
          "https://ethereumtowers.com/api/item/"
        ],
        {
          initializer: "initialize"
        }
      );
      await collectibleContract.deployed();
      const erc20ContractFactory = await ethers.getContractFactory(erc20ContractName);
      erc20Contract = erc20ContractFactory.attach(erc20ContractAddress);
      const erc165ContractFactory = await ethers.getContractFactory(erc165ContractName);
      const erc165ContractDeploy = await erc165ContractFactory.deploy();
      await erc165ContractDeploy.deployed();
      erc165Contract = erc165ContractDeploy.attach(erc165ContractDeploy.address);
      const collectibleMarketFactory = await ethers.getContractFactory(collectibleMarketName);
      collectibleMarket = await upgrades.deployProxy(
        collectibleMarketFactory,
        [
          collectibleContract.address,
          projectFeeAddress,
          erc20Contract.address,
          serviceSigner.address
        ],
        {
          initializer: "initialize"
        }
      );
      await collectibleMarket.deployed();
      eip712Signer = new EIP712Signer({
        signing_domain: SIGNING_DOMAIN,
        signature_version: SIGNATURE_VERSION,
        contract: collectibleMarket,
        serviceAddress: serviceSigner
      });
    });
    it("should get chain id", async function () {
      const network = await ethers.provider.getNetwork();
      const chainId = await collectibleMarket.getChainId();
      expect(chainId.toNumber()).to.equal(network.chainId);
    });
    it("should restrict calling updateServiceFeeAddress to DEFAULT_ADMIN_ROLE", async function () {
      await expect(collectibleMarket.connect(testUsers[9]).updateServiceFeeAddress(testUsers[9].address))
        .to.be.revertedWith("ETT: missing required role");
    });
    it("should restrict calling updatePaymentToken to DEFAULT_ADMIN_ROLE", async function () {
      await expect(collectibleMarket.connect(testUsers[1]).updatePaymentToken(
        ethers.constants.AddressZero
      )).to.be.revertedWith("ETT: missing required role");
    });
    it("should allow owner to call updatePaymentToken", async function () {
      expect(await collectibleMarket.updatePaymentToken(erc20Contract.address));
    });
    it("should restrict calling updateServiceFeePercent to DEFAULT_ADMIN_ROLE", async function () {
      await expect(collectibleMarket.connect(testUsers[9]).updateServiceFeePercent(10))
        .to.be.revertedWith("ETT: missing required role");
    });
    it("should restrict calling updateServiceAddress to contract owner", async function () {
      await expect(collectibleMarket.connect(testUsers[9]).updateServiceAddress(ethers.constants.AddressZero))
        .to.be.revertedWith("ETT: missing required role");
    });
    it("should restrict calling pause to DEFAULT_ADMIN_ROLE or PAUSER_ROLE", async function () {
      await expect(collectibleMarket.connect(testUsers[2]).pause())
        .to.be.revertedWith("ETT: missing required role");
    });
    it("should restrict calling unpause to DEFAULT_ADMIN_ROLE or PAUSER_ROLE", async function () {
      await expect(collectibleMarket.connect(testUsers[2]).unpause())
        .to.be.revertedWith("ETT: missing required role");
    });
    it("should revert updateServiceAddress with contract address as signer", async function () {
      await expect(collectibleMarket.updateServiceAddress(erc165Contract.address))
        .to.be.revertedWith("ETT: contract cannot be signer");
    });
    it("should update service fee percent", async function () {
      const previousFeePecent = await collectibleMarket.serviceFeePercent();
      const newFeePercent = 10;
      await collectibleMarket.updateServiceFeePercent(newFeePercent);
      expect(await collectibleMarket.serviceFeePercent()).to.be.equal(newFeePercent);
      await collectibleMarket.updateServiceFeePercent(previousFeePecent);
    });
    it("should pause contract", async function () {
      await collectibleMarket.pause();
      expect(await collectibleMarket.paused()).to.be.true;
    });
    it("should unpause contract", async function () {
      await collectibleMarket.unpause();
      expect(await collectibleMarket.paused()).to.be.false;
    });
    it("should mintByVoucher signed by maker", async function () {
      const tokenId = 333393;
      const author = testUsers[0];
      const voucherData = {
        tokenId: tokenId,
        author: author.address,
        amount: 10,
        nonce: getRandomInt()
      };
      await collectibleContract.grantRole(MINTER_ROLE, collectibleMarket.address)
      const signedVoucherByAuthor = await eip712Signer.signInstantMint(voucherData, InstantMintMultiVoucherType, author);
      expect(await collectibleMarket.connect(author).mintByVoucher(signedVoucherByAuthor));
    });
    it("should airdrop signed by maker", async function () {
      const tokenId = [333099, 333398, 333397];
      const author = testUsers[0];
      const receivers = [testUsers[16].address, testUsers[18].address, testUsers[19].address];
      const amounts = [10, 20, 30];
      const data = {
        tokenId: tokenId,
        to: receivers,
        author: author.address,
        amount: amounts,
        nonce: getRandomInt()
      };
      const signedVoucherByAuthor = await eip712Signer.signInstantMint(data, AirdropMintMultiVoucherType, author);
      expect(await collectibleMarket.connect(author).airdrop(signedVoucherByAuthor));
    });
    it("should revert mintByVoucher signed by wrong author address", async function () {
      const tokenId = 333393;
      const author2 = testUsers[17];
      const author = testUsers[16];
      const voucherData = {
        tokenId: tokenId,
        author: author2.address,
        amount: 10,
        nonce: getRandomInt()
      };
      const signedVoucherByAuthor = await eip712Signer.signInstantMint(voucherData, InstantMintMultiVoucherType, author);
      await collectibleContract.grantRole(MINTER_ROLE, author2.address)
      await expect(collectibleMarket.connect(author).mintByVoucher(signedVoucherByAuthor))
        .to.be.revertedWith("ETT: invalid signatures");
    });
    it("should revert mintByVoucher with transaction sent by someone else", async function () {
      const tokenId = getRandomInt();
      const author2 = testUsers[17];
      const author = testUsers[16];
      const voucherData = {
        tokenId: tokenId,
        author: author.address,
        amount: 10,
        nonce: getRandomInt()
      };
      const signedVoucherByAuthor = await eip712Signer.signInstantMint(voucherData, InstantMintMultiVoucherType, author);
      await expect(collectibleMarket.connect(author2).mintByVoucher(signedVoucherByAuthor))
        .to.be.revertedWith("ETT: minting not allowed, author does not have minter role");
    });
    it("should revert mintByVoucher with voucher signed by wrong service address", async function () {
      const tokenId = getRandomInt();
      const wrongService = testUsers[17];
      const author = testUsers[0];
      const voucherData = {
        tokenId: tokenId,
        author: author.address,
        amount: 10,
        nonce: getRandomInt()
      };
      const signedVoucherByAuthor = await eip712Signer.signInstantMintWrong(
        voucherData,
        InstantMintMultiVoucherType,
        author,
        wrongService
      );
      await expect(collectibleMarket.connect(author).mintByVoucher(signedVoucherByAuthor))
        .to.be.revertedWith("ETT: invalid signatures");
    });
    it("should check thath supports accessControlEnumerable interface", async function () {
      expect(await collectibleMarket.supportsInterface("0x7965db0b")).to.equal(true);
    });
    it("should revert check thath supports accessControlEnumerable interface", async function () {
      expect(await collectibleMarket.supportsInterface("0x5b5e139f")).to.equal(false);
    });
    it("should revert redeem when NFT contract does not support ERC1155 interface", async function () {
      const tokenId = 333312;
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: erc165Contract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("ETT: the provided contract does not support ERC1155 interface");
    });
    it("should revert redeem when paused", async function () {
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.pause();
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("Pausable: paused");
      await collectibleMarket.unpause();
    });
    it("should revert redeem with zero amount", async function () {
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: 0,
        author: seller.address,
        tokenOwner: seller.address,
        serviceAddress: serviceSigner.address,
        isFirstSale: true
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        1
      )).to.be.revertedWith("ETT: amount should be positive number");
    });
    it("should revert redeem with zero quantity", async function () {
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: 1,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        0
      )).to.be.revertedWith("ETT: quantity should be positive number");
    });
    it("should revert redeem with quantity > amount", async function () {
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: 1,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        2
      )).to.be.revertedWith("ETT: quantity should not exceed amount");
    });
    it("should revert redeem on first sale with wrong maker order signer", async function () {
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: 1,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, testUsers[19]);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        voucherData.amount
      )).to.be.revertedWith("ETT: invalid maker order signer");
    });
    it("should revert redeem on first sale when quantity exceeds token supply", async function () {
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: 10,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(voucherData.amount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        6
      );
      const takerVoucher2 = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher2,
        6
      )).to.be.revertedWith("ETT: redeem quantity exceeds token supply amount");
    });
    it("should revert redeem with invalid taker = address(0)", async function () {
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        ethers.constants.AddressZero,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("ETT: taker order not valid");
    });
    it("should revert redeem if taker order signature already used", async function () {
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("ETT: taker order not valid");
    });
    it("should redeem of minted tokens if author & owner good specified", async function () {
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        5
      );
      const secondVoucher = {
        target: collectibleContract.address,
        tokenId: voucherData.tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const secondSigned = await eip712Signer.signVoucher(secondVoucher, EthereumTowerVoucherType, seller);
      const takerVoucher2 = await eip712Signer.signTakerVoucher(
        secondSigned.tokenId,
        taker.address,
        getRandomInt(),
        secondSigned.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        secondSigned,
        takerVoucher2,
        5
      ))
    });
    it("should revert redeem of minted tokens if wrong author & owner specified", async function () {
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        5
      );
      const secondVoucher = {
        target: collectibleContract.address,
        tokenId: voucherData.tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: taker.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const secondSigned = await eip712Signer.signVoucher(secondVoucher, EthereumTowerVoucherType, seller);
      const takerVoucher2 = await eip712Signer.signTakerVoucher(
        secondSigned.tokenId,
        taker.address,
        getRandomInt(),
        secondSigned.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        secondSigned,
        takerVoucher2,
        5
      )).to.be.revertedWith("ETT: wrong owner");
    });
    it("should redeem token with signed voucher on first sale and emit 2 events", async function () {
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      expect(await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount,
      )).to.emit(collectibleContract, "TransferSingle")
        .withArgs(
          collectibleMarket.address,
          ethers.constants.AddressZero,
          taker.address,
          voucherData.tokenId,
          tokensAmount
        )
        .and.to.emit(collectibleMarket, "FixPriceRedeem")
        .withArgs(seller.address, taker.address, voucherData.tokenId, tokensAmount);
    });
    it("should redeem Vault token with signed voucher on first sale and emit 2 events", async function () {
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      expect(await collectibleMarket.connect(taker).vaultRedeem(
        signedVoucher,
        takerVoucher,
        tokensAmount,
      )).to.emit(collectibleContract, "TransferSingle")
        .withArgs(
          collectibleMarket.address,
          ethers.constants.AddressZero,
          taker.address,
          voucherData.tokenId,
          tokensAmount
        )
        .and.to.emit(collectibleMarket, "FixPriceRedeem")
        .withArgs(seller.address, taker.address, voucherData.tokenId, tokensAmount);
    });
    it("should redeem of minted tokens on first sale", async function () {
      const tokensAmount = 10;
      const seller = testUsers[10];
      const taker = testUsers[15];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: getRandomInt(),
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        royaltyFee: 0,
        isFirstSale: true,
        serviceAddress: serviceSigner.address,
      };
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      expect(await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        5
      ));
    });
    it("should redeem token on secondary sale and emit 3 event", async function () {
      const tokenId = 333312;
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: tokenAuthor.address,
        tokenOwner: seller.address,
        isFirstSale: false,
        serviceAddress: serviceSigner.address,
      };
      await collectibleContract.mint(seller.address, tokenId, tokensAmount, '0xff');
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleContract.connect(seller).setApprovalForAll(
        collectibleMarket.address,
        tokenId
      );
      expect(await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.emit(collectibleMarket, "FixPriceRedeem")
        .withArgs(seller.address, taker.address, tokenId, tokensAmount)
        .and.to.emit(collectibleContract, "TransferSingle")
        .withArgs(collectibleMarket.address, seller.address, collectibleMarket.address, tokenId, tokensAmount)
        .and.to.emit(collectibleContract, "TransferSingle")
        .withArgs(collectibleMarket.address, collectibleMarket.address, taker.address, tokenId, tokensAmount)
    });
    it("should redeem on secondary sale and distribute tokens", async function () {
      const tokenId = 333389;
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: false,
        serviceAddress: serviceSigner.address,
      };
      await collectibleContract.mint(seller.address, tokenId, tokensAmount, '0xff');
      await collectibleContract.connect(seller).setApprovalForAll(
        collectibleMarket.address,
        tokenId
      );
      const feeBalanceBefore = await erc20Contract.balanceOf(projectFeeAddress);
      const sellerBalanceBefore = await erc20Contract.balanceOf(seller.address);
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      );
      const projectFees = totalPrice.mul(projectFeePercent).div(100)
      let sellerValue = totalPrice.sub(projectFees)
      expect(await erc20Contract.balanceOf(projectFeeAddress)).to.be.equal(feeBalanceBefore.add(projectFees));
      expect(await erc20Contract.balanceOf(seller.address)).to.be.equal(sellerBalanceBefore.add(sellerValue));
      expect(await collectibleContract.balanceOf(taker.address, tokenId)).to.be.equal(tokensAmount);
    });
    it("should redeem Vault on secondary sale and distribute tokens", async function () {
      const tokenId = 333111;
      const tokensAmount = 10;
      const seller = testUsers[15];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: false,
        serviceAddress: serviceSigner.address,
      };
      await collectibleContract.mint(seller.address, tokenId, tokensAmount, '0xff');
      await collectibleContract.connect(seller).setApprovalForAll(
        collectibleMarket.address,
        tokenId
      );
      const feeBalanceBefore = await erc20Contract.balanceOf(projectFeeAddress);
      const sellerBalanceBefore = await erc20Contract.balanceOf(seller.address);
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.connect(taker).vaultRedeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      );
      const projectFees = totalPrice.mul(projectFeePercent).div(100)
      let sellerValue = totalPrice.sub(projectFees)
      expect(await erc20Contract.balanceOf(projectFeeAddress)).to.be.equal(feeBalanceBefore.add(projectFees));
      expect(await erc20Contract.balanceOf(seller.address)).to.be.equal(sellerBalanceBefore.add(sellerValue));
      expect(await collectibleContract.balanceOf(taker.address, tokenId)).to.be.equal(tokensAmount);
    });
    it("should update service signer address", async function () {
      expect(await collectibleMarket.updateServiceAddress(newServiceSigner.address));
    });
    it("should revert redeem for voucher signed by old service address", async function () {
      const tokenId = 333391;
      const tokensAmount = 10;
      const seller = testUsers[17];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: true,
        serviceAddress: newServiceSigner.address,
      };
      await collectibleContract.grantRole(MINTER_ROLE, seller.address)
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await expect(collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("ETT: unknown service signer");
    });
    it("should redeem with voucher signed by new address", async function () {
      const tokenId = 333391;
      const tokensAmount = 10;
      const seller = testUsers[17];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: seller.address,
        tokenOwner: seller.address,
        isFirstSale: true,
        serviceAddress: newServiceSigner.address,
      };
      const newEip712Signer = new EIP712Signer({
        signing_domain: SIGNING_DOMAIN,
        signature_version: SIGNATURE_VERSION,
        contract: collectibleMarket,
        serviceAddress: newServiceSigner
      });
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await newEip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await newEip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      );
      expect(await collectibleMarket.updateServiceAddress(serviceSigner.address));
    });
    it("should update project fee address", async function () {
      expect(await collectibleMarket.updateServiceFeeAddress(newProjectFeeAddress));
    });
    it("should redeem and transfer fees to new address", async function () {
      const tokenId = 333089;
      const tokensAmount = 10;
      const seller = testUsers[17];
      const taker = testUsers[16];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: tokenAuthor.address,
        tokenOwner: seller.address,
        royaltyFee: 5,
        isFirstSale: false,
        serviceAddress: serviceSigner.address,
      };
      await collectibleContract.mint(seller.address, tokenId, tokensAmount, '0xff');
      await collectibleContract.connect(seller).setApprovalForAll(
        collectibleMarket.address,
        tokenId
      );
      const oldFeeBalanceBefore = await erc20Contract.balanceOf(projectFeeAddress);
      const newFeeBalanceBefore = await erc20Contract.balanceOf(newProjectFeeAddress);
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      await collectibleMarket.connect(taker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      );
      const projectFees = totalPrice.mul(projectFeePercent).div(100);
      expect(await erc20Contract.balanceOf(projectFeeAddress)).to.be.equal(oldFeeBalanceBefore);
      expect(await erc20Contract.balanceOf(newProjectFeeAddress)).to.be.equal(newFeeBalanceBefore.add(projectFees));
      await collectibleMarket.updateServiceFeeAddress(projectFeeAddress);
    });
    it("should revert redeem on first sale with wrong caller", async function () {
      const tokenId = 333089;
      const tokensAmount = 10;
      const seller = testUsers[17];
      const taker = testUsers[16];
      const wrongTaker = testUsers[18];
      const voucherData = {
        target: collectibleContract.address,
        tokenId: tokenId,
        fixPrice: ethers.utils.parseEther("1"),
        amount: tokensAmount,
        author: tokenAuthor.address,
        tokenOwner: seller.address,
        royaltyFee: 5,
        isFirstSale: false,
        serviceAddress: serviceSigner.address,
      };
      await collectibleContract.mint(seller.address, tokenId, tokensAmount, '0xff');
      await collectibleContract.connect(seller).setApprovalForAll(
        collectibleMarket.address,
        tokenId
      );
      const totalPrice = voucherData.fixPrice.mul(tokensAmount);
      await erc20Contract.connect(taker).claimBalance(totalPrice.mul(2))
      await erc20Contract.connect(taker).approve(collectibleMarket.address, totalPrice.mul(2))
      const signedVoucher = await eip712Signer.signVoucher(voucherData, EthereumTowerVoucherType, seller);
      const takerVoucher = await eip712Signer.signTakerVoucher(
        signedVoucher.tokenId,
        taker.address,
        getRandomInt(),
        signedVoucher.signature
      );
      expect(collectibleMarket.connect(wrongTaker).redeem(
        signedVoucher,
        takerVoucher,
        tokensAmount
      )).to.be.revertedWith("ETT: wrong caller");
    });
  });
});
