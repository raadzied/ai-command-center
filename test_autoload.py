#!/usr/bin/env python3
"""Test that human_arabic_voice.py loads correctly with auto-load."""
import sys
sys.path.insert(0, 'E:\ai-command-center')

from human_arabic_voice import EloquentArabicPhonetics

print('Module loaded successfully')
print('Phonetics JSON loaded:', EloquentArabicPhonetics._PHONETICS_JSON_LOADED)
print('Bigrams count:', len(getattr(EloquentArabicPhonetics, '_CONTEXT_BIGRAMS', {})))

# Test the new morphological rules
text = "إِنَّ اللَّهَ غَفُورٌ"
result = EloquentArabicPhonetics.process_sentence(text)
print('Test result:', result)

# Test Sun/Moon letters
text2 = "في المدرسة"
result2 = EloquentArabicPhonetics.process_sentence(text2)
print('Test 2 result:', result2)