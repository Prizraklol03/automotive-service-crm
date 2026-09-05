import { getDocumentTemplatesRequest, uploadDocumentTemplateRequest } from "@/entities/settings/api/settings-api";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("document template settings api", () => {
  it("loads document templates from settings endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          code: "work_order",
          created_at: "2026-04-23T10:00:00",
          id: 1,
          is_active: true,
          name: "Заказ-наряд",
          storage_path: "F:/CRM/storage/document_templates/work_order.docx",
          updated_at: "2026-04-23T10:00:00",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDocumentTemplatesRequest();

    expect(result).toHaveLength(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings/document-templates");
    expect(request.credentials).toBe("include");
  });

  it("uploads document template via form data", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: "completion_act",
        created_at: "2026-04-23T10:00:00",
        id: 2,
        is_active: true,
        name: "Акт выполненных работ",
        storage_path: "F:/CRM/storage/document_templates/completion_act.docx",
        updated_at: "2026-04-23T11:00:00",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await uploadDocumentTemplateRequest(
      "completion_act",
      new File(["docx"], "completion-act-template.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/settings/document-templates/completion_act");
    expect(request.method).toBe("POST");
    expect(request.body).toBeInstanceOf(FormData);
    const file = (request.body as FormData).get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("completion-act-template.docx");
  });
});
