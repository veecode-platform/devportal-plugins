#
# Root Makefile for devportal-plugins monorepo
#
# Each workspace has its own Makefile with build, publish, and utility commands.
# Use: cd workspace/<name> && make help
#
# Workspaces:
# - homepage:         cd workspace/homepage && make help
# - global-header:    cd workspace/global-header && make help
# - github-workflows: cd workspace/github-workflows && make help
# - ldap-auth:        cd workspace/ldap-auth && make help
# - kong-tools:       cd workspace/kong-tools && make help
#

# For copying dynamic plugins to a local devportal-base
DEVPORTAL_BASE_PATH ?= $(HOME)/projetos/veecode/devportal-base
DYNAMIC_PLUGIN_ROOT ?= $(DEVPORTAL_BASE_PATH)/dynamic-plugins-root

.PHONY: help echo-paths copy-dynamic-plugins

help:
	@echo "DevPortal Plugins Monorepo"
	@echo "=========================="
	@echo ""
	@echo "Each workspace has its own Makefile. Navigate to the workspace first:"
	@echo ""
	@echo "  cd workspace/homepage && make help"
	@echo "  cd workspace/global-header && make help"
	@echo "  cd workspace/github-workflows && make help"
	@echo "  cd workspace/ldap-auth && make help"
	@echo "  cd workspace/kong-tools && make help"
	@echo ""
	@echo "Root-level commands:"
	@echo "  make echo-paths              - Show dynamic plugin paths"
	@echo "  make copy-dynamic-plugins    - Copy all dynamic plugins to DYNAMIC_PLUGIN_ROOT"

echo-paths:
	@echo "DEVPORTAL_BASE_PATH: $(DEVPORTAL_BASE_PATH)"
	@echo "DYNAMIC_PLUGIN_ROOT: $(DYNAMIC_PLUGIN_ROOT)"

# Copy dynamic plugins to local devportal-base for testing
copy-dynamic-plugins: echo-paths
	@echo "Copying dynamic plugins to DYNAMIC_PLUGIN_ROOT..."
	@if [ -d "workspace/global-header/plugins/veecode-global-header/dist-dynamic" ]; then \
		rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-global-header-dynamic; \
		cp -R workspace/global-header/plugins/veecode-global-header/dist-dynamic $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-global-header-dynamic; \
		echo "Copied global-header dynamic plugin"; \
	fi
	@if [ -d "workspace/homepage/plugins/veecode-homepage/dist-dynamic" ]; then \
		rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic; \
		cp -R workspace/homepage/plugins/veecode-homepage/dist-dynamic $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic; \
		echo "Copied homepage dynamic plugin"; \
	fi
	@echo "Done."
