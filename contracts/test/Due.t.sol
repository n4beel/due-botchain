// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Due} from "../src/Due.sol";

contract DueTest is Test {
  Due internal due;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal charlie = address(0xC0C);

  event InvoiceCreated(uint256 indexed id, address indexed payee, uint256 amount, string memo);
  event InvoicePaid(uint256 indexed id, address indexed paidBy, address indexed payee, uint256 amount);
  event InvoiceCancelled(uint256 indexed id, address indexed payee);

  function setUp() public {
    due = new Due();
    vm.warp(1_760_000_000);
    vm.deal(alice, 100 ether);
    vm.deal(bob, 100 ether);
    vm.deal(charlie, 100 ether);
  }

  // --- 1. test_RecordsInvoice ---
  function test_RecordsInvoice() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "consulting");

    assertEq(id, 1, "first id should be 1");
    Due.Invoice memory inv = due.invoiceOf(id);
    assertEq(inv.payee, alice, "payee");
    assertEq(inv.amount, 1 ether, "amount");
    assertEq(inv.createdAt, uint64(block.timestamp), "createdAt");
    assertFalse(inv.paid, "paid");
    assertFalse(inv.cancelled, "cancelled");
    assertEq(inv.paidBy, address(0), "paidBy");
  }

  // --- 2. test_EmitsMemoInLog ---
  function test_EmitsMemoInLog() public {
    vm.expectEmit(true, true, false, true, address(due));
    emit InvoiceCreated(1, alice, 1 ether, "consulting invoice #42");

    vm.prank(alice);
    due.create(1 ether, "consulting invoice #42");
  }

  // --- 3. test_PayTransfersFundsToPayee ---
  function test_PayTransfersFundsToPayee() public {
    vm.prank(alice);
    uint256 id = due.create(2.5 ether, "work");

    uint256 aliceBalBefore = alice.balance;

    vm.prank(bob);
    due.pay{value: 2.5 ether}(id);

    assertEq(alice.balance - aliceBalBefore, 2.5 ether, "payee balance delta");
  }

  // --- 4. test_MarksPaid ---
  function test_MarksPaid() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "item");

    vm.expectEmit(true, true, true, true, address(due));
    emit InvoicePaid(id, bob, alice, 1 ether);

    vm.prank(bob);
    due.pay{value: 1 ether}(id);

    Due.Invoice memory inv = due.invoiceOf(id);
    assertTrue(inv.paid, "should be marked paid");
    assertEq(inv.paidBy, bob, "paidBy should be recorded");
  }

  // --- 5. test_PayeeCanCancel ---
  function test_PayeeCanCancel() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "to cancel");

    vm.expectEmit(true, true, false, true, address(due));
    emit InvoiceCancelled(id, alice);

    vm.prank(alice);
    due.cancel(id);

    Due.Invoice memory inv = due.invoiceOf(id);
    assertTrue(inv.cancelled, "should be cancelled");
  }

  // --- 6. test_RevertsZeroAmount ---
  function test_RevertsZeroAmount() public {
    vm.expectRevert(Due.ZeroAmount.selector);
    vm.prank(alice);
    due.create(0, "free");
  }

  // --- 7. test_RevertsMemoTooLong ---
  function test_RevertsMemoTooLong() public {
    uint256 max = due.MAX_MEMO_BYTES();
    string memory tooLong = string(new bytes(max + 1));

    vm.expectRevert(abi.encodeWithSelector(Due.MemoTooLong.selector, max + 1, max));
    vm.prank(alice);
    due.create(1 ether, tooLong);
  }

  // --- 8. test_RevertsAlreadyPaid ---
  function test_RevertsAlreadyPaid() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "invoice");

    vm.prank(bob);
    due.pay{value: 1 ether}(id);

    vm.expectRevert(abi.encodeWithSelector(Due.AlreadyPaid.selector, id));
    vm.prank(charlie);
    due.pay{value: 1 ether}(id);
  }

  // --- 9. test_RevertsAlreadyCancelled ---
  function test_RevertsAlreadyCancelled() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "cancel me");

    vm.prank(alice);
    due.cancel(id);

    vm.expectRevert(abi.encodeWithSelector(Due.AlreadyCancelled.selector, id));
    vm.prank(bob);
    due.pay{value: 1 ether}(id);
  }

  // --- 10. test_RevertsNotPayeeOnCancel ---
  function test_RevertsNotPayeeOnCancel() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "mine");

    vm.expectRevert(abi.encodeWithSelector(Due.NotPayee.selector, id));
    vm.prank(bob);
    due.cancel(id);
  }

  // --- 11. test_RevertsWrongAmount ---
  function test_RevertsWrongAmount() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "exact price");

    // Underpayment
    vm.expectRevert(abi.encodeWithSelector(Due.WrongAmount.selector, id, 1 ether, 0.5 ether));
    vm.prank(bob);
    due.pay{value: 0.5 ether}(id);

    // Overpayment
    vm.expectRevert(abi.encodeWithSelector(Due.WrongAmount.selector, id, 1 ether, 1.5 ether));
    vm.prank(bob);
    due.pay{value: 1.5 ether}(id);
  }

  // --- 12. test_GasCeiling_Create ---
  function test_GasCeiling_Create() public {
    vm.prank(alice);
    uint256 beforeGas = gasleft();
    due.create(1 ether, "invoice memo");
    uint256 used = beforeGas - gasleft();

    emit log_named_uint("create() gas", used);
    assertLt(used, 110_000, "create() gas ceiling exceeded");
  }

  // --- 13. test_GasCeiling_Pay ---
  function test_GasCeiling_Pay() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "invoice memo");

    vm.prank(bob);
    uint256 beforeGas = gasleft();
    due.pay{value: 1 ether}(id);
    uint256 used = beforeGas - gasleft();

    emit log_named_uint("pay() gas", used);
    assertLt(used, 70_000, "pay() gas ceiling exceeded");
  }

  // --- 14. testFuzz_PayTransfersExactAmount ---
  function testFuzz_PayTransfersExactAmount(uint96 amount) public {
    vm.assume(amount > 0);
    vm.deal(bob, uint256(amount));

    vm.prank(alice);
    uint256 id = due.create(amount, "fuzz test");

    uint256 aliceBalBefore = alice.balance;
    vm.prank(bob);
    due.pay{value: amount}(id);

    assertEq(alice.balance - aliceBalBefore, uint256(amount), "exact amount transferred");
    Due.Invoice memory inv = due.invoiceOf(id);
    assertTrue(inv.paid, "is paid");
    assertEq(inv.paidBy, bob, "paid by bob");
  }

  // --- 15. testFuzz_WrongAmountReverts ---
  function testFuzz_WrongAmountReverts(uint96 amount, uint96 sent) public {
    vm.assume(amount > 0 && sent != amount);
    vm.deal(bob, uint256(sent));

    vm.prank(alice);
    uint256 id = due.create(amount, "fuzz");

    vm.expectRevert(abi.encodeWithSelector(Due.WrongAmount.selector, id, uint256(amount), uint256(sent)));
    vm.prank(bob);
    due.pay{value: sent}(id);
  }

  // --- Extra edge cases ---
  function test_RevertsNotFoundOnPay() public {
    vm.expectRevert(abi.encodeWithSelector(Due.NotFound.selector, 999));
    vm.prank(bob);
    due.pay{value: 1 ether}(999);
  }

  function test_RevertsNotFoundOnCancel() public {
    vm.expectRevert(abi.encodeWithSelector(Due.NotFound.selector, 999));
    vm.prank(alice);
    due.cancel(999);
  }

  function test_RevertsAlreadyPaidOnCancel() public {
    vm.prank(alice);
    uint256 id = due.create(1 ether, "pay then cancel");

    vm.prank(bob);
    due.pay{value: 1 ether}(id);

    vm.expectRevert(abi.encodeWithSelector(Due.AlreadyPaid.selector, id));
    vm.prank(alice);
    due.cancel(id);
  }

  function test_ReadsOfNonExistentInvoiceReturnZeroes() public view {
    Due.Invoice memory inv = due.invoiceOf(999);
    assertEq(inv.payee, address(0));
    assertEq(inv.amount, 0);
    assertEq(inv.createdAt, 0);
    assertFalse(inv.paid);
    assertFalse(inv.cancelled);
    assertEq(inv.paidBy, address(0));
  }
}
