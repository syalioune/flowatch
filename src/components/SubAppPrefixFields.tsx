// SPDX-License-Identifier: Apache-2.0

/**
 * Shared per-sub-app URI prefix field group (Story 34.1 — FR-59).
 *
 * The SECOND deliberate idPrefix-namespaced presentational extraction after
 * `<AuthStrategyFields>` (Story 28.2, N=3). Same precedent EXACTLY: controlled
 * + presentational, the caller owns ALL state and the empty-string ↔ undefined
 * mapping on submit. This component only renders inputs + wires onChange.
 *
 * Renders a collapsible `<details>` ("Advanced: sub-app URI prefixes") so the
 * common case stays one-field-per-row — the operator opts in to advanced. The
 * group is collapsed by default; blank inputs = the *Base() helper's standard
 * flowable-rest:7.2.0 default (shown as each input's placeholder).
 *
 * `idPrefix` namespaces the id/htmlFor + the per-field testids per mount point
 * (`add-connection` / `edit-connection` / `settings-conn`). Each input carries
 * `data-testid="${idPrefix}-path-{service|dmn|cmmn|app}"`; the `<details>`
 * carries `data-testid="${idPrefix}-advanced-prefixes"`.
 */

import type React from "react";

export interface SubAppPrefixFieldsProps {
  /** Namespaces the `id`/`htmlFor` + testids per mount point. */
  idPrefix: string;
  servicePath: string;
  onServicePathChange: (v: string) => void;
  dmnPath: string;
  onDmnPathChange: (v: string) => void;
  cmmnPath: string;
  onCmmnPathChange: (v: string) => void;
  appPath: string;
  onAppPathChange: (v: string) => void;
  disabled?: boolean;
}

interface FieldSpec {
  key: "service" | "dmn" | "cmmn" | "app";
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

export const SubAppPrefixFields: React.FC<SubAppPrefixFieldsProps> = ({
  idPrefix,
  servicePath,
  onServicePathChange,
  dmnPath,
  onDmnPathChange,
  cmmnPath,
  onCmmnPathChange,
  appPath,
  onAppPathChange,
  disabled = false,
}) => {
  const fields: FieldSpec[] = [
    {
      key: "service",
      label: "Service path",
      placeholder: "/service",
      value: servicePath,
      onChange: onServicePathChange,
    },
    {
      key: "dmn",
      label: "DMN path",
      placeholder: "/dmn-api",
      value: dmnPath,
      onChange: onDmnPathChange,
    },
    {
      key: "cmmn",
      label: "CMMN path",
      placeholder: "/cmmn-api",
      value: cmmnPath,
      onChange: onCmmnPathChange,
    },
    {
      key: "app",
      label: "App path",
      placeholder: "/app-api",
      value: appPath,
      onChange: onAppPathChange,
    },
  ];
  return (
    <details className="adv-prefixes" data-testid={`${idPrefix}-advanced-prefixes`}>
      <summary>Advanced: sub-app URI prefixes</summary>
      <p className="mute" style={{ fontSize: 11, marginTop: 4 }}>
        Override per-sub-app mount paths for engines deployed differently from the reference image.
        Leave blank for the standard defaults.
      </p>
      <div className="adv-prefixes-grid">
        {fields.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`${idPrefix}-path-${f.key}`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              {f.label}
            </label>
            <input
              id={`${idPrefix}-path-${f.key}`}
              data-testid={`${idPrefix}-path-${f.key}`}
              type="text"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              disabled={disabled}
              maxLength={128}
              placeholder={f.placeholder}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
        ))}
      </div>
    </details>
  );
};
