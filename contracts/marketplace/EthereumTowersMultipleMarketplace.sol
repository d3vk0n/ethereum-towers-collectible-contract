//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "../interfaces/IEthereumTowerErc1155.sol";
import "../library/PaymentHelper.sol";
import "../token/EthereumTowerErc1155.sol";

contract EthereumTowersCollectibleMarket is
    Initializable,
    AccessControlEnumerableUpgradeable,
    ERC1155HolderUpgradeable,
    EIP712Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes4 public constant ERC1155_INTERFACE_ID = 0xd9b67a26;

    string private constant SIGNING_DOMAIN = "ETT_VOUCHER";
    string private constant SIGNATURE_VERSION = "1";

    address private nftCollectibleAddress;
    address private serviceFeeAddress;
    uint256 public serviceFeePercent;
    address private serviceAddress;
    address public paymentToken;

    mapping(bytes => bool) private signatureUsed;

    function initialize(
        address _nftCollectibleAddress,
        address _serviceFeeAddress,
        address _paymentToken,
        address _serviceAddress
    ) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        serviceFeeAddress = payable(_serviceFeeAddress);
        paymentToken = _paymentToken;
        nftCollectibleAddress = _nftCollectibleAddress;
        serviceAddress = _serviceAddress;
        serviceFeePercent = 0.02e18;

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
    }

    struct TakerOrderVoucher {
        uint256 tokenId;
        address taker;
        uint256 nonce;
        bytes makerOrderSig;
        bytes serviceSignature;
    }

    struct Voucher {
        address target;
        uint256 tokenId;
        uint256 fixPrice;
        uint256 amount;
        address author;
        address tokenOwner;
        address serviceAddress;
        bool isFirstSale;
        bytes signature;
    }

    event FixPriceRedeem(
        address indexed seller,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 amount
    );

    event VaultRedeem(
        address indexed seller,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 amount
    );

    modifier supportsERC1155(address contractAddress) {
        require(
            IERC165(contractAddress).supportsInterface(ERC1155_INTERFACE_ID),
            "ETT: the provided contract does not support ERC1155 interface"
        );
        _;
    }

    modifier validDestination(address to) {
        require(to != address(0), "ETT: transfer to zero address");
        require(to != address(this), "ETT: transfer to contract");
        _;
    }

    function authorHasRole(
        address nftContractAddress,
        bytes32 authorRole,
        address author
    ) public view returns (bool) {
        return
            EthereumTowerCollectible(nftContractAddress).hasRole(
                authorRole,
                author
            );
    }

    function _validateMintConditions(address author)
        internal
        view
        returns (bool)
    {
        require(
            authorHasRole(nftCollectibleAddress, MINTER_ROLE, author),
            "ETT: minting not allowed, author does not have minter role"
        );
        return true;
    }

    function _validateTakerOrderParams(TakerOrderVoucher memory takerOrder)
        internal
        view
        returns (bool)
    {
        if (takerOrder.taker == address(0)) {
            return false;
        }

        if (signatureUsed[takerOrder.serviceSignature]) {
            return false;
        }

        return true;
    }

    function _markSignatureUsed(bytes memory takerOrderSig) internal {
        signatureUsed[takerOrderSig] = true;
    }

    function _matchSignatures(bytes memory left, bytes memory right)
        internal
        pure
        returns (bool)
    {
        return keccak256(left) == keccak256(right);
    }

    function _isContract(address addr) internal view returns (bool) {
        return addr.code.length > 0;
    }

    function updateServiceAddress(address _serviceAddress) external {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: missing required role"
        );

        require(
            !_isContract(_serviceAddress),
            "ETT: contract cannot be signer"
        );

        serviceAddress = _serviceAddress;
    }

    function pause() public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()) ||
                hasRole(PAUSER_ROLE, _msgSender()),
            "ETT: missing required role"
        );

        _pause();
    }

    function unpause() public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()) ||
                hasRole(PAUSER_ROLE, _msgSender()),
            "ETT: missing required role"
        );

        _unpause();
    }

    function updateServiceFeeAddress(address _serviceFeeAddress) external {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: missing required role"
        );

        serviceFeeAddress = _serviceFeeAddress;
    }

    function updateServiceFeePercent(uint256 _serviceFeePercent) external {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: missing required role"
        );
        require(_serviceFeePercent <= 0.2e18, "Check service fee percent");

        serviceFeePercent = _serviceFeePercent;
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    function _nftTransferHelper(
        address nftContractAddress,
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) internal {
        require(
            IERC1155(nftContractAddress).balanceOf(from, tokenId) >= amount,
            "ETT: insufficient tokens to transfer"
        );

        require(
            IERC1155(nftContractAddress).isApprovedForAll(from, address(this)),
            "ETT: contract does not have access to this token."
        );

        IERC1155(nftContractAddress).safeTransferFrom(
            from,
            to,
            tokenId,
            amount,
            data
        );
    }

    function vaultRedeem(
        Voucher calldata voucher,
        TakerOrderVoucher calldata takerOrder,
        uint256 quantity
    )
        public
        whenNotPaused
        supportsERC1155(voucher.target)
        nonReentrant
        returns (uint256)
    {
        require(
            _validateTakerOrderParams(takerOrder),
            "ETT: taker order not valid"
        );

        require(
            _verify(voucher) == voucher.tokenOwner,
            "ETT: invalid maker order signer"
        );

        require(
            _verify(takerOrder) == serviceAddress &&
                voucher.serviceAddress == serviceAddress,
            "ETT: unknown service signer"
        );

        require(
            _matchSignatures(voucher.signature, takerOrder.makerOrderSig) &&
                voucher.tokenId == takerOrder.tokenId,
            "ETT: orders mismatch"
        );

        require(_msgSender() == takerOrder.taker, "ETT: wrong caller");

        require(voucher.amount > 0, "ETT: amount should be positive number");
        require(quantity > 0, "ETT: quantity should be positive number");
        require(
            quantity <= voucher.amount,
            "ETT: quantity should not exceed amount"
        );

        uint256 totalPrice = voucher.fixPrice * quantity;

        require(
            IERC20(paymentToken).allowance(takerOrder.taker, address(this)) >=
                totalPrice,
            "ETT: Not enough allowance for contract"
        );

        if (voucher.isFirstSale) {
            require(voucher.tokenOwner == voucher.author, "ETT: wrong owner");
            require(
                voucher.target == nftCollectibleAddress,
                "ETT: cannot mint on 3rd-party contract"
            );

            require(
                EthereumTowerCollectible(nftCollectibleAddress).totalSupply(
                    voucher.tokenId
                ) +
                    quantity <=
                    voucher.amount,
                "ETT: redeem quantity exceeds token supply amount"
            );

            require(
                _validateMintConditions(voucher.author),
                "ETT: invalid mint conditions"
            );

            EthereumTowerCollectible(nftCollectibleAddress).mint(
                takerOrder.taker,
                voucher.tokenId,
                quantity,
                ""
            );
        } else {
            _nftTransferHelper(
                voucher.target,
                voucher.tokenOwner,
                takerOrder.taker,
                voucher.tokenId,
                quantity,
                ""
            );
        }

        uint256 projectFee = PaymentHelper.percentage(
            totalPrice,
            serviceFeePercent
        );

        uint256 sellerValue = totalPrice - projectFee;

        IERC20(paymentToken).transferFrom(
            takerOrder.taker,
            address(this),
            totalPrice
        );

        IERC20(paymentToken).transfer(serviceFeeAddress, projectFee);
        IERC20(paymentToken).transfer(voucher.tokenOwner, sellerValue);

        _markSignatureUsed(takerOrder.serviceSignature);

        emit VaultRedeem(
            voucher.tokenOwner,
            takerOrder.taker,
            voucher.tokenId,
            quantity
        );

        return voucher.tokenId;
    }

    function redeem(
        Voucher calldata voucher,
        TakerOrderVoucher calldata takerOrder,
        uint256 quantity
    )
        public
        payable
        whenNotPaused
        supportsERC1155(voucher.target)
        nonReentrant
        returns (uint256)
    {
        require(
            _validateTakerOrderParams(takerOrder),
            "ETT: taker order not valid"
        );
        require(
            _verify(voucher) == voucher.tokenOwner,
            "ETT: invalid maker order signer"
        );
        require(
            _verify(takerOrder) == serviceAddress &&
                voucher.serviceAddress == serviceAddress,
            "ETT: unknown service signer"
        );

        require(
            _matchSignatures(voucher.signature, takerOrder.makerOrderSig) &&
                voucher.tokenId == takerOrder.tokenId,
            "ETT: orders mismatch"
        );

        require(_msgSender() == takerOrder.taker, "ETT: wrong caller");

        require(voucher.amount > 0, "ETT: amount should be positive number");
        require(quantity > 0, "ETT: quantity should be positive number");
        require(
            quantity <= voucher.amount,
            "ETT: quantity should not exceed amount"
        );

        uint256 totalPrice = voucher.fixPrice * quantity;

        require(
            IERC20(paymentToken).allowance(takerOrder.taker, address(this)) >=
                totalPrice,
            "ETT: Not enough allowance for contract"
        );

        if (voucher.isFirstSale) {
            require(voucher.tokenOwner == voucher.author, "ETT: wrong owner");
            require(
                voucher.target == nftCollectibleAddress,
                "ETT: cannot mint on 3rd-party contract"
            );

            require(
                EthereumTowerCollectible(nftCollectibleAddress).totalSupply(
                    voucher.tokenId
                ) +
                    quantity <=
                    voucher.amount,
                "ETT: redeem quantity exceeds token supply amount"
            );

            require(
                _validateMintConditions(voucher.author),
                "ETT: invalid mint conditions"
            );

            EthereumTowerCollectible(nftCollectibleAddress).mint(
                takerOrder.taker,
                voucher.tokenId,
                quantity,
                ""
            );
        } else {
            _nftTransferHelper(
                voucher.target,
                voucher.tokenOwner,
                takerOrder.taker,
                voucher.tokenId,
                quantity,
                ""
            );
        }

        uint256 projectFee = PaymentHelper.percentage(
            totalPrice,
            serviceFeePercent
        );

        uint256 sellerValue = totalPrice - projectFee;

        IERC20(paymentToken).transferFrom(
            takerOrder.taker,
            address(this),
            totalPrice
        );

        IERC20(paymentToken).transfer(serviceFeeAddress, projectFee);
        IERC20(paymentToken).transfer(voucher.tokenOwner, sellerValue);

        _markSignatureUsed(takerOrder.serviceSignature);

        emit FixPriceRedeem(
            voucher.tokenOwner,
            takerOrder.taker,
            voucher.tokenId,
            quantity
        );

        return voucher.tokenId;
    }

    function _hash(Voucher calldata voucher) internal view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "Voucher(address target,uint256 tokenId,uint256 fixPrice,uint256 amount,address author,address tokenOwner,address serviceAddress,bool isFirstSale)"
                        ),
                        voucher.target,
                        voucher.tokenId,
                        voucher.fixPrice,
                        voucher.amount,
                        voucher.author,
                        voucher.tokenOwner,
                        voucher.serviceAddress,
                        voucher.isFirstSale
                    )
                )
            );
    }

    function _hash(TakerOrderVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "TakerOrderVoucher(uint256 tokenId,address taker,uint256 nonce,bytes makerOrderSig)"
                        ),
                        voucher.tokenId,
                        voucher.taker,
                        voucher.nonce,
                        keccak256(voucher.makerOrderSig)
                    )
                )
            );
    }

    function _verify(TakerOrderVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);
        return ECDSAUpgradeable.recover(digest, voucher.serviceSignature);
    }

    function _verify(Voucher calldata voucher) internal view returns (address) {
        bytes32 digest = _hash(voucher);
        return ECDSAUpgradeable.recover(digest, voucher.signature);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerableUpgradeable, ERC1155ReceiverUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
