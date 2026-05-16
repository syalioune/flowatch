Check the health of the Flowable engine and show active process counts.

Steps:
1. Run: `curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .`
2. Run: `curl -sf -u rest-admin:test "http://localhost:8080/flowable-rest/service/runtime/process-instances?size=1" | jq '{total: .total}'`
3. Run: `curl -sf -u rest-admin:test "http://localhost:8080/flowable-rest/service/runtime/tasks?size=1" | jq '{total: .total}'`
4. Run: `curl -sf -u rest-admin:test "http://localhost:8080/flowable-rest/service/management/jobs?size=1" | jq '{total: .total}'`

Report:
- Engine name, version, and status
- Active process instances count
- Open tasks count
- Pending jobs count
- Whether the engine is reachable or returning errors
