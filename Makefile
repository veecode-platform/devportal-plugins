#
# Makefile for building, packaging, and publishing devportal plugins
# Notes:
# - npm publishing honors NPM_CONFIG_REGISTRY or .npmrc settings
# - there are two variants of each plugin: static and dynamic
#

# point DEVPORTAL_BASE_PATH to "devportal-base" clone folder
# falls back to $HOME/projects/veecode/devportal-base if empty
DEVPORTAL_BASE_PATH ?= $(HOME)/projetos/veecode/devportal-base
DYNAMIC_PLUGIN_ROOT ?= $(DEVPORTAL_BASE_PATH)/dynamic-plugins-root
GLOBAL_HEADER_DYNAMIC_PLUGIN := $(PWD)/workspace/global-header/plugins/veecode-global-header/dist-dynamic
HOMEPAGE_DYNAMIC_PLUGIN := $(PWD)/workspace/homepage/plugins/veecode-homepage/dist-dynamic

# Version for github-workflows packages (common, frontend, backend)
GH_WORKFLOWS_VERSION ?= 1.3.5

.PHONY: build-homepage pack-homepage-plugin build-global-header pack-global-header-plugin build-github-workflows-common pack-github-workflows-common publish-github-workflows-common build-github-workflows build-github-workflows-dynamic build-github-workflows-backend build-github-workflows-backend-dynamic pack-github-workflows-backend-plugin pack-github-workflows-backend-plugin-dynamic clean cleanup-homepage cleanup-global-header cleanup-all publish-homepage publish-global-header publish-github-workflows publish-github-workflows-dynamic publish-github-workflows-backend publish-github-workflows-backend-dynamic set-github-workflows-version clean-github-workflows-dynamic echo-paths build-kong-scaffolder publish-kong-scaffolder

start-global-header-app:
	cd workspace/global-header && \
	yarn start

start-homepage-app:
	cd workspace/homepage && \
	yarn start

echo-paths:
	@echo "DYNAMIC_PLUGIN_ROOT: $(DYNAMIC_PLUGIN_ROOT)"
	@echo "GLOBAL_HEADER_DYNAMIC_PLUGIN: $(GLOBAL_HEADER_DYNAMIC_PLUGIN)"

# Set version for all github-workflows packages (common, frontend, backend)
# Usage: make set-github-workflows-version GH_WORKFLOWS_VERSION=1.4.0
set-github-workflows-version: clean-github-workflows-dynamic
	@echo "Setting github-workflows packages to version $(GH_WORKFLOWS_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' workspace/github-workflows/plugins/github-workflows-common/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' workspace/github-workflows/plugins/github-workflows/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(GH_WORKFLOWS_VERSION)"/' workspace/github-workflows/plugins/github-workflow-backend/package.json
	@echo "✅ All packages updated to version $(GH_WORKFLOWS_VERSION)"
	@cd workspace/github-workflows && yarn install
	@echo "Note: Dependencies using 'workspace:*' will be resolved during publish"

copy-dynamic-global-header-plugin: echo-paths
	@echo "Copying dynamic global-header plugin to DYNAMIC_PLUGIN_ROOT"
	@rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic
	@cp -R $(GLOBAL_HEADER_DYNAMIC_PLUGIN) $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic
	@echo "Done."

copy-dynamic-homepage-plugin: echo-paths
	@echo "Copying dynamic homepage plugin to DYNAMIC_PLUGIN_ROOT"
	@rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic
	@cp -R $(HOMEPAGE_DYNAMIC_PLUGIN) $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic
	@echo "Done."

copy-all-dynamic-plugins: copy-dynamic-global-header-plugin copy-dynamic-homepage-plugin
	@echo "All dynamic plugins copied to DYNAMIC_PLUGIN_ROOT"

# Build the homepage plugin
build-homepage:
	cd workspace/homepage && yarn install && yarn tsc && yarn build:all

# Build the dynamic homepage plugin
build-homepage-dynamic: build-homepage
	cd workspace/homepage/plugins/veecode-homepage && \
	npx @red-hat-developer-hub/cli@latest plugin export

# Create npm package for homepage plugin
pack-homepage-plugin:
	cd workspace/homepage/plugins/veecode-homepage && npm pack

# Create npm package for dynamic homepage plugin
pack-homepage-plugin-dynamic:
	cd workspace/homepage/plugins/veecode-homepage/dist-dynamic && npm pack

