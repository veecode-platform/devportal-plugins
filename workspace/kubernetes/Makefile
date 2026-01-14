#
# Makefile for kubernetes plugin
# - Handles kubernetes-backend-module-getsecret plugin
# - Supports both static and dynamic plugin builds
#

# Version for kubernetes package
KUBERNETES_VERSION ?= 1.0.2
NPM_REGISTRY = ""
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

PLUGIN_DIR = plugins/kubernetes-backend-module-getsecret

.PHONY: help build pack publish publish-dynamic set-version bump-version clean-dynamic echo-paths get-version unpublish

help:
	@echo "Kubernetes Plugin Makefile"
	@echo "========================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build               - Build the kubernetes plugin"
	@echo "  make build-dynamic       - Build dynamic kubernetes plugin"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish             - Publish static plugin"
	@echo "  make publish-dynamic     - Publish dynamic plugin"
	@echo ""
	@echo "Package Commands:"
	@echo "  make pack                - Pack plugin to .tgz file"
	@echo "  make pack-dynamic        - Pack dynamic plugin to .tgz file"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=0.2.0 - Set version for plugin"
	@echo "  make bump-version [TYPE=patch|minor|major] - Bump version (default: patch)"
	@echo "  make clean-dynamic       - Clean dynamic build directory"
	@echo "  make get-version         - Get latest published version"
	@echo "  make echo-paths          - Show current directory and version"
	@echo "  make unpublish           - Unpublish plugin"

echo-paths:
	@echo "Current directory: $(PWD)"
	@echo "Version: $(KUBERNETES_VERSION)"

# Set version for kubernetes package
# Usage: make set-version KUBERNETES_VERSION=0.2.0
set-version: clean-dynamic
	@echo "Setting kubernetes package to version $(KUBERNETES_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(KUBERNETES_VERSION)"/' $(PLUGIN_DIR)/package.json
	@echo "✅ Package updated to version $(KUBERNETES_VERSION)"
	@yarn install
	@echo "Note: Dependencies using 'workspace:*' will be resolved during publish"

# Bump version for kubernetes package (patch version by default)
# Usage: make bump-version [TYPE=patch|minor|major]
bump-version:
	@echo "Bumping kubernetes package version..."
	@CURRENT_VERSION=$(KUBERNETES_VERSION); \
	TYPE=$(or $(TYPE),patch); \
	if [ "$$TYPE" = "patch" ]; then \
		NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{print $$1 "." $$2 "." ($$3+1)}'); \
	elif [ "$$TYPE" = "minor" ]; then \
		NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{print $$1 "." ($$2+1) ".0"}'); \
	elif [ "$$TYPE" = "major" ]; then \
		NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{print ($$1+1) ".0.0"}'); \
	else \
		echo "Invalid type: $$TYPE. Use patch, minor, or major."; exit 1; \
	fi; \
	echo "Bumping from $$CURRENT_VERSION to $$NEW_VERSION ($$TYPE)"; \
	$(MAKE) set-version KUBERNETES_VERSION=$$NEW_VERSION; \
	sed -i '' 's/KUBERNETES_VERSION ?= 1.0.2[0-9.]*/KUBERNETES_VERSION ?= '$$NEW_VERSION'/' Makefile; \
	echo "✅ Version bumped to $$NEW_VERSION and Makefile updated"

# Build the kubernetes plugin
build:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret install && \
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret build

# Build the dynamic kubernetes plugin
build-dynamic: build
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret export-dynamic

# Create npm package for kubernetes plugin
pack:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret pack

# Create npm package for dynamic kubernetes plugin
pack-dynamic:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret --cwd dist-dynamic pack

# Publish kubernetes plugin (static)
publish: build
	@echo "Checking if kubernetes plugin needs to be published..."
	@cd $(PLUGIN_DIR) && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(KUBERNETES_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(KUBERNETES_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(KUBERNETES_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish dynamic kubernetes plugin
publish-dynamic: build-dynamic
	@echo "Checking if kubernetes dynamic plugin needs to be published..."
	@cd $(PLUGIN_DIR)/dist-dynamic && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(KUBERNETES_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(KUBERNETES_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(KUBERNETES_VERSION) dynamic package..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Clean dist-dynamic directory to force fresh export with latest dependencies
clean-dynamic:
	@echo "Cleaning kubernetes dist-dynamic directory..."
	rm -rf $(PLUGIN_DIR)/dist-dynamic
	@echo "✅ Cleaned. Run build-dynamic to rebuild."

# Gets the latest version in npm registry for kubernetes plugin
get-version:
	@echo "Getting latest version in npm registry for kubernetes plugin..."
	@echo "plugin-kubernetes-backend-module-getsecret version:"
	@npm view @veecode-platform/plugin-kubernetes-backend-module-getsecret version $(NPM_REGISTRY_ARGS)

# unpublish kubernetes plugin
unpublish:
	@echo "Unpublishing kubernetes plugin..."
	@echo "Unpublishing static plugin..."
	@npm unpublish --force @veecode-platform/plugin-kubernetes-backend-module-getsecret@$(KUBERNETES_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing dynamic plugin..."
	@npm unpublish --force @veecode-platform/plugin-kubernetes-backend-module-getsecret-dynamic@$(KUBERNETES_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "✅ Plugin unpublished."

dev:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret start

lint:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret lint

lint-fix:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret lint --fix

test:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret test

clean:
	yarn workspace @veecode-platform/plugin-kubernetes-backend-module-getsecret clean
	rm -rf $(PLUGIN_DIR)/dist
	rm -rf $(PLUGIN_DIR)/node_modules
	rm -rf node_modules
