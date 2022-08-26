pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC1155/presets/ERC1155PresetMinterPauserUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IEthereumTowerErc1155.sol";

contract EthereumTowerCollectible is
    Initializable,
    ContextUpgradeable,
    AccessControlEnumerableUpgradeable,
    ERC1155BurnableUpgradeable,
    ERC1155PausableUpgradeable,
    ERC1155SupplyUpgradeable,
    IEthereumTowerErc1155
{
    bool private accessControlEnabled;

    function initialize(string memory uri) public virtual initializer {
        __ERC1155PresetMinterPauser_init(uri);
        accessControlEnabled = false;
    }

    using StringsUpgradeable for uint256;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    mapping(uint256 => string) private tokenIdToURI;
    mapping(uint256 => bool) public freezedToken;
    mapping(address => Token[]) public userOwnedTokens;
    mapping(address => mapping(uint256 => uint256)) public tokenIsAtIndex;
    modifier restrictToRole(bytes32 role) {
        if (accessControlEnabled) {
            require(
                hasRole(role, _msgSender()),
                string(
                    abi.encodePacked(
                        "ETT: you must have ",
                        StringsUpgradeable.toHexString(uint256(role), 32),
                        " role to perform this action"
                    )
                )
            );
        }
        _;
    }

    function __ERC1155PresetMinterPauser_init(string memory uri)
        internal
        onlyInitializing
    {
        __ERC1155_init_unchained(uri);
        __Pausable_init_unchained();
        __ERC1155PresetMinterPauser_init_unchained(uri);
    }

    function __ERC1155PresetMinterPauser_init_unchained(string memory)
        internal
        onlyInitializing
    {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
        _setupRole(PAUSER_ROLE, _msgSender());
    }

    function freezeToken(uint256 tokenId)
        public
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        freezedToken[tokenId] = true;
    }

    function setURI(uint256 tokenId, string memory _tokenURI)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(exists(tokenId), "ETT: tokenId does not exist");
        tokenIdToURI[tokenId] = _tokenURI;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenUrl = tokenIdToURI[tokenId];
        if (bytes(tokenUrl).length > 0) {
            return tokenUrl;
        } else {
            require(exists(tokenId), "ETT: token does not exist");
            string memory baseURI = super.uri(tokenId);
            return
                bytes(baseURI).length > 0
                    ? string(abi.encodePacked(baseURI, tokenId.toString()))
                    : "";
        }
    }

    function pause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()) ||
                hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: you must have PAUSER_ROLE role to perform this action"
        );
        _pause();
    }

    function unpause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()) ||
                hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: you must have PAUSER_ROLE role to perform this action"
        );
        _unpause();
    }

    function updateBaseURI(string memory _baseURI)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setURI(_baseURI);
    }

    function isAccessControlEnabled() external view returns (bool) {
        return accessControlEnabled;
    }

    function getAllUserTokens(address owner)
        external
        view
        returns (Token[] memory)
    {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: caller is not owner nor approved nor admin"
        );
        return userOwnedTokens[owner];
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual restrictToRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
        add(to, id);
    }

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual restrictToRole(MINTER_ROLE) {
        _mintBatch(to, ids, amounts, data);
        for (uint256 i = 0; i < ids.length; i++) {
            add(to, ids[i]);
        }
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public virtual override {
        require(
            account == _msgSender() ||
                isApprovedForAll(account, _msgSender()) ||
                hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: caller is not owner nor approved nor admin"
        );
        _burn(account, id, value);
        remove(id, account);
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory values
    ) public virtual override {
        require(
            account == _msgSender() ||
                isApprovedForAll(account, _msgSender()) ||
                hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "ETT: caller is not owner nor approved nor admin"
        );
        _burnBatch(account, ids, values);
        for (uint256 i = 0; i < ids.length; i++) {
            remove(ids[i], account);
        }
    }

    function toggleAccessControl(bool enabled)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        accessControlEnabled = enabled;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ERC1155: caller is not token owner nor approved"
        );
        _safeTransferFrom(from, to, id, amount, data);
        remove(id, from);
        add(to, id);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override {
        require(
            from == _msgSender() || isApprovedForAll(from, _msgSender()),
            "ETT: caller is not token owner nor approved"
        );
        _safeBatchTransferFrom(from, to, ids, amounts, data);
        for (uint256 i = 0; i < ids.length; i++) {
            remove(ids[i], from);
            add(from, ids[i]);
            add(to, ids[i]);
        }
    }

    function remove(uint256 tokenId, address user) internal {
        uint256 index = tokenIsAtIndex[user][tokenId];
        if (index - 1 >= userOwnedTokens[user].length) {
            return;
        }
        userOwnedTokens[user][index - 1] = userOwnedTokens[user][
            userOwnedTokens[user].length - 1
        ];
        userOwnedTokens[user].pop();
    }

    function add(address user, uint256 tokenId) internal {
        uint256 balance = balanceOf(user, tokenId);
        if (balance > 0) {
            Token memory newToken = Token({
                tokenId: tokenId,
                amount: balanceOf(user, tokenId)
            });
            userOwnedTokens[user].push(newToken);
            uint256 arrayLength = userOwnedTokens[user].length;
            tokenIsAtIndex[user][tokenId] = arrayLength;
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControlEnumerableUpgradeable, ERC1155Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    )
        internal
        virtual
        override(
            ERC1155Upgradeable,
            ERC1155PausableUpgradeable,
            ERC1155SupplyUpgradeable
        )
    {
        require(!paused(), "ETT: token transfer while paused");
        for (uint256 i = 0; i < ids.length; i++) {
            require(!freezedToken[ids[i]], "ETT: token transfer while freezed");
        }
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    uint256[50] private __gap;
}
