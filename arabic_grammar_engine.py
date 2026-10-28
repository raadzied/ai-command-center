#!/usr/bin/env python3
"""
Arabic Grammar Engine - Smart Conversational Tashkeel & Prosody Rules.
Fixes robotic full-tashkeel stiffness by preserving key diacritics while
stripping redundant case endings for natural word blending.
"""

import re
from typing import List, Dict, Tuple, Optional


class SmartTashkeelEngine:
    """Smart Conversational Tashkeel for natural-sounding Arabic speech."""

    # Arabic diacritical marks ranges
    HARAKAT = {
        "fatha": "\u064E",      # َ
        "kasra": "\u0650",       # ِ
        "damma": "\u064F",       # ُ
        "fathatan": "\u064B",    # ً
        "kasratan": "\u064D",    # ٍ
        "dammatan": "\u064C",    # ٌ
        "sukun": "\u0652",       # ْ
        "shadda": "\u0651",      # ّ
        "superscript_alef": "\u0670",  #ٰ
    }

    # Heavy grammatical case endings that cause robotic stiffness
    HEAVY_CASE_ENDINGS = [
        "\u064B",  # fathatan (تنوين نصب)
        "\u064C",  # dammatan (تنوين رفع)
        "\u064D",  # kasratan (تنوين جر)
    ]

    # Emphasis particles that should trigger slower rate
    EMPHASIS_PARTICLES = {"إنَّ", "إنّ", "قد", "والله", "بلى", "كلا"}

    # Explanatory connectors that should trigger faster rate
    EXPLANATORY_CONNECTORS = {"فهو", "لأنَّ", "لأنّ", "حيث", "بما أنَّ", "وبالتالي"}

    # Conversational fillers/backchannels with natural pitch curves
    CONVERSATIONAL_FILLERS = {
        "طَيِّبْ": "+8Hz",
        "نَعَمْ": "+5Hz",
        "بِالطَّبْعْ": "+6Hz",
        "حَسَناً": "+4Hz",
        "في الواقع": "+3Hz",
        "دعنا نرى": "+5Hz",
    }

    def __init__(self, conversational_mode: bool = True):
        self.conversational_mode = conversational_mode

    def apply_smart_tashkeel(self, text: str) -> str:
        """Apply smart selective tashkeel for natural speech flow.

        In conversational mode:
        - Preserves Shadda (ّ) and internal core vowels
        - Applies Sukoon (ْ) before every comma (،) and period (.)
        - Strips heavy grammatical case endings (tanween) in mid-sentence
        - Converts final ة to ه before pauses
        - Keeps essential diacritics for clarity
        """
        if not text or not text.strip():
            return ""

        result = text

        if self.conversational_mode:
            # 1. Strip heavy tanween endings in mid-sentence for smooth blending
            # Keep them only at sentence boundaries for clarity
            result = self._strip_mid_sentence_tanween(result)

            # 2. Convert final ة to ه before pauses (natural pronunciation)
            result = self._convert_final_taa_marbuta(result)

            # 3. Apply Sukoon before punctuation for clean pause markers
            result = self._apply_pause_sukoon(result)

            # 4. Preserve shadda but ensure it's properly placed
            result = self._preserve_shadda(result)

        return result

    def _strip_mid_sentence_tanween(self, text: str) -> str:
        """Remove tanween (ًٌٍ) from words that appear mid-sentence (not at end)."""
        # Split into sentences first
        sentences = re.split(r'(?<=[.؟!!])\s+', text)
        processed_sentences = []

        for sent in sentences:
            if not sent.strip():
                continue

            # For each sentence, process words
            words = sent.split()
            processed_words = []

            for i, word in enumerate(words):
                is_last_word = (i == len(words) - 1)

                if not is_last_word:
                    # Mid-sentence: strip tanween for smoother blending
                    cleaned_word = word
                    for ending in self.HEAVY_CASE_ENDINGS:
                        cleaned_word = cleaned_word.replace(ending, "")
                    processed_words.append(cleaned_word)
                else:
                    # Last word: keep tanween for sentence-final clarity
                    processed_words.append(word)

            processed_sentences.append(" ".join(processed_words))

        return " ".join(processed_sentences)

    def _convert_final_taa_marbuta(self, text: str) -> str:
        """Convert final ة (taa marbuta) to ه (ha) before pauses for natural pronunciation."""
        # Pattern: ة followed by whitespace or punctuation
        # Replace ة with ه when followed by space/comma/period/question mark
        result = re.sub(r'ة(?=\s|[,.؛؟!])', 'ه', text)
        return result

    def _apply_pause_sukoon(self, text: str) -> str:
        """Apply Sukoon (ْ) to last letter of each segment before pauses."""
        # Add sukoon before commas and periods for clean pause articulation
        # This tells edge-tts to cleanly stop the syllable
        result = text

        # Before Arabic comma: add sukoon to preceding consonant
        result = re.sub(r'([^\s])،', lambda m: m.group(1) + '\u0652،', result)

        # Before period/question/exclamation: add sukoon to preceding consonant
        result = re.sub(r'([^\s])([.؟!])', lambda m: m.group(1) + '\u0652' + m.group(2), result)

        return result

    def _preserve_shadda(self, text: str) -> str:
        """Ensure shadda (ّ) is preserved correctly for gemination clarity."""
        # Shadda is already preserved since we're not removing it
        # Just validate no double-shadda artifacts exist
        result = re.sub(r'\u0651{2,}', '\u0651', text)
        return result

    def classify_sentence_type(self, sentence: str) -> str:
        """Classify sentence type for dynamic prosody assignment."""
        stripped = self.apply_smart_tashkeel(sentence)

        # Check for question markers
        if "؟" in stripped or stripped.strip().endswith("?"):
            return "question"

        # Check for emphasis/thoughtful starters
        thoughtful_starters = ["حسناً", "في الحقيقة", "في الواقع", "دعنا", "بصراحة"]
        for starter in thoughtful_starters:
            if stripped.strip().startswith(starter):
                return "emphasized"

        # Check for explanatory connectors
        for connector in self.EXPLANATORY_CONNECTORS:
            if connector in stripped:
                return "explanatory"

        # Check for greeting/opening patterns
        greeting_patterns = ["أهلاً", "مرحباً", "السلام عليكم", "تفضل", "يسعدني"]
        for pattern in greeting_patterns:
            if pattern in stripped:
                return "greeting"

        # Default to body/explanatory for middle content
        return "body"

    def get_prosody_for_sentence(self, sentence: str) -> Dict[str, str]:
        """Get appropriate rate/pitch based on sentence classification."""
        sentence_type = self.classify_sentence_type(sentence)

        prosody_map = {
            "greeting": {"rate": "+6%", "pitch": "-2Hz"},
            "explanatory": {"rate": "+10%", "pitch": "-3Hz"},
            "question": {"rate": "+5%", "pitch": "+2Hz"},
            "emphasized": {"rate": "+3%", "pitch": "-4Hz"},
            "body": {"rate": "+8%", "pitch": "-2Hz"},
        }

        return prosody_map.get(sentence_type, {"rate": "+8%", "pitch": "-2Hz"})

    def detect_conversational_filler_pitch(self, sentence: str) -> Optional[str]:
        """Detect if sentence contains a conversational filler and return its pitch curve."""
        for filler, pitch in self.CONVERSATIONAL_FILLERS.items():
            if filler in sentence:
                return pitch
        return None


