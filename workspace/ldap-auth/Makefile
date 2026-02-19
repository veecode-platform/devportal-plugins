#
# Makefile for ldap-auth plugins
# - Handles frontend and backend plugins
# - Static plugin builds only
#

# Version for ldap-auth packages (frontend, backend)
LDAP_AUTH_VERSION ?= 1.1.0
NPM_REGISTRY =
NPM_REGISTRY_ARGS = $(if $(NPM_REGISTRY),--registry $(NPM_REGISTRY))

.PHONY: help build-frontend build-backend publish-frontend publish-backend set-version build-all publish-all get-version unpublish-all

help:
	@echo "LDAP Auth Plugin Makefile"
	@echo "========================="
	@echo ""
	@echo "Build Commands:"
	@echo "  make build-all           - Build all packages (frontend, backend)"
	@echo "  make build-frontend      - Build frontend plugin only"
	@echo "  make build-backend       - Build backend plugin only"
	@echo ""
	@echo "Publish Commands:"
	@echo "  make publish-all         - Publish all packages"
	@echo "  make publish-frontend    - Publish frontend plugin"
	@echo "  make publish-backend     - Publish backend plugin"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make set-version VERSION=1.0.0 - Set version for all packages"
	@echo "  make get-version         - Get latest published versions"
	@echo "  make unpublish-all       - Unpublish all packages"

# Set version for all ldap-auth packages (frontend, backend)
# Usage: make set-version LDAP_AUTH_VERSION=1.0.0
set-version:
	@echo "Setting ldap-auth packages to version $(LDAP_AUTH_VERSION)..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(LDAP_AUTH_VERSION)"/' plugins/ldap-auth/package.json
	@sed -i '' 's/"version": "[^"]*"/"version": "$(LDAP_AUTH_VERSION)"/' plugins/ldap-auth-backend/package.json
	@echo "✅ All packages updated to version $(LDAP_AUTH_VERSION)"
	@yarn install

# Build the ldap-auth frontend plugin
build-frontend:
	yarn workspace @veecode-platform/backstage-plugin-ldap-auth install && \
	yarn workspace @veecode-platform/backstage-plugin-ldap-auth build

# Build the ldap-auth backend plugin
build-backend:
	yarn workspace @veecode-platform/backstage-plugin-ldap-auth-backend install && \
	yarn workspace @veecode-platform/backstage-plugin-ldap-auth-backend build

# Build all ldap-auth packages
build-all: build-frontend build-backend
	@echo "✅ All ldap-auth packages built."

# Publish ldap-auth frontend plugin
publish-frontend: build-frontend
	@echo "Checking if ldap-auth frontend needs to be published..."
	@cd plugins/ldap-auth && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(LDAP_AUTH_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(LDAP_AUTH_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(LDAP_AUTH_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish ldap-auth backend plugin
publish-backend: build-backend
	@echo "Checking if ldap-auth backend needs to be published..."
	@cd plugins/ldap-auth-backend && \
	PACKAGE_NAME=$$(node -p "require('./package.json').name") && \
	if npm view $$PACKAGE_NAME@$(LDAP_AUTH_VERSION) version $(NPM_REGISTRY_ARGS) >/dev/null 2>&1; then \
		echo "✅ $$PACKAGE_NAME@$(LDAP_AUTH_VERSION) is already published. Skipping."; \
	else \
		echo "📦 Publishing $$PACKAGE_NAME@$(LDAP_AUTH_VERSION)..."; \
		npm publish $(NPM_REGISTRY_ARGS); \
	fi

# Publish all ldap-auth packages
publish-all: publish-frontend publish-backend
	@echo "✅ All ldap-auth packages published."

# Gets the latest version in npm registry for ldap-auth plugins
get-version:
	@echo "Getting latest version in npm registry for ldap-auth plugins..."
	@echo "backstage-plugin-ldap-auth version:"
	@npm view @veecode-platform/backstage-plugin-ldap-auth version $(NPM_REGISTRY_ARGS) || echo "Not published yet"
	@echo "backstage-plugin-ldap-auth-backend version:"
	@npm view @veecode-platform/backstage-plugin-ldap-auth-backend version $(NPM_REGISTRY_ARGS) || echo "Not published yet"

# Unpublish all packages
unpublish-all:
	@echo "Unpublishing all ldap-auth packages..."
	@echo "Unpublishing frontend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-ldap-auth@$(LDAP_AUTH_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "Unpublishing backend plugin..."
	@npm unpublish @veecode-platform/backstage-plugin-ldap-auth-backend@$(LDAP_AUTH_VERSION) $(NPM_REGISTRY_ARGS) || true
	@echo "✅ All packages unpublished."
