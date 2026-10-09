export type VoiceSession = {
  prefix: string;
  suffix: string;
  text: string;
};

export function beginVoiceSession(full: string, caret: number): VoiceSession {
  const start = Math.max(0, Math.min(caret, full.length));
  return {
    prefix: full.slice(0, start),
    suffix: full.slice(start),
    text: "",
  };
}

export function voiceSessionFull(s: VoiceSession): string {
  return s.prefix + s.text + s.suffix;
}

export function setVoiceSessionText(
  s: VoiceSession,
  text: string
): VoiceSession {
  return { ...s, text };
}
