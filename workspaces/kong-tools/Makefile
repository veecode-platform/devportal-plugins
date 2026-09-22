#
# Makefile for kong-tools workspace
# - Handles scaffolder-backend-module-kong plugin
# - Handles kong-service-manager plugins (common, backend, frontend)
# - Static + dynamic plugin builds
#

VERSION ?= 1.1.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
SCAFFOLDER_MODULE_DIR = plugins/scaffolder-backend-module-kong
KSM_COMMON_DIR = plugins/kong-service-manager-common
KSM_BACKEND_DIR = plugins/kong-service-manager-backend
KSM_FRONTEND_DIR = plugins/kong-service-manager
KSM_SCAFFOLDER_EXT_DIR = plugins/scaffolder-field-extensions-kong

ALL_PLUGIN_DIRS = $(SCAFFOLDER_MODULE_DIR) $(KSM_COMMON_DIR) $(KSM_BACKEND_DIR) $(KSM_FRONTEND_DIR) $(KSM_SCAFFOLDER_EXT_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

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
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
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
	cd $(KSM_FRONTEND_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export
	cd $(KSM_SCAFFOLDER_EXT_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

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
