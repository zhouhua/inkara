"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import BookOpen from "reicon-react/icons/BookOpen";
import Eraser from "reicon-react/icons/Eraser";
import Export from "reicon-react/icons/Export";
import PenNib from "reicon-react/icons/PenNib";
import Setting from "reicon-react/icons/Setting";
import Text from "reicon-react/icons/Text";
import { HistoryPanel } from "@/components/HistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { askPageStream } from "@/lib/ask-stream";
import { hydrateDb } from "@/lib/db";
import { exportPaperPng } from "@/lib/export-page";
import { t } from "@/lib/i18n";
import {
  charRevealDelay,
  drawInkChar,
  fadeInkIntoPaper,
  layoutReplyChars,
  prefersReducedMotion,
  quoteTopCssPx,
  sleep,
} from "@/lib/ink-motion";
import {
  appendMemory,
  clearMemory,
  hydrateMemory,
  recentContext,
  type MemoryPage,
} from "@/lib/memory";
import { getPaperStyle } from "@/lib/paper";
import {
  canUseFreeAsk,
  hydrateQuota,
  recordFreeAsk,
  usesFreeQuota,
} from "@/lib/quota";
import {
  extractRecallNeedle,
  findMemoryByQuery,
  looksLikeRecall,
} from "@/lib/recall";
import {
  defaultSettings,
  hasUserApiKey,
  hydrateSettings,
  idleMsFor,
  saveSettings,
  type AppSettings,
  type InputMode,
} from "@/lib/settings";
import {
  drawStroke,
  pointerToPoint,
  redrawAll,
  wrapText,
  type Point,
  type Stroke,
} from "@/lib/strokes";

type Phase =
  | "ready"
  | "writing"
  | "fading"
  | "thinking"
  | "confirming"
  | "answering"
  | "recalling"
  | "error";

const INK = "#1c2233";
const REPLY_INK = "#2a3145";
const DOUBLE_TAP_MS = 380;

const SSR_SETTINGS: AppSettings = { ...defaultSettings };

