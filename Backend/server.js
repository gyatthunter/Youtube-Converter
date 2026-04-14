const express = require("express");
const cors = require("cors");
const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

const app = express();

app.use(cors({
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

const progressTracker = {};

app.get("/", (req, res) => {
    res.send("Bomboclat!!!");
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

app.get("/progress", (req, res) => {
    const jobId = req.query.jobId;
    if (!jobId || !progressTracker[jobId]) {
        return res.json({ progress: 0, status: 'unknown' });
    }
    res.json(progressTracker[jobId]);
});

app.get("/download", async (req, res) => {
    const url = req.query.url;
    const jobId = req.query.jobId;

    if (!url) {
        return res.status(400).json({ error: "No URL provided" });
    }

    if (jobId) {
        progressTracker[jobId] = { progress: 0, status: 'starting' };
    }

    let title = `audio_${Date.now()}`;
    try {
        const titleOutput = await new Promise((resolve, reject) => {
            const titleFetcher = spawn("yt-dlp", ["--print", "%(title)s", url]);
            let output = "";
            let errOutput = "";
            titleFetcher.stdout.on("data", (data) => output += data.toString());
            titleFetcher.stderr.on("data", (data) => errOutput += data.toString());
            titleFetcher.on("close", (code) => {
                if (code === 0) resolve(output.trim());
                else reject(new Error(errOutput || "Failed to fetch title"));
            });
        });
        if (titleOutput) {
            title = titleOutput.replace(/[^\w\s-]/gi, '').trim(); 
        }
    } catch(e) {
        console.error("Failed to fetch title", e);
    }

    const fileName = `${title}.mp3`;
    const filePath = path.join(DOWNLOAD_DIR, `internal_${Date.now()}.mp3`);

    const ytdlp = spawn("yt-dlp", [
        "--newline",
        "-x",
        "--audio-format", "mp3",
        "--js-runtimes", "deno",
        "-o", filePath,
        url
    ]);

    ytdlp.stdout.on("data", (data) => {
        if (jobId) {
            const output = data.toString();
            const match = output.match(/\[download\]\s+([\d\.]+)%/);
            if (match) {
                progressTracker[jobId].progress = parseFloat(match[1]);
                progressTracker[jobId].status = 'downloading';
            } else if (output.includes("[ExtractAudio]")) {
                progressTracker[jobId].status = 'converting';
                progressTracker[jobId].progress = 100;
            }
        }
    });

    ytdlp.stderr.on("data", (data) => {
        console.log(`yt-dlp err: ${data}`);
    });

    ytdlp.on("close", (code) => {
        if (jobId && progressTracker[jobId]) {
             progressTracker[jobId].status = code === 0 ? 'completed' : 'error';
        }

        if (code !== 0) {
            return res.status(500).json({ error: "Download failed" });
        }

        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Content-Type", "audio/mpeg");

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        res.on("finish", () => {
             if (jobId) delete progressTracker[jobId];
             if (fs.existsSync(filePath)) fs.unlink(filePath, () => { });
        });

        res.on("error", () => {
             if (jobId) delete progressTracker[jobId];
             if (fs.existsSync(filePath)) fs.unlink(filePath, () => { });
        });
    });
});