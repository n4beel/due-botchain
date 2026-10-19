import { describe, expect, it } from "vitest";
import { formatAmount, formatTimestamp, invoiceStatus, memoByteLength, MAX_MEMO_BYTES, type Invoice } from "@/lib/due";

describe("lib/due", () => {
  it("formats amounts in BOT correctly", () => {
    expect(formatAmount(1_000_000_000_000_000_000n)).toBe("1.0000 BOT");
    expect(formatAmount(500_000_000_000_000_000n)).toBe("0.5000 BOT");
    expect(formatAmount(2_500_000_000_000_000_000n)).toBe("2.5000 BOT");
  });

  it("calculates memo byte length accurately for utf-8", () => {
    expect(memoByteLength("hello")).toBe(5);
    expect(memoByteLength("café")).toBe(5); // 'é' is 2 bytes
    expect(memoByteLength("🤖")).toBe(4); // emoji is 4 bytes
    expect(MAX_MEMO_BYTES).toBe(200);
  });

  it("determines invoice status correctly", () => {
    const base: Invoice = {
      payee: "0x1111111111111111111111111111111111111111",
      amount: 1000n,
      createdAt: 1760000000,
      paid: false,
      cancelled: false,
      paidBy: "0x0000000000000000000000000000000000000000",
    };

    expect(invoiceStatus(base)).toBe("pending");
    expect(invoiceStatus({ ...base, paid: true })).toBe("paid");
    expect(invoiceStatus({ ...base, cancelled: true })).toBe("cancelled");
    expect(invoiceStatus({ ...base, paid: true, cancelled: true })).toBe("paid");
  });

  it("formats timestamps cleanly to UTC", () => {
    expect(formatTimestamp(1760000000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
    expect(formatTimestamp(0)).toBe("—");
  });
});
