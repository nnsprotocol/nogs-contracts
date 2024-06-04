// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract NogsTippingPool is Initializable, OwnableUpgradeable {
    using ECDSA for bytes32;

    IERC20 internal _erc20;
    address internal _signer;
    mapping(address => uint256) internal _balances;
    mapping(address => uint256) internal _lastWithdrawalTimestamps;
    mapping(uint256 => bool) internal _withdrawals;

    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(
        address indexed account,
        uint256 withdrawalId,
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

    function updateSigner(address addr) external onlyOwner {
        _signer = addr;
    }

    function erc20() public view returns (address) {
        return address(_erc20);
    }

    function withdrawalSigner() public view returns (address) {
        return _signer;
    }

    function withdrawalUsed(uint256 withdrawalId) public view returns (bool) {
        return _withdrawals[withdrawalId];
    }

    struct BalanceStatus {
        uint256 balance;
        uint256 lastWithdrawalTimestamp;
    }

    function balance(
        address account
    ) public view returns (BalanceStatus memory) {
        return
            BalanceStatus(
                _balances[account],
                _lastWithdrawalTimestamps[account]
            );
    }

    function withdraw(
        uint256 withdrawalId,
        uint256 amount,
        uint256 expiry,
        bytes memory signature
    ) external {
        bytes32 txHash = keccak256(
            abi.encodePacked(
                msg.sender,
                block.chainid,
                withdrawalId,
                amount,
                expiry
            )
        );
        address msgSigner = txHash.toEthSignedMessageHash().recover(signature);
        require(msgSigner == _signer, "invalid signature");

        require(block.timestamp < expiry, "withdraw expired");
        require(!_withdrawals[withdrawalId], "already withdrawn");

        _withdrawals[withdrawalId] = true;
        _erc20.transfer(msg.sender, amount);
        _balances[msg.sender] = 0;
        _lastWithdrawalTimestamps[msg.sender] = block.timestamp;
        emit Withdrawal(msg.sender, withdrawalId, amount);
    }

    function deposit(uint256 amount) external {
        _balances[msg.sender] += amount;
        _erc20.transferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount);
    }
}