# Build the global-header plugin
build-global-header:
	cd workspace/global-header && yarn install && yarn tsc && yarn build:all

# Build the dynamic global-header plugin
build-global-header-dynamic: build-global-header
	cd workspace/global-header/plugins/veecode-global-header && \
	npx @red-hat-developer-hub/cli@latest plugin export

# Build the github-workflows-common package
build-github-workflows-common:
	cd workspace/github-workflows/plugins/github-workflows-common && yarn install && yarn build

# Create npm package for github-workflows-common
pack-github-workflows-common:
	cd workspace/github-workflows/plugins/github-workflows-common && npm pack

# Publish github-workflows-common package
publish-github-workflows-common: build-github-workflows-common
	@echo "Checking if github-workflows-common needs to be published..."
	@cd workspace/github-workflows/plugins/github-workflows-common && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) version >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(GH_WORKFLOWS_VERSION)..."; \
		npm publish; \
	fi

# Build the github-workflows plugin
build-github-workflows:
	cd workspace/github-workflows && yarn install && yarn build:all

# Build the dynamic github-workflows plugin
# NOTE: Requires github-workflows-common to be published first
build-github-workflows-dynamic: build-github-workflows publish-github-workflows-common
	cd workspace/github-workflows/plugins/github-workflows && \
	yarn export-dynamic

# Build the github-workflows backend plugin
build-github-workflows-backend:
	cd workspace/github-workflows && yarn install && yarn build:all

# Build the dynamic github-workflows backend plugin
# NOTE: Requires github-workflows-common to be published first
build-github-workflows-backend-dynamic: build-github-workflows-backend publish-github-workflows-common
	cd workspace/github-workflows/plugins/github-workflow-backend && \
	yarn export-dynamic

# Create npm package for global-header plugin
pack-global-header-plugin:
	cd workspace/global-header/plugins/veecode-global-header && npm pack

# Create npm package for dynamic global-header plugin
pack-global-header-plugin-dynamic:
	cd workspace/global-header/plugins/veecode-global-header/dist-dynamic && npm pack

# Create npm package for github-workflows backend plugin
pack-github-workflows-backend-plugin:
	cd workspace/github-workflows/plugins/github-workflow-backend && npm pack

# Create npm package for dynamic github-workflows backend plugin
pack-github-workflows-backend-plugin-dynamic:
	cd workspace/github-workflows/plugins/github-workflow-backend/dist-dynamic && npm pack

build-all: build-homepage build-global-header
	echo "All static plugins built."

build-all-dynamic: build-homepage-dynamic build-global-header-dynamic
	echo "All dynamic plugins built."

pack-all: pack-homepage-plugin pack-global-header-plugin
	echo "All static plugins packed."

pack-all-dynamic: pack-homepage-plugin-dynamic pack-global-header-plugin-dynamic
	echo "All dynamic plugins packed."

# Cleanup homepage workspace
cleanup-homepage:
	@echo "Cleaning up homepage workspace..."
	@echo "Removing node_modules, build artifacts, and temporary files..."
	cd workspace/homepage && yarn clean || true
	rm -rf workspace/homepage/node_modules
	rm -rf workspace/homepage/packages/*/node_modules
	rm -rf workspace/homepage/plugins/*/node_modules
	rm -rf workspace/homepage/dist-types
	rm -rf workspace/homepage/plugins/*/dist
	rm -rf workspace/homepage/plugins/*/dist-dynamic
	rm -rf workspace/homepage/plugins/*/dist-scalprum
	rm -rf workspace/homepage/plugins/*/*.tgz
	rm -rf workspace/homepage/packages/*/dist
	find workspace/homepage -name "*.log" -type f -delete || true
	find workspace/homepage -name "yarn-error.log" -type f -delete || true
	find workspace/homepage -name "npm-debug.log*" -type f -delete || true
	find workspace/homepage -name ".DS_Store" -type f -delete || true
	@echo "Homepage workspace cleanup complete!"

# Cleanup global-header workspace
cleanup-global-header:
	@echo "Cleaning up global-header workspace..."
	@echo "Removing node_modules, build artifacts, and temporary files..."
	cd workspace/global-header && yarn clean || true
	rm -rf workspace/global-header/node_modules
	rm -rf workspace/global-header/packages/*/node_modules
	rm -rf workspace/global-header/plugins/*/node_modules
	rm -rf workspace/global-header/dist-types
	rm -rf workspace/global-header/plugins/*/dist
	rm -rf workspace/global-header/plugins/*/dist-dynamic
	rm -rf workspace/global-header/plugins/*/dist-scalprum
	rm -rf workspace/global-header/plugins/*/*.tgz
	rm -rf workspace/global-header/packages/*/dist
	find workspace/global-header -name "*.log" -type f -delete || true
	find workspace/global-header -name "yarn-error.log" -type f -delete || true
	find workspace/global-header -name "npm-debug.log*" -type f -delete || true
	find workspace/global-header -name ".DS_Store" -type f -delete || true
	@echo "Global-header workspace cleanup complete!"

