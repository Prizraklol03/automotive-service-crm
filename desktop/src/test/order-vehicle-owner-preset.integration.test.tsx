import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Client } from "@/entities/client/model/types";
import type { Order, OrderCreatePayload } from "@/entities/order/model/types";
import type { CrmOrderStatus, ModulesConfig } from "@/entities/settings/model/types";
import { DEFAULT_MODULES_CONFIG } from "@/entities/settings/model/types";
import type { Vehicle, VehicleDetail, VehiclePayload } from "@/entities/vehicle/model/types";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

vi.mock("@/features/documents/ui/order-documents-section", () => ({ OrderDocumentsSection: () => null }));
vi.mock("@/features/inspection/ui/inspection-order-section", () => ({ InspectionOrderSection: () => null }));
vi.mock("@/features/orders/ui/order-payments-section", () => ({ OrderPaymentsSection: () => null }));
vi.mock("@/features/orders/ui/order-photo-section", () => ({ OrderPhotoSection: () => null }));
vi.mock("@/shared/ui/loading-state", () => ({ LoadingState: () => <div /> }));
vi.mock("@/shared/ui/error-state", () => ({ ErrorState: () => <div /> }));
vi.mock("@/shared/ui/mobile-sheet", () => ({ MobileSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/shared/ui/unsaved-changes-banner", () => ({ UnsavedChangesBanner: () => null }));

const statusNew: CrmOrderStatus = {
  code: "new",
  color: "#6b7280",
  display_name: "Новый",
  is_default: true,
  sort_order: 10,
  status_group: "new"
};

function client(overrides: Partial<Client>): Client {
  const id = overrides.id ?? 1;
  const fullName = overrides.full_name ?? `Client ${id}`;
  const phone = overrides.phone_display ?? `+7 (900) 000-00-${String(id).padStart(2, "0")}`;

  return {
    actual_address: null,
    address: null,
    client_type: "individual",
    comment: null,
    company_name: null,
    deleted_at: null,
    display_label: fullName,
    full_name: fullName,
    id,
    inn: null,
    is_deleted: false,
    is_individual: true,
    is_legal: false,
    kpp: null,
    legal_address: null,
    ogrn: null,
    phone_display: phone,
    phone_normalized: phone.replace(/\D/g, ""),
    representative_basis: null,
    representative_full_name: null,
    representative_position: null,
    telegram_username: null,
    ...overrides
  };
}

function vehicle(overrides: Partial<Vehicle>): Vehicle {
  const id = overrides.id ?? 101;
  const plate = overrides.plate_number_display ?? `A${id}AA`;

  return {
    brand: overrides.brand ?? null,
    brand_id: null,
    client_id: overrides.client_id ?? 1,
    color: null,
    comment: null,
    deleted_at: null,
    id,
    is_deleted: false,
    mileage: null,
    model: overrides.model ?? null,
    model_id: null,
    plate_number_display: plate,
    plate_number_normalized: plate,
    vin: null,
    year: null,
    ...overrides
  };
}

function vehicleDetail(overrides: Partial<VehicleDetail>): VehicleDetail {
  const base = vehicle(overrides);
  return {
    ...base,
    current_owner_full_name: overrides.current_owner_full_name ?? `Client ${base.client_id}`,
    current_owner_phone_display: overrides.current_owner_phone_display ?? "+7 (000) 000-00-48",
    orders: [],
    owner_history: [],
    ...overrides
  };
}

function orderFromPayload(id: number, payload: OrderCreatePayload, createdVehicle: Vehicle): Order {
  return {
    amount_to_pay: "0.00",
    balance_due: "0.00",
    client_id: payload.client_id,
    client_summary: {
      full_name: `Client ${payload.client_id}`,
      id: payload.client_id,
      phone_display: "+7 (000) 000-00-48"
    },
    comment: payload.comment,
    completed_at: null,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    due_date: payload.due_date,
    handover_at: payload.handover_at,
    id,
    is_archived: false,
    paid_total: "0.00",
    payer_client_id: payload.payer_client_id,
    payment_status: "unpaid",
    payments: [],
    scheduled_for: payload.scheduled_for,
    services: [],
    services_total: "0.00",
    status: payload.status,
    status_color: statusNew.color,
    status_display_name: statusNew.display_name,
    status_group: statusNew.status_group,
    status_history: [],
    vehicle_id: payload.vehicle_id,
    vehicle_summary: {
      brand: createdVehicle.brand,
      client_id: createdVehicle.client_id,
      display_name: `${createdVehicle.plate_number_display} · ${[createdVehicle.brand, createdVehicle.model].filter(Boolean).join(" ")}`,
      id: createdVehicle.id,
      model: createdVehicle.model,
      plate_number_display: createdVehicle.plate_number_display,
      vin: createdVehicle.vin
    }
  };
}

type TestState = {
  clients: Map<number, Client>;
  clientListIds: number[];
  createOrderPayloads: OrderCreatePayload[];
  createVehiclePayloads: VehiclePayload[];
  modules: ModulesConfig;
  nextClientId: number;
  nextOrderId: number;
  nextVehicleId: number;
  vehicles: Map<number, VehicleDetail>;
  vehicleListIds: number[];
};

function createState(overrides: Partial<TestState> = {}): TestState {
  const clients = new Map<number, Client>();
  [client({ id: 1, full_name: "Demo Customer 28", phone_display: "+7 (000) 000-00-49" }),
    client({ id: 2, full_name: "Demo Customer 29", phone_display: "+7 (000) 000-00-50" }),
    client({ id: 3, full_name: "Demo Customer 30", phone_display: "+7 (000) 000-00-51" }),
    client({ id: 4, full_name: "Demo Customer 31", phone_display: "+7 (000) 000-00-52" })].forEach((item) => clients.set(item.id, item));

  return {
    clients,
    clientListIds: [1, 2, 3, 4],
    createOrderPayloads: [],
    createVehiclePayloads: [],
    modules: { ...DEFAULT_MODULES_CONFIG, customer_payer: true, photos: false },
    nextClientId: 50,
    nextOrderId: 900,
    nextVehicleId: 700,
    vehicles: new Map(),
    vehicleListIds: [],
    ...overrides
  };
}

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: init.status ?? 200
  });
}

