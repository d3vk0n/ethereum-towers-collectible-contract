const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const collectibleContractName = "EthereumTowerCollectible";
const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"));
const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
const DEFAULT_ADMIN_ROLE = ethers.constants.AddressZero;
const ERC1155_INTERFACE_ID = "0xd9b67a26";
const ERC721_INTERFACE_ID = "0x80ac58cd";
const BASE_TOKEN_URI = "https://ethereumtowers.com/api/item/";
let collectibleContractAddress;
let proxyAdminContractAddress;
let transparentProxyContractAddress;
describe(`${collectibleContractName} contract`, function () {
  it(`should deploy new ${collectibleContractName} smart contract`, async function () {
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
    expect(await ett.deployed());
    collectibleContractAddress = ett.address;
  });
  describe("Contract functions", function () {
    let collectibleContract;
    let testUsers;
    before(async () => {
      testUsers = await ethers.getSigners();
      tokenAuthor = testUsers[19];
      const contractFactory = await ethers.getContractFactory(collectibleContractName);
      collectibleContract = contractFactory.attach(collectibleContractAddress);
    });
    it("should restrict calling toggleAccessControl to DEFAULT_ADMIN_ROLE", async function () {
      const actor = testUsers[15];
      await expect(collectibleContract.connect(actor).toggleAccessControl(true))
        .to.be.revertedWith(`AccessControl: account ${actor.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
    });
    it("should set accessControlEnabled = true by calling toggleAccessControl", async function () {
      await collectibleContract.toggleAccessControl(true);
      expect(await collectibleContract.isAccessControlEnabled()).to.be.equal(true);
    });
    it("should support ERC1155 interface", async function () {
      expect(await collectibleContract.supportsInterface(ERC1155_INTERFACE_ID)).to.be.true;
    });
    it("should not support ERC721 interface", async function () {
      expect(await collectibleContract.supportsInterface(ERC721_INTERFACE_ID)).to.be.false;
    });
    it("should restrict calling mint to MINTER_ROLE with accessControlEnabled = true", async function () {
      await expect(collectibleContract.connect(testUsers[1])
        .mint(testUsers[5].address, 1111, 10, '0x6732'))
        .to.be.revertedWith(`ETT: you must have 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6 role to perform this action`);
    });
    it("should restrict calling mintBatch to MINTER_ROLE with accessControlEnabled = true", async function () {
      await expect(collectibleContract.connect(testUsers[1])
        .mintBatch(
          testUsers[5].address,
          [1111, 2222],
          [10, 20],
          '0x6732',
        ))
        .to.be.revertedWith(`ETT: you must have 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6 role to perform this action`);
    });
    it("should allow calling mint to MINTER_ROLE with accessControlEnabled = true", async function () {
      const actor = testUsers[19];
      await collectibleContract.grantRole(MINTER_ROLE, actor.address);
      expect(await collectibleContract.mint(testUsers[3].address, 122202, 100, '0xff'));
    });
    it("should allow calling mintBatch to MINTER_ROLE with accessControlEnabled = true", async function () {
      const actor = testUsers[19];
      await collectibleContract.grantRole(MINTER_ROLE, actor.address);
      expect(await collectibleContract.mintBatch(
        testUsers[3].address,
        [1111, 2222],
        [10, 20],
        '0xff'
      ));
    });
    it("should set enableAccessControl to false by calling toggleAccessControl", async function () {
      await collectibleContract.toggleAccessControl(false);
      expect(await collectibleContract.isAccessControlEnabled()).to.be.equal(false);
    });
    it("should revert mint to invalid destination = address(0)", async function () {
      const tokenId = 1111;
      const tokenAmount = 100;
      await expect(collectibleContract.mint(
        ethers.constants.AddressZero,
        tokenId,
        tokenAmount,
        '0x6732'
      )).to.be.revertedWith("ERC1155: mint to the zero address");
    });
    it("should revert mint to invalid destination = address(contract)", async function () {
      const tokenId = 1111;
      const tokenAmount = 100;
      await expect(collectibleContract.mint(
        collectibleContract.address,
        tokenId,
        tokenAmount,
        '0x6732'
      )).to.be.revertedWith("ERC1155: transfer to non ERC1155Receiver implementer");
    });
    it("should mint collectible tokens", async function () {
      const tokenId = 1111;
      const tokenAmount = 100;
      await collectibleContract.mint(testUsers[5].address, tokenId, tokenAmount, '0x6732');
      expect(await collectibleContract.balanceOf(testUsers[5].address, tokenId)).to.be.equal(tokenAmount);
    });
    it("should revert burnBatch when caller is not owner", async function () {
      const owner = testUsers[15];
      const tokens = [9001, 9011, 9111];
      const amounts = [10, 100, 1000];
      await collectibleContract.mintBatch(owner.address, tokens, amounts, '0x6732');
      await expect(collectibleContract.connect(testUsers[16]).burnBatch(owner.address, tokens, amounts))
        .to.be.revertedWith("ETT: caller is not owner nor approved nor admin");
    });
    it("should transferBatch when caller is owner", async function () {
      const owner = testUsers[15];
      const tokens = [2001, 2011, 2111];
      const amounts = [10, 100, 1000];
      await collectibleContract.mintBatch(owner.address, tokens, amounts, '0x6732');
      await expect(collectibleContract.connect(testUsers[15]).safeBatchTransferFrom(owner.address, testUsers[16].address, tokens, amounts, "0x6732"))
    });
    it("should burnBatch by owner", async function () {
      const owner = testUsers[15];
      const tokens = [9002, 9003, 9004];
      const amounts = [10, 10, 10];
      await collectibleContract.mintBatch(owner.address, tokens, amounts, '0x6732');
      expect(await collectibleContract.connect(owner).burnBatch(owner.address, tokens, amounts));
    });
    it("should burnBatch by admin", async function () {
      const owner = testUsers[15];
      const tokens = [9003];
      const amounts = [10];
      await collectibleContract.mintBatch(owner.address, tokens, amounts, '0x6732');
      expect(await collectibleContract.burnBatch(owner.address, tokens, amounts));
    });
    it("should burnBatch by admin not all", async function () {
      const owner = testUsers[15];
      const tokens = [9007];
      const amounts = [10];
      await collectibleContract.mintBatch(owner.address, tokens, amounts, '0x6732');
      expect(await collectibleContract.burnBatch(owner.address, tokens, [5]));
    });
    it("should revert get uri for non-existing token", async function () {
      await expect(collectibleContract.uri(9876987))
        .to.be.revertedWith("ETT: token does not exist");
    });
    it("should get token uri", async function () {
      const tokenId = 100010;
      const expected = BASE_TOKEN_URI + tokenId;
      await collectibleContract.mint(testUsers[6].address, tokenId, 100, '0x6732');
      expect(await collectibleContract.uri(tokenId)).to.be.equal(expected);
    });
    it("should setURI for lazy minted token", async function () {
      expect(await collectibleContract.setURI(504030201, "full-token-uri-without-base-part"));
    });
    it("should get tokenURI for lazy minted token without base part", async function () {
      const tokenId = 654987;
      const tokenUri = "test";
      await collectibleContract.setURI(tokenId, tokenUri);
      expect(await collectibleContract.uri(tokenId)).to.be.equal(tokenUri);
    });
    it("should restrict setURI on minted token for owner only", async function () {
      const owner = testUsers[1];
      const tokenId = 1312312344;
      await collectibleContract.grantRole(MINTER_ROLE, owner.address);
      await collectibleContract.connect(owner).mint(owner.address, tokenId, 10, "0xff");
      await expect(collectibleContract.connect(testUsers[2]).setURI(tokenId, "new-token-uri"))
        .to.be.revertedWith("ETT: you are not the owner of this token");
    });
    it("should setURI on minted token by owner", async function () {
      const owner = testUsers[2];
      const tokenId = 1312312345;
      const tokenUri = "my-token-uri";
      await collectibleContract.grantRole(MINTER_ROLE, owner.address);
      await collectibleContract.connect(owner).mint(owner.address, tokenId, 10, "0xff");
      await collectibleContract.connect(owner).setURI(tokenId, tokenUri);
      expect(await collectibleContract.uri(tokenId)).to.be.equal(tokenUri);
    });
    it("should restrict calling updateBaseURI to DEFAULT_ADMIN_ROLE", async function () {
      const actor = testUsers[5];
      await expect(collectibleContract.connect(actor).updateBaseURI("test"))
        .to.be.revertedWith(`AccessControl: account ${actor.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
    });
    it("should update base token URI", async function () {
      const tokenId = 88848;
      const newBaseURI = "test_update/";
      const expected = newBaseURI + tokenId;
      await collectibleContract.mint(testUsers[6].address, tokenId, 100, '0x6732');
      await collectibleContract.updateBaseURI(newBaseURI);
      expect(await collectibleContract.uri(tokenId)).to.be.equal(expected);
    });
    it("should revert calling pause for non-pauser role", async function () {
      const actor = testUsers[2];
      await expect(collectibleContract.connect(actor).pause())
        .to.be.revertedWith(`AccessControl: account ${actor.address.toLowerCase()} is missing role ${PAUSER_ROLE}`);
    });
    it("should revert calling unpause for non-pauser role", async function () {
      const actor = testUsers[2];
      await expect(collectibleContract.connect(actor).unpause())
        .to.be.revertedWith(`AccessControl: account ${actor.address.toLowerCase()} is missing role ${PAUSER_ROLE}`);
    });
    it("should pause contract", async function () {
      await collectibleContract.pause();
      expect(await collectibleContract.paused()).to.be.true;
    });
    it("should unpause contract", async function () {
      await collectibleContract.unpause();
      expect(await collectibleContract.paused()).to.be.false;
    });
    it("should revert transfer when paused", async function () {
      const owner = testUsers[1];
      const receiver = testUsers[2];
      const tokenId = 904444;
      await collectibleContract.mint(owner.address, tokenId, 10, '0xff');
      await collectibleContract.pause();
      await expect(collectibleContract.connect(owner).safeTransferFrom(
        owner.address,
        receiver.address,
        tokenId,
        10,
        '0xff'
      )).to.be.revertedWith("ETT: token transfer while paused");
      await collectibleContract.unpause();
    });
    it("should mint batch tokens", async function () {
      const tokens = [88800, 88801, 88802];
      const amounts = [10, 100, 1000];
      expect(await collectibleContract.mintBatch(testUsers[15].address, tokens, amounts, '0x6732'));
    });
    it("should revert burn by not owner, not approved or not admin", async function () {
      const tokenId = 1234;
      const amount = 10;
      const tokenOwner = testUsers[5];
      await collectibleContract.mint(tokenOwner.address, tokenId, amount, '0x6732');
      await expect(collectibleContract.connect(testUsers[3]).burn(tokenOwner.address, tokenId, amount))
        .to.be.revertedWith("ETT: caller is not owner nor approved nor admin");
    });
    it("should burn own token", async function () {
      const tokenId = 1234;
      const amount = 10;
      const tokenOwner = testUsers[5];
      await collectibleContract.mint(tokenOwner.address, tokenId, amount, '0x6732');
      await expect(collectibleContract.connect(tokenOwner).burn(tokenOwner.address, tokenId, amount))
        .to.emit(collectibleContract, "TransferSingle")
        .withArgs(tokenOwner.address, tokenOwner.address, ethers.constants.AddressZero, tokenId, amount);
    });
    it("should revert mint to invalid destination = address(0)", async function () {
      const tokenId = 1111;
      const tokenAmount = 100;
      await expect(collectibleContract.mint(
        ethers.constants.AddressZero,
        tokenId,
        tokenAmount,
        '0x6732'
      )).to.be.revertedWith("ERC1155: mint to the zero address");
    });
    it("should revert mint to invalid destination = address(contract)", async function () {
      const tokenId = 1111;
      const tokenAmount = 100;
      await expect(collectibleContract.mint(
        collectibleContract.address,
        tokenId,
        tokenAmount,
        '0x6732'
      )).to.be.revertedWith("ERC1155: transfer to non ERC1155Receiver implementer");
    });
    it("should burn token by admin", async function () {
      const tokenId = 12345;
      const amount = 10;
      const tokenOwner = testUsers[6];
      await collectibleContract.mint(
        tokenOwner.address,
        tokenId,
        amount,
        '0x6732'
      );
      await expect(collectibleContract.burn(tokenOwner.address, tokenId, amount))
        .to.emit(collectibleContract, "TransferSingle")
        .withArgs(testUsers[0].address, tokenOwner.address, ethers.constants.AddressZero, tokenId, amount);
    });
    it("should mint collectible tokens & transfer", async function () {
      const tokenId = 1112;
      const tokenAmount = 100;
      const receiver = testUsers[5];
      const sender = testUsers[6];
      await collectibleContract.mint(sender.address, tokenId, tokenAmount, '0x6732');
      await collectibleContract.connect(sender).safeTransferFrom(sender.address, receiver.address, tokenId, 30, '0x6732');
      await collectibleContract.connect(sender).safeTransferFrom(sender.address, receiver.address, tokenId, 10, '0x6732');
      await collectibleContract.connect(receiver).safeTransferFrom(receiver.address, sender.address, tokenId, 30, '0x6732');
      expect(await collectibleContract.balanceOf(sender.address, tokenId)).to.be.equal(tokenAmount - 10);
    });
    it("should get collectible tokens info", async function () {
      const tokenId = 111233;
      const tokenAmount = 100;
      const receiver = testUsers[5];
      const sender = testUsers[6];
      await collectibleContract.mint(sender.address, tokenId, tokenAmount, '0x6732');
      await collectibleContract.freezeToken(tokenId);
      let tokens = await collectibleContract.getAllUserTokens(sender.address);
      await expect(collectibleContract.connect(sender).safeTransferFrom(sender.address, receiver.address, tokenId, 30, '0x6732')).to.be.revertedWith("ETT: token transfer while freezed")
      expect(await collectibleContract.balanceOf(sender.address, tokenId)).to.be.equal(tokenAmount);
    });
    it("should mint collectible tokens & transfer & mint additional copies", async function () {
      const tokenId = 11123;
      const tokenAmount = 100;
      const receiver = testUsers[5];
      const sender = testUsers[6];
      await collectibleContract.mint(sender.address, tokenId, tokenAmount, '0x6732');
      await collectibleContract.connect(sender).safeTransferFrom(sender.address, receiver.address, tokenId, 30, '0x6732');
      await collectibleContract.connect(sender).safeTransferFrom(sender.address, receiver.address, tokenId, 10, '0x6732');
      await collectibleContract.connect(receiver).safeTransferFrom(receiver.address, sender.address, tokenId, 30, '0x6732');
      expect(await collectibleContract.balanceOf(sender.address, tokenId)).to.be.equal(tokenAmount - 10);
      await collectibleContract.mint(sender.address, tokenId, 10, '0x6732');
      expect(await collectibleContract.balanceOf(sender.address, tokenId)).to.be.equal(tokenAmount);
    });
    it("should burn token by admin partly", async function () {
      const tokenId = 123456;
      const amount = 10;
      const tokenOwner = testUsers[6];
      await collectibleContract.mint(
        tokenOwner.address,
        tokenId,
        amount,
        '0x6732'
      );
      await expect(collectibleContract.burn(tokenOwner.address, tokenId, 5))
        .to.emit(collectibleContract, "TransferSingle")
        .withArgs(testUsers[0].address, tokenOwner.address, ethers.constants.AddressZero, tokenId, 5);
      expect(await collectibleContract.balanceOf(tokenOwner.address, tokenId)).to.be.equal(amount - 5);
    });
  });
});
