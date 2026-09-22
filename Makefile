#
# Root Makefile for devportal-plugins monorepo
#
# Each workspace has its own Makefile. Use: cd workspaces/<name> && make help
# The workspaces are the directories under workspaces/ (the repository is the inventory).
#

.PHONY: help

help:
	@echo "DevPortal Plugins Monorepo"
	@echo "=========================="
	@echo ""
	@echo "Each workspace has its own Makefile. List them with: ls workspaces/"
	@echo "Then: cd workspaces/<name> && make help"
	@echo ""
	@echo "Proof 2 (load an export in the local runner): yarn dev:dynamic inside the workspace."