function getRequestPath(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, "http://crm.example.invalid");
  return `${url.pathname.replace(/^\/api/, "")}${url.search}`;
}

function installFetchMock(state: TestState) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = getRequestPath(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;

    if (method === "GET" && path === "/settings/modules") {
      return jsonResponse(state.modules);
    }
    if (method === "GET" && path === "/settings/statuses") {
      return jsonResponse([statusNew]);
    }
    if (method === "GET" && path === "/settings/custom-fields") {
      return jsonResponse([]);
    }
    if (method === "GET" && path === "/services") {
      return jsonResponse([]);
    }
    if (method === "GET" && path === "/service-categories") {
      return jsonResponse([]);
    }
    if (method === "GET" && path === "/car-brands") {
      return jsonResponse([]);
    }
    if (method === "GET" && path.startsWith("/car-models/by-brand/")) {
      return jsonResponse([]);
    }
    if (method === "GET" && path === "/clients") {
      return jsonResponse(state.clientListIds.map((id) => state.clients.get(id)).filter(Boolean));
    }
    if (method === "GET" && path.startsWith("/clients/")) {
      const id = Number(path.split("/")[2]);
      return jsonResponse(state.clients.get(id) ?? null);
    }
    if (method === "POST" && path === "/clients") {
      const id = state.nextClientId++;
      const created = client({
        client_type: body.client_type,
        company_name: body.company_name,
        full_name: body.full_name,
        id,
        phone_display: body.phone
      });
      state.clients.set(id, created);
      return jsonResponse(created, { status: 201 });
    }
    if (method === "GET" && path === "/vehicles") {
      return jsonResponse(state.vehicleListIds.map((id) => state.vehicles.get(id)).filter(Boolean));
    }
    if (method === "GET" && path.startsWith("/vehicles/")) {
      const id = Number(path.split("/")[2]);
      return jsonResponse(state.vehicles.get(id) ?? null);
    }
    if (method === "POST" && path === "/vehicles") {
      const id = state.nextVehicleId++;
      const owner = state.clients.get(body.client_id);
      const created = vehicleDetail({
        brand: body.brand,
        brand_id: body.brand_id,
        client_id: body.client_id,
        color: body.color,
        comment: body.comment,
        current_owner_full_name: owner?.full_name ?? `Client ${body.client_id}`,
        current_owner_phone_display: owner?.phone_display ?? "",
        id,
        mileage: body.mileage,
        model: body.model,
        model_id: body.model_id,
        plate_number_display: body.plate_number,
        plate_number_normalized: body.plate_number,
        vin: body.vin,
        year: body.year
      });
      state.createVehiclePayloads.push(body);
      state.vehicles.set(id, created);
      state.vehicleListIds.push(id);
      return jsonResponse(created, { status: 201 });
    }
    if (method === "POST" && path === "/orders") {
      const payload = body as OrderCreatePayload;
      const createdVehicle = state.vehicles.get(payload.vehicle_id);
      if (!createdVehicle) {
        return jsonResponse({ error: { message: "Vehicle not found" } }, { status: 400 });
      }
      state.createOrderPayloads.push(payload);
      return jsonResponse(orderFromPayload(state.nextOrderId++, payload, createdVehicle), { status: 201 });
    }

    throw new Error(`Unhandled ${method} ${path}`);
  });
}

