#
# Makefile for global-header plugin
# - Handles veecode-global-header plugin
# - Supports both static and dynamic plugin builds
#

# Version for global-header package
GLOBAL_HEADER_VERSION ?= 1.0.2
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic set-version clean-dynamic get-version unpublish-all cleanup

help:
	@echo "Global Header Plugin Makefile"
	@echo "============================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build the plugin"
	@echo "  make build-dynamic       - Build the dynamic plugin"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish             - Publish the static plugin"
	@echo "  make publish-dynamic     - Publish the dynamic plugin"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack the plugin to .tgz file"
	@echo "  make pack-dynamic        - Pack the dynamic plugin to .tgz file"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version GLOBAL_HEADER_VERSION=1.0.3 - Set version for package"
	@echo "  make clean-dynamic       - Clean dynamic build directory"
	@echo "  make cleanup             - Clean all build artifacts and node_modules"
	@echo "  make get-version         - Get latest published version"
	@echo "  make unpublish-all       - Unpublish all packages"

# Set version for global-header package
# Usage: make set-version GLOBAL_HEADER_VERSION=1.0.3
set-version: clean-dynamic
	@echo "Setting global-header package to version $(GLOBAL_HEADER_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GLOBAL_HEADER_VERSION)"/' plugins/veecode-global-header/package.json
	@echo "Package updated to version $(GLOBAL_HEADER_VERSION)"
	@yarn install

# Build the global-header plugin
build:
	yarn install && yarn tsc && yarn build:all

# Build the dynamic global-header plugin
build-dynamic: build
	cd plugins/veecode-global-header && \
	npx @red-hat-developer-hub/cli@latest plugin export

# Create npm package for global-header plugin
pack:
	cd plugins/veecode-global-header && npm pack

# Create npm package for dynamic global-header plugin
pack-dynamic:
	cd plugins/veecode-global-header/dist-dynamic && npm pack

# Publish global-header plugin
publish: build
	@echo "Checking if global-header plugin needs to be published..."
	@cd plugins/veecode-global-header && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic global-header plugin
publish-dynamic: build-dynamic
	@echo "Checking if global-header dynamic plugin needs to be published..."
	@cd plugins/veecode-global-header/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(GLOBAL_HEADER_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Clean dist-dynamic directory
clean-dynamic:
	@echo "Cleaning global-header dist-dynamic directory..."
	rm -rf plugins/veecode-global-header/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."

# Cleanup workspace
cleanup:
	@echo "Cleaning up global-header workspace..."
	@echo "Removing node_modules, build artifacts, and temporary files..."
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
	@echo "Global-header workspace cleanup complete!"

# Get latest version in npm registry
get-version:
	@echo "Getting latest version in npm registry for global-header plugin..."
	@echo "plugin-veecode-global-header version:"
	@npm view @veecode-platform/plugin-veecode-global-header version $(NPM_REGISTRY_ARGS) || echo "Not published yet"
	@echo "plugin-veecode-global-header-dynamic version:"
	@npm view @veecode-platform/plugin-veecode-global-header-dynamic version $(NPM_REGISTRY_ARGS) || echo "Not published yet"

# Unpublish all packages
unpublish-all:
	@echo "Unpublishing all global-header packages..."
	@echo "Unpublishing static plugin..."
	@npm unpublish @veecode-platform/plugin-veecode-global-header@$(GLOBAL_HEADER_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic plugin..."
	@npm unpublish @veecode-platform/plugin-veecode-global-header-dynamic@$(GLOBAL_HEADER_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "All packages unpublished."
