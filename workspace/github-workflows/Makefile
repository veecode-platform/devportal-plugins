#
# Makefile for github-workflows plugins
# - Handles common, frontend, and backend plugins
# - Supports both static and dynamic plugin builds
#

# Version for github-workflows packages (common, frontend, backend)
GH_WORKFLOWS_VERSION ?= 1.3.6
NPM_REGISTRY = ""
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build-common pack-common publish-common build-frontend build-frontend-dynamic build-backend build-backend-dynamic pack-frontend pack-frontend-dynamic pack-backend pack-backend-dynamic publish-frontend publish-frontend-dynamic publish-backend publish-backend-dynamic set-version clean-dynamic echo-paths build-all publish-all publish-all-dynamic get-version unpublish-all

help:
	@echo "GitHub Workflows Plugin Makefile"
	@echo "==============================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build-all           - Build all packages (common, frontend, backend)"
	@echo "  make build-common        - Build common package only"
	@echo "  make build-frontend      - Build frontend plugin only"
	@echo "  make build-backend       - Build backend plugin only"
	@echo "  make build-frontend-dynamic - Build dynamic frontend plugin"
	@echo "  make build-backend-dynamic  - Build dynamic backend plugin"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish-all         - Publish all static packages"
	@echo "  make publish-all-dynamic - Publish all dynamic packages"
	@echo "  make publish-common      - Publish common package"
	@echo "  make publish-frontend    - Publish frontend plugin"
	@echo "  make publish-backend     - Publish backend plugin"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack-all            - Pack all packages to .tgz files"
	@echo "  make pack-common         - Pack common package"
	@echo "  make pack-frontend       - Pack frontend plugin"
	@echo "  make pack-backend        - Pack backend plugin"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=1.4.0 - Set version for all packages"
	@echo "  make clean-dynamic       - Clean dynamic build directories"
	@echo "  make get-version         - Get latest published versions"
	@echo "  make echo-paths          - Show current directory and version"
	@echo "  make unpublish-all       - Unpublish all packages (common last)"

echo-paths:
	@echo "Current directory: $(PWD)"
	@echo "Version: $(GH_WORKFLOWS_VERSION)"

# Set version for all github-workflows packages (common, frontend, backend)
# Usage: make set-version GH_WORKFLOWS_VERSION=1.4.0
set-version: clean-dynamic
	@echo "Setting github-workflows packages to version $(GH_WORKFLOWS_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' plugins/github-workflows-common/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' plugins/github-workflows/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' plugins/github-workflow-backend/package.json
	@echo "✅ All packages updated to version $(GH_WORKFLOWS_VERSION)"
	@yarn install
	@echo "Note: Dependencies using 'workspace:*' will be resolved during publish"

# Build the github-workflows-common package
build-common:
	yarn workspace @veecode-platform/github-workflows-common install && \
	yarn workspace @veecode-platform/github-workflows-common build

# Create npm package for github-workflows-common
pack-common:
	yarn workspace @veecode-platform/github-workflows-common pack

# Publish github-workflows-common package
publish-common: build-common
	@echo "Checking if github-workflows-common needs to be published..."
	@cd plugins/github-workflows-common && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Build the github-workflows plugin
build-frontend:
	yarn workspace @veecode-platform/backstage-plugin-github-workflows install && \
	yarn workspace @veecode-platform/backstage-plugin-github-workflows build

# Build the dynamic github-workflows plugin
# NOTE: Requires github-workflows-common to be published first
build-frontend-dynamic: build-frontend publish-common
	yarn workspace @veecode-platform/backstage-plugin-github-workflows export-dynamic

# Build the github-workflows backend plugin
build-backend: build-common
	yarn workspace @veecode-platform/github-workflows-common install && \
	yarn workspace @veecode-platform/github-workflows-common build

# Build the dynamic github-workflows backend plugin
# NOTE: Requires github-workflows-common to be published first
build-backend-dynamic: build-backend publish-common
	yarn workspace @veecode-platform/backstage-plugin-github-workflows-backend export-dynamic

