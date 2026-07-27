import sys
import torchaudio
import soundfile as sf
import torch

# Monkeypatch torchaudio.load to use soundfile
# This bypasses the broken torchcodec dependency on Windows completely
def patched_load(filepath, **kwargs):
    data, sr = sf.read(filepath, dtype='float32')
    tensor = torch.from_numpy(data)
    if tensor.dim() == 1:
        tensor = tensor.unsqueeze(0)
    else:
        tensor = tensor.t().clone()
    return tensor, sr

torchaudio.load = patched_load

def patched_save(filepath, src, sample_rate, **kwargs):
    if src.dim() > 1:
        src = src.t()
    sf.write(filepath, src.cpu().numpy(), sample_rate)

torchaudio.save = patched_save

# Optimize PyTorch CPU thread count for maximum CPU utilization
import os
torch.set_num_threads(os.cpu_count() or 4)

# Run Demucs CLI
from demucs.separate import main as demucs_main

if __name__ == '__main__':
    demucs_main()
