#!/usr/bin/env bash

if [ ! -d "./node_modules" ]; then
    yarn install
fi
yarn run tsc --build tsconfig.json
