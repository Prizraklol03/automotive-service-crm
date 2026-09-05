import { useCallback, useEffect, useState } from "react";

export function useUnsavedChangesGuard(
  hasUnsavedChanges: boolean,
  onClose: () => void
) {
  const [isWarningVisible, setIsWarningVisible] = useState(false);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setIsWarningVisible(false);
    }
  }, [hasUnsavedChanges]);

  const requestClose = useCallback(() => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    setIsWarningVisible(true);
  }, [hasUnsavedChanges, onClose]);

  const dismissWarning = useCallback(() => {
    setIsWarningVisible(false);
  }, []);

  return {
    dismissWarning,
    isWarningVisible,
    requestClose
  };
}
