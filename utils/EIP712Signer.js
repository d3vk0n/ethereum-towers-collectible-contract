


const EthereumTowerVoucherType = {
  Voucher: [
    { name: "target", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "fixPrice", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "author", type: "address" },
    { name: "tokenOwner", type: "address" },
    { name: "serviceAddress", type: "address" },
    { name: "isFirstSale", type: "bool" }
  ]
};

const TakerOrderVoucherType = {
  TakerOrderVoucher: [
    { name: "tokenId", type: "uint256" },
    { name: "taker", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "makerOrderSig", type: "bytes" }
  ]
};

const InstantMintMultiVoucherType = {
  InstantMintVoucher: [
    { name: "tokenId", type: "uint256" },
    { name: "author", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" }
  ]
};
const AirdropMintMultiVoucherType = {
  AirdropVoucher: [
    { name: "tokenId", type: "uint256[]" },
    { name: "to", type: "address[]" },
    { name: "author", type: "address" },
    { name: "amount", type: "uint256[]" },
    { name: "nonce", type: "uint256" }
  ]
};

function getRandomInt() {
  return Math.floor(Math.random() * 1000000000000);
}

class EIP712Signer {
  constructor({ signing_domain, signature_version, contract, serviceAddress }) {
    this.signing_domain = signing_domain;
    this.signature_version = signature_version;
    this.contract = contract;
    this.serviceAddress = serviceAddress;
  }

  async signVoucher(voucher, types, signer) {
    const domain = await this._signingDomain();
    const signature = await signer._signTypedData(domain, types, voucher);

    return {
      ...voucher,
      signature
    };
  }

  async signTakerVoucher(tokenId, taker, nonce, makerOrderSig) {
    const voucher = {
      tokenId: tokenId,
      taker: taker,
      nonce: nonce,
      makerOrderSig: makerOrderSig
    };

    const domain = await this._signingDomain();
    const signature = await this.serviceAddress._signTypedData(domain, TakerOrderVoucherType, voucher);

    return {
      ...voucher,
      serviceSignature: signature
    };
  }

  async signInstantMint(voucher, types, signer) {
    const domain = await this._signingDomain();
    const signature = await signer._signTypedData(domain, types, voucher);
    const serviceSignature = await this.serviceAddress._signTypedData(domain, types, voucher);
    return {
      ...voucher,
      signature: signature,
      serviceSignature: serviceSignature
    };
  }

  async signInstantMintWrong(voucher, types, signer, wrongService) {
    const domain = await this._signingDomain();
    const signature = await signer._signTypedData(domain, types, voucher);
    const serviceSignature = await wrongService._signTypedData(domain, types, voucher);

    return {
      ...voucher,
      signature: signature,
      serviceSignature: serviceSignature
    };
  }

  async _signingDomain() {
    if (this._domain != void (0)) {
      return this._domain;
    }

    const chainId = await this.contract.getChainId();
    this._domain = {
      name: this.signing_domain,
      version: this.signature_version,
      verifyingContract: this.contract.address,
      chainId: chainId
    };

    return this._domain;
  }
}

module.exports = {
  EIP712Signer,
  EthereumTowerVoucherType,
  TakerOrderVoucherType,
  InstantMintMultiVoucherType,
  AirdropMintMultiVoucherType,
  getRandomInt
}
