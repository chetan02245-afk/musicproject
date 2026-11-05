document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Navigation & Inputs
    const dragArea = document.getElementById('dragArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileDetailsDisplay = document.getElementById('fileDetailsDisplay');
    const fileInspector = document.getElementById('fileInspector');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const processBtn = document.getElementById('processBtn');
    const modeSelect = document.getElementById('modeSelect');

    const tabFileBtn = document.getElementById('tabFileBtn');
    const tabUrlBtn = document.getElementById('tabUrlBtn');
    const urlInputContainer = document.getElementById('urlInputContainer');
    const urlInput = document.getElementById('urlInput');
    const fetchUrlBtn = document.getElementById('fetchUrlBtn');

    const demoAudioBtn = document.getElementById('demoAudioBtn');
    const headerDemoBtn = document.getElementById('headerDemoBtn');
    const downloadZipBtnHeader = document.getElementById('downloadZipBtnHeader');

    // Sections
    const uploadSection = document.getElementById('uploadSection');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');

    // Loader Progress Elements
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');
    const loadingStatusTitle = document.getElementById('loadingStatusTitle');
    const loadingStatusSub = document.getElementById('loadingStatusSub');

    const stage1 = document.getElementById('stage1');
    const stage2 = document.getElementById('stage2');
    const stage3 = document.getElementById('stage3');
    const stage4 = document.getElementById('stage4');

    // Toast Notification System
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    // Studio State Variables
    let selectedFile = null;
    let uploadedFilename = null;
    let isDemoMode = false;
    let pollInterval = null;
    let wavesurfers = {};
    let pannerNodes = {};
    let masterVolume = 1;
    let isLooping = false;
    let isPlaying = false;
    let activeSoloTrack = null;
    let activeModel = 'htdemucs';
    let activeBaseName = 'track_audio';
    let isSeeking = false;

    const stems = ['vocals', 'drums', 'bass', 'other'];
    const colors = {
        vocals: '#f43f5e',
        drums: '#38bdf8',
        bass: '#a855f7',
        other: '#10b981'
    };

    const trackStates = {
        vocals: { volume: 1, muted: false, pan: 0 },
        drums:  { volume: 1, muted: false, pan: 0 },
        bass:   { volume: 1, muted: false, pan: 0 },
        other:  { volume: 1, muted: false, pan: 0 }
    };

    // Helper: Toast Notifications
    let toastTimeout = null;
    function showToast(msg, icon = '✨') {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastIcon.textContent = icon;
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        toastTimeout = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3500);
    }

    // Helper: Format Bytes
    function formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Helper: Format Seconds to MM:SS
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === null || seconds < 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Tab Switching: Local File vs URL Fetch
    if (tabFileBtn && tabUrlBtn) {
        tabFileBtn.addEventListener('click', () => {
            tabFileBtn.classList.add('active');
            tabUrlBtn.classList.remove('active');
            dragArea.classList.remove('hidden');
            if (urlInputContainer) urlInputContainer.classList.add('hidden');
        });

        tabUrlBtn.addEventListener('click', () => {
            tabUrlBtn.classList.add('active');
            tabFileBtn.classList.remove('active');
            dragArea.classList.add('hidden');
            if (urlInputContainer) urlInputContainer.classList.remove('hidden');
        });
    }

    // URL Fetch Audio Action
    if (fetchUrlBtn && urlInput) {
        fetchUrlBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (!url) {
                showToast('Please enter an audio link', '⚠️');
                return;
            }

            fetchUrlBtn.disabled = true;
            fetchUrlBtn.textContent = '⏳ Fetching...';
            showToast('Fetching audio stream from URL...', '🌐');

            try {
                const res = await fetch('/upload_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to download audio from link');

                selectedFile = null;
                isDemoMode = false;
                uploadedFilename = data.filename;

                fileNameDisplay.textContent = data.original_name || data.filename;
                fileDetailsDisplay.textContent = 'Web Stream Audio • Ready to Demix';
                fileInspector.classList.remove('hidden');
                processBtn.disabled = false;

                showToast(`Audio fetched: ${data.original_name || data.filename}`, '🎵');
            } catch (err) {
                showToast(`Fetch error: ${err.message}`, '❌');
            } finally {
                fetchUrlBtn.disabled = false;
                fetchUrlBtn.textContent = '⚡ Fetch Audio';
            }
        });
    }

    // File Browse Button
    if (browseBtn) {
        browseBtn.addEventListener('click', () => fileInput.click());
    }

    // Drag & Drop Handling
    if (dragArea) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dragArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragArea.classList.add('active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dragArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                dragArea.classList.remove('active');
            });
        });

        dragArea.addEventListener('drop', (e) => {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function handleFileSelect(file) {
        const validExts = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            showToast('Please select a valid audio format (MP3, WAV, FLAC, M4A, OGG).', '⚠️');
            return;
        }

        selectedFile = file;
        uploadedFilename = null;
        isDemoMode = false;

        fileNameDisplay.textContent = file.name;
        fileDetailsDisplay.textContent = `${formatBytes(file.size)} • ${ext.toUpperCase()} Audio Format`;
        fileInspector.classList.remove('hidden');
        processBtn.disabled = false;

        showToast(`Loaded ${file.name}`, '🎵');
    }

    // Clear File Handler
    if (clearFileBtn) {
        clearFileBtn.addEventListener('click', () => {
            selectedFile = null;
            uploadedFilename = null;
            isDemoMode = false;
            if (fileInput) fileInput.value = '';
            if (urlInput) urlInput.value = '';
            fileInspector.classList.add('hidden');
            processBtn.disabled = true;
            showToast('Audio file cleared', '🗑️');
        });
    }

    // Demo Audio Trigger
    [demoAudioBtn, headerDemoBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            selectedFile = null;
            uploadedFilename = 'test_audio.wav';
            isDemoMode = true;
            fileNameDisplay.textContent = 'test_audio.wav (Demo Track)';
            fileDetailsDisplay.textContent = 'Built-in Demo Sample Audio Track';
            fileInspector.classList.remove('hidden');
            processBtn.disabled = false;
            showToast('Demo track loaded! Click Start AI Stem Separation.', '⚡');
        });
    });

    // Top Card ZIP Bundle Export Header Trigger
    if (downloadZipBtnHeader) {
        downloadZipBtnHeader.onclick = () => {
            if (activeBaseName && activeModel) {
                window.location.href = `/download_zip/${activeModel}/${encodeURIComponent(activeBaseName)}`;
            } else {
                showToast('Demix a song first to export ZIP bundle!', '⚠️');
            }
        };
    }

    // Start Separation Process
    processBtn.addEventListener('click', async () => {
        if (!selectedFile && !isDemoMode && !uploadedFilename) return;

        uploadSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        resetStages();

        try {
            let filenameToProcess = uploadedFilename;

            // 1. Upload file to backend if not already uploaded or demo
            if (!filenameToProcess && selectedFile) {
                updateStage(stage1, 'active', 'Uploading audio to studio engine...');
                const formData = new FormData();
                formData.append('file', selectedFile);

                const uploadRes = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');

                filenameToProcess = uploadData.filename;
                uploadedFilename = filenameToProcess;
                updateStage(stage1, 'completed', 'Uploaded successfully!');
            } else {
                updateStage(stage1, 'completed', 'Audio source ready!');
            }

            // 2. Start Separation Job
            updateStage(stage2, 'active', 'Initializing Demucs AI neural network...');
            const mode = modeSelect ? modeSelect.value : 'fast';

            const separateRes = await fetch('/separate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filenameToProcess, mode: mode })
            });
            const separateData = await separateRes.json();
            if (!separateRes.ok) throw new Error(separateData.error || 'Failed to start separation');

            const jobId = separateData.job_id;
            pollJobStatus(jobId);

        } catch (err) {
            showToast(`Error: ${err.message}`, '❌');
            loadingSection.classList.add('hidden');
            uploadSection.classList.remove('hidden');
        }
    });

    // Polling Job Status Loop
    function pollJobStatus(jobId) {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/status/${jobId}`);
                if (!res.ok) return;

                const data = await res.json();
                const pct = data.progress || 0;

                progressPercent.textContent = `${pct}%`;
                progressBarFill.style.width = `${pct}%`;
                loadingStatusTitle.textContent = data.message || 'Processing Audio...';

                if (pct >= 15) updateStage(stage2, 'completed');
                if (pct >= 25) updateStage(stage3, 'active', 'Isolating Vocals, Drums, Bass & Instruments...');
                if (pct >= 95) updateStage(stage3, 'completed');

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    updateStage(stage4, 'completed', 'Rendering Studio Rack!');

                    activeModel = data.model || 'htdemucs';
                    activeBaseName = data.base_name || 'track';

                    setTimeout(() => {
                        loadingSection.classList.add('hidden');
                        resultsSection.classList.remove('hidden');

                        document.getElementById('currentTrackTitle').textContent = `Active Track: ${activeBaseName}`;
                        document.getElementById('downloadZipBtn').onclick = () => {
                            window.location.href = `/download_zip/${activeModel}/${encodeURIComponent(activeBaseName)}`;
                        };

                        initPlayers(data.stems);
                        showToast('AI Demixing complete! Enjoy your studio remix.', '🎉');
                    }, 400);

                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    throw new Error(data.error || 'Demucs separation job failed');
                }

            } catch (err) {
                clearInterval(pollInterval);
                showToast(`Separation failed: ${err.message}`, '❌');
                loadingSection.classList.add('hidden');
                uploadSection.classList.remove('hidden');
            }
        }, 600);
    }

    function resetStages() {
        [stage1, stage2, stage3, stage4].forEach(s => {
            if (s) s.className = 'step-chip';
        });
        progressPercent.textContent = '0%';
        progressBarFill.style.width = '0%';
    }

    function updateStage(stageElem, state, msg) {
        if (!stageElem) return;
        if (state === 'active') {
            stageElem.className = 'step-chip active';
        } else if (state === 'completed') {
            stageElem.className = 'step-chip completed';
        }
        if (msg && loadingStatusSub) loadingStatusSub.textContent = msg;
    }

    // Destroy existing WaveSurfer instances cleanly
    function destroyPlayers() {
        stems.forEach(s => {
            if (wavesurfers[s]) {
                try {
                    wavesurfers[s].pause();
                    wavesurfers[s].destroy();
                } catch (e) {
                    console.error(`Error cleaning wavesurfer ${s}:`, e);
                }
                wavesurfers[s] = null;
            }
            const container = document.getElementById(`waveform-${s}`);
            if (container) container.innerHTML = '';
        });
        wavesurfers = {};
        pannerNodes = {};
    }

    // Reset view for "+ New Track"
    function resetToUploadView() {
        destroyPlayers();
        isPlaying = false;
        activeSoloTrack = null;
        selectedFile = null;
        uploadedFilename = null;
        isDemoMode = false;

        if (fileInput) fileInput.value = '';
        if (urlInput) urlInput.value = '';
        if (fileInspector) fileInspector.classList.add('hidden');
        if (fileNameDisplay) fileNameDisplay.textContent = '';
        if (fileDetailsDisplay) fileDetailsDisplay.textContent = '';
        if (processBtn) processBtn.disabled = true;

        // Reset Play button UI
        const playAllBtn = document.getElementById('playAllBtn');
        if (playAllBtn) {
            playAllBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Play</span>`;
        }

        // Reset Track States & UI Strips
        stems.forEach(s => {
            trackStates[s] = { volume: 1, muted: false, pan: 0 };
            const mBtn = document.querySelector(`.mute-btn[data-target="${s}"]`);
            if (mBtn) mBtn.classList.remove('active');
            const sBtn = document.querySelector(`.solo-btn[data-target="${s}"]`);
            if (sBtn) sBtn.classList.remove('active');
            const volSlider = document.querySelector(`.volume-slider[data-target="${s}"]`);
            if (volSlider) volSlider.value = 1;
            const volVal = document.getElementById(`vol-val-${s}`);
            if (volVal) volVal.textContent = '100%';
            const panSlider = document.querySelector(`.pan-slider[data-target="${s}"]`);
            if (panSlider) panSlider.value = 0;
            const panVal = document.getElementById(`pan-val-${s}`);
            if (panVal) panVal.textContent = 'C';
        });

        resetStages();
        resultsSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');

        showToast('Ready for new song! Drop or browse audio.', '🎵');
    }

    // Hook up "+ New Track" button
    const newSongBtn = document.getElementById('newSongBtn');
    if (newSongBtn) {
        newSongBtn.addEventListener('click', resetToUploadView);
    }

    // Stereo Panner Node setup for WebAudio
    function setupTrackAudioNodes(stem, ws) {
        try {
            const mediaEl = ws.getMediaElement();
            if (!mediaEl) return;

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            if (!window.studioAudioCtx) {
                window.studioAudioCtx = new AudioContextClass();
            }
            const ctx = window.studioAudioCtx;

            if (ctx.state === 'suspended') {
                const resumeCtx = () => {
                    ctx.resume();
                    document.removeEventListener('click', resumeCtx);
                };
                document.addEventListener('click', resumeCtx);
            }

            if (ctx.createStereoPanner && !ws._pannerConnected) {
                const sourceNode = ctx.createMediaElementSource(mediaEl);
                const pannerNode = ctx.createStereoPanner();
                pannerNode.pan.value = trackStates[stem].pan;
                sourceNode.connect(pannerNode);
                pannerNode.connect(ctx.destination);
                pannerNodes[stem] = pannerNode;
                ws._pannerConnected = true;
            }
        } catch (err) {
            // Already connected or cross-origin fallback
        }
    }

    // Initialize WaveSurfer Players
    function initPlayers(stemUrls) {
        destroyPlayers();
        const totalTracks = stems.length;
        let loadedCount = 0;

        stems.forEach(stem => {
            const container = document.getElementById(`waveform-${stem}`);
            if (!container) return;
            container.innerHTML = '';

            const ws = WaveSurfer.create({
                container: container,
                waveColor: 'rgba(255, 255, 255, 0.16)',
                progressColor: colors[stem],
                cursorColor: '#f59e0b',
                cursorWidth: 2,
                barWidth: 2,
                barGap: 1,
                barRadius: 2,
                height: 65,
                normalize: true,
                interact: true
            });

            ws.load(stemUrls[stem]);
            wavesurfers[stem] = ws;

            ws.on('ready', () => {
                loadedCount++;
                setupTrackAudioNodes(stem, ws);

                // Set initial volume & mute state
                ws.setVolume(trackStates[stem].volume * masterVolume);
                ws.setMuted(trackStates[stem].muted);

                if (loadedCount === totalTracks) {
                    updateTimeDisplays();
                }
            });

            // Synchronized seek on track click
            ws.on('interaction', () => {
                const time = ws.getCurrentTime();
                const dur = ws.getDuration();
                if (dur > 0) {
                    const ratio = time / dur;
                    stems.forEach(s => {
                        if (s !== stem && wavesurfers[s]) {
                            wavesurfers[s].seekTo(ratio);
                        }
                    });
                }
                updateTimeDisplays();
            });

            // Sync timeline
            ws.on('timeupdate', () => {
                if (stem === 'vocals') {
                    updateTimeDisplays();
                }
            });

            ws.on('finish', () => {
                if (isLooping && stem === 'vocals') {
                    stems.forEach(s => wavesurfers[s] && wavesurfers[s].play(0));
                }
            });

            const downloadLink = document.getElementById(`download-${stem}`);
            if (downloadLink) downloadLink.href = stemUrls[stem];
        });
    }

    // Update Time Counter & Master Seek Slider
    function updateTimeDisplays() {
        const refTrack = wavesurfers['vocals'] || Object.values(wavesurfers)[0];
        if (!refTrack) return;

        const currentSec = refTrack.getCurrentTime();
        const durationSec = refTrack.getDuration();

        const curElem = document.getElementById('currentTimeDisplay');
        const durElem = document.getElementById('totalDurationDisplay');
        if (curElem) curElem.textContent = formatTime(currentSec);
        if (durElem) durElem.textContent = formatTime(durationSec);

        const masterSeekBar = document.getElementById('masterSeekBar');
        if (masterSeekBar && !isSeeking && durationSec > 0) {
            masterSeekBar.value = (currentSec / durationSec) * 100;
        }
    }

    // Setup Master Transport Controls (Registered ONCE)
    function setupMasterControls() {
        const playAllBtn = document.getElementById('playAllBtn');
        const stopAllBtn = document.getElementById('stopAllBtn');
        const loopBtn = document.getElementById('loopBtn');
        const masterSeekBar = document.getElementById('masterSeekBar');
        const masterVolumeSlider = document.getElementById('masterVolumeSlider');
        const speedSelect = document.getElementById('speedSelect');
        const zoomSlider = document.getElementById('zoomSlider');
        const resetMixerBtn = document.getElementById('resetMixerBtn');

        isPlaying = false;

        // Play / Pause Toggle
        if (playAllBtn) {
            playAllBtn.onclick = () => {
                isPlaying = !isPlaying;
                if (isPlaying) {
                    playAllBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> <span>Pause</span>`;
                    stems.forEach(s => wavesurfers[s] && wavesurfers[s].play());
                } else {
                    playAllBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Play</span>`;
                    stems.forEach(s => wavesurfers[s] && wavesurfers[s].pause());
                }
            };
        }

        // Stop All
        if (stopAllBtn) {
            stopAllBtn.onclick = () => {
                isPlaying = false;
                if (playAllBtn) {
                    playAllBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Play</span>`;
                }
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].stop());
                updateTimeDisplays();
            };
        }

        // Loop Toggle
        if (loopBtn) {
            loopBtn.onclick = () => {
                isLooping = !isLooping;
                loopBtn.classList.toggle('active', isLooping);
                showToast(isLooping ? 'Loop Mode Enabled' : 'Loop Mode Disabled', '🔁');
            };
        }

        // Master Seek Slider with Drag Detection
        if (masterSeekBar) {
            masterSeekBar.addEventListener('mousedown', () => { isSeeking = true; });
            masterSeekBar.addEventListener('touchstart', () => { isSeeking = true; });

            const commitSeek = (e) => {
                isSeeking = false;
                const pct = parseFloat(e.target.value) / 100;
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].seekTo(pct));
                updateTimeDisplays();
            };

            masterSeekBar.addEventListener('change', commitSeek);
            masterSeekBar.addEventListener('mouseup', commitSeek);
            masterSeekBar.addEventListener('touchend', commitSeek);

            masterSeekBar.oninput = (e) => {
                const pct = parseFloat(e.target.value) / 100;
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].seekTo(pct));
                updateTimeDisplays();
            };
        }

        // Master Volume Slider
        if (masterVolumeSlider) {
            masterVolumeSlider.oninput = (e) => {
                masterVolume = parseFloat(e.target.value);
                stems.forEach(s => {
                    if (wavesurfers[s]) {
                        wavesurfers[s].setVolume(trackStates[s].volume * masterVolume);
                    }
                });
            };
        }

        // Playback Speed Selector
        if (speedSelect) {
            speedSelect.onchange = (e) => {
                const rate = parseFloat(e.target.value);
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].setPlaybackRate(rate));
                showToast(`Playback Speed: ${rate}x`, '⚡');
            };
        }

        // Waveform Zoom Slider
        if (zoomSlider) {
            zoomSlider.oninput = (e) => {
                const zoomPx = parseInt(e.target.value, 10);
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].zoom(zoomPx));
            };
        }

        // Mix Presets Handlers
        const presetKaraoke = document.getElementById('presetKaraoke');
        const presetAcapella = document.getElementById('presetAcapella');
        const presetDnB = document.getElementById('presetDnB');
        const presetBacking = document.getElementById('presetBacking');

        if (presetKaraoke) {
            presetKaraoke.onclick = () => {
                if (resetMixerBtn) resetMixerBtn.click();
                trackStates['vocals'].muted = true;
                wavesurfers['vocals'] && wavesurfers['vocals'].setMuted(true);
                const muteVocals = document.querySelector(`.mute-btn[data-target="vocals"]`);
                if (muteVocals) muteVocals.classList.add('active');
                showToast('Karaoke Mode (Vocals Muted)', '🎤');
            };
        }

        if (presetAcapella) {
            presetAcapella.onclick = () => {
                if (resetMixerBtn) resetMixerBtn.click();
                const soloVocals = document.querySelector(`.solo-btn[data-target="vocals"]`);
                if (soloVocals) soloVocals.click();
                showToast('Acapella Mode (Vocals Only)', '🎙️');
            };
        }

        if (presetDnB) {
            presetDnB.onclick = () => {
                if (resetMixerBtn) resetMixerBtn.click();
                ['vocals', 'other'].forEach(s => {
                    trackStates[s].muted = true;
                    wavesurfers[s] && wavesurfers[s].setMuted(true);
                    const mBtn = document.querySelector(`.mute-btn[data-target="${s}"]`);
                    if (mBtn) mBtn.classList.add('active');
                });
                showToast('Rhythm Focus Mode (Drums & Bass)', '🥁');
            };
        }

        if (presetBacking) {
            presetBacking.onclick = () => {
                if (resetMixerBtn) resetMixerBtn.click();
                trackStates['vocals'].muted = true;
                wavesurfers['vocals'] && wavesurfers['vocals'].setMuted(true);
                const mBtn = document.querySelector(`.mute-btn[data-target="vocals"]`);
                if (mBtn) mBtn.classList.add('active');
                showToast('Instrumental Backing Track', '🎹');
            };
        }

        // Reset Studio Mixer
        if (resetMixerBtn) {
            resetMixerBtn.onclick = () => {
                activeSoloTrack = null;
                document.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.mute-btn').forEach(btn => btn.classList.remove('active'));
                if (speedSelect) speedSelect.value = "1.0";

                stems.forEach(s => {
                    trackStates[s] = { volume: 1, muted: false, pan: 0 };
                    if (wavesurfers[s]) {
                        wavesurfers[s].setVolume(1 * masterVolume);
                        wavesurfers[s].setMuted(false);
                        wavesurfers[s].setPlaybackRate(1.0);
                    }
                    const volSlider = document.querySelector(`.volume-slider[data-target="${s}"]`);
                    if (volSlider) volSlider.value = 1;
                    const volVal = document.getElementById(`vol-val-${s}`);
                    if (volVal) volVal.textContent = '100%';

                    const panSlider = document.querySelector(`.pan-slider[data-target="${s}"]`);
                    if (panSlider) panSlider.value = 0;
                    const panVal = document.getElementById(`pan-val-${s}`);
                    if (panVal) panVal.textContent = 'C';

                    if (pannerNodes[s]) pannerNodes[s].pan.value = 0;
                });

                showToast('Mixer reset to default parameters', '🔄');
            };
        }

        // Global Spacebar shortcut for Play/Pause
        document.onkeydown = (e) => {
            if (e.code === 'Space' && resultsSection && !resultsSection.classList.contains('hidden')) {
                // Don't intercept space if user is typing in an input
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
                e.preventDefault();
                if (playAllBtn) playAllBtn.click();
            }
        };
    }

    // Setup Stem Track Volume, Pan, Mute, Solo Controls (Registered ONCE)
    function setupStemControls() {
        stems.forEach(stem => {
            const volSlider = document.querySelector(`.volume-slider[data-target="${stem}"]`);
            const volVal = document.getElementById(`vol-val-${stem}`);
            const panSlider = document.querySelector(`.pan-slider[data-target="${stem}"]`);
            const panVal = document.getElementById(`pan-val-${stem}`);
            const muteBtn = document.querySelector(`.mute-btn[data-target="${stem}"]`);
            const soloBtn = document.querySelector(`.solo-btn[data-target="${stem}"]`);

            // Volume Control
            if (volSlider) {
                volSlider.oninput = (e) => {
                    const vol = parseFloat(e.target.value);
                    trackStates[stem].volume = vol;
                    if (wavesurfers[stem]) {
                        wavesurfers[stem].setVolume(vol * masterVolume);
                    }
                    if (volVal) volVal.textContent = `${Math.round(vol * 100)}%`;
                    if (muteBtn) {
                        if (vol === 0) muteBtn.classList.add('active');
                        else if (!trackStates[stem].muted) muteBtn.classList.remove('active');
                    }
                };
            }

            // Stereo Panning Control
            if (panSlider) {
                panSlider.oninput = (e) => {
                    const pan = parseFloat(e.target.value);
                    trackStates[stem].pan = pan;
                    if (pannerNodes[stem]) {
                        pannerNodes[stem].pan.value = pan;
                    }
                    if (panVal) {
                        if (pan === 0) panVal.textContent = 'C';
                        else if (pan < 0) panVal.textContent = `L${Math.abs(Math.round(pan * 50))}`;
                        else panVal.textContent = `R${Math.round(pan * 50)}`;
                    }
                };
            }

            // Mute Control (Uses trackStates and ws.setMuted)
            if (muteBtn) {
                muteBtn.onclick = () => {
                    const ws = wavesurfers[stem];
                    if (!ws) return;
                    trackStates[stem].muted = !trackStates[stem].muted;
                    ws.setMuted(trackStates[stem].muted);
                    muteBtn.classList.toggle('active', trackStates[stem].muted);
                    showToast(`${stem.toUpperCase()} ${trackStates[stem].muted ? 'Muted' : 'Unmuted'}`, trackStates[stem].muted ? '🔇' : '🔊');
                };
            }

            // Solo Control (Isolates selected stem)
            if (soloBtn) {
                soloBtn.onclick = () => {
                    const isCurrentlySolo = (activeSoloTrack === stem);

                    if (isCurrentlySolo) {
                        activeSoloTrack = null;
                        soloBtn.classList.remove('active');
                        stems.forEach(s => {
                            if (wavesurfers[s]) {
                                wavesurfers[s].setMuted(trackStates[s].muted);
                            }
                        });
                        showToast('Solo mode disabled', '🎧');
                    } else {
                        activeSoloTrack = stem;
                        document.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
                        soloBtn.classList.add('active');

                        stems.forEach(s => {
                            if (wavesurfers[s]) {
                                wavesurfers[s].setMuted(s !== stem);
                            }
                        });
                        showToast(`Solo: ${stem.toUpperCase()}`, '🎧');
                    }
                };
            }
        });
    }

    // Initialize Global Controls
    setupMasterControls();
    setupStemControls();
});
