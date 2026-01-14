#
# Makefile for kong-tools plugin
# - Handles scaffolder-backend-module-kong plugin
# - Static plugin build only (no dynamic variant)
#

# Version for kong-tools package
KONG_TOOLS_VERSION ?= 0.1.0
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build pack publish set-version get-version unpublish cleanup

help:
	@echo "Kong Tools Plugin Makefile"
	@echo "=========================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build the plugin"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish             - Publish the plugin"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack the plugin to .tgz file"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version KONG_TOOLS_VERSION=0.2.0 - Set version for package"
	@echo "  make cleanup             - Clean all build artifacts and node_modules"
	@echo "  make get-version         - Get latest published version"
	@echo "  make unpublish           - Unpublish the package"

# Set version for kong-tools package
# Usage: make set-version KONG_TOOLS_VERSION=0.2.0
set-version:
	@echo "Setting kong-tools package to version $(KONG_TOOLS_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(KONG_TOOLS_VERSION)"/' plugins/scaffolder-backend-module-kong/package.json
	@echo "Package updated to version $(KONG_TOOLS_VERSION)"
	@yarn install

# Build the kong-tools plugin
build:
	yarn install && yarn tsc && yarn build:all

# Create npm package for kong-tools plugin
pack:
	cd plugins/scaffolder-backend-module-kong && npm pack

# Publish kong-tools plugin
publish: build
	@echo "Checking if kong-tools plugin needs to be published..."
	@cd plugins/scaffolder-backend-module-kong && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(KONG_TOOLS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(KONG_TOOLS_VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(KONG_TOOLS_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

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
	rm -rf plugins/*/*.tgz
	rm -rf packages/*/dist
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "Kong-tools workspace cleanup complete!"

# Get latest version in npm registry
get-version:
	@echo "Getting latest version in npm registry for kong-tools plugin..."
	@echo "plugin-scaffolder-backend-module-kong version:"
	@npm view @veecode-platform/plugin-scaffolder-backend-module-kong version $(NPM_REGISTRY_ARGS) || echo "Not published yet"

# Unpublish package
unpublish:
	@echo "Unpublishing kong-tools package..."
	@npm unpublish @veecode-platform/plugin-scaffolder-backend-module-kong@$(KONG_TOOLS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Package unpublished."
