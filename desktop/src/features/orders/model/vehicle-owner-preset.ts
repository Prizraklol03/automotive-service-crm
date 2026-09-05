export function getVehicleOwnerPresetId({
  customerPayerModuleEnabled,
  ownerClientId,
  orderClientId
}: {
  customerPayerModuleEnabled: boolean;
  orderClientId: number;
  ownerClientId: number | null;
}) {
  const clientId = customerPayerModuleEnabled ? ownerClientId ?? orderClientId : orderClientId;
  return clientId || undefined;
}
