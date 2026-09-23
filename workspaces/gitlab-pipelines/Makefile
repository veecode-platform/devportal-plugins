#
# Makefile for gitlab-pipelines workspace
# - Handles common, frontend, and backend plugins
# - Supports both static and dynamic plugin builds
# - Has workspace:* dependency handling (replace-workspace/restore-workspace)
#

VERSION ?= 1.0.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
FRONTEND_DIR := plugins/gitlab-pipelines
BACKEND_DIR  := plugins/gitlab-pipelines-backend
COMMON_DIR   := plugins/gitlab-pipelines-common

ALL_PLUGIN_DIRS := $(COMMON_DIR) $(FRONTEND_DIR) $(BACKEND_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic \
	replace-workspace restore-workspace

help:
	@echo "GitLab Pipelines Workspace Makefile"
	@echo "===================================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build all static plugins"
	@echo "  make build-dynamic       - Build all dynamic plugins"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack all static plugins to .tgz"
	@echo "  make pack-dynamic        - Pack all dynamic plugins to .tgz"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
	@echo "  make clean               - Full clean (node_modules, dist, logs, .tgz)"
	@echo "  make clean-dynamic       - Clean only dist-dynamic directories"

# Set version for all gitlab-pipelines packages
# Usage: make set-version VERSION=1.0.0
set-version:
	@echo "Setting gitlab-pipelines packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install
	@echo "Note: Dependencies using 'workspace:*' will be resolved during publish"

# Build all static plugins
build:
	YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins (embeds and installs private backend dependencies)
build-dynamic: build
	cd $(FRONTEND_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@1.11.2 plugin export
	cd $(BACKEND_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@1.11.2 plugin export --embed-package @veecode-platform/gitlab-pipelines-common --no-install
	cd $(BACKEND_DIR)/dist-dynamic && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install --no-immutable

# Pack all static plugins
pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

# Pack all dynamic plugins
pack-dynamic:
	cd $(FRONTEND_DIR)/dist-dynamic && npm pack
	cd $(BACKEND_DIR)/dist-dynamic && npm pack

# Full clean
clean:
	@echo "Cleaning gitlab-pipelines workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/dist-dynamic
	rm -rf plugins/*/*.tgz
	rm -rf packages/*/dist
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "GitLab Pipelines workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning gitlab-pipelines dist-dynamic directories..."
	rm -rf $(FRONTEND_DIR)/dist-dynamic
	rm -rf $(BACKEND_DIR)/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."

# Internal: Prepare workspace:* references for legacy package packing
replace-workspace:
	@echo "Replacing workspace: references with version $(VERSION)..."
	@$(SED_INPLACE) 's/"@veecode-platform\/gitlab-pipelines-common": "workspace:\*"/"@veecode-platform\/gitlab-pipelines-common": "^$(VERSION)"/' $(FRONTEND_DIR)/package.json
	@$(SED_INPLACE) 's/"@veecode-platform\/gitlab-pipelines-common": "workspace:\*"/"@veecode-platform\/gitlab-pipelines-common": "^$(VERSION)"/' $(BACKEND_DIR)/package.json
	@echo "Workspace references replaced with ^$(VERSION)"

# Internal: Restore workspace:* references after legacy package packing
restore-workspace:
	@echo "Restoring workspace: references..."
	@$(SED_INPLACE) 's/"@veecode-platform\/gitlab-pipelines-common": "\^$(VERSION)"/"@veecode-platform\/gitlab-pipelines-common": "workspace:*"/' $(FRONTEND_DIR)/package.json
	@$(SED_INPLACE) 's/"@veecode-platform\/gitlab-pipelines-common": "\^$(VERSION)"/"@veecode-platform\/gitlab-pipelines-common": "workspace:*"/' $(BACKEND_DIR)/package.json
	@echo "Workspace references restored to workspace:*"
