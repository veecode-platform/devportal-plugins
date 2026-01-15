#
# Makefile for dummy plugins
# - Handles frontend and backend plugins
# - Supports both static and dynamic plugin builds
#

# Version for dummy packages (frontend, backend)
DUMMY_VERSION ?= 0.1.0
NPM_REGISTRY = ""
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build-frontend build-frontend-dynamic build-backend build-backend-dynamic build-all build-all-dynamic pack-frontend pack-frontend-dynamic pack-backend pack-backend-dynamic publish-frontend publish-frontend-dynamic publish-backend publish-backend-dynamic set-version clean-dynamic echo-paths publish-all publish-all-dynamic get-version unpublish-all dev lint test clean

help:
	@echo "Dummy Plugin Makefile"
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
	@echo "Version: $(DUMMY_VERSION)"

# Set version for all dummy packages (frontend, backend)
# Usage: make set-version DUMMY_VERSION=0.2.0
set-version: clean-dynamic
	@echo "Setting dummy packages to version $(DUMMY_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(DUMMY_VERSION)"/' plugins/dummy/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(DUMMY_VERSION)"/' plugins/dummy-backend/package.json
	@echo "✅ All packages updated to version $(DUMMY_VERSION)"
	@yarn install

# Build the dummy frontend plugin
build-frontend:
	yarn workspace @veecode-platform/backstage-plugin-dummy install && \
	yarn workspace @veecode-platform/backstage-plugin-dummy build

# Build the dynamic dummy frontend plugin
build-frontend-dynamic: build-frontend
	yarn workspace @veecode-platform/backstage-plugin-dummy export-dynamic

# Build the dummy backend plugin
build-backend:
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend install && \
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend build

# Build the dynamic dummy backend plugin
build-backend-dynamic: build-backend
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend export-dynamic

# Create npm package for dummy frontend plugin
pack-frontend:
	yarn workspace @veecode-platform/backstage-plugin-dummy pack

# Create npm package for dynamic dummy frontend plugin
pack-frontend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-dummy --cwd dist-dynamic pack

# Create npm package for dummy backend plugin
pack-backend:
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend pack

# Create npm package for dynamic dummy backend plugin
pack-backend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend --cwd dist-dynamic pack

# Pack all dummy packages
pack-all: pack-frontend pack-backend
	@echo "All dummy packages packed."

# Publish dummy frontend plugin (static)
publish-frontend: build-frontend
	@echo "Checking if dummy frontend needs to be published..."
	@cd plugins/dummy && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(DUMMY_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(DUMMY_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(DUMMY_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic dummy frontend plugin
publish-frontend-dynamic: build-frontend-dynamic
	@echo "Checking if dummy frontend dynamic needs to be published..."
	@cd plugins/dummy/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(DUMMY_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(DUMMY_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(DUMMY_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dummy backend plugin (static)
publish-backend: build-backend
	@echo "Checking if dummy backend needs to be published..."
	@cd plugins/dummy-backend && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(DUMMY_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(DUMMY_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(DUMMY_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic dummy backend plugin
publish-backend-dynamic: build-backend-dynamic
	@echo "Checking if dummy backend dynamic needs to be published..."
	@cd plugins/dummy-backend/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(DUMMY_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(DUMMY_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(DUMMY_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Build all static dummy packages
build-all: build-frontend build-backend
	@echo "All static dummy packages built."

# Build all dynamic dummy packages
build-all-dynamic: build-frontend-dynamic build-backend-dynamic
	@echo "All dynamic dummy packages built."

# Publish all static dummy packages
publish-all: publish-frontend publish-backend
	@echo "All static dummy packages published."

# Publish all dynamic dummy packages
publish-all-dynamic: publish-frontend-dynamic publish-backend-dynamic
	@echo "All dynamic dummy packages published."

# Clean dist-dynamic directories to force fresh export with latest dependencies
clean-dynamic:
	@echo "Cleaning dummy dist-dynamic directories..."
	rm -rf plugins/dummy/dist-dynamic
	rm -rf plugins/dummy-backend/dist-dynamic
	@echo "✅ Cleaned. Run build-frontend-dynamic or build-backend-dynamic to rebuild."

# Gets the latest version in npm registry for dummy plugins
get-version:
	@echo "Getting latest version in npm registry for dummy plugins..."
	@echo "backstage-plugin-dummy version:"
	@npm view @veecode-platform/backstage-plugin-dummy version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-dummy-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-dummy-dynamic version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-dummy-backend version:"
	@npm view @veecode-platform/backstage-plugin-dummy-backend version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"
	@echo "backstage-plugin-dummy-backend-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-dummy-backend-dynamic version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "Not published"

# Unpublish all dummy packages
unpublish-all:
	@echo "Unpublishing all dummy packages..."
	@echo "Unpublishing frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-dummy@$(DUMMY_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-dummy-backend@$(DUMMY_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-dummy-dynamic@$(DUMMY_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-dummy-backend-dynamic@$(DUMMY_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "✅ All packages unpublished."

# Development commands
dev:
	yarn start

lint:
	yarn workspace @veecode-platform/backstage-plugin-dummy lint && \
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend lint

lint-fix:
	yarn workspace @veecode-platform/backstage-plugin-dummy lint --fix && \
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend lint --fix

test:
	yarn workspace @veecode-platform/backstage-plugin-dummy test && \
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend test

clean:
	yarn workspace @veecode-platform/backstage-plugin-dummy clean
	yarn workspace @veecode-platform/backstage-plugin-dummy-backend clean
	rm -rf plugins/dummy/dist
	rm -rf plugins/dummy-backend/dist
	rm -rf plugins/dummy/node_modules
	rm -rf plugins/dummy-backend/node_modules
	rm -rf node_modules
