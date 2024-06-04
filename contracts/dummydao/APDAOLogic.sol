// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {APNFT} from "./APNFT.sol";

struct Proposal {
    uint256 id;
    string title;
    address proposer;
    uint256 startBlock;
    uint256 forVotes;
    uint256 againstVotes;
    uint256 abstainVotes;
    mapping(address => Receipt) receipts;
}

struct Receipt {
    bool hasVoted;
    uint8 support;
    uint96 votes;
}

contract APDAOLogic {
    event VoteCast(
        address indexed voter,
        uint256 proposalId,
        uint8 support,
        uint256 votes,
        string reason
    );
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title
    );

    string public constant name = "AP DAO";

    APNFT apTokens;
    mapping(uint256 => Proposal) public proposals;

    uint256 private proposalCount;

    constructor(address apTokens_) {
        apTokens = APNFT(apTokens_);
    }

    function castVote(uint256 proposalId, uint8 support) external {
        emit VoteCast(
            msg.sender,
            proposalId,
            support,
            castVoteInternal(msg.sender, proposalId, support),
            ""
        );
    }

    function propose(string calldata title) external returns (uint256) {
        proposalCount++;
        Proposal storage newProposal = proposals[proposalCount];

        newProposal.id = proposalCount;
        newProposal.title = title;
        newProposal.proposer = msg.sender;
        newProposal.startBlock = block.number;
        newProposal.forVotes = 0;
        newProposal.againstVotes = 0;
        newProposal.abstainVotes = 0;
        emit ProposalCreated(newProposal.id, msg.sender, title);
        return newProposal.id;
    }

    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external {
        emit VoteCast(
            msg.sender,
            proposalId,
            support,
            castVoteInternal(msg.sender, proposalId, support),
            reason
        );
    }

    function castVoteInternal(
        address voter,
        uint256 proposalId,
        uint8 support
    ) internal returns (uint96) {
        require(support <= 2, "APDAO::castVoteInternal: invalid vote type");
        Proposal storage proposal = proposals[proposalId];
        Receipt storage receipt = proposal.receipts[voter];
        require(
            receipt.hasVoted == false,
            "APDAO::castVoteInternal: voter already voted"
        );

        uint96 votes = apTokens.getPriorVotes(voter, proposal.startBlock - 1);

        if (support == 0) {
            proposal.againstVotes = proposal.againstVotes + votes;
        } else if (support == 1) {
            proposal.forVotes = proposal.forVotes + votes;
        } else if (support == 2) {
            proposal.abstainVotes = proposal.abstainVotes + votes;
        }

        receipt.hasVoted = true;
        receipt.support = support;
        receipt.votes = votes;

        return votes;
    }
}
