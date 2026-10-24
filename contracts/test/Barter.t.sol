// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Barter.sol";
import "./helpers/MockERC20.sol";

contract BarterTest is Test {
    Barter public barter;
    MockERC20 public tokenA;
    MockERC20 public tokenB;

    address public alice = address(0xAA11);
    address public bob = address(0xBB22);
    address public carol = address(0xCC33);

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

    function setUp() public {
        vm.warp(1_760_000_000);
        barter = new Barter();
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        tokenA.mint(alice, 1_000_000 ether);
        tokenA.mint(bob, 1_000_000 ether);
        tokenB.mint(alice, 1_000_000 ether);
        tokenB.mint(bob, 1_000_000 ether);

        vm.prank(alice);
        tokenA.approve(address(barter), type(uint256).max);
        vm.prank(alice);
        tokenB.approve(address(barter), type(uint256).max);

        vm.prank(bob);
        tokenA.approve(address(barter), type(uint256).max);
        vm.prank(bob);
        tokenB.approve(address(barter), type(uint256).max);

        targetContract(address(barter));
    }

    function test_Propose_NativeGive_EscrowsValue() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit Proposed(1, alice, bob, address(0), 1 ether, address(tokenB), 50 ether, 1_760_000_000 + 1 days);
        uint256 id = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 50 ether, 1 days);

        assertEq(id, 1);
        assertEq(address(barter).balance, 1 ether);

        Barter.SwapView memory s = barter.swapOf(1);
        assertEq(s.proposer, alice);
        assertEq(s.counterparty, bob);
        assertEq(s.giveToken, address(0));
        assertEq(s.giveAmount, 1 ether);
        assertEq(s.wantToken, address(tokenB));
        assertEq(s.wantAmount, 50 ether);
        assertEq(s.state, 0); // Open
        assertFalse(s.expired);
    }

    function test_Propose_TokenGive_EscrowsToken() public {
        uint256 aliceABefore = tokenA.balanceOf(alice);

        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(0), 2 ether, 2 days);

        assertEq(id, 1);
        assertEq(tokenA.balanceOf(address(barter)), 100 ether);
        assertEq(tokenA.balanceOf(alice), aliceABefore - 100 ether);

        Barter.SwapView memory s = barter.swapOf(1);
        assertEq(s.giveToken, address(tokenA));
        assertEq(s.giveAmount, 100 ether);
        assertEq(s.wantToken, address(0));
        assertEq(s.wantAmount, 2 ether);
    }

    function test_Propose_Rejects_Self_Zero_SameAsset_NonContract_BadDuration_WrongValue() public {
        // Self
        vm.prank(alice);
        vm.expectRevert(Barter.BadParty.selector);
        barter.propose(alice, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        // Zero counterparty
        vm.prank(alice);
        vm.expectRevert(Barter.BadParty.selector);
        barter.propose(address(0), address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        // Zero amounts
        vm.prank(alice);
        vm.expectRevert(Barter.ZeroAmount.selector);
        barter.propose(bob, address(0), 0, address(tokenB), 10 ether, 1 days);

        vm.prank(alice);
        vm.expectRevert(Barter.ZeroAmount.selector);
        barter.propose(bob, address(0), 1 ether, address(tokenB), 0, 1 days);

        // Same asset
        vm.prank(alice);
        vm.expectRevert(Barter.SameAsset.selector);
        barter.propose(bob, address(tokenA), 10 ether, address(tokenA), 20 ether, 1 days);

        vm.prank(alice);
        vm.expectRevert(Barter.SameAsset.selector);
        barter.propose(bob, address(0), 1 ether, address(0), 2 ether, 1 days);

        // Non-contract token
        address nonContract = address(0x123456);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.NotAContract.selector, nonContract));
        barter.propose(bob, nonContract, 10 ether, address(0), 1 ether, 1 days);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.NotAContract.selector, nonContract));
        barter.propose(bob, address(0), 1 ether, nonContract, 10 ether, 1 days);

        // Bad duration
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.BadDuration.selector, 30 minutes));
        barter.propose(bob, address(0), 1 ether, address(tokenB), 10 ether, 30 minutes);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.BadDuration.selector, 31 days));
        barter.propose(bob, address(0), 1 ether, address(tokenB), 10 ether, 31 days);

        // Wrong value (native give)
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.WrongValue.selector, 1 ether, 0.5 ether));
        barter.propose{value: 0.5 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        // Non-zero value on token give
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Barter.WrongValue.selector, 0, 1 ether));
        barter.propose{value: 1 ether}(bob, address(tokenA), 10 ether, address(0), 1 ether, 1 days);
    }

    function test_Propose_FeeOnTransfer_Reverts() public {
        FeeOnTransferERC20 fot = new FeeOnTransferERC20("Fee", "FEE");
        fot.mint(alice, 1000 ether);
        vm.prank(alice);
        fot.approve(address(barter), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(Barter.UnsupportedToken.selector);
        barter.propose(bob, address(fot), 100 ether, address(0), 1 ether, 1 days);
    }

    function test_Accept_TokenForNative() public {
        // Alice gives 100 TokenA, wants 2 Native BOT from Bob
        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(0), 2 ether, 1 days);

        uint256 aliceEthBefore = alice.balance;
        uint256 bobABefore = tokenA.balanceOf(bob);

        vm.prank(bob);
        vm.expectEmit(true, true, false, false);
        emit Accepted(id, bob);
        barter.accept{value: 2 ether}(id);

        assertEq(alice.balance, aliceEthBefore + 2 ether);
        assertEq(tokenA.balanceOf(bob), bobABefore + 100 ether);
        assertEq(tokenA.balanceOf(address(barter)), 0);
        assertEq(address(barter).balance, 0);

        Barter.SwapView memory s = barter.swapOf(id);
        assertEq(s.state, 1); // Settled
    }

    function test_Accept_NativeForToken() public {
        // Alice gives 1.5 Native BOT, wants 50 TokenB from Bob
        vm.prank(alice);
        uint256 id = barter.propose{value: 1.5 ether}(bob, address(0), 1.5 ether, address(tokenB), 50 ether, 1 days);

        uint256 aliceBBefore = tokenB.balanceOf(alice);
        uint256 bobEthBefore = bob.balance;

        vm.prank(bob);
        barter.accept(id);

        assertEq(tokenB.balanceOf(alice), aliceBBefore + 50 ether);
        assertEq(bob.balance, bobEthBefore + 1.5 ether);
        assertEq(tokenB.balanceOf(address(barter)), 0);
        assertEq(address(barter).balance, 0);

        Barter.SwapView memory s = barter.swapOf(id);
        assertEq(s.state, 1);
    }

    function test_Accept_TokenForToken() public {
        // Alice gives 100 TokenA, wants 80 TokenB from Bob
        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(tokenB), 80 ether, 1 days);

        uint256 aliceBBefore = tokenB.balanceOf(alice);
        uint256 bobABefore = tokenA.balanceOf(bob);

        vm.prank(bob);
        barter.accept(id);

        assertEq(tokenB.balanceOf(alice), aliceBBefore + 80 ether);
        assertEq(tokenA.balanceOf(bob), bobABefore + 100 ether);
        assertEq(tokenA.balanceOf(address(barter)), 0);
        assertEq(tokenB.balanceOf(address(barter)), 0);
    }

    function test_Accept_WrongValue_Args() public {
        // Alice gives 100 TokenA, wants 2 BOT from Bob
        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(0), 2 ether, 1 days);

        // Bob sends wrong value
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Barter.WrongValue.selector, 2 ether, 1 ether));
        barter.accept{value: 1 ether}(id);

        // Alice gives 1 BOT, wants 10 TokenB from Bob
        vm.prank(alice);
        uint256 id2 = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        // Bob sends value when expecting token
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Barter.WrongValue.selector, 0, 0.1 ether));
        barter.accept{value: 0.1 ether}(id2);
    }

    function test_Accept_NotCounterparty() public {
        vm.prank(alice);
        uint256 id = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(Barter.NotCounterparty.selector, id, carol));
        barter.accept(id);
    }

    function test_Accept_AfterExpiry() public {
        vm.prank(alice);
        uint256 id = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        vm.warp(block.timestamp + 1 days + 1);

        Barter.SwapView memory s = barter.swapOf(id);
        assertTrue(s.expired);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Barter.Expired.selector, id, s.expiresAt));
        barter.accept(id);
    }

    function test_Accept_Twice_NotOpen() public {
        vm.prank(alice);
        uint256 id = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        vm.prank(bob);
        barter.accept(id);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Barter.NotOpen.selector, id, 1));
        barter.accept(id);
    }

    function test_Accept_SecondLegFails_RevertsWholeCall() public {
        // Alice gives FailingERC20, Bob gives 1 BOT.
        // During accept, delivering the give side to Bob fails.
        FailingERC20 failing = new FailingERC20("Fail", "FAIL");
        failing.mint(alice, 100 ether);
        vm.prank(alice);
        failing.approve(address(barter), type(uint256).max);

        vm.prank(alice);
        uint256 id = barter.propose(bob, address(failing), 100 ether, address(0), 1 ether, 1 days);

        failing.setShouldFail(true);

        uint256 bobEthBefore = bob.balance;
        uint256 aliceEthBefore = alice.balance;

        vm.prank(bob);
        vm.expectRevert(Barter.TransferFailed.selector);
        barter.accept{value: 1 ether}(id);

        // State unchanged: still open
        Barter.SwapView memory s = barter.swapOf(id);
        assertEq(s.state, 0); // Open
        // Bob got his ETH back (since whole tx reverted)
        assertEq(bob.balance, bobEthBefore);
        assertEq(alice.balance, aliceEthBefore);
        // Token still safely in escrow
        assertEq(failing.balanceOf(address(barter)), 100 ether);
    }

    function test_Cancel_ReturnsEscrow_EvenAfterExpiry() public {
        // Alice proposes giving 2 BOT
        vm.prank(alice);
        uint256 id = barter.propose{value: 2 ether}(bob, address(0), 2 ether, address(tokenB), 10 ether, 1 days);

        // Advance past expiry
        vm.warp(block.timestamp + 5 days);

        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit Cancelled(id, alice);
        barter.cancel(id);

        assertEq(alice.balance, aliceEthBefore + 2 ether);
        assertEq(address(barter).balance, 0);

        Barter.SwapView memory s = barter.swapOf(id);
        assertEq(s.state, 2); // Cancelled
    }

    function test_Cancel_NotProposer() public {
        vm.prank(alice);
        uint256 id = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Barter.NotProposer.selector, id, bob));
        barter.cancel(id);
    }

    function test_Reject_ReturnsEscrow() public {
        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 50 ether, address(0), 1 ether, 1 days);

        uint256 aliceABefore = tokenA.balanceOf(alice);

        vm.prank(bob);
        vm.expectEmit(true, true, false, false);
        emit Rejected(id, bob);
        barter.reject(id);

        assertEq(tokenA.balanceOf(alice), aliceABefore + 50 ether);
        assertEq(tokenA.balanceOf(address(barter)), 0);

        Barter.SwapView memory s = barter.swapOf(id);
        assertEq(s.state, 3); // Rejected
    }

    function test_SwapsFor_BothRoles_Pagination() public {
        vm.prank(alice);
        barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 1 ether, 1 days); // 1
        vm.prank(bob);
        barter.propose{value: 1 ether}(alice, address(0), 1 ether, address(tokenA), 1 ether, 1 days); // 2
        vm.prank(alice);
        barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 1 ether, 1 days); // 3

        Barter.SwapView[] memory forAlice = barter.swapsFor(alice, 0, 50);
        assertEq(forAlice.length, 3);
        // Newest first: 3, 2, 1
        assertEq(forAlice[0].id, 3);
        assertEq(forAlice[1].id, 2);
        assertEq(forAlice[2].id, 1);

        Barter.SwapView[] memory forBob = barter.swapsFor(bob, 0, 2);
        assertEq(forBob.length, 2);
        assertEq(forBob[0].id, 3);
        assertEq(forBob[1].id, 2);

        Barter.SwapView[] memory offsetBob = barter.swapsFor(bob, 2, 2);
        assertEq(offsetBob.length, 1);
        assertEq(offsetBob[0].id, 1);
    }

    function test_HostileToken_CannotReenter() public {
        // Alice proposes giving 100 TokenA, wants 10 Hostile tokens from Bob.
        // When Bob accepts, the Hostile token tries to reenter cancel or accept.
        HostileERC20 hostile = new HostileERC20("Hostile", "HSTL");
        hostile.mint(bob, 100 ether);
        vm.prank(bob);
        hostile.approve(address(barter), type(uint256).max);

        vm.prank(alice);
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(hostile), 10 ether, 1 days);

        // Hostile attempts reentrant cancel during transferFrom
        bytes memory attackPayload = abi.encodeWithSelector(Barter.cancel.selector, id);
        hostile.setAttack(address(barter), attackPayload);

        vm.prank(bob);
        vm.expectRevert(Barter.TransferFailed.selector);
        barter.accept(id);
    }

    function invariant_Conservation_Native() public view {
        uint256 expectedNative = 0;
        uint256 count = barter.swapCount();
        for (uint256 i = 1; i <= count; i++) {
            Barter.SwapView memory s = barter.swapOf(i);
            if (s.state == 0 && s.giveToken == address(0)) {
                expectedNative += s.giveAmount;
            }
        }
        assertEq(address(barter).balance, expectedNative);
    }

    function invariant_Conservation_Token() public view {
        uint256 expectedTokenA = 0;
        uint256 count = barter.swapCount();
        for (uint256 i = 1; i <= count; i++) {
            Barter.SwapView memory s = barter.swapOf(i);
            if (s.state == 0 && s.giveToken == address(tokenA)) {
                expectedTokenA += s.giveAmount;
            }
        }
        assertEq(tokenA.balanceOf(address(barter)), expectedTokenA);
    }

    function testFuzz_RandomSwapsConserve(uint64 amount1, uint64 amount2) public {
        vm.assume(amount1 > 0 && amount2 > 0);
        vm.deal(alice, uint256(amount1) + uint256(amount2) + 1 ether);

        vm.prank(alice);
        uint256 id1 = barter.propose{value: amount1}(bob, address(0), amount1, address(tokenB), 10 ether, 1 days);
        vm.prank(alice);
        uint256 id2 = barter.propose{value: amount2}(bob, address(0), amount2, address(tokenB), 10 ether, 1 days);

        assertEq(address(barter).balance, uint256(amount1) + uint256(amount2));

        vm.prank(bob);
        barter.accept(id1);

        assertEq(address(barter).balance, uint256(amount2));

        vm.prank(alice);
        barter.cancel(id2);

        assertEq(address(barter).balance, 0);
    }

    function test_GasCeilings() public {
        // Propose token for native
        vm.prank(alice);
        uint256 gStart = gasleft();
        uint256 id = barter.propose(bob, address(tokenA), 100 ether, address(0), 1 ether, 1 days);
        uint256 gPropose = gStart - gasleft();
        assertLt(gPropose, 300_000);

        // Accept native for token
        vm.prank(bob);
        gStart = gasleft();
        barter.accept{value: 1 ether}(id);
        uint256 gAccept = gStart - gasleft();
        assertLt(gAccept, 170_000);

        // Propose then cancel
        vm.prank(alice);
        uint256 id2 = barter.propose{value: 1 ether}(bob, address(0), 1 ether, address(tokenB), 10 ether, 1 days);
        vm.prank(alice);
        gStart = gasleft();
        barter.cancel(id2);
        uint256 gCancel = gStart - gasleft();
        assertLt(gCancel, 85_000);
    }
}
