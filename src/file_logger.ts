import fs from "node:fs";
import fsAsync from "node:fs/promises";
import { formatWithOptions, promisify } from "node:util";
import { resolve } from "node:path";
import { createBrotliCompress } from "node:zlib";
import { pipeline } from "node:stream";

const pipe = promisify(pipeline);

import chalk from "chalk";

let lastLogged = {
    year: 1970,
    month: 1,
    day: 1,
    logSplit: 1
}

export function getCurrentLogFile() {
    // Check current time against last logged time
    const now = new Date();
    if (now.getFullYear() !== lastLogged.year || (now.getMonth() + 1) !== lastLogged.month || now.getDate() !== lastLogged.day) {
        // New day, reset log split
        lastLogged.logSplit = 1;

        // Update last logged time
        lastLogged.year = now.getFullYear();
        lastLogged.month = now.getMonth() + 1;
        lastLogged.day = now.getDate();
    }

    // Return log file name
    return `${lastLogged.year}-${lastLogged.month}-${lastLogged.day}_${lastLogged.logSplit}.log`;
}

export function updateLogSplit(logRoot: string) {
    // Check current time against last logged time
    const now = new Date();
    if (now.getFullYear() !== lastLogged.year || (now.getMonth() + 1) !== lastLogged.month || now.getDate() !== lastLogged.day) {
        // New day, reset log split
        lastLogged.logSplit = 1;

        // Update last logged time
        lastLogged.year = now.getFullYear();
        lastLogged.month = now.getMonth() + 1;
        lastLogged.day = now.getDate();
    }

    for (;;) {
        // Test if log split file exists, if not, return
        // If it does, increment log split and try again
        if (fs.existsSync(resolve(logRoot, getCurrentLogFile()))) {
            lastLogged.logSplit++;
        } else {
            return;
        }
    }
}

export function log(logRoot: string, ...args: any[]) {
    // Get current log file
    const logFile = getCurrentLogFile();

    // Convert args to writable string without colors
    let formattedData = args.map(arg => {
        if (typeof args === "object") {
            return formatWithOptions({ colors: false }, "%O", arg);
        } else {
            return formatWithOptions({ colors: false }, "%s", arg);
        }
    }).join(" ");

    // Append to log file
    fs.appendFile(resolve(logRoot, logFile), formattedData + "\n", err => {
        if (err) {
            console.log(
                (new Date()).toISOString(), 
                chalk.bgRedBright.white.bold("CRIT"), 
                chalk.magenta("cli"), 
                "Saving log to file failed:", err
            );
        }
    });
}

export async function compressOldLogs(logRoot: string) {
    // Get current log file
    const logFile = getCurrentLogFile();

    // Get list of all log files
    const logFiles = (await fsAsync.readdir(logRoot)).filter(file => file.endsWith(".log"));

    // Compress all log files except current log file
    for (const file of logFiles) {
        if (file !== logFile) {
            // Use brotli compression to compress file
            let brotli = createBrotliCompress();
            let source = fs.createReadStream(resolve(logRoot, file));
            let destination = fs.createWriteStream(resolve(logRoot, file + ".br"));
            await pipe(
                source,
                brotli,
                destination
            );

            // Delete uncompressed log file
            await fsAsync.unlink(resolve(logRoot, file));
        }
    }
}
