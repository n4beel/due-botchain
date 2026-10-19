// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Due
/// @notice Shareable payment requests on BOT Chain.
///
/// @dev What this contract does:
/// A payee creates an invoice specifying an exact amount of BOT and an optional memo.
/// The payee receives a unique invoice ID and shares the link `/i/<id>`.
/// Anyone with or without prior setup can pay the exact requested amount.
/// When paid, funds are immediately forwarded directly to the payee.
///
/// What this contract CANNOT do (honest limits):
/// - No owner / admin privileges: no one can upgrade, pause, or change parameters.
/// - No recovery hatch / clawback: once paid, transactions are permanent and non-reversible.
/// - No partial payments: an invoice must be paid in full in one single transaction.
/// - No overpayments: `msg.value == amount` must hold exactly. Accepting more and refunding
///   adds reentrancy surface for no benefit; accepting less leaves an ambiguous half-paid state.
/// - Memo is log-only: emitted in `InvoiceCreated` and never stored in contract storage,
///   saving gas on creation and avoiding permanent storage bloat.
contract Due {
  /// @notice Maximum allowed byte length for an invoice memo.
  uint256 public constant MAX_MEMO_BYTES = 200;

  /// @notice In-memory and storage representation of an invoice.
  /// @dev Storage layout:
  /// - Slot 0: payee (20 bytes)
  /// - Slot 1: amount (32 bytes)
  /// - Slot 2: createdAt (8 bytes) + paid (1 byte) + cancelled (1 byte) + paidBy (20 bytes) = 30 bytes
  struct Invoice {
    address payee;
    uint256 amount;
    uint64 createdAt;
    bool paid;
    bool cancelled;
    address paidBy;
  }

  mapping(uint256 id => Invoice) private _invoices;
  uint256 private _nextId;

  /// @notice Emitted when an invoice is created.
  /// @param id The unique identifier of the invoice.
  /// @param payee The recipient of the invoice funds.
  /// @param amount The required payment amount in wei.
  /// @param memo Optional description/receipt note, emitted in log only.
  event InvoiceCreated(uint256 indexed id, address indexed payee, uint256 amount, string memo);

  /// @notice Emitted when an invoice is successfully paid.
  /// @param id The invoice identifier.
  /// @param paidBy The address that paid the invoice.
  /// @param payee The recipient who received the funds.
  /// @param amount The payment amount in wei.
  event InvoicePaid(uint256 indexed id, address indexed paidBy, address indexed payee, uint256 amount);

  /// @notice Emitted when an unpaid invoice is cancelled by its payee.
  /// @param id The invoice identifier.
  /// @param payee The payee who cancelled the invoice.
  event InvoiceCancelled(uint256 indexed id, address indexed payee);

  error ZeroAmount();
  error MemoTooLong(uint256 length, uint256 max);
  error NotFound(uint256 id);
  error AlreadyPaid(uint256 id);
  error AlreadyCancelled(uint256 id);
  error NotPayee(uint256 id);
  error WrongAmount(uint256 id, uint256 expected, uint256 sent);
  error TransferFailed(uint256 id, address payee, uint256 amount);

  /// @notice Create an invoice.
  /// @param amount Exact payment amount required in wei (must be > 0).
  /// @param memo Free-form memo up to 200 bytes, emitted in the log.
  /// @return id The sequential invoice ID starting from 1.
  function create(uint256 amount, string calldata memo) external returns (uint256 id) {
    if (amount == 0) revert ZeroAmount();

    uint256 memoLength = bytes(memo).length;
    if (memoLength > MAX_MEMO_BYTES) revert MemoTooLong(memoLength, MAX_MEMO_BYTES);

    id = ++_nextId;

    _invoices[id] = Invoice({
      payee: msg.sender,
      amount: amount,
      createdAt: uint64(block.timestamp),
      paid: false,
      cancelled: false,
      paidBy: address(0)
    });

    emit InvoiceCreated(id, msg.sender, amount, memo);
  }

  /// @notice Pay an invoice in full.
  /// @dev The listing-bar transaction. msg.value must match the invoice amount exactly.
  /// Effects are executed before the native transfer.
  /// @param id The invoice ID to pay.
  function pay(uint256 id) external payable {
    Invoice storage invoice = _invoices[id];
    address payee = invoice.payee;

    if (payee == address(0)) revert NotFound(id);
    if (invoice.paid) revert AlreadyPaid(id);
    if (invoice.cancelled) revert AlreadyCancelled(id);
    if (msg.value != invoice.amount) revert WrongAmount(id, invoice.amount, msg.value);

    invoice.paid = true;
    invoice.paidBy = msg.sender;

    emit InvoicePaid(id, msg.sender, payee, invoice.amount);

    (bool success, ) = payee.call{value: msg.value}("");
    if (!success) revert TransferFailed(id, payee, msg.value);
  }

  /// @notice Cancel an invoice.
  /// @dev Only the payee can cancel, and only if unpaid and not already cancelled.
  /// @param id The invoice ID to cancel.
  function cancel(uint256 id) external {
    Invoice storage invoice = _invoices[id];
    address payee = invoice.payee;

    if (payee == address(0)) revert NotFound(id);
    if (msg.sender != payee) revert NotPayee(id);
    if (invoice.paid) revert AlreadyPaid(id);
    if (invoice.cancelled) revert AlreadyCancelled(id);

    invoice.cancelled = true;

    emit InvoiceCancelled(id, payee);
  }

  /// @notice Return the invoice details.
  /// @dev Returns an empty invoice struct (payee == address(0)) if not found.
  /// @param id The invoice ID to query.
  function invoiceOf(uint256 id) external view returns (Invoice memory) {
    return _invoices[id];
  }
}
