# -*- coding: utf-8 -*-
"""
Human-Like Arabic Voice Engine (Dessa-Style Prosody + Eloquent Phonetics)
Optimized for HP ZBook 15 (CPU + RAM only, Zero GPU load)
"""
import asyncio
import re
import sys
import numpy as np
import miniaudio
import sounddevice as sd
import edge_tts


# Ensure UTF-8 output on Windows PowerShell
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")




class EloquentArabicPhonetics:
    """
    Applies Smart Conversational Tashkeel, fixes punctuation tokenization,
    handles Ta Marbouta (Waqf vs Wasl), and injects natural conversational warmth.
    """


    # Curated lexicon for exact disambiguation & natural flow (M/F, passive verbs, fillers)
    LEXICON = {
        "هذه": "هَذِهِ",
        "هذا": "هَذَا",
        "طالبة": "طَالِبَةٌ",
        "طالب": "طَالِبٌ",
        "مجتهدة": "مُجْتَهِدَةٌ",
        "مجتهد": "مُجْتَهِدٌ",
        "مدرسة": "مَدْرَسَةٌ",
        "المدرسة": "الْمَدْرَسَةِ",
        "جميلة": "جَمِيلَةٌ",
        "الجميلة": "الْجَمِيلَةِ",
        "ذهبت": "ذَهَبَتْ",
        "فاطمة": "فَاطِمَةُ",
        "إلى": "إِلَى",
        "على": "عَلَى",
        "معلم": "مُعَلِّمٌ",
        "معلمة": "مُعَلِّمَةٌ",
        "ذاهب": "ذَاهِبٌ",
        "ذاهبة": "ذَاهِبَةٌ",
        "رحمة": "رَحْمَةٌ",
        "طيب": "طَيِّبْ",
        "حسنا": "حَسَناً",
        "حسناً": "حَسَناً",
        "بكل": "بِكُلِّ",
        "سرور": "سُرُورْ",
        "أهلا": "أَهْلاً",
        "أهلاً": "أَهْلاً",
        "بك": "بِكَ",
        "يعتبر": "يُعْتَبَرُ",
        "يمكن": "يُمْكِنُ",
        "الذكاء": "الذَّكَاءِ",
        "الاصطناعي": "الِاصْطِنَاعِيِّ",
    }

    # Load learned phonetics from JSON (if available)
    _PHONETICS_JSON_LOADED = False

    @classmethod
    def load_learned_phonetics(cls, json_path: str = "learned_phonetics.json"):
        """Load learned phonetics from JSON file and merge into LEXICON and context bigrams."""
        import json
        import os
        try:
            if not os.path.exists(json_path):
                # Try the absolute path
                json_path = r"E:\ai-command-center\learned_phonetics.json"
                if not os.path.exists(json_path):
                    return False
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Merge exact_words categories
            exact_words = data.get("exact_words", {})
            for category, words in exact_words.items():
                if isinstance(words, dict):
                    cls.LEXICON.update(words)
            # Load context bigrams
            context_bigrams = data.get("context_bigrams", {})
            all_bigrams = {}
            for category, bigrams in context_bigrams.items():
                if isinstance(bigrams, dict):
                    all_bigrams.update(bigrams)
            cls._CONTEXT_BIGRAMS = all_bigrams
            cls._PHONETICS_JSON_LOADED = True
            return True
        except Exception:
            return False


    DIACRITICS_RE = re.compile(r"[\u064B-\u0652]")


    # ── San'ani Dialect Support ──────────────────────────────────────
    _SANANI_LEXICON = {}
    _SANANI_BIGRAMS = {}
    _SANANI_MODE_ENABLED = False

    @classmethod
    def load_sanani_phonetics(cls, json_path: str = "learned_phonetics.json"):
        """Load San'ani dialect phonetics from JSON file."""
        import json
        import os
        try:
            if not os.path.exists(json_path):
                json_path = r"E:\ai-command-center\learned_phonetics.json"
                if not os.path.exists(json_path):
                    return False
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            cls._SANANI_LEXICON = data.get("sanani_words", {})
            cls._SANANI_BIGRAMS = data.get("sanani_bigrams", {})
            sanani_config = data.get("sanani_mode", {})
            cls._SANANI_MODE_ENABLED = sanani_config.get("enabled", False)
            return True
        except Exception:
            return False

    @classmethod
    def _apply_sanani_sukoon(cls, vocalized: str) -> str:
        """Apply San'ani Sukoon: strip all case vowels and tanween, force Sukoon on endings."""
        # Strip all case vowels and tanween
        vocalized = re.sub(r"[\u064B-\u0650\u0652]+$", "", vocalized)
        # Force Sukoon on the last consonant (if not a long vowel)
        if len(vocalized) > 0 and vocalized[-1] not in "ا و ي ى ْ":
            vocalized += "ْ"
        return vocalized
    # ── Morphological & Tajweed Rule Sets ──────────────────────────────
    SUN_LETTERS = set("تثدذرزسشصضطظلن")
    MOON_LETTERS = set("ابجحخعغفقكمهوي")
    PREPOSITIONS = {"في", "من", "إلى", "على", "عن", "ب", "ل", "حتى", "مذ", "منذ", "خلال", "لدى"}
    INNA_PARTICLES = {"إنَّ", "إنّ", "أنَّ", "أنّ", "لعلَّ", "لعلّ", "لكنَّ", "لكنّ", "كأنَّ", "كأنّ", "ليتَ", "ليتّ", "لعلَّ", "لعلّ"}
    KANA_VERBS = {"كان", "أصبح", "ظلّ", "صار", "أمسى", "أضحى", "أضحى", "ظلَّ", "صارَ", "أمسَى", "أضحى"}

    @classmethod
    def process_sentence(cls, text: str, conversational_mode: bool = True, sanani_mode: bool = False) -> str:
        # Load sanani phonetics if needed
        if sanani_mode and not cls._SANANI_LEXICON:
            cls.load_sanani_phonetics()

        # In sanani_mode, use sanani lexicon and bigrams
        if sanani_mode:
            lexicon = cls._SANANI_LEXICON
            context_bigrams = cls._SANANI_BIGRAMS
        else:
            lexicon = cls.LEXICON
            context_bigrams = getattr(cls, "_CONTEXT_BIGRAMS", {})

        # 1. Tokenize strictly separating words from punctuation
        tokens = re.findall(r"[\w\u0600-\u06FF]+|[.,،?!;:\s]+", text)
        processed_tokens = []

        # Track previous word for context rules
        prev_word = None

        num_tokens = len(tokens)
        for i, token in enumerate(tokens):
            # If punctuation or whitespace, keep as is
            if not re.match(r"^[\w\u0600-\u06FF]+$", token):
                processed_tokens.append(token)
                continue

            # Check if next non-space token is a pause boundary
            is_before_pause = True
            for j in range(i + 1, num_tokens):
                if tokens[j].strip():
                    if any(p in tokens[j] for p in [".", "،", ",", "؟", "!", "؛", ":"]):
                        is_before_pause = True
                    else:
                        is_before_pause = False
                    break

            clean_word = cls.DIACRITICS_RE.sub("", token)
            vocalized = lexicon.get(clean_word, token)

            # Check context bigrams (two-word rules)
            if prev_word is not None:
                bigram = prev_word + " " + clean_word
                if bigram in context_bigrams:
                    # Replace the last word token with the full bigram result
                    if processed_tokens:
                        last_word_idx = -1
                        for k in range(len(processed_tokens) - 1, -1, -1):
                            if re.match(r"^[\w\u0600-\u06FF]+$", processed_tokens[k]):
                                last_word_idx = k
                                break
                        if last_word_idx >= 0:
                            processed_tokens[last_word_idx] = context_bigrams[bigram]
                    prev_word = clean_word
                    continue

            # ── San'ani Dialect Rules ────────────────────────────────────────
            if sanani_mode:
                # Disable Fusha I'rab: force Sukoon on word endings
                vocalized = cls._apply_sanani_sukoon(vocalized)
                # Apply Sun & Moon Letters (still applies in San'ani)
                vocalized = cls._apply_sun_moon_rule(vocalized, clean_word)
            else:
                # ── Morphological & Tajweed Rules (Fusha) ────────────────────
                vocalized = cls._apply_sun_moon_rule(vocalized, clean_word)

                if prev_word is not None:
                    vocalized = cls._apply_inna_kana_rule(vocalized, prev_word)

                if prev_word is not None:
                    vocalized = cls._apply_preposition_genitive(vocalized, prev_word, is_before_pause)

            # Apply Waqf/Wasl rules
            if is_before_pause:
                vocalized = cls._apply_waqf_rule(vocalized)
            elif conversational_mode:
                vocalized = cls._soften_mid_sentence(vocalized, clean_word)

            processed_tokens.append(vocalized)
            prev_word = clean_word

        return "".join(processed_tokens)


    @classmethod
    def _apply_waqf_rule(cls, word: str) -> str:
        """Applies eloquent Arabic stopping rules before commas and periods."""
        # Convert Tanween Fath (اً) to Madd Al-'Iwad (ا)
        if word.endswith("اً") or word.endswith("ً"):
            word = re.sub(r"[\u064B]+$", "", word)
            return word
        # Strip final case vowels/tanween (َ ُ ِ ٌ ٍ) at pause
        word = re.sub(r"[\u064B-\u0650\u0652]+$", "", word)
        # If ends with Ta Marbouta (ة), leave unvowelized at pause so Neural TTS pronounces soft Haa (هْ)
        if word.endswith("ة"):
            return word
        # Do not put Sukoon on long vowels (ا و ي ى)
        if not word.endswith(("ا", "و", "ي", "ى")):
            word += "ْ"
        return word


    @classmethod
    def _soften_mid_sentence(cls, vocalized: str, clean_word: str) -> str:
        """Prevents robotic textbook stiffness by keeping Wasl natural."""
        # Keep Ta Marbouta clear in mid-sentence (pronounced as Taa when connected)
        if clean_word in ("هذه", "هذا", "إلى", "على", "ذهبت"):
            return vocalized
        # Replace heavy Damma/Kasra tanween in fast conversational flow with light single vowel
        vocalized = vocalized.replace("ٌ", "ُ").replace("ٍ", "ِ")
        return vocalized


    @classmethod
    def _apply_sun_moon_rule(cls, vocalized: str, clean_word: str) -> str:
        """Sun & Moon Letters (اللام الشمسية والقمرية): Auto Shadda on Sun letter, Sukoon on Lam for Moon letter."""
        if not clean_word.startswith("ال"):
            return vocalized

        # Find the first letter after ال
        if len(clean_word) < 3:
            return vocalized

        third_char = clean_word[2]  # First letter after ال

        if third_char in cls.SUN_LETTERS:
            # Sun letter: add Shadda (ّ) to the sun letter
            if len(vocalized) >= 3 and vocalized[0] == "ال"[0] if False else True:
                # Replace the third character position with shadda version
                # Find position of the sun letter in vocalized string
                sun_char = vocalized[2] if len(vocalized) > 2 else ""
                if sun_char and sun_char not in "َُِّْ":
                    vocalized = vocalized[:2] + sun_char + "ّ" + vocalized[3:]
        elif third_char in cls.MOON_LETTERS:
            # Moon letter: add Sukoon (ْ) on the Lam (only if not already present)
            if len(vocalized) >= 2:
                # Check if second char already has a diacritic
                if len(vocalized) > 2 and vocalized[2] in "َُِّْ":
                    pass  # Already has diacritic, don't add another
                else:
                    vocalized = vocalized[:2] + "ْ" + vocalized[2:]

        return vocalized

    @classmethod
    def _apply_preposition_genitive(cls, vocalized: str, prev_word: str, is_before_pause: bool) -> str:
        """Preposition Genitive Rule (قاعدة الجر): Kasra on noun after preposition."""
        if prev_word not in cls.PREPOSITIONS:
            return vocalized
        if is_before_pause:
            return vocalized  # At pause, waqf rules take precedence

        # Check if the word already has a diacritic on its last letter
        if len(vocalized) > 0 and vocalized[-1] in "َُِّْ":
            # Replace last diacritic with kasra
            vocalized = vocalized[:-1] + "ِ"
        else:
            # Add kasra
            vocalized += "ِ"
        return vocalized

    @classmethod
    def _apply_inna_kana_rule(cls, vocalized: str, prev_word: str) -> str:
        """Inna & Kana Rules (إنّ وكان): Fatha after إنّ/أنّ/لعلّ/لكنّ, Damma after كان/أصبح/ظلّ."""
        clean_prev = cls.DIACRITICS_RE.sub("", prev_word)

        # Inna particles: apply Fatha (َ) to the following noun
        if clean_prev in {cls.DIACRITICS_RE.sub("", w) for w in cls.INNA_PARTICLES}:
            # Apply fatha to the first letter or existing diacritic
            if len(vocalized) > 0:
                if vocalized[-1] in "َُِّْ":
                    vocalized = vocalized[:-1] + "َ"
                elif vocalized[-1] in "ا و ي ى":
                    pass  # Don't add diacritic to long vowels
                else:
                    vocalized += "َ"
            return vocalized

        # Kana verbs: apply Damma (ُ) to the following noun
        if clean_prev in {cls.DIACRITICS_RE.sub("", w) for w in cls.KANA_VERBS}:
            if len(vocalized) > 0:
                if vocalized[-1] in "َُِّْ":
                    vocalized = vocalized[:-1] + "ُ"
                elif vocalized[-1] in "ا و ي ى":
                    pass
                else:
                    vocalized += "ُ"
            return vocalized

        return vocalized





        # Auto-load learned phonetics on module import
        try:
            _ = EloquentArabicPhonetics.load_learned_phonetics("learned_phonetics.json")
            _ = EloquentArabicPhonetics.load_sanani_phonetics("learned_phonetics.json")
        except Exception:
            pass


