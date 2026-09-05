import { describe, expect, it } from "vitest";

import { getVehicleOwnerPresetId } from "@/features/orders/model/vehicle-owner-preset";

describe("getVehicleOwnerPresetId", () => {
  it("prefers a newly created or selected explicit owner", () => {
    expect(getVehicleOwnerPresetId({ customerPayerModuleEnabled: true, orderClientId: 11, ownerClientId: 23 })).toBe(23);
  });

  it("uses the order customer when no separate owner exists", () => {
    expect(getVehicleOwnerPresetId({ customerPayerModuleEnabled: true, orderClientId: 11, ownerClientId: null })).toBe(11);
    expect(getVehicleOwnerPresetId({ customerPayerModuleEnabled: false, orderClientId: 11, ownerClientId: null })).toBe(11);
  });

  it("does not invent an owner when neither owner nor order customer is selected", () => {
    expect(getVehicleOwnerPresetId({ customerPayerModuleEnabled: true, orderClientId: 0, ownerClientId: null })).toBeUndefined();
  });
});
