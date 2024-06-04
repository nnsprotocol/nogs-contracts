// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract DummyNFT is ERC721 {
    constructor() ERC721("DummyNFT", "DummyNFT") {}

    function safeMint(address to, uint256 id) public {
        _safeMint(to, id);
    }

    event VoteCast(address indexed voter, uint256 tokenId);

    function vote(uint256 tokenId) public {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        emit VoteCast(msg.sender, tokenId);
    }
}
