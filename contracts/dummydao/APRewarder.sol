// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// APRewarder is a modified version of NogsRewarder used for testing.
contract APRewarder {
    using ECDSA for bytes32;

    IERC20 private _erc20;
    address private _signer;

    mapping(uint256 => bool) _claims;

    event RewardClaimed(
        address indexed claimant,
        uint256 indexed claimId,
        uint256 amount
    );

    constructor(address erc20, address signer) {
        _erc20 = IERC20(erc20);
        _signer = signer;
    }

    function updateClaimSigner(address addr) external {
        _signer = addr;
    }

    function updateERC20(address __erc20) external {
        _erc20 = IERC20(__erc20);
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

    function setClaimUsed(uint256 claimId) external {
        _claims[claimId] = true;
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
        if (address(_erc20) != address(0)) {
            _erc20.transfer(msg.sender, amount);
        }
        emit RewardClaimed(msg.sender, claimId, amount);
    }
}
