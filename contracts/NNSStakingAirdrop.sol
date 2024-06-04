// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NNSStakingAirdrop is Ownable {
    IERC20 private _erc20;
    mapping(address => uint256) private _airdrops;

    event AirdropClaimed(address indexed recipient, uint256 amount);

    constructor(address erc20Addr) {
        _erc20 = IERC20(erc20Addr);
    }

    function erc20() public view returns (address) {
        return address(_erc20);
    }

    function add(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            recipients.length == amounts.length,
            "recipients and amounts must be the same length"
        );

        uint256 totalAmount = 0;
        for (uint i = 0; i < recipients.length; i++) {
            _airdrops[recipients[i]] += amounts[i];
            totalAmount += amounts[i];
        }

        require(
            _erc20.transferFrom(msg.sender, address(this), totalAmount),
            "failed to transfer tokens to contract"
        );
    }

    function available(address recipient) public view returns (uint256) {
        return _airdrops[recipient];
    }

    function claim() public {
        uint256 amount = _airdrops[msg.sender];
        require(amount > 0, "nothing to claim");
        _airdrops[msg.sender] = 0;
        require(
            _erc20.transfer(msg.sender, amount),
            "failed to transfer tokens"
        );
        emit AirdropClaimed(msg.sender, amount);
    }

    function reclaim() external onlyOwner {
        uint256 balance = _erc20.balanceOf(address(this));
        require(
            _erc20.transfer(msg.sender, balance),
            "failed to transfer tokens back to owner"
        );
    }
}