# Create npm package for github-workflows frontend plugin
pack-frontend:
	yarn workspace @veecode-platform/backstage-plugin-github-workflows pack

# Create npm package for dynamic github-workflows frontend plugin
pack-frontend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-github-workflows --cwd dist-dynamic pack

# Create npm package for github-workflows backend plugin
pack-backend:
	yarn workspace @veecode-platform/backstage-plugin-github-workflows-backend pack

# Create npm package for dynamic github-workflows backend plugin
pack-backend-dynamic:
	yarn workspace @veecode-platform/backstage-plugin-github-workflows-backend --cwd dist-dynamic pack

# Pack all github-workflows packages
pack-all: pack-common pack-frontend pack-backend
	echo "All github-workflows packages packed."

# Publish github-workflows plugin (static)
publish-frontend: replace-workspace build-frontend publish-common
	@echo "Checking if github-workflows frontend needs to be published..."
	@cd plugins/github-workflows && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION)..."; \
		npm pack --pack-destination . && \
		TAR_FILE=$$(echo $$PACKAGE_NAME-$(GH_WORKFLOWS_VERSION).tgz | sed 's/\//-/g' | sed 's/^@//') && \
		echo "Checking $$TAR_FILE content for 'workspace' refs..." && \
		tar -tzf $$TAR_FILE | grep -q "package.json" && \
		tar -xzf $$TAR_FILE package/package.json && \
		if grep -q "workspace:" package/package.json; then \
			echo "❌ Workspace references found in packed package. Please fix dependencies first."; \
			rm -rf package $$TAR_FILE; \
			exit 1; \
		fi && \
		rm -rf package && \
		npm publish $$TAR_FILE $(NPM_REGISTRY_ARGS) && \
		rm $$TAR_FILE; \
	fi

# Publish dynamic github-workflows plugin
publish-frontend-dynamic: replace-workspace build-frontend-dynamic publish-common
	@echo "Checking if github-workflows frontend dynamic needs to be published..."
	@cd plugins/github-workflows/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) dynamic package..."; \
		npm pack --pack-destination . && \
		TAR_FILE=$$(echo $$PACKAGE_NAME-$(GH_WORKFLOWS_VERSION).tgz | sed 's/\//-/g' | sed 's/^@//') && \
		echo "Checking $$TAR_FILE content for 'workspace' refs..." && \
		tar -tzf $$TAR_FILE | grep -q "package.json" && \
		tar -xzf $$TAR_FILE package/package.json && \
		if grep -q "workspace:" package/package.json; then \
			echo "❌ Workspace references found in packed package. Please fix dependencies first."; \
			rm -rf package $$TAR_FILE; \
			exit 1; \
		fi && \
		rm -rf package && \
		npm publish $$TAR_FILE $(NPM_REGISTRY_ARGS) && \
		rm $$TAR_FILE; \
	fi

# Publish github-workflows backend plugin
publish-backend: replace-workspace build-backend publish-common
	@echo "Checking if github-workflows backend needs to be published..."
	@cd plugins/github-workflow-backend && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION)..."; \
		npm pack --pack-destination . && \
		TAR_FILE=$$(echo $$PACKAGE_NAME-$(GH_WORKFLOWS_VERSION).tgz | sed 's/\//-/g' | sed 's/^@//') && \
		echo "Checking $$TAR_FILE content for 'workspace' refs..." && \
		tar -tzf $$TAR_FILE | grep -q "package.json" && \
		tar -xzf $$TAR_FILE package/package.json && \
		if grep -q "workspace:" package/package.json; then \
			echo "❌ Workspace references found in packed package. Please fix dependencies first."; \
			rm -rf package $$TAR_FILE; \
			exit 1; \
		fi && \
		rm -rf package && \
		npm publish $$TAR_FILE $(NPM_REGISTRY_ARGS) && \
		rm $$TAR_FILE; \
	fi

