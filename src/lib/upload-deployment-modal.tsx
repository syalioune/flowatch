// SPDX-License-Identifier: Apache-2.0

/**
 * Upload-deployment modal (Story 9.2; .bar / .zip extension Story 25.1).
 *
 * Renders a file-picker modal accepting `.bpmn`, `.bpmn20.xml`, `.bar`,
 * or `.zip`. The submit path branches on extension:
 *   - .bpmn / .bpmn20.xml → reads as text, calls `api.deployBpmn`.
 *   - .bar / .zip          → passes the File blob directly, calls
 *                            `api.deployBar` (multipart, application/zip).
 *
 * Both paths route through the project's single multipart helper
 * `uploadDeployment`. On success the modal closes and the caller refreshes
 * the deployments loader. On failure the modal stays open and renders the
 * verbatim engine error via `<ErrorBox>` per Pattern P-003.
 */

import JSZip from "jszip";
import React from "react";
import { api, type FlowableDeployment } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface UploadDeploymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (deployment: FlowableDeployment) => void;
  /**
   * Focus-restore target (Epic 9 retro A-4, Story 10.2 AC-7).
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Story 25.1: renamed from `isValidBpmnExtension`; regex widened to
// .bpmn|.bpmn20.xml|.bar|.zip. No alias kept (per CLAUDE.md "no
// backwards-compat hacks").
export const isValidDeploymentExtension = (name: string): boolean =>
  /\.(bpmn|bpmn20\.xml|bar|zip)$/i.test(name);

// Story 25.1: discriminate which deployBar/deployBpmn branch to take on
// submit. Exported for unit testing.
export const detectArchiveKind = (filename: string): "bpmn" | "bar" =>
  /\.(bar|zip)$/i.test(filename) ? "bar" : "bpmn";

// Story 25.1: full-coverage .bar deploy — fans the archive across the three
// Flowable sub-apps because they do NOT cross-register (RC-17):
//   - POST /repository/deployments      → BPMN procs register for runtime.
//   - POST /dmn-repository/deployments  → per .dmn entry (DMN sub-app
//                                         rejects .bar with
//                                         "File must be of type .dmn").
//   - POST /app-api/app-repository/deployments → app-def registers.
// Exported for unit testing. Returns the BPMN-side deployment (the primary
// row that appears in /deployments) plus the optional app-deployment id
// and the list of DMN deployment ids for downstream observability.
export interface BarDeployResult {
  bpmn: FlowableDeployment;
  appApi: FlowableDeployment | null;
  dmnDeployments: FlowableDeployment[];
}

export const deployBarFanOut = async (filename: string, file: File): Promise<BarDeployResult> => {
  const zip = await JSZip.loadAsync(file);
  const dmnEntries: Array<{ name: string; blob: Blob }> = [];
  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && /\.dmn$/i.test(entry.name))
      .map(async (entry) => {
        const blob = await entry.async("blob");
        dmnEntries.push({ name: entry.name.replace(/.*\//, ""), blob });
      }),
  );

  // Strip executable BPMN / DMN entries from the archive before POSTing to
  // /app-api/app-repository/deployments. The app-engine parses bundled
  // .bpmn20.xml / .dmn files and attempts to register them in the BPMN /
  // DMN sub-app tables, which collides with the parallel BPMN-side deploy
  // (PostgreSQL `act_uniq_procdef` unique-key violation). The .app manifest
  // alone is sufficient for app-definition registration. RC-17.
  const appOnlyZip = new JSZip();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (/\.(bpmn|bpmn20\.xml|dmn)$/i.test(entry.name)) continue;
    appOnlyZip.file(entry.name, await entry.async("uint8array"));
  }
  const appOnlyBuf = await appOnlyZip.generateAsync({ type: "blob" });
  const appOnlyFile = new File([appOnlyBuf], filename, { type: "application/zip" });

  const [bpmnRes, appRes, ...dmnResults] = await Promise.allSettled([
    api.deployBar(filename, file),
    api.deployBarAppApi(filename, appOnlyFile),
    ...dmnEntries.map((e) =>
      api.deployDmn(e.name, new Blob([e.blob], { type: "application/xml" })),
    ),
  ]);

  // BPMN deploy is the primary contract — the deployment that appears in
  // /deployments. Its failure aborts the whole fan-out.
  if (bpmnRes.status === "rejected") throw bpmnRes.reason;

  const appApi = appRes.status === "fulfilled" ? appRes.value : null;
  const dmnDeployments: FlowableDeployment[] = [];
  for (const r of dmnResults) {
    if (r.status === "fulfilled") dmnDeployments.push(r.value);
  }

  return { bpmn: bpmnRes.value, appApi, dmnDeployments };
};

export const UploadDeploymentModal: React.FC<UploadDeploymentModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [validationMsg, setValidationMsg] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Reset internal state every time the modal opens — picking a file in one
  // session must not bleed into the next.
  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setBusy(false);
    setValidationMsg(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Escape closes — but not while busy: orphaning an in-flight upload would
  // leave the engine processing while the operator sees no feedback.
  React.useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, triggerRef]);

  if (!open) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setValidationMsg(null);
      return;
    }
    if (!isValidDeploymentExtension(picked.name)) {
      setValidationMsg("Please choose a .bpmn, .bpmn20.xml, .bar, or .zip file.");
      setFile(null);
      return;
    }
    setValidationMsg(null);
    setFile(picked);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const kind = detectArchiveKind(file.name);
      let deployment: FlowableDeployment;
      if (kind === "bar") {
        const result = await deployBarFanOut(file.name, file);
        deployment = result.bpmn;
      } else {
        deployment = await api.deployBpmn(file.name, await file.text());
      }
      setBusy(false);
      onSuccess(deployment);
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  const barPicked = file !== null && detectArchiveKind(file.name) === "bar";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="upload-deployment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-deployment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="upload-deployment-title">Upload deployment</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close upload modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <input
            ref={inputRef}
            type="file"
            accept=".bpmn,.bpmn20.xml,.bar,.zip,application/xml,text/xml,application/zip"
            data-testid="upload-deployment-input"
            onChange={onPick}
            disabled={busy}
          />
          {barPicked && (
            <p className="mute text-xs" data-testid="upload-bar-hint" style={{ marginTop: 8 }}>
              Recognized as a Flowable App archive — Flowatch will deploy bundled BPMN processes,
              register DMN decisions individually, and create the app definition.
            </p>
          )}
          {validationMsg && (
            <p className="mute text-xs" data-testid="upload-validation" style={{ marginTop: 8 }}>
              {validationMsg}
            </p>
          )}
          {error && (
            <div style={{ marginTop: 12 }}>
              <ErrorBox error={error} />
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button type="button" className="btn" onClick={closeWithFocus} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="upload-deployment-submit"
            onClick={submit}
            disabled={!file || busy}
          >
            {busy ? "Deploying…" : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
};
