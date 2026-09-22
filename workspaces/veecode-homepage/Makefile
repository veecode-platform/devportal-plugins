#
# Makefile for homepage workspace
# - Handles veecode-homepage plugin
# - Supports both static and dynamic plugin builds
#

VERSION ?= 1.1.0

# Cross-platform sed in-place
SED_INPLACE := $(shell if [ "$$(uname)" = "Darwin" ]; then echo "sed -i ''"; else echo "sed -i"; fi)

# Plugin directories
PLUGIN_DIR = plugins/veecode-homepage

ALL_PLUGIN_DIRS = $(PLUGIN_DIR)

.PHONY: help build build-dynamic pack pack-dynamic \
	set-version clean clean-dynamic

help:
	@echo "Homepage Workspace Makefile"
	@echo "==========================="
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

# Set version for homepage package
# Usage: make set-version VERSION=1.0.2
set-version:
	@echo "Setting homepage package to version $(VERSION)..."
	@$(SED_INPLACE) 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(PLUGIN_DIR)/package.json
	@echo "Package updated to version $(VERSION)"
	@yarn install

# Build all static plugins
build:
	yarn install && yarn tsc && yarn build:all

# Patch @mui/material/styles/package.json to include a version field.
# Webpack Module Federation needs this to resolve the shared module version,
# but MUI's subpath package.json files omit it. Without this patch, any
# dependency that imports from @mui/material/styles (e.g. @mui/x-charts)
# causes: "No version specified and unable to automatically determine one"
patch-mui-styles-version:
	@node -e " \
	  var fs = require('fs'); \
	  var root = JSON.parse(fs.readFileSync('node_modules/@mui/material/package.json', 'utf8')); \
	  var stylesPath = 'node_modules/@mui/material/styles/package.json'; \
	  var styles = JSON.parse(fs.readFileSync(stylesPath, 'utf8')); \
	  if (!styles.version) { styles.version = root.version; fs.writeFileSync(stylesPath, JSON.stringify(styles, null, 2) + '\n'); \
	    console.log('Patched @mui/material/styles/package.json with version ' + root.version); \
	  } \
	"

# Build all dynamic plugins
build-dynamic: build patch-mui-styles-version
	cd $(PLUGIN_DIR) && rm -f dist/remoteEntry.js dist/remoteEntry.js.map dist/mf-manifest.json dist/mf-stats.json && rm -rf dist/@mf-types dist/compiled-types && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@latest plugin export

# Pack all static plugins
pack:
	cd $(PLUGIN_DIR) && npm pack

# Pack all dynamic plugins
pack-dynamic:
	cd $(PLUGIN_DIR)/dist-dynamic && npm pack

# Full clean
clean:
	@echo "Cleaning homepage workspace..."
	yarn clean || true
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf plugins/*/node_modules
	rm -rf dist-types
	rm -rf plugins/*/dist
	rm -rf plugins/*/dist-dynamic
	rm -rf plugins/*/dist-scalprum
	rm -rf plugins/*/*.tgz
	rm -rf packages/*/dist
	find . -name "*.log" -type f -delete || true
	find . -name "yarn-error.log" -type f -delete || true
	find . -name "npm-debug.log*" -type f -delete || true
	find . -name ".DS_Store" -type f -delete || true
	@echo "Homepage workspace clean complete!"

# Clean only dist-dynamic directories
clean-dynamic:
	@echo "Cleaning homepage dist-dynamic directories..."
	rm -rf $(PLUGIN_DIR)/dist-dynamic
	@echo "Cleaned. Run build-dynamic to rebuild."
