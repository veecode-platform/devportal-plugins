#
# Makefile for github-workflows workspace
# - Handles common, frontend, and backend plugins
# - Supports both static and dynamic plugin builds
# - Has workspace:* dependency handling (replace-workspace/restore-workspace)
#

VERSION ?= 1.3.7
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
COMMON_DIR = plugins/github-workflows-common
FRONTEND_DIR = plugins/github-workflows
BACKEND_DIR = plugins/github-workflow-backend

ALL_PLUGIN_DIRS = $(COMMON_DIR) $(FRONTEND_DIR) $(BACKEND_DIR)

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic \
	set-version get-version unpublish clean clean-dynamic \
	replace-workspace restore-workspace

help:
	@echo "GitHub Workflows Workspace Makefile"
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
	@echo "Publish Commands:"
	@echo "  make publish             - Publish all static plugins"
	@echo "  make publish-dynamic     - Publish all dynamic plugins"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
	@echo "  make get-version         - Show latest published versions"
	@echo "  make unpublish           - Unpublish all packages at current version"
	@echo "  make clean               - Full clean (node_modules, dist, logs, .tgz)"
	@echo "  make clean-dynamic       - Clean only dist-dynamic directories"

# Set version for all github-workflows packages
# Usage: make set-version VERSION=1.4.0
set-version:
	@echo "Setting github-workflows packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install
	@echo "Note: Dependencies using 'workspace:*' will be resolved during publish"

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins (requires common to be published first)
build-dynamic: build
	cd $(FRONTEND_DIR) && npx @red-hat-developer-hub/cli@latest plugin export
	cd $(BACKEND_DIR) && npx @red-hat-developer-hub/cli@latest plugin export

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

# Helper: publish a single plugin if not already published (with workspace:* safety check)
define publish_plugin_safe
	@cd $(1) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(VERSION)..."; \
		npm pack --pack-destination . && \
		TAR_FILE=$$(echo $$PACKAGE_NAME-$(VERSION).tgz | sed 's/\//-/g' | sed 's/^@//') && \
		tar -xzf $$TAR_FILE package/package.json && \
		if grep -q "workspace:" package/package.json; then \
			echo "Workspace references found in packed package. Please fix dependencies first."; \
			rm -rf package $$TAR_FILE; \
			exit 1; \
		fi && \
		rm -rf package && \
		npm publish --access public $$TAR_FILE $(NPM_REGISTRY_ARGS) && \
		rm $$TAR_FILE; \
	fi
endef

# Helper: publish a single plugin if not already published (simple)
define publish_plugin
	@cd $(1) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(VERSION)..."; \
		npm publish --access public $(NPM_REGISTRY_ARGS); \
	fi
endef

# Publish all static plugins (common first, then replace workspace refs, then frontend/backend)
publish: replace-workspace build
	@echo "Publishing github-workflows plugins..."
	$(call publish_plugin,$(COMMON_DIR))
	$(call publish_plugin_safe,$(FRONTEND_DIR))
	$(call publish_plugin_safe,$(BACKEND_DIR))

# Publish all dynamic plugins
publish-dynamic: replace-workspace build-dynamic
	@echo "Publishing dynamic variants..."
	@cd $(FRONTEND_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true
	@cd $(BACKEND_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true

# Get latest versions in npm registry
get-version:
	@echo "Getting latest versions in npm registry for github-workflows plugins..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		echo "$$PACKAGE_NAME:"; \
		npm view $$PACKAGE_NAME version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "  Not published yet"; \
	done

# Unpublish all packages (common last since others depend on it)
unpublish:
	@echo "Unpublishing github-workflows packages..."
	@for dir in $(FRONTEND_DIR) $(BACKEND_DIR) $(COMMON_DIR); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		npm unpublish $$PACKAGE_NAME@$(VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(VERSION)"; \
	done
	@echo "Packages unpublished."

# Full clean
clean:
	@echo "Cleaning github-workflows workspace..."
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
	@echo "GitHub-workflows workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning github-workflows dist-dynamic directories..."
	rm -rf $(FRONTEND_DIR)/dist-dynamic
	rm -rf $(BACKEND_DIR)/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."

# Internal: Replace workspace:* references with versioned refs before publish
replace-workspace:
	@echo "Replacing workspace: references with version $(VERSION)..."
	@$(SED_INPLACE) 's/"@veecode-platform\/github-workflows-common": "workspace:\*"/"@veecode-platform\/github-workflows-common": "^$(VERSION)"/' $(FRONTEND_DIR)/package.json
	@$(SED_INPLACE) 's/"@veecode-platform\/github-workflows-common": "workspace:\*"/"@veecode-platform\/github-workflows-common": "^$(VERSION)"/' $(BACKEND_DIR)/package.json
	@echo "Workspace references replaced with ^$(VERSION)"

# Internal: Restore workspace:* references after publish
restore-workspace:
	@echo "Restoring workspace: references..."
	@$(SED_INPLACE) 's/"@veecode-platform\/github-workflows-common": "\^$(VERSION)"/"@veecode-platform\/github-workflows-common": "workspace:*"/' $(FRONTEND_DIR)/package.json
	@$(SED_INPLACE) 's/"@veecode-platform\/github-workflows-common": "\^$(VERSION)"/"@veecode-platform\/github-workflows-common": "workspace:*"/' $(BACKEND_DIR)/package.json
	@echo "Workspace references restored to workspace:*"
