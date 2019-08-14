#!/usr/bin/env node
"use strict"

import { ApiPromise, WsProvider } from "@polkadot/api"

const chalk = require("chalk")
const figlet = require("figlet")
const log = require("npmlog")
import { App } from "../lib/App"

log.level = "verbose"

function banner() {
  log.info("cli", chalk.blue(figlet.textSync("joystream", "Speed")))
}

// Register custom substrate types. This is required by the
// polkadot API interface.
import { registerJoystreamTypes } from "@joystream/types/"
registerJoystreamTypes();

(async () => {
    banner()

    // FIXME! Allow CLI-argument config for this
    const api = await ApiPromise.create({
        provider: new WsProvider("ws://127.0.0.1:9944"),
        types: {
            Category: {},
            CategoryId: {},
            IPNSIdentity: {},
            InputValidationLengthConstraint: {},
            Post: {},
            PostId: {},
            Thread: {},
            ThreadId: {},
            Url: {},
        },
    })

    await new App(api).start()
})().catch((err) => {
    log.error("cli", err.stack)
    process.exit(1)
})