class HumanArabicVoiceEngine:
    """
    Streams Arabic speech with dynamic sentence prosody and studio DSP warmth filter.
    """


    VOICES = {
        "yemeni_male": "ar-YE-SalehNeural",
        "yemeni_female": "ar-YE-MaryamNeural",
        "gulf_male": "ar-SA-HamedNeural",
        "gulf_female": "ar-SA-ZariyahNeural",
    }


    def __init__(self, voice_key: str = "yemeni_male", sanani_mode: bool = False):
        self.voice = self.VOICES.get(voice_key, voice_key)
        self.sample_rate = 24000
        self.sanani_mode = sanani_mode


    def detect_prosody(self, sentence: str, index: int) -> dict:
        """Assigns human pitch & speed contour based on sentence intent."""
        s = sentence.strip()
        if "؟" in s or s.startswith(("هل", "كيف", "لماذا", "متى", "ما ", "أين")):
            return {"rate": "+6%", "pitch": "+2Hz"}   # Engaging question
        if s.startswith(("أهلاً", "مرحباً", "يا ", "حياك")):
            return {"rate": "+7%", "pitch": "-1Hz"}   # Warm greeting
        if s.startswith(("طيب", "حسناً", "في الواقع", "بصراحة", "إن")):
            return {"rate": "+4%", "pitch": "-3Hz"}   # Thoughtful / Deliberate
        # Alternate slightly between body sentences so cadence never feels flat
        if index % 2 == 0:
            return {"rate": "+9%", "pitch": "-2Hz"}
        return {"rate": "+7%", "pitch": "-3Hz"}


    @staticmethod
    def apply_studio_warmth_dsp(pcm_int16: np.ndarray, sample_rate: int = 24000) -> np.ndarray:
        """Removes metallic TTS harshness using normalized float32 DSP warmth filter."""
        if len(pcm_int16) == 0:
            return pcm_int16


        # 1. Normalize to [-1.0, 1.0] float32 (Fixes OpenCode's integer zeroing bug!)
        pcm = pcm_int16.astype(np.float32) / 32768.0


        # 2. Gentle warm low-pass smoothing (softens harsh sibilance above 7kHz)
        warm = 0.82 * pcm + 0.18 * np.roll(pcm, 1)
        warm[0] = pcm[0]


        # 3. Subtle analog-style soft saturation for vocal body/chest presence
        warm = np.tanh(warm * 1.20) / np.tanh(1.20)


        # 4. Smooth 15ms fade-in/out to prevent hardware clicks between sentences
        fade_len = int(0.015 * sample_rate)
        if len(warm) > 2 * fade_len:
            warm[:fade_len] *= np.linspace(0.0, 1.0, fade_len, dtype=np.float32)
            warm[-fade_len:] *= np.linspace(1.0, 0.0, fade_len, dtype=np.float32)


        return np.clip(warm * 31500.0, -32768, 32767).astype(np.int16)


    async def _synthesize_sentence(self, text: str, rate: str, pitch: str) -> bytes:
        communicate = edge_tts.Communicate(text=text, voice=self.voice, rate=rate, pitch=pitch)
        audio_bytes = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes.extend(chunk["data"])
        return bytes(audio_bytes)


    def _play_mp3_buffer(self, mp3_bytes: bytes):
        if not mp3_bytes or len(mp3_bytes) < 100:
            return
        decoded = miniaudio.decode(
            mp3_bytes,
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=self.sample_rate,
        )
        raw_pcm = np.frombuffer(decoded.samples, dtype=np.int16)
        warm_pcm = self.apply_studio_warmth_dsp(raw_pcm, self.sample_rate)
        sd.play(warm_pcm, samplerate=self.sample_rate, blocking=True)


    async def speak(self, paragraph: str, sanani_mode: bool = None):
        if sanani_mode is None:
            sanani_mode = self.sanani_mode
        # Split only on full sentence boundaries (. ؟ ! \n), keeping commas inside for natural breath
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.؟!\n])\s+", paragraph.strip())
            if s.strip()
        ]


        # Pre-fetch ALL sentences concurrently so there is ZERO network lag between sentences!
        tasks = []
        processed_list = []
        for idx, raw_sent in enumerate(sentences):
            eloquent_sent = EloquentArabicPhonetics.process_sentence(raw_sent, sanani_mode=sanani_mode)
            prosody = self.detect_prosody(raw_sent, idx)
            processed_list.append((eloquent_sent, prosody))
            tasks.append(self._synthesize_sentence(eloquent_sent, prosody["rate"], prosody["pitch"]))


        audio_buffers = await asyncio.gather(*tasks)


        for (eloquent_sent, prosody), mp3_bytes in zip(processed_list, audio_buffers):
            print(f"🎙️ [{self.voice}] ({prosody['rate']}, {prosody['pitch']}): {eloquent_sent}")
            self._play_mp3_buffer(mp3_bytes)




