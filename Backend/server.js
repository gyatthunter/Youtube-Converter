require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const YT_DLP_PATH = process.env.YT_DLP_PATH || "yt-dlp";
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; 
const FILE_EXPIRY_MS = 30 * 60 * 1000;      

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const app = express();
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

const jobStore = new Map();

function sanitizeFilename(text, jobId) {
    if (!text) return `audio_${jobId}.mp3`;
    const cleaned = text.replace(/[^\w\s-]/gi, '').trim();
    return (cleaned || `audio_${jobId}`) + ".mp3";
}

function cleanupService() {
    const now = Date.now();
    console.log(`[CLEANUP] Running at ${new Date().toISOString()}`);

    for (const [jobId, job] of jobStore.entries()) {
        if (now - job.timestamp > FILE_EXPIRY_MS) {
            if (job.filePath && fs.existsSync(job.filePath)) {
                fs.unlink(job.filePath, (err) => {
                    if (err) console.error(`[CLEANUP] Error deleting ${job.filePath}:`, err);
                });
            }
            jobStore.delete(jobId);
        }
    }

    fs.readdir(DOWNLOAD_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(DOWNLOAD_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > FILE_EXPIRY_MS) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}
setInterval(cleanupService, CLEANUP_INTERVAL_MS);


app.get("/", (req, res) => {
    res.send("A Person Who Thinks All The Time Has Nothing To Think About Except Thoughts ");
});

app.get("/convert", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const jobId = Date.now().toString();
    const tempFileName = `audio_${jobId}.mp3`;
    const filePath = path.join(DOWNLOAD_DIR, `${jobId}.mp3`);

    jobStore.set(jobId, {
        status: 'starting',
        progress: 0,
        filePath: filePath,
        fileName: tempFileName,
        timestamp: Date.now()
    });

    res.json({ jobId });

    (async () => {
        const titlePromise = new Promise((resolve) => {
            const process = spawn(YT_DLP_PATH, ["--print", "%(title)s", url]);
            let output = "";
            const timeout = setTimeout(() => { process.kill(); resolve(null); }, 10000);

            process.stdout.on("data", (data) => output += data.toString());
            process.on("close", (code) => {
                clearTimeout(timeout);
                resolve(code === 0 ? output.trim() : null);
            });
        });

        titlePromise.then(title => {
            const job = jobStore.get(jobId);
            if (job) {
                job.fileName = sanitizeFilename(title, jobId);
            }
        });

        try {
            const job = jobStore.get(jobId);
            if (!job) return;

            job.status = 'downloading';

            const ytdlp = spawn(YT_DLP_PATH, [
                "--newline",
                "-f", "ba/b",
                "-x",
                "--audio-format", "mp3",
                "--audio-quality", "5",
                "--concurrent-fragments", "5",
                "--buffer-size", "1024K",
                "--postprocessor-args", "ffmpeg:-threads 8",
                "--no-playlist",
                "-o", filePath,
                url
            ]);

            ytdlp.stdout.on("data", (data) => {
                const output = data.toString();
                const match = output.match(/\[download\]\s+([\d\.]+)%/);
                if (match) {
                    job.progress = parseFloat(match[1]);
                    job.status = 'downloading';
                } else if (output.includes("[ExtractAudio]")) {
                    job.status = 'converting';
                    job.progress = 100;
                }
            });

            ytdlp.on("close", (code) => {
                if (code === 0) {
                    job.status = 'completed';
                    job.progress = 100;
                    console.log(`[ULTRA] Job ${jobId} finished.`);
                } else {
                    job.status = 'error';
                    console.error(`[ERROR] YT-DLP failed with code ${code}`);
                }
            });

        } catch (err) {
            console.error(`[CRITICAL] Job ${jobId} failed:`, err);
            const job = jobStore.get(jobId);
            if (job) job.status = 'error';
        }
    })();
});


app.get("/progress", (req, res) => {
    const jobId = req.query.jobId;
    const job = jobStore.get(jobId);

    if (!job) {
        return res.json({ status: 'not_found', progress: 0 });
    }

    res.json({
        status: job.status,
        progress: job.progress
    });
});

app.get("/download/:jobId", (req, res) => {
    const jobId = req.params.jobId;
    const job = jobStore.get(jobId);

    if (!job) return res.status(404).send("Job expired or not found");
    if (job.status !== 'completed') return res.status(400).send("File not ready");
    if (!fs.existsSync(job.filePath)) return res.status(404).send("File missing from disk");

    res.setHeader("Content-Type", "application/octet-stream");

    res.download(job.filePath, job.fileName, (err) => {
        if (!err) {
            setTimeout(() => {
                if (fs.existsSync(job.filePath)) {
                    fs.unlink(job.filePath, () => {});
                }
                jobStore.delete(jobId);
                console.log(`[CLEANUP] Auto-deleted job ${jobId} and its file.`);
            }, 2 * 60 * 1000); 
        } else if (!res.headersSent) {
            console.error(`[DOWNLOAD_ERR] Job ${jobId}:`, err);
            res.status(500).send("Transmission failed");
        }
    });
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  A Person Who Thinks All The Time Has Nothing To Think About Except Thoughts    `);
    console.log(`  Running on http://localhost:${PORT}      `);
    console.log(`=========================================`);
});