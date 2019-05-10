#!/usr/bin/env bash

if [ ! -d "./apps/packages/joy-types/build/" ]; then
    echo "Joystream apps build missing or incomplete."
    echo "You need to clone or symlink https://github.com/Joystream/apps.git"
    echo "and build it (cd apps; yarn build)"
    exit 1
fi

if [ ! -d "./node_modules" ]; then
    yarn install
fi
yarn run tsc --build tsconfig.json
