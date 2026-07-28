document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dragArea = document.getElementById('dragArea');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileDetailsDisplay = document.getElementById('fileDetailsDisplay');
    const fileInspector = document.getElementById('fileInspector');
    const clearFileBtn = document.getElementById('clearFileBtn');
    const processBtn = document.getElementById('processBtn');
    const modeSelect = document.getElementById('modeSelect');
    
    const demoAudioBtn = document.getElementById('demoAudioBtn');
    const headerDemoBtn = document.getElementById('headerDemoBtn');
    const downloadZipBtnHeader = document.getElementById('downloadZipBtnHeader');
    
    const uploadSection = document.getElementById('uploadSection');
    const loadingSection = document.getElementById('loadingSection');
    const resultsSection = document.getElementById('resultsSection');
    
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');
    const loadingStatusTitle = document.getElementById('loadingStatusTitle');
    const loadingStatusSub = document.getElementById('loadingStatusSub');
    
    const stage1 = document.getElementById('stage1');
    const stage2 = document.getElementById('stage2');
    const stage3 = document.getElementById('stage3');
    const stage4 = document.getElementById('stage4');

    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    // Studio State Variables
    let selectedFile = null;
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

    const stems = ['vocals', 'drums', 'bass', 'other'];
    const colors = {
        vocals: '#f43f5e',
        drums: '#38bdf8',
        bass: '#a855f7',
        other: '#10b981'
    };

    // Helper: Toast Notification System
    function showToast(msg, icon = '✨') {
        toastIcon.textContent = icon;
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3500);
    }

    // Format Bytes
    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Format Time (seconds to MM:SS)
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === null) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Drag & Drop Handling
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
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    clearFileBtn.addEventListener('click', () => {
        selectedFile = null;
        isDemoMode = false;
        fileInput.value = '';
        fileInspector.classList.add('hidden');
        processBtn.disabled = true;
        showToast('Audio file cleared', '🗑️');
    });

    function handleFileSelect(file) {
        const validExts = ['mp3', 'wav', 'flac', 'm4a', 'aac'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            showToast('Select a valid audio file (MP3, WAV, FLAC, M4A).', '⚠️');
            return;
        }

        selectedFile = file;
        isDemoMode = false;
        fileNameDisplay.textContent = file.name;
        fileDetailsDisplay.textContent = `${formatBytes(file.size)} • ${ext.toUpperCase()} Audio Format`;
        fileInspector.classList.remove('hidden');
        processBtn.disabled = false;
        showToast(`Loaded ${file.name}`, '🎵');
    }

    // Demo Audio Trigger
    [demoAudioBtn, headerDemoBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            selectedFile = null;
            isDemoMode = true;
            fileNameDisplay.textContent = 'test_audio.wav (Demo Track)';
            fileDetailsDisplay.textContent = 'Built-in Audio Sample Track';
            fileInspector.classList.remove('hidden');
            processBtn.disabled = false;
            showToast('Demo track loaded! Click Start AI Stem Separation.', '⚡');
        });
    });

    // Top Card ZIP Bundle Export Header Trigger
    if (downloadZipBtnHeader) {
        downloadZipBtnHeader.onclick = () => {
            if (activeBaseName && activeModel) {
                window.location.href = `/download_zip/${activeModel}/${activeBaseName}`;
            } else {
                showToast('Load and separate a track first to export ZIP bundle!', '⚠️');
            }
        };
    }

    // Start Separation Process
    processBtn.addEventListener('click', async () => {
        if (!selectedFile && !isDemoMode) return;

        uploadSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        resetStages();

        try {
            let filename = 'test_audio.wav';

            if (!isDemoMode) {
                updateStage(stage1, 'active', 'Uploading file to studio engine...');
                const formData = new FormData();
                formData.append('file', selectedFile);

                const uploadRes = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
                filename = uploadData.filename;
                updateStage(stage1, 'completed', 'Uploaded successfully!');
            } else {
                updateStage(stage1, 'completed', 'Demo track ready!');
            }

            // Start Separation Job
            updateStage(stage2, 'active', 'Initializing Demucs separation pipeline...');
            const mode = modeSelect.value;
            const separateRes = await fetch('/separate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filename, mode: mode })
            });
            const separateData = await separateRes.json();

            if (!separateRes.ok) throw new Error(separateData.error || 'Failed to initialize separation');

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

                if (pct >= 25) updateStage(stage2, 'completed');
                if (pct >= 45) updateStage(stage3, 'active', 'Isolating Vocals, Drums, Bass & Instruments...');
                if (pct >= 90) updateStage(stage3, 'completed');

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
                            window.location.href = `/download_zip/${activeModel}/${activeBaseName}`;
                        };
                        
                        initPlayers(data.stems);
                        showToast('Demixing complete! Enjoy your studio remix.', '🎉');
                    }, 500);
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
        }, 800);
    }

    function resetStages() {
        [stage1, stage2, stage3, stage4].forEach(s => {
            s.className = 'step-chip';
        });
        progressPercent.textContent = '0%';
        progressBarFill.style.width = '0%';
    }

    function updateStage(stageElem, state, msg) {
        if (state === 'active') {
            stageElem.className = 'step-chip active';
        } else if (state === 'completed') {
            stageElem.className = 'step-chip completed';
        }
        if (msg) loadingStatusSub.textContent = msg;
    }

    // New Track Upload Button
    document.getElementById('newSongBtn').addEventListener('click', () => {
        stems.forEach(s => {
            if (wavesurfers[s]) wavesurfers[s].destroy();
        });
        wavesurfers = {};
        pannerNodes = {};
        
        resultsSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        showToast('Ready for next song!', '🎵');
    });

    // Initialize WaveSurfer Players
    function initPlayers(stemUrls) {
        const totalTracks = stems.length;
        let loadedCount = 0;

        stems.forEach(stem => {
            const container = document.getElementById(`waveform-${stem}`);
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

            // Setup Stereo Panning via Web Audio API Node
            ws.on('ready', () => {
                loadedCount++;
                try {
                    const audioCtx = ws.backend.getAudioContext();
                    if (audioCtx && audioCtx.createStereoPanner) {
                        const panner = audioCtx.createStereoPanner();
                        panner.pan.value = 0;
                        ws.backend.outputNode.disconnect();
                        ws.backend.outputNode.connect(panner);
                        panner.connect(audioCtx.destination);
                        pannerNodes[stem] = panner;
                    }
                } catch (e) {
                    console.log('Stereo Panner fallback:', e);
                }

                if (loadedCount === totalTracks) {
                    updateTimeDisplays();
                }
            });

            // Sync seek click across tracks
            ws.on('interaction', () => {
                const time = ws.getCurrentTime();
                const progressRatio = time / ws.getDuration();
                stems.forEach(s => {
                    if (s !== stem && wavesurfers[s]) {
                        wavesurfers[s].seekTo(progressRatio);
                    }
                });
                updateTimeDisplays();
            });

            // Synchronized Playback Loop
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

            document.getElementById(`download-${stem}`).href = stemUrls[stem];
        });

        setupMasterControls();
        setupStemControls();
    }

    // Update Time Counter & Seek Bar
    function updateTimeDisplays() {
        const refTrack = wavesurfers['vocals'];
        if (!refTrack) return;

        const currentSec = refTrack.getCurrentTime();
        const durationSec = refTrack.getDuration();

        document.getElementById('currentTimeDisplay').textContent = formatTime(currentSec);
        document.getElementById('totalDurationDisplay').textContent = formatTime(durationSec);

        const masterSeekBar = document.getElementById('masterSeekBar');
        if (durationSec > 0) {
            masterSeekBar.value = (currentSec / durationSec) * 100;
        }
    }

    // Setup Master DAW Controls
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

        // Stop All
        stopAllBtn.onclick = () => {
            isPlaying = false;
            playAllBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Play</span>`;
            stems.forEach(s => wavesurfers[s] && wavesurfers[s].stop());
            updateTimeDisplays();
        };

        // Loop Toggle
        loopBtn.onclick = () => {
            isLooping = !isLooping;
            loopBtn.classList.toggle('active', isLooping);
            showToast(isLooping ? 'Loop Mode Enabled' : 'Loop Mode Disabled', '🔁');
        };

        // Master Seek Slider
        masterSeekBar.oninput = (e) => {
            const pct = parseFloat(e.target.value) / 100;
            stems.forEach(s => wavesurfers[s] && wavesurfers[s].seekTo(pct));
            updateTimeDisplays();
        };

        // Master Volume Slider
        masterVolumeSlider.oninput = (e) => {
            masterVolume = parseFloat(e.target.value);
            stems.forEach(s => {
                const volSlider = document.querySelector(`.volume-slider[data-target="${s}"]`);
                if (volSlider && wavesurfers[s]) {
                    wavesurfers[s].setVolume(parseFloat(volSlider.value) * masterVolume);
                }
            });
        };

        // Playback Speed Selector
        if (speedSelect) {
            speedSelect.onchange = (e) => {
                const rate = parseFloat(e.target.value);
                stems.forEach(s => wavesurfers[s] && wavesurfers[s].setPlaybackRate(rate));
                showToast(`Playback Speed: ${rate}x`, '⚡');
            };
        }

        // Waveform Zoom Slider
        zoomSlider.oninput = (e) => {
            const zoomPx = parseInt(e.target.value, 10);
            stems.forEach(s => wavesurfers[s] && wavesurfers[s].zoom(zoomPx));
        };

        // Mix Presets Handlers
        const presetKaraoke = document.getElementById('presetKaraoke');
        const presetAcapella = document.getElementById('presetAcapella');
        const presetDnB = document.getElementById('presetDnB');
        const presetBacking = document.getElementById('presetBacking');

        if (presetKaraoke) {
            presetKaraoke.onclick = () => {
                resetMixerBtn.click();
                wavesurfers['vocals'] && wavesurfers['vocals'].setMuted(true);
                const muteVocals = document.querySelector(`.mute-btn[data-target="vocals"]`);
                if (muteVocals) muteVocals.classList.add('active');
                showToast('Karaoke Mode (Vocals Muted)', '🎤');
            };
        }

        if (presetAcapella) {
            presetAcapella.onclick = () => {
                resetMixerBtn.click();
                const soloVocals = document.querySelector(`.solo-btn[data-target="vocals"]`);
                if (soloVocals) soloVocals.click();
                showToast('Acapella Mode (Vocals Only)', '🎙️');
            };
        }

        if (presetDnB) {
            presetDnB.onclick = () => {
                resetMixerBtn.click();
                ['vocals', 'other'].forEach(s => {
                    wavesurfers[s] && wavesurfers[s].setMuted(true);
                    const mBtn = document.querySelector(`.mute-btn[data-target="${s}"]`);
                    if (mBtn) mBtn.classList.add('active');
                });
                showToast('Rhythm Focus Mode (Drums & Bass)', '🥁');
            };
        }

        if (presetBacking) {
            presetBacking.onclick = () => {
                resetMixerBtn.click();
                ['drums', 'bass', 'other'].forEach(s => {
                    wavesurfers[s] && wavesurfers[s].setMuted(false);
                });
                wavesurfers['vocals'] && wavesurfers['vocals'].setMuted(true);
                const mBtn = document.querySelector(`.mute-btn[data-target="vocals"]`);
                if (mBtn) mBtn.classList.add('active');
                showToast('Instrumental Backing Track', '🎹');
            };
        }

        // Reset Studio Mixer
        resetMixerBtn.onclick = () => {
            activeSoloTrack = null;
            document.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.mute-btn').forEach(btn => btn.classList.remove('active'));
            if (speedSelect) speedSelect.value = "1.0";

            stems.forEach(s => {
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

        // Keyboard Shortcuts
        document.onkeydown = (e) => {
            if (e.code === 'Space' && !resultsSection.classList.contains('hidden')) {
                e.preventDefault();
                playAllBtn.click();
            }
        };
    }

    // Setup Stem Track Controls
    function setupStemControls() {
        stems.forEach(stem => {
            const volSlider = document.querySelector(`.volume-slider[data-target="${stem}"]`);
            const volVal = document.getElementById(`vol-val-${stem}`);
            const panSlider = document.querySelector(`.pan-slider[data-target="${stem}"]`);
            const panVal = document.getElementById(`pan-val-${stem}`);
            const muteBtn = document.querySelector(`.mute-btn[data-target="${stem}"]`);
            const soloBtn = document.querySelector(`.solo-btn[data-target="${stem}"]`);

            // Volume Control
            volSlider.oninput = (e) => {
                const vol = parseFloat(e.target.value);
                if (wavesurfers[stem]) {
                    wavesurfers[stem].setVolume(vol * masterVolume);
                }
                volVal.textContent = `${Math.round(vol * 100)}%`;
                if (vol === 0) muteBtn.classList.add('active');
                else muteBtn.classList.remove('active');
            };

            // Stereo Panning Control
            panSlider.oninput = (e) => {
                const pan = parseFloat(e.target.value);
                if (pannerNodes[stem]) {
                    pannerNodes[stem].pan.value = pan;
                }
                if (pan === 0) panVal.textContent = 'C';
                else if (pan < 0) panVal.textContent = `L${Math.abs(Math.round(pan * 50))}`;
                else panVal.textContent = `R${Math.round(pan * 50)}`;
            };

            // Mute Control
            muteBtn.onclick = () => {
                const ws = wavesurfers[stem];
                if (!ws) return;
                const isMuted = ws.getMuted();
                ws.setMuted(!isMuted);
                muteBtn.classList.toggle('active', !isMuted);
            };

            // Solo Control
            soloBtn.onclick = () => {
                const isCurrentlySolo = soloBtn.classList.contains('active');

                if (isCurrentlySolo) {
                    activeSoloTrack = null;
                    soloBtn.classList.remove('active');
                    stems.forEach(s => {
                        const mBtn = document.querySelector(`.mute-btn[data-target="${s}"]`);
                        if (wavesurfers[s]) {
                            wavesurfers[s].setMuted(mBtn.classList.contains('active'));
                        }
                    });
                    showToast('Solo mode deactivated', '🎧');
                } else {
                    activeSoloTrack = stem;
                    document.querySelectorAll('.solo-btn').forEach(btn => btn.classList.remove('active'));
                    soloBtn.classList.add('active');

                    stems.forEach(s => {
                        if (s === stem) {
                            wavesurfers[s] && wavesurfers[s].setMuted(false);
                        } else {
                            wavesurfers[s] && wavesurfers[s].setMuted(true);
                        }
                    });
                    showToast(`Solo: ${stem.toUpperCase()}`, '🎧');
                }
            };
        });
    }
});
