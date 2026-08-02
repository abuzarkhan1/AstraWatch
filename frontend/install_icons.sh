#!/bin/bash
ICONS=(
  chart-line-icon shield-check triangle-alert-icon chart-bar-icon
  plug-connected-icon bell-off-icon filled-bell-icon layout-dashboard-icon
  file-description-icon github-icon dots-horizontal-icon x-icon
  logout-icon magnifier-icon gear-icon book-icon world-icon
  stack-icon users-icon down-chevron cpu-icon pen-icon
  sparkles-icon rocket-icon arrow-narrow-right-icon arrow-narrow-left-icon
  checked-icon info-circle-icon refresh-icon lock-icon hashtag-icon
  external-link-icon radio-icon arrow-narrow-up-icon arrow-narrow-down-icon
  send-icon mail-filled-icon telephone-icon question-mark right-chevron
  clock-icon play-icon wifi-icon
)

for icon in "${ICONS[@]}"; do
  echo "Installing $icon..."
  npx -y shadcn@latest add "https://itshover.com/r/$icon.json" &
done
wait
echo "All icons installed!"
