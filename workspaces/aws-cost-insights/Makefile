#
# Makefile for aws-cost-insights workspace
# - Handles @veecode-platform/plugin-aws-cost-insights plugin
# - Supports both static and dynamic plugin builds
#

VERSION ?= 0.1.0

SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

PLUGIN_DIR = plugins/aws-cost-insights

ALL_PLUGIN_DIRS = $(PLUGIN_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

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
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=x.y.z - Set version for all packages"
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
