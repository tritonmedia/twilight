#!/usr/bin/env bash
# Migrate from old <Name> - Episode.mkv format to <Name> S#E#.mkv

echo -ne "going to migrate all media in $1. ^C if not ok"
read -r

migrate() {
  episode_counter=1
  IFS=$'\n'

  find_delim=$(awk -F"-" '{print NF-1}'<<<"$(find . -maxdepth 1 -mindepth 1 | head -n1)")
  if [[ "$find_delim" == "0" ]]; then
    find_delim=1
  else
    # sort needs +1
    find_delim=$((find_delim+1))
  fi

  echo "set delimeter for sorting to $find_delim"

  for file in $(find . -maxdepth 1 -mindepth 1 | grep -v '.ass' | grep -v '.srt' | sort -n -t - -k "$find_delim"); do
    if [[ -d "$file" ]]; then
      echo "entering directory $file"
      pushd "$file" >/dev/null || exit 1
        migrate
      popd >/dev/null || exit 1

      continue
    fi

    if grep -E 'S[0-9]+E[0-9]+' <<<"$file"; then
      echo "Skipping already converted file '$file'"
      continue
    fi

    find_delim=$(awk -F"-" '{print NF-1}'<<<"$file")
    file_name=$(cut -d- -f1-"$find_delim" <<<"$file")
    new_name="$file_name- S1E$episode_counter.mkv"
    echo "$file -> $new_name"
    episode_counter=$((episode_counter+1))

    mv -v "$file" "$new_name"
  done
}

pushd "$1" >/dev/null || exit 1
migrate
popd >/dev/null || exit