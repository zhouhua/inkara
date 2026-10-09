const PCM_TARGET_RATE = 16_000;
/** 100ms at 16 kHz. */
const PCM_FRAME_SAMPLES = 1_600;
const WORKLET_NAME = "ink-pcm-v1";

const PCM_WORKLET_SOURCE = `
class InkPcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor(${JSON.stringify(WORKLET_NAME)}, InkPcmProcessor);
`;

export function floatToInt16(sample: number): number {
  const x = Math.max(-1, Math.min(1, sample));
  return x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
}

export type PcmFramer = {
  push: (input: Float32Array) => void;
  /** Emit a short tail frame. Used when the mic stops before 100ms fills. */
  flush: () => void;
};

/**
 * Linear-resample mono float audio to 16 kHz and emit ~100ms Int16 frames.
 * Int16Array is little-endian on the platforms this app ships.
 */
export function createPcmFramer(
  inputRate: number,
  onFrame: (pcm: Int16Array) => void,
): PcmFramer {
  if (!(inputRate > 0) || !Number.isFinite(inputRate)) {
    throw new Error("bad_sample_rate");
  }
  const step = inputRate / PCM_TARGET_RATE;
  let cursor = 0;
  let consumed = 0;
  let prev = 0;
  let hasPrev = false;
  const frame = new Int16Array(PCM_FRAME_SAMPLES);
  let filled = 0;

  return {
    push(input: Float32Array) {
      if (input.length === 0) return;
      const start = consumed;
      const end = consumed + input.length;
      while (cursor < end) {
        const idx = cursor - start;
        const i0 = Math.floor(idx);
        const frac = idx - i0;
        const i1 = i0 + 1;
        if (frac !== 0 && i1 >= input.length) break;
        const s0 = i0 >= 0 ? input[i0]! : hasPrev ? prev : input[0]!;
        const s1 =
          frac === 0
            ? s0
            : i1 >= 0
              ? input[i1]!
              : hasPrev
                ? prev
                : s0;
        frame[filled++] = floatToInt16(s0 + (s1 - s0) * frac);
        if (filled === PCM_FRAME_SAMPLES) {
          onFrame(frame.slice());
          filled = 0;
        }
        cursor += step;
      }
      prev = input[input.length - 1] ?? prev;
      hasPrev = true;
      consumed = end;
    },
    flush() {
      if (filled === 0) return;
      onFrame(frame.slice(0, filled));
      filled = 0;
    },
  };
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  if (typeof window.AudioContext === "function") return window.AudioContext;
  const legacy = (
    window as Window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
  return typeof legacy === "function" ? legacy : null;
}

function disconnectQuiet(node: { disconnect: () => void } | null) {
  try {
    node?.disconnect();
  } catch {
    /* already disconnected */
  }
}

async function connectWorklet(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  mute: GainNode,
  isStopped: () => boolean,
  framer: PcmFramer,
): Promise<{ disconnect: () => void } | null> {
  if (typeof ctx.audioWorklet?.addModule !== "function") return null;
  let url: string | null = null;
  let node: AudioWorkletNode | null = null;
  try {
    url = URL.createObjectURL(
      new Blob([PCM_WORKLET_SOURCE], { type: "application/javascript" }),
    );
    await ctx.audioWorklet.addModule(url);
    node = new AudioWorkletNode(ctx, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    node.port.onmessage = (event: MessageEvent) => {
      if (isStopped()) return;
      const data = event.data;
      if (data instanceof Float32Array && data.length > 0) framer.push(data);
    };
    source.connect(node);
    node.connect(mute);
    const worklet = node;
    return {
      disconnect() {
        worklet.port.onmessage = null;
        disconnectQuiet(worklet);
      },
    };
  } catch {
    try {
      if (node) source.disconnect(node);
    } catch {
      /* not connected */
    }
    disconnectQuiet(node);
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function connectScriptProcessor(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  mute: GainNode,
  isStopped: () => boolean,
  framer: PcmFramer,
): { disconnect: () => void } | null {
  const factory = (
    ctx as AudioContext & {
      createScriptProcessor?: (
        bufferSize?: number,
        numberOfInputChannels?: number,
        numberOfOutputChannels?: number,
      ) => ScriptProcessorNode;
    }
  ).createScriptProcessor;
  if (typeof factory !== "function") return null;
  const processor = factory.call(ctx, 2048, 1, 1);
  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (isStopped()) return;
    framer.push(event.inputBuffer.getChannelData(0));
  };
  source.connect(processor);
  processor.connect(mute);
  return {
    disconnect() {
      processor.onaudioprocess = null;
      disconnectQuiet(processor);
    },
  };
}

export async function createMicPcmStream(
  onFrame: (pcm: Int16Array) => void,
): Promise<{ stop: () => void }> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.getUserMedia !== "function"
  ) {
    throw new Error("mic_unsupported");
  }
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error("mic_unsupported");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let ctx: AudioContext | null = null;
  try {
    try {
      ctx = new Ctor({ sampleRate: PCM_TARGET_RATE });
    } catch {
      ctx = new Ctor();
    }
    await ctx.resume().catch(() => undefined);

    let stopped = false;
    const audioCtx = ctx;
    const framer = createPcmFramer(audioCtx.sampleRate, (pcm) => {
      if (!stopped) onFrame(pcm);
    });
    const source = audioCtx.createMediaStreamSource(stream);
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    mute.connect(audioCtx.destination);

    const stopStream = () => {
      for (const track of stream.getTracks()) track.stop();
      void audioCtx.close().catch(() => undefined);
    };
    const isStopped = () => stopped;

    const worklet = await connectWorklet(
      audioCtx,
      source,
      mute,
      isStopped,
      framer,
    );
    const processor = worklet
      ? null
      : connectScriptProcessor(audioCtx, source, mute, isStopped, framer);
    if (!worklet && !processor) throw new Error("mic_unsupported");

    return {
      stop() {
        if (stopped) return;
        framer.flush();
        stopped = true;
        worklet?.disconnect();
        processor?.disconnect();
        disconnectQuiet(source);
        disconnectQuiet(mute);
        stopStream();
      },
    };
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    if (ctx) void ctx.close().catch(() => undefined);
    throw err;
  }
}
