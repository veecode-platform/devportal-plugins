#
# Makefile for veecode-theme workspace
# - Handles veecode-platform-plugin-veecode-theme plugin
# - Supports both static and dynamic plugin builds
#

VERSION ?= 0.1.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
PLUGIN_DIR = plugins/veecode-platform-plugin-veecode-theme

ALL_PLUGIN_DIRS = $(PLUGIN_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

help:
	@echo "VeeCode Theme Workspace Makefile"
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
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
	@echo "  make clean               - Full clean (node_modules, dist, logs, .tgz)"
	@echo "  make clean-dynamic       - Clean only dist-dynamic directories"

# Set version for veecode-theme package
# Usage: make set-version VERSION=0.2.0
set-version:
	@echo "Setting veecode-theme package to version $(VERSION)..."
	@$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(PLUGIN_DIR)/package.json
	@echo "Package updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins
build-dynamic: build
	cd $(PLUGIN_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

# Pack all static plugins
pack:
	cd $(PLUGIN_DIR) && npm pack

# Pack all dynamic plugins
pack-dynamic:
	cd $(PLUGIN_DIR)/dist-dynamic && npm pack

# Full clean
clean:
	@echo "Cleaning veecode-theme workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/dist-dynamic
	rm -rf plugins/*/dist-scalprum
	rm -rf plugins/*/*.tgz
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "VeeCode-theme workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning veecode-theme dist-dynamic directories..."
	rm -rf $(PLUGIN_DIR)/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."
