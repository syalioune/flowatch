# ===== Flowatch top-level Makefile ============================================
# Single-package React + Vite GUI for Flowable 7+. The Flowable engine itself
# runs via docker compose (postgres + flowable-rest + nginx CORS proxy).

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

REPO  ?= $(shell git config --get remote.origin.url 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+/[^/]+)#\1#' | sed 's/\.git$$//')
OWNER := $(shell echo "$(REPO)" | cut -d/ -f1)
NAME  := $(shell echo "$(REPO)" | cut -d/ -f2)

COMPOSE     := docker compose
ENGINE_BASE := http://localhost:8080/flowable-rest/service
ENGINE_AUTH := rest-admin:test

.PHONY: help
help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\n\033[1mFlowatch — common commands\033[0m\n\n"} /^[a-zA-Z0-9_/\-]+:.*##/ { printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2 } END{print ""}' $(MAKEFILE_LIST)

# --- App (root npm package) ------------------------------------------------
.PHONY: install dev stack build preview
install:  ## npm ci
	npm ci
dev:      ## Vite dev server on :5173 (assumes engine already running)
	npm run dev
stack:    ## Full local stack: postgres + flowable + nginx + Vite (one-shot via scripts/dev/run-dev.sh)
	bash scripts/dev/run-dev.sh
build:    ## Production bundle to dist/
	npm run build
preview:  ## Serve the production bundle locally
	npm run preview

# --- Engine (Docker Compose: postgres + flowable-rest + nginx CORS proxy) --
.PHONY: engine-up engine-down engine-stop engine-restart engine-ps engine-logs engine-clean engine-health engine-shell engine-psql
engine-up:       ## Start the engine stack (detached)
	$(COMPOSE) up -d
engine-down:     ## Stop and remove engine containers
	$(COMPOSE) down
engine-stop:     ## Stop engine containers (preserve state)
	$(COMPOSE) stop
engine-restart:  ## Restart engine services
	$(COMPOSE) restart
engine-ps:       ## List engine services and their health
	$(COMPOSE) ps
engine-logs:     ## Tail logs from all engine services
	$(COMPOSE) logs -f
engine-clean:    ## Stop, remove containers, volumes, and local images
	$(COMPOSE) down -v --rmi local
engine-health:   ## curl the Flowable engine management endpoint
	@curl -fsS -u $(ENGINE_AUTH) $(ENGINE_BASE)/management/engine \
		|| (echo "engine unreachable on $(ENGINE_BASE)" && exit 1)
engine-shell:    ## Open a shell in the flowable container
	$(COMPOSE) exec flowable sh
engine-psql:     ## psql into the postgres database
	$(COMPOSE) exec postgres psql -U flowable -d flowable

# --- GitHub bootstrap (one-time per repo) ----------------------------------
.PHONY: bootstrap bootstrap-labels bootstrap-milestones bootstrap-project bootstrap-protect
bootstrap: bootstrap-labels bootstrap-milestones bootstrap-project bootstrap-protect ## Run all GH bootstrap steps
bootstrap-labels:     ## Create/update GitHub labels
	@[ -n "$(REPO)" ] || (echo "REPO not detected. Run: make bootstrap-labels REPO=owner/name" && exit 1)
	bash scripts/bootstrap-gh/create-labels.sh "$(REPO)"
bootstrap-milestones: ## Create/update release milestones
	@[ -n "$(REPO)" ] || (echo "REPO not detected. Run: make bootstrap-milestones REPO=owner/name" && exit 1)
	bash scripts/bootstrap-gh/create-milestones.sh "$(REPO)"
bootstrap-project:    ## Create Projects v2 board & fields (writes .github/project/ids.json)
	@[ -n "$(OWNER)" ] && [ -n "$(NAME)" ] || (echo "Cannot parse OWNER/NAME from REPO=$(REPO)"; exit 1)
	bash scripts/bootstrap-gh/create-project.sh "$(OWNER)" "$(NAME)" "Flowatch Roadmap"
bootstrap-protect:    ## Apply branch protections + required checks + signed commits
	@[ -n "$(REPO)" ] || (echo "REPO not detected. Run: make bootstrap-protect REPO=owner/name" && exit 1)
	bash scripts/bootstrap-gh/protect-branches.sh "$(REPO)"

# --- User stories ↔ GitHub issues -----------------------------------------
.PHONY: stories-check stories-bootstrap stories-prune-list stories-from-epics
stories-check:        ## Validate docs/specifications/user-stories/ vs GitHub issues (exits 1 on drift)
	@bash scripts/user-stories/sync-user-stories.sh check
stories-bootstrap:    ## Create stub files for issues missing a local user-story file
	@bash scripts/user-stories/sync-user-stories.sh bootstrap
stories-prune-list:   ## List local user-story files without a matching issue (no deletion)
	@bash scripts/user-stories/sync-user-stories.sh prune-list
stories-from-epics:   ## Derive user-story stubs from the private-repo BMAD epics
	@bash scripts/user-stories/from-bmad-epics.sh

# --- BMAD private companion repo -------------------------------------------
.PHONY: bmad-setup bmad-sync bmad-sync-no-push bmad-status
bmad-setup:        ## Clone & symlink the private BMAD repo (interactive; pass args to setup-bmad.sh for non-interactive)
	bash scripts/setup-bmad.sh
bmad-sync:         ## Commit & push the private BMAD repo. Usage: make bmad-sync M="feat(prd): ..."
	@[ -n "$(M)" ] || (echo 'Set a commit message: make bmad-sync M="feat(prd): ..."'; exit 2)
	bash scripts/bmad-sync.sh -m "$(M)"
bmad-sync-no-push: ## Commit (no push) the private BMAD repo. Usage: make bmad-sync-no-push M="..."
	@[ -n "$(M)" ] || (echo 'Set a commit message: make bmad-sync-no-push M="feat(prd): ..."'; exit 2)
	bash scripts/bmad-sync.sh --no-push -m "$(M)"
bmad-status:       ## Print a one-line status of the private BMAD repo (no mutation)
	@bash scripts/bmad-sync.sh --status-only

# --- Release ---------------------------------------------------------------
.PHONY: release release-preview release-preview-full release-dryrun
release:              ## Run semantic-release (CI only — needs GITHUB_TOKEN)
	npm run release
release-preview:      ## Preview the next release (fast)
	npm run release:preview
release-preview-full: ## Preview the next release (full, parses every commit)
	npm run release:preview:full
release-dryrun:       ## Dry-run semantic-release end-to-end against the current branch
	@npx semantic-release --dry-run --no-ci 2>&1 | tee /tmp/semantic-release-dryrun.log

# --- Misc ------------------------------------------------------------------
.PHONY: clean
clean: ## Remove node_modules and build output
	rm -rf node_modules dist
