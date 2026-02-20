#!/usr/bin/env bash
set -euo pipefail
vkdr infra up
vkdr kong install --default-ic -t 3.9.1 -m standard --label "vee.codes/cluster=local"
echo "Kong Admin API: http://manager.localhost:8000"
echo "Kong Manager:   http://manager.localhost:8000/manager"
echo "Kong Proxy:     http://localhost:8000"
