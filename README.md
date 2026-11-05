# SonicSplit - AI Music Source Separation

This project is a powerful, local web application that separates mixed audio files (MP3, WAV) into individual components: **Vocals, Drums, Bass, and Other**. It utilizes the state-of-the-art **Demucs** AI model for high-quality audio source separation.

## 🌟 Features
- **High-Quality Separation**: Uses `htdemucs` and `htdemucs_ft` models.
- **In-Memory AI Acceleration**: Pre-warmed model caching and zero-subprocess execution for immediate demixing without cold-start latency.
- **Turbo Fast Mode**: Zero-shift accelerated inference for 2-3x faster demixing on CPUs and laptops.
- **Versatile Audio Ingestion**: Supports local file drag-and-drop (MP3, WAV, FLAC, M4A, OGG, AAC) and direct audio URL fetching.
- **Premium UI**: Modern dark mode with glassmorphism, smooth animations, and a responsive layout.
- **Interactive Remix Studio**: 
  - Dynamic Waveform visualization for each stem using WaveSurfer.js.
  - Individual stem volume controls, stereo panning, mute, and solo (Karaoke & Acapella modes).
  - Synchronized transport playback, seeking, loop, and speed controls across all tracks.
- **Downloadable Stems**: Download individual 16-bit PCM WAV tracks or full ZIP archives for DAWs (Ableton, FL Studio, Logic Pro).

## 🛠️ Tech Stack
- **Backend**: Python, Flask, PyTorch, Demucs
- **Frontend**: HTML5, Vanilla CSS3, JavaScript, Wavesurfer.js

## 🚀 Setup & Installation

### 1. Prerequisites
- Python 3.8+ installed on your system.
- Basic command-line knowledge.

### 2. Install Dependencies
Open your terminal/command prompt in the project root directory and run:
```bash
pip install -r requirements.txt
```
*(Note: Since Demucs uses PyTorch, the initial download of dependencies might be large.)*

### 3. Run the Application
Start the Flask backend server:
```bash
python app.py
```

### 4. Open in Browser
Open your favorite web browser and navigate to:
```
http://127.0.0.1:5000
```

## 🧠 How it Works
1. **Upload or Fetch**: The user uploads an audio track via drag-and-drop or enters a direct audio URL.
2. **In-Memory Decoding**: Audio is decoded directly into memory tensors using native libsndfile or FFmpeg streaming without writing redundant multi-megabyte temporary WAV files.
3. **AI Separation**: Demucs analyzes the spectrograms of the audio using a Hybrid Transformer architecture (`htdemucs`) to isolate vocals, drums, bass, and other instruments.
4. **Optimized Output**: Stems are saved as studio-grade 16-bit PCM WAV files, cutting file sizes and download latencies by 50%.
5. **Interactive DAW Studio**: The frontend fetches stems with HTTP Range request support, visualizes waveforms via WaveSurfer.js, and provides synchronous playback, presets, solo/mute, and volume/pan controls.

## ⚠️ Notes for Laptops
Processing full songs on a CPU can take a few minutes. For a faster experience during demonstrations, select the "Fast" mode in the dropdown, or use shorter audio clips (e.g., 30-60 seconds).
