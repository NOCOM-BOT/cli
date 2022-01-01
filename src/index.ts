#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
const program = new Command("nocom-cli");

program.version(JSON.parse(fs.readFileSync("package.json", { encoding: "utf8" })).version);

program
    .option("-d, --daemon", "Run in a detached process (this will create a service) [not implemented]")
    .option("-u, --user-data-dir", "Specify user data directory for NOCOM. Default: ~/.nocom/profile_alpha0", process.env.NOCOM_USER_DATA_DIR)
    .option("-l, --log-level", "Specify console output log level (silent, critical, error, warn, info, debug). Default: info", process.env.NOCOM_LOG_LEVEL ?? "info")
    .option("-g, --file-log-level", "Specify file output log level (silent, critical, error, warn, info, debug). Default: debug", process.env.NOCOM_LOG_LEVEL ?? "verbose")
    .option("-k, --core-dir", "Specify NOCOM_BOT core (kernel) runtime directory (or hobt blob [currently not supported]). Default: none", process.env.NOCOM_CORE_DIR);

program.parse(process.argv);

const opts = program.opts();

const logLevelMapping: {[x: string]: number} = {
    silent: -1,
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
};
const logLevelHeader: {[x: string]: string} = {
    critical: chalk.bgRedBright.white.bold("CRIT"),
    error: chalk.redBright.bold("ERR "),
    warn: chalk.yellow.bold("WARN"),
    info: chalk.green.bold("INFO"),
    debug: chalk.blue.bold("DEBG")
}

function checkOutputLevel(currentLogLevel: string, targetLogLevel: string) {
    return logLevelMapping[currentLogLevel] >= logLevelMapping[targetLogLevel];
}

function log(level: string, data: any[]) {
    // Log to console first
    if (checkOutputLevel(opts.logLevel, level)) {
        console.log(logLevelHeader[level], ...data);
    }

    // and then log to file...
    if (checkOutputLevel(opts.fileLogLevel, level)) {

    }
}

/*
log("debug", ["debug test"]);
log("info", ["debug test"]);
log("warn", ["debug test"]);
log("error", ["debug test"]);
log("critical", ["debug test"]);
process.exit(0);
*/

let coreDir: string | boolean = opts.coreDir;
if (typeof coreDir !== "string") {
    console.error("NOCOM_BOT Core/Kernel is missing. It is not embedded in the CLI (yet).");
    console.error("Please download NOCOM_BOT Core manually and put the directory to -k flag. (type `nocom-cli -?` for more information)");
} else {
    (async () => {
        let NCBCore;
        try {
            NCBCore = await import(coreDir);
        } catch (e) {
            console.error("An exception has occured while trying to load NOCOM_BOT core.");
            console.error(e);
        }

        let instance = new NCBCore.default(opts.userDataDir ?? path.resolve("~/.nocom/profile_alpha0"), {
            debug: (...data: any) => log("debug", data),
            info: (...data: any) => log("info", data),
            warn: (...data: any) => log("warn", data),
            error: (...data: any) => log("error", data),
            critical: (...data: any) => log("critical", data),
        });

    })();
}