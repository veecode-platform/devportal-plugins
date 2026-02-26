#
# Makefile for about plugins
# - Handles frontend and backend plugins
# - Supports both static and dynamic plugin builds
#

# Version for about packages (frontend, backend)
ABOUT_VERSION ?= 0.1.0
NPM_REGISTRY = ""
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build-frontend build-frontend-dynamic build-backend build-backend-dynamic build-all build-all-dynamic pack-frontend pack-frontend-dynamic pack-backend pack-backend-dynamic publish-frontend publish-frontend-dynamic publish-backend publish-backend-dynamic set-version clean-dynamic echo-paths publish-all publish-all-dynamic get-version unpublish-all dev lint test clean

help:
	@echo "About Plugin Makefile"
	@echo "====================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build-all              - Build all static packages (frontend, backend)"
	@echo "  make build-all-dynamic      - Build all dynamic packages"
	@echo "  make build-frontend         - Build frontend plugin only"
	@echo "  make build-backend          - Build backend plugin only"
	@echo "  make build-frontend-dynamic - Build dynamic frontend plugin"
	@echo "  make build-backend-dynamic  - Build dynamic backend plugin"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish-all            - Publish all static packages"
	@echo "  make publish-all-dynamic    - Publish all dynamic packages"
	@echo "  make publish-frontend       - Publish frontend plugin"
	@echo "  make publish-backend        - Publish backend plugin"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack-all               - Pack all packages to .tgz files"
	@echo "  make pack-frontend          - Pack frontend plugin"
	@echo "  make pack-backend           - Pack backend plugin"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev                    - Start development server"
	@echo "  make lint                   - Run linting on all plugins"
	@echo "  make test                   - Run tests on all plugins"
	@echo "  make clean                  - Clean build artifacts"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=0.2.0 - Set version for all packages"
	@echo "  make clean-dynamic          - Clean dynamic build directories"
	@echo "  make get-version            - Get latest published versions"
	@echo "  make echo-paths             - Show current directory and version"
	@echo "  make unpublish-all          - Unpublish all packages"

echo-paths:
	@echo "Current directory: $(PWD)"
	@echo "Version: $(ABOUT_VERSION)"

# Set version for all about packages (frontend, backend)
# Usage: make set-version ABOUT_VERSION=0.2.0
set-version: clean-dynamic
	@echo "Setting about packages to version $(ABOUT_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(ABOUT_VERSION)"/' plugins/about/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(ABOUT_VERSION)"/' plugins/about-backend/package.json
	@echo "✅ All packages updated to version $(ABOUT_VERSION)"
	@yarn install

# Build the about frontend plugin
build-frontend:
	yarn workspace @veecode-platform/backstage-plugin-about install && \
	yarn workspace @veecode-platform/backstage-plugin-about build

# Build the dynamic about frontend plugin
build-frontend-dynamic: build-frontend
	yarn workspace @veecode-platform/backstage-plugin-about export-dynamic

# Build the about backend plugin
build-backend:
	yarn workspace @veecode-platform/backstage-plugin-about-backend install && \
	yarn workspace @veecode-platform/backstage-plugin-about-backend build

# Build the dynamic about backend plugin
build-backend-dynamic: build-backend
	yarn workspace @veecode-platform/backstage-plugin-about-backend export-dynamic

# Create npm package for about frontend plugin
pack-frontend:
	yarn workspace @veecode-platform/backstage-plugin-about pack

# Create npm package for dynamic about frontend plugin
pack-frontend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-about --cwd dist-dynamic pack

# Create npm package for about backend plugin
pack-backend:
	yarn workspace @veecode-platform/backstage-plugin-about-backend pack

# Create npm package for dynamic about backend plugin
pack-backend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-about-backend --cwd dist-dynamic pack

# Pack all about packages
pack-all: pack-frontend pack-backend
	@echo "All about packages packed."

# Publish about frontend plugin (static)
publish-frontend: build-frontend
	@echo "Checking if about frontend needs to be published..."
	@cd plugins/about && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(ABOUT_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(ABOUT_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(ABOUT_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic about frontend plugin
publish-frontend-dynamic: build-frontend-dynamic
	@echo "Checking if about frontend dynamic needs to be published..."
	@cd plugins/about/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(ABOUT_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(ABOUT_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(ABOUT_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish about backend plugin (static)
publish-backend: build-backend
	@echo "Checking if about backend needs to be published..."
	@cd plugins/about-backend && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(ABOUT_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(ABOUT_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(ABOUT_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic about backend plugin
publish-backend-dynamic: build-backend-dynamic
	@echo "Checking if about backend dynamic needs to be published..."
	@cd plugins/about-backend/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(ABOUT_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(ABOUT_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(ABOUT_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Build all static about packages
build-all: build-frontend build-backend
	@echo "All static about packages built."

# Build all dynamic about packages
build-all-dynamic: build-frontend-dynamic build-backend-dynamic
	@echo "All dynamic about packages built."

# Publish all static about packages
publish-all: publish-frontend publish-backend
	@echo "All static about packages published."

# Publish all dynamic about packages
publish-all-dynamic: publish-frontend-dynamic publish-backend-dynamic
	@echo "All dynamic about packages published."

# Clean dist-dynamic directories to force fresh export with latest dependencies
clean-dynamic:
	@echo "Cleaning about dist-dynamic directories..."
	rm -rf plugins/about/dist-dynamic
	rm -rf plugins/about-backend/dist-dynamic
	@echo "✅ Cleaned. Run build-frontend-dynamic or build-backend-dynamic to rebuild."

# Gets the latest version in npm registry for about plugins
get-version:
	@echo "Getting latest version in npm registry for about plugins..."
	@echo "backstage-plugin-about version:"
	@npm view @veecode-platform/backstage-plugin-about version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-about-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-about-dynamic version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-about-backend version:"
	@npm view @veecode-platform/backstage-plugin-about-backend version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-about-backend-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-about-backend-dynamic version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"

# Unpublish all about packages
unpublish-all:
	@echo "Unpublishing all about packages..."
	@echo "Unpublishing frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-about@$(ABOUT_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-about-backend@$(ABOUT_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-about-dynamic@$(ABOUT_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-about-backend-dynamic@$(ABOUT_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "✅ All packages unpublished."

# Development commands
dev:
	yarn start

lint:
	yarn workspace @veecode-platform/backstage-plugin-about lint && \
	yarn workspace @veecode-platform/backstage-plugin-about-backend lint

lint-fix:
	yarn workspace @veecode-platform/backstage-plugin-about lint --fix && \
	yarn workspace @veecode-platform/backstage-plugin-about-backend lint --fix

test:
	yarn workspace @veecode-platform/backstage-plugin-about test && \
	yarn workspace @veecode-platform/backstage-plugin-about-backend test

clean:
	yarn workspace @veecode-platform/backstage-plugin-about clean
	yarn workspace @veecode-platform/backstage-plugin-about-backend clean
	rm -rf plugins/about/dist
	rm -rf plugins/about-backend/dist
	rm -rf plugins/about/node_modules
	rm -rf plugins/about-backend/node_modules
	rm -rf node_modules
