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

# --- Landing page (GitHub Pages project presentation, PRD FR-F12 / F13) ---
# Source: landing/ (hand-authored HTML + CSS, no SSG).
# Branding assets stay canonical in branding/ — copied into _site/ at stage time.
LANDING_STAGE := _site

.PHONY: landing-stage landing-preview landing-check
landing-stage: ## Assemble _site/ from landing/ + branding/ (idempotent)
	@rm -rf $(LANDING_STAGE)
	@mkdir -p $(LANDING_STAGE)/fonts
	@cp landing/index.html landing/style.css landing/.nojekyll $(LANDING_STAGE)/
	@cp branding/flowatch-lockup.svg $(LANDING_STAGE)/
	@cp branding/flowatch-favicon.svg $(LANDING_STAGE)/favicon.svg
	@cp branding/fonts/ibm-plex-sans-400.woff2 branding/fonts/ibm-plex-sans-500.woff2 branding/fonts/ibm-plex-sans-600.woff2 $(LANDING_STAGE)/fonts/
	@cp branding/fonts/ibm-plex-mono-400.woff2 branding/fonts/ibm-plex-mono-500.woff2 $(LANDING_STAGE)/fonts/
	@cp branding/fonts/ibm-plex-serif-400.woff2 branding/fonts/ibm-plex-serif-500.woff2 $(LANDING_STAGE)/fonts/
	@echo "Staged → $(LANDING_STAGE)/"
landing-preview: landing-stage ## Serve the staged landing site on http://localhost:4173
	@echo "Serving $(LANDING_STAGE)/ at http://localhost:4173  (Ctrl+C to stop)"
	@cd $(LANDING_STAGE) && python3 -m http.server 4173 --bind 127.0.0.1
landing-check: ## NFR-9 enforcement — fail on any external https:// asset reference
	@# Asset-loading tags: scripts, images, iframes, media — never allowed remote
	@if grep -nE '<(script|img|iframe|video|audio|source)[^>]*src="https?://' landing/index.html landing/style.css 2>/dev/null; then echo "FAIL: external asset src found in landing/"; exit 1; fi
	@# Asset-loading <link rel="..."> — flag stylesheet, preload, prefetch, modulepreload, icon, manifest, dns-prefetch, preconnect.
	@# Navigation/metadata rels (canonical, alternate, author) are allowed to be absolute URLs.
	@if grep -nE '<link[^>]*rel="(stylesheet|preload|prefetch|modulepreload|dns-prefetch|preconnect|subresource|icon|shortcut[[:space:]]+icon|apple-touch-icon|manifest)"[^>]*href="https?://' landing/index.html 2>/dev/null; then echo "FAIL: external asset-loading <link> found in landing/index.html"; exit 1; fi
	@if grep -nE '@import[[:space:]]+"?https?://' landing/style.css 2>/dev/null; then echo "FAIL: external @import found in landing/style.css"; exit 1; fi
	@if grep -nE 'src:[[:space:]]*url\([[:space:]]*"?https?://' landing/style.css 2>/dev/null; then echo "FAIL: external @font-face url() in landing/style.css"; exit 1; fi
	@echo "landing/: no external asset references ✓"

# --- CodeQL (SAST, local reproduction of .github/workflows/codeql.yml) ----
# Uses the `gh codeql` CLI extension so contributors don't need a separate
# CodeQL CLI install. Same language + suite as CI. Outputs codeql.sarif
# to the repo root — open it with the "SARIF Viewer" or "CodeQL" VS Code
# extension. Both the DB dir and the sarif file are gitignored. We
# stash `coverage/` (if present from a prior `make test:coverage` run)
# during the scan so v8's auto-generated lcov-report JS doesn't pollute
# the local SARIF with false positives in vendored UI code.
.PHONY: codeql codeql-clean
codeql:       ## Local CodeQL SAST run (gh codeql; writes codeql.sarif at repo root)
	@command -v gh >/dev/null 2>&1 || { echo "gh CLI not found — install from https://cli.github.com"; exit 2; }
	@gh extension list 2>/dev/null | grep -q github/gh-codeql || gh extension install github/gh-codeql
	@rm -rf .codeql-db codeql.sarif
	@if [ -d coverage ]; then mv coverage .coverage-stash-for-codeql; fi
	@trap 'if [ -d .coverage-stash-for-codeql ]; then mv .coverage-stash-for-codeql coverage; fi' EXIT; \
		gh codeql database create .codeql-db --language=javascript-typescript --source-root=. --overwrite && \
		gh codeql database analyze .codeql-db \
			codeql/javascript-queries:codeql-suites/javascript-security-extended.qls \
			--format=sarif-latest --output=codeql.sarif --download
	@echo "→ codeql.sarif written. Open with the 'SARIF Viewer' or 'CodeQL' VS Code extension."
codeql-clean: ## Remove local CodeQL DB + sarif output
	rm -rf .codeql-db codeql.sarif

# --- Stryker (mutation testing, local reproduction of .github/workflows/mutate.yml)
# Same scope as CI (src/api.ts only — see stryker.config.mjs). Outputs an
# HTML report to reports/mutation/. Both .stryker-tmp/ and reports/ are
# gitignored. Advisory only — no threshold gating, no required check.
.PHONY: mutate mutate-clean
mutate:       ## Stryker mutation testing on src/api.ts (HTML report → reports/mutation/)
	npx stryker run
mutate-clean: ## Remove Stryker temp + report
	rm -rf .stryker-tmp reports/mutation

# --- Misc ------------------------------------------------------------------
.PHONY: clean
clean: ## Remove node_modules and build output
	rm -rf node_modules dist $(LANDING_STAGE)