async def main():
    print("=" * 65)
    print(" 🎧 TESTING HUMANIZED ARABIC VOICE + COPILOT GRAMMAR SUITE")
    print("=" * 65)


    # 1. Test with Yemeni Male Voice (SalehNeural)
    engine_ye = HumanArabicVoiceEngine("yemeni_male")
    dialogue_1 = (
        "أهلاً بك يا صديقي، طَيِّبْ... دعنا نختبر دقة النطق والنبرات الآن. "
        "هذه طالبة مجتهدة، وهذا طالب مجتهد. "
        "ذهبت فاطمة إلى المدرسة الجميلة، ثم عادت مسرورة. "
        "هل تلاحظ كيف أصبحت النبرة أكثر دفئاً وانسيابية؟"
    )
    await engine_ye.speak(dialogue_1)


    # 2. Test with Gulf/Saudi Male Voice (HamedNeural)
    engine_sa = HumanArabicVoiceEngine("gulf_male")
    dialogue_2 = (
        "حسناً، في الواقع هذا النموذج يدمج بين قواعد الوقف والوصل السليمة وبين سرعة البديهة. "
        "أنا ذاهب إلى العمل الآن، وهي ذاهبة إلى الجامعة."
    )
    await engine_sa.speak(dialogue_2)


    print("\n✅ اكتمل الاختبار بنجاح تام!")




if __name__ == "__main__":
    asyncio.run(main())