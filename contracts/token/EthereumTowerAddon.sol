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

contract EthereumTowerCollectibleAddon is
    Initializable,
    AccessControlEnumerableUpgradeable,
    ERC1155HolderUpgradeable,
    EIP712Upgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string private constant SIGNING_DOMAIN = "ETT_VOUCHER";
    string private constant SIGNATURE_VERSION = "1";

    address private nftCollectibleAddress;
    address private serviceAddress;

    mapping(bytes => bool) private signatureUsed;

    struct InstantMintVoucher {
        uint256 tokenId;
        address author;
        uint256 amount;
        uint256 nonce;
        bytes signature;
        bytes serviceSignature;
    }

    struct AirdropVoucher {
        uint256[] tokenId;
        address[] to;
        address author;
        uint256[] amount;
        uint256 nonce;
        bytes signature;
        bytes serviceSignature;
    }

    function initialize(
        address _nftCollectibleAddress,
        address _serviceAddress
    ) public initializer {
        __EIP712_init(SIGNING_DOMAIN, SIGNATURE_VERSION);
        nftCollectibleAddress = _nftCollectibleAddress;
        serviceAddress = _serviceAddress;

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

    function mintByVoucher(InstantMintVoucher calldata voucher)
        public
        whenNotPaused
        validDestination(voucher.author)
        returns (uint256)
    {
        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );
        (address authorAddress, address serviceSignerAddress) = _verify(
            voucher
        );

        require(
            serviceSignerAddress == serviceAddress &&
                authorAddress == voucher.author,
            "ETT: invalid signatures"
        );

        require(
            !signatureUsed[voucher.serviceSignature],
            "ETT: this voucher already used"
        );

        require(voucher.author == _msgSender(), "ETT: wrong caller");
        require(voucher.amount > 0, "ETT: amount must be positive number");

        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );

        EthereumTowerCollectible(nftCollectibleAddress).mint(
            voucher.author,
            voucher.tokenId,
            voucher.amount,
            ""
        );

        _markSignatureUsed(voucher.serviceSignature);

        return voucher.tokenId;
    }

    function airdrop(AirdropVoucher calldata voucher)
        public
        whenNotPaused
        validDestination(voucher.author)
    {
        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );

        (address authorAddress, address serviceSignerAddress) = _verify(
            voucher
        );

        require(
            serviceSignerAddress == serviceAddress &&
                authorAddress == voucher.author,
            "ETT: invalid signatures"
        );

        require(
            !signatureUsed[voucher.serviceSignature],
            "ETT: this voucher already used"
        );

        require(voucher.author == _msgSender(), "ETT: wrong caller");

        require(
            _validateMintConditions(voucher.author),
            "ETT: invalid mint conditions"
        );
        for (uint256 i = 0; i < voucher.tokenId.length; i++) {
            EthereumTowerCollectible(nftCollectibleAddress).mint(
                voucher.to[i],
                voucher.tokenId[i],
                voucher.amount[i],
                ""
            );
        }
        _markSignatureUsed(voucher.serviceSignature);
    }

    function _hash(InstantMintVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "InstantMintVoucher(uint256 tokenId,address author,uint256 amount,uint256 nonce)"
                        ),
                        voucher.tokenId,
                        voucher.author,
                        voucher.amount,
                        voucher.nonce
                    )
                )
            );
    }

    function _hash(AirdropVoucher calldata voucher)
        internal
        view
        returns (bytes32)
    {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "AirdropVoucher(uint256[] tokenId,address[] to,address author,uint256[] amount,uint256 nonce)"
                        ),
                        keccak256(abi.encodePacked(voucher.tokenId)),
                        keccak256(abi.encodePacked(voucher.to)),
                        voucher.author,
                        keccak256(abi.encodePacked(voucher.amount)),
                        voucher.nonce
                    )
                )
            );
    }

    function _verify(InstantMintVoucher calldata voucher)
        internal
        view
        returns (address, address)
    {
        bytes32 digest = _hash(voucher);

        address artAuthorAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.signature
        );
        address serviceSignerAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.serviceSignature
        );

        return (artAuthorAddress, serviceSignerAddress);
    }

    function _verify(AirdropVoucher calldata voucher)
        internal
        view
        returns (address, address)
    {
        bytes32 digest = _hash(voucher);

        address artAuthorAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.signature
        );
        address serviceSignerAddress = ECDSAUpgradeable.recover(
            digest,
            voucher.serviceSignature
        );
        return (artAuthorAddress, serviceSignerAddress);
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
