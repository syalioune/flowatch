#!/usr/bin/env bash
set -euo pipefail

owner="${1:-}"; repo="${2:-}"; title="${3:-Flowatch Roadmap}"

[ -n "$owner" ] && [ -n "$repo" ] || { echo "Usage: $0 <owner> <repo> [title]"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

read -r ownerId ownerType <<<"$(gh api graphql -f query='
query($owner:String!,$repo:String!){
  repository(owner:$owner,name:$repo){
    owner{ __typename ... on Organization { id } ... on User { id } }
  }
}' -F owner="$owner" -F repo="$repo" --jq '.data.repository.owner.id + " " + .data.repository.owner.__typename')"

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

create_field(){ name="$1"; dt="$2"; gh api graphql -f query='
  query($pid:ID!){
    node(id:$pid){ ... on ProjectV2 { fields(first:50){ nodes{ ... on ProjectV2FieldCommon { id name dataType } } } } }
  }' -F pid="$projectId" --jq ".data.node.fields.nodes[] | select(.name==\"$name\") | .id" || true; 
}
mk_field(){ name="$1"; dt="$2"; shift; shift; opts_json=$(printf '%s\n' "$@" | jq -cR '{name:.,description:"",color:"GRAY"}' | jq -rcs '.' | sed -E 's#"(\w+)":#\1:#g' | sed 's#"GRAY"#GRAY#g'); 
  id="$(create_field "$name" "$dt")"; if [[ -z "$id" ]]; then id="$(gh api graphql -f query='
  mutation($pid:ID!,$name:String!,$dt:ProjectV2CustomFieldType!){
    createProjectV2Field(input:{projectId:$pid,name:$name,dataType:$dt,singleSelectOptions:'$opts_json'}){
      projectV2Field{ ... on ProjectV2FieldCommon { id name } }
    }
  }' -F pid="$projectId" -F name="$name" -F dt="$dt" --jq '.data.createProjectV2Field.projectV2Field.id')"; fi; echo "$id"; }

statusId="$(mk_field "State" "SINGLE_SELECT" Backlog Ready Ongoing Review Blocked Done)"
priorityId="$(mk_field "Priority" "SINGLE_SELECT" critical high medium low)"
effortId="$(mk_field "Effort" "SINGLE_SELECT" XS S M L XL XXL)"
riskId="$(mk_field "Risk" "SINGLE_SELECT" Low Medium High)"
milestoneId="$(mk_field "Release" "SINGLE_SELECT" "0.0.1" "0.1.0" "0.2.0" "0.3.0" "1.0.0")"

upsert_opts(){ fid="$1"; shift; opts_json="$(printf '%s
' "$@" | jq -R '{name:.,description:"",color:"GRAY"}' | jq -s '.')"; gh api graphql -f query='
  mutation($pid:ID!,$fid:ID!,$opts:[ProjectV2SingleSelectFieldOptionInput!]!){
    updateProjectV2ItemFieldValue(input:{projectId:$pid,fieldId:$fid,value:$opts}){
      projectV2SingleSelectField{ id name }
    }
  }' -F pid="$projectId" -F fid="$fid" -F opts="$opts_json" >/dev/null; }

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