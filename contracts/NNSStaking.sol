// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract NNSStaking is ERC721Holder, Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct Stake {
        uint256 tokenId;
        /// @dev when the stake started.
        uint256 startTime;
        /// @dev when the stake ended.
        uint256 endTime;
    }

    /// @dev Mapping of owner -> stakes
    mapping(address => Stake[]) public stakes;
    /// @dev Mapping of tokenId to index of the latest stake in stakes.
    mapping(uint256 => uint256) public tokenIdToStakeIdx;

    /// @dev Keep track of used nonces for each wallet.
    mapping(address => mapping(uint256 => bool)) usedNonces;

    /// @dev Mapping of last withdraw for a wallet.
    mapping(address => uint256) lastWithdraw;

    /// @dev NFT that can be staked.
    IERC721 public nft;
    /// @dev Coins that are rewarded.
    IERC20 public coin;
    /// @dev Signer of the signature to claim.
    address public signer;

    event Staked(
        address indexed staker,
        uint256 indexed tokenId,
        uint256 startTime
    );
    event Unstaked(
        address indexed staker,
        uint256 indexed tokenId,
        uint256 startTime,
        uint256 endTime
    );
    event Rewarded(address indexed staker, uint256 value);

    function initialize(
        IERC721 _nft,
        IERC20 _coin,
        address _signer
    ) public initializer {
        __ReentrancyGuard_init();
        nft = _nft;
        coin = _coin;
        signer = _signer;
    }

    function stake(uint256[] calldata _tokenIds) public nonReentrant {
        require(_tokenIds.length > 0, "nothing to stake");
        for (uint256 i; i < _tokenIds.length; ++i) {
            _stake(_tokenIds[i]);
        }
    }

    function _stake(uint256 _tokenId) private {
        require(
            IERC721(nft).ownerOf(_tokenId) == msg.sender,
            "you do not own this nft"
        );
        stakes[msg.sender].push(
            Stake({tokenId: _tokenId, startTime: block.timestamp, endTime: 0})
        );
        tokenIdToStakeIdx[_tokenId] = stakes[msg.sender].length - 1;
        IERC721(nft).safeTransferFrom(msg.sender, address(this), _tokenId);
        emit Staked(msg.sender, _tokenId, block.timestamp);
    }

    function unstake(uint256[] calldata _tokenIds) public nonReentrant {
        require(_tokenIds.length > 0, "nothing to unstake");
        for (uint256 i; i < _tokenIds.length; ++i) {
            _unstake(_tokenIds[i]);
        }
    }

    function _unstake(uint256 _tokenId) private {
        uint256 idx = tokenIdToStakeIdx[_tokenId];
        require(idx < stakes[msg.sender].length, "no stake to withdraw");
        Stake storage s = stakes[msg.sender][idx];

        require(
            s.tokenId == _tokenId && s.startTime > 0,
            "no stake to withdraw"
        );
        require(s.endTime == 0, "stake already withdrawn");
        s.endTime = block.timestamp;
        delete tokenIdToStakeIdx[_tokenId];
        IERC721(nft).safeTransferFrom(address(this), msg.sender, _tokenId);
        emit Unstaked(msg.sender, _tokenId, s.startTime, block.timestamp);
    }

    function getStakes(
        address _owner
    ) public view returns (Stake[] memory st, uint256 lastWithdrawTime) {
        return (stakes[_owner], lastWithdraw[_owner]);
    }

    function withdraw(
        uint256 value,
        uint256 nonce,
        uint256 expiry,
        bytes memory signature
    ) public nonReentrant {
        require(!usedNonces[msg.sender][nonce], "nonce already used");
        bytes32 hash = keccak256(
            abi.encodePacked(msg.sender, value, nonce, expiry)
        );
        address msgSigner = hash.toEthSignedMessageHash().recover(signature);
        require(msgSigner == signer, "invalid signature");
        require(expiry > block.timestamp, "expired");

        usedNonces[msg.sender][nonce] = true;
        coin.safeTransfer(msg.sender, value);
        lastWithdraw[msg.sender] = block.timestamp;

        emit Rewarded(msg.sender, value);
    }
}
