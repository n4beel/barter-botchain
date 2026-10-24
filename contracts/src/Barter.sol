// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @notice Minimal interface for ERC20 balance queries
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @title Barter
/// @notice Atomic two-asset escrowed swap between two named parties.
///
/// What it deliberately cannot do:
/// - Not a market: no order book, no price discovery, no open offers.
/// - Does not check price fairness or token authenticity.
/// - Refuses fee-on-transfer and rebasing tokens.
/// - An accepted swap is final and irreversible.
/// - Proposer can cancel anytime before acceptance.
contract Barter {
    uint64 public constant MIN_DURATION = 1 hours;
    uint64 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_PAGE = 50;

    struct Swap {                 // 5 slots
        address proposer;           // 20 ┐ slot 1
        uint64  expiresAt;          //  8 │
        uint32  createdBlock;       //  4 ┘
        address counterparty;       // 20 ┐ slot 2
        uint8   state;              //  1 ┘  0 Open · 1 Settled · 2 Cancelled · 3 Rejected
        address giveToken;          //      slot 3   address(0) = native BOT
        address wantToken;          //      slot 4   address(0) = native BOT
        uint128 giveAmount;         // 16 ┐ slot 5
        uint128 wantAmount;         // 16 ┘
    }

    struct SwapView {
        uint256 id;
        address proposer;
        address counterparty;
        address giveToken;
        uint128 giveAmount;
        address wantToken;
        uint128 wantAmount;
        uint64 expiresAt;
        uint32 createdBlock;
        uint8 state;
        bool expired;
    }

    mapping(uint256 => Swap) private _swaps;
    mapping(address => uint256[]) private _swapsFor;
    uint256 public swapCount;
    uint256 private _lock = 1;

    // Events
    event Proposed(
        uint256 indexed id,
        address indexed proposer,
        address indexed counterparty,
        address giveToken,
        uint128 giveAmount,
        address wantToken,
        uint128 wantAmount,
        uint64 expiresAt
    );
    event Accepted(uint256 indexed id, address indexed counterparty);
    event Cancelled(uint256 indexed id, address indexed proposer);
    event Rejected(uint256 indexed id, address indexed counterparty);

    // Errors
    error BadParty();
    error ZeroAmount();
    error SameAsset();
    error NotAContract(address token);
    error BadDuration(uint64 duration);
    error WrongValue(uint256 expected, uint256 sent);
    error UnsupportedToken();
    error NoSuchSwap(uint256 id);
    error NotCounterparty(uint256 id, address caller);
    error NotProposer(uint256 id, address caller);
    error NotOpen(uint256 id, uint8 state);
    error Expired(uint256 id, uint64 expiresAt);
    error TransferFailed();

    modifier nonReentrant() {
        if (_lock != 1) revert TransferFailed();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Propose a swap, depositing the give side into escrow.
    function propose(
        address counterparty,
        address giveToken,
        uint128 giveAmount,
        address wantToken,
        uint128 wantAmount,
        uint64 duration
    ) external payable nonReentrant returns (uint256 id) {
        if (counterparty == address(0) || counterparty == msg.sender) revert BadParty();
        if (giveAmount == 0 || wantAmount == 0) revert ZeroAmount();
        if (giveToken == wantToken) revert SameAsset();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration(duration);

        if (giveToken != address(0) && giveToken.code.length == 0) revert NotAContract(giveToken);
        if (wantToken != address(0) && wantToken.code.length == 0) revert NotAContract(wantToken);

        // Escrow the give side
        if (giveToken == address(0)) {
            if (msg.value != giveAmount) revert WrongValue(giveAmount, msg.value);
        } else {
            if (msg.value != 0) revert WrongValue(0, msg.value);
            uint256 balanceBefore = IERC20(giveToken).balanceOf(address(this));
            _safeTransferFrom(giveToken, msg.sender, address(this), giveAmount);
            uint256 balanceAfter = IERC20(giveToken).balanceOf(address(this));
            if (balanceAfter - balanceBefore != giveAmount) revert UnsupportedToken();
        }

        unchecked {
            id = ++swapCount;
        }

        uint64 expiresAt = uint64(block.timestamp) + duration;
        _swaps[id] = Swap({
            proposer: msg.sender,
            expiresAt: expiresAt,
            createdBlock: uint32(block.number),
            counterparty: counterparty,
            state: 0, // Open
            giveToken: giveToken,
            wantToken: wantToken,
            giveAmount: giveAmount,
            wantAmount: wantAmount
        });

        _swapsFor[msg.sender].push(id);
        _swapsFor[counterparty].push(id);

        emit Proposed(
            id,
            msg.sender,
            counterparty,
            giveToken,
            giveAmount,
            wantToken,
            wantAmount,
            expiresAt
        );
    }

    /// @notice Accept an open swap, delivering the want side and receiving the escrowed give side.
    function accept(uint256 id) external payable nonReentrant {
        Swap storage s = _swaps[id];
        if (s.createdBlock == 0) revert NoSuchSwap(id);
        if (msg.sender != s.counterparty) revert NotCounterparty(id, msg.sender);
        if (s.state != 0) revert NotOpen(id, s.state);
        if (block.timestamp >= s.expiresAt) revert Expired(id, s.expiresAt);

        // Effects first: mark settled
        s.state = 1; // Settled

        // Collect the want side from counterparty
        if (s.wantToken == address(0)) {
            if (msg.value != s.wantAmount) revert WrongValue(s.wantAmount, msg.value);
        } else {
            if (msg.value != 0) revert WrongValue(0, msg.value);
            uint256 balanceBefore = IERC20(s.wantToken).balanceOf(address(this));
            _safeTransferFrom(s.wantToken, msg.sender, address(this), s.wantAmount);
            uint256 balanceAfter = IERC20(s.wantToken).balanceOf(address(this));
            if (balanceAfter - balanceBefore != s.wantAmount) revert UnsupportedToken();
        }

        // Deliver want side to proposer
        if (s.wantToken == address(0)) {
            (bool ok,) = s.proposer.call{value: s.wantAmount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(s.wantToken, s.proposer, s.wantAmount);
        }

        // Deliver give side to counterparty
        if (s.giveToken == address(0)) {
            (bool ok,) = s.counterparty.call{value: s.giveAmount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(s.giveToken, s.counterparty, s.giveAmount);
        }

        emit Accepted(id, msg.sender);
    }

    /// @notice Cancel an open swap and retrieve escrowed assets.
    function cancel(uint256 id) external nonReentrant {
        Swap storage s = _swaps[id];
        if (s.createdBlock == 0) revert NoSuchSwap(id);
        if (msg.sender != s.proposer) revert NotProposer(id, msg.sender);
        if (s.state != 0) revert NotOpen(id, s.state);

        s.state = 2; // Cancelled

        // Return give side to proposer
        if (s.giveToken == address(0)) {
            (bool ok,) = s.proposer.call{value: s.giveAmount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(s.giveToken, s.proposer, s.giveAmount);
        }

        emit Cancelled(id, msg.sender);
    }

    /// @notice Reject an open swap, returning escrow to the proposer.
    function reject(uint256 id) external nonReentrant {
        Swap storage s = _swaps[id];
        if (s.createdBlock == 0) revert NoSuchSwap(id);
        if (msg.sender != s.counterparty) revert NotCounterparty(id, msg.sender);
        if (s.state != 0) revert NotOpen(id, s.state);

        s.state = 3; // Rejected

        // Return give side to proposer
        if (s.giveToken == address(0)) {
            (bool ok,) = s.proposer.call{value: s.giveAmount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(s.giveToken, s.proposer, s.giveAmount);
        }

        emit Rejected(id, msg.sender);
    }

    /// @notice Read full details of a swap.
    function swapOf(uint256 id) external view returns (SwapView memory) {
        Swap storage s = _swaps[id];
        if (s.createdBlock == 0) {
            return SwapView({
                id: id,
                proposer: address(0),
                counterparty: address(0),
                giveToken: address(0),
                giveAmount: 0,
                wantToken: address(0),
                wantAmount: 0,
                expiresAt: 0,
                createdBlock: 0,
                state: 0,
                expired: false
            });
        }
        bool expired = (s.state == 0 && block.timestamp >= s.expiresAt);
        return SwapView({
            id: id,
            proposer: s.proposer,
            counterparty: s.counterparty,
            giveToken: s.giveToken,
            giveAmount: s.giveAmount,
            wantToken: s.wantToken,
            wantAmount: s.wantAmount,
            expiresAt: s.expiresAt,
            createdBlock: s.createdBlock,
            state: s.state,
            expired: expired
        });
    }

    /// @notice Paginated swap views for an address, newest first.
    function swapsFor(
        address who,
        uint256 offset,
        uint256 count
    ) external view returns (SwapView[] memory) {
        uint256 total = _swapsFor[who].length;
        if (offset >= total) {
            return new SwapView[](0);
        }

        if (count > MAX_PAGE) {
            count = MAX_PAGE;
        }
        if (offset + count > total) {
            count = total - offset;
        }

        SwapView[] memory page = new SwapView[](count);
        for (uint256 i = 0; i < count; ) {
            uint256 id = _swapsFor[who][total - 1 - offset - i];
            Swap storage s = _swaps[id];
            bool expired = (s.state == 0 && block.timestamp >= s.expiresAt);
            page[i] = SwapView({
                id: id,
                proposer: s.proposer,
                counterparty: s.counterparty,
                giveToken: s.giveToken,
                giveAmount: s.giveAmount,
                wantToken: s.wantToken,
                wantAmount: s.wantAmount,
                expiresAt: s.expiresAt,
                createdBlock: s.createdBlock,
                state: s.state,
                expired: expired
            });
            unchecked {
                ++i;
            }
        }
        return page;
    }

    // Safe ERC20 transfer helpers supporting no-return and standard tokens
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount)
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}
