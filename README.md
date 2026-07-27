# SonicSplit - AI Music Source Separation

This project is a powerful, local web application that separates mixed audio files (MP3, WAV) into individual components: **Vocals, Drums, Bass, and Other**. It utilizes the state-of-the-art **Demucs** AI model for high-quality audio source separation.

## 🌟 Features
- **High-Quality Separation**: Uses `htdemucs` and `htdemucs_ft` models.
- **Premium UI**: Modern dark mode with glassmorphism, smooth animations, and a responsive layout.
- **Interactive Remix Studio**: 
  - Dynamic Waveform and Spectrogram visualization for each stem.
  - Individual stem volume controls, mute, and solo (Karaoke mode).
  - Sync playback across all separated tracks.
- **Performance Modes**: Choose between 'Fast' (better for standard laptops) or 'High Quality'.
- **Downloadable Stems**: Download individual instruments to use in your DAWs.

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
1. **Upload**: The user uploads an audio track via the UI.
2. **Backend Processing**: Flask receives the file and triggers the Demucs model via a subprocess.
3. **AI Separation**: Demucs analyzes the spectrograms of the audio and uses a Hybrid Transformer architecture to isolate frequency patterns belonging to vocals, drums, bass, and other instruments.
4. **Output**: The separated stems are saved locally in the `outputs/` folder.
5. **Visualization & Playback**: The frontend fetches these stems, visualizes their waveforms/spectrograms using Wavesurfer.js, and provides an interactive mixer.

## ⚠️ Notes for Laptops
Processing full songs on a CPU can take a few minutes. For a faster experience during demonstrations, select the "Fast" mode in the dropdown, or use shorter audio clips (e.g., 30-60 seconds).
