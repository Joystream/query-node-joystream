#!/usr/bin/env node
"use strict";

const chalk = require("chalk");
const figlet = require("figlet");
const log = require("npmlog");
import { App } from "../lib/App";

log.level = "verbose";

function banner() {
  log.info("cli", chalk.blue(figlet.textSync("joystream", "Speed")));
}

// Register custom substrate types. This is required by the
// polkadot API interface.
import { registerJoystreamTypes } from "@joystream/types/";
registerJoystreamTypes();

(async () => {
  banner();
  await new App().start();
})().catch((err) => {
  log.error("cli", err.stack);
  process.exit(1);
});
