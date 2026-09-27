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
import { flushSync } from "react-dom";
import BookOpen from "reicon-react/icons/BookOpen";
import Export from "reicon-react/icons/Export";
import HelpCircle from "reicon-react/icons/HelpCircle";
import PenNib from "reicon-react/icons/PenNib";
import Redo from "reicon-react/icons/Redo";
import Setting from "reicon-react/icons/Setting";
import Text from "reicon-react/icons/Text";
import Undo from "reicon-react/icons/Undo";
import { BrandMark } from "@/components/BrandMark";
import { HelpPanel } from "@/components/HelpPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { DockHints } from "@/components/DockHints";
import { RecallCiteLayer } from "@/components/RecallCiteLayer";
import { SettingsPanel } from "@/components/SettingsPanel";
import { askPageStream } from "@/lib/ask-stream";
import {
  resolvePaperError,
  type PaperErrorAction,
} from "@/lib/ask-errors";
import { hydrateDb, whenDbReady } from "@/lib/db";
import { collectDockHints } from "@/lib/dock-hints";
import {
  subscribeEmbeddingLoad,
  type EmbeddingLoadState,
} from "@/lib/embeddings";
import { exportPaperPng } from "@/lib/export-page";
import { t, type MessageKey } from "@/lib/i18n";
import {
  charRevealDelay,
  drawInkChar,
  fadeElementIntoPaper,
  fadeInReplyBlock,
  fadeInkIntoPaper,
  layoutReplyChars,
  prefersReducedMotion,
  quoteTopCssPx,
  sleep,
  smoothApproach,
} from "@/lib/ink-motion";
import {
  appendMemory,
  beginNewChapterSession,
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
  rankRecallCandidates,
  toRankCandidates,
} from "@/lib/recall-rank";
import {
  extractRecallNeedle,
  hybridRetrieve,
  looksLikeRecall,
} from "@/lib/recall";
import {
  orderPagesByRankedIds,
  pickRecallCitePages,
  stripCiteMarkers,
  toRecallCitePayloads,
} from "@/lib/recall-cite";
import {
  defaultSettings,
  hasUserApiKey,
  hydrateSettings,
  idleMsFor,
  loadSettings,
  patchSettings,
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
import {
  chromeClearanceCss,
  computeDialoguePark,
  measureDialogueCssBounds,
} from "@/lib/dialogue-layout";

type Phase =
  | "ready"
  | "writing"
  | "thinking"
  | "answering"
  | "recalling"
  | "error";

const INK = "#1c2233";
const REPLY_INK = "#2a3145";
const DOUBLE_TAP_MS = 380;
const DOUBLE_TAP_MAX_MOVE_CSS = 10;
const DOUBLE_TAP_MAX_DURATION_MS = 250;

const SSR_SETTINGS: AppSettings = { ...defaultSettings };

export function InkPage() {
  const inkRef = useRef<HTMLCanvasElement>(null);
  const replyRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLTextAreaElement>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const strokeRedoRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const typeUndoRef = useRef<string[]>([]);
  const typeRedoRef = useRef<string[]>([]);
  const applyingTypeHistoryRef = useRef(false);
  const [editHistory, setEditHistory] = useState({ undo: 0, redo: 0 });
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
  const lastTapArmedRef = useRef(false);
  const pointerDownRef = useRef<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const lastCommitRef = useRef<{
    image: string;
    typedSnapshot: string;
  } | null>(null);
  const commitFnRef = useRef<() => Promise<void>>(async () => {});
  const liveReplyRef = useRef("");
  const streamDoneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("ready");
  const [inputMode, setInputMode] = useState<InputMode>("pen");
  const [typedText, setTypedText] = useState("");
  const [readAsText, setReadAsText] = useState<string | null>(null);
  const [readAsTopPx, setReadAsTopPx] = useState<number | null>(null);
  const readAsTextRef = useRef<string | null>(null);
  const [idleProgress, setIdleProgress] = useState(0);
  const [idleArmed, setIdleArmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(SSR_SETTINGS);
  const settingsDirtyRef = useRef(false);
  const [dbReady, setDbReady] = useState(false);
  const dbReadyRef = useRef(false);
  const [, setMemoryCount] = useState(0);
  const [statusExtra, setStatusExtra] = useState<string | null>(null);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [hasDialogueBackground, setHasDialogueBackground] = useState(false);
  const [recallCite, setRecallCite] = useState<{
    reply: string;
    pages: MemoryPage[];
  } | null>(null);
  const [openCiteIndex, setOpenCiteIndex] = useState<number | null>(null);
  const [paperErrorAction, setPaperErrorAction] =
    useState<PaperErrorAction | null>(null);
  const [continueMotion, setContinueMotion] = useState(false);
  const [replyRising, setReplyRising] = useState(false);
  const [dialogueRisePx, setDialogueRisePx] = useState<number | null>(null);
  const [writingTopPx, setWritingTopPx] = useState<number | null>(null);
  const [vvOffset, setVvOffset] = useState(0);
  const [embedLoad, setEmbedLoad] = useState<EmbeddingLoadState>({
    status: "idle",
    progress: 0,
  });
  /** Visual: ink/text soaking into paper while phase is already `thinking`. */
  const [inkSinking, setInkSinking] = useState(false);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => subscribeEmbeddingLoad(setEmbedLoad), []);

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
      // Don't clobber in-session edits that landed before hydrate finished.
      if (!settingsDirtyRef.current) {
        setSettings(nextSettings);
        settingsRef.current = nextSettings;
        setInputMode(nextSettings.inputMode);
      }
      setMemoryCount(pages.length);
      dbReadyRef.current = true;
      setDbReady(true);
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
    if (inputMode === "type" && !settingsOpen && !helpOpen) {
      typeRef.current?.focus();
    }
  }, [inputMode, settingsOpen, helpOpen]);

  // After sink fade, keep opacity 0 until soak ends so clearing inline styles
  // never fights `.is-sinking { opacity: 1 }` while text remains.
  useEffect(() => {
    if (inkSinking) return;
    const ta = typeRef.current;
    if (!ta) return;
    ta.style.opacity = "";
    ta.style.transform = "";
    ta.style.filter = "";
    ta.style.willChange = "";
  }, [inkSinking]);

  const resizeCanvases = useCallback(() => {
    const wrap = wrapRef.current;
    const ink = inkRef.current;
    const reply = replyRef.current;
    if (!wrap || !ink || !reply) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
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

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
      );
      setVvOffset(overlap);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

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

  const applySettingsPatch = useCallback(
    (patch: Partial<AppSettings>) => {
      settingsDirtyRef.current = true;
      const next = patchSettings(patch);
      // Sync ref immediately so idle auto-submit cannot race on a stale mode.
      settingsRef.current = next;
      setSettings(next);
      if (next.submitMode !== "auto") {
        clearIdle();
      }
      return next;
    },
    [clearIdle]
  );

  const syncEditHistory = useCallback((mode: InputMode) => {
    if (mode === "pen") {
      setEditHistory({
        undo: strokesRef.current.length,
        redo: strokeRedoRef.current.length,
      });
    } else {
      setEditHistory({
        undo: typeUndoRef.current.length,
        redo: typeRedoRef.current.length,
      });
    }
  }, []);

  const resetEditHistory = useCallback(() => {
    strokeRedoRef.current = [];
    typeUndoRef.current = [];
    typeRedoRef.current = [];
    setEditHistory({ undo: 0, redo: 0 });
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
    setPaperErrorAction(null);
    setRecallCite(null);
    setOpenCiteIndex(null);
  }, []);

  const clearDialoguePark = useCallback(() => {
    setDialogueRisePx(null);
    setWritingTopPx(null);
  }, []);

  /** Measure quote+reply ink and park them above a measured writing band. */
  const parkDialogueForWriting = useCallback(() => {
    const wrap = wrapRef.current;
    const reply = replyRef.current;
    if (!wrap || !reply) return false;

    const quoteEl = wrap.querySelector(".read-as-quote") as HTMLElement | null;
    const citeEl = wrap.querySelector(
      "[data-recall-cite]"
    ) as HTMLElement | null;
    const bounds = measureDialogueCssBounds({
      wrap,
      replyCanvas: reply,
      quoteEl,
      citeEl,
    });
    if (!bounds) return false;

    const wrapH = wrap.getBoundingClientRect().height;
    const { risePx, writingTopPx: top } = computeDialoguePark(
      bounds,
      chromeClearanceCss(wrap),
      { wrapHeight: wrapH }
    );
    setDialogueRisePx(risePx);
    setWritingTopPx(top);
    return true;
  }, []);

  const clearReadAs = useCallback(() => {
    readAsTextRef.current = null;
    setReadAsText(null);
    setReadAsTopPx(null);
  }, []);

  const showReadAsQuote = useCallback((transcription: string) => {
    readAsTextRef.current = transcription;
    setReadAsText(transcription);
    // Before reply lands, park near mid-page; reveal nudges it against the reply.
    const wrap = wrapRef.current;
    const h = wrap?.getBoundingClientRect().height ?? window.innerHeight;
    const quoteCssH = Math.min(
      72,
      18 + Math.ceil(transcription.length / 28) * 22
    );
    setReadAsTopPx(Math.max(72, h * 0.5 - quoteCssH - 8) + 20);
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
      const blockHeight = msgLines.length * lineHeight;
      let y = Math.max(padY, (canvas.height - blockHeight) / 2);
      if (y + blockHeight > canvas.height - padY) {
        y = Math.max(padY, canvas.height - padY - blockHeight);
      }

      for (const line of msgLines) {
        ctx.fillText(line, padX, y);
        y += lineHeight;
      }
      ctx.restore();
    },
    [prepareReplyCtx]
  );

  const showPaperError = useCallback(
    (messageKey: MessageKey, action: PaperErrorAction) => {
      writePaperMessage(t(settingsRef.current.locale, messageKey));
      setPaperErrorAction(action);
      setStatusExtra(null);
      setPhaseBoth("error");
    },
    [setPhaseBoth, writePaperMessage]
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
  const revealAnswerLive = useCallback(
    async (
      getText: () => string,
      isDone: () => boolean,
      signal: { cancelled: boolean }
    ) => {
      const reduced = prefersReducedMotion();
      const quoteOf = () => readAsTextRef.current;

      if (reduced) {
        while (!isDone() && !signal.cancelled) {
          await sleep(32);
        }
        if (signal.cancelled) return;
        const text = getText();
        if (!text.trim()) return;
        const prep0 = prepareReplyCtx();
        if (!prep0) return;
        const dpr0 = prep0.dpr;
        const quoteText = quoteOf();
        const quoteCssH = quoteText
          ? Math.min(72, 18 + Math.ceil(quoteText.length / 28) * 22)
          : 0;
        const gapCss = 12;
        const reserveAbove = quoteText ? (quoteCssH + gapCss) * dpr0 : 0;

        await fadeInReplyBlock({
          durationMs: 180,
          signal,
          paint: (alpha) => {
            const prep = prepareReplyCtx();
            if (!prep) return;
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
            if (chars.length > 0 && quoteOf()) {
              setReadAsTopPx(quoteTopCssPx(chars[0].y, dpr, quoteCssH, gapCss));
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.globalAlpha = alpha;
            for (const { ch, x, y } of chars) {
              drawInkChar(ctx, ch, x, y, dpr, 1);
            }
            ctx.restore();
          },
        });
        return;
      }

      let painted = 0;
      /** Anchored start Y; eases up only when content would overflow the bottom. */
      let displayStartY: number | null = null;
      let lastQuoteCssY = -1;

      const layoutAt = (text: string, startY: number) => {
        const prep = prepareReplyCtx();
        if (!prep) return null;
        const { canvas, ctx, dpr, padX, padY, maxWidth, lineHeight } = prep;
        const quoteText = quoteOf();
        const quoteCssH = quoteText
          ? Math.min(72, 18 + Math.ceil(quoteText.length / 28) * 22)
          : 0;
        const gapCss = 12;
        // Top-anchored: never re-center as lines grow (centering jumps ~½ line
        // each wrap — felt like “halfway through a line”).
        const chars = layoutReplyChars(ctx, text, {
          padX,
          padY,
          maxWidth,
          lineHeight,
          canvasHeight: canvas.height,
          align: "top",
          fixedStartY: startY,
        });
        return {
          canvas,
          ctx,
          dpr,
          padY,
          lineHeight,
          chars,
          quoteCssH,
          gapCss,
          canvasHeight: canvas.height,
        };
      };

      const syncQuote = (
        startY: number,
        dpr: number,
        quoteCssH: number,
        gapCss: number
      ) => {
        if (!quoteOf()) return;
        const top = quoteTopCssPx(startY, dpr, quoteCssH, gapCss);
        if (Math.abs(top - lastQuoteCssY) < 0.5) return;
        lastQuoteCssY = top;
        setReadAsTopPx(top);
      };

      const paintPainted = (
        frame: NonNullable<ReturnType<typeof layoutAt>>,
        count: number,
        progressive?: { index: number; progress: number }
      ) => {
        const { canvas, ctx, dpr, chars } = frame;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const upto = progressive ? progressive.index : count;
        for (let j = 0; j < upto && j < chars.length; j++) {
          drawInkChar(ctx, chars[j].ch, chars[j].x, chars[j].y, dpr, 1);
        }
        if (progressive && progressive.index < chars.length) {
          const { ch, x, y } = chars[progressive.index];
          drawInkChar(ctx, ch, x, y, dpr, progressive.progress);
        }
      };

      const pickInitialStartY = () => {
        const prep = prepareReplyCtx();
        if (!prep) return 0;
        const { canvas, dpr, padY, lineHeight } = prep;
        const quoteText = quoteOf();
        const quoteCssH = quoteText
          ? Math.min(72, 18 + Math.ceil(quoteText.length / 28) * 22)
          : 0;
        const gapCss = 12;
        const quoteSpace = quoteText ? (quoteCssH + gapCss) * dpr : 0;
        const usable = canvas.height - padY * 2;
        return Math.max(
          padY + quoteSpace,
          padY + quoteSpace + (usable - quoteSpace - lineHeight) / 2
        );
      };

      const easeScrollForOverflow = (
        frame: NonNullable<ReturnType<typeof layoutAt>>,
        startY: number
      ) => {
        const { chars, padY, lineHeight, canvasHeight } = frame;
        if (chars.length === 0) return startY;
        const bottom = chars[chars.length - 1].y + lineHeight;
        const maxBottom = canvasHeight - padY;
        if (bottom <= maxBottom) return startY;
        return smoothApproach(startY, startY - (bottom - maxBottom), 0.28);
      };

      while (!signal.cancelled) {
        const text = getText();
        if (displayStartY == null) {
          displayStartY = pickInitialStartY();
        }

        let frame = layoutAt(text, displayStartY);
        if (!frame) return;
        displayStartY = easeScrollForOverflow(frame, displayStartY);
        frame = layoutAt(text, displayStartY);
        if (!frame) return;

        const { chars, dpr, quoteCssH, gapCss } = frame;
        if (chars.length > 0) {
          syncQuote(chars[0].y, dpr, quoteCssH, gapCss);
        }

        const overflowSettled =
          chars.length === 0 ||
          chars[chars.length - 1].y + frame.lineHeight <=
            frame.canvasHeight - frame.padY + 0.5;

        if (painted >= chars.length) {
          if (painted > 0) paintPainted(frame, painted);
          if (isDone() && overflowSettled) break;
          await sleep(isDone() ? 16 : 32);
          continue;
        }

        const i = painted;
        for (const progress of [0.35, 0.7, 1] as const) {
          if (signal.cancelled) return;
          const liveProbe = layoutAt(getText(), displayStartY);
          if (liveProbe) {
            displayStartY = easeScrollForOverflow(liveProbe, displayStartY);
          }
          const live = layoutAt(getText(), displayStartY);
          if (!live || live.chars.length === 0) return;
          syncQuote(live.chars[0].y, live.dpr, live.quoteCssH, live.gapCss);
          paintPainted(live, painted, { index: i, progress });
          await sleep(18);
        }
        painted = i + 1;
        await sleep(charRevealDelay(chars[i]?.ch ?? " ", false));
      }
    },
    [prepareReplyCtx]
  );

  const resetToReady = useCallback(() => {
    clearReplyLayer();
    clearDialoguePark();
    recallingRef.current = false;
    setInkSinking(false);
    setStatusExtra(null);
    setAwaitingContinue(false);
    setHasDialogueBackground(false);
    setRecallCite(null);
    setOpenCiteIndex(null);
    setPhaseBoth("ready");
  }, [clearDialoguePark, clearReplyLayer, setPhaseBoth]);

  const runAsk = useCallback(
    async (
      image: string,
      typedSnapshot: string,
      opts?: { gateReveal?: Promise<void> }
    ) => {
      const locale = settingsRef.current.locale;
      const showReadAs = settingsRef.current.showReadAs;
      const animSignal = animSignalRef.current;

      clearReplyLayer();
      clearDialoguePark();
      setHasDialogueBackground(false);
      setReplyRising(false);
      setContinueMotion(false);
      setAwaitingContinue(false);

      const controller = new AbortController();
      abortRef.current = controller;

      let buffered = "";
      liveReplyRef.current = "";
      streamDoneRef.current = false;
      const reveal = { promise: null as Promise<void> | null };
      let revealStarted = false;
      const revealCancel = { cancelled: false };
      let revealGateOpen = !opts?.gateReveal;
      let pendingReadAs: string | null = null;

      const startRevealIfNeeded = () => {
        if (!revealGateOpen || revealStarted || !liveReplyRef.current) return;
        revealStarted = true;
        setPhaseBoth("answering");
        reveal.promise = revealAnswerLive(
          () => liveReplyRef.current,
          () => streamDoneRef.current,
          revealCancel
        );
      };

      const openRevealGate = () => {
        if (revealGateOpen || animSignal.cancelled) return;
        revealGateOpen = true;
        if (
          phaseRef.current === "thinking" &&
          liveReplyRef.current
        ) {
          setPhaseBoth("answering");
        }
        if (showReadAs && pendingReadAs) {
          showReadAsQuote(pendingReadAs);
          pendingReadAs = null;
        }
        startRevealIfNeeded();
      };

      if (!opts?.gateReveal) {
        setPhaseBoth("thinking");
      } else {
        void opts.gateReveal.then(() => {
          openRevealGate();
        });
      }

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
            ...(image ? { image } : {}),
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
              liveReplyRef.current += text;
              startRevealIfNeeded();
            },
            onMeta: (transcription) => {
              if (!showReadAs || !transcription) return;
              if (revealGateOpen) {
                showReadAsQuote(transcription);
              } else {
                pendingReadAs = transcription;
              }
            },
          },
          { signal: controller.signal }
        );

        if (opts?.gateReveal) {
          await opts.gateReveal;
          openRevealGate();
        }

        if (animSignal.cancelled || controller.signal.aborted) {
          revealCancel.cancelled = true;
          if (reveal.promise) await reveal.promise;
          resetToReady();
          return;
        }

        if (freePath) {
          void recordFreeAsk();
        }

        const transcription =
          result.transcription || typedSnapshot || "";
        liveReplyRef.current = result.reply || liveReplyRef.current || buffered;
        const finalReply = liveReplyRef.current;
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
          revealCancel.cancelled = true;
          if (reveal.promise) await reveal.promise;

          const replyCanvas = replyRef.current;
          replyCanvas
            ?.getContext("2d")
            ?.clearRect(0, 0, replyCanvas.width, replyCanvas.height);
          setRecallCite(null);
          setOpenCiteIndex(null);
          setPhaseBoth("recalling");

          const query =
            result.recallQuery ||
            extractRecallNeedle(transcription) ||
            transcription;

          const scored = await hybridRetrieve(query);
          if (animSignal.cancelled) {
            resetToReady();
            return;
          }

          let ordered = scored.map((s) => s.page);
          if (scored.length > 0) {
            try {
              const rank = await rankRecallCandidates({
                query,
                locale,
                candidates: toRankCandidates(scored.map((s) => s.page)),
                ...(byok
                  ? {
                      apiKey: currentSettings.apiKey.trim(),
                      baseUrl: currentSettings.baseUrl.trim() || undefined,
                      model: currentSettings.model.trim() || undefined,
                    }
                  : {}),
              });
              if (animSignal.cancelled) {
                resetToReady();
                return;
              }
              if (rank.rankedIds.length > 0) {
                ordered = orderPagesByRankedIds(
                  rank.rankedIds,
                  scored.map((s) => s.page)
                );
              }
            } catch {
              // Keep hybrid order
            }
          }

          const citePages = pickRecallCitePages(ordered);
          const byokFields = byok
            ? {
                apiKey: currentSettings.apiKey.trim(),
                baseUrl: currentSettings.baseUrl.trim() || undefined,
                model: currentSettings.model.trim() || undefined,
              }
            : {};

          buffered = "";
          liveReplyRef.current = "";
          streamDoneRef.current = false;
          revealStarted = false;
          revealCancel.cancelled = false;
          reveal.promise = null;

          if (citePages.length === 0) {
            setPhaseBoth("thinking");
            const missResult = await askPageStream(
              {
                locale,
                memory,
                typedText: transcription,
                fixedTranscription: transcription,
                recallMode: "miss",
                ...byokFields,
              },
              {
                onDelta: (text) => {
                  buffered += text;
                  liveReplyRef.current += text;
                  startRevealIfNeeded();
                },
              },
              { signal: controller.signal }
            );

            if (animSignal.cancelled || controller.signal.aborted) {
              revealCancel.cancelled = true;
              if (reveal.promise) await reveal.promise;
              resetToReady();
              return;
            }

            liveReplyRef.current =
              missResult.reply || liveReplyRef.current || buffered;
            const missReply = liveReplyRef.current;
            streamDoneRef.current = true;
            if (!revealStarted && missReply.trim()) {
              startRevealIfNeeded();
            }
            if (reveal.promise) {
              await reveal.promise;
            } else if (missReply.trim()) {
              setPhaseBoth("answering");
              await revealAnswerLive(
                () => missReply,
                () => true,
                revealCancel
              );
            }

            if (animSignal.cancelled || revealCancel.cancelled) {
              resetToReady();
              return;
            }

            const pages = appendMemory({
              transcription,
              reply: missReply,
            });
            setMemoryCount(pages.length);
            recallingRef.current = false;
            setAwaitingContinue(true);
            setHasDialogueBackground(false);
            clearDialoguePark();
            setPhaseBoth("ready");
            return;
          }

          setPhaseBoth("thinking");
          const citeResult = await askPageStream(
            {
              locale,
              memory,
              typedText: transcription,
              fixedTranscription: transcription,
              recallMode: "cite",
              recallPages: toRecallCitePayloads(citePages),
              ...byokFields,
            },
            {
              onDelta: (text) => {
                buffered += text;
                liveReplyRef.current += text;
              },
            },
            { signal: controller.signal }
          );

          if (animSignal.cancelled || controller.signal.aborted) {
            resetToReady();
            return;
          }

          const citeReply =
            citeResult.reply || liveReplyRef.current || buffered;
          liveReplyRef.current = citeReply;
          streamDoneRef.current = true;

          setRecallCite({ reply: citeReply, pages: citePages });
          setPhaseBoth("answering");
          await sleep(prefersReducedMotion() ? 0 : 420);

          if (animSignal.cancelled) {
            resetToReady();
            return;
          }

          const pages = appendMemory({
            transcription,
            reply: stripCiteMarkers(citeReply) || citeReply,
          });
          setMemoryCount(pages.length);
          recallingRef.current = false;
          setAwaitingContinue(true);
          setHasDialogueBackground(false);
          clearDialoguePark();
          setPhaseBoth("ready");
          return;
        }

        streamDoneRef.current = true;
        if (!revealStarted && finalReply.trim()) {
          startRevealIfNeeded();
        }
        if (reveal.promise) {
          await reveal.promise;
        } else if (finalReply.trim()) {
          setPhaseBoth("answering");
          await revealAnswerLive(
            () => finalReply,
            () => true,
            revealCancel
          );
        }

        if (animSignal.cancelled || revealCancel.cancelled) {
          resetToReady();
          return;
        }

        const pages = appendMemory({
          transcription,
          reply: finalReply,
        });
        setMemoryCount(pages.length);
        setAwaitingContinue(true);
        setHasDialogueBackground(false);
        clearDialoguePark();
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
        const code =
          err.error ||
          (e instanceof TypeError ? "request_failed" : undefined);
        const resolved = resolvePaperError({ error: code, offline });
        showPaperError(resolved.messageKey as MessageKey, resolved.action);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [
      clearDialoguePark,
      clearReplyLayer,
      resetToReady,
      revealAnswerLive,
      setPhaseBoth,
      showReadAsQuote,
      showPaperError,
    ]
  );

  const commitPage = useCallback(async () => {
    if (awaitingContinue) return;
    if (!dbReadyRef.current) {
      await whenDbReady();
      await hydrateSettings();
      if (!settingsDirtyRef.current) {
        const s = loadSettings();
        settingsRef.current = s;
        setSettings(s);
      }
      dbReadyRef.current = true;
      setDbReady(true);
    }
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
      resetEditHistory();
    }

    const typedSnapshot = typedTextRef.current.trim();
    setPhaseBoth("thinking");
    setInkSinking(true);
    const cached = loadSettings();
    if (!cached.hasCommittedOnce) {
      applySettingsPatch({ hasCommittedOnce: true });
    }
    clearReadAs();
    setStatusExtra(null);
    recallingRef.current = false;

    // Pen mode needs a vision snapshot; type mode sends typedText only — no fake paint.
    const image =
      inputMode === "pen" ? ink.toDataURL("image/png") : "";
    lastCommitRef.current = { image, typedSnapshot };

    const fadePromise = (async () => {
      try {
        if (inputMode === "type") {
          const ta = typeRef.current;
          if (ta) {
            await fadeElementIntoPaper(ta, {
              signal: animSignalRef.current,
              driftPx: Math.max(6, (ink.height / dprRef.current) * 0.02),
            });
          }
          // Flush empty value while opacity is still 0 — otherwise clearing the
          // inline style lets `.is-sinking` snap text back to full opacity for a frame.
          flushSync(() => {
            setTypedText("");
          });
          typedTextRef.current = "";
        } else {
          setTypedText("");
          typedTextRef.current = "";
          await fadeInkIntoPaper(ink, { signal: animSignalRef.current });
        }
        strokesRef.current = [];
        resetEditHistory();
      } finally {
        setInkSinking(false);
      }
    })();

    // Overlap model wait with the soak so a longer fade does not add latency.
    const askPromise = runAsk(image, typedSnapshot, {
      gateReveal: fadePromise,
    });

    await fadePromise;

    if (animSignalRef.current.cancelled) {
      abortRef.current?.abort();
      resetToReady();
      return;
    }

    await askPromise;
  }, [
    awaitingContinue,
    applySettingsPatch,
    clearIdle,
    clearReadAs,
    hasContent,
    inputMode,
    resetEditHistory,
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

  const redrawInkLayer = useCallback(() => {
    const ink = inkRef.current;
    const ctx = getInkCtx();
    if (!ink || !ctx) return;
    redrawAll(ctx, strokesRef.current, ink.width, ink.height, dprRef.current);
  }, []);

  const afterPenEdit = useCallback(() => {
    redrawInkLayer();
    syncEditHistory("pen");
    if (hasPenInk()) {
      setPhaseBoth("writing");
      scheduleIdle();
    } else {
      clearIdle();
      setPhaseBoth("ready");
    }
  }, [
    clearIdle,
    hasPenInk,
    redrawInkLayer,
    scheduleIdle,
    setPhaseBoth,
    syncEditHistory,
  ]);

  const afterTypeEdit = useCallback(
    (value: string) => {
      syncEditHistory("type");
      setStatusExtra(null);
      if (value.trim()) {
        setPhaseBoth("writing");
        scheduleIdle();
      } else {
        clearIdle();
        setPhaseBoth("ready");
      }
    },
    [clearIdle, scheduleIdle, setPhaseBoth, syncEditHistory]
  );

  const canEditNow = () => {
    const p = phaseRef.current;
    return (
      p !== "thinking" &&
      p !== "answering" &&
      p !== "recalling" &&
      p !== "error"
    );
  };

  const undoEdit = useCallback(() => {
    if (!canEditNow()) return;

    if (inputMode === "pen") {
      if (currentRef.current) return;
      const strokes = strokesRef.current;
      if (strokes.length === 0) return;
      const last = strokes[strokes.length - 1];
      strokesRef.current = strokes.slice(0, -1);
      strokeRedoRef.current = [...strokeRedoRef.current, last];
      afterPenEdit();
      return;
    }

    const stack = typeUndoRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    typeUndoRef.current = stack.slice(0, -1);
    typeRedoRef.current = [...typeRedoRef.current, typedTextRef.current];
    applyingTypeHistoryRef.current = true;
    setTypedText(prev);
    typedTextRef.current = prev;
    applyingTypeHistoryRef.current = false;
    afterTypeEdit(prev);
  }, [afterPenEdit, afterTypeEdit, inputMode]);

  const redoEdit = useCallback(() => {
    if (!canEditNow()) return;

    if (inputMode === "pen") {
      if (currentRef.current) return;
      const stack = strokeRedoRef.current;
      if (stack.length === 0) return;
      const next = stack[stack.length - 1];
      strokeRedoRef.current = stack.slice(0, -1);
      strokesRef.current = [...strokesRef.current, next];
      afterPenEdit();
      return;
    }

    const stack = typeRedoRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    typeRedoRef.current = stack.slice(0, -1);
    typeUndoRef.current = [...typeUndoRef.current, typedTextRef.current];
    applyingTypeHistoryRef.current = true;
    setTypedText(next);
    typedTextRef.current = next;
    applyingTypeHistoryRef.current = false;
    afterTypeEdit(next);
  }, [afterPenEdit, afterTypeEdit, inputMode]);

  const handlePaperPointer = useCallback(() => {
    if (openCiteIndex != null) {
      setOpenCiteIndex(null);
      return true;
    }
    return false;
  }, [openCiteIndex]);

  const onPaperErrorAction = useCallback(() => {
    const action = paperErrorAction;
    setPaperErrorAction(null);
    if (action === "open_settings") {
      clearReplyLayer();
      setPhaseBoth("ready");
      if (dbReadyRef.current) setSettingsOpen(true);
      else {
        void whenDbReady().then(() => setSettingsOpen(true));
      }
      return;
    }
    if (action === "retry") {
      void retryLastCommit();
      return;
    }
    clearReplyLayer();
    setPhaseBoth("ready");
  }, [clearReplyLayer, paperErrorAction, retryLastCommit, setPhaseBoth]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (handlePaperPointer()) return;
    if (awaitingContinue) return;
    if (phaseRef.current === "error") return;

    if (inputMode !== "pen") return;
    if (
      phaseRef.current === "thinking" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling"
    ) {
      return;
    }

    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
    };

    const now = performance.now();
    const isDouble =
      lastTapArmedRef.current &&
      now - lastTapAtRef.current < DOUBLE_TAP_MS &&
      (phaseRef.current === "writing" || phaseRef.current === "ready") &&
      hasContent() &&
      !currentRef.current;

    if (isDouble) {
      lastTapAtRef.current = 0;
      lastTapArmedRef.current = false;
      pointerDownRef.current = null;
      clearIdle();
      void commitPage();
      return;
    }

    if (!hasDialogueBackground) {
      clearReplyLayer();
    }
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
    strokesRef.current = [...strokesRef.current, stroke];
    if (strokeRedoRef.current.length > 0) {
      strokeRedoRef.current = [];
      setEditHistory((h) => ({ ...h, redo: 0 }));
    }
    lastTapArmedRef.current = false;

    const ctx = getInkCtx();
    if (ctx) drawStroke(ctx, stroke, dprRef.current);
    setPhaseBoth("writing");
    scheduleIdle();
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

    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    const stroke = currentRef.current;
    currentRef.current = null;
    try {
      inkRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const dist = Math.hypot(dx, dy);
      const dur = performance.now() - down.t;
      const pointCount = stroke?.points.length ?? 0;
      const isStationaryTap =
        dist <= DOUBLE_TAP_MAX_MOVE_CSS &&
        dur <= DOUBLE_TAP_MAX_DURATION_MS &&
        pointCount <= 3;
      if (isStationaryTap) {
        lastTapAtRef.current = performance.now();
        lastTapArmedRef.current = true;
      } else {
        lastTapArmedRef.current = false;
      }
    }

    if (
      phaseRef.current === "thinking" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling" ||
      phaseRef.current === "error"
    ) {
      return;
    }
    if (hasContent()) {
      setPhaseBoth("writing");
      scheduleIdle();
    } else {
      setPhaseBoth("ready");
    }
    syncEditHistory("pen");
  };

  const onTypedChange = (value: string) => {
    if (awaitingContinue) return;
    if (phaseRef.current === "error") return;
    if (
      phaseRef.current === "thinking" ||
      phaseRef.current === "answering" ||
      phaseRef.current === "recalling"
    ) {
      return;
    }
    if (!hasDialogueBackground) {
      clearReplyLayer();
    }
    clearReadAs();

    if (!applyingTypeHistoryRef.current) {
      const prev = typedTextRef.current;
      if (value !== prev) {
        typeUndoRef.current = [...typeUndoRef.current, prev].slice(-80);
        typeRedoRef.current = [];
      }
    }

    setTypedText(value);
    typedTextRef.current = value;
    afterTypeEdit(value);
  };

  const onTypeKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (awaitingContinue) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
      const isRedo =
        e.key === "y" ||
        e.key === "Y" ||
        ((e.key === "z" || e.key === "Z") && e.shiftKey);
      e.preventDefault();
      if (isRedo) redoEdit();
      else undoEdit();
      return;
    }

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
      phaseRef.current === "thinking" ||
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
      typeUndoRef.current = [];
      typeRedoRef.current = [];
    } else {
      strokesRef.current = [];
      currentRef.current = null;
      const ink = inkRef.current;
      ink?.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
      strokeRedoRef.current = [];
    }
    setEditHistory({ undo: 0, redo: 0 });

    setInputMode(mode);
    applySettingsPatch({ inputMode: mode });

    const stillWriting =
      mode === "pen"
        ? strokesRef.current.some((s) => !s.erase && s.points.length > 0)
        : typedTextRef.current.trim().length > 0;
    setPhaseBoth(stillWriting ? "writing" : "ready");
  };

  const clearInputOnly = useCallback(() => {
    clearIdle();
    animSignalRef.current.cancelled = true;
    animSignalRef.current = { cancelled: true };
    abortRef.current?.abort();
    abortRef.current = null;
    recallingRef.current = false;
    strokesRef.current = [];
    currentRef.current = null;
    resetEditHistory();
    setTypedText("");
    typedTextRef.current = "";
    clearReadAs();
    const ink = inkRef.current;
    ink?.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
    setStatusExtra(null);
    setPhaseBoth("ready");
  }, [clearIdle, clearReadAs, resetEditHistory, setPhaseBoth]);

  const newChapter = useCallback(() => {
    clearInputOnly();
    clearReplyLayer();
    clearDialoguePark();
    setHasDialogueBackground(false);
    setAwaitingContinue(false);
    setRecallCite(null);
    setOpenCiteIndex(null);
    beginNewChapterSession();
  }, [clearDialoguePark, clearInputOnly, clearReplyLayer]);

  const continueWriting = useCallback(() => {
    parkDialogueForWriting();
    setContinueMotion(true);
    setReplyRising(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReplyRising(true);
        window.setTimeout(() => {
          setReplyRising(false);
          setContinueMotion(false);
          setAwaitingContinue(false);
          setHasDialogueBackground(true);
        }, 560);
      });
    });
  }, [parkDialogueForWriting]);

  const reliveMemoryPage = useCallback(
    async (page: MemoryPage) => {
      setHistoryOpen(false);
      clearReadAs();
      setRecallCite(null);
      setOpenCiteIndex(null);
      setPhaseBoth("recalling");
      clearReplyLayer();
      await animateRecallPage(page, animSignalRef.current);
      recallingRef.current = false;
      setHasDialogueBackground(true);
      setAwaitingContinue(false);
      requestAnimationFrame(() => {
        parkDialogueForWriting();
      });
      setPhaseBoth("ready");
    },
    [
      animateRecallPage,
      clearReadAs,
      clearReplyLayer,
      parkDialogueForWriting,
      setPhaseBoth,
    ]
  );

  const onExport = () => {
    const wrap = wrapRef.current;
    const ink = inkRef.current;
    const reply = replyRef.current;
    if (!wrap || !ink || !reply) return;
    void exportPaperPng({ wrap, ink, reply });
  };

  const busy =
    phase === "thinking" ||
    phase === "answering" ||
    phase === "recalling";

  const inputLocked = busy || phase === "error";

  const showSessionDock =
    !busy &&
    (awaitingContinue || hasDialogueBackground || recallCite != null);

  const hasInputForDock = typedText.trim().length > 0 || phase === "writing";
  const clearChapterKind = (() => {
    if (!showSessionDock) return null;
    if (hasInputForDock) return "clear" as const;
    if (hasDialogueBackground || awaitingContinue) return "chapter" as const;
    return null;
  })();

  const onPaperDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (
      inputLocked ||
      settingsOpen ||
      helpOpen ||
      historyOpen ||
      awaitingContinue
    )
      return;
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
      if (settingsOpen || helpOpen || historyOpen) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
        if (phaseRef.current !== "ready" && phaseRef.current !== "writing") {
          return;
        }
        // Textarea handles undo/redo in onTypeKeyDown.
        const el = e.target as HTMLElement | null;
        if (el?.tagName === "TEXTAREA") return;
        if (el?.tagName === "INPUT" || el?.tagName === "SELECT") return;

        const redo =
          e.key === "y" ||
          e.key === "Y" ||
          ((e.key === "z" || e.key === "Z") && e.shiftKey);
        e.preventDefault();
        if (redo) redoEdit();
        else undoEdit();
        return;
      }

      if (e.key !== "Enter" || e.shiftKey) return;
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
    helpOpen,
    historyOpen,
    inputMode,
    redoEdit,
    settingsOpen,
    undoEdit,
  ]);


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

  const dockHints = collectDockHints({
    locale: settings.locale,
    phase,
    statusExtra,
    embedLoading: embedLoad.status === "loading",
    embedProgress: embedLoad.progress,
    hasCommittedOnce: settings.hasCommittedOnce,
    submitMode: settings.submitMode,
    inputMode,
    contentPresent,
    idleArmed,
    manualSubmitHint,
  });

  const ringProgress = showIdleRing && idleArmed ? idleProgress : 0;

  const paper = getPaperStyle(settings.paperStyle);

  return (
    <div
      ref={wrapRef}
      className={`paper-page phase-${phase}`}
      data-phase={phase}
      data-paper={settings.paperStyle}
      data-paper-kind={paper.kind}
      onDoubleClick={onPaperDoubleClick}
      onClick={(e) => {
        if (openCiteIndex == null) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-recall-cite], .recall-note, button, a")) {
          return;
        }
        setOpenCiteIndex(null);
      }}
      style={
        paper.step
          ? ({ ["--paper-step" as string]: paper.step } as CSSProperties)
          : undefined
      }
    >
      <div className="paper-pattern" aria-hidden />

      <div
        className={[
          "reply-stage",
          continueMotion ? "is-continue-motion" : "",
          replyRising ? "is-rising" : "",
          hasDialogueBackground && !awaitingContinue ? "is-background" : "",
          awaitingContinue ? "is-awaiting-continue" : "",
          recallCite ? "has-recall-cite" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          dialogueRisePx != null
            ? ({
                ["--dialogue-rise" as string]: `${dialogueRisePx}px`,
              } as CSSProperties)
            : undefined
        }
      >
        {recallCite ? (
          <div className="recall-cite-stack" data-recall-cite>
            {readAsText ? (
              <blockquote className="read-as-quote is-stacked">
                {readAsText}
              </blockquote>
            ) : null}
            <RecallCiteLayer
              reply={recallCite.reply}
              pages={recallCite.pages}
              locale={settings.locale}
              openIndex={openCiteIndex}
              onOpen={setOpenCiteIndex}
              onClose={() => setOpenCiteIndex(null)}
            />
          </div>
        ) : readAsText ? (
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
        />
      </div>


      {phase === "error" && paperErrorAction ? (
        <button
          type="button"
          className="paper-error-action text-action"
          onClick={onPaperErrorAction}
        >
          {t(
            settings.locale,
            paperErrorAction === "open_settings"
              ? "actionOpenSettings"
              : paperErrorAction === "retry"
                ? "actionRetry"
                : "actionDismiss"
          )}
        </button>
      ) : null}

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
        className={`type-layer ${inputMode === "type" ? "is-active" : ""}${inkSinking && inputMode === "type" ? " is-sinking" : ""}`}
        value={typedText}
        onChange={(e) => onTypedChange(e.target.value)}
        onKeyDown={onTypeKeyDown}
        disabled={
          inputLocked ||
          inputMode !== "type" ||
          awaitingContinue
        }
        spellCheck={false}
        aria-label={t(settings.locale, "modeType")}
        aria-hidden={inputMode !== "type"}
        style={{
          ...(writingTopPx != null ? { top: writingTopPx } : {}),
          ...(awaitingContinue || (recallCite && !hasDialogueBackground)
            ? { pointerEvents: "none" as const }
            : {}),
        }}
      />

      <header className="paper-chrome">
        <BrandMark locale={settings.locale} />
        <nav
          className="paper-actions"
          aria-label={t(settings.locale, "settings")}
        >
          {editHistory.undo > 0 || editHistory.redo > 0 ? (
            <div className="edit-history" role="group" aria-label={`${t(settings.locale, "undo")} / ${t(settings.locale, "redo")}`}>
              <button
                type="button"
                className="ink-link ink-icon-btn"
                onClick={undoEdit}
                aria-label={t(settings.locale, "undo")}
                title={t(settings.locale, "undo")}
                disabled={inputLocked || editHistory.undo === 0}
              >
                <Undo size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="ink-link ink-icon-btn"
                onClick={redoEdit}
                aria-label={t(settings.locale, "redo")}
                title={t(settings.locale, "redo")}
                disabled={inputLocked || editHistory.redo === 0}
              >
                <Redo size={16} aria-hidden />
              </button>
            </div>
          ) : null}
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
              disabled={inputLocked}
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
              disabled={inputLocked}
            >
              <Text size={15} aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={() => {
              if (!dbReady) return;
              setHistoryOpen(true);
            }}
            disabled={!dbReady}
            aria-disabled={!dbReady}
            aria-label={t(settings.locale, "history")}
            title={t(settings.locale, "history")}
          >
            <BookOpen size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={() => setHelpOpen(true)}
            aria-label={t(settings.locale, "help")}
            title={t(settings.locale, "help")}
          >
            <HelpCircle size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="ink-link ink-icon-btn"
            onClick={() => {
              if (!dbReady) return;
              setSettingsOpen(true);
            }}
            disabled={!dbReady}
            aria-disabled={!dbReady}
            aria-label={t(settings.locale, "settings")}
            title={t(settings.locale, "settings")}
          >
            <Setting size={16} aria-hidden />
          </button>
        </nav>
      </header>

      <div
        className="status-dock submit-dock"
        style={
          vvOffset > 0
            ? ({
                paddingBottom: `calc(1.1rem + env(safe-area-inset-bottom, 0px) + ${vvOffset}px)`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="submit-dock-main">
          <DockHints
            hints={dockHints}
            showIdleRing={showIdleRing}
            idleRingProgress={ringProgress}
          />
        </div>
        <div
          className={`submit-dock-tools ${showSessionDock ? "is-visible" : ""}`}
          aria-hidden={!showSessionDock}
        >
          {awaitingContinue ? (
            <button
              type="button"
              className="ink-link"
              onClick={continueWriting}
              tabIndex={showSessionDock ? 0 : -1}
            >
              {t(settings.locale, "continueWriting")}
            </button>
          ) : null}
          {clearChapterKind === "clear" ? (
            <button
              type="button"
              className="ink-link"
              onClick={clearInputOnly}
              tabIndex={showSessionDock ? 0 : -1}
            >
              {t(settings.locale, "clearPage")}
            </button>
          ) : null}
          {clearChapterKind === "chapter" ? (
            <button
              type="button"
              className="ink-link"
              onClick={newChapter}
              tabIndex={showSessionDock ? 0 : -1}
            >
              {t(settings.locale, "newChapter")}
            </button>
          ) : null}
          {showSessionDock ? (
            <button
              type="button"
              className="ink-link ink-icon-btn"
              onClick={onExport}
              aria-label={t(settings.locale, "exportPage")}
              title={t(settings.locale, "exportPage")}
              tabIndex={showSessionDock ? 0 : -1}
            >
              <Export size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onPatch={(patch) => {
          if (!dbReadyRef.current) return;
          applySettingsPatch(patch);
        }}
        onClearMemory={() => {
          if (!dbReadyRef.current) return;
          clearMemory();
          setMemoryCount(0);
        }}
      />

      <HelpPanel
        open={helpOpen}
        locale={settings.locale}
        onClose={() => setHelpOpen(false)}
      />

      <HistoryPanel
        open={historyOpen}
        locale={settings.locale}
        onClose={() => setHistoryOpen(false)}
        onMemoryChange={setMemoryCount}
        onRelive={(page) => void reliveMemoryPage(page)}
      />
    </div>
  );
}
