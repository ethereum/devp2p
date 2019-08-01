#!/usr/bin/env bash

d=$(dirname $0)
$d/node_modules/remark-cli/cli.js --no-stdout --frail --rc-path $d/remark-lint-config.js $*
