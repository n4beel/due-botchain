/**
 * Due contract ABI.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types; a generated JSON artifact loses that
 * unless it is cast, and a mistyped argument would then only surface as a revert.
 *
 * The custom errors are here on purpose. Without them viem cannot decode a revert, and
 * errors like `WrongAmount`, `AlreadyPaid`, or `NotFound` carry state that tells the user
 * exactly what happened instead of generic "transaction failed".
 */
export const dueAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "payable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "invoiceOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "paid", type: "bool" },
          { name: "cancelled", type: "bool" },
          { name: "paidBy", type: "address" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "MAX_MEMO_BYTES",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "InvoiceCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "paidBy", type: "address", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InvoiceCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "payee", type: "address", indexed: true },
    ],
  },
  { type: "error", name: "ZeroAmount", inputs: [] },
  {
    type: "error",
    name: "MemoTooLong",
    inputs: [
      { name: "length", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  { type: "error", name: "NotFound", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "AlreadyPaid", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "AlreadyCancelled", inputs: [{ name: "id", type: "uint256" }] },
  { type: "error", name: "NotPayee", inputs: [{ name: "id", type: "uint256" }] },
  {
    type: "error",
    name: "WrongAmount",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "expected", type: "uint256" },
      { name: "sent", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
] as const;

export const contractAbi = dueAbi;
