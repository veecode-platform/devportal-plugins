#
# Makefile for aws-cost-insights workspace
# - Handles @veecode-platform/plugin-aws-cost-insights plugin
# - Supports both static and dynamic plugin builds
#

VERSION ?= 0.1.0
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

PLUGIN_DIR = plugins/aws-cost-insights

ALL_PLUGIN_DIRS = $(PLUGIN_DIR)

.PHONY: help build build-dynamic pack pack-dynamic publish publish-dynamic \
	set-version get-version unpublish clean clean-dynamic

help:
	@echo "AWS Cost Insights Workspace Makefile"
	@echo "====================================="
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

set-version:
	@echo "Setting aws-cost-insights package to version $(VERSION)..."
	@$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(PLUGIN_DIR)/package.json
	@echo "Package updated to version $(VERSION)"
	@yarn install

build:
	yarn install && yarn tsc && yarn build:all

build-dynamic: build
	cd $(PLUGIN_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

pack:
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Packing $$dir..."; \
		cd $$dir && npm pack && cd ../..; \
	done

pack-dynamic:
	cd $(PLUGIN_DIR)/dist-dynamic && npm pack

define publish_plugin
	@cd $(1) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "$$PACKAGE_NAME@$(VERSION) is already published. Skipping."; \
	else \
		echo "Publishing $$PACKAGE_NAME@$(VERSION)..."; \
		npm publish --access public $(NPM_REGISTRY_ARGS); \
	fi
endef

publish: build
	@echo "Publishing aws-cost-insights plugin..."
	$(call publish_plugin,$(PLUGIN_DIR))

publish-dynamic: build-dynamic
	@echo "Publishing dynamic variant..."
	@cd $(PLUGIN_DIR)/dist-dynamic && npm publish --access public $(NPM_REGISTRY_ARGS) || true

get-version:
	@echo "Getting latest version in npm registry..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		echo "$$PACKAGE_NAME:"; \
		npm view $$PACKAGE_NAME version $(NPM_REGISTRY_ARGS) 2>/dev/null || echo "  Not published yet"; \
	done

unpublish:
	@echo "Unpublishing package..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		PACKAGE_NAME=$$(node -p "require('./$$dir/package.json').name"); \
		npm unpublish $$PACKAGE_NAME@$(VERSION) $(NPM_REGISTRY_ARGS) 2>/dev/null || true; \
		echo "  Unpublished $$PACKAGE_NAME@$(VERSION)"; \
	done
	@echo "Package unpublished."

clean:
	@echo "Cleaning workspace..."
	@rm -rf node_modules
	@for dir in $(ALL_PLUGIN_DIRS); do \
		echo "Cleaning $$dir..."; \
		rm -rf $$dir/node_modules $$dir/dist $$dir/dist-dynamic $$dir/*.tgz; \
	done
	@echo "Clean completed."

clean-dynamic:
	@echo "Cleaning dynamic build artifacts..."
	@for dir in $(ALL_PLUGIN_DIRS); do \
		rm -rf $$dir/dist-dynamic; \
	done
	@echo "Dynamic build artifacts cleaned."
