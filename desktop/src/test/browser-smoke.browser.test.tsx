import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginPage } from "@/pages/login-page";

describe("browser smoke", () => {
  it("renders login form", () => {
    const { container } = render(<LoginPage />);

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button")).toBeTruthy();
    expect(container.querySelector("#password")).toBeTruthy();
  });
});
