#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import os from "node:os";
import readline from "node:readline";
import url from "url";

import { updateLogSplit, compressOldLogs, log as logFile } from "./file_logger.js";

import packageJSON from "../package.json" assert { type: "json" };

function resolveHome(filepath: string) {
    if (filepath[0] === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}

const program = new Command("nocom-cli");

program
    .helpOption("-h, --help", "Show this help message")
    .version(packageJSON.version, "-v, --version", "Output the current CLI version")
    //.option("-d, --daemon", "Run in a detached process (this will create a service) [not implemented]")
    //.option("-a, --attach", "Attach to a running process (this will connect to a service) [not implemented]")
    //.option("-K, --kill-daemon", "Kill the daemon process [not implemented]")
    .option("-u, --user-data-dir <path>", "Specify user data directory for NOCOM. Default: ~/.nocom/profile_alpha0", process.env.NOCOM_USER_DATA_DIR)
    .option("-l, --log-level <level>", "Specify console output log level (silent, critical, error, warn, info, debug, verbose)", process.env.NOCOM_LOG_LEVEL ?? "info")
    .option("-g, --file-log-level <level>", "Specify file output log level (silent, critical, error, warn, info, debug, verbose)", process.env.NOCOM_LOG_LEVEL ?? "debug")
    .option("-k, --core-dir <path>", "Specify NOCOM_BOT core (kernel) runtime directory", process.env.NOCOM_CORE_DIR)

program.parse(process.argv);

const opts = program.opts();

if (opts.version) {
    console.log(JSON.parse(fs.readFileSync("package.json", { encoding: "utf8" })).version);
    process.exit(0);
}

let profilePath = resolveHome(opts.userDataDir ?? "~/.nocom/profile_alpha0");
let logPath = path.join(profilePath, "logs");

if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath);
}

const logLevelMapping: { [x: string]: number } = {
    silent: -1,
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    verbose: 5
};
const logLevelHeader: { [x: string]: string } = {
    critical: chalk.bgRedBright.white.bold("CRIT"),
    error: chalk.redBright.bold("ERR "),
    warn: chalk.yellow.bold("WARN"),
    info: chalk.green.bold("INFO"),
    debug: chalk.blue.bold("DEBG"),
    verbose: chalk.cyan.bold("VERB")
}

function checkOutputLevel(currentLogLevel: string, targetLogLevel: string) {
    return logLevelMapping[currentLogLevel] >= logLevelMapping[targetLogLevel];
}

let lastCompressed = 1;
updateLogSplit(logPath);
function log(level: string, from: string, data: any[]) {
    let currentTime = (new Date()).toISOString();

    // Log to console first
    if (checkOutputLevel(opts.logLevel, level)) {
        console.log(currentTime, logLevelHeader[level], chalk.magenta(from), ...data);
    }

    // and then log to file...
    if (checkOutputLevel(opts.fileLogLevel, level)) {
        logFile(logPath, currentTime, logLevelHeader[level], chalk.magenta(from), ...data);
    }

    let currentTimestamp = Date.now();
    // If it's been more than 5 minutes since the last compression, compress old logs
    if (currentTimestamp - lastCompressed > 5 * 60 * 1000) {
        compressOldLogs(logPath);
        lastCompressed = currentTimestamp;
    }
}

let rl: readline.Interface | null = null;
if (!opts.daemon) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: ""
    });
}

let abort: () => void;

let coreDir: string | boolean = opts.coreDir;
if (typeof coreDir !== "string") {
    console.error("NOCOM_BOT Core/Kernel is missing. It is not embedded in the CLI (yet).");
    console.error("Please download NOCOM_BOT Core manually and put the directory to -k flag. (type `nocom-cli -h` for more information)");
    process.exit(2);
} else {
    (async () => {
        let NCBCore: any;
        try {
            let packageJSON = JSON.parse(await fs.promises.readFile(path.resolve(process.cwd(), coreDir, "package.json"), { encoding: "utf8" }));
            let importC = await import(url.pathToFileURL(path.resolve(process.cwd(), coreDir, packageJSON.main)).toString());
            NCBCore = importC.default;
        } catch (e) {
            console.error("An exception has occured while trying to load NOCOM_BOT core.");
            console.error(e);
            process.exit(1);
        }

        let instance = new NCBCore(path.resolve(
            process.cwd(),
            profilePath
        ), {
            debug: (from: string, ...data: any) => log("debug", from, data),
            info: (from: string, ...data: any) => log("info", from, data),
            warn: (from: string, ...data: any) => log("warn", from, data),
            error: (from: string, ...data: any) => log("error", from, data),
            critical: (from: string, ...data: any) => log("critical", from, data),
            verbose: (from: string, ...data: any) => log("verbose", from, data)
        });

        log("info", "cli", ["Detected NOCOM_BOT kernel version", NCBCore.kernelVersion]);

        // Hook to prompt channel
        function prompt(nonceID: string) {
            let pi = instance.promptChannel.promptList[nonceID];
            rl?.question(`[P][${nonceID}] ${pi.promptInfo
                }${pi.promptType === "yes-no" ? " [Y/N]" : ""
                }${(typeof pi.defaultValue !== "undefined" && pi.defaultVaule !== null) ?
                    ` [Default: ${pi.defaultValue}]` : ""
                }: `, (input: string) => {
                    if (pi.promptType === "yes-no") {
                        if (input.toLowerCase() === "y") {
                            pi.callback(true);
                        } else if (input.toLowerCase() === "n") {
                            pi.callback(false);
                        } else {
                            if (typeof pi.defaultValue !== "undefined" && pi.defaultValue !== null) {
                                pi.callback(pi.defaultValue);
                            } else {
                                prompt(nonceID);
                            }
                        }
                    } else {
                        if (!input && typeof pi.defaultValue !== "undefined" && pi.defaultValue !== null) {
                            pi.callback(pi.defaultValue);
                        } else {
                            pi.callback(input);
                        }
                    }
                });
        }
        if (rl) {
            instance.promptChannel.on("prompt", prompt);
        }

        instance.signalChannel.on("start", () => {
            log("info", "cli", ["Started NOCOM_BOT kernel instance ID", instance.runInstanceID]);
        });

        instance.signalChannel.on("stop", (isRestart: boolean) => {
            log("info", "cli", ["Stopped NOCOM_BOT kernel instance ID", instance.runInstanceID]);
            if (!isRestart) {
                abort();
            }
        });

        try {
            await instance.start();
            
            //@ts-ignore
            abort = async () => {
                abort = () => { };
                await instance.stop();
                instance.promptChannel.removeListener("prompt", prompt);
                process.exit(0);
            };
        } catch (e) {
            log("critical", "cli", ["NOCOM_BOT kernel failed to start:", e]);
            setTimeout(() => process.exit(1), 100);
        }
    })();
}

function stop() {
    if (abort) {
        abort();
    }

    rl?.close();
}
let goingForceQuit = false;
rl?.on("SIGINT", () => {
    if (goingForceQuit) {
        log("info", "cli", ["Force quitting CLI: 2 times SIGINT"]);
        process.exit(0);
    } else {
        goingForceQuit = true;
        stop();
    }
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    log("critical", "cli", ["Unhandled rejection:", reason]);
});
process.on("uncaughtException", (error: Error) => {
    log("critical", "cli", ["Uncaught exception:", error?.stack ?? String(error)]);
});