def apply_smart_tashkeel(text: str, conversational_mode: bool = True) -> str:
    """Convenience function to apply smart tashkeel without instantiating class."""
    engine = SmartTashkeelEngine(conversational_mode=conversational_mode)
    return engine.apply_smart_tashkeel(text)


def get_human_prosody(sentence: str) -> Dict[str, str]:
    """Convenience function to get prosody for a sentence."""
    engine = SmartTashkeelEngine(conversational_mode=True)
    return engine.get_prosody_for_sentence(sentence)


# ── Conversational Transition Helpers ────────────────────────────────
CONVERSATIONAL_TRANSITIONS = [
    ("حسناً... ", "opening"),
    ("بكل سرور، ", "agreement"),
    ("في الواقع، ", "clarification"),
    ("دعنا نرى... ", "thinking"),
    ("بالطبع، ", "confirmation"),
    ("هذا سؤال رائع! ", "engagement"),
]


def add_conversational_transitions(text: str) -> str:
    """Add natural conversational transitions to make text less robotic."""
    # Only add if text doesn't already start with a transition
    for transition, _ in CONVERSATIONAL_TRANSITIONS:
        if text.strip().startswith(transition):
            return text

    # Add opening transition naturally
    if text.strip().startswith(("أهلاً", "مرحباً", "السلام")):
        return text  # Already has greeting

    # Prepend a soft conversational opener
    return "حسناً... " + text
