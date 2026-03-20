#
# Makefile for kong-tools workspace
# - Handles scaffolder-backend-module-kong plugin
# - Handles kong-service-manager plugins (common, backend, frontend)
# - Static + dynamic plugin builds
#

VERSION ?= 1.0.2
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
SCAFFOLDER_MODULE_DIR = plugins/scaffolder-backend-module-kong
KSM_COMMON_DIR = plugins/kong-service-manager-common
KSM_BACKEND_DIR = plugins/kong-service-manager-backend
KSM_FRONTEND_DIR = plugins/kong-service-manager
KSM_SCAFFOLDER_EXT_DIR = plugins/scaffolder-field-extensions-kong

ALL_PLUGIN_DIRS = $(SCAFFOLDER_MODULE_DIR) $(KSM_COMMON_DIR) $(KSM_BACKEND_DIR) $(KSM_FRONTEND_DIR) $(KSM_SCAFFOLDER_EXT_DIR)

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic \
	set-version get-version unpublish clean clean-dynamic

help:
	@echo "Kong Tools Workspace Makefile"
	@echo "============================="
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

# Set version for all kong-tools packages
# Usage: make set-version VERSION=0.2.0
set-version:
	@echo "Setting all kong-tools packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install

# Build all plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build dynamic variants (backend + frontend only)
build-dynamic: build
	cd $(KSM_BACKEND_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export
	cd $(KSM_FRONTEND_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export
	cd $(KSM_SCAFFOLDER_EXT_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

# Create npm packages for all plugins
pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

# Pack dynamic variants
pack-dynamic:
	cd $(KSM_BACKEND_DIR)/dist-dynamic && npm pack
	cd $(KSM_FRONTEND_DIR)/dist-dynamic && npm pack
	cd $(KSM_SCAFFOLDER_EXT_DIR)/dist-dynamic && npm pack

# Helper: publish a single plugin if not already published
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

# Publish all static plugins (common first since others depend on it)
publish: build
	@echo "Publishing kong-tools plugins..."
	$(call publish_plugin,$(KSM_COMMON_DIR))
	$(call publish_plugin,$(SCAFFOLDER_MODULE_DIR))
	$(call publish_plugin,$(KSM_BACKEND_DIR))
	$(call publish_plugin,$(KSM_FRONTEND_DIR))
	$(call publish_plugin,$(KSM_SCAFFOLDER_EXT_DIR))

# Publish dynamic variants
publish-dynamic: build-dynamic
	@echo "Publishing dynamic variants..."
	@cd $(KSM_BACKEND_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true
	@cd $(KSM_FRONTEND_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true
	@cd $(KSM_SCAFFOLDER_EXT_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true

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
		npm unpublish $$PACKAGE_NAME@$(VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(VERSION)"; \
	done
	@echo "Packages unpublished."

# Full clean
clean:
	@echo "Cleaning kong-tools workspace..."
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
	@echo "Kong-tools workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning kong-tools dist-dynamic directories..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		rm -rf $$dir/dist-dynamic; \
	done
	@echo "Cleaned. Run build-dynamic to rebuild."
