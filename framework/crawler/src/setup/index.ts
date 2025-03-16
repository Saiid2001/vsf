import { config as dotEnvConfig } from "dotenv";
import { sequelize } from "../database/db.js";
// Load environment variables
dotEnvConfig()

import fs from "fs";
import config from "../config/index.js";

import { Logging } from "../utils/logging.js";
import { exit } from "process";
import UserDiffManual from "../modules/userdiff_manual.js";
import SwapModule from "../modules/swap.js";

const setupCrawler = async () => {
    Logging.info(`Started setting up the instrumentation tables`)

    new UserDiffManual().setup();
    new SwapModule().setup();
}

// remove all workers from database if the swap container is restarted
if (config.dynamic.module == "swap"){
    await sequelize.query(`DELETE FROM workers WHERE id > 0`);
    Logging.info("Removed all workers from database");
}

// Checking whether dataPath is empty
Logging.info(`Checking whether dataPath="${config.dataPath}" for crawler exists and is empty...`);


if (!fs.existsSync(config.dataPath)) {
    Logging.error("Specified dataPath does not exist on disk. Should it be recursively created? (yY/nN)");
    process.stdin.on("data", function (data) {
        if (data.toString().toLowerCase().trim() === "y") {
            fs.mkdirSync(config.dataPath, { recursive: true })
            setupCrawler();
        } else {
            exit(1);
        }
    })
} else {
    // Check if dataPath is empty, if not, exist the crawler process
    if (fs.readdirSync(config.dataPath).length !== 0) {
        Logging.error("Provided dataPath is not empty. Abort")
        exit(1);
    } else {
        // If folder is empty, execute setup code
        Logging.warn("Directory exists, but is empty. Using the empty directory.")
        setupCrawler();
    }
}



