#
# Makefile for building, packaging, and publishing devportal plugins
# Notes:
# - npm publishing honors NPM_CONFIG_REGISTRY or .npmrc settings
# - there are two variants of each plugin: static and dynamic
#
.PHONY: build-homepage pack-homepage-plugin build-global-header pack-global-header-plugin clean publish-homepage publish-global-header

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

# Create npm package for global-header plugin
pack-global-header-plugin:
	cd workspace/global-header/plugins/veecode-global-header && npm pack

# Create npm package for dynamic global-header plugin
pack-global-header-plugin-dynamic:
	cd workspace/global-header/plugins/veecode-global-header/dist-dynamic && npm pack

build-all: build-homepage build-global-header
	echo "All static plugins built."

build-all-dynamic: build-homepage-dynamic build-global-header-dynamic
	echo "All dynamic plugins built."

pack-all: pack-homepage-plugin pack-global-header-plugin
	echo "All static plugins packed."

pack-all-dynamic: pack-homepage-plugin-dynamic pack-global-header-plugin-dynamic
	echo "All dynamic plugins packed."

# Clean built files
clean:
	cd workspace/global-header && yarn clean
	cd workspace/homepage && yarn clean
#	rm -rf workspace/homepage/plugins/veecode-homepage/dist
#	rm -rf workspace/homepage/plugins/veecode-homepage/*.tgz
#	rm -rf workspace/global-header/plugins/veecode-global-header/dist
#	rm -rf workspace/global-header/plugins/veecode-global-header/*.tgz

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

publish-all: publish-homepage publish-global-header
	echo "All plugins published."

publish-all-dynamic: publish-homepage-dynamic publish-global-header-dynamic
	echo "All dynamic plugins published."
