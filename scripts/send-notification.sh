#!/bin/bash

# This script sends a notification to the Backstage notifications backend

MESSAGE=${1:-"Hello, this is a test notification from the script!"}
NOTIFY_TOKEN="mysecrettoken"

curl -X POST http://localhost:7007/api/notifications/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NOTIFY_TOKEN" \
  -d "{
        \"recipients\": {
          \"type\": \"broadcast\"
        },
        \"payload\": {
          \"title\": \"Notificação de Teste\",
          \"description\": \"$MESSAGE\",
          \"link\": \"https://platform.vee.codes\",
          \"severity\": \"high\",
          \"topic\": \"general\"
        }
      }"

