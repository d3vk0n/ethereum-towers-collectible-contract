const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TokenSchema = new Schema({
    voucher: {
        target: { type: String },
        tokenId: { type: Number },
        fixPrice: { type: Object },
        amount: { type: Number },
        author: { type: String },
        tokenOwner: { type: String },
        royaltyFee: { type: Number },
        isFirstSale: { type: Boolean },
        serviceAddress: { type: String },
        signature: { type: String }
    },
    takerVoucher: {
        tokenId: { type: Number },
        taker: { type: String },
        nonce: { type: Number },
        makerOrderSig: { type: String },
        serviceSignature: { type: String }
    }
})

const Token = mongoose.model("Token", TokenSchema);
module.exports = Token