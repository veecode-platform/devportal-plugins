#
# Makefile for about workspace
# - Handles frontend and backend plugins
# - Supports both static and dynamic plugin builds
#

VERSION ?= 1.0.2
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

# Plugin directories
FRONTEND_DIR = plugins/about
BACKEND_DIR = plugins/about-backend

ALL_PLUGIN_DIRS = $(FRONTEND_DIR) $(BACKEND_DIR)

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic \
	set-version get-version unpublish clean clean-dynamic

help:
	@echo "About Workspace Makefile"
	@echo "========================"
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

# Set version for all about packages
# Usage: make set-version VERSION=0.2.0
set-version:
	@echo "Setting about packages to version $(VERSION)..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' $$dir/package.json; \
		echo "  Updated $$dir"; \
	done
	@echo "All packages updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Build all dynamic plugins
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
	@echo "Publishing about plugins..."
	$(call publish_plugin,$(FRONTEND_DIR))
	$(call publish_plugin,$(BACKEND_DIR))

# Publish all dynamic plugins
publish-dynamic: build-dynamic
	@echo "Publishing dynamic variants..."
	@cd $(FRONTEND_DIR)/dist-dynamic && npm publish $(NPM_REGISTRY_ARGS) || true
	@cd $(BACKEND_DIR)/dist-dynamic && npm publish $(NPM_REGISTRY_ARGS) || true

# Get latest versions in npm registry
get-version:
	@echo "Getting latest versions in npm registry for about plugins..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		echo "$$PACKAGE_NAME:"; \
		npm view $$PACKAGE_NAME version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "  Not published yet"; \
	done

# Unpublish all packages
unpublish:
	@echo "Unpublishing about packages..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		npm unpublish $$PACKAGE_NAME@$(VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(VERSION)"; \
	done
	@echo "Packages unpublished."

# Full clean
clean:
	@echo "Cleaning about workspace..."
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
	@echo "About workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning about dist-dynamic directories..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		rm -rf $$dir/dist-dynamic; \
	done
	@echo "Cleaned. Run build-dynamic to rebuild."
