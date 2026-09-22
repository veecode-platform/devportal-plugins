#
# Makefile for marketplace workspace
# - Handles marketplace-frontend, marketplace-backend, and pending-changes plugins
# - Supports both static and dynamic plugin builds
#

VERSION ?= 0.1.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Source plugin directories
MARKETPLACE_FRONTEND_DIR = plugins/devportal-marketplace-frontend
MARKETPLACE_BACKEND_DIR  = plugins/devportal-marketplace-backend
PENDING_CHANGES_DIR      = plugins/devportal-pending-changes

# Dynamic wrapper directories
MARKETPLACE_FRONTEND_DYN = plugins/devportal-marketplace-frontend-dynamic
MARKETPLACE_BACKEND_DYN  = $(MARKETPLACE_BACKEND_DIR)
PENDING_CHANGES_DYN      = plugins/devportal-pending-changes-dynamic

ALL_PLUGIN_DIRS     = $(MARKETPLACE_FRONTEND_DIR) $(MARKETPLACE_BACKEND_DIR) $(PENDING_CHANGES_DIR)
ALL_DYNAMIC_DIRS    = $(MARKETPLACE_FRONTEND_DYN) $(MARKETPLACE_BACKEND_DYN) $(PENDING_CHANGES_DYN)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

help:
	@echo "Marketplace Workspace Makefile"
	@echo "=============================="
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

# Set version for all marketplace packages
# Usage: make set-version VERSION=0.2.0
set-version:
	@echo "Setting marketplace packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS) $(ALL_DYNAMIC_DIRS); do \
		$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins
build-dynamic: build
	cd $(MARKETPLACE_FRONTEND_DYN) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export
	cd $(PENDING_CHANGES_DYN) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export
	cd $(MARKETPLACE_BACKEND_DYN) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

# Pack all static plugins
pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

# Pack all dynamic plugins
pack-dynamic:
	cd $(MARKETPLACE_FRONTEND_DYN)/dist-dynamic && npm pack
	cd $(MARKETPLACE_BACKEND_DYN)/dist-dynamic && npm pack
	cd $(PENDING_CHANGES_DYN)/dist-dynamic && npm pack

# Full clean
clean:
	@echo "Cleaning marketplace workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/dist-types
	rm -rf plugins/*/dist-dynamic
	rm -rf plugins/*/dist-scalprum
	rm -rf plugins/*/*.tgz
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "Marketplace workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning marketplace dist-dynamic directories..."
	@for dir in $(ALL_DYNAMIC_DIRS); do \
		rm -rf $$dir/dist-dynamic; \
	done
	@echo "Cleaned. Run build-dynamic to rebuild."
