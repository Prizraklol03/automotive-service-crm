import { apiDownload } from "@/shared/api/client";
import type { ApiRequestOptions } from "@/shared/api/types";

export async function downloadFile(path: string, preferredFilename?: string | null, options: ApiRequestOptions = {}) {
  const { blob, filename } = await apiDownload(path, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? preferredFilename ?? "download";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
