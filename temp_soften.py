    @classmethod
    def _soften_mid_sentence(cls, vocalized: str, clean_word: str) -> str:
        """Prevents robotic textbook stiffness by keeping Wasl natural."""
        # Keep Ta Marbouta clear in mid-sentence (pronounced as Taa when connected)
        if clean_word in ("هذه", "هذا", "إلى", "على", "ذهبت"):
            return vocalized
        # Replace heavy Damma/Kasra tanween in fast conversational flow with light single vowel
        vocalized = vocalized.replace("ٌ", "ُ").replace("ٍ", "ِ")
        return vocalized