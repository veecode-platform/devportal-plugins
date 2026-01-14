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
# GH_WORKFLOWS_VERSION is now managed in workspace/github-workflows/Makefile

.PHONY: build-homepage pack-homepage-plugin build-global-header pack-global-header-plugin clean cleanup-homepage cleanup-global-header cleanup-all publish-homepage publish-global-header echo-paths build-kong-scaffolder publish-kong-scaffolder

start-global-header-app:
	cd workspace/global-header && \
	yarn start

start-homepage-app:
	cd workspace/homepage && \
	yarn start

echo-paths:
	@echo "DYNAMIC_PLUGIN_ROOT: $(DYNAMIC_PLUGIN_ROOT)"
	@echo "GLOBAL_HEADER_DYNAMIC_PLUGIN: $(GLOBAL_HEADER_DYNAMIC_PLUGIN)"

# Note: github-workflows tasks are now managed in workspace/github-workflows/Makefile
# Use: cd workspace/github-workflows && make help

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

# Note: github-workflows build tasks are now managed in workspace/github-workflows/Makefile
# Use: cd workspace/github-workflows && make build-all

# Create npm package for global-header plugin
pack-global-header-plugin:
	cd workspace/global-header/plugins/veecode-global-header && npm pack

# Create npm package for dynamic global-header plugin
pack-global-header-plugin-dynamic:
	cd workspace/global-header/plugins/veecode-global-header/dist-dynamic && npm pack


build-all: build-homepage build-global-header
	echo "All static plugins built."
	@echo "Note: Use 'cd workspace/github-workflows && make build-all' for github-workflows plugins"

build-all-dynamic: build-homepage-dynamic build-global-header-dynamic
	echo "All dynamic plugins built."

pack-all: pack-homepage-plugin pack-global-header-plugin
	echo "All static plugins packed."
	@echo "Note: Use 'cd workspace/github-workflows && make pack-all' for github-workflows packages"

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

# Note: github-workflows publishing tasks are now managed in workspace/github-workflows/Makefile
# Use: cd workspace/github-workflows && make publish-all

publish-all: publish-homepage publish-global-header
	echo "All static plugins published."
	@echo "Note: Use 'cd workspace/github-workflows && make publish-all' for github-workflows packages"

publish-all-dynamic: publish-homepage-dynamic publish-global-header-dynamic
	echo "All dynamic plugins published."
	@echo "Note: Use 'cd workspace/github-workflows && make publish-all-dynamic' for github-workflows packages"

# Note: github-workflows tasks are now managed in workspace/github-workflows/Makefile
# Use: cd workspace/github-workflows && make build-all-github-workflows

# Build the kong-scaffolder plugin (static only)
build-kong-scaffolder:
	cd workspace/kong-tools && yarn install && yarn tsc && yarn build:all

# Publish kong-scaffolder plugin (static)
publish-kong-scaffolder: build-kong-scaffolder
	cd workspace/kong-tools/plugins/scaffolder-backend-module-kong && \
	npm publish

