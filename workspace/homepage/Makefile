#
# Makefile for homepage plugin
# - Handles veecode-homepage plugin
# - Supports both static and dynamic plugin builds
#

# Version for homepage package
HOMEPAGE_VERSION ?= 1.0.1
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic set-version clean-dynamic get-version unpublish-all cleanup

help:
	@echo "Homepage Plugin Makefile"
	@echo "========================"
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
	@echo "  make set-version HOMEPAGE_VERSION=1.0.2 - Set version for package"
	@echo "  make clean-dynamic       - Clean dynamic build directory"
	@echo "  make cleanup             - Clean all build artifacts and node_modules"
	@echo "  make get-version         - Get latest published version"
	@echo "  make unpublish-all       - Unpublish all packages"

# Set version for homepage package
# Usage: make set-version HOMEPAGE_VERSION=1.0.2
set-version: clean-dynamic
	@echo "Setting homepage package to version $(HOMEPAGE_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(HOMEPAGE_VERSION)"/' plugins/veecode-homepage/package.json
	@echo "Package updated to version $(HOMEPAGE_VERSION)"
	@yarn install

# Build the homepage plugin
build:
	yarn install && yarn tsc && yarn build:all

# Build the dynamic homepage plugin
build-dynamic: build
	cd plugins/veecode-homepage && \
	npx @red-hat-developer-hub/cli@latest plugin export

# Create npm package for homepage plugin
pack:
	cd plugins/veecode-homepage && npm pack

# Create npm package for dynamic homepage plugin
pack-dynamic:
	cd plugins/veecode-homepage/dist-dynamic && npm pack

# Publish homepage plugin
publish: build
	@echo "Checking if homepage plugin needs to be published..."
	@cd plugins/veecode-homepage && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(HOMEPAGE_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(HOMEPAGE_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(HOMEPAGE_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic homepage plugin
publish-dynamic: build-dynamic
	@echo "Checking if homepage dynamic plugin needs to be published..."
	@cd plugins/veecode-homepage/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(HOMEPAGE_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(HOMEPAGE_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(HOMEPAGE_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Clean dist-dynamic directory
clean-dynamic:
	@echo "Cleaning homepage dist-dynamic directory..."
	rm -rf plugins/veecode-homepage/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."

# Cleanup workspace
cleanup:
	@echo "Cleaning up homepage workspace..."
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
	@echo "Homepage workspace cleanup complete!"

# Get latest version in npm registry
get-version:
	@echo "Getting latest version in npm registry for homepage plugin..."
	@echo "plugin-veecode-homepage version:"
	@npm view @veecode-platform/plugin-veecode-homepage version $(NPM_REGISTRY_ARGS) || echo "Not published yet"
	@echo "plugin-veecode-homepage-dynamic version:"
	@npm view @veecode-platform/plugin-veecode-homepage-dynamic version $(NPM_REGISTRY_ARGS) || echo "Not published yet"

# Unpublish all packages
unpublish-all:
	@echo "Unpublishing all homepage packages..."
	@echo "Unpublishing static plugin..."
	@npm unpublish @veecode-platform/plugin-veecode-homepage@$(HOMEPAGE_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic plugin..."
	@npm unpublish @veecode-platform/plugin-veecode-homepage-dynamic@$(HOMEPAGE_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "All packages unpublished."
