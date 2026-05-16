Deploy a BPMN or DMN file to the running Flowable engine.

Usage: /deploy-process <path-to-file>

Steps:
1. Read the file at the provided path
2. Determine the type: `.bpmn`, `.bpmn20.xml` → BPMN deployment; `.dmn`, `.dmn11.xml` → DMN deployment
3. For BPMN, POST to `/repository/deployments`:
   ```bash
   curl -sf -u rest-admin:test \
     -F "file=@<path>" \
     http://localhost:8080/flowable-rest/service/repository/deployments | jq '{id, name, deploymentTime}'
   ```
4. For DMN, POST to `/dmn-repository/deployments`:
   ```bash
   curl -sf -u rest-admin:test \
     -F "file=@<path>" \
     http://localhost:8080/flowable-rest/service/dmn-repository/deployments | jq '{id, name, deploymentTime}'
   ```
5. Report the deployment ID, name, and timestamp on success; show the error response on failure.

If no path is given, ask the user which file to deploy.
