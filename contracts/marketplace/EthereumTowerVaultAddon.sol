//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "../interfaces/IEthereumTowerErc1155.sol";
import "../token/EthereumTowerErc1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract EthereumTowerVaultAddon is
    Initializable,
    AccessControlEnumerableUpgradeable,
    ERC1155HolderUpgradeable,
    EIP712Upgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20;
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string private constant SIGNING_DOMAIN = "ETT_VOUCHER";
    string private constant SIGNATURE_VERSION = "1";

    address private nftCollectibleAddress;
    address private serviceAddress;
    address private paymentToken;
    address private paymentReceiver;

    mapping(bytes => bool) private signatureUsed;

    struct VaultBuyVoucher {
        address buyer;
        uint256 amount;
        uint256 nonce;
        bytes serviceSignature;
    }

    struct VaultBuyVoucherFe {
        address buyer;
        uint256 nonce;
        bytes buyerSignature;
    }

    struct VaultRewardVoucher {
        uint256[] tokenId;
        address to;
        address author;
        uint256[] amount;
        uint256[] totalAmount;
        uint256 nonce;
        bytes serviceSignature;
    }
    event RewardSended(
        address indexed to,
        uint256[] indexed tokenIds,
        uint256[] indexed amount
    );
    event VaultSold(
        address indexed buyer,
        uint256 indexed amount,
        uint256 indexed nonce
    );

    function initialize(
        address _nftCollectibleAddress,
        address _serviceAddress,
        address _paymentToken,
        address _paymentReceiver
    ) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        nftCollectibleAddress = _nftCollectibleAddress;
        serviceAddress = _serviceAddress;
        paymentToken = _paymentToken;
        paymentReceiver = _paymentReceiver;

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
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

    function getChainId() external view returns (uint256) {
        return block.chainid;
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

    function updatePaymentReceiverAddress(address _paymentReceiver) external {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: missing required role"
        );

        require(
            !_isContract(_paymentReceiver),
            "ETT: contract cannot be receiver"
        );

        paymentReceiver = _paymentReceiver;
    }

    function buyVault(
        VaultBuyVoucher calldata voucher,
        VaultBuyVoucherFe calldata feVoucher
    ) public whenNotPaused {
        address buyerAddress = _verify(feVoucher);
        address serviceSignerAddress = _verify(voucher);
        require(voucher.buyer == feVoucher.buyer, "Buyer dont match");

        require(
            serviceSignerAddress == serviceAddress &&
                buyerAddress == voucher.buyer,
            "ETT: invalid signatures"
        );

        require(
            !signatureUsed[voucher.serviceSignature],
            "ETT: this voucher already used"
        );

        require(voucher.buyer == _msgSender(), "ETT: wrong caller");

        require(voucher.amount > 0, "ETT: amount should be positive number");
        require(
            IERC20(paymentToken).allowance(voucher.buyer, address(this)) >=
                voucher.amount,
            "ETT: Not enough allowance for contract"
        );

        IERC20(paymentToken).transferFrom(
            voucher.buyer,
            paymentReceiver,
            voucher.amount
        );
        _markSignatureUsed(voucher.serviceSignature);
        emit VaultSold(voucher.buyer, voucher.amount, voucher.nonce);
    }

    function sendReward(VaultRewardVoucher calldata voucher)
        public
        whenNotPaused
        validDestination(voucher.author)
    {
        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );

        address serviceSignerAddress = _verify(voucher);

        require(
            serviceSignerAddress == serviceAddress,
            "ETT: invalid signatures"
        );

        require(
            !signatureUsed[voucher.serviceSignature],
            "ETT: this voucher already used"
        );

        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );
        require(
            voucher.tokenId.length == voucher.amount.length,
            "ETT: check voucher tokenId & amount"
        );
        for (uint256 i = 0; i < voucher.amount.length; i++) {
            require(
                voucher.totalAmount[i] >=
                    EthereumTowerCollectible(nftCollectibleAddress).totalSupply(
                        voucher.tokenId[i]
                    ) +
                        voucher.amount[i],
                "Check max copies"
            );
        }

        for (uint256 i = 0; i < voucher.tokenId.length; i++) {
            EthereumTowerCollectible(nftCollectibleAddress).mint(
                voucher.to,
                voucher.tokenId[i],
                voucher.amount[i],
                ""
            );
        }
        _markSignatureUsed(voucher.serviceSignature);
        emit RewardSended(voucher.to, voucher.tokenId, voucher.amount);
    }

    function _hash(VaultBuyVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "VaultBuyVoucher(address buyer,uint256 amount,uint256 nonce)"
                        ),
                        voucher.buyer,
                        voucher.amount,
                        voucher.nonce
                    )
                )
            );
    }

    function _hash(VaultBuyVoucherFe calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "VaultBuyVoucher(address buyer,uint256 nonce)"
                        ),
                        voucher.buyer,
                        voucher.nonce
                    )
                )
            );
    }

    function _verify(VaultBuyVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);

        address serviceSignerAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.serviceSignature
        );
        return serviceSignerAddress;
    }

    function _verify(VaultBuyVoucherFe calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);

        address artBuyerAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.buyerSignature
        );
        return artBuyerAddress;
    }

    function _hash(VaultRewardVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "VaultRewardVoucher(uint256[] tokenId,address to,address author,uint256[] amount,uint256[] totalAmount,uint256 nonce)"
                        ),
                        keccak256(abi.encodePacked(voucher.tokenId)),
                        voucher.to,
                        voucher.author,
                        keccak256(abi.encodePacked(voucher.amount)),
                        keccak256(abi.encodePacked(voucher.totalAmount)),
                        voucher.nonce
                    )
                )
            );
    }

    function _verify(VaultRewardVoucher calldata voucher)
        internal
        view
        returns (address)
    {
        bytes32 digest = _hash(voucher);

        address serviceSignerAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.serviceSignature
        );
        return (serviceSignerAddress);
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
