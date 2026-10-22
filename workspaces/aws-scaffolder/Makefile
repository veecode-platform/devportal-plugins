PLUGIN_DIR ?= plugins/scaffolder-backend-module-aws-lambda

.PHONY: build build-dynamic clean

build:
	yarn tsc:full
	yarn build:all

build-dynamic: build
	cd $(PLUGIN_DIR) && YARN_ENABLE_IMMUTABLE_INSTALLS=false npx @red-hat-developer-hub/cli@1.11.2 plugin export

clean:
	yarn clean
	rm -rf dist-types dist-dynamic