# Comprehensive cleanup of all workspaces
cleanup-all: cleanup-homepage cleanup-global-header
	@echo "All workspaces cleaned up successfully!"

# Publish homepage plugin (usage: make publish-homepage [REGISTRY=https://your-registry])
publish-homepage:
	cd workspace/homepage/plugins/veecode-homepage && \
	npm publish

# Publish global-header plugin (usage: make publish-global-header [REGISTRY=https://your-registry])
publish-global-header:
	cd workspace/global-header/plugins/veecode-global-header && \
	npm publish

# Publish dynamic homepage plugin
publish-homepage-dynamic:
	cd workspace/homepage/plugins/veecode-homepage/dist-dynamic && \
	npm publish

# Publish dynamic global-header plugin
publish-global-header-dynamic:
	cd workspace/global-header/plugins/veecode-global-header/dist-dynamic && \
	npm publish

# Publish github-workflows plugin (static)
publish-github-workflows: build-github-workflows
	cd workspace/github-workflows/plugins/github-workflows && \
	npm publish

# Publish dynamic github-workflows plugin
publish-github-workflows-dynamic: build-github-workflows-dynamic
	cd workspace/github-workflows/plugins/github-workflows/dist-dynamic && \
	npm publish

# Publish github-workflows backend plugin
publish-github-workflows-backend: build-github-workflows-backend
	cd workspace/github-workflows/plugins/github-workflow-backend && \
	npm publish

# Publish dynamic github-workflows backend plugin
publish-github-workflows-backend-dynamic: build-github-workflows-backend-dynamic
	cd workspace/github-workflows/plugins/github-workflow-backend/dist-dynamic && \
	npm publish

publish-all: publish-homepage publish-global-header publish-github-workflows-common publish-github-workflows publish-github-workflows-backend
	echo "All static plugins published."

publish-all-dynamic: publish-homepage-dynamic publish-global-header-dynamic publish-github-workflows-dynamic publish-github-workflows-backend-dynamic
	echo "All dynamic plugins published."

build-all-github-workflows: build-github-workflows-common build-github-workflows build-github-workflows-backend
	echo "All github-workflows plugins built."

publish-all-github-workflows: publish-github-workflows publish-github-workflows-backend
	echo "All github-workflows plugins published."

publish-all-github-workflows-dynamic: publish-github-workflows-backend-dynamic
	echo "All github-workflows dynamic plugins published."

# Clean dist-dynamic directories to force fresh export with latest dependencies
clean-github-workflows-dynamic:
	@echo "Cleaning github-workflows dist-dynamic directories..."
	rm -rf workspace/github-workflows/plugins/github-workflows/dist-dynamic
	rm -rf workspace/github-workflows/plugins/github-workflow-backend/dist-dynamic
	@echo "✅ Cleaned. Run build-github-workflows-dynamic or build-github-workflows-backend-dynamic to rebuild."

# Gets the latest version in npm registry for github-workflows plugins
get-github-workflows-version:
	@echo "Getting latest version in npm registry for github-workflows plugins..."
	@echo "backstage-plugin-github-workflows version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows version
	@echo "backstage-plugin-github-workflows-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-dynamic version
	@echo "backstage-plugin-github-workflows-backend version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-backend version
	@echo "backstage-plugin-github-workflows-backend-dynamic version:"
	@npm view @veecode-platform/backstage-plugin-github-workflows-backend-dynamic version

# Build the kong-scaffolder plugin (static only)
build-kong-scaffolder:
	cd workspace/kong-tools && yarn install && yarn tsc && yarn build:all

# Publish kong-scaffolder plugin (static)
publish-kong-scaffolder: build-kong-scaffolder
	cd workspace/kong-tools/plugins/scaffolder-backend-module-kong && \
	npm publish