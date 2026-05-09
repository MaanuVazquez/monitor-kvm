import { beforeEach, describe, expect, it, mock } from "bun:test";

const apiFetchMock = mock((_path: string, _init?: RequestInit) => Promise.resolve({}));
const invalidateQueriesMock = mock((_options: { queryKey: string[] }) => {});
let lastMutationOptions: any;

mock.module("@tanstack/react-query", () => ({
  useMutation: mock((options: any) => {
    lastMutationOptions = options;
    return options;
  }),
}));

mock.module("../lib/api.ts", () => ({
  apiFetch: apiFetchMock,
}));

mock.module("../lib/query-client.ts", () => ({
  queryClient: {
    invalidateQueries: invalidateQueriesMock,
  },
}));

const { useCancelPinPairing, useStartPinPairing, useSubmitPinPairing } = await import("./usePairDevice.ts");

describe("usePairDevice hooks", () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    invalidateQueriesMock.mockClear();
    lastMutationOptions = undefined;
  });

  it("starts PIN pairing with the start endpoint", async () => {
    useStartPinPairing();

    await lastMutationOptions.mutationFn({ host: "192.168.1.100" });

    expect(apiFetchMock).toHaveBeenCalledWith("/devices/192.168.1.100/pair/pin/start", {
      method: "POST",
    });
  });

  it("cancels PIN pairing with the cancel endpoint", async () => {
    useCancelPinPairing();

    await lastMutationOptions.mutationFn({ host: "192.168.1.100" });

    expect(apiFetchMock).toHaveBeenCalledWith("/devices/192.168.1.100/pair/pin", {
      method: "DELETE",
    });
  });

  it("submits PIN pairing with the PIN body and invalidates devices", async () => {
    useSubmitPinPairing();

    await lastMutationOptions.mutationFn({ host: "192.168.1.100", pin: "1234" });
    lastMutationOptions.onSuccess();

    expect(apiFetchMock).toHaveBeenCalledWith("/devices/192.168.1.100/pair/pin/submit", {
      method: "POST",
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["devices"] });
  });
});