function mountOrder(state: TestState) {
  const container = document.createElement("div");
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false }
    }
  });
  const root = createRoot(container);
  document.body.appendChild(container);

  act(() => {
    useAuthStore.setState({
      errorMessage: null,
      status: "authenticated",
      user: {
        full_name: "Admin",
        id: 1,
        is_active: true,
        login: "admin",
        permissions: [],
        role_code: "admin"
      }
    });
  });

  return {
    container,
    queryClient,
    async render() {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <OrderDetailPanel isMobile={false} onClose={vi.fn()} orderKey="new" />
            </MemoryRouter>
          </QueryClientProvider>
        );
        await flush();
      });
    },
    unmount() {
      act(() => root.unmount());
      queryClient.clear();
      container.remove();
    }
  };
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function waitFor(check: () => void | boolean, timeoutMs = 2500) {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = check();
      if (result !== false) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await act(async () => {
      await flush();
    });
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("waitFor timeout");
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  });
}

function getInputByName(container: HTMLElement, name: string) {
  const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Input ${name} not found`);
  }
  return input;
}

function getInputByPlaceholder(container: HTMLElement, placeholder: string) {
  const input = Array.from(container.querySelectorAll("input")).find((item) => item.placeholder === placeholder) as HTMLInputElement | undefined;
  if (!input) {
    throw new Error(`Input placeholder ${placeholder} not found`);
  }
  return input;
}

function getInputByFieldLabel(container: HTMLElement, label: string) {
  const labelElement = Array.from(container.querySelectorAll("div.text-sm.font-medium.text-foreground")).find((item) => item.textContent === label);
  const input = labelElement?.parentElement?.querySelector("input") as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Input label ${label} not found`);
  }
  return input;
}

async function waitForInputByFieldLabel(container: HTMLElement, label: string) {
  let result: HTMLInputElement | null = null;
  await waitFor(() => {
    result = getInputByFieldLabel(container, label);
    return true;
  });
  return result!;
}

async function waitForInputByPlaceholder(container: HTMLElement, placeholder: string) {
  let result: HTMLInputElement | null = null;
  await waitFor(() => {
    result = getInputByPlaceholder(container, placeholder);
    return true;
  });
  return result!;
}

function getVehicleForm(container: HTMLElement) {
  const plateInput = getInputByName(container, "plate_number");
  const form = plateInput.closest("form") as HTMLFormElement | null;
  if (!form) {
    throw new Error("Vehicle form not found");
  }
  return form;
}

function getVehicleClientInput(container: HTMLElement) {
  return getVehicleForm(container).querySelector("input") as HTMLInputElement;
}