# Publish dynamic github-workflows backend plugin
publish-backend-dynamic: replace-workspace build-backend-dynamic publish-common
	@echo "Checking if github-workflows backend dynamic needs to be published..."
	@cd plugins/github-workflow-backend/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) dynamic package..."; \
		npm pack --pack-destination . && \
		TAR_FILE=$$(echo $$PACKAGE_NAME-$(GH_WORKFLOWS_VERSION).tgz | sed 's/\//-/g' | sed 's/^@//') && \
		echo "Checking $$TAR_FILE content for 'workspace' refs..." && \
		tar -tzf $$TAR_FILE | grep -q "package.json" && \
		tar -xzf $$TAR_FILE package/package.json && \
		if grep -q "workspace:" package/package.json; then \
			echo "❌ Workspace references found in packed package. Please fix dependencies first."; \
			rm -rf package $$TAR_FILE; \
			exit 1; \
		fi && \
		rm -rf package && \
		npm publish $$TAR_FILE $(NPM_REGISTRY_ARGS) && \
		rm $$TAR_FILE; \
	fi

# Build all github-workflows packages
build-all: build-common build-frontend build-backend
	echo "All github-workflows packages built."

# Publish all static github-workflows packages
publish-all: publish-common publish-frontend publish-backend
	echo "All static github-workflows packages published."

# Publish all dynamic github-workflows packages
publish-all-dynamic: publish-common publish-frontend-dynamic publish-backend-dynamic
	echo "All dynamic github-workflows packages published."

# Clean dist-dynamic directories to force fresh export with latest dependencies
clean-dynamic:
	@echo "Cleaning github-workflows dist-dynamic directories..."
	rm -rf plugins/github-workflows/dist-dynamic
	rm -rf plugins/github-workflow-backend/dist-dynamic
	@echo "✅ Cleaned. Run build-frontend-dynamic or build-backend-dynamic to rebuild."

# Gets the latest version in npm registry for github-workflows plugins
get-version:
	@echo "Getting latest version in npm registry for github-workflows plugins..."
	@echo "github-workflows-common version:"
	@npm view @veecode-platform/github-workflows-common version
	@echo "backstage-plugin-github-workflows version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows version
	@echo "backstage-plugin-github-workflows-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-dynamic version
	@echo "backstage-plugin-github-workflows-backend version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-backend version
	@echo "backstage-plugin-github-workflows-backend-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-backend-dynamic version

# unpublish packages (common package last)
unpublish-all:
	@echo "Unpublishing all github-workflows packages..."
	@echo "Unpublishing frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-github-workflows@$(GH_WORKFLOWS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-github-workflows-backend@$(GH_WORKFLOWS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-github-workflows-dynamic@$(GH_WORKFLOWS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-github-workflows-backend-dynamic@$(GH_WORKFLOWS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing common package..."
	@npm unpublish @veecode-platform/github-workflows-common@$(GH_WORKFLOWS_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "✅ All packages unpublished."

replace-workspace:
	@echo "Replacing workspace: references with version $(GH_WORKFLOWS_VERSION)..."
	@sed -i '' 's/"@veecode-platform\/github-workflows-common": "workspace:\*"/"@veecode-platform\/github-workflows-common": "^$(GH_WORKFLOWS_VERSION)"/' plugins/github-workflows/package.json
	@sed -i '' 's/"@veecode-platform\/github-workflows-common": "workspace:\*"/"@veecode-platform\/github-workflows-common": "^$(GH_WORKFLOWS_VERSION)"/' plugins/github-workflow-backend/package.json
	@echo "✅ Workspace references replaced with ^$(GH_WORKFLOWS_VERSION)"

restore-workspace:
	@echo "Restoring workspace: references..."
	@sed -i '' 's/"@veecode-platform\/github-workflows-common": "\^$(GH_WORKFLOWS_VERSION)"/"@veecode-platform\/github-workflows-common": "workspace:*"/' plugins/github-workflows/package.json
	@sed -i '' 's/"@veecode-platform\/github-workflows-common": "\^$(GH_WORKFLOWS_VERSION)"/"@veecode-platform\/github-workflows-common": "workspace:*"/' plugins/github-workflow-backend/package.json
	@echo "✅ Workspace references restored to workspace:*"
