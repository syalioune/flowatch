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
  /**
   * The current Base URL. When provided, the component warns if a prefix value
   * is already embedded in the baseUrl (double-append risk).
   */
  baseUrl?: string | undefined;
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
  baseUrl,
}) => {
  // Warn if a prefix value appears embedded in baseUrl — likely double-append.
  // e.g. baseUrl="http://host/flowable-rest" + servicePath="/flowable-rest/service"
  // → effectiveBaseUrl would be "http://host/flowable-rest/flowable-rest/service".
  const overlapWarning = (fieldValue: string): string | null => {
    if (!baseUrl || !fieldValue.trim()) return null;
    const seg = fieldValue.trim().replace(/\/+$/, "").replace(/^\/+/, "");
    if (!seg) return null;
    const urlPath = baseUrl.replace(/^https?:\/\/[^/]+/, "");
    return urlPath.includes(seg)
      ? `"${seg}" appears in Base URL — check for double-appending.`
      : null;
  };
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
        Paths are relative to Base URL — e.g. <code>/service</code> or{" "}
        <code>/flowable-rest/service</code>. Leave blank for standard defaults.
      </p>
      <div className="adv-prefixes-grid">
        {fields.map((f) => {
          const warn = overlapWarning(f.value);
          return (
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
              {warn && (
                <p
                  className="mute"
                  style={{ fontSize: 11, margin: "2px 0 0", color: "var(--accent)" }}
                >
                  ⚠ {warn}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
};
