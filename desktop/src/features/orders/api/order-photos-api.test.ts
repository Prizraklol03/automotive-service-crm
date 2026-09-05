import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiRequest }));

import { publicPhotoFileUrl, uploadOrderPhotosRequest } from "@/features/orders/api/order-photos-api";
import { mergeOrderPhotos } from "@/features/orders/api/order-photos-hooks";

function makeFile(index: number) {
  return new File([`photo-${index}`], `vehicle-${index}.jpg`, { type: "image/jpeg" });
}

function makePhoto(id: number) {
  return {
    created_at: "2026-08-05T10:00:00",
    filename: `stored-${id}.jpg`,
    id,
    order_id: 42,
    sort_order: id - 1,
    stage: "before" as const,
    thumb_path: null
  };
}

describe("uploadOrderPhotosRequest", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("uploads one selected file in its own multipart request", async () => {
    const file = makeFile(1);
    apiRequest.mockResolvedValueOnce([makePhoto(1)]);

    const result = await uploadOrderPhotosRequest(42, "before", [file]);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [, options] = apiRequest.mock.calls[0] as [string, { body: FormData }];
    expect(options.body.get("stage")).toBe("before");
    expect(options.body.getAll("files")).toEqual([file]);
    expect(result).toEqual({ failed: [], uploaded: [makePhoto(1)] });
  });

  it("queues 13 selected files sequentially with a fresh FormData per request", async () => {
    const files = Array.from({ length: 13 }, (_, index) => makeFile(index + 1));
    const pending: Array<{ resolve: (value: ReturnType<typeof makePhoto>[]) => void }> = [];
    apiRequest.mockImplementation(
      () =>
        new Promise<ReturnType<typeof makePhoto>[]>((resolve) => {
          pending.push({ resolve });
        })
    );

    const upload = uploadOrderPhotosRequest(42, "before", files);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));

    for (let index = 0; index < files.length; index += 1) {
      pending[index]!.resolve([makePhoto(index + 1)]);
      if (index < files.length - 1) {
        await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(index + 2));
      }
    }

    const result = await upload;
    const bodies = apiRequest.mock.calls.map(([, options]) => (options as { body: FormData }).body);

    expect(bodies).toHaveLength(13);
    expect(new Set(bodies).size).toBe(13);
    expect(bodies.map((body) => body.getAll("files")[0])).toEqual(files);
    expect(result).toEqual({ failed: [], uploaded: files.map((_, index) => makePhoto(index + 1)) });
  });

  it("continues after a failed file and reports partial failure without duplicate uploads", async () => {
    const files = [makeFile(1), makeFile(2), makeFile(3)];
    const uploadError = new Error("File is invalid");
    const onProgress = vi.fn();
    apiRequest.mockResolvedValueOnce([makePhoto(1)]).mockRejectedValueOnce(uploadError).mockResolvedValueOnce([makePhoto(3)]);

    const result = await uploadOrderPhotosRequest(42, "before", files, onProgress);

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      failed: [{ error: uploadError, fileName: "vehicle-2.jpg" }],
      uploaded: [makePhoto(1), makePhoto(3)]
    });
    expect(apiRequest.mock.calls.map(([, options]) => (options as { body: FormData }).body.getAll("files")[0])).toEqual(files);
    expect(onProgress.mock.calls.map(([progress]) => `${progress.index}:${progress.status}`)).toEqual([
      "0:uploading",
      "0:uploaded",
      "1:uploading",
      "1:failed",
      "2:uploading",
      "2:uploaded"
    ]);
  });

  it("merges successful uploads into the photo cache without duplicate ids", () => {
    expect(mergeOrderPhotos([makePhoto(1), makePhoto(2)], [makePhoto(2), makePhoto(3)])).toEqual([
      makePhoto(1),
      makePhoto(2),
      makePhoto(3)
    ]);
  });
});

describe("publicPhotoFileUrl", () => {
  it("uses the opaque public photo key instead of a database id", () => {
    const url = publicPhotoFileUrl("share-token", "opaque-photo-key", true);

    expect(url).toContain("/p/share-token/photos/opaque-photo-key/file?thumb=true");
    expect(url).not.toContain("/photos/42/");
  });
});
