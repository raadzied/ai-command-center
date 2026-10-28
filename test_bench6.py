#!/usr/bin/env python3
"""Non-interactive test of voice_trainer_lab Bench 6 (San'ani Dialect)."""
import sys
sys.path.insert(0, r"E:\ai-command-center")

from voice_trainer_lab import VoiceTrainerLab

lab = VoiceTrainerLab()
lab.bench_6_sanani_dialect_ab_benchmark()
print("\n=== Bench 6 Test Complete ===")