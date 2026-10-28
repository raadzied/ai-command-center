#!/usr/bin/env python3
"""Fix auto-load in human_arabic_voice.py"""
import os

filepath = r"E:\ai-command-center\human_arabic_voice.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find the position before 'class HumanArabicVoiceEngine:'
pos = content.find("class HumanArabicVoiceEngine:")
if pos > 0:
    # Find the last 'return vocalized' before this position
    last_return = content.rfind("return vocalized", 0, pos)
    if last_return > 0:
        # Insert after the return vocalized line
        insert_text = '''
    # Auto-load learned phonetics on module import
    try:
        _ = SmartTashkeelEngine.load_learned_phonetics("learned_phonetics.json")
    except Exception:
        pass
'''
        content = content[:last_return + len("return vocalized")] + insert_text + content[last_return + len("return vocalized"):]

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")