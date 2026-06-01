// SPDX-License-Identifier: Apache-2.0
//
// Story 25.1 E2E fixture builder — constructs a minimal Flowable App archive
// (.bar) in memory at test time. The shape was discovered via live-engine
// probe (T-9 of the Story 25.1 spec):
//
//   - `.app` MUST be JSON (NOT XML — engine returns "Error reading app
//     resource" on an XML manifest).
//   - Required JSON fields: `key`, `name`, optional `description`,
//     `theme`, `icon`, `models[]` (each `id`, `name`, `key`, `modelType: 0`
//     for BPMN, `version`).
//   - The archive can be deployed via `/repository/deployments` (BPMN
//     sub-app) which extracts the bundled BPMN process definitions, OR via
//     `/app-api/app-repository/deployments` which registers the
//     `app-definition` row. The two sub-apps DO NOT cross-register —
//     E2E seeds via the appropriate path per test.

import JSZip from "jszip";

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:flowable="http://flowable.org/bpmn"
  targetNamespace="http://flowable.org/bpmn">
  <process id="e2eAppProcess" name="E2E App Process" isExecutable="true">
    <startEvent id="start"/>
    <sequenceFlow id="f1" sourceRef="start" targetRef="end"/>
    <endEvent id="end"/>
  </process>
</definitions>`;

const APP_JSON = JSON.stringify(
  {
    key: "e2eApp",
    name: "E2E App",
    description: "Story 25.1 e2e fixture",
    theme: "theme-1",
    icon: "glyphicon-asterisk",
    models: [
      {
        id: 1,
        name: "E2E App Process",
        key: "e2eAppProcess",
        modelType: 0,
        version: 1,
      },
    ],
  },
  null,
  2,
);

export async function buildE2eBar() {
  const zip = new JSZip();
  zip.file("e2eAppProcess.bpmn20.xml", BPMN);
  zip.file("e2eApp.app", APP_JSON);
  return await zip.generateAsync({ type: "nodebuffer" });
}

export const E2E_APP_KEY = "e2eApp";
export const E2E_PROCESS_KEY = "e2eAppProcess";
export const E2E_DEPLOYMENT_NAME = "e2e-story-25-1-app";
