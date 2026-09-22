#
# Makefile for ldap-auth workspace
# - Handles frontend and backend plugins
# - Static plugin builds only (no dynamic support)
#

VERSION ?= 1.2.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
FRONTEND_DIR = plugins/ldap-auth
BACKEND_DIR = plugins/ldap-auth-backend

ALL_PLUGIN_DIRS = $(FRONTEND_DIR) $(BACKEND_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

help:
	@echo "LDAP Auth Workspace Makefile"
	@echo "============================"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build all static plugins"
	@echo "  make build-dynamic       - (not supported) No dynamic plugins in this workspace"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack all static plugins to .tgz"
	@echo "  make pack-dynamic        - (not supported) No dynamic plugins in this workspace"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
	@echo "  make clean               - Full clean (node_modules, dist, logs, .tgz)"
	@echo "  make clean-dynamic       - (not supported) No dynamic plugins in this workspace"

# Set version for all ldap-auth packages
# Usage: make set-version VERSION=1.0.0
set-version:
	@echo "Setting ldap-auth packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Dynamic plugins not supported in this workspace
build-dynamic:
	@echo "Dynamic plugins not supported in this workspace. Skipping."

# Pack all static plugins
pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

# Dynamic plugins not supported in this workspace
pack-dynamic:
	@echo "Dynamic plugins not supported in this workspace. Skipping."

# Full clean
clean:
	@echo "Cleaning ldap-auth workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/*.tgz
	rm -rf packages/*/dist
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "LDAP-auth workspace clean complete!"

# Dynamic plugins not supported in this workspace
clean-dynamic:
	@echo "Dynamic plugins not supported in this workspace. Skipping."
