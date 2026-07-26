#!/usr/bin/env bash

smoke_valid_object_id() {
  [[ "$1" =~ ^[0-9a-f]{64}$ ]]
}

smoke_valid_image_id() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]
}

smoke_remove_owned_container() {
  local container_name="$1"
  local expected_id="$2"
  local ownership_label_key="$3"
  local expected_owner="$4"
  local immutable_shape=''
  local actual_id=''
  local actual_name=''
  local actual_owner=''
  local current_name_id=''

  if ! smoke_valid_object_id "$expected_id"; then
    echo "refusing to remove smoke container with invalid captured ID: $container_name" >&2
    return 1
  fi
  if ! immutable_shape="$(
    docker container inspect \
      --format "{{.Id}}|{{.Name}}|{{index .Config.Labels \"$ownership_label_key\"}}" \
      "$expected_id"
  )"; then
    echo "smoke container ID is no longer inspectable: $container_name" >&2
    return 1
  fi
  IFS='|' read -r actual_id actual_name actual_owner <<<"$immutable_shape"
  actual_name="${actual_name#/}"
  if [[ "$actual_id" != "$expected_id" ||
    "$actual_name" != "$container_name" ||
    "$actual_owner" != "$expected_owner" ]]; then
    echo "refusing to remove smoke container after ID/name/owner mismatch: $container_name" >&2
    return 1
  fi
  if ! current_name_id="$(
    docker container inspect --format '{{.Id}}' "$container_name"
  )"; then
    echo "smoke container name is no longer inspectable: $container_name" >&2
    return 1
  fi
  if [[ "$current_name_id" != "$expected_id" ]]; then
    echo "refusing to remove replacement smoke container: $container_name" >&2
    return 1
  fi
  docker rm -f -- "$expected_id" >/dev/null
}

smoke_remove_owned_network() {
  local network_name="$1"
  local expected_id="$2"
  local ownership_label_key="$3"
  local expected_owner="$4"
  local immutable_shape=''
  local actual_id=''
  local actual_name=''
  local actual_owner=''
  local current_name_id=''

  if ! smoke_valid_object_id "$expected_id"; then
    echo "refusing to remove smoke network with invalid captured ID: $network_name" >&2
    return 1
  fi
  if ! immutable_shape="$(
    docker network inspect \
      --format "{{.Id}}|{{.Name}}|{{index .Labels \"$ownership_label_key\"}}" \
      "$expected_id"
  )"; then
    echo "smoke network ID is no longer inspectable: $network_name" >&2
    return 1
  fi
  IFS='|' read -r actual_id actual_name actual_owner <<<"$immutable_shape"
  if [[ "$actual_id" != "$expected_id" ||
    "$actual_name" != "$network_name" ||
    "$actual_owner" != "$expected_owner" ]]; then
    echo "refusing to remove smoke network after ID/name/owner mismatch: $network_name" >&2
    return 1
  fi
  if ! current_name_id="$(
    docker network inspect --format '{{.Id}}' "$network_name"
  )"; then
    echo "smoke network name is no longer inspectable: $network_name" >&2
    return 1
  fi
  if [[ "$current_name_id" != "$expected_id" ]]; then
    echo "refusing to remove replacement smoke network: $network_name" >&2
    return 1
  fi
  docker network rm "$expected_id" >/dev/null
}

smoke_remove_loaded_image() {
  local image_reference="$1"
  local expected_id="$2"
  local current_tag_id=''
  local current_id=''

  if ! smoke_valid_image_id "$expected_id"; then
    echo "refusing to remove smoke image with invalid captured ID: $image_reference" >&2
    return 1
  fi
  if ! current_id="$(
    docker image inspect --format '{{.Id}}' "$expected_id"
  )"; then
    echo "captured smoke image ID is no longer inspectable: $expected_id" >&2
    return 1
  fi
  if [[ "$current_id" != "$expected_id" ]]; then
    echo "refusing to remove smoke image after immutable ID mismatch: $expected_id" >&2
    return 1
  fi
  if ! current_tag_id="$(
    docker image inspect --format '{{.Id}}' "$image_reference"
  )"; then
    echo "smoke image tag is no longer inspectable: $image_reference" >&2
    return 1
  fi
  if [[ "$current_tag_id" != "$expected_id" ]]; then
    echo "refusing to remove replacement smoke image tag: $image_reference" >&2
    return 1
  fi
  docker image rm "$expected_id" >/dev/null
}

smoke_cleanup_exit_status() {
  local primary_status="$1"
  local cleanup_status="$2"

  if [[ "$primary_status" != '0' ]]; then
    return "$primary_status"
  fi
  return "$cleanup_status"
}
