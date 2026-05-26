// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <UploadDmnDeploymentModal> (Story 15.2).
 *
 * Mirrors the BPMN precedent at upload-deployment-modal.test.tsx with the
 * DMN wrapper (`api.deployDmn`) and the DMN-extension filter.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableDeployment, FlowableError } from "../../api";
import { isValidDmnExtension, UploadDmnDeploymentModal } from "../upload-dmn-deployment-modal";

const file = (name: string, content = "<dmn/>") => {
  const f = new File([content], name, { type: "application/xml" });
  Object.defineProperty(f, "text", { value: () => Promise.resolve(content) });
  return f;
};

type DeployFn = (name: string, xml: string) => Promise<FlowableDeployment>;
type DeployHost = { deployDmn: DeployFn };

describe("isValidDmnExtension", () => {
  it("accepts .dmn and .xml case-insensitively", () => {
    expect(isValidDmnExtension("rules.dmn")).toBe(true);
    expect(isValidDmnExtension("rules.DMN")).toBe(true);
    expect(isValidDmnExtension("rules.xml")).toBe(true);
  });

  it("rejects unrelated extensions", () => {
    expect(isValidDmnExtension("rules.txt")).toBe(false);
    expect(isValidDmnExtension("rules.bpmn")).toBe(false);
    expect(isValidDmnExtension("rules")).toBe(false);
  });
});

describe("<UploadDmnDeploymentModal>", () => {
  const realDeploy = api.deployDmn;
  let deploySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deploySpy = vi.fn();
    (api as unknown as DeployHost).deployDmn = deploySpy as unknown as DeployFn;
  });

  afterEach(() => {
    (api as unknown as DeployHost).deployDmn = realDeploy;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    render(<UploadDmnDeploymentModal open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByTestId("upload-dmn-deployment-modal")).toBeNull();
  });

  it("renders header + file input + Cancel + Deploy when open", () => {
    render(<UploadDmnDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("upload-dmn-deployment-modal")).toBeInTheDocument();
    expect(screen.getByText("Upload DMN deployment")).toBeInTheDocument();
    expect(screen.getByTestId("upload-dmn-deployment-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByTestId("upload-dmn-deployment-submit")).toBeDisabled();
  });

  it("rejects non-.dmn files with an inline validation message", async () => {
    const user = userEvent.setup();
    render(<UploadDmnDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    const input = screen.getByTestId("upload-dmn-deployment-input") as HTMLInputElement;
    await user.upload(input, file("foo.txt"));
    expect(screen.getByTestId("upload-dmn-validation")).toHaveTextContent(/\.dmn or \.xml/);
    expect(screen.getByTestId("upload-dmn-deployment-submit")).toBeDisabled();
  });

  it("successful submit calls api.deployDmn, invokes onSuccess, and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    deploySpy.mockResolvedValue({
      id: "dmn-dep-1",
      name: "rules.dmn",
      deploymentTime: "now",
      tenantId: "",
    });
    render(<UploadDmnDeploymentModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.upload(screen.getByTestId("upload-dmn-deployment-input"), file("rules.dmn"));
    await user.click(screen.getByTestId("upload-dmn-deployment-submit"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(deploySpy).toHaveBeenCalledWith("rules.dmn", "<dmn/>");
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dmn-dep-1", name: "rules.dmn" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("failure shows ErrorBox in-modal and keeps the modal open with file retained (retryable creation)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    deploySpy.mockRejectedValue(new FlowableError("Bad DMN XML", 400));
    render(<UploadDmnDeploymentModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.upload(screen.getByTestId("upload-dmn-deployment-input"), file("bad.dmn"));
    await user.click(screen.getByTestId("upload-dmn-deployment-submit"));
    await waitFor(() => expect(screen.getByTestId("error-box")).toHaveTextContent("Bad DMN XML"));
    expect(screen.getByTestId("upload-dmn-deployment-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    // Deploy button non-busy again — operator can fix-and-resubmit.
    expect(screen.getByTestId("upload-dmn-deployment-submit")).toBeEnabled();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(<UploadDmnDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("restores focus to triggerRef.current after Cancel", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Open Upload";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <UploadDmnDeploymentModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });
});
