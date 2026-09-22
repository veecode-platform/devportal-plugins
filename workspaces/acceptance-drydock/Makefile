PLUGIN_DIR ?= plugins/acceptance-drydock-backend

.PHONY: build build-dynamic clean

build:
	yarn tsc:full
	yarn build:all

build-dynamic: build
	cd $(PLUGIN_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@2.0.0 plugin export

clean:
	yarn clean
	rm -rf dist-types dist-dynamic
