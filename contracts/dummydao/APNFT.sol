// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721Checkpointable} from "./ERC721Checkpointable.sol";
import {ERC721} from "./ERC721.sol";

contract APNFT is Ownable, ERC721Checkpointable {
    uint256 private _currentId;
    string private baseURI;

    constructor() ERC721("APToken", "APTOKEN") {}

    function mint() public returns (uint256) {
        return mintTo(msg.sender);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function _setBaseTokenURL(string memory v) public {
        baseURI = v;
    }

    function mintTo(address to) public returns (uint256) {
        _mint(owner(), to, _currentId++);
        return _currentId;
    }

    function nextId() public view returns (uint256) {
        return _currentId + 1;
    }
}
