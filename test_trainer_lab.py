#!/usr/bin/env python3
"""Non-interactive test of voice_trainer_lab benches."""
import sys
sys.path.insert(0, r"E:\ai-command-center")

from voice_trainer_lab import VoiceTrainerLab

lab = VoiceTrainerLab()
lab.run_all_benches()
print("\n=== Voice Trainer Lab Test Complete ===")