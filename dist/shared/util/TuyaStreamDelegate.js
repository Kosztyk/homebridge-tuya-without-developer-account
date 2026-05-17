"use strict";
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaStreamingDelegate = void 0;
const camera_utils_1 = require("@homebridge/camera-utils");
const child_process_1 = require("child_process");
const dgram_1 = require("dgram");
const FfmpegStreamingProcess_1 = require("./FfmpegStreamingProcess");
/*
interface SampleRateEntry {
    type: AudioRecordingCodecType;
    bitrateMode: number;
    samplerate: AudioRecordingSamplerate[];
    audioChannels: number;
}
*/
class TuyaStreamingDelegate {
    constructor(camera) {
        this.pendingSessions = {};
        this.ongoingSessions = {};
        this.camera = camera;
        this.hap = camera.platform.api.hap;
        // this.recordingDelegate = new TuyaRecordingDelegate();
        const resolutions = [
            [320, 180, 30],
            [320, 240, 15],
            [320, 240, 30],
            [480, 270, 30],
            [480, 360, 30],
            [640, 360, 30],
            [640, 480, 30],
            [1280, 720, 30],
            [1280, 960, 30],
            [1920, 1080, 30],
            [1600, 1200, 30],
        ];
        const streamingOptions = {
            supportedCryptoSuites: [0 /* SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80 */],
            video: {
                codec: {
                    profiles: [0 /* H264Profile.BASELINE */, 1 /* H264Profile.MAIN */, 2 /* H264Profile.HIGH */],
                    levels: [0 /* H264Level.LEVEL3_1 */, 1 /* H264Level.LEVEL3_2 */, 2 /* H264Level.LEVEL4_0 */],
                },
                resolutions: resolutions,
            },
            audio: {
                twoWayAudio: false,
                codecs: [
                    {
                        type: "AAC-eld" /* AudioStreamingCodecType.AAC_ELD */,
                        samplerate: 16 /* AudioStreamingSamplerate.KHZ_16 */,
                    },
                ],
            },
        };
        const recordingOptions = {
            overrideEventTriggerOptions: [
                1 /* EventTriggerOption.MOTION */,
                2 /* EventTriggerOption.DOORBELL */,
            ],
            prebufferLength: 4 * 1000, // prebufferLength always remains 4s ?
            mediaContainerConfiguration: [
                {
                    type: 0 /* MediaContainerType.FRAGMENTED_MP4 */,
                    fragmentLength: 4000,
                },
            ],
            video: {
                parameters: {
                    profiles: [
                        0 /* H264Profile.BASELINE */,
                        1 /* H264Profile.MAIN */,
                        2 /* H264Profile.HIGH */,
                    ],
                    levels: [
                        0 /* H264Level.LEVEL3_1 */,
                        1 /* H264Level.LEVEL3_2 */,
                        2 /* H264Level.LEVEL4_0 */,
                    ],
                },
                resolutions: resolutions,
                type: 0 /* this.hap.VideoCodecType.H264 */,
            },
            audio: {
                codecs: [
                    {
                        samplerate: 3 /* this.hap.AudioRecordingSamplerate.KHZ_32 */,
                        type: 0 /* this.hap.AudioRecordingCodecType.AAC_LC */,
                    },
                ],
            },
        };
        const options = {
            delegate: this,
            streamingOptions: streamingOptions,
            // recording: {
            // options: recordingOptions,
            // delegate: this.recordingDelegate
            // }
        };
        this.controller = new this.hap.CameraController(options);
    }
    stopStream(sessionId) {
        const session = this.ongoingSessions[sessionId];
        if (session) {
            if (session.timeout) {
                clearTimeout(session.timeout);
            }
            try {
                session.socket?.close();
            }
            catch (error) {
                this.camera.log.error(`Error occurred closing socket: ${error}`);
            }
            try {
                session.mainProcess?.stop();
            }
            catch (error) {
                this.camera.log.error(`Error occurred terminating main FFmpeg process: ${error}`);
            }
            try {
                session.returnProcess?.stop();
            }
            catch (error) {
                this.camera.log.error(`Error occurred terminating two-way FFmpeg process: ${error}`);
            }
            delete this.ongoingSessions[sessionId];
            this.camera.log.info('Stopped video stream.');
        }
    }
    forceStopStream(sessionId) {
        this.controller.forceStopStreamingSession(sessionId);
    }
    async handleSnapshotRequest(request, callback) {
        try {
            this.camera.log.debug(`Snapshot requested: ${request.width} x ${request.height}`);
            const snapshot = await this.fetchSnapshot();
            this.camera.log.debug('Sending snapshot');
            callback(undefined, snapshot);
        }
        catch (error) {
            callback(error);
        }
    }
    async prepareStream(request, callback) {
        const videoIncomingPort = await (0, camera_utils_1.reservePorts)({
            count: 1,
        });
        const videoSSRC = this.hap.CameraController.generateSynchronisationSource();
        const audioIncomingPort = await (0, camera_utils_1.reservePorts)({
            count: 1,
        });
        const audioSSRC = this.hap.CameraController.generateSynchronisationSource();
        const sessionInfo = {
            address: request.targetAddress,
            addressVersion: request.addressVersion,
            audioCryptoSuite: request.audio.srtpCryptoSuite,
            audioPort: request.audio.port,
            audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
            audioSSRC: audioSSRC,
            audioIncomingPort: audioIncomingPort[0],
            videoCryptoSuite: request.video.srtpCryptoSuite,
            videoPort: request.video.port,
            videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
            videoSSRC: videoSSRC,
            videoIncomingPort: videoIncomingPort[0],
        };
        const response = {
            video: {
                port: sessionInfo.videoIncomingPort,
                ssrc: videoSSRC,
                srtp_key: request.video.srtp_key,
                srtp_salt: request.video.srtp_salt,
            },
            audio: {
                port: sessionInfo.audioIncomingPort,
                ssrc: audioSSRC,
                srtp_key: request.audio.srtp_key,
                srtp_salt: request.audio.srtp_salt,
            },
        };
        this.pendingSessions[request.sessionID] = sessionInfo;
        callback(undefined, response);
    }
    async handleStreamRequest(request, callback) {
        switch (request.type) {
            case "start" /* this.hap.StreamRequestTypes.START */: {
                this.camera.log.debug(`Start stream requested: ${request.video.width}x${request.video.height}, ${request.video.fps} fps, ${request.video.max_bit_rate} kbps`);
                await this.startStream(request, callback);
                break;
            }
            case "reconfigure" /* this.hap.StreamRequestTypes.RECONFIGURE */: {
                this.camera.log.debug(`Reconfigure stream requested: ${request.video.width}x${request.video.height}, ${request.video.fps} fps, ${request.video.max_bit_rate} kbps (Ignored)`);
                callback();
                break;
            }
            case "stop" /* this.hap.StreamRequestTypes.STOP */: {
                this.camera.log.debug('Stop stream requested');
                this.stopStream(request.sessionID);
                callback();
                break;
            }
        }
    }
    async retrieveDeviceRTSP() {
        const data = await this.camera.deviceManager.api.post(`/v1.0/devices/${this.camera.device.id}/stream/actions/allocate`, {
            type: 'rtsp',
        });
        return data.result.url;
    }
    async startStream(request, callback) {
        const sessionInfo = this.pendingSessions[request.sessionID];
        if (!sessionInfo) {
            this.camera.log.error('Error finding session information.');
            callback(new Error('Error finding session information'));
        }
        const vcodec = 'libx264';
        const mtu = 1316; // request.video.mtu is not used
        const fps = request.video.fps;
        const videoBitrate = request.video.max_bit_rate;
        const rtspUrl = await this.retrieveDeviceRTSP();
        const ffmpegArgs = [
            '-hide_banner',
            '-loglevel', 'verbose',
            '-i', rtspUrl,
            '-an', '-sn', '-dn',
            '-r', fps.toString(),
            '-codec:v', vcodec,
            '-pix_fmt', 'yuv420p',
            '-color_range', 'mpeg',
            '-f', 'rawvideo',
        ];
        const encoderOptions = '-preset ultrafast -tune zerolatency';
        if (encoderOptions) {
            ffmpegArgs.push(...encoderOptions.split(/\s+/));
        }
        if (videoBitrate > 0) {
            ffmpegArgs.push('-b:v', `${videoBitrate}k`);
        }
        // Video Stream
        ffmpegArgs.push('-payload_type', `${request.video.pt}`, '-ssrc', `${sessionInfo.videoSSRC}`, '-f', 'rtp', '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80', '-srtp_out_params', sessionInfo.videoSRTP.toString('base64'), `srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&pkt_size=${mtu}`);
        // Setting up audio
        if (request.audio.codec === "OPUS" /* AudioStreamingCodecType.OPUS */ ||
            request.audio.codec === "AAC-eld" /* AudioStreamingCodecType.AAC_ELD */) {
            ffmpegArgs.push('-vn', '-sn', '-dn');
            if (request.audio.codec === "OPUS" /* AudioStreamingCodecType.OPUS */) {
                ffmpegArgs.push('-acodec', 'libopus', '-application', 'lowdelay');
            }
            else {
                ffmpegArgs.push('-acodec', 'libfdk_aac', '-profile:a', 'aac_eld');
            }
            ffmpegArgs.push('-flags', '+global_header', '-f', 'null', '-ar', `${request.audio.sample_rate}k`, '-b:a', `${request.audio.max_bit_rate}k`, '-ac', `${request.audio.channel}`, '-payload_type', `${request.audio.pt}`, '-ssrc', `${sessionInfo.audioSSRC}`, '-f', 'rtp', '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80', '-srtp_out_params', sessionInfo.audioSRTP.toString('base64'), `srtp://${sessionInfo.address}:${sessionInfo.audioPort}?rtcpport=${sessionInfo.audioPort}&pkt_size=188`);
        }
        else {
            this.camera.log.error(`Unsupported audio codec requested: ${request.audio.codec}`);
        }
        ffmpegArgs.push('-progress', 'pipe:1');
        const activeSession = {};
        activeSession.socket = (0, dgram_1.createSocket)(sessionInfo.addressVersion === 'ipv6' ? 'udp6' : 'udp4');
        activeSession.socket.on('error', (err) => {
            this.camera.log.error('Socket error: ' + err.message);
            this.stopStream(request.sessionID);
        });
        activeSession.socket.on('message', () => {
            if (activeSession.timeout) {
                clearTimeout(activeSession.timeout);
            }
            activeSession.timeout = setTimeout(() => {
                this.camera.log.info('Device appears to be inactive. Stopping stream.');
                this.controller.forceStopStreamingSession(request.sessionID);
                this.stopStream(request.sessionID);
            }, request.video.rtcp_interval * 5 * 1000);
        });
        activeSession.socket.bind(sessionInfo.videoIncomingPort);
        activeSession.mainProcess = new FfmpegStreamingProcess_1.FfmpegStreamingProcess(request.sessionID, camera_utils_1.defaultFfmpegPath, ffmpegArgs, this.camera.log, this, callback);
        this.ongoingSessions[request.sessionID] = activeSession;
        delete this.pendingSessions[request.sessionID];
    }
    async fetchSnapshot() {
        if (!this.camera.device.online) {
            this.camera.log.debug('Device is currently offline.');
            throw new Error('Device is currently offline.');
        }
        // TODO: Check if there is a stream already running to fetch snapshot.
        const rtspUrl = await this.retrieveDeviceRTSP();
        const ffmpegArgs = [
            '-i', rtspUrl,
            '-frames:v', '1',
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'image2',
            '-',
        ];
        return new Promise((resolve, reject) => {
            this.camera.log.debug(`Running Snapshot command: ${camera_utils_1.defaultFfmpegPath} ${ffmpegArgs.map(value => JSON.stringify(value)).join(' ')}`);
            const ffmpeg = (0, child_process_1.spawn)(camera_utils_1.defaultFfmpegPath, ffmpegArgs.map(x => x.toString()), { env: process.env });
            let errors = [];
            let snapshotBuffer = Buffer.alloc(0);
            ffmpeg.stdout.on('data', (data) => {
                snapshotBuffer = Buffer.concat([snapshotBuffer, data]);
            });
            ffmpeg.on('error', (error) => {
                this.camera.log.error(`FFmpeg process creation failed: ${error.message} - Showing "offline" image instead.`);
                reject('Failed to fetch snapshot.');
            });
            ffmpeg.stderr.on('data', (data) => {
                errors = errors.slice(-5);
                errors.push(data.toString().replace(/(\r\n|\n|\r)/gm, ' '));
            });
            ffmpeg.on('close', () => {
                if (snapshotBuffer.length > 0) {
                    resolve(snapshotBuffer);
                }
                else {
                    this.camera.log.error('Failed to fetch snapshot. Showing "offline" image instead.');
                    if (errors.length > 0) {
                        this.camera.log.error(errors.join(' - '));
                    }
                    reject('Unable to fetch snapshot.');
                }
            });
        });
    }
}
exports.TuyaStreamingDelegate = TuyaStreamingDelegate;
//# sourceMappingURL=TuyaStreamDelegate.js.map