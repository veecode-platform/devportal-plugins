#
# Makefile for kong-tools workspace
# - Handles scaffolder-backend-module-kong plugin
# - Handles kong-service-manager plugins (common, backend, frontend)
# - Static + dynamic plugin builds
#

# Version for kong-tools packages
KONG_TOOLS_VERSION ?= 0.1.0
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

# Plugin directories
SCAFFOLDER_MODULE_DIR = plugins/scaffolder-backend-module-kong
KSM_COMMON_DIR = plugins/kong-service-manager-common
KSM_BACKEND_DIR = plugins/kong-service-manager-backend
KSM_FRONTEND_DIR = plugins/kong-service-manager

ALL_PLUGIN_DIRS = $(SCAFFOLDER_MODULE_DIR) $(KSM_COMMON_DIR) $(KSM_BACKEND_DIR) $(KSM_FRONTEND_DIR)

.PHONY: help build pack publish publish-all set-version get-version unpublish cleanup \
	build-dynamic pack-dynamic publish-dynamic

help:
	@echo "Kong Tools Plugin Makefile"
	@echo "=========================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build all plugins (static)"
	@echo "  make build-dynamic       - Build dynamic variants (backend + frontend)"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish             - Publish all static plugins"
	@echo "  make publish-dynamic     - Publish dynamic variants"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack all plugins to .tgz files"
	@echo "  make pack-dynamic        - Pack dynamic variants"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version KONG_TOOLS_VERSION=0.2.0 - Set version for all packages"
	@echo "  make cleanup             - Clean all build artifacts and node_modules"
	@echo "  make get-version         - Get latest published versions"
	@echo "  make unpublish           - Unpublish all packages"

# Set version for all kong-tools packages
# Usage: make set-version KONG_TOOLS_VERSION=0.2.0
set-version:
	@echo "Setting all kong-tools packages to version $(KONG_TOOLS_VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		sed -i '' 's/"version": "[^"]*"/"version": "$(KONG_TOOLS_VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(KONG_TOOLS_VERSION)"
	@yarn install

# Build all plugins
build:
	yarn install && yarn tsc && yarn build:all

# Create npm packages for all plugins
pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

# Build dynamic variants (backend + frontend only)
build-dynamic: build
	cd $(KSM_BACKEND_DIR) && npx @red-hat-developer-hub/cli@latest plugin export
	cd $(KSM_FRONTEND_DIR) && npx @red-hat-developer-hub/cli@latest plugin export

# Pack dynamic variants
pack-dynamic:
	cd $(KSM_BACKEND_DIR)/dist-dynamic && npm pack
	cd $(KSM_FRONTEND_DIR)/dist-dynamic && npm pack

# Helper: publish a single plugin if not already published
define publish_plugin
	@cd $(1) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(KONG_TOOLS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(KONG_TOOLS_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(KONG_TOOLS_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi
endef

# Publish all static plugins (common first since others depend on it)
publish: build
	@echo "Publishing kong-tools plugins..."
	$(call publish_plugin,$(KSM_COMMON_DIR))
	$(call publish_plugin,$(SCAFFOLDER_MODULE_DIR))
	$(call publish_plugin,$(KSM_BACKEND_DIR))
	$(call publish_plugin,$(KSM_FRONTEND_DIR))

# Publish dynamic variants
publish-dynamic: build-dynamic
	@echo "Publishing dynamic variants..."
	@cd $(KSM_BACKEND_DIR)/dist-dynamic && npm publish $(NPM_REGISTRY_ARGS) || true
	@cd $(KSM_FRONTEND_DIR)/dist-dynamic && npm publish $(NPM_REGISTRY_ARGS) || true

# Cleanup workspace
cleanup:
	@echo "Cleaning up kong-tools workspace..."
	@echo "Removing node_modules, build artifacts, and temporary files..."
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
	@echo "Kong-tools workspace cleanup complete!"

# Get latest versions in npm registry
get-version:
	@echo "Getting latest versions in npm registry for kong-tools plugins..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		echo "$$PACKAGE_NAME:"; \
		npm view $$PACKAGE_NAME version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "  Not published yet"; \
	done

# Unpublish all packages
unpublish:
	@echo "Unpublishing kong-tools packages..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		npm unpublish $$PACKAGE_NAME@$(KONG_TOOLS_VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(KONG_TOOLS_VERSION)"; \
	done
	@echo "Packages unpublished."
