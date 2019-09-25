#!/usr/bin/env node
"use strict"

import { ApiPromise, WsProvider } from "@polkadot/api"
import * as figlet from "figlet"
import { ILogger, LoggerWrapper } from "../lib/Logger"

const chalk = require("chalk")
const log = require("npmlog")
const fs = require("fs")
import { App } from "../lib/App"
import { WASMInstance } from "../lib/WASMInstance"

// tslint:disable-next-line
console.error = () => {}

////////////////

log.level = "verbose"

function banner(logger: ILogger) {
    logger.info("cli", chalk.blue(figlet.textSync("joystream", "Speed")))
}

(async () => {
    const logger = new LoggerWrapper(log)
    banner(logger)

    // FIXME! This will be loaded via an API request
    const queryBuffer = fs.readFileSync("../query-api/build/query.wasm")

    // FIXME! Allow CLI-argument config for this
    const api = await ApiPromise.create({
        provider: new WsProvider("ws://127.0.0.1:9944"),
        types: {
            // FIXME! Why aren't these registered?
            CategoryId: "U64",
            Category: `{"id": "CategoryId", "title": "Text", "description": "Text", "deleted": "Bool", "archived": "Bool"}`,
            IPNSIdentity: {},
            InputValidationLengthConstraint: {},
            Post: {},
            PostId: {},
            ThreadId: "U64",
            Thread: `{"id": "ThreadId", "title": "Text", "category_id": "CategoryId", "nr_in_category": "U32"}`,
            Url: {},
        },
    })

    const runtime = new WASMInstance(queryBuffer, api, logger)

    await new App(api, logger, runtime).start()
})().catch((err) => {
    log.error("cli", err.stack)
    process.exit(1)
})
