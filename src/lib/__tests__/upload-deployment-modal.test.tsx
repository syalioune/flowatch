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
import {
  detectArchiveKind,
  isValidDeploymentExtension,
  UploadDeploymentModal,
} from "../upload-deployment-modal";

const file = (name: string, content = "<bpmn/>") => {
  const f = new File([content], name, { type: "application/xml" });
  // jsdom's File.text() does not always resolve reliably under userEvent.upload —
  // explicitly bind a Promise-returning shim so the modal's `await file.text()`
  // always resolves synchronously to the test fixture content.
  Object.defineProperty(f, "text", { value: () => Promise.resolve(content) });
  return f;
};

type DeployFn = (name: string, xml: string) => Promise<FlowableDeployment>;
type DeployBarFn = (name: string, file: Blob | File) => Promise<FlowableDeployment>;
type DeployHost = { deployBpmn: DeployFn; deployBar: DeployBarFn };

describe("isValidDeploymentExtension", () => {
  it("accepts .bpmn and .bpmn20.xml case-insensitively", () => {
    expect(isValidDeploymentExtension("orders.bpmn")).toBe(true);
    expect(isValidDeploymentExtension("orders.BPMN")).toBe(true);
    expect(isValidDeploymentExtension("orders.bpmn20.xml")).toBe(true);
    expect(isValidDeploymentExtension("Orders.Bpmn20.XML")).toBe(true);
  });

  it("accepts .bar and .zip case-insensitively (Story 25.1)", () => {
    expect(isValidDeploymentExtension("loan-app.bar")).toBe(true);
    expect(isValidDeploymentExtension("Loan-App.BAR")).toBe(true);
    expect(isValidDeploymentExtension("bundle.zip")).toBe(true);
    expect(isValidDeploymentExtension("BUNDLE.ZIP")).toBe(true);
  });

  it("rejects unrelated extensions", () => {
    expect(isValidDeploymentExtension("foo.txt")).toBe(false);
    expect(isValidDeploymentExtension("foo.pdf")).toBe(false);
    expect(isValidDeploymentExtension("foo.dmn")).toBe(false);
    expect(isValidDeploymentExtension("foo")).toBe(false);
    expect(isValidDeploymentExtension("")).toBe(false);
  });
});

describe("detectArchiveKind (Story 25.1)", () => {
  it("returns 'bar' for .bar / .zip case-insensitively", () => {
    expect(detectArchiveKind("loan-app.bar")).toBe("bar");
    expect(detectArchiveKind("LOAN.BAR")).toBe("bar");
    expect(detectArchiveKind("bundle.zip")).toBe("bar");
    expect(detectArchiveKind("BUNDLE.ZIP")).toBe("bar");
  });

  it("returns 'bpmn' for .bpmn / .bpmn20.xml (default branch)", () => {
    expect(detectArchiveKind("orders.bpmn")).toBe("bpmn");
    expect(detectArchiveKind("orders.bpmn20.xml")).toBe("bpmn");
    expect(detectArchiveKind("Orders.Bpmn20.XML")).toBe("bpmn");
    expect(detectArchiveKind("foo.txt")).toBe("bpmn");
  });
});

describe("<UploadDeploymentModal>", () => {
  const realDeploy = api.deployBpmn;
  const realDeployBar = api.deployBar;
  let deploySpy: ReturnType<typeof vi.fn>;
  let deployBarSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deploySpy = vi.fn();
    deployBarSpy = vi.fn();
    (api as DeployHost).deployBpmn = deploySpy as unknown as DeployFn;
    (api as DeployHost).deployBar = deployBarSpy as unknown as DeployBarFn;
  });

  afterEach(() => {
    (api as DeployHost).deployBpmn = realDeploy;
    (api as DeployHost).deployBar = realDeployBar;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    render(<UploadDeploymentModal open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByTestId("upload-deployment-modal")).toBeNull();
  });

  it("renders the modal with header + file input + Cancel + Deploy when open", () => {
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("upload-deployment-modal")).toBeInTheDocument();
    expect(screen.getByText("Upload deployment")).toBeInTheDocument();
    expect(screen.getByTestId("upload-deployment-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const submit = screen.getByTestId("upload-deployment-submit");
    expect(submit).toBeDisabled();
  });

  it("rejects unsupported files with an inline validation message", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    const input = screen.getByTestId("upload-deployment-input") as HTMLInputElement;
    await user.upload(input, file("foo.txt"));
    expect(screen.getByTestId("upload-validation")).toHaveTextContent(
      /\.bpmn, \.bpmn20\.xml, \.bar, or \.zip/,
    );
    expect(screen.getByTestId("upload-deployment-submit")).toBeDisabled();
  });

  it("accepts .bar files and shows the recognition hint (Story 25.1)", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("loan-app.bar"));
    expect(screen.queryByTestId("upload-validation")).toBeNull();
    expect(screen.getByTestId("upload-deployment-submit")).toBeEnabled();
    expect(screen.getByTestId("upload-bar-hint")).toHaveTextContent(/Flowable App archive/);
  });

  it("does NOT show the .bar hint when a .bpmn file is picked", async () => {
    const user = userEvent.setup();
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), file("orders.bpmn"));
    expect(screen.queryByTestId("upload-bar-hint")).toBeNull();
  });

  it(".bar submit calls api.deployBar with the raw File (Story 25.1)", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    deployBarSpy.mockResolvedValue({
      id: "dep-bar-1",
      name: "loan-app",
      deploymentTime: "now",
      tenantId: "",
    });
    const barFile = file("loan-app.bar");
    render(<UploadDeploymentModal open onClose={vi.fn()} onSuccess={onSuccess} />);
    await user.upload(screen.getByTestId("upload-deployment-input"), barFile);
    await user.click(screen.getByTestId("upload-deployment-submit"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(deployBarSpy).toHaveBeenCalledTimes(1);
    const [filename, fileArg] = deployBarSpy.mock.calls[0] ?? [];
    expect(filename).toBe("loan-app.bar");
    expect(fileArg).toBeInstanceOf(File);
    // .bpmn path MUST NOT fire on .bar pick.
    expect(deploySpy).not.toHaveBeenCalled();
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
    await user.click(screen.getByText("Upload deployment"));
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

  // Story 10.2 AC-7 / AC-12 — focus-restore via triggerRef.
  it("restores focus to triggerRef.current after Cancel", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Open Upload";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <UploadDeploymentModal open onClose={vi.fn()} onSuccess={vi.fn()} triggerRef={triggerRef} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it("does not throw when no triggerRef is provided and the modal closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UploadDeploymentModal open onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
