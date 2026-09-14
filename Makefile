#
# Root Makefile for the devportal-plugins monorepo
#
# Every workspace under workspaces/<name>/ has its own Makefile with build,
# publish and utility targets. Run: cd workspaces/<name> && make help
# `make help` here lists the workspaces that have one.
#
# Root-level targets: help, echo-paths, copy-dynamic-plugins.
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
	@for d in workspaces/*/; do \
		if [ -f "$$d/Makefile" ]; then echo "  cd $${d%/} && make help"; fi; \
	done
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
	@if [ -d "workspaces/global-header/plugins/veecode-global-header/dist-dynamic" ]; then \
		rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-global-header-dynamic; \
		cp -R workspaces/global-header/plugins/veecode-global-header/dist-dynamic $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-global-header-dynamic; \
		echo "Copied global-header dynamic plugin"; \
	fi
	@if [ -d "workspaces/veecode-homepage/plugins/veecode-homepage/dist-dynamic" ]; then \
		rm -Rf $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic; \
		cp -R workspaces/veecode-homepage/plugins/veecode-homepage/dist-dynamic $(DYNAMIC_PLUGIN_ROOT)/veecode-platform-plugin-veecode-homepage-dynamic; \
		echo "Copied homepage dynamic plugin"; \
	fi
	@echo "Done."
