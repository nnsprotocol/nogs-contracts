// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract NogsRewarder is Initializable, OwnableUpgradeable {
    using ECDSA for bytes32;

    IERC20 private _erc20;
    address private _signer;

    mapping(uint256 => bool) _claims;

    event RewardClaimed(
        address indexed claimant,
        uint256 indexed claimId,
        uint256 amount
    );

    function initialize(
        address erc20Addr,
        address signerAddr
    ) public initializer {
        __Ownable_init();
        _erc20 = IERC20(erc20Addr);
        _signer = signerAddr;
    }

    function updateClaimSigner(address addr) external onlyOwner {
        _signer = addr;
    }

    function erc20() public view returns (address) {
        return address(_erc20);
    }

    function claimSigner() public view returns (address) {
        return _signer;
    }

    function claimUsed(uint256 claimId) public view returns (bool) {
        return _claims[claimId];
    }

    function claim(
        uint256 claimId,
        uint256 amount,
        uint256 expiry,
        bytes memory signature
    ) external {
        bytes32 txHash = keccak256(
            abi.encodePacked(msg.sender, block.chainid, claimId, amount, expiry)
        );
        address msgSigner = txHash.toEthSignedMessageHash().recover(signature);
        require(msgSigner == _signer, "invalid signature");

        require(block.timestamp < expiry, "claim expired");
        require(!_claims[claimId], "already claimed");

        _claims[claimId] = true;
        _erc20.transfer(msg.sender, amount);
        emit RewardClaimed(msg.sender, claimId, amount);
    }
}
