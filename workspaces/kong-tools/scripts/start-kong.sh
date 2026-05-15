#!/usr/bin/env bash
set -euo pipefail
status=$(vkdr infra status --json --silent | jq -r ".status")
if [ "$status" != "READY" ]; then
  vkdr infra up
else
  echo "VKDR infrastructure is READY, skipping \`vkdr infra up\`"
fi
vkdr kong install --default-ic -t 3.9.1 -m standard --label "vee.codes/cluster=local"
echo "Installing sample API..."
kubectl apply -f "$(dirname "$0")/../examples/k8s/"
echo "Kong Admin API: http://manager.localhost:8000"
echo "Kong Manager:   http://manager.localhost:8000/manager"
echo "Kong Proxy:     http://localhost:8000"
echo "Sample API:     http://localhost:8000/cep/24348000/json"
