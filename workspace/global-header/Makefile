#
# Makefile for global-header workspace
# - Handles veecode-global-header plugin
# - Supports both static and dynamic plugin builds
#

VERSION ?= 1.0.2
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

# Plugin directories
PLUGIN_DIR = plugins/veecode-global-header

ALL_PLUGIN_DIRS = $(PLUGIN_DIR)

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic \
	set-version get-version unpublish clean clean-dynamic

help:
	@echo "Global Header Workspace Makefile"
	@echo "================================="
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

# Set version for global-header package
# Usage: make set-version VERSION=1.0.3
set-version:
	@echo "Setting global-header package to version $(VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(PLUGIN_DIR)/package.json
	@echo "Package updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins
build-dynamic: build
	cd $(PLUGIN_DIR) && npx @red-hat-developer-hub/cli@latest plugin export

# Pack all static plugins
pack:
	cd $(PLUGIN_DIR) && npm pack

# Pack all dynamic plugins
pack-dynamic:
	cd $(PLUGIN_DIR)/dist-dynamic && npm pack

# Helper: publish a single plugin if not already published
define publish_plugin
	@cd $(1) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi
endef

# Publish all static plugins
publish: build
	@echo "Publishing global-header plugin..."
	$(call publish_plugin,$(PLUGIN_DIR))

# Publish all dynamic plugins
publish-dynamic: build-dynamic
	@echo "Publishing dynamic variant..."
	@cd $(PLUGIN_DIR)/dist-dynamic && npm publish $(NPM_REGISTRY_ARGS) || true

# Get latest versions in npm registry
get-version:
	@echo "Getting latest versions in npm registry for global-header plugin..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		echo "$$PACKAGE_NAME:"; \
		npm view $$PACKAGE_NAME version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "  Not published yet"; \
	done

# Unpublish all packages
unpublish:
	@echo "Unpublishing global-header packages..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		npm unpublish $$PACKAGE_NAME@$(VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(VERSION)"; \
	done
	@echo "Packages unpublished."

# Full clean
clean:
	@echo "Cleaning global-header workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/dist-dynamic
	rm -rf plugins/*/dist-scalprum
	rm -rf plugins/*/*.tgz
	rm -rf packages/*/dist
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "Global-header workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning global-header dist-dynamic directories..."
	rm -rf $(PLUGIN_DIR)/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."
