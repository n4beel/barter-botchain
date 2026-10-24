import { describe, expect, it } from "vitest";
import { describeError } from "../errors";

describe("Barter errors", () => {
  it("describes user rejection", () => {
    expect(describeError(new Error("User rejected the request."))).toBe(
      "Transaction cancelled in wallet."
    );
  });

  it("describes NotCounterparty", () => {
    const err = {
      data: {
        errorName: "NotCounterparty",
        args: [1n, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"],
      },
    };
    expect(describeError(err)).toBe("Only 0x7099…79C8 can accept this swap.");
  });

  it("describes Expired", () => {
    const err = {
      data: {
        errorName: "Expired",
        args: [1n, 1760000000n],
      },
    };
    const desc = describeError(err);
    expect(desc).toContain("This offer expired on");
  });

  it("describes NotOpen", () => {
    expect(describeError({ data: { errorName: "NotOpen", args: [1n, 1] } })).toBe(
      "This swap is already settled."
    );
    expect(describeError({ data: { errorName: "NotOpen", args: [1n, 2] } })).toBe(
      "This swap is already cancelled."
    );
    expect(describeError({ data: { errorName: "NotOpen", args: [1n, 3] } })).toBe(
      "This swap is already declined."
    );
  });

  it("describes WrongValue", () => {
    const err = {
      data: {
        errorName: "WrongValue",
        args: [2000000000000000000n, 1000000000000000000n],
      },
    };
    expect(describeError(err)).toBe("This leg needs exactly 2 BOT; you sent 1.");
  });

  it("describes UnsupportedToken", () => {
    expect(describeError({ data: { errorName: "UnsupportedToken" } })).toBe(
      "That token changes the amount on transfer, so it can't be swapped here."
    );
  });

  it("describes SameAsset", () => {
    expect(describeError({ data: { errorName: "SameAsset" } })).toBe(
      "Pick two different assets."
    );
  });

  it("describes NotAContract", () => {
    expect(describeError({ data: { errorName: "NotAContract" } })).toBe(
      "That address isn't a token."
    );
  });

  it("describes BadParty", () => {
    expect(describeError({ data: { errorName: "BadParty" } })).toBe(
      "Choose a counterparty other than yourself."
    );
  });

  it("describes TransferFailed", () => {
    expect(describeError({ data: { errorName: "TransferFailed" } })).toBe(
      "One side of the swap couldn't be delivered, so nothing moved."
    );
  });

  it("describes BadDuration and ZeroAmount", () => {
    expect(describeError({ data: { errorName: "BadDuration" } })).toBe(
      "Choose an expiry duration between 1 hour and 30 days."
    );
    expect(describeError({ data: { errorName: "ZeroAmount" } })).toBe(
      "Swap amounts must be greater than zero."
    );
  });
});
