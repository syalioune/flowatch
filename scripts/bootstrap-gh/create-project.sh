#!/usr/bin/env bash
set -euo pipefail

owner="${1:-}"; repo="${2:-}"; title="${3:-Flowatch Roadmap}"

if [ -z "$owner" ] || [ -z "$repo" ]; then
  echo "Usage: $0 <owner> <repo> [title]"; exit 1
fi
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

ownerId="$(gh api graphql -f query='
query($owner:String!,$repo:String!){
  repository(owner:$owner,name:$repo){
    owner{ ... on Organization { id } ... on User { id } }
  }
}' -F owner="$owner" -F repo="$repo" --jq '.data.repository.owner.id')"

projectQ='
query($ownerId:ID!,$title:String!){
  node(id:$ownerId){
    ... on Organization { projectsV2(first:100,query:$title){nodes{id number title url}} }
    ... on User         { projectsV2(first:100,query:$title){nodes{id number title url}} }
  }
}'
filter=".data.node.projectsV2.nodes[]? | select(.title==\"$title\")"
existing="$(gh api graphql -f query="$projectQ" -F ownerId="$ownerId" -F title="$title" --jq "$filter")"

if [[ -n "$existing" ]]; then
  projectId="$(jq -r '.id' <<<"$existing")"
  projectNumber="$(jq -r '.number' <<<"$existing")"
  projectUrl="$(jq -r '.url' <<<"$existing")"
else
  projectId="$(gh api graphql -f query='
    mutation($ownerId:ID!,$title:String!){
      createProjectV2(input:{ownerId:$ownerId,title:$title}){ projectV2 { id number url } }
    }' -F ownerId="$ownerId" -F title="$title" --jq '.data.createProjectV2.projectV2.id')"
  projectNumber="$(gh api graphql -f query='query($id:ID!){ node(id:$id){ ... on ProjectV2 { number } } }' -F id="$projectId" --jq '.data.node.number')"
  projectUrl="$(gh api graphql -f query='query($id:ID!){ node(id:$id){ ... on ProjectV2 { url } } }' -F id="$projectId" --jq '.data.node.url')"
fi
echo "Project: $projectUrl"

create_field() {
  local name="$1"
  # GitHub no longer exposes `dataType` on ProjectV2FieldCommon — selecting
  # it triggers a generic "Something went wrong" error and pollutes the
  # caller's value with the error JSON. We only need id + name for the
  # idempotency check.
  gh api graphql -f query='
    query($pid:ID!){
      node(id:$pid){ ... on ProjectV2 { fields(first:50){ nodes{ ... on ProjectV2FieldCommon { id name } } } } }
    }' -F pid="$projectId" \
    --jq ".data.node.fields.nodes[] | select(.name==\"$name\") | .id" || true
}

mk_field() {
  local name="$1" dt="$2"
  shift 2

  # Idempotent: if a field with this name already exists on the project,
  # reuse its id rather than re-creating.
  local id
  id="$(create_field "$name")"
  if [[ -n "$id" ]]; then
    echo "$id"
    return
  fi

  # Build the [ProjectV2SingleSelectFieldOptionInput!] array as proper
  # JSON — never as inline GraphQL syntax — and bind it as a typed
  # variable via a request-body POST. GitHub's parser rejects the
  # sed-mangled inline-value form with a generic "Something went wrong"
  # error, which `gh api graphql --jq` then silently swallows.
  local opts_array
  opts_array=$(printf '%s\n' "$@" \
    | jq -R '{name: ., color: "GRAY", description: ""}' \
    | jq -cs '.')

  local body response
  body=$(jq -n \
    --arg pid "$projectId" \
    --arg name "$name" \
    --arg dt "$dt" \
    --argjson opts "$opts_array" \
    '{
      query: "mutation($pid:ID!,$name:String!,$dt:ProjectV2CustomFieldType!,$opts:[ProjectV2SingleSelectFieldOptionInput!]){createProjectV2Field(input:{projectId:$pid,name:$name,dataType:$dt,singleSelectOptions:$opts}){projectV2Field{... on ProjectV2FieldCommon{id name}}}}",
      variables: { pid: $pid, name: $name, dt: $dt, opts: $opts }
    }')

  response=$(gh api graphql --input - <<<"$body")
  if jq -e '.errors' <<<"$response" >/dev/null 2>&1; then
    echo "Failed to create field '$name':" >&2
    jq '.errors' <<<"$response" >&2
    exit 1
  fi
  jq -r '.data.createProjectV2Field.projectV2Field.id' <<<"$response"
}

statusId="$(mk_field   "State"    "SINGLE_SELECT" Backlog Ready Ongoing Review Blocked Done)"
priorityId="$(mk_field "Priority" "SINGLE_SELECT" critical high medium low)"
effortId="$(mk_field   "Effort"   "SINGLE_SELECT" XS S M L XL XXL)"
riskId="$(mk_field     "Risk"     "SINGLE_SELECT" Low Medium High)"
milestoneId="$(mk_field "Release" "SINGLE_SELECT" "0.0.1" "0.0.2" "0.0.3" "1.0.0")"

mkdir -p .github/project
cat > .github/project/ids.json <<JSON
{
  "project": { "id": "$projectId", "number": $projectNumber, "url": "$projectUrl", "owner": "$owner", "repo": "$repo" },
  "fields": {
    "State": "$statusId",
    "Priority": "$priorityId",
    "Effort": "$effortId",
    "Risk": "$riskId",
    "Release": "$milestoneId"
  }
}
JSON
echo "Wrote .github/project/ids.json"