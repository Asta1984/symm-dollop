const NodeMediaServer = require('node-media-server');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIP();

// Create media directories
const mediaPath = path.join(__dirname, 'media');
const thumbnailPath = path.join(__dirname, 'media/thumbnails');

if (!fs.existsSync(mediaPath)) {
    fs.mkdirSync(mediaPath, { recursive: true });
}
if (!fs.existsSync(thumbnailPath)) {
    fs.mkdirSync(thumbnailPath, { recursive: true });
}

// Configuration optimized for DJI GO 4
const config = {
    logType: 3,
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 10,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        mediaroot: './media',
        allow_origin: '*',
        webroot: './public'
    },
    trans: {
        ffmpeg: 'C:/ProgramData/chocolatey/bin/ffmpeg.exe',
        tasks: [
            {
                app: 'live',
                hls: true,
                hlsFlags: '[hls_time=2:hls_list_size=6:hls_flags=delete_segments+append_list+discont_start]',
                hlsKeep: false,
                mp4: true,
                mp4Flags: '[movflags=frag_keyframe+empty_moov]'
            },
        ],
        MediaRoot: "./media"
    }
};

const nms = new NodeMediaServer(config);

// Initialize a map to track active streams
const activeStreams = new Map();

// Stream event handlers
nms.on('preConnect', (id, args) => {
    console.log('[Stream Connected]', `id=${id}`);
});

nms.on('postConnect', (id, args) => {
    console.log('[Stream Post Connect]', `id=${id}`);
});

nms.on('doneConnect', (id, args) => {
    console.log('[Stream Disconnected]', `id=${id}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
    console.log('[Stream Started]', `id=${id} StreamPath=${StreamPath}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[Stream Publishing]', `id=${id} StreamPath=${StreamPath}`);
    activeStreams.set(id, { StreamPath, args });
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[Stream Ended]', `id=${id} StreamPath=${StreamPath}`);
    activeStreams.delete(id);

    // Cleanup HLS segments
    const hlsPath = path.join(mediaPath, StreamPath);
    if (fs.existsSync(hlsPath)) {
        fs.rm(hlsPath, { recursive: true }, (err) => {
            if (err) console.error('Error cleaning up HLS segments:', err);
        });
    }
});

// Express server setup
const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static('public'));
app.use('/media', express.static('media'));

// Stream information endpoint
app.get('/api/streams', (req, res) => {
    res.json(Array.from(activeStreams.values()));
});

// Server info endpoint
app.get('/api/server-info', (req, res) => {
    res.json({
        rtmpUrl: `rtmp://${LOCAL_IP}:1935/live`,
        hlsUrl: `http://${LOCAL_IP}:8000/live`,
        webPlayer: `http://${LOCAL_IP}:3000`
    });
});

nms.run();

const EXPRESS_PORT = 3000;
app.listen(EXPRESS_PORT, '0.0.0.0', () => {
    console.log('\n=== DJI RTMP Server Started ===');
    console.log(`Local IP Address: ${LOCAL_IP}`);
    console.log('\nUse these settings in DJI GO 4:');
    console.log(`RTMP URL: rtmp://${LOCAL_IP}:1935/live`);
    console.log('Stream Key: stream');
    console.log('\nAccess Points:');
    console.log(`RTMP: rtmp://${LOCAL_IP}:1935/live/stream`);
    console.log(`HLS: http://${LOCAL_IP}:8000/live/stream/index.m3u8`);
    console.log(`Web Player: http://${LOCAL_IP}:3000`);
    console.log('\nServer Ports:');
    console.log(`RTMP Server: ${config.rtmp.port}`);
    console.log(`HLS Server: ${config.http.port}`);
    console.log(`Web Server: ${EXPRESS_PORT}`);
});