async function openSelect(input: HTMLInputElement) {
  await act(async () => {
    input.focus();
    await flush();
  });
  const wrapper = input.closest(".relative");
  const menuIsOpen = Boolean(wrapper?.querySelector(".absolute"));
  if (!menuIsOpen) {
    const triggerButtons = Array.from(wrapper?.querySelectorAll("button") ?? []);
    const trigger = triggerButtons.at(-1);
    if (!trigger) {
      throw new Error("Select trigger button not found");
    }
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await flush();
    });
  }
}

async function chooseSelectOption(input: HTMLInputElement, text: string) {
  await openSelect(input);
  let button: HTMLButtonElement | null = null;
  await waitFor(() => {
    button = (Array.from(document.body.querySelectorAll("button")).find((item) => item.textContent?.includes(text)) as HTMLButtonElement | undefined) ?? null;
    expect(button).not.toBeNull();
  });
  await act(async () => {
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function clickSelectAction(input: HTMLInputElement, text: string) {
  await chooseSelectOption(input, text);
}

async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button ${text} not found`);
  }
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function clickSwitchByLabel(container: HTMLElement, text: string) {
  const label = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.includes(text));
  const switchButton = label?.querySelector('button[role="switch"]') as HTMLButtonElement | null;
  if (!switchButton) {
    throw new Error(`Switch ${text} not found`);
  }
  await act(async () => {
    switchButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function submitForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function createClientFromOpenPanel(container: HTMLElement, name: string, phone = "+7 (000) 000-00-53") {
  await waitFor(() => Boolean(container.querySelector('input[name="full_name"]')));
  const fullNameInput = getInputByName(container, "full_name");
  const form = fullNameInput.closest("form") as HTMLFormElement;
  const phoneInput = Array.from(form.querySelectorAll("input")).find((input) => input.inputMode === "tel") as HTMLInputElement | undefined;
  if (!phoneInput) {
    throw new Error("Client phone input not found");
  }
  setInputValue(fullNameInput, name);
  setInputValue(phoneInput, phone);
  await submitForm(form);
}

async function createVehicleFromOpenPanel(container: HTMLElement, plate: string) {
  await waitFor(() => Boolean(container.querySelector('input[name="plate_number"]')));
  setInputValue(getInputByName(container, "plate_number"), plate);
  await submitForm(getVehicleForm(container));
}

async function openNewVehicle(container: HTMLElement) {
  let vehicleInput: HTMLInputElement | null = null;
  await waitFor(() => {
    vehicleInput =
      (Array.from(container.querySelectorAll("input")).find((input) =>
        ["Выберите автомобиль или владельца", "Выберите автомобиль", "Сначала выберите заказчика"].includes(input.placeholder)
      ) as HTMLInputElement | undefined) ?? null;
    expect(vehicleInput).not.toBeNull();
  });
  await clickSelectAction(vehicleInput as HTMLInputElement, "+ Новый автомобиль");
}

function countOptionButtons(input: HTMLInputElement, text: string) {
  const menu = input.closest(".relative");
  return Array.from(menu?.querySelectorAll("button") ?? []).filter((button) => button.textContent?.includes(text)).length;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("order vehicle owner preset integration", () => {
  it("creates a new owner, opens a real vehicle form with that owner visible, and saves linked vehicle/order payloads", async () => {
    const state = createState({ clientListIds: [1, 2, 3, 4], modules: { ...DEFAULT_MODULES_CONFIG, customer_payer: true, photos: false } });
    installFetchMock(state);
    const { container, queryClient, render, unmount } = mountOrder(state);

    await render();

    await clickSelectAction(await waitForInputByFieldLabel(container, "Владелец автомобиля"), "+ Новый клиент");
    await createClientFromOpenPanel(container, "Created Owner");

    await waitFor(() => {
      expect(getVehicleClientInput(container).value).toContain("Created Owner");
    });

    const createdOwner = Array.from(state.clients.values()).find((item) => item.full_name === "Created Owner");
    expect(createdOwner).toBeDefined();
    expect(getVehicleClientInput(container).value).toContain("Created Owner");

    await openSelect(getVehicleClientInput(container));
    expect(countOptionButtons(getVehicleClientInput(container), "Created Owner")).toBe(1);

    state.clientListIds.push(createdOwner!.id);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await flush();
    });
    expect(countOptionButtons(getVehicleClientInput(container), "Created Owner")).toBe(1);

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await flush();
    });
    await clickButtonByText(getVehicleForm(container), "Сбросить");
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Created Owner"));

    await createVehicleFromOpenPanel(container, "NEW123");

    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(createdOwner!.id);
    await waitFor(() => expect(container.querySelector('input[name="plate_number"]')).toBeNull());

    await clickButtonByText(container, "Создать заказ");
    await waitFor(() => expect(state.createOrderPayloads.length).toBe(1));
    expect(state.createOrderPayloads[0].client_id).toBe(createdOwner!.id);
    expect(state.createOrderPayloads[0].vehicle_id).toBe(700);

    unmount();
  });

  it("uses the selected existing owner for a new vehicle and uses the latest owner after reopening", async () => {
    const state = createState({ modules: { ...DEFAULT_MODULES_CONFIG, customer_payer: true, photos: false } });
    installFetchMock(state);
    const { container, render, unmount } = mountOrder(state);

    await render();

    await chooseSelectOption(await waitForInputByFieldLabel(container, "Владелец автомобиля"), "Demo Customer 29");
    await openNewVehicle(container);
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 29"));
    await createVehicleFromOpenPanel(container, "OWN111");
    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(2);

    await waitFor(() => expect(container.querySelector('input[name="plate_number"]')).toBeNull());
    await clickButtonByText(container, "Создать заказ");
    await waitFor(() => expect(state.createOrderPayloads.length).toBe(1));
    expect(state.createOrderPayloads[0].client_id).toBe(2);
    expect(state.createOrderPayloads[0].vehicle_id).toBe(700);

    await chooseSelectOption(await waitForInputByFieldLabel(container, "Владелец автомобиля"), "Demo Customer 31");
    await openNewVehicle(container);
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 31"));
    await clickButtonByText(getVehicleForm(container), "Сбросить");
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 31"));
    await createVehicleFromOpenPanel(container, "OWN222");

    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(4);

    unmount();
  });

  it("uses the order customer as vehicle-owner fallback when the payer module is disabled", async () => {
    const state = createState({ modules: { ...DEFAULT_MODULES_CONFIG, customer_payer: false, photos: false } });
    installFetchMock(state);
    const { container, render, unmount } = mountOrder(state);

    await render();

    await chooseSelectOption(await waitForInputByFieldLabel(container, "Клиент"), "Demo Customer 28");
    await openNewVehicle(container);

    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 28"));
    await createVehicleFromOpenPanel(container, "CUS111");

    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(1);
    await waitFor(() => expect(container.querySelector('input[name="plate_number"]')).toBeNull());
    await clickButtonByText(container, "Создать заказ");
    await waitFor(() => expect(state.createOrderPayloads.length).toBe(1));
    expect(state.createOrderPayloads[0].client_id).toBe(1);
    expect(state.createOrderPayloads[0].vehicle_id).toBe(700);

    unmount();
  });

  it("never uses the payer as the automatic vehicle owner", async () => {
    const state = createState({ modules: { ...DEFAULT_MODULES_CONFIG, customer_payer: true, photos: false } });
    installFetchMock(state);
    const { container, render, unmount } = mountOrder(state);

    await render();

    await chooseSelectOption(await waitForInputByFieldLabel(container, "Клиент-заказчик"), "Demo Customer 28");
    await clickSwitchByLabel(container, "Плательщик отличается от заказчика");
    await chooseSelectOption(await waitForInputByFieldLabel(container, "Клиент-плательщик"), "Demo Customer 30");

    await openNewVehicle(container);
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 28"));
    await createVehicleFromOpenPanel(container, "PAY111");
    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(1);

    await waitFor(() => expect(container.querySelector('input[name="plate_number"]')).toBeNull());
    await chooseSelectOption(await waitForInputByFieldLabel(container, "Владелец автомобиля"), "Demo Customer 29");
    await openNewVehicle(container);
    await waitFor(() => expect(getVehicleClientInput(container).value).toContain("Demo Customer 29"));
    await createVehicleFromOpenPanel(container, "PAY222");
    expect(state.createVehiclePayloads.at(-1)?.client_id).toBe(2);

    unmount();
  });
});
