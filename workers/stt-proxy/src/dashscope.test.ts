import { describe, expect, it } from "vitest";
import {
  buildFinishTask,
  buildRunTask,
  extractResultGenerated,
  parseClientControl,
  parseUpstreamEvent,
} from "./dashscope";

const resultGenerated = {
  header: {
    task_id: "2bf83b9a-baeb-4fda-8d9a-xxxxxxxxxxxx",
    event: "result-generated",
    attributes: {},
  },
  payload: {
    output: {
      sentence: {
        begin_time: 170,
        end_time: 920,
        text: "今天天气不错。",
        heartbeat: false,
        sentence_end: true,
        words: [{ text: "今天", punctuation: "" }],
      },
    },
    usage: { duration: 1 },
  },
};

describe("dashscope helpers", () => {
  it("builds run-task and finish-task for the same task id", () => {
    const run = buildRunTask("task-1");
    expect(run.header).toEqual({
      action: "run-task",
      task_id: "task-1",
      streaming: "duplex",
    });
    expect(run.payload.model).toBe("paraformer-realtime-v2");
    expect(run.payload.parameters).toMatchObject({
      format: "pcm",
      sample_rate: 16000,
      disfluency_removal_enabled: true,
      language_hints: ["zh"],
      heartbeat: true,
    });
    expect(buildFinishTask("task-1")).toEqual({
      header: {
        action: "finish-task",
        task_id: "task-1",
        streaming: "duplex",
      },
      payload: { input: {} },
    });
  });

  it("reads payload.output.sentence.text and sentence_end", () => {
    expect(extractResultGenerated(resultGenerated)).toEqual({
      type: "result",
      text: "今天天气不错。",
      isFinal: true,
    });
    const partial = structuredClone(resultGenerated);
    partial.payload.output.sentence.sentence_end = false;
    partial.payload.output.sentence.text = "今天";
    expect(extractResultGenerated(partial)).toEqual({
      type: "result",
      text: "今天",
      isFinal: false,
    });
  });

  it("skips heartbeat packets and ignores unknown events", () => {
    const beat = structuredClone(resultGenerated);
    beat.payload.output.sentence.heartbeat = true;
    expect(extractResultGenerated(beat)).toBe("heartbeat");
    expect(parseUpstreamEvent(JSON.stringify(beat))).toEqual({ type: "ignore" });
    expect(parseUpstreamEvent(JSON.stringify(resultGenerated))).toEqual({
      type: "result",
      message: { type: "result", text: "今天天气不错。", isFinal: true },
    });
    expect(
      parseUpstreamEvent(
        JSON.stringify({ header: { event: "task-started" } })
      )
    ).toEqual({ type: "task-started" });
    expect(
      parseUpstreamEvent(
        JSON.stringify({
          header: { event: "task-failed", error_message: "bad audio" },
        })
      )
    ).toEqual({ type: "task-failed", message: "bad audio" });
    expect(parseUpstreamEvent("not-json")).toEqual({ type: "ignore" });
  });

  it("accepts client finish control frames", () => {
    expect(parseClientControl(JSON.stringify({ type: "finish" }))).toBe(
      "finish"
    );
    expect(parseClientControl(JSON.stringify({ type: "other" }))).toBeNull();
    expect(parseClientControl("nope")).toBeNull();
  });
});
