#!/usr/bin/env node
"use strict"

import { ApiPromise, WsProvider } from "@polkadot/api"
import { Phase } from "@polkadot/types/type/EventRecord"

const chalk = require("chalk")
const figlet = require("figlet")
const log = require("npmlog")
import { App } from "../lib/App"

// tslint:disable-next-line
console.error = () => {}

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

            // FIXME! Why aren't these registered?
            Category: {},
            CategoryId: {},
            IPNSIdentity: {},
            InputValidationLengthConstraint: {},
            Post: {},
            PostId: {},
            Thread: {},
            ThreadId: {},
            Url: {},

            // FIXME: Is there a better way of doing this?
            // Why isn't it registered by default?
            Phase,
        },
    })

    await new App(api).start()
})().catch((err) => {
    log.error("cli", err.stack)
    process.exit(1)
})
