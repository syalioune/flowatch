// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <UploadDeploymentModal>.
 *
 * Covers AC-1 (markup), AC-2 (extension filter, case-insensitive), AC-3
 * (successful submit + onSuccess), AC-4 (failure keeps modal open with
 * ErrorBox), AC-5 (network-error path), AC-6 (Cancel + Escape).
 *
 * Authored as jsdom `.test.tsx` so it contributes to the `src/lib/**`
 * coverage floor (browser-tier `.spec.tsx` files run under a separate
 * Vitest project that doesn't report into the same coverage gate).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableDeployment, FlowableError } from "../../api";
import { isValidBpmnExtension, UploadDeploymentModal } from "../upload-deployment-modal";

const file = (name: string, content = "<bpmn/>") => {
  const f = new File([content], name, { type: "application/xml" });
  // jsdom's File.text() does not always resolve reliably under userEvent.upload —
  // explicitly bind a Promise-returning shim so the modal's `await file.text()`
  // always resolves synchronously to the test fixture content.
  Object.defineProperty(f, "text", { value: () => Promise.resolve(content) });
  return f;
};

type DeployFn = (name: string, xml: string) => Promise<FlowableDeployment>;
type DeployHost = { deployBpmn: DeployFn };

describe("isValidBpmnExtension", () => {
  it("accepts .bpmn and .bpmn20.xml case-insensitively", () => {
    expect(isValidBpmnExtension("orders.bpmn")).toBe(true);
    expect(isValidBpmnExtension("orders.BPMN")).toBe(true);
    expect(isValidBpmnExtension("orders.bpmn20.xml")).toBe(true);
    expect(isValidBpmnExtension("Orders.Bpmn20.XML")).toBe(true);
  });

  it("rejects unrelated extensions", () => {
    expect(isValidBpmnExtension("foo.txt")).toBe(false);
    expect(isValidBpmnExtension("foo.pdf")).toBe(false);
    expect(isValidBpmnExtension("foo.dmn")).toBe(false);
    expect(isValidBpmnExtension("foo")).toBe(false);
    expect(isValidBpmnExtension("")).toBe(false);
  });
});

describe("<UploadDeploymentModal>", () => {
  const realDeploy = api.deployBpmn;
  let deploySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deploySpy = vi.fn();
    (api as DeployHost).deployBpmn = deploySpy as unknown as DeployFn;
  });

  afterEach(() => {
    (api as DeployHost).deployBpmn = realDeploy;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    render(<UploadDeploymentModal open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByTestId("upload-deployment-modal")).toBeNull();
  });

  it("renders the modal with header + file input + Cancel + Deploy when open", () => {
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("upload-deployment-modal")).toBeInTheDocument();
    expect(screen.getByText("Upload BPMN deployment")).toBeInTheDocument();
    expect(screen.getByTestId("upload-deployment-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const submit = screen.getByTestId("upload-deployment-submit");
    expect(submit).toBeDisabled();
  });

  it("rejects non-.bpmn files with an inline validation message", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    const input = screen.getByTestId("upload-deployment-input") as HTMLInputElement;
    await user.upload(input, file("foo.txt"));
    expect(screen.getByTestId("upload-validation")).toHaveTextContent(/\.bpmn or \.bpmn20\.xml/);
    expect(screen.getByTestId("upload-deployment-submit")).toBeDisabled();
  });

  it("accepts .bpmn files and enables Deploy", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("orders.bpmn"));
    expect(screen.queryByTestId("upload-validation")).toBeNull();
    expect(screen.getByTestId("upload-deployment-submit")).toBeEnabled();
  });

  it("accepts .bpmn20.xml files (mixed case)", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("Orders.Bpmn20.XML"));
    expect(screen.queryByTestId("upload-validation")).toBeNull();
    expect(screen.getByTestId("upload-deployment-submit")).toBeEnabled();
  });

  it("successful submit calls api.deployBpmn, invokes onSuccess, and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    deploySpy.mockResolvedValue({
      id: "dep-1",
      name: "orders.bpmn",
      deploymentTime: "now",
      tenantId: "",
    });
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("orders.bpmn"));
    await user.click(screen.getByTestId("upload-deployment-submit"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(deploySpy).toHaveBeenCalledWith("orders.bpmn", "<bpmn/>");
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dep-1", name: "orders.bpmn" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("failure shows ErrorBox in-modal and keeps the modal open with file retained", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    deploySpy.mockRejectedValue(new FlowableError("Bad BPMN XML", 400));
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("bad.bpmn"));
    await user.click(screen.getByTestId("upload-deployment-submit"));
    await waitFor(() => expect(screen.getByTestId("error-box")).toHaveTextContent("Bad BPMN XML"));
    // Modal stays open
    expect(screen.getByTestId("upload-deployment-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    // Deploy button non-busy again
    expect(screen.getByTestId("upload-deployment-submit")).toBeEnabled();
  });

  it("network-error (status 0) renders ErrorBox with no HTTP status badge", async () => {
    const user = userEvent.setup();
    deploySpy.mockRejectedValue(new TypeError("fetch failed"));
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("orders.bpmn"));
    await user.click(screen.getByTestId("upload-deployment-submit"));
    await waitFor(() => expect(screen.getByTestId("error-box")).toHaveTextContent("fetch failed"));
    // Story 7.3 contract: status 0 → no HTTP badge.
    expect(screen.queryByText(/^HTTP /)).toBeNull();
  });

  it("Cancel button invokes onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes the modal; panel click does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByTestId("upload-deployment-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    // Clicking inside the panel must NOT propagate to the backdrop close.
    await user.click(screen.getByText("Upload BPMN deployment"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close on Escape while busy", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveDeploy!: (v: FlowableDeployment) => void;
    deploySpy.mockReturnValue(
      new Promise<FlowableDeployment>((res) => {
        resolveDeploy = res;
      }),
    );
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("orders.bpmn"));
    await user.click(screen.getByTestId("upload-deployment-submit"));
    // Now busy — Deploy label flips to "Deploying…".
    await waitFor(() =>
      expect(screen.getByTestId("upload-deployment-submit")).toHaveTextContent("Deploying…"),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    // Resolve so the deferred promise doesn't dangle for vitest cleanup.
    resolveDeploy({ id: "dep-x", name: "orders.bpmn", deploymentTime: "", tenantId: "" });
  });
});
