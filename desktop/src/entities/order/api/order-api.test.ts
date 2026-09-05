import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiRequest }));

import { listOrdersPageRequest } from "@/entities/order/api/order-api";

describe("listOrdersPageRequest", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ items: [], page: 1, page_size: 50, total: 0 });
  });

  it("serializes prioritized sorting and all additional filters", async () => {
    await listOrdersPageRequest({
      archivedScope: "active",
      brand: "BMW",
      client: "Анна",
      hasComment: true,
      hasDocuments: false,
      model: "X5",
      page: 1,
      pageSize: 50,
      paymentStatus: ["paid", "partial"],
      plate: "A123AA00",
      scheduledFrom: "2026-05-01",
      scheduledTo: "2026-05-31",
      search: "",
      sortDescriptors: [
        { key: "vehicle_model", direction: "asc" },
        { key: "amount_to_pay", direction: "desc" }
      ],
      status: ["new"],
      updatedFrom: "2026-05-02",
      updatedTo: "2026-05-30"
    });

    const [path] = apiRequest.mock.calls[0] as [string];
    const params = new URL(path, "https://crm.example.invalid").searchParams;
    expect(params.get("sort_by")).toBe("vehicle_model,amount_to_pay");
    expect(params.get("sort_dir")).toBe("asc,desc");
    expect(params.get("status")).toBe("new");
    expect(params.get("scheduled_from")).toBe("2026-05-01");
    expect(params.get("updated_to")).toBe("2026-05-30");
    expect(params.get("payment_status")).toBe("paid,partial");
    expect(params.get("has_comment")).toBe("true");
    expect(params.get("has_documents")).toBe("false");
    expect(params.get("client")).toBe("Анна");
    expect(params.get("brand")).toBe("BMW");
    expect(params.get("model")).toBe("X5");
    expect(params.get("plate")).toBe("A123AA00");
  });

  it("omits empty additional filters", async () => {
    await listOrdersPageRequest({ page: 1, pageSize: 50, search: "", status: [] });

    const [path] = apiRequest.mock.calls[0] as [string];
    const params = new URL(path, "https://crm.example.invalid").searchParams;
    expect([...params.keys()]).toEqual(["page", "page_size"]);
  });
});