export function InkPage() {
  const inkRef = useRef<HTMLCanvasElement>(null);
  const replyRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLTextAreaElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const typedTextRef = useRef("");
  const dprRef = useRef(1);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRafRef = useRef<number | null>(null);
  const idleStartedAtRef = useRef(0);
  const idleDurationRef = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const settingsRef = useRef<AppSettings>(SSR_SETTINGS);

  const abortRef = useRef<AbortController | null>(null);
  const animSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const recallingRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const lastCommitRef = useRef<{
    image: string;
    typedSnapshot: string;
  } | null>(null);
  const commitFnRef = useRef<() => Promise<void>>(async () => {});

  const [phase, setPhase] = useState<Phase>("ready");
  const [inputMode, setInputMode] = useState<InputMode>("pen");
  const [typedText, setTypedText] = useState("");
  const [readAsText, setReadAsText] = useState<string | null>(null);
  const [readAsTopPx, setReadAsTopPx] = useState<number | null>(null);
  const [idleProgress, setIdleProgress] = useState(0);
  const [idleArmed, setIdleArmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(SSR_SETTINGS);
  const [, setMemoryCount] = useState(0);
  const [statusExtra, setStatusExtra] = useState<string | null>(null);
  const [pageToolsVisible, setPageToolsVisible] = useState(false);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateDb();
      const nextSettings = await hydrateSettings();
      const pages = await hydrateMemory();
      await hydrateQuota();
      if (cancelled) return;
      setSettings(nextSettings);
      setMemoryCount(pages.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    typedTextRef.current = typedText;
  }, [typedText]);

  useEffect(() => {
    document.documentElement.lang = settings.locale === "zh" ? "zh-CN" : "en";
  }, [settings.locale]);

  useEffect(() => {
    if (inputMode === "type" && !settingsOpen) {
      typeRef.current?.focus();
    }
  }, [inputMode, settingsOpen]);

  const resizeCanvases = useCallback(() => {
    const wrap = wrapRef.current;
    const ink = inkRef.current;
    const reply = replyRef.current;
    if (!wrap || !ink || !reply) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;

    for (const c of [ink, reply]) {
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }

    const ctx = ink.getContext("2d");
    if (ctx) {
      redrawAll(ctx, strokesRef.current, ink.width, ink.height, dpr);
    }
  }, []);

  useEffect(() => {
    resizeCanvases();
    const onResize = () => resizeCanvases();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvases]);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (idleRafRef.current != null) {
      cancelAnimationFrame(idleRafRef.current);
      idleRafRef.current = null;
    }
    idleStartedAtRef.current = 0;
    idleDurationRef.current = 0;
    setIdleProgress(0);
    setIdleArmed(false);
  }, []);

  const hasPenInk = useCallback(() => {
    return strokesRef.current.some((s) => !s.erase && s.points.length > 0);
  }, []);

  const hasContent = useCallback(() => {
    return hasPenInk() || typedTextRef.current.trim().length > 0;
  }, [hasPenInk]);

  const clearReplyLayer = useCallback(() => {
    const reply = replyRef.current;
    reply?.getContext("2d")?.clearRect(0, 0, reply.width, reply.height);
  }, []);

  const clearReadAs = useCallback(() => {
    setReadAsText(null);
    setReadAsTopPx(null);
  }, []);

  const showReadAsQuote = useCallback((transcription: string) => {
    setReadAsText(transcription);
    // Before reply lands, park near mid-page; animateAnswer nudges it against the reply.
    const wrap = wrapRef.current;
    const h = wrap?.getBoundingClientRect().height ?? window.innerHeight;
    const quoteCssH = Math.min(
      72,
      18 + Math.ceil(transcription.length / 28) * 22
    );
    setReadAsTopPx(Math.max(72, h * 0.5 - quoteCssH - 8));
  }, []);

  const paintTypedOntoInk = useCallback(() => {
    const text = typedTextRef.current.trim();
    const ink = inkRef.current;
    if (!text || !ink) return;

    const ctx = ink.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    const padX = 56 * dpr;
    const padY = 72 * dpr;
    const maxWidth = ink.width - padX * 2;
    const fontSize = Math.max(26, Math.min(36, ink.width / 32));
    const rootStyle = getComputedStyle(document.documentElement);
    const uiZh = rootStyle.getPropertyValue("--font-ui-zh").trim();
    const uiLatin = rootStyle.getPropertyValue("--font-ui-latin").trim();
    ctx.save();
    ctx.font = `${fontSize}px ${uiZh || "Noto Sans SC"}, ${uiLatin || "sans-serif"}`;
    ctx.fillStyle = INK;
    ctx.textBaseline = "top";

    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontSize * 1.65;
    let y = padY;
    for (const line of lines) {
      ctx.fillText(line, padX, y);
      y += lineHeight;
      if (y > ink.height - padY) break;
    }
    ctx.restore();
  }, []);

  const prepareReplyCtx = useCallback(() => {
    const canvas = replyRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const dpr = dprRef.current;
    const padX = 48 * dpr;
    const padY = 72 * dpr;
    const maxWidth = canvas.width - padX * 2;
    const fontSize = Math.max(28, Math.min(42, canvas.width / 28));
    const rootStyle = getComputedStyle(document.documentElement);
    const handZh =
      rootStyle.getPropertyValue("--font-hand-zh").trim() || "Ma Shan Zheng";
    const handEn =
      rootStyle.getPropertyValue("--font-hand-en").trim() || "Alex Brush";
    const font = `${fontSize}px ${handZh}, ${handEn}, cursive`;
    ctx.font = font;
    ctx.fillStyle = REPLY_INK;
    ctx.textBaseline = "top";

    return {
      canvas,
      ctx,
      dpr,
      padX,
      padY,
      maxWidth,
      fontSize,
      font,
      lineHeight: fontSize * 1.55,
    };
  }, []);

  const writePaperMessage = useCallback(
    (msg: string) => {
      const prep = prepareReplyCtx();
      if (!prep) return;
      const { canvas, ctx, padX, padY, maxWidth, lineHeight, fontSize } = prep;
      const locale = settingsRef.current.locale;
      const hint = t(locale, "retryHint");

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = REPLY_INK;
      ctx.globalAlpha = 0.55;
      ctx.font = `${fontSize}px ${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--font-hand-zh")
          .trim() || "Ma Shan Zheng"
      }, cursive`;
      ctx.textBaseline = "top";

      const msgLines = wrapText(ctx, msg, maxWidth);
      const hintSize = Math.max(18, fontSize * 0.55);
      ctx.font = `${hintSize}px ${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--font-ui-zh")
          .trim() || "Noto Sans SC"
      }, sans-serif`;
      const hintLines = wrapText(ctx, hint, maxWidth);

      const blockHeight =
        msgLines.length * lineHeight +
        lineHeight * 0.35 +
        hintLines.length * hintSize * 1.45;
      let y = Math.max(padY, (canvas.height - blockHeight) / 2);
      if (y + blockHeight > canvas.height - padY) {
        y = Math.max(padY, canvas.height - padY - blockHeight);
      }

      ctx.font = `${fontSize}px ${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--font-hand-zh")
          .trim() || "Ma Shan Zheng"
      }, cursive`;
      for (const line of msgLines) {
        ctx.fillText(line, padX, y);
        y += lineHeight;
      }
      y += lineHeight * 0.35;
      ctx.globalAlpha = 0.38;
      ctx.font = `${hintSize}px ${
        getComputedStyle(document.documentElement)
          .getPropertyValue("--font-ui-zh")
          .trim() || "Noto Sans SC"
      }, sans-serif`;
      for (const line of hintLines) {
        ctx.fillText(line, padX, y);
        y += hintSize * 1.45;
      }
      ctx.restore();
    },
    [prepareReplyCtx]
  );

  const animateRecallPage = useCallback(
    async (page: MemoryPage, signal: { cancelled: boolean }) => {
      const prep = prepareReplyCtx();
      if (!prep) return;
      const { canvas, ctx, padX, padY, maxWidth, fontSize, dpr, lineHeight } =
        prep;
      const locale = settingsRef.current.locale;
      const reduced = prefersReducedMotion();
      const duration = reduced ? 0 : 900;
      const drift = 22 * dpr;

      const dateStr = new Date(page.createdAt).toLocaleString(
        locale === "zh" ? "zh-CN" : "en-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

      const blocks: { label: string; body: string }[] = [
        { label: "", body: dateStr },
        {
          label: t(locale, "historyYou"),
          body: page.transcription || t(locale, "historyUnread"),
        },
        { label: t(locale, "historyPage"), body: page.reply },
      ];

      const measureBlockHeight = () => {
        let h = 0;
        for (const block of blocks) {
          if (block.label) {
            const labelSize = Math.max(16, fontSize * 0.48);
            h += labelSize * 1.5;
          }
          ctx.font = `${fontSize * (block.label ? 0.85 : 0.55)}px ${
            getComputedStyle(document.documentElement)
              .getPropertyValue("--font-hand-zh")
              .trim() || "Ma Shan Zheng"
          }, cursive`;
          const lh = block.label ? lineHeight * 0.9 : fontSize * 0.9;
          const lines = wrapText(ctx, block.body, maxWidth);
          h += lines.length * lh + lineHeight * 0.45;
        }
        return h;
      };

      const blockHeight = measureBlockHeight();
      const baseY = Math.max(
        padY,
        Math.min(
          (canvas.height - blockHeight) / 2,
          canvas.height - padY - blockHeight
        )
      );

      const paint = (offsetY: number, alpha: number) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = REPLY_INK;
        ctx.textBaseline = "top";

        let y = baseY + offsetY;
        for (const block of blocks) {
          if (y > canvas.height - padY) break;
          if (block.label) {
            const labelSize = Math.max(16, fontSize * 0.48);
            ctx.font = `${labelSize}px ${
              getComputedStyle(document.documentElement)
                .getPropertyValue("--font-ui-zh")
                .trim() || "Noto Sans SC"
            }, sans-serif`;
            ctx.fillText(block.label, padX, y);
            y += labelSize * 1.5;
          }
          ctx.font = `${fontSize * (block.label ? 0.85 : 0.55)}px ${
            getComputedStyle(document.documentElement)
              .getPropertyValue("--font-hand-zh")
              .trim() || "Ma Shan Zheng"
          }, cursive`;
          const lh = block.label ? lineHeight * 0.9 : fontSize * 0.9;
          const lines = wrapText(ctx, block.body, maxWidth);
          for (const line of lines) {
            if (y > canvas.height - padY) break;
            ctx.fillText(line, padX, y);
            y += lh;
          }
          y += lineHeight * 0.45;
        }
        ctx.restore();
      };

      if (duration === 0) {
        paint(0, 0.45);
        return;
      }

      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (signal.cancelled) {
            resolve();
            return;
          }
          const p = Math.min(1, (now - start) / duration);
          const ease = 1 - (1 - p) * (1 - p);
          paint(drift * (1 - ease), 0.45 * Math.min(1, ease * 1.15));
          if (p < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    },
    [prepareReplyCtx]
  );

  /** Hand-ink glyph reveal — skeleton thinning is unusable on CJK brush fonts. */
  const animateAnswer = useCallback(
    async (text: string, signal: { cancelled: boolean }) => {
      if (!text.trim()) return;
      const reduced = prefersReducedMotion();
      const prep0 = prepareReplyCtx();
      if (!prep0) return;
      prep0.ctx.clearRect(0, 0, prep0.canvas.width, prep0.canvas.height);

      const dpr0 = prep0.dpr;
      // Keep quote + reply as one centered stack with a tight gap
      const quoteCssH = readAsText
        ? Math.min(72, 18 + Math.ceil(readAsText.length / 28) * 22)
        : 0;
      const gapCss = 12;
      const reserveAbove = readAsText
        ? (quoteCssH + gapCss) * dpr0
        : 0;

      const layoutOnce = () => {
        const prep = prepareReplyCtx();
        if (!prep) return null;
        const { canvas, ctx, dpr, padX, padY, maxWidth, lineHeight } = prep;
        const chars = layoutReplyChars(ctx, text, {
          padX,
          padY,
          maxWidth,
          lineHeight,
          canvasHeight: canvas.height,
          align: "center",
          reserveAbove,
        });
        if (chars.length > 0 && readAsText) {
          setReadAsTopPx(quoteTopCssPx(chars[0].y, dpr, quoteCssH, gapCss));
        }
        return { canvas, ctx, dpr, chars };
      };

      const first = layoutOnce();
      if (!first) return;

      let painted = 0;

      while (painted < first.chars.length) {
        if (signal.cancelled) return;
        const frame = layoutOnce();
        if (!frame) return;
        const { canvas, ctx, dpr, chars } = frame;

        if (painted >= chars.length) break;

        if (reduced) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const { ch, x, y } of chars) {
            drawInkChar(ctx, ch, x, y, dpr, 1);
          }
          return;
        }

        const i = painted;
        const { ch, x, y } = chars[i];
        for (const progress of [0.35, 0.7, 1] as const) {
          if (signal.cancelled) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (let j = 0; j < i; j++) {
            drawInkChar(ctx, chars[j].ch, chars[j].x, chars[j].y, dpr, 1);
          }
          drawInkChar(ctx, ch, x, y, dpr, progress);
          await sleep(18);
        }
        painted = i + 1;
        await sleep(charRevealDelay(ch, reduced));
      }
    },
    [prepareReplyCtx, readAsText]
  );

  const resetToReady = useCallback(() => {
    clearReplyLayer();
    recallingRef.current = false;
    setStatusExtra(null);
    setPageToolsVisible(false);
    setPhaseBoth("ready");
  }, [clearReplyLayer, setPhaseBoth]);

  const runAsk = useCallback(
    async (image: string, typedSnapshot: string) => {
      const locale = settingsRef.current.locale;
      const showReadAs = settingsRef.current.showReadAs;
      const animSignal = animSignalRef.current;

      setPhaseBoth("thinking");
      clearReplyLayer();

      const controller = new AbortController();
      abortRef.current = controller;

      let buffered = "";

      try {
        if (!navigator.onLine) {
          throw Object.assign(new Error(t(locale, "offline")), {
            error: "offline",
          });
        }

        const currentSettings = settingsRef.current;
        const freePath = usesFreeQuota(currentSettings);
        if (freePath && !canUseFreeAsk()) {
          throw Object.assign(new Error(t(locale, "quotaExceeded")), {
            error: "quota_exceeded",
          });
        }

        const memory = recentContext();
        const byok = hasUserApiKey(currentSettings);
        const result = await askPageStream(
          {
            image,
            locale,
            memory,
            typedText: typedSnapshot || undefined,
            ...(byok
              ? {
                  apiKey: currentSettings.apiKey.trim(),
                  baseUrl: currentSettings.baseUrl.trim() || undefined,
                  model: currentSettings.model.trim() || undefined,
                }
              : {}),
          },
          {
            onDelta: (text) => {
              buffered += text;
            },
            onMeta: (transcription) => {
              if (
                showReadAs &&
                transcription &&
                phaseRef.current === "thinking"
              ) {
                showReadAsQuote(transcription);
              }
            },
          },
          { signal: controller.signal }
        );

        if (animSignal.cancelled || controller.signal.aborted) {
          resetToReady();
          return;
        }

        if (freePath) {
          void recordFreeAsk();
        }

        const transcription =
          result.transcription || typedSnapshot || "";
        const finalReply = result.reply || buffered;
        const isRecall =
          result.intent === "recall" || looksLikeRecall(transcription);

        if (showReadAs && transcription) {
          showReadAsQuote(transcription);
        }

        if (animSignal.cancelled) {
          resetToReady();
          return;
        }

        if (isRecall) {
          const query =
            result.recallQuery ||
            extractRecallNeedle(transcription) ||
            transcription;
          const page = findMemoryByQuery(query);
          if (!page) {
            writePaperMessage(t(locale, "recallMiss"));
            setStatusExtra(null);
            setPhaseBoth("error");
            return;
          }

          setPhaseBoth("recalling");
          clearReplyLayer();
          await animateRecallPage(page, animSignal);
          if (animSignal.cancelled) {
            resetToReady();
            return;
          }
          recallingRef.current = true;
          setPhaseBoth("ready");
          return;
        }

        setPhaseBoth("answering");
        clearReplyLayer();
        await animateAnswer(finalReply, animSignal);
        if (animSignal.cancelled) {
          resetToReady();
          return;
        }

        const pages = appendMemory({
          transcription,
          reply: finalReply,
        });
        setMemoryCount(pages.length);
        setPageToolsVisible(true);
        setPhaseBoth("ready");
      } catch (e) {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError") ||
          animSignal.cancelled
        ) {
          resetToReady();
          return;
        }

        const err = e as { error?: string; message?: string };
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        const msg = offline
          ? t(locale, "offline")
          : err.error === "quota_exceeded"
            ? t(locale, "quotaExceeded")
            : err.error === "missing_api_key"
              ? t(locale, "missingKey")
              : err.message ||
                (e instanceof Error ? e.message : t(locale, "error"));

        writePaperMessage(msg);
        setStatusExtra(null);
        setPhaseBoth("error");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [
      animateAnswer,
      animateRecallPage,
      clearReplyLayer,
      resetToReady,
      setPhaseBoth,
      showReadAsQuote,
      writePaperMessage,
    ]
  );

  const commitPage = useCallback(async () => {
    if (phaseRef.current !== "writing" && phaseRef.current !== "ready") return;
    if (!hasContent()) {
      setPhaseBoth("ready");
      return;
    }

    clearIdle();
    const ink = inkRef.current;
    if (!ink) return;

    abortRef.current?.abort();
    animSignalRef.current.cancelled = true;
    animSignalRef.current = { cancelled: false };

    // One ink per page: keep only the active medium (mutex safety net).
    if (inputMode === "pen") {
      setTypedText("");
      typedTextRef.current = "";
    } else {
      strokesRef.current = [];
      currentRef.current = null;
      ink.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    }

    const typedSnapshot = typedTextRef.current.trim();
    setPhaseBoth("fading");
    setPageToolsVisible(false);
    clearReadAs();
    setStatusExtra(null);
    recallingRef.current = false;

    paintTypedOntoInk();
    setTypedText("");
    typedTextRef.current = "";
    const image = ink.toDataURL("image/png");
    lastCommitRef.current = { image, typedSnapshot };

    await fadeInkIntoPaper(ink, { signal: animSignalRef.current });
    strokesRef.current = [];

    if (animSignalRef.current.cancelled) {
      resetToReady();
      return;
    }

    await runAsk(image, typedSnapshot);
  }, [
    clearIdle,
    clearReadAs,
    hasContent,
    inputMode,
    paintTypedOntoInk,
    resetToReady,
    runAsk,
    setPhaseBoth,
  ]);

  useEffect(() => {
    commitFnRef.current = commitPage;
  }, [commitPage]);

  const retryLastCommit = useCallback(async () => {
    const last = lastCommitRef.current;
    if (!last) {
      resetToReady();
      return;
    }

    clearIdle();
    abortRef.current?.abort();
    animSignalRef.current.cancelled = true;
    animSignalRef.current = { cancelled: false };
    recallingRef.current = false;
    setStatusExtra(null);
    clearReplyLayer();

    await runAsk(last.image, last.typedSnapshot);
  }, [clearIdle, clearReplyLayer, resetToReady, runAsk]);

  const scheduleIdle = useCallback(() => {
    if (settingsRef.current.submitMode !== "auto") {
      clearIdle();
      return;
    }
    clearIdle();
    const ms = idleMsFor(settingsRef.current);
    idleStartedAtRef.current = performance.now();
    idleDurationRef.current = ms;
    setIdleProgress(0);
    setIdleArmed(true);

    const tick = () => {
      const started = idleStartedAtRef.current;
      const duration = idleDurationRef.current;
      if (!started || !duration) return;
      const p = Math.min(1, (performance.now() - started) / duration);
      setIdleProgress(p);
      if (p < 1 && idleTimerRef.current) {
        idleRafRef.current = requestAnimationFrame(tick);
      }
    };
    idleRafRef.current = requestAnimationFrame(tick);

    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (idleRafRef.current != null) {
        cancelAnimationFrame(idleRafRef.current);
        idleRafRef.current = null;
      }
      setIdleProgress(1);
      void commitFnRef.current();
    }, ms);
  }, [clearIdle]);

  const getInkCtx = () => inkRef.current?.getContext("2d") ?? null;

  const dismissRecall = useCallback(() => {
    recallingRef.current = false;
    clearReplyLayer();
    setPhaseBoth("ready");
  }, [clearReplyLayer, setPhaseBoth]);

  const handlePaperPointer = useCallback(() => {
    const p = phaseRef.current;
    if (p === "recalling" || recallingRef.current) {
      dismissRecall();
      return true;
    }
    if (p === "error") {
      void retryLastCommit();
      return true;
    }
    return false;
  }, [dismissRecall, retryLastCommit]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (handlePaperPointer()) return;

    if (inputMode !== "pen") return;
    if (
      phaseRef.current === "fading" ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "confirming" ||
      phaseRef.current === "recalling"
    ) {
      return;
    }

    const now = performance.now();
    const isDouble =
      now - lastTapAtRef.current < DOUBLE_TAP_MS &&
      (phaseRef.current === "writing" || phaseRef.current === "ready") &&
      hasContent();
    lastTapAtRef.current = now;

    if (isDouble) {
      lastTapAtRef.current = 0;
      clearIdle();
      void commitPage();
      return;
    }

    clearReplyLayer();
    clearReadAs();

    const canvas = inkRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const stroke: Stroke = {
      points: [pointerToPoint(e, rect, dprRef.current)],
      color: INK,
      erase: false,
    };
    currentRef.current = stroke;
    strokesRef.current.push(stroke);

    const ctx = getInkCtx();
    if (ctx) drawStroke(ctx, stroke, dprRef.current);

    setPhaseBoth("writing");
    setPageToolsVisible(false);
    clearIdle();
    setStatusExtra(null);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (inputMode !== "pen") return;
    const stroke = currentRef.current;
    const canvas = inkRef.current;
    if (!stroke || !canvas || e.buttons === 0) return;

    const rect = canvas.getBoundingClientRect();
    const point: Point = pointerToPoint(e, rect, dprRef.current);
    stroke.points.push(point);

    const ctx = getInkCtx();
    if (!ctx || stroke.points.length < 2) return;

    const ink = inkRef.current;
    if (!ink) return;
    redrawAll(ctx, strokesRef.current, ink.width, ink.height, dprRef.current);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (inputMode !== "pen") return;
    currentRef.current = null;
    try {
      inkRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (
      phaseRef.current === "fading" ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "confirming" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling" ||
      phaseRef.current === "error"
    ) {
      return;
    }
    if (hasContent()) {
      setPhaseBoth("writing");
      setPageToolsVisible(false);
      scheduleIdle();
    } else {
      setPhaseBoth("ready");
    }
  };

  const onTypedChange = (value: string) => {
    if (
      phaseRef.current === "fading" ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling"
    ) {
      return;
    }
    clearReplyLayer();
    clearReadAs();
    setTypedText(value);
    typedTextRef.current = value;
    setStatusExtra(null);
    if (value.trim()) {
      setPhaseBoth("writing");
      setPageToolsVisible(false);
      scheduleIdle();
    } else {
      clearIdle();
      if (!hasPenInk()) setPhaseBoth("ready");
    }
  };

  const onTypeKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (
      phaseRef.current !== "writing" &&
      phaseRef.current !== "ready"
    ) {
      return;
    }
    if (!typedTextRef.current.trim() && !hasPenInk()) return;
    e.preventDefault();
    clearIdle();
    void commitPage();
  };

  const switchMode = (mode: InputMode) => {
    if (
      phaseRef.current === "fading" ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "confirming" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling"
    ) {
      return;
    }
    if (mode === inputMode) return;

    clearIdle();

    // Hard mutex: one ink per page — drop the other medium on switch.
    if (mode === "pen") {
      setTypedText("");
      typedTextRef.current = "";
    } else {
      strokesRef.current = [];
      currentRef.current = null;
      const ink = inkRef.current;
      ink?.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    }

    setInputMode(mode);

    const stillWriting =
      mode === "pen"
        ? strokesRef.current.some((s) => !s.erase && s.points.length > 0)
        : typedTextRef.current.trim().length > 0;
    setPhaseBoth(stillWriting ? "writing" : "ready");
  };

  const clearPage = () => {
    clearIdle();
    setPageToolsVisible(false);
    animSignalRef.current.cancelled = true;
    animSignalRef.current = { cancelled: true };
    abortRef.current?.abort();
    abortRef.current = null;
    recallingRef.current = false;
    strokesRef.current = [];
    currentRef.current = null;
    setTypedText("");
    typedTextRef.current = "";
    clearReadAs();
    const ink = inkRef.current;
    const reply = replyRef.current;
    ink?.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    reply?.getContext("2d")?.clearRect(0, 0, reply.width, reply.height);
    setStatusExtra(null);
    setPhaseBoth("ready");
  };

  const onExport = () => {
    const wrap = wrapRef.current;
    const ink = inkRef.current;
    const reply = replyRef.current;
    if (!wrap || !ink || !reply) return;
    void exportPaperPng({ wrap, ink, reply });
  };

  const busy =
    phase === "fading" ||
    phase === "thinking" ||
    phase === "answering" ||
    phase === "recalling";

  const onPaperDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (busy || settingsOpen || historyOpen) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, select, input, .settings-sheet, .history-panel, .paper-chrome"
      )
    ) {
      return;
    }

    const tryCommit = () => {
      if (
        (phaseRef.current === "ready" || phaseRef.current === "writing") &&
        hasContent()
      ) {
        clearIdle();
        void commitPage();
      }
    };

    // Textarea: ignore word-select double-clicks (non-empty selection)
    if (target?.closest("textarea")) {
      window.setTimeout(() => {
        const sel = window.getSelection()?.toString() ?? "";
        const ta = typeRef.current;
        const taSel =
          ta && ta.selectionStart !== ta.selectionEnd
            ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
            : "";
        if (sel || taSel) return;
        tryCommit();
      }, 0);
      return;
    }

    tryCommit();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (settingsOpen || historyOpen) return;
      if (phaseRef.current !== "ready" && phaseRef.current !== "writing") {
        return;
      }
      if (!hasContent()) return;

      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      // Textarea already handles Enter via onTypeKeyDown — avoid double commit
      if (tag === "TEXTAREA") return;
      if (inputMode === "type" && document.activeElement === typeRef.current) {
        return;
      }

      e.preventDefault();
      clearIdle();
      void commitPage();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearIdle,
    commitPage,
    hasContent,
    historyOpen,
    inputMode,
    settingsOpen,
  ]);

  const paperInteractive = phase === "recalling" || phase === "error";

  const isBusyPhase =
    phase === "fading" ||
    phase === "thinking" ||
    phase === "answering" ||
    phase === "recalling" ||
    phase === "error";

  const contentPresent = typedText.trim().length > 0 || phase === "writing";

  const manualSubmitHint = (() => {
    const base = t(settings.locale, "submitHintManual");
    return inputMode === "type"
      ? `${base} · ${t(settings.locale, "submitHintTypeExtra")}`
      : base;
  })();

  /** Auto-delay ring: visible whenever there is content waiting to send */
  const showIdleRing =
    settings.submitMode === "auto" &&
    contentPresent &&
    (phase === "writing" || phase === "ready");

  const dockHint = (() => {
    if (statusExtra) return statusExtra;
    if (isBusyPhase) {
      switch (phase) {
        case "fading":
          return t(settings.locale, "fading");
        case "thinking":
          return t(settings.locale, "thinking");
        case "answering":
          return t(settings.locale, "answering");
        case "recalling":
          return t(settings.locale, "recalling");
        case "error":
          return t(settings.locale, "error");
        default:
          return "";
      }
    }
    if (phase !== "ready" && phase !== "writing") return "";

    if (settings.submitMode === "manual") {
      return manualSubmitHint;
    }

    // auto
    if (contentPresent) {
      return idleArmed
        ? t(settings.locale, "submitHintAuto")
        : t(settings.locale, "submitHintAutoWait");
    }
    return t(settings.locale, "submitHintAutoIdle");
  })();

  const statusClass = [
    "submit-hint",
    isBusyPhase ? "is-active" : "",
    phase === "thinking" ? "is-pulse" : "",
    phase === "error" || statusExtra ? "is-error" : "",
    !isBusyPhase && !contentPresent ? "is-soft" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const ringCircumference = 2 * Math.PI * 9;
  const ringProgress = showIdleRing && idleArmed ? idleProgress : 0;
  const ringOffset = ringCircumference * (1 - ringProgress);

  const paper = getPaperStyle(settings.paperStyle);

  return (
    <div
      ref={wrapRef}
      className={`paper-page phase-${phase}`}
      data-phase={phase}
      data-paper={settings.paperStyle}
      data-paper-kind={paper.kind}
      onDoubleClick={onPaperDoubleClick}
      style={
        paper.step
          ? ({ ["--paper-step" as string]: paper.step } as CSSProperties)
          : undefined
      }
    >
      <div className="paper-pattern" aria-hidden />

      {readAsText ? (
        <blockquote
          className="read-as-quote"
          style={
            readAsTopPx != null
              ? ({ top: readAsTopPx } as CSSProperties)
              : undefined
          }
        >
          {readAsText}
        </blockquote>
      ) : null}

      <canvas
        ref={replyRef}
        className="reply-layer"
        aria-hidden
        style={paperInteractive ? { pointerEvents: "auto" } : undefined}
        onPointerDown={
          paperInteractive
            ? (e) => {
                e.preventDefault();
                handlePaperPointer();
              }
            : undefined
        }
      />
      <canvas
        ref={inkRef}
        className={`ink-layer ${inputMode === "type" ? "is-passive" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <textarea
        ref={typeRef}
        className={`type-layer ${inputMode === "type" && !paperInteractive ? "is-active" : ""}`}
        value={typedText}
        onChange={(e) => onTypedChange(e.target.value)}
        onKeyDown={onTypeKeyDown}
        disabled={busy || inputMode !== "type"}
        spellCheck={false}
        aria-label={t(settings.locale, "modeType")}
        aria-hidden={inputMode !== "type"}
        style={paperInteractive ? { pointerEvents: "none" } : undefined}
      />

      <header className="paper-chrome">
        <div className="brand-mark">
          <p className="brand-zh">{t(settings.locale, "brand")}</p>
          <p className="brand-en">{t(settings.locale, "brandEn")}</p>
        </div>
        <nav
          className="paper-actions"
          aria-label={t(settings.locale, "settings")}
        >
          <div
            className="mode-switch"
            role="radiogroup"
            aria-label={`${t(settings.locale, "modePen")} / ${t(settings.locale, "modeType")}`}
          >
            <button
              type="button"
              role="radio"
              className={`mode-switch-btn ${inputMode === "pen" ? "is-on" : ""}`}
              onClick={() => switchMode("pen")}
              aria-checked={inputMode === "pen"}
              aria-label={t(settings.locale, "modePen")}
              title={t(settings.locale, "modePen")}
              disabled={busy}
            >
              <PenNib size={15} aria-hidden />
            </button>
            <button
              type="button"
              role="radio"
              className={`mode-switch-btn ${inputMode === "type" ? "is-on" : ""}`}
              onClick={() => switchMode("type")}
              aria-checked={inputMode === "type"}
              aria-label={t(settings.locale, "modeType")}
              title={t(settings.locale, "modeType")}
              disabled={busy}
            >
              <Text size={15} aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={() => setHistoryOpen(true)}
            aria-label={t(settings.locale, "history")}
            title={t(settings.locale, "history")}
            disabled={busy}
          >
            <BookOpen size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label={t(settings.locale, "settings")}
            title={t(settings.locale, "settings")}
          >
            <Setting size={16} aria-hidden />
          </button>
        </nav>
      </header>

      <div className="status-dock submit-dock">
        <div className="submit-dock-main">
          {showIdleRing ? (
            <svg
              className="idle-ring"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle
                className="idle-ring-track"
                cx="12"
                cy="12"
                r="9"
                fill="none"
              />
              <circle
                className="idle-ring-progress"
                cx="12"
                cy="12"
                r="9"
                fill="none"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 12 12)"
              />
            </svg>
          ) : null}
          {dockHint ? <p className={statusClass}>{dockHint}</p> : null}
        </div>
        <div
          className={`submit-dock-tools ${pageToolsVisible ? "is-visible" : ""}`}
          aria-hidden={!pageToolsVisible}
        >
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={clearPage}
            aria-label={t(settings.locale, "clearPage")}
            title={t(settings.locale, "clearPage")}
            tabIndex={pageToolsVisible ? 0 : -1}
          >
            <Eraser size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={onExport}
            aria-label={t(settings.locale, "exportPage")}
            title={t(settings.locale, "exportPage")}
            tabIndex={pageToolsVisible ? 0 : -1}
          >
            <Export size={16} aria-hidden />
          </button>
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={(next) => {
          setSettings(next);
          saveSettings(next);
        }}
        onClearMemory={() => {
          clearMemory();
          setMemoryCount(0);
        }}
      />

      <HistoryPanel
        open={historyOpen}
        locale={settings.locale}
        onClose={() => setHistoryOpen(false)}
        onMemoryChange={setMemoryCount}
      />
    </div>
  );
}
